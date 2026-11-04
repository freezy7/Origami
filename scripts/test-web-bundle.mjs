import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
// Exercise the actual Creator output: tsx source tests cannot detect the
// Creator loose spread transform treating a Map iterator as one array item.
let factory;
let foldFactory;
let labFactory;
let viewFactory;
let contactsFactory,contactsDeps;
const bundle = readFileSync("build/web-mobile/assets/main/index.js", "utf8");
assert.doesNotMatch(
  bundle,
  /\.concat\([^;\n]*\.(?:values|keys)\(\)\)/,
  "Map iterators must not use the loose array spread output",
);
vm.runInNewContext(bundle, {
  System: {
    register(name, deps, fn) {
      if (name === "chunks:///_virtual/PaperHands.ts") factory = fn;
      if (name === "chunks:///_virtual/FreePaper.ts") foldFactory = fn;
      if (name === "chunks:///_virtual/FreeFoldLab.ts") labFactory = fn;
      if (name === "chunks:///_virtual/PaperView.ts") viewFactory = fn;
      if (name === "chunks:///_virtual/PaperContacts.ts") {contactsFactory=fn;contactsDeps=deps;}
    },
  },
});
assert.ok(factory, "PaperHands module must exist in the real Cocos bundle");
const out = {};
const module = factory((name, value) => {
  out[name] = value;
  return value;
});
module.setters[0]({ cclegacy: { _RF: { push() {}, pop() {} } } });
module.execute();
const sent = [],
  hands = new out.PaperHands((q) => sent.push(q));
const pick = { uv: { x: 0.1, y: 0.14 }, p: [0.1, 0.14, 0.000075] };
assert.equal(hands.begin(1, 1, pick, { x: 0, y: 0 }), true);
assert.equal(
  hands.begin(2, 1, pick, { x: 0, y: 0 }),
  false,
  "Duplicate constraint must be found through Map values",
);
hands.setHeight(1, 0.08);
assert.equal(sent.at(-1).op, "move");
assert.equal(sent.at(-1).target[2], 0.08);
hands.keepSelected();
hands.begin(2, 2, pick, { x: 0, y: 0 });
hands.finishAll([
  { id: 1, uv: [0.1, 0.14], p: [0.1, 0.14, 0.079], pin: false, press: false },
  { id: 2, uv: [0.1, 0.14], p: [0.1, 0.14, 0.02], pin: false, press: false },
]);
assert.equal(
  hands.hands.size,
  0,
  "finishAll must iterate the actual finger keys",
);
assert.equal(sent.at(-2).pin, true);
assert.equal(sent.at(-2).target[2], 0.079);
assert.equal(sent.at(-1).op, "release");
console.log(
  "Actual Cocos bundle: duplicate grip, height, keep, and finishAll passed.",
);
assert.ok(foldFactory, "FreePaper must exist in the actual Creator bundle");
const folded = {};
let helperFactory;
vm.runInNewContext(
  readFileSync("build/web-mobile/src/chunks/bundle.js", "utf8"),
  {
    System: {
      register(name, deps, fn) {
        if (Array.isArray(name)) deps(() => {}, {}).execute();
        else if (name.endsWith("/rollupPluginModLoBabelHelpers.js"))
          helperFactory = fn;
      },
    },
  },
);
assert.ok(helperFactory, "Use the actual Creator Babel helpers");
const helpers = {};
helperFactory((name, value) => {
  if (typeof name === "object") Object.assign(helpers, name);
  else helpers[name] = value;
  return value;
}).execute();
const foldModule = foldFactory((name, value) => {
  if (typeof name === "object") Object.assign(folded, name);
  else folded[name] = value;
  return value;
});
const contactExports={};
const contactModule=contactsFactory((name,value)=>{contactExports[name]=value;return value;});
contactsDeps.forEach((dep,i)=>contactModule.setters[i](dep==='cc'?{cclegacy:{_RF:{push(){},pop(){}}}}:helpers));
contactModule.execute();
foldModule.setters[0](helpers);
foldModule.setters[1]({ cclegacy: { _RF: { push() {}, pop() {} } } });
foldModule.setters[2](contactExports);
foldModule.execute();
const sheet = new folded.FreePaper(),
  from = [-0.105, 0.1485, 0],
  to = [0, 0.0435, 0],
  crease = folded.creaseBetween(from, to, [0, 0, 1]);
