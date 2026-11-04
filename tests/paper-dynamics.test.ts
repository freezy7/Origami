import test from 'node:test';
import assert from 'node:assert/strict';
import {PaperDynamics} from '../assets/scripts/core/PaperDynamics';
// Check eligibility without creating a browser Worker: the numerical backend
// is separately exercised by test:material-wasm.
function settled(){return Object.assign(Object.create(PaperDynamics.prototype),{
 frame:{positions:[0,0,.2],stats:{strainMax:.001,maxSpeed:.01,backlog:0}},
 goal:[0,0,.2],audit:{checked:true,intersections:0,penetration:0},stable:12,forming:null,
}) as PaperDynamics;}
test('preflight rejects a quiet collision-free sheet that failed to form the requested shape',()=>{
 const d=settled();assert.equal(d.check().ready,true);
 d.frame.positions[0]=.03;
 assert.equal(d.check().ready,false);assert.match(d.check().reasons.join(' '),/成形偏差/);
});
test('preflight rejects nonfinite measurements, missing topology and paper still forming',()=>{
 const d=settled();d.frame.stats.strainMax=NaN;assert.equal(d.check().ready,false);
 d.frame.stats.strainMax=.001;d.frame.positions=[];assert.equal(d.check().ready,false);
 const forming=settled();Object.assign(forming,{forming:{}});assert.equal(forming.check().ready,false);
});
