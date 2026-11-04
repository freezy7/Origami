import test from 'node:test';
import assert from 'node:assert/strict';
import {formingSupports} from '../assets/scripts/core/PaperForming';
import {meshFromPanels} from '../assets/scripts/core/PaperMesh';
import {materialArea} from '../assets/scripts/core/FreePaper';
import {userAirplaneFixture} from './paper/user_airplane_fixture';

test('recorded airplane includes the reverse nose fold and preserves its first two corner folds',()=>{
  const p=userAirplaneFixture();
  assert.equal(p.records.length,9);assert.equal(p.panels.length,58);
  assert.ok(Math.abs(p.panels.reduce((a,f)=>a+materialArea(f),0)-.06237)<1e-12);
  assert.ok(p.records[3].angle<0);
  assert.ok(Math.abs(p.records[3].crease.a[1]-.03490155105130512)<1e-10);
  assert.equal(p.records[1].angle,Math.PI);assert.equal(p.records[2].angle,Math.PI);
});

test('forming supports do not pin the nose that must move during the reverse fold',()=>{
  const p=userAirplaneFixture(),mesh=meshFromPanels(p.panels),angles=p.records.map(r=>r.angle);
  const supports=formingSupports(p,mesh.points);
  assert.equal(supports.length,3,'this recipe has a usable stationary support patch');
  p.setAngles(angles.map((a,i)=>i<4?a:0));
  assert.ok(Math.hypot(...p.pointAt([0,.08])!.point.p.map((v,i)=>v-([0,.08,0][i])))>.09,
    'the former hard-coded support prevents over 90 mm of required nose motion');
  for(let step=0;step<angles.length;step++)for(const fraction of [.5,1]){
    p.setAngles(angles.map((a,i)=>i<step?a:i===step?a*fraction:0));
    for(const uv of supports){const point=p.pointAt(uv)!.point.p;
      assert.ok(Math.hypot(point[0]-uv[0],point[1]-uv[1],point[2])<1e-7);}
  }
});

test('material mesh simplification preserves every fold in the recorded reverse-nose recipe',()=>{
  const p=userAirplaneFixture(),mesh=meshFromPanels(p.panels),angles=p.records.map(r=>r.angle);
  for(let step=0;step<angles.length;step++)for(const fraction of [.5,1]){
    p.setAngles(angles.map((a,i)=>i<step?a:i===step?a*fraction:0));
    const positions=mesh.points.map(q=>p.pointAt(q.uv)!.point.p);
    for(const f of mesh.triangles)for(let j=0;j<3;j++){
      const a=f[j],b=f[(j+1)%3],u=mesh.points[a].uv,v=mesh.points[b].uv;
      const material=Math.hypot(u[0]-v[0],u[1]-v[1]);
      const actual=Math.hypot(...positions[a].map((x,k)=>x-positions[b][k]));
      assert.ok(Math.abs(actual-material)<1e-7,`fold ${step+1}: material triangle spans an erased crease`);
    }
  }
});
