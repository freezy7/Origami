import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {FreePaper, materialArea} from '../assets/scripts/core/FreePaper';
import {meshFromPanels} from '../assets/scripts/core/PaperMesh';
import {PHYSICAL_PROFILE} from '../assets/scripts/core/PaperMaterial';

/** Static audit of actual saved geometry. This does not relax the geometry,
 * substitute a newly formed sheet, or prove its swept folding path is safe. */
async function main(): Promise<void> {
  const source=process.argv[2], output=process.argv[3];
  if(!source)throw Error('Usage: node --import tsx scripts/audit-foldpaper.ts input.foldpaper [report.json]');
  const raw=readFileSync(source,'utf8'), model=new FreePaper();model.load(raw);
  const wasm=readFileSync('build/web-kernel/paper-kernel.wasm');
  const factory=createRequire(resolve('package.json'))(resolve('build/web-kernel/paper-kernel.js'));
  const kernel=await factory({wasmBinary:wasm});
  const call=kernel.cwrap('paper_call','string',['number','number','number','number','number','number','number','number','string','number']);
  const invoke=(op:number,state='')=>{
    const frame=JSON.parse(call(op,0,0,0,0,0,0,0,state,0));
    if(!frame.ok)throw Error(frame.error);return frame;
  };
  const count=model.records.length;
  const steps=[];
  for(let end=count?1:0;end<=count;end++) {
    model.load(raw);
    if(end<count)model.unfoldFrom(end);
    const mesh=meshFromPanels(model.panels);
    invoke(9,mesh.text);
    const {audit}=invoke(10);
    steps.push({step:end,intersections:audit.intersections,
      thicknessDeficitMM:Math.max(0,audit.penetration)*1000,
      passed:audit.checked && audit.intersections===0 && audit.penetration<=PHYSICAL_PROFILE.thickness*.2});
  }
  model.load(raw);
  const report={source:resolve(source),sourceSHA256:createHash('sha256').update(raw).digest('hex'),
    wasmSHA256:createHash('sha256').update(wasm).digest('hex'),
    panels:model.panels.length,folds:count,anglesDegrees:model.records.map(t=>t.angle*180/Math.PI),
    materialAreaMM2:model.panels.reduce((sum,f)=>sum+materialArea(f)*1e6,0),
    thicknessMM:PHYSICAL_PROFILE.thickness*1000,steps,passed:steps.every(s=>s.passed),
    note:'Static edge-face pair and thickness audit of exported geometry; coplanar overlap is reflected in thickness deficit. Not a count of independent holes, continuous collision detection, or calibrated real-paper validation.'};
  if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(!report.passed)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
