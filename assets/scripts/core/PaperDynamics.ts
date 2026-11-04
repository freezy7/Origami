import {FreePaper} from './FreePaper';
import {meshFromPanels} from './PaperMesh';
import {WebPaperWorker} from '../WebPaperWorker';
import {LabFrame} from '../PaperLabView';
import {PHYSICAL_PROFILE} from './PaperMaterial';
import {formingSupports} from './PaperForming';
export {PHYSICAL_PROFILE} from './PaperMaterial';
export type PhysicalCheck={ready:boolean;reasons:string[];strain:number;intersections:number;penetration:number;speed:number;shapeError:number};
export class PaperDynamics {
  private runtime=new WebPaperWorker();
  frame!:LabFrame;
  offset=.2;
  snapshot='';
  busy=false;
  private audit:LabFrame['audit'];
  private auditClock=0;
  private saveClock=0;
  private stable=0;
  private forming:FreePaper|null=null;
  private finalAngles:number[]=[];
  private materialUV:[number,number][]=[];
  private goal:number[]=[];
  private stage=0;
  private stageTime=0;
  private pendingMove:{id:number;target:number[]}|null=null;
  get isForming():boolean{return !!this.forming;}
  get progress():number{return this.forming?this.stage/Math.max(1,this.finalAngles.length):1;}
  async open(model:FreePaper,state?:string):Promise<LabFrame>{
    const mesh=meshFromPanels(model.panels);
    this.materialUV=mesh.points.map(q=>[...q.uv] as [number,number]);
    this.goal=mesh.points.reduce<number[]>((ps,q)=>ps.concat([q.p[0],q.p[1],q.p[2]-mesh.offset+this.offset]),[]);
    if(state){this.frame=await this.runtime.call({op:'load',state});this.snapshot=state;}
    else{
      const text=['PAPER_MESH 1',`${mesh.points.length} ${mesh.triangles.length}`,...mesh.points.map(q=>[...q.uv,...q.uv,this.offset].join(' ')),...mesh.triangles.map(f=>f.join(' '))].join('\n');
      this.frame=await this.runtime.call({op:'mesh',state:text,dt:0});
      let id=-1;
      for(const [u,v] of formingSupports(model,mesh.points))this.frame=await this.runtime.call({op:'grip',id:id--,u,v,target:[u,v,this.offset],pin:true});
      if(model.records.length){this.forming=new FreePaper();this.forming.load(model.save());this.finalAngles=model.records.map(t=>t.angle);}
    }
    this.audit=(await this.runtime.call({op:'audit'})).audit;
    return this.frame;
  }
  async advance(dt:number):Promise<LabFrame>{
    if(this.busy)return this.frame;this.busy=true;
    try{
      const elapsed=Math.min(dt,1/120);
      if(this.pendingMove){const q=this.pendingMove;this.pendingMove=null;await this.runtime.call({op:'move',...q});}
      if(this.forming){
        while(this.stage<this.finalAngles.length && Math.abs(this.finalAngles[this.stage])<.01)this.stage++;
        if(this.stage>=this.finalAngles.length){await this.runtime.call({op:'free'});this.forming=null;}
        else{
          this.stageTime+=elapsed;
          const t=Math.min(1,this.stageTime/PHYSICAL_PROFILE.rampSeconds),ease=t*t*(3-2*t);
          this.forming.setAngles(this.finalAngles.map((a,i)=>i<this.stage?a:i===this.stage?a*ease:0));
          const positions=this.materialUV.map(uv=>{const p=this.forming!.pointAt(uv)!.point.p;return[p[0],p[1],p[2]+this.offset].join(' ');});
          await this.runtime.call({op:'form',state:['PAPER_TARGETS 1',String(positions.length),...positions].join('\n'),press:true});
          if(this.stageTime>=PHYSICAL_PROFILE.rampSeconds+PHYSICAL_PROFILE.holdSeconds){this.stageTime=0;this.stage++;}
        }
      }
      this.frame=await this.runtime.call({op:'advance',dt:elapsed});
      this.auditClock+=elapsed;this.saveClock+=elapsed;
      if(this.auditClock>=.25){this.audit=(await this.runtime.call({op:'audit'})).audit;this.auditClock=0;}
      if(this.saveClock>=.5){this.snapshot=(await this.runtime.call({op:'snapshot'})).state!;this.saveClock=0;}
      this.stable=this.check().reasons.length?0:this.stable+1;
      return this.frame;
    }finally{this.busy=false;}
  }
  async grip(id:number,u:number,v:number,target:number[]):Promise<void>{await this.runtime.call({op:'grip',id,u,v,target});this.stable=0;}
  move(id:number,target:number[]):void{this.pendingMove={id,target};this.stable=0;}
  async release(id:number):Promise<void>{if(this.pendingMove){const q=this.pendingMove;this.pendingMove=null;await this.runtime.call({op:'move',...q});}await this.runtime.call({op:'release',id});this.stable=0;}
  async save():Promise<string>{this.snapshot=(await this.runtime.call({op:'snapshot'})).state!;return this.snapshot;}
  async auditNow():Promise<LabFrame>{this.frame=await this.runtime.call({op:'audit'});this.audit=this.frame.audit;return this.frame;}
  async pause():Promise<void>{this.snapshot=(await this.runtime.call({op:'pause'})).state!;}
  close():void{this.runtime.close();}
  check():PhysicalCheck{
    const s=this.frame.stats,a=this.audit,reasons:string[]=[];
    let error=0;
    if(this.goal.length===this.frame.positions.length){for(let i=0;i<this.goal.length;i++)error+=(this.goal[i]-this.frame.positions[i])**2;error=Math.sqrt(error/(this.goal.length/3));}
    if(![s.strainMax,s.maxSpeed,s.backlog,a?.intersections,a?.penetration,error].every(Number.isFinite)||this.goal.length!==this.frame.positions.length)reasons.push('材料检查数据无效');
    if(this.forming)reasons.push('正在从白纸逐步成形');
    // A stationary, collision-free sheet can still have failed to form the
    // requested airplane. Do not let the flight gate mistake that for success.
    if(error>PHYSICAL_PROFILE.maxFormingError)reasons.push('成形偏差超过 10 mm，暂不能试飞');
    if(!a?.checked)reasons.push('接触审计未完成');
    if((a?.intersections??1)>0)reasons.push('纸面仍有相交');
    if((a?.penetration??1)>PHYSICAL_PROFILE.thickness*.2)reasons.push('层间厚度不足');
    if(s.strainMax>.02)reasons.push('拉伸超过 2%');
    if((s.maxSpeed??Infinity)>.05)reasons.push('纸面尚未静止');
    if(s.backlog>.1)reasons.push('求解器积压');
    return{ready:!reasons.length&&this.stable>=12,reasons,strain:s.strainMax,intersections:a?.intersections??-1,penetration:a?.penetration??-1,speed:s.maxSpeed??Infinity,shapeError:error};
  }
}
