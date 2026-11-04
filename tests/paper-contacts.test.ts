import test from 'node:test';
import assert from 'node:assert/strict';
import {FreePaper} from '../assets/scripts/core/FreePaper';
import {coveredCornersFixture} from './paper/covered_corners_fixture';
import {airplaneFixture} from './paper/airplane_fixture';

test('the actual closed fourth fold removes independent angular freedom of both covered corners',()=>{
  const p=coveredCornersFixture(),before=p.save();
  for(const index of [1,2]){
    assert.equal(p.foldLock(index)?.blockedBy,3);
    assert.ok(p.foldLock(index)!.area>.005);
    for(const angle of [0,Math.PI/2,-Math.PI,Math.PI-.001]){
      assert.throws(()=>p.editFold(index,angle),/折痕 4.*压住/);
      assert.equal(p.save(),before,'a blocked edit must preserve the entire original paper');
    }
    assert.throws(()=>p.moveAxis(index,[0,.05],[.1,.15]),/压住/);
    assert.equal(p.save(),before);
  }
  const q=new FreePaper();q.load(before);
  assert.equal(q.foldLock(1)?.blockedBy,3);assert.equal(q.foldLock(2)?.blockedBy,3);
});

test('opening the covering fold releases the corners and closing it restores the boundary',()=>{
  const p=coveredCornersFixture();
  p.editFold(3,0);
  assert.equal(p.foldLock(1),null);assert.equal(p.foldLock(2),null);
  p.editFold(3,Math.PI);
  assert.equal(p.foldLock(1)?.blockedBy,3);assert.equal(p.foldLock(2)?.blockedBy,3);
  p.editFold(3,0);p.editFold(1,Math.PI/2);
  assert.equal(p.records[1].angle,Math.PI/2);
});

test('closed-stack protection handles both flat branches without permanently welding the cover',()=>{
  const p=coveredCornersFixture();p.editFold(3,-Math.PI);
  assert.equal(p.foldLock(1)?.blockedBy,3);assert.equal(p.foldLock(2)?.blockedBy,3);
  p.editFold(3,-Math.PI/2);
  assert.equal(p.foldLock(1),null);assert.equal(p.foldLock(2),null);
});

test('contact boundaries depend on material overlap, not on fixed step numbers',()=>{
  const p=new FreePaper();
  for(const [a,b,uv]of [
    [[0,-.15,0],[0,.15,0],[-.1,-.13]],
    [[-.11,0,0],[.11,0,0],[.08,.13]],
  ] as [number[],number[],number[]][]){
    p.setCrease(a as [number,number,number],b as [number,number,number],[0,0,1]);
    p.begin(uv as [number,number],true);p.preview(Math.PI);p.finish();
  }
  assert.equal(p.foldLock(0)?.blockedBy,1);
  p.unfoldAll();assert.equal(p.foldLock(0),null);
  const plane=airplaneFixture();
  assert.equal(plane.foldLock(5),null,'the body packet can still move as a whole');
  assert.equal(plane.foldLock(6),null);assert.equal(plane.foldLock(7),null);
});
