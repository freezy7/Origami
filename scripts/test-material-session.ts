import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {PaperDynamics} from '../assets/scripts/core/PaperDynamics';
import {WebPaperWorker} from '../assets/scripts/WebPaperWorker';
import {airplaneFixture} from '../tests/paper/airplane_fixture';

// Offline integration of the actual client and dispatcher, not browser control
// or a substitute for Worker deployment/UI acceptance. No network is used.
const factory=createRequire(resolve('package.json'))(resolve('build/web-kernel/paper-kernel.js'));
class OfflineWorker {
 onmessage:any;onerror:any;private stopped=false;private self:any;
 constructor(_url:string){
  this.self={location:{href:'https://offline.invalid/kernel/paper-worker.js'},postMessage:(data:any)=>{if(!this.stopped)this.onmessage?.({data});}};
  vm.runInNewContext(readFileSync('web/paper-worker.js','utf8'),{self:this.self,URL,importScripts:()=>{this.self.createPaperKernel=()=>factory({wasmBinary:readFileSync('build/web-kernel/paper-kernel.wasm')});}});
 }
 postMessage(data:any){if(this.stopped)throw Error('Worker terminated');this.self.onmessage({data});}
 terminate(){this.stopped=true;}
}
async function main(){
 Object.assign(globalThis,{Worker:OfflineWorker,document:{baseURI:'https://offline.invalid/'}});
 const model=airplaneFixture(),state=readFileSync('artifacts/material-flight/wasm-settled.paperstate','utf8'),d=new PaperDynamics();
 try{
  const frame=await d.open(model,state);
  assert.equal(d.isForming,false);assert.equal(await d.save(),state);
  assert.equal(d.check().ready,false);assert.match(d.check().reasons.join(' '),/成形偏差/);
  const [u,v]=frame.uv!,p=frame.positions.slice(0,3);
  await d.grip(100,u,v,p);d.move(100,[p[0],p[1],p[2]+.001]);await d.release(100);
  await d.pause();assert.equal(d.snapshot,state,'Flushed transient grip must not damage the saved sheet');
  await d.advance(1/240);const changed=await d.save();assert.notEqual(changed,state);
  const next=new PaperDynamics();try{await next.open(model,changed);assert.equal(await next.save(),changed);assert.equal(next.check().ready,false);assert.equal((await next.auditNow()).audit!.intersections,0);}finally{next.close();}
 }finally{d.close();}
 const closed=new WebPaperWorker();closed.close();await assert.rejects(closed.call({op:'state'}),/关闭/);
 const report={backend:'Offline client + shipped dispatcher + actual WebAssembly; not browser acceptance',checks:['restore exact material snapshot','reject unformed airplane at UI preflight model','flush move before release','pause retains pins and clears transient grips','advance/save/reopen exact state','fresh audit after reopen','calls after close reject instead of hanging']};
 writeFileSync('artifacts/material-flight/session-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