sheet.setCrease(crease.a, crease.b, crease.normal);
sheet.begin([-0.105, 0.1485]);
sheet.preview(Math.PI);
sheet
  .pointAt([-0.105, 0.1485])
  .point.p.forEach((v, i) => assert.ok(Math.abs(v - to[i]) < 1e-9));
const saved = sheet.save();
const restored = new folded.FreePaper();
restored.load(saved);
assert.equal(restored.save(), saved);
restored.preview(0);
restored
  .pointAt([-0.105, 0.1485])
  .point.p.forEach((v, i) => assert.ok(Math.abs(v - from[i]) < 1e-9));
console.log(
  "Actual Cocos bundle: corner-to-target fold, exact restore, and unfold passed.",
);
const labExports = {};
const labModule = labFactory((name, value) => {
  labExports[name] = value;
  return value;
});
labModule.setters[0](helpers);
class TestVec3 {
  constructor(x=0,y=0,z=0) { Object.assign(this,{x,y,z}); }
  static transformQuat(out,p) { return Object.assign(out,p); }
}
labModule.setters[1]({
  cclegacy: { _RF: { push() {}, pop() {} } },
  _decorator: { ccclass: () => (t) => t },
  Component: function () {},
  Vec3: TestVec3,
});
labModule.setters[2]({});
labModule.setters[3](folded);
for(const setter of labModule.setters.slice(4))setter({});
labModule.execute();
const lab = new labExports.FreeFoldLab();
lab.stage = { focus() {}, setPointerCapture() {}, getBoundingClientRect() { return {width: 390}; } };
lab.root = {
  querySelector() {
    return { checked: false };
  },
};
lab.point = (e) => ({ x: e.clientX, y: e.clientY });
lab.hit = (p) => lab.model.pointAt([p.x / 1000, p.y / 1000]);
lab.unproject = (p) => [p.x / 1000, p.y / 1000, 0];
lab.project = (p) => ({ x: p[0] * 1000, y: p[1] * 1000 });
lab.render = () => {};
lab.message = message => {lab.lastMessage=message;};
lab.save = () => {};
const event = (x, y) => ({
  pointerId: 1,
  button: 0,
  clientX: x,
  clientY: y,
  preventDefault() {},
});
lab.down(event(-105, 148.5));
assert.equal(lab.gesture.kind, "auto");
lab.move(event(0, 43.5));
lab.end(event(0, 43.5), false);
lab.model
  .pointAt([-0.105, 0.1485])
  .point.p.forEach((v, i) => assert.ok(Math.abs(v - to[i]) < 1e-9));
lab.action("undo");
assert.equal(lab.model.panels.length, 1);
assert.equal(lab.model.turn, null);
lab.down(event(-105, 148.5));
lab.move(event(0, 43.5));
lab.end(event(0, 43.5), true);
assert.equal(lab.model.turn, null);
console.log(
  "Compiled controller with synthetic pointer inputs: direct corner drag, undo, and cancel passed (not browser acceptance).",
);

lab.down(event(-105, 148.5));
lab.move(event(0, 43.5));
lab.move(event(-105, 148.5));
lab.end(event(-105, 148.5), false);
assert.equal(lab.model.turn, null);
console.log(
  "Compiled direct drag: returning to the starting point cancels the fold.",
);

// Exercise the history replay in the actual Creator transform as well.
const ledger = new folded.FreePaper();
ledger.setCrease([0,-.15,0],[0,.15,0],[0,0,1]);
ledger.begin([-.1,-.13]); ledger.preview(Math.PI); ledger.finish(); ledger.finish();
assert.equal(ledger.records.length, 1);
ledger.editFold(0, 179*Math.PI/180);
assert.ok(Math.abs(ledger.records[0].angle-179*Math.PI/180)<1e-9);
ledger.unfoldAll();
assert.ok(ledger.creaseSegments(0).length);
const ledgerCopy = new folded.FreePaper(); ledgerCopy.load(ledger.save());
assert.equal(ledgerCopy.save(),ledger.save());
console.log("Compiled crease history: precision adjustment, unfold, visible segments and reload passed.");

