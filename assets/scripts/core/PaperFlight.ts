import {V3,add,sub,mul,dot,cross,norm,unit} from './FreePaper';
export type Q4=[number,number,number,number];
export type FlightMesh={positions:number[];uv:number[];triangles:number[]};
export type FlightProof={intersections:number;penetration:number;strain:number;stable:boolean};
export const FLIGHT_STANDARD=Object.freeze({id:'indoor-30m-flatplate-v1',length:30,width:12,height:6,launchY:1,launchHeight:1.5,speed:6,throwDegrees:8,pitchDegrees:12,airDensity:1.225,gravity:9.81,grammage:.08,thickness:.00015,skinFriction:.01,layerGap:.002,dt:1/480,timeLimit:20});
export type FlightState={time:number;p:V3;v:V3;q:Q4;momentum:V3};
export type FlightOutcome='flying'|'landed'|'wall'|'ceiling'|'time-limit'|'numerical-failure';
export type FlightSample={t:number;p:V3;q:Q4};
export type FlightResult={standard:string;outcome:FlightOutcome;distance:number;forward:number;airtime:number;peakHeight:number;mass:number;exposedArea:number;samples:FlightSample[]};
type Patch={r:V3;n:V3;area:number;plus:number;minus:number};
const qmul=(a:Q4,b:Q4):Q4=>[
 a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const qnorm=(q:Q4):Q4=>{const n=Math.hypot(...q);return q.map(v=>v/n) as Q4;};
export const flightRotate=(v:V3,q:Q4):V3=>{
 const u:V3=[q[0],q[1],q[2]];return add(v,add(mul(cross(u,v),2*q[3]),mul(cross(u,cross(u,v)),2)));
};
const inverseRotate=(v:V3,q:Q4):V3=>flightRotate(v,[-q[0],-q[1],-q[2],q[3]]);
const matVec=(m:number[],v:V3):V3=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
function inverse(m:number[]):number[]{
 const [a,b,c,d,e,f,g,h,i]=m,A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,det=a*A+b*B+c*C;
 if(!(det>1e-28) || !Number.isFinite(det))throw Error('纸形惯量退化，不能试飞');
 return[A,c*h-b*i,b*f-c*e,B,a*i-c*g,c*d-a*f,C,b*g-a*h,a*e-b*d].map(v=>v/det);
}
function rayTriangle(p:V3,d:V3,a:V3,b:V3,c:V3,max:number):boolean{
 const e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);
 if(Math.abs(det)<1e-13)return false;
 const s=sub(p,a),u=dot(s,h)/det;if(u<0||u>1)return false;
 const q=cross(s,e1),v=dot(d,q)/det;if(v<0||u+v>1)return false;
 const t=dot(e2,q)/det;return t>1e-6 && t<max;
}
/** Dissipative two-sided flat-plate estimate; coefficients are uncalibrated. */
export function plateForce(n:V3,velocity:V3,area:number,plus=1,minus=1,density=FLIGHT_STANDARD.airDensity):V3{
 const speed=norm(velocity);if(speed<1e-8)return[0,0,0];
 const normalSpeed=dot(velocity,n),exposure=normalSpeed<0?minus:plus;
 const pressure=mul(n,-density*area*speed*normalSpeed*exposure);
 const friction=mul(velocity,-.5*density*speed*area*FLIGHT_STANDARD.skinFriction*(plus+minus));
 return add(pressure,friction);
}
export class PaperFlight {
 readonly vertices:V3[]=[];
 readonly triangles:number[][]=[];
 readonly mass:number;
 readonly patches:Patch[]=[];
 readonly inertia:number[];
 private inverseInertia:number[];
 private state:FlightState;
 private initial:V3;
 private outcome:FlightOutcome='flying';
 private samples:FlightSample[]=[];
 private peak=0;
 private accumulated=0;
 private nextSample=0;
 private touch:V3|null=null;
 private initialEnergy=0;
 constructor(mesh:FlightMesh,proof:FlightProof,private atmosphere=true){
  if(![proof.intersections,proof.penetration,proof.strain].every(Number.isFinite)||proof.penetration<0||proof.strain<0||!proof.stable||proof.intersections!==0||proof.penetration>FLIGHT_STANDARD.thickness*.2||proof.strain>.02)
    throw Error('纸形未通过接触、厚度与形变检查，不能试飞');
  if(mesh.triangles.length/3>800)throw Error('当前纸形超出本轮 800 三角形试飞预算');
  if(mesh.positions.length%3 || mesh.uv.length/2!==mesh.positions.length/3 || mesh.triangles.length%3 || !mesh.positions.every(Number.isFinite))throw Error('飞行网格无效');
  const world:V3[]=[];
  // Paper top (+material Y) is the nose. Align a settled wing plane with the
  // horizontal launch frame: original X is vertical, original Z is lateral.
  for(let i=0;i<mesh.positions.length;i+=3)world.push([-mesh.positions[i+2],mesh.positions[i+1],mesh.positions[i]]);
  let mass=0,center:V3=[0,0,0];const masses:number[]=[];
  for(let i=0;i<mesh.triangles.length;i+=3){
   const ids=mesh.triangles.slice(i,i+3);
   if(ids.some(id=>!Number.isInteger(id)||id<0||id>=world.length))throw Error('飞行三角形索引无效');
   const uv=ids.map(id=>[mesh.uv[id*2],mesh.uv[id*2+1]]);
   const area=((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-(uv[1][1]-uv[0][1])*(uv[2][0]-uv[0][0]))/2;
   if(!(area>1e-12))throw Error('材料三角形退化');
   const m=area*FLIGHT_STANDARD.grammage;
   const c=mul(add(add(world[ids[0]],world[ids[1]]),world[ids[2]]),1/3);
   center=add(center,mul(c,m));mass+=m;masses.push(m);this.triangles.push(ids);
  }
  if(!(mass>1e-6 && mass<.1))throw Error('纸形质量超出本轮试飞范围');
  center=mul(center,1/mass);this.mass=mass;world.forEach(p=>this.vertices.push(sub(p,center)));
  const covariance=new Array(9).fill(0);
  this.triangles.forEach((ids,ti)=>{
   const vs=ids.map(id=>this.vertices[id]),sum=add(add(vs[0],vs[1]),vs[2]);
   for(let a=0;a<3;a++)for(let b=0;b<3;b++)covariance[a*3+b]+=masses[ti]/12*(vs.reduce((s,v)=>s+v[a]*v[b],0)+sum[a]*sum[b]);
   const n=cross(sub(vs[1],vs[0]),sub(vs[2],vs[0])),area=norm(n)/2;
   if(area<1e-12)throw Error('空间纸面退化');
   this.patches.push({r:mul(sum,1/3),n:unit(n),area,plus:0,minus:0});
  });
  const trace=covariance[0]+covariance[4]+covariance[8];
  this.inertia=covariance.map((v,i)=>(i%4===0?trace:0)-v);this.inverseInertia=inverse(this.inertia);
  // Local laminate shielding is computed once for the rigid settled shape.
  this.patches.forEach((patch,i)=>{
   const ids=this.triangles[i],vs=ids.map(id=>this.vertices[id]);
   for(const weights of [[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){
    const p=add(add(mul(vs[0],weights[0]),mul(vs[1],weights[1])),mul(vs[2],weights[2]));
    for(const side of [-1,1]){
     const d=mul(patch.n,side),origin=add(p,mul(d,1e-6));
     const hidden=this.triangles.some((f,j)=>j!==i&&rayTriangle(origin,d,this.vertices[f[0]],this.vertices[f[1]],this.vertices[f[2]],FLIGHT_STANDARD.layerGap));
     if(!hidden){if(side>0)patch.plus+=1/3;else patch.minus+=1/3;}
    }
   }
  });
  const pitch=FLIGHT_STANDARD.pitchDegrees*Math.PI/180,throwAngle=FLIGHT_STANDARD.throwDegrees*Math.PI/180;
  this.initial=[0,FLIGHT_STANDARD.launchY,FLIGHT_STANDARD.launchHeight];
  this.state={time:0,p:[...this.initial],v:[0,FLIGHT_STANDARD.speed*Math.cos(throwAngle),FLIGHT_STANDARD.speed*Math.sin(throwAngle)],q:[Math.sin(pitch/2),0,0,Math.cos(pitch/2)],momentum:[0,0,0]};
  this.initialEnergy=.5*this.mass*dot(this.state.v,this.state.v)+this.mass*FLIGHT_STANDARD.gravity*this.state.p[2];
  this.record();
 }
 get done():boolean{return this.outcome!=='flying';}
 get current():FlightState{return this.state;}
 posedVertices():V3[]{return this.vertices.map(v=>add(this.state.p,flightRotate(v,this.state.q)));}
 private omega():V3{return flightRotate(matVec(this.inverseInertia,inverseRotate(this.state.momentum,this.state.q)),this.state.q);}
 private record():void{this.samples.push({t:this.state.time,p:[...this.state.p],q:[...this.state.q]});this.peak=Math.max(this.peak,...this.posedVertices().map(p=>p[2]));}
 advance(elapsed:number):void{
  if(this.done)return;
  if(!Number.isFinite(elapsed)||elapsed<0)throw Error("飞行时间步无效");
  this.accumulated+=Math.min(Math.max(0,elapsed),.1);
  let steps=0;
  while(!this.done && steps<128){
    const h=Math.min(FLIGHT_STANDARD.dt,.025/Math.max(1e-8,norm(this.omega())));
    if(this.accumulated+1e-12<h)break;
    this.step(h);this.accumulated-=h;steps++;
  }
 }
 private step(h:number):void{
  const old={...this.state,p:[...this.state.p] as V3,q:[...this.state.q] as Q4},omega=this.omega();
  let force:V3=[0,0,-this.mass*FLIGHT_STANDARD.gravity],torque:V3=[0,0,0];
  if(this.atmosphere)for(const patch of this.patches){
   const r=flightRotate(patch.r,this.state.q),n=flightRotate(patch.n,this.state.q),v=add(this.state.v,cross(omega,r));
   const f=plateForce(n,v,patch.area,patch.plus,patch.minus);force=add(force,f);torque=add(torque,cross(r,f));
  }
  this.state.v=add(this.state.v,mul(force,h/this.mass));this.state.p=add(this.state.p,mul(this.state.v,h));
  this.state.momentum=add(this.state.momentum,mul(torque,h));
  const w=this.omega(),dq=qmul([w[0],w[1],w[2],0],this.state.q);
  this.state.q=qnorm(this.state.q.map((v,i)=>v+.5*h*dq[i]) as Q4);this.state.time+=h;
  const energy=.5*this.mass*dot(this.state.v,this.state.v)+.5*dot(this.state.momentum,this.omega())+this.mass*FLIGHT_STANDARD.gravity*this.state.p[2];
  if(energy>this.initialEnergy*1.05+1e-8 || ![...this.state.p,...this.state.v,...this.state.q,...this.state.momentum].every(Number.isFinite)||norm(this.state.v)>100||norm(w)>2000){this.outcome='numerical-failure';this.state=old;this.record();return;}
  const vertices=this.posedVertices();
  const below=vertices.map((p,i)=>({p,i})).filter(q=>q.p[2]<=0);
  if(below.length){
   const nextP=this.state.p,nextQ=this.state.q;
   const at=(f:number)=>{
    const p=add(old.p,mul(sub(nextP,old.p),f)),q=qnorm(old.q.map((v,i)=>v+(nextQ[i]-v)*f) as Q4);
    return{p,q,vertices:this.vertices.map(v=>add(p,flightRotate(v,q)))};
   };
   let low=0,high=1;
   for(let i=0;i<24;i++){const mid=(low+high)/2;if(at(mid).vertices.some(p=>p[2]<=0))high=mid;else low=mid;}
   const contact=at(high);this.state.p=contact.p;this.state.q=contact.q;this.state.time=old.time+h*high;
   let index=0;contact.vertices.forEach((p,i)=>{if(p[2]<contact.vertices[index][2])index=i;});
   const p=this.posedVertices()[index];this.touch=[p[0],p[1],0];this.outcome='landed';
  }else if(vertices.some(p=>Math.abs(p[0])>FLIGHT_STANDARD.width/2||p[1]<0||p[1]>FLIGHT_STANDARD.length))this.outcome='wall';
  else if(vertices.some(p=>p[2]>FLIGHT_STANDARD.height))this.outcome='ceiling';
  else if(this.state.time>=FLIGHT_STANDARD.timeLimit)this.outcome='time-limit';
  if(this.state.time>=this.nextSample||this.done){this.record();this.nextSample=this.state.time+1/30;}
 }
 result():FlightResult{
  const end=this.touch??this.state.p;
  return{standard:FLIGHT_STANDARD.id,outcome:this.outcome,distance:Math.hypot(end[0]-this.initial[0],end[1]-this.initial[1]),forward:end[1]-this.initial[1],airtime:this.state.time,peakHeight:this.peak,mass:this.mass,exposedArea:this.patches.reduce((a,p)=>a+p.area*(p.plus+p.minus)/2,0),samples:this.samples.map(q=>({t:q.t,p:[...q.p],q:[...q.q]}))};
 }
}
