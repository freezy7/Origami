import test from 'node:test';
import assert from 'node:assert/strict';
import {FreePaper} from '../assets/scripts/core/FreePaper';
import {meshFromPanels} from '../assets/scripts/core/PaperMesh';
test('material conversion welds T junctions without merging separate folded layers',()=>{
 const p=new FreePaper();
 p.setCrease([0,-.15,0],[0,.15,0],[0,0,1]);p.begin([-.1,-.13]);p.preview(Math.PI);p.finish();
 p.setCrease([.02,-.15,0],[.02,.15,0],[0,0,1]);p.begin([-.09,-.13]);p.preview(Math.PI/2);p.finish();
 const m=meshFromPanels(p.physicalPanels());
 assert.equal(new Set(m.points.map(q=>q.uv.map(v=>v.toFixed(10)).join(','))).size,m.points.length);
 let area=0;const edges=new Map<string,number>();
 for(const f of m.triangles){
  const [a,b,c]=f.map(i=>m.points[i].uv);
  area+=((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
  f.forEach((a,i)=>{const b=f[(i+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');edges.set(key,(edges.get(key)||0)+1);});
 }
 assert.ok(Math.abs(area-.21*.297)<1e-10);
 assert.ok(Array.from(edges.values()).every(n=>n===1||n===2));
 assert.equal(m.layers.length,m.points.length);
 assert.ok(m.points.some(q=>Math.abs(q.p[2]-m.offset)>.05));
 assert.ok(m.text.startsWith('PAPER_MESH 2\n'));
});