lab.model.reset();
lab.model.setCrease([0,-.15,0],[0,.15,0],[0,0,1]);
lab.model.begin([-.1,-.13]); lab.model.preview(Math.PI); lab.model.finish();
lab.paper={paper:{rig:{rotation:{}}}};
const layers=lab.hits({x:90,y:-130});
assert.equal(layers.length,2,"The two overlapping material wings must both be selectable");
assert.ok(layers[0].point.uv[0]<0 && layers[1].point.uv[0]>0);
assert.equal(lab.hits({x:140,y:-130}).length,0,"Empty space must not grab a distant edge");
lab.model.reset();
lab.model.setCrease([0,-.15,0],[0,.15,0],[0,0,1]);
lab.model.begin([-.1,-.13]);
lab.gesture=null;
lab.angle(Math.PI/2);
assert.equal(lab.model.records.length,1,"An angle-button fold must commit even without a drag");
console.log("Compiled controller: overlapping-layer selection, bounded picking and angle-button commit passed.");

// Explicit numeric apply must not depend on blur, and presets must follow the
// touched face's lift direction before the first nonzero angle exists.
lab.model.reset();
lab.model.setCrease([0,-.15,0],[0,.15,0],[0,0,1]);
lab.model.begin([.1,-.13]);
lab.gesture=null;
lab.action('half');
assert.ok(Math.abs(lab.model.turn.angle+Math.PI/2)<1e-9);
lab.model.reset();
lab.model.setCrease([0,-.15,0],[0,.15,0],[0,0,1]);
lab.model.begin([.1,-.13]);
const numberField={value:'-93.5',checkValidity:()=>true};
lab.root={querySelector(){return numberField;}};
lab.selectedFold=-1;
lab.applyNumber();
assert.equal(lab.model.records.length,1);
assert.ok(Math.abs(lab.model.turn.angle+93.5*Math.PI/180)<1e-9);
lab.action('reverse');
assert.ok(Math.abs(lab.model.turn.angle-93.5*Math.PI/180)<1e-9);
console.log('Compiled controller: explicit numeric apply, first-lift direction and reverse passed.');

const renderLab=new labExports.FreeFoldLab();
renderLab.model.setCrease([0,-.15,0],[0,.15,0],[0,0,1]);
renderLab.model.begin([-.1,-.13]);renderLab.model.preview(Math.PI);renderLab.model.finish();renderLab.model.unfoldAll();
let renderedFrame;
renderLab.paper={setFrame(frame){renderedFrame=frame;}};
renderLab.controls=()=>{};renderLab.overlay=()=>{};
renderLab.render();
assert.equal(renderedFrame.boundary.length,6,'An unfolded split sheet must draw only its six outer edge pieces');
for (const [a,b] of renderedFrame.boundary) {
  const uv=renderedFrame.uv;
  assert.ok([0,1].some(k=>Math.abs(uv[2*a+k]-uv[2*b+k])<1e-8 && Math.abs(Math.abs(uv[2*a+k])-(k===0?.105:.1485))<1e-8));
}
lab.model.reset();
lab.model.setCrease([0,-.15,0],[0,.15,0],[0,0,1]);
lab.model.begin([-.1,-.13]);lab.model.preview(Math.PI);lab.model.finish();lab.model.preview(0);
const nose=folded.creaseBetween([-.105,.1485,0],[0,.0435,0],[0,0,1]);
lab.model.setCrease(nose.a,nose.b,nose.normal);lab.model.begin([-.105,.1485]);lab.model.preview(Math.PI);lab.model.finish();
const aligned=lab.snap({x:0,y:1},[-.105,.0435,0],[0,0,1],[-.105,.0435,0]);
assert.equal(lab.snapHint.label,'纸边对齐');
assert.ok(Math.abs(Math.hypot(aligned[0],aligned[1]-.1485)-Math.hypot(.105,.105))<1e-9,'Edge alignment must preserve the nose edge length exactly');
console.log('Compiled rendering and snapping: no artificial crease boundaries, exact edge-to-center alignment passed.');

