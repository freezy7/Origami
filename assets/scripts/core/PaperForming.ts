import {FreePaper, PaperPoint, V3} from './FreePaper';

/** Virtual supports may only hold material that remains stationary for the
 * complete requested program. A hard-coded UV can lie inside a later flap. */
export function formingSupports(model:FreePaper,points:PaperPoint[]):[number,number][] {
  const replay=new FreePaper();replay.load(model.save());
  const angles=model.records.map(r=>r.angle);
  let candidates=points.filter(q=>Number.isFinite(q.uv[0])&&Number.isFinite(q.uv[1]));
  for(let step=0;step<angles.length;step++)for(const fraction of [.5,1]) {
    replay.setAngles(angles.map((a,i)=>i<step?a:i===step?a*fraction:0));
    candidates=candidates.filter(q=>{
      const p=replay.pointAt(q.uv)?.point.p;
      return p && Math.hypot(p[0]-q.uv[0],p[1]-q.uv[1],p[2])<1e-7;
    });
  }
  if(candidates.length<3)return [];
  const distance=(a:PaperPoint,b:PaperPoint)=>Math.hypot(a.uv[0]-b.uv[0],a.uv[1]-b.uv[1]);
  const center=candidates.reduce((p,q)=>[p[0]+q.uv[0]/candidates.length,p[1]+q.uv[1]/candidates.length,0] as V3,[0,0,0] as V3);
  candidates.sort((a,b)=>Math.hypot(a.uv[0]-center[0],a.uv[1]-center[1])-Math.hypot(b.uv[0]-center[0],b.uv[1]-center[1]));
  const a=candidates[0],b=candidates.reduce((best,p)=>distance(a,p)>distance(a,best)?p:best,a);
  const area=(p:PaperPoint)=>Math.abs((b.uv[0]-a.uv[0])*(p.uv[1]-a.uv[1])-(b.uv[1]-a.uv[1])*(p.uv[0]-a.uv[0]));
  const c=candidates.reduce((best,p)=>area(p)>area(best)?p:best,a);
  return area(c)>1e-8?[a,b,c].map(p=>[...p.uv] as [number,number]):[];
}
