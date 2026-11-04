/* The expensive sheet solver stays off the UI thread. Commands execute in order. */
let ready;
let queue=Promise.resolve();
const codes={reset:0,state:1,advance:2,grip:3,move:4,release:5,pause:6,save:7,load:8,mesh:9,audit:10,form:11,free:12,snapshot:13};
self.onmessage=e=>{
  const {id,command:q}=e.data;
  queue=queue.then(async()=>{
    try{
      if(!ready){
        importScripts('paper-kernel.js');
        ready=self.createPaperKernel({locateFile:name=>new URL(name,self.location.href).href}).then(m=>m.cwrap('paper_call','string',['number','number','number','number','number','number','number','number','string','number']));
      }
      const invoke=await ready;
      if(!(q.op in codes))throw Error('未知材料操作');
      const p=q.target||[0,0,0];
      const frame=JSON.parse(invoke(codes[q.op],q.id||0,q.u||0,q.v||0,p[0],p[1],p[2],q.dt||0,q.state||'',(q.pin?1:0)|(q.press?2:0)));
      if(!frame.ok)throw Error(frame.error||'材料求解失败');
      self.postMessage({id,frame});
    }catch(error){self.postMessage({id,error:String(error.message||error)});}
  });
};