lab.model.reset();
function compiledFold(a,b,uv,angle,all=false) {
  lab.model.setCrease(a,b,[0,0,1]);lab.model.begin(uv,all);lab.model.preview(angle);lab.model.finish();
}
compiledFold([0,-.15,0],[0,.15,0],[-.1,-.13],Math.PI,true);
compiledFold([.02,-.15,0],[.02,.15,0],[-.09,-.13],Math.PI/2);
compiledFold([.02,-.15,0],[.02,.15,0],[.09,-.13],-Math.PI/2);
lab.model.unfoldFrom(1);
lab.selectedFold=1;
lab.action('half');
assert.ok(Math.abs(lab.model.records[1].angle-Math.PI/2)<1e-9,'Reopening the first historic wing must use its own material face');
assert.equal(lab.model.records[2].angle,0);
lab.selectedFold=2;
lab.action('half');
assert.ok(Math.abs(lab.model.records[2].angle+Math.PI/2)<1e-9,'The opposite material wing must lift in the opposite direction');
console.log('Compiled historical wing presets: opposite material directions passed after suffix unfolding.');

// Follow the projected hinge arc through the real pointer controller. A
// side-oblique projection resolves the two possible angles of a flat view.
lab.model.reset();
compiledFold([0,-.15,0],[0,.15,0],[-.1,-.13],Math.PI,true);
lab.project=p=>({x:1000*p[0],y:1000*(p[1]+.7*p[2])});
lab.selectedFold=0;
const material=lab.model.pointAt([-.09,-.10]);
const start=lab.project(material.point.p);
assert.equal(lab.startAdjustment(start,material,1),true);
assert.equal(lab.gesture.kind,'edit');
const target=lab.project(folded.rotate(lab.gesture.point.p,lab.gesture.crease,150*Math.PI/180));
lab.move(event(target.x,target.y));lab.end(event(target.x,target.y),false);
assert.ok(Math.abs(lab.model.records[0].angle-150*Math.PI/180)<2*Math.PI/180);
assert.equal(lab.model.records.length,1,'Dragging a wing edits the existing hinge');
lab.action('undo');
assert.equal(lab.model.records[0].angle,Math.PI);

lab.model.reset();
compiledFold([0,-.15,0],[0,.15,0],[-.1,-.13],Math.PI,true);
lab.project=p=>({x:1000*p[0],y:1000*p[1]});
lab.selectedFold=0;
assert.equal(lab.startAxis({x:0,y:0},1),true);
lab.move(event(5,0));lab.end(event(5,0),false);
assert.ok(Math.abs(lab.model.records[0].crease.a[0]-.005)<1e-9);
assert.equal(lab.model.records.length,1);
lab.action('undo');
assert.ok(Math.abs(lab.model.records[0].crease.a[0])<1e-12);
console.log('Compiled pointer controller: direct V opening, hinge translation and exact undo passed (not browser acceptance).');

