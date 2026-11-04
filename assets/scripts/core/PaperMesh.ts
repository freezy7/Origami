import { Panel, PaperPoint, V3, add, sub, mul, norm, cross } from './FreePaper';

export type MaterialMesh = { points: PaperPoint[]; triangles: number[][]; offset: number; layers:number[]; text: string };

/** Conforming material mesh: weld UVs, resolve all T junctions, then triangulate.
 * Positions remain distinct for different material layers even when they touch.
 */
export function meshFromPanels(panels: Panel[], edgeLength = .025): MaterialMesh {
  if (!panels.length || edgeLength < .005 || !Number.isFinite(edgeLength)) throw Error('纸面网格参数无效');
  const points: PaperPoint[] = [], ids = new Map<string, number>(), layerSum:number[]=[], layerCount:number[]=[];
  const key = (uv: number[]) => uv.map(v => v.toFixed(10)).join(',');
  const addPoint = (p: PaperPoint,layer:number) => {
    const k = key(p.uv), found = ids.get(k);
    if (found !== undefined) {
      if (norm(sub(points[found].p, p.p)) > 1e-6) throw Error('同一材料点不连续，不能进入物理整理');
      layerSum[found]+=layer;layerCount[found]++;
      return found;
    }
    const id = points.length;
    ids.set(k, id); points.push({uv: [...p.uv], p: [...p.p]}); layerSum[id]=layer;layerCount[id]=1;return id;
  };
  for (let rank=0;rank<panels.length;rank++) {const f=panels[rank];for (let i=0;i<f.points.length;i++) {
    const a=f.points[i], b=f.points[(i+1)%f.points.length];
    const length=Math.hypot(b.uv[0]-a.uv[0],b.uv[1]-a.uv[1]);
    const n=Math.max(1,Math.ceil(length/edgeLength));
    for(let j=0;j<n;j++) {
      const t=j/n;
      addPoint({uv:[a.uv[0]+(b.uv[0]-a.uv[0])*t,a.uv[1]+(b.uv[1]-a.uv[1])*t],p:add(a.p,mul(sub(b.p,a.p),t))},rank);
    }
  }
  }
  const boundaryPoints=points.slice(); let triangles: number[][]=[];
  for (let rank=0;rank<panels.length;rank++) {const f=panels[rank];
    const center: PaperPoint={uv:[0,0],p:[0,0,0]};
    f.points.forEach(p=>{center.uv[0]+=p.uv[0]/f.points.length;center.uv[1]+=p.uv[1]/f.points.length;center.p=add(center.p,mul(p.p,1/f.points.length));});
    const c=addPoint(center,rank), ring: number[]=[];
    for(let i=0;i<f.points.length;i++) {
      const a=f.points[i],b=f.points[(i+1)%f.points.length],dx=b.uv[0]-a.uv[0],dy=b.uv[1]-a.uv[1],l=dx*dx+dy*dy;
      const on: {id:number;t:number}[]=[];
      boundaryPoints.forEach((q,id)=>{
        const x=q.uv[0]-a.uv[0],y=q.uv[1]-a.uv[1],t=(x*dx+y*dy)/l;
        if(Math.abs(x*dy-y*dx)<1e-10*Math.sqrt(l) && t>=-1e-8 && t<1-1e-8) on.push({id,t});
      });
      on.sort((a,b)=>a.t-b.t);on.forEach(q=>ring.push(q.id));
    }
    for(let i=0;i<ring.length;i++) {
      const a=ring[i],b=ring[(i+1)%ring.length],u=points[a].uv,v=points[b].uv;
      const area=((u[0]-center.uv[0])*(v[1]-center.uv[1])-(u[1]-center.uv[1])*(v[0]-center.uv[0]))/2;
      if(area<=1e-12) throw Error('折轴产生了过窄纸面，请稍微移动折轴再进入物理整理');
      triangles.push([c,a,b]);
    }
  }
  // A manifold-only collapse can erase an authored crease and leave a triangle
  // spanning two rigid faces. Its folding target then demands large in-plane
  // strain. Preserve every original panel edge and crease intersection.
  const features=panels.reduce<{a:number[];b:number[]}[]>((all,f)=>all.concat(f.points.map((p,i)=>({a:p.uv,b:f.points[(i+1)%f.points.length].uv}))),[]);
  const onLine=(p:number[],f:{a:number[];b:number[]})=>Math.abs((f.b[0]-f.a[0])*(p[1]-f.a[1])-(f.b[1]-f.a[1])*(p[0]-f.a[0]))<1e-10*Math.hypot(f.b[0]-f.a[0],f.b[1]-f.a[1]);
  const constrained=points.map(p=>features.filter(f=>onLine(p.uv,f)&&
    (p.uv[0]-f.a[0])*(p.uv[0]-f.b[0])+(p.uv[1]-f.a[1])*(p.uv[1]-f.b[1])<1e-12));
  const canRemove=(keep:number,remove:number)=>constrained[remove].every(f=>onLine(points[keep].uv,f));
  const boundary=(id:number)=>{
    const uv=points[id].uv;
    return [Math.abs(Math.abs(uv[0])-.105)<1e-9,Math.abs(Math.abs(uv[1])-.1485)<1e-9];
  };
  for(let pass=0;pass<points.length;pass++) {
    const edges=new Map<string,[number,number]>();
    triangles.forEach(f=>f.forEach((a,i)=>{const b=f[(i+1)%3];edges.set([Math.min(a,b),Math.max(a,b)].join(','),[a,b]);}));
    const short=Array.from(edges.values()).filter(([a,b])=>Math.hypot(points[a].uv[0]-points[b].uv[0],points[a].uv[1]-points[b].uv[1])<.001)
      .sort(([a,b],[c,d])=>Math.hypot(points[a].uv[0]-points[b].uv[0],points[a].uv[1]-points[b].uv[1])-Math.hypot(points[c].uv[0]-points[d].uv[0],points[c].uv[1]-points[d].uv[1]));
    let collapsed=false;
    for(const pair of short) {
      let [keep,remove]=pair;const ba=boundary(keep),bb=boundary(remove);
      if(bb.filter(Boolean).length>ba.filter(Boolean).length) [keep,remove]=[remove,keep];
      if(!canRemove(keep,remove)){
        if(canRemove(remove,keep))[keep,remove]=[remove,keep];else continue;
      }
      const ka=boundary(keep),rb=boundary(remove);
      if(rb.some(Boolean) && !ka.some((v,k)=>v && rb[k] && Math.abs(points[keep].uv[k]-points[remove].uv[k])<1e-9)) continue;
      const link=(id:number)=>new Set(triangles.filter(f=>f.indexOf(id)!==-1).reduce<number[]>((a,f)=>a.concat(f.filter(v=>v!==id)),[]));
      const a=link(keep),b=link(remove),common=Array.from(a).filter(v=>b.has(v));
      const opposite=new Set(triangles.filter(f=>f.indexOf(keep)!==-1 && f.indexOf(remove)!==-1).reduce<number[]>((a,f)=>a.concat(f.filter(v=>v!==keep && v!==remove)),[]));
      if(common.length!==opposite.size || common.some(v=>!opposite.has(v))) continue;
      const next=triangles.map(f=>f.map(v=>v===remove?keep:v)).filter(f=>new Set(f).size===3);
      if(next.some(f=>{
        const [a,b,c]=f.map(id=>points[id].uv);
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<=2e-12;
      })) continue;
      constrained[keep]=constrained[keep].concat(constrained[remove]);
      triangles=next;collapsed=true;break;
    }
    if(!collapsed) break;
  }
  const used=Array.from(new Set(triangles.reduce<number[]>((a,f)=>a.concat(f),[]))).sort((a,b)=>a-b);
  const layers=used.map(id=>layerSum[id]/layerCount[id]);
  const compact=used.map(id=>points[id]),remap=new Map(used.map((id,i)=>[id,i]));
  triangles=triangles.map(f=>f.map(id=>remap.get(id)!));points.splice(0,points.length,...compact);
  if(points.length>1600 || triangles.length>3200) throw Error('当前材料网格超出物理整理预算');
  const offset=.025-Math.min(...points.map(p=>p.p[2]));
  points.forEach(p=>p.p[2]+=offset);
  const text=['PAPER_MESH 2',`${points.length} ${triangles.length}`,
    ...points.map((q,i)=>[...q.uv,...q.p,layers[i]].join(' ')),...triangles.map(f=>f.join(' '))].join('\n');
  return {points,triangles,offset,layers,text};
}
