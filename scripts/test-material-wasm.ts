import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {PaperFlight} from '../assets/scripts/core/PaperFlight';
import {PHYSICAL_PROFILE} from '../assets/scripts/core/PaperMaterial';
import {FreePaper} from '../assets/scripts/core/FreePaper';
import {formingSupports} from '../assets/scripts/core/PaperForming';
import {meshFromPanels} from '../assets/scripts/core/PaperMesh';
const outputFolder=process.env.PAPER_TEST_FOLDER||'artifacts/material-flight';
async function main(){
const folder=outputFolder;
writeFileSync(`${folder}/wasm-report.json`,JSON.stringify({acceptance:{passed:false,reasons:['Acceptance run has not completed.']},flight:null},null,2));
const recipe=new FreePaper();recipe.load(readFileSync(`${folder}/source.foldpaper`,'utf8'));
const factory=createRequire(resolve('package.json'))(resolve('build/web-kernel/paper-kernel.js'));
const module=await factory({wasmBinary:readFileSync('build/web-kernel/paper-kernel.wasm')});
const raw=module.cwrap('paper_call','string',['number','number','number','number','number','number','number','number','string','number']);
const call=(op:number,id=0,u=0,v=0,p=[0,0,0],dt=0,state='',flags=0)=>{
 const frame=JSON.parse(raw(op,id,u,v,...p,dt,state,flags));assert.equal(frame.ok,true,frame.error);return frame;
};
let frame=call(9,0,0,0,[0,0,0],0,readFileSync(`${folder}/flat.mesh`,'utf8'));
for(const [index,[u,v]]of formingSupports(recipe,meshFromPanels(recipe.panels).points).entries())call(3,-index-1,u,v,[u,v,.2],0,'',1);
let peakStrain=0,peakPenetration=0,audits=0;
const inspect=()=>{frame=call(10);audits++;assert.equal(frame.audit.intersections,0);peakPenetration=Math.max(peakPenetration,frame.audit.penetration);assert.ok(peakPenetration<PHYSICAL_PROFILE.thickness*.2);};
const rows=readFileSync(`${folder}/forming.targets`,'utf8').trim().split('\n');
for(let i=0;i<rows.length;i++){
 call(11,0,0,0,[0,0,0],0,`PAPER_TARGETS 1\n${frame.positions.length/3}\n${rows[i]}`,2);
 frame=call(2,0,0,0,[0,0,0],1/240);
 peakStrain=Math.max(peakStrain,frame.stats.strainMax);assert.ok(peakStrain<=.020001,'WASM material strain');
 if(i%12===11)inspect();
}
const held=frame.positions.slice();call(12);let relaxSteps=0;
for(let i=0;i<720;i++){
 frame=call(2,0,0,0,[0,0,0],1/240);relaxSteps++;
 peakStrain=Math.max(peakStrain,frame.stats.strainMax);assert.ok(peakStrain<=.020001);
 if(i%12===11)inspect();if(i>=119&&frame.stats.maxSpeed<.02)break;
}
inspect();assert.ok(frame.stats.maxSpeed<.05,'WASM material must settle');
const rebound=Math.sqrt(frame.positions.reduce((s:number,p:number,i:number)=>s+(p-held[i])**2,0)/(held.length/3));
let error=0;
for(let i=0;i<frame.uv.length;i+=2){const p=recipe.pointAt([frame.uv[i],frame.uv[i+1]])!.point.p;error+=(p[0]-frame.positions[i/2*3])**2+(p[1]-frame.positions[i/2*3+1])**2+(p[2]+.2-frame.positions[i/2*3+2])**2;}
const snapshot=call(13).state;call(8,0,0,0,[0,0,0],0,snapshot);assert.equal(call(13).state,snapshot);
const proof={stable:true,intersections:frame.audit.intersections,penetration:frame.audit.penetration,strain:frame.stats.strainMax};
const mesh={positions:frame.positions,uv:frame.uv,triangles:frame.triangles};
const referenceShapeRMS=Math.sqrt(error/(held.length/3));
const reasons:string[]=[];
if(referenceShapeRMS>PHYSICAL_PROFILE.maxFormingError)reasons.push('Requested airplane shape was not achieved within 10 mm RMS; flight is blocked.');
if(rebound<=1e-7)reasons.push('Release produced no observable material response; rebound acceptance failed.');
const accepted=!reasons.length;
let result:ReturnType<PaperFlight['result']>|null=null;
if(accepted){const flight=new PaperFlight(mesh,proof);for(let i=0;i<3600&&!flight.done;i++)flight.advance(1/60);assert.ok(flight.done);assert.notEqual(flight.result().outcome,'numerical-failure');result=flight.result();}
const report={backend:'Node WebAssembly; not browser acceptance',profile:PHYSICAL_PROFILE,wasmHash:createHash('sha256').update(readFileSync('build/web-kernel/paper-kernel.wasm')).digest('hex'),material:{steps:rows.length+relaxSteps,audits,peakStrain,finalStrain:frame.stats.strainMax,peakPenetration,intersections:frame.audit.intersections,finalSpeed:frame.stats.maxSpeed,releaseMotionRMS:rebound,referenceShapeRMS,mass:frame.stats.mass},acceptance:{passed:accepted,reasons},flight:result?{...result,samples:result.samples.length}:null};
writeFileSync(`${folder}/wasm-settled.paperstate`,snapshot);writeFileSync(`${folder}/wasm-report.json`,JSON.stringify(report,null,2));writeFileSync(`${folder}/wasm-flight.json`,JSON.stringify({mesh,result}));console.log(JSON.stringify(report,null,2));
if(!accepted)process.exitCode=1;
}
main().catch(error=>{writeFileSync(`${outputFolder}/wasm-report.json`,JSON.stringify({profile:PHYSICAL_PROFILE,acceptance:{passed:false,reasons:[String(error)]},flight:null},null,2));console.error(error);process.exitCode=1;});
