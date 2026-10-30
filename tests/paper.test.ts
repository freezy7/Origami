import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialPaper, foldPaper, paperAt, STEPS, WRONG_EAR, WRONG_CHIN, options, normal, Puzzle } from '../assets/scripts/core/PaperModel.ts';
const length = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function area3d(f: any) {
  let total = 0;
  for (let i=1;i<f.vertices.length-1;i++) {
    const a=f.vertices[0],b=f.vertices[i],c=f.vertices[i+1];
    const u=[b.x-a.x,b.y-a.y,b.z-a.z],v=[c.x-a.x,c.y-a.y,c.z-a.z];
    total+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
  }
  return total;
}
test('every authored fold conserves sheet area, including the motion and mistakes', () => {
  for(let step=0;step<STEPS.length;step++) for(const action of options(step)) {
    for(const t of [0,.2,.5,.8,1]) {
      const faces=foldPaper(paperAt(step),action,t);
      assert.ok(Math.abs(faces.reduce((s,f)=>s+area3d(f),0)-2)<1e-6, `${action.id} at ${t}`);
      for(const f of faces) for(const p of f.vertices) assert.ok([p.x,p.y,p.z].every(Number.isFinite));
    }
  }
});
test('ear/chin candidates produce observable geometry or different paper stacking', () => {
  assert.notDeepEqual(foldPaper(paperAt(1),WRONG_EAR,1),paperAt(2));
  assert.notDeepEqual(foldPaper(paperAt(3),WRONG_CHIN,1),paperAt(4));
  assert.ok(paperAt(4).every(f=>Math.abs(Math.abs(normal(f).z)-1)<1e-7));
});
test('standard path earns one collectible and unlocks the tutorial', () => {
  const p=new Puzzle(); for(const a of STEPS) assert.equal(p.commit(a.id),true);
  assert.equal(p.finished,true); assert.equal(p.complete,true); assert.equal(p.favorite,true);
  assert.equal(p.commit(STEPS[3].id),false);
  p.favorite=false; p.restart(); for(const a of STEPS) p.commit(a.id);
  assert.equal(p.favorite,false,'replaying must preserve a deliberate unfavorite');
});
test('a wrong fold cannot advance and undo exactly restores the checkpoint', () => {
  const p=new Puzzle(); p.commit('diagonal'); const before=p.faces;
  assert.equal(p.commit('short-ear'),true); assert.equal(p.step,1);
  assert.equal(p.commit('left-ear'),false); p.undo(); assert.deepEqual(p.faces,before);
  p.undo(); assert.deepEqual(p.faces,initialPaper()); assert.equal(p.undo(),false);
});
test('save/reload restores committed progress, never persists a transient wrong fold', () => {
  const p=new Puzzle();p.commit('diagonal');p.commit('short-ear');
  const restored=Puzzle.restore(JSON.stringify(p.save()));assert.equal(restored.step,1);assert.equal(restored.wrong,null);
  assert.deepEqual(restored.faces,paperAt(1));
  assert.equal(Puzzle.restore('{invalid').step,0);
  assert.equal(Puzzle.restore('{"version":1,"step":99}').step,0);
  const upgraded=Puzzle.restore('{"version":999,"step":3,"complete":true,"favorite":true}');
  assert.equal(upgraded.step,0);assert.equal(upgraded.complete,true);assert.equal(upgraded.favorite,true);
});
