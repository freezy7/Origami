import type {Panel,Turn,V3} from './FreePaper';

export type FoldLock={fold:number;blockedBy:number;area:number};
type V2=[number,number];
const minus=(a:V3,b:V3):V3=>a.map((v,i)=>v-b[i]) as V3;
const dot=(a:V3,b:V3)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a:V3):V3=>{const n=Math.hypot(...a);return a.map(v=>v/n) as V3;};
const side=(a:V2,b:V2,p:V2)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const signedArea=(p:V2[])=>p.reduce((s,a,i)=>s+a[0]*p[(i+1)%p.length][1]-a[1]*p[(i+1)%p.length][0],0)/2;
const ccw=(p:V2[])=>signedArea(p)<0?p.slice().reverse():p;
function clip(subject:V2[],boundary:V2[]):V2[]{
  let out=subject;
  for(let i=0;i<boundary.length && out.length;i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length],input=out;out=[];
    input.forEach((p,j)=>{
      const q=input[(j+1)%input.length],dp=side(a,b,p),dq=side(a,b,q);
      if(dp>=-1e-12)out.push(p);
      if((dp>1e-12&&dq< -1e-12)||(dp< -1e-12&&dq>1e-12)){
        const t=dp/(dp-dq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
      }
    });
  }
  return out;
}
function contains(f:Panel,uv:V2):boolean{
  const poly=ccw(f.points.map(p=>p.uv));
  return poly.every((p,i)=>side(p,poly[(i+1)%poly.length],uv)>=-1e-10);
}
const center=(f:Panel):V2=>f.points.reduce((p,q)=>[p[0]+q.uv[0]/f.points.length,p[1]+q.uv[1]/f.points.length],[0,0] as V2);
const moving=(f:Panel,t:Turn)=>t.base.some(g=>t.moving.indexOf(g.id)!==-1&&contains(g,center(f)));

/** Conservative boundary for zero-thickness geometric editing. A later closed
 * fold covering an earlier flap against a stationary sheet removes independent
 * angular freedom. At zero separation the branch/layer order is ambiguous, so
 * do not assert clearance for an independently rotating flap. This is derived
 * from current overlapping material regions, never particular fold numbers.
 * Finite-gap motion requires the material solver's collision constraints. */
export function findFoldLock(ordered:Panel[],records:Turn[],index:number):FoldLock|null{
  const turn=records[index];if(!turn)return null;
  const movable=ordered.map(f=>moving(f,turn));
  for(let rank=0;rank<ordered.length;rank++){
    if(!movable[rank])continue;
    const f=ordered[rank],origin=f.points[0].p;
    let n:V3|null=null;
    for(let i=1;i<f.points.length-1;i++){
      const v=cross(minus(f.points[i].p,origin),minus(f.points[i+1].p,origin));
      if(Math.hypot(...v)>1e-12){n=unit(v);break;}
    }
    if(!n)continue;
    const u=unit(minus(f.points[1].p,origin)),v=cross(n,u);
    const project=(p:V3):V2=>{const d=minus(p,origin);return[dot(d,u),dot(d,v)];};
    const footprint=ccw(f.points.map(p=>project(p.p)));
    const contacts:{panel:Panel;overlap:V2[]}[]=[];
    ordered.forEach((g,j)=>{
      if(j===rank||movable[j]||g.points.some(p=>Math.abs(dot(minus(p.p,origin),n!))>1e-7))return;
      const overlap=clip(footprint,ccw(g.points.map(p=>project(p.p))));
      if(overlap.length<3||Math.abs(signedArea(overlap))<1e-10)return;
      contacts.push({panel:g,overlap});
    });
    for(let a=0;a<contacts.length;a++)for(let b=a+1;b<contacts.length;b++){
      const lower=contacts[a],upper=contacts[b];
      const common=clip(lower.overlap,ccw(upper.overlap));
      const area=common.length>=3?Math.abs(signedArea(common)):0;
      if(area<1e-10)continue;
      for(let j=index+1;j<records.length;j++)if(Math.abs(Math.abs(records[j].angle)-Math.PI)<1e-5 &&
        moving(lower.panel,records[j])!==moving(upper.panel,records[j]))return{fold:index,blockedBy:j,area};
    }
  }
  return null;
}