// Repeat direct adjustment on the complete eight-step airplane, including
// folded nose layers and downstream wing hinges, rather than only one hinge.
lab.model.reset();
compiledFold([0,-.1485,0],[0,.1485,0],[-.1,-.13],Math.PI);lab.model.preview(0);
compiledFold([-.105,.0435,0],[0,.1485,0],[-.1,.14],Math.PI);
compiledFold([0,.1485,0],[.105,.0435,0],[.1,.14],Math.PI);
for(const side of [-1,1]){
  const c=folded.creaseBetween([side*.105,.0435,0],[0,.1485-.105*Math.sqrt(2),0],[0,0,1]);
  compiledFold(c.a,c.b,[side*.105,.0435],Math.PI,true);
}
compiledFold([0,-.1485,0],[0,.1485,0],[-.09,-.13],Math.PI,true);
compiledFold([.018,-.1485,0],[.018,.1485,0],[-.09,-.13],93.5*Math.PI/180);
compiledFold([.018,-.1485,0],[.018,.1485,0],[.09,-.13],-86.5*Math.PI/180);
const fullAirplane=lab.model.save();
lab.project=p=>({x:1000*(p[0]+.3*p[2]),y:1000*(p[1]+.7*p[2])});
for(const [index,uv,degrees]of [[6,[-.09,-.13],85],[7,[.09,-.13],-78],[5,[-.09,-.13],150]]){
  lab.model.load(fullAirplane);lab.selectedFold=index;
  const hit=lab.model.pointAt(uv),screen=lab.project(hit.point.p);
  assert.equal(lab.startAdjustment(screen,hit,1),true);
  assert.equal(lab.gesture.kind,'edit');
  const cursor=lab.project(folded.rotate(lab.gesture.point.p,lab.gesture.crease,degrees*Math.PI/180));
  lab.move(event(cursor.x,cursor.y));lab.end(event(cursor.x,cursor.y),false);
  assert.ok(Math.abs(lab.model.records[index].angle-degrees*Math.PI/180)<2*Math.PI/180,`Airplane hinge ${index+1} follows direct dragging`);
  assert.equal(lab.model.records.length,8);
  for(let i=0;i<8;i++)if(i!==index)assert.ok(Math.abs(lab.model.records[i].angle-JSON.parse(fullAirplane).records[i].angle)<1e-9);
  lab.action('undo');assert.equal(lab.model.save(),fullAirplane);
}
console.log('Compiled eight-step airplane: both wings and body V hinge follow direct dragging; other angles and undo are preserved (not browser acceptance).');
lab.model.load(fullAirplane);lab.project=p=>({x:p[0]*1000,y:p[1]*1000});lab.selectedFold=7;
const axisBefore=lab.model.records[7].crease,endpoint=lab.project(lab.axisEnds(7)[0]);
assert.equal(lab.startAxis(endpoint,1),true);assert.equal(lab.gesture.endpoint,0);
lab.move(event(endpoint.x+3,endpoint.y));lab.end(event(endpoint.x+3,endpoint.y),false);
const axisAfter=lab.model.records[7].crease;
const slope=c=>(c.b[0]-c.a[0])/(c.b[1]-c.a[1]);
assert.ok(Math.abs(slope(axisAfter)-slope(axisBefore))>.001,'Endpoint dragging rotates the actual airplane wing axis');
assert.equal(lab.model.records.length,8);lab.action('undo');assert.equal(lab.model.save(),fullAirplane);
lab.model.unfoldFrom(2);
assert.ok(lab.model.records.slice(2).every(r=>r.angle===0));
assert.equal(lab.model.records[1].angle,Math.PI);
lab.model.unfoldAll();
for(let i=0;i<8;i++)assert.ok(lab.model.creaseSegments(i).length>0,`Unfolded airplane crease ${i+1} remains visible`);
const planeReload=new folded.FreePaper();planeReload.load(lab.model.save());assert.equal(planeReload.save(),lab.model.save());
console.log('Compiled eight-step airplane: wing-axis endpoint rotation, undo, early suffix unfolding, all eight visible creases and exact reload passed (not browser acceptance).');

lab.model.load(fullAirplane);lab.selectedFold=7;
const ends=lab.axisEnds(7),begin=lab.project(ends[0]),other=lab.project(ends[1]);
assert.equal(lab.startAxis(begin,1),true);
lab.move(event(other.x,other.y));lab.end(event(other.x,other.y),false);
assert.equal(lab.model.save(),fullAirplane,'Invalid zero-length axis leaves the complete airplane intact');
assert.match(lab.lastMessage,/未应用本次调整/,'Pointer release must not replace a failed edit with a success message');
console.log('Compiled failed axis edit: exact rollback and truthful final status passed.');

