import { LabFrame } from './PaperLabView';
export type KernelCommand={op:string;id?:number;u?:number;v?:number;target?:number[];dt?:number;state?:string;pin?:boolean;press?:boolean};
export class WebPaperWorker {
  private worker:Worker;
  private next=0;
  private failure:Error|null=null;
  private pending=new Map<number,{resolve:(frame:LabFrame)=>void;reject:(e:Error)=>void}>();
  constructor(){
    this.worker=new Worker(new URL('kernel/paper-worker.js',document.baseURI).href);
    this.worker.onmessage=(e:MessageEvent)=>{
      const q=this.pending.get(e.data.id);if(!q)return;this.pending.delete(e.data.id);
      e.data.error?q.reject(new Error(e.data.error)):q.resolve(e.data.frame);
    };
    this.worker.onerror=()=>this.fail(new Error('材料求解线程无法运行，请确认已构建完整 Web 物理内核'));
  }
  call(command:KernelCommand):Promise<LabFrame>{
    if(this.failure)return Promise.reject(this.failure);
    return new Promise((resolve,reject)=>{const id=++this.next;this.pending.set(id,{resolve,reject});try{this.worker.postMessage({id,command});}catch(e){this.pending.delete(id);reject(e);}});
  }
  private fail(e:Error):void {this.failure=e;this.pending.forEach(q=>q.reject(e));this.pending.clear();}
  close():void {this.worker.terminate();this.fail(new Error('材料整理已关闭'));}
}
