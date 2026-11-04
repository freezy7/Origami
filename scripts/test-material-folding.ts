import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {meshFromPanels} from '../assets/scripts/core/PaperMesh';
import {PHYSICAL_PROFILE} from '../assets/scripts/core/PaperMaterial';
import {airplaneFixture} from '../tests/paper/airplane_fixture';
import {userAirplaneFixture} from '../tests/paper/user_airplane_fixture';
import {formingSupports} from '../assets/scripts/core/PaperForming';
import {PaperFlight} from '../assets/scripts/core/PaperFlight';
const folder=process.env.PAPER_TEST_FOLDER||'artifacts/material-flight';mkdirSync(folder,{recursive:true});
const kernelHash=createHash('sha256').update(readFileSync('native/paper/Sheet.cpp')).update(readFileSync('native/paper/Geometry.hpp')).digest('hex');
const p=process.env.PAPER_USER_AIRPLANE?userAirplaneFixture():airplaneFixture(),source=p.save(),angles=p.records.map(t=>t.angle),mesh=meshFromPanels(p.panels),offset=.2;
if(process.env.PAPER_MOUNTAIN_BODY)angles[5]=-angles[5];
if(process.env.PAPER_ALTERNATING_FOLDS){angles[1]=-Math.PI;angles[2]=-Math.PI;angles[5]=-Math.PI;}
writeFileSync(`${folder}/source.foldpaper`,source);
const sourceHash=createHash('sha256').update(source).digest('hex');
const failure=(reason:string)=>writeFileSync(`${folder}/report.json`,JSON.stringify({profile:PHYSICAL_PROFILE,sourceHash,kernelHash,acceptance:{passed:false,reasons:[reason]},flight:null},null,2));
failure('Acceptance run has not completed.');
const supports=formingSupports(p,mesh.points);
writeFileSync(`${folder}/supports.txt`,[supports.length,...supports.map(uv=>uv.join(' '))].join('\n'));
writeFileSync(`${folder}/flat.mesh`,['PAPER_MESH 1',`${mesh.points.length} ${mesh.triangles.length}`,...mesh.points.map(q=>[...q.uv,...q.uv,offset].join(' ')),...mesh.triangles.map(f=>f.join(' '))].join('\n'));
const rows:string[]=[];const ramp=Math.round(PHYSICAL_PROFILE.rampSeconds*240),hold=Math.round(PHYSICAL_PROFILE.holdSeconds*240);
if(process.env.PAPER_PRECREASE){
 for(const [from,to] of [[0,Math.PI],[Math.PI,0]])for(let step=1;step<=ramp+hold;step++){
  const t=Math.min(1,step/ramp),ease=t*t*(3-2*t),active=angles.map(()=>0);active[0]=from+(to-from)*ease;p.setAngles(active);
  rows.push(mesh.points.map(q=>{const point=p.pointAt(q.uv)!.point.p;return[point[0],point[1],point[2]+offset].join(' ');}).join(' '));
 }
}
for(let index=0;index<angles.length;index++){
 if(Math.abs(angles[index])<.01)continue;
 for(let step=1;step<=ramp+hold;step++){
  const t=Math.min(1,step/ramp),ease=t*t*(3-2*t);
  p.setAngles(angles.map((a,i)=>i<index?a:i===index?a*ease:0));
  rows.push(mesh.points.map(q=>{const point=p.pointAt(q.uv)!.point.p;return[point[0],point[1],point[2]+offset].join(' ');}).join(' '));
 }
}
writeFileSync(`${folder}/forming.targets`,rows.join('\n'));
const compiler=spawnSync(process.env.CXX||'clang++',['-std=c++17','-O2','-I','native/paper','native/paper/Sheet.cpp','tests/paper/material_folding_driver.cpp','-o',`${folder}/material-driver`],{encoding:'utf8'});
if(compiler.status!==0){failure(compiler.stderr);throw Error(compiler.stderr);}
const run=spawnSync(`${folder}/material-driver`,[`${folder}/flat.mesh`,`${folder}/forming.targets`,`${folder}/settled.paperstate`,`${folder}/supports.txt`],{encoding:'utf8',timeout:Number(process.env.PAPER_TEST_TIMEOUT_MS||300000)});
if(run.status!==0){const reason=run.stderr||String(run.error);failure(reason);throw Error(reason);}
if(process.env.PAPER_FORM_DEBUG)console.warn(run.stderr);
const material=JSON.parse(run.stdout);
const tokens=readFileSync(`${folder}/settled.paperstate`,'utf8').trim().split(/\s+/);let i=11;
const n=Number(tokens[i++]),f=Number(tokens[i++]);i++;
const positions:number[]=[],uv:number[]=[],triangles:number[]=[];
for(let j=0;j<n;j++){uv.push(Number(tokens[i++]),Number(tokens[i++]));positions.push(Number(tokens[i++]),Number(tokens[i++]),Number(tokens[i++]));i+=3;}
for(let j=0;j<f*3;j++)triangles.push(Number(tokens[i++]));
const geometry={positions,uv,triangles},proof={stable:material.finalSpeed<.05,strain:material.finalStrain,intersections:material.intersections,penetration:material.peakPenetration};
material.referenceShapeRMS=Math.sqrt(positions.reduce((sum,v,i)=>sum+(v-(mesh.points[Math.floor(i/3)].p[i%3]-(i%3===2?mesh.offset-offset:0)))**2,0)/n);
const accepted=material.referenceShapeRMS<=PHYSICAL_PROFILE.maxFormingError;
let result:ReturnType<PaperFlight['result']>|null=null;
if(accepted){const flight=new PaperFlight(geometry,proof);for(let i=0;i<3600&&!flight.done;i++)flight.advance(1/60);if(!flight.done)throw Error('flight did not finish within computation budget');result=flight.result();}
const report={profile:PHYSICAL_PROFILE,sourceHash,kernelHash,supports,recipe:process.env.PAPER_USER_AIRPLANE?'recorded-user-reverse-nose-v1':'standard-eight-fold-v1',material,acceptance:{passed:accepted,reasons:accepted?[]:['Requested airplane shape was not achieved within 10 mm RMS; flight is blocked.']},flight:result?{...result,samples:result.samples.length}:null,note:'Numerical fixture with experimental material and quasi-steady rigid flight; not browser or real-paper acceptance.'};
writeFileSync(`${folder}/report.json`,JSON.stringify(report,null,2));writeFileSync(`${folder}/flight.json`,JSON.stringify({mesh:geometry,result},null,2));
console.log(JSON.stringify(report,null,2));
if(!accepted)process.exitCode=1;