// A face projected edge-on must still lift from a perfectly flat fold.
for(const sign of [-1,1]) {
  lab.model.reset();compiledFold([0,-.1485,0],[0,.1485,0],[-.09,-.13],sign*Math.PI);
  lab.selectedFold=0;lab.project=p=>({x:p[0]*1000,y:p[1]*1000});
  const flat=lab.model.save(),hit=lab.model.pointAt([-.09,-.13]),screen=lab.project(hit.point.p);
  lab.startAdjustment(screen,hit,1);lab.move(event(screen.x,screen.y+25));
  assert.ok(Math.abs(lab.model.records[0].angle-sign*165*Math.PI/180)<1e-9,'Flat face opens by screen distance despite zero projected lift');
  lab.move(event(screen.x,screen.y));lab.end(event(screen.x,screen.y),false);
  assert.equal(lab.model.save(),flat,'Returning the grip must cancel flat-face opening exactly');
  lab.selectedFold=-1;lab.action('ease-open');
  assert.equal(lab.selectedFold,0);assert.ok(Math.abs(lab.model.records[0].angle-sign*165*Math.PI/180)<1e-9);
  assert.equal(lab.model.records.length,1);lab.action('undo');assert.equal(lab.model.save(),flat);
}
lab.model.load(fullAirplane);lab.selectedFold=-1;lab.action('crease-prev');
assert.equal(lab.selectedFold,7);lab.action('crease-prev');assert.equal(lab.selectedFold,6);
lab.action('crease-next');assert.equal(lab.selectedFold,7);assert.equal(lab.model.save(),fullAirplane);
console.log('Compiled flat-face interaction: either fold sign lifts from 180 degrees, drag-return cancels, incremental opening undoes exactly, and fold navigation preserves geometry.');
lab.model.load(fullAirplane);lab.selectedFold=-1;lab.foldedState=null;
for(let n=0;n<7;n++)lab.action('peel-open');
assert.equal(lab.selectedFold,6,'Once the last wing reaches zero the next click opens the preceding wing');
assert.ok(Math.abs(lab.model.records[7].angle)<1e-10);assert.equal(lab.model.records.length,8);
for(let n=0;n<7;n++)lab.action('undo');
assert.equal(lab.model.save(),fullAirplane,'Sequential peeling can be undone back to the exact airplane');
assert.equal(lab.foldedState,fullAirplane,'The complete shape is available for one-click restoration');
const viewExports={},viewModule=viewFactory((name,value)=>{viewExports[name]=value;return value;});
viewModule.setters[0](helpers);viewModule.setters[1]({cclegacy:{_RF:{push(){},pop(){}}}});
viewModule.setters[2]({});viewModule.setters[3]({});viewModule.execute();
const orbit=Object.create(viewExports.PaperView.prototype);orbit.pitch=0;orbit.yaw=0;orbit.applyTransform=()=>{};
orbit.orbit(0,-240);assert.equal(orbit.pitch,120,'Camera passes through the old 85-degree limit');
orbit.orbit(0,-480);assert.equal(orbit.pitch,0,'A complete pitch turn returns to the starting orientation');
orbit.orbit(0,240);assert.equal(orbit.pitch,-120,'The reverse direction reaches the back hemisphere too');
console.log('Compiled sequential unfolding and continuous front/back camera orbit passed.');

lab.model.reset();
compiledFold([0,-.1485,0],[0,.1485,0],[-.1,-.13],Math.PI);lab.model.preview(0);
compiledFold([0,.1485,0],[.105,.0435,0],[.1,.14],Math.PI);
compiledFold([-.105,.0435,0],[0,.1485,0],[-.1,.14],Math.PI);
compiledFold([-.2,.03,0],[.2,.03,0],[0,.14],Math.PI,true);
lab.selectedFold=1;lab.gesture=null;
const pressed=lab.model.save(),historyLength=lab.history.length;
assert.equal(lab.model.foldLock(1).blockedBy,3);
lab.action('half');assert.equal(lab.model.save(),pressed);assert.equal(lab.history.length,historyLength);
const heldPoint=lab.model.pointAt([.1,.14]),heldScreen=lab.project(heldPoint.point.p);
lab.startAdjustment(heldScreen,heldPoint,1);
assert.equal(lab.gesture,null);assert.equal(lab.history.length,historyLength);assert.equal(lab.model.save(),pressed);
assert.match(lab.lastMessage,/压住/);
const hiddenHit=lab.model.pointAt([0,.08]),hiddenScreen=lab.project(hiddenHit.point.p);
lab.startAdjustment(hiddenScreen,hiddenHit,1);
assert.equal(lab.selectedFold,1,'a blocked inner fold must not silently switch to moving the covering layer');
assert.equal(lab.gesture,null);assert.equal(lab.model.save(),pressed);assert.equal(lab.history.length,historyLength);
lab.action('select-cover');assert.equal(lab.selectedFold,3);assert.equal(lab.model.save(),pressed);
lab.action('open');assert.equal(lab.model.foldLock(1),null);
console.log('Compiled covered-corner boundary: buttons and dragging cannot change a pressed flap or undo history; selecting and opening the cover releases it.');
