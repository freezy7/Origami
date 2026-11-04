import {PaperFlight,FLIGHT_STANDARD,FlightMesh,FlightProof,FlightResult,FlightSample,flightRotate} from './core/PaperFlight';
import {V3,add,sub,mul,cross,norm,dot} from './core/FreePaper';
type Trial={label:string;shape:string;profile:string;result:FlightResult;mesh:FlightMesh};
const STORE='origami.flight-trials.v1';
const status=(s:string)=>({landed:'首次触地',wall:'碰到场地边界（截断）',ceiling:'碰到顶界（截断）','time-limit':'达到时限（截断）','numerical-failure':'数值失败，结果无效',flying:'飞行中'}[s]||s);
export class FlightBench {
 private root:HTMLElement;
 private scene:SVGSVGElement;
 private simulation:PaperFlight;
 private trials:Trial[]=[];
 private raf=0;
 private running=false;
 private hasLaunched=false;
 private followScale=150;
 private replay=false;
 private replayTime=0;
 private last=0;
 private follow=true;
 private azimuth=.12;
 private elevation=.35;
 private drag:{id:number;x:number;y:number}|null=null;
 private disposed=false;
 private replaySamples:FlightSample[]=[];
 constructor(private mesh:FlightMesh,private proof:FlightProof,private shape:string,private profile:string,private onClose:()=>void){
  this.simulation=new PaperFlight(mesh,proof);
  this.root=document.createElement('section');this.root.id='flight-bench';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-label','固定场地纸飞机试飞');
  this.root.innerHTML=`<header><div><strong>固定场地试飞</strong><span>气动估算 · 未做实物标定</span></div><button data-flight="close">返回整理</button></header><main><section class="flight-workspace"><svg id="flight-scene" viewBox="0 0 1000 620" role="img" aria-label="三维试飞场地与当前纸飞机"></svg><div class="flight-hud"><span id="flight-status">待投掷</span><strong id="flight-live">0.00 m · 0.00 s</strong></div><div class="flight-view"><button data-flight="follow">切换场地全景</button><button data-flight="zoom-out" aria-label="缩小试飞场地">−</button><button data-flight="zoom-in" aria-label="放大试飞场地">＋</button><span>拖动场地旋转观察</span></div></section><aside><h1>同一条件比较纸形</h1><dl><dt>场地</dt><dd>30 × 12 × 6 m</dd><dt>质心投掷高度</dt><dd>1.5 m</dd><dt>初速度 / 抛出角</dt><dd>6 m/s · 8°</dd><dt>纸形初始俯仰</dt><dd>12° · 机头朝原纸顶边</dd><dt>空气 / 重力</dt><dd>静风 · 1.225 kg/m³ · 9.81 m/s²</dd><dt>计量</dt><dd>首次触地水平直线距离、滞空时间</dd></dl><label for="flight-label">本次纸形名称</label><input id="flight-label" maxlength="40" value="纸形试飞"><div class="flight-buttons"><button data-flight="launch">开始统一投掷</button><button data-flight="replay" disabled>轨迹回放</button></div><label for="flight-time">查看轨迹时刻</label><input id="flight-time" type="range" min="0" max="1" step="0.01" value="0" disabled><p id="flight-message" role="status">使用材料整理后的实际网格。所有记录固定同一组投掷参数。</p><p class="flight-limits">本轮将定型纸形视为刚体，以双面平板气动力估算平移和转动；尚未计算飞行中的纸面弹性变形、湍流或实测翼型系数。用于模型内对比，不代表实物飞行预测。</p><h2>试飞记录</h2><div id="flight-results"></div></aside></main>`;
  document.body.append(this.root);this.scene=this.root.querySelector('#flight-scene')!;
  try{const q=JSON.parse(localStorage.getItem(STORE)||'[]');if(Array.isArray(q))this.trials=q.filter(t=>t?.result?.standard===FLIGHT_STANDARD.id&&t?.profile===this.profile&&t?.mesh?.positions?.length&&Number.isFinite(t?.result?.distance)&&Number.isFinite(t?.result?.airtime)&&typeof t?.label==='string' ).slice(-12);}catch{}
  for(const b of this.root.querySelectorAll<HTMLElement>('[data-flight]'))b.addEventListener('click',()=>this.action(b.dataset.flight!));
  this.scene.addEventListener('pointerdown',e=>{this.scene.setPointerCapture(e.pointerId);this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};});
  this.scene.addEventListener('pointermove',e=>{if(this.drag?.id!==e.pointerId)return;this.azimuth+=(e.clientX-this.drag.x)*.004;this.elevation=Math.max(.1,Math.min(1.2,this.elevation+(e.clientY-this.drag.y)*.004));this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};this.draw();});
  this.scene.addEventListener('pointerup',()=>this.drag=null);this.scene.addEventListener('pointercancel',()=>this.drag=null);
  this.root.querySelector<HTMLInputElement>('#flight-time')!.addEventListener('input',e=>{this.running=false;this.replay=false;this.replayTime=Number((e.target as HTMLInputElement).value);this.draw();});
  this.drawResults();this.draw();
  this.raf=requestAnimationFrame(t=>this.tick(t));
 }
 private action(name:string):void{
  if(name==='close'){this.close();return;}
  if(name==='zoom-in'||name==='zoom-out'){this.follow=true;this.followScale=Math.max(40,Math.min(600,this.followScale*(name==='zoom-in'?1.25:.8)));this.draw();return;}
  if(name==='follow'){this.follow=!this.follow;this.root.querySelector('[data-flight="follow"]')!.textContent=this.follow?'切换场地全景':'跟随飞机观察';this.draw();return;}
  if(name==='launch'){
   this.simulation=new PaperFlight(this.mesh,this.proof);this.hasLaunched=true;this.running=true;this.replay=false;this.replaySamples=[];this.replayTime=0;
   this.root.querySelector<HTMLButtonElement>('[data-flight="launch"]')!.disabled=true;
   this.root.querySelector<HTMLInputElement>('#flight-time')!.disabled=true;
   this.root.querySelector<HTMLButtonElement>('[data-flight="replay"]')!.disabled=true;
   this.root.querySelector('#flight-message')!.textContent='统一投掷已开始；到首次触地停止，碰壁与超时单独标记。';
  }
  if(name==='replay' && this.replaySamples.length){this.running=false;this.replay=true;this.replayTime=0;}
 }
 private tick(t:number):void{
  if(this.disposed)return;
  const elapsed=this.last?Math.min((t-this.last)/1000,.05):0;this.last=t;
  if(this.running){
   this.simulation.advance(elapsed);this.draw();
   if(this.simulation.done){
    this.running=false;const result=this.simulation.result();this.replaySamples=result.samples;this.replayTime=result.airtime;
    const label=this.root.querySelector<HTMLInputElement>('#flight-label')!.value.trim()||`纸形 ${this.trials.length+1}`;
    this.trials.push({label,shape:this.shape,profile:this.profile,result,mesh:this.mesh});this.trials=this.trials.slice(-12);
    try{localStorage.setItem(STORE,JSON.stringify(this.trials));}catch{this.root.querySelector('#flight-message')!.textContent='试飞已完成，本地存储不可用；当前记录仍可查看。';}
    this.root.querySelector<HTMLButtonElement>('[data-flight="launch"]')!.disabled=false;
    this.root.querySelector<HTMLButtonElement>('[data-flight="replay"]')!.disabled=false;
    const range=this.root.querySelector<HTMLInputElement>('#flight-time')!;range.disabled=false;range.max=String(result.airtime);range.value=String(result.airtime);
    this.root.querySelector('#flight-message')!.textContent=`${status(result.outcome)}：${result.distance.toFixed(2)} m，${result.airtime.toFixed(2)} s。${result.outcome==='landed'?'':'此项不作为完整落地成绩。'}`;
    this.drawResults();this.draw();
   }
  }else if(this.replay){this.replayTime+=elapsed;if(this.replayTime>=this.replaySamples[this.replaySamples.length-1].t){this.replayTime=this.replaySamples[this.replaySamples.length-1].t;this.replay=false;}this.root.querySelector<HTMLInputElement>('#flight-time')!.value=String(this.replayTime);this.draw();}
  this.raf=requestAnimationFrame(now=>this.tick(now));
 }
 private pose():{vertices:V3[];center:V3;t:number}{
  if(!this.running && this.replaySamples.length){
   let i=this.replaySamples.findIndex(s=>s.t>=this.replayTime);if(i<0)i=this.replaySamples.length-1;
   const b=this.replaySamples[i],a=this.replaySamples[Math.max(0,i-1)],f=b.t>a.t?(this.replayTime-a.t)/(b.t-a.t):0;
   const p=add(a.p,mul(sub(b.p,a.p),f));let q=a.q.map((v,j)=>v+(b.q[j]-v)*f) as [number,number,number,number];const length=Math.hypot(...q);q=q.map(v=>v/length) as typeof q;
   return{vertices:this.simulation.vertices.map(v=>add(p,flightRotate(v,q))),center:p,t:this.replayTime};
  }
  return{vertices:this.simulation.posedVertices(),center:this.simulation.current.p,t:this.simulation.current.time};
 }
 private draw():void{
  const {vertices,center,t}=this.pose(),az=this.azimuth,el=this.elevation;
  const raw=(p:V3)=>({x:p[1]*Math.cos(az)+p[0]*Math.sin(az),y:-p[2]*Math.cos(el)+(p[0]*Math.cos(az)-p[1]*Math.sin(az))*Math.sin(el),z:p[2]*Math.sin(el)+(p[0]*Math.cos(az)-p[1]*Math.sin(az))*Math.cos(el)});
  const corners:V3[]=[];for(const x of [-6,6])for(const y of [0,30])for(const z of [0,6])corners.push([x,y,z]);
  const cs=corners.map(raw),xmin=Math.min(...cs.map(p=>p.x)),xmax=Math.max(...cs.map(p=>p.x)),ymin=Math.min(...cs.map(p=>p.y)),ymax=Math.max(...cs.map(p=>p.y));
  const scale=this.follow?this.followScale:Math.min(900/(xmax-xmin),500/(ymax-ymin)),c=this.follow?raw(center):{x:(xmin+xmax)/2,y:(ymin+ymax)/2};
  const project=(p:V3)=>{const q=raw(p);return{x:500+(q.x-c.x)*scale,y:310+(q.y-c.y)*scale,z:q.z};};
  const points=(ps:V3[])=>ps.map(p=>{const q=project(p);return`${q.x.toFixed(2)},${q.y.toFixed(2)}`;}).join(' ');
  const line=(a:V3,b:V3,color='#b7c9be',width=.7)=>{const p=project(a),q=project(b);return`<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${color}" stroke-width="${width}"/>`;};
  let html=`<rect width="1000" height="620" fill="#edf2ec"/><polygon points="${points([[-6,0,0],[6,0,0],[6,30,0],[-6,30,0]])}" fill="#e0e8dc" stroke="#a9bcb0"/>`;
  for(let y=0;y<=30;y+=2)html+=line([-6,y,0],[6,y,0]);for(let x=-6;x<=6;x+=2)html+=line([x,0,0],[x,30,0]);
  for(const x of [-6,6])for(const y of [0,30])html+=line([x,y,0],[x,y,6],'#b4c6bc');
  html+=line([-6,0,6],[-6,30,6])+line([6,0,6],[6,30,6])+line([-6,0,6],[6,0,6])+line([-6,30,6],[6,30,6]);
  const path=this.replaySamples.length?this.replaySamples:this.simulation.result().samples;
  html+=`<polyline points="${points(path.filter(p=>p.t<=t).map(p=>p.p))}" fill="none" stroke="#568e83" stroke-width="2"/>`;
  const tris=this.simulation.triangles.map(f=>({f,depth:f.reduce((s,i)=>s+project(vertices[i]).z,0)/3})).sort((a,b)=>a.depth-b.depth);
  for(const {f}of tris){const a=vertices[f[0]],b=vertices[f[1]],c=vertices[f[2]],normal=cross(sub(b,a),sub(c,a)),shade=.85+.15*Math.abs(normal[2]/Math.max(1e-12,norm(normal)));
   html+=`<polygon points="${points([a,b,c])}" fill="rgb(${Math.round(252*shade)},${Math.round(249*shade)},${Math.round(235*shade)})"/>`;}
  const shadow=project([center[0],center[1],0]);html+=`<ellipse cx="${shadow.x}" cy="${shadow.y}" rx="${Math.max(2,scale*.08)}" ry="${Math.max(1,scale*.015)}" fill="#244b4e18"/>`;
  html+='<text x="24" y="30" fill="#58786b" font-size="13">室内标准场地 · 30 × 12 × 6 m · 静风</text>';
  this.scene.innerHTML=html;
  this.root.querySelector('#flight-status')!.textContent=!this.hasLaunched?'待投掷':this.running?'统一条件飞行中':this.replay?'轨迹回放':status(this.simulation.result().outcome);
  const result=this.simulation.result();
  // The final score measures the first touching vertex, rather than the
  // center of mass used while following the flight.
  const distance=this.simulation.done && t>=result.airtime-1e-9
    ? result.distance : Math.hypot(center[0],center[1]-FLIGHT_STANDARD.launchY);
  this.root.querySelector('#flight-live')!.textContent=`${distance.toFixed(2)} m · ${t.toFixed(2)} s`;
  this.root.dataset.outcome=this.simulation.result().outcome;this.root.dataset.time=String(t);
 }
 private drawResults():void{
  const container=this.root.querySelector('#flight-results')!;container.replaceChildren();
  if(!this.trials.length){container.textContent='尚无试飞记录。返回整理后改动纸形，可在相同条件下再次投掷。';return;}
  const table=document.createElement('table');table.innerHTML='<thead><tr><th>纸形</th><th>距离</th><th>滞空</th><th>结束</th></tr></thead><tbody></tbody>';
  for(const trial of this.trials){const tr=document.createElement('tr');for(const text of [trial.label,trial.result.outcome==='numerical-failure'?'—':`${trial.result.distance.toFixed(2)} m`,trial.result.outcome==='numerical-failure'?'—':`${trial.result.airtime.toFixed(2)} s`,status(trial.result.outcome)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}table.querySelector('tbody')!.append(tr);}
  container.append(table);
 }
 close():void{if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.raf);this.root.remove();this.onClose();}
}
