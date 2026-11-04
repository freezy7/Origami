import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
// Exercise the actual Creator output: tsx source tests cannot detect the
// Creator loose spread transform treating a Map iterator as one array item.
let factory;
let foldFactory;
let labFactory;
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
foldModule.setters[0](helpers);
foldModule.setters[1]({ cclegacy: { _RF: { push() {}, pop() {} } } });
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
labModule.setters[1]({
  cclegacy: { _RF: { push() {}, pop() {} } },
  _decorator: { ccclass: () => (t) => t },
  Component: function () {},
});
labModule.setters[2]({});
labModule.setters[3](folded);
labModule.execute();
const lab = new labExports.FreeFoldLab();
lab.stage = { focus() {}, setPointerCapture() {} };
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
lab.message = () => {};
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
