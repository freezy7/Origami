import test from "node:test";
import assert from "node:assert/strict";
import {airplaneFixture} from './paper/airplane_fixture';

test('complete airplane axis rebuild uses the recorded material face when a grip lies on an old crease',()=>{
 for(const delta of [-.003,.003]){
  const p=airplaneFixture(),angles=p.records.map(r=>r.angle),before=p.save();
  p.moveAxisWorld(7,[.018+delta,-.1485,0],[.018,.10504415587728426,0]);
  check(p);assert.notEqual(p.save(),before);assert.equal(p.records.length,8);
  p.records.forEach((r,i)=>close(r.angle,angles[i]));
  close(p.records[7].crease.a[0],.018+delta);
  const q=new FreePaper();q.load(p.save());assert.equal(q.save(),p.save());
 }
});
import {
  FreePaper,
  Panel,
  V3,
  sub,
  cross,
  norm,
  materialArea,
} from "../assets/scripts/core/FreePaper";
const close = (a: number, b: number, e = 1e-9) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const physicalArea = (panels: Panel[]) =>
  panels.reduce(
    (sum, f) =>
      sum +
      f.points
        .slice(1, -1)
        .reduce(
          (s, p, i) =>
            s +
            norm(
              cross(
                sub(p.p, f.points[0].p),
                sub(f.points[i + 2].p, f.points[0].p),
              ),
            ) /
              2,
          0,
        ),
    0,
  );
function check(p: FreePaper) {
  close(physicalArea(p.panels), 0.21 * 0.297);
  close(
    p.panels.reduce((a, f) => a + materialArea(f), 0),
    0.21 * 0.297,
  );
  for (const f of p.panels)
    for (let i = 0; i < f.points.length; i++) {
      const a = f.points[i],
        b = f.points[(i + 1) % f.points.length];
      close(
        norm(sub(a.p, b.p)),
        Math.hypot(a.uv[0] - b.uv[0], a.uv[1] - b.uv[1]),
      );
    }
}
function fold(
  p: FreePaper,
  a: V3,
  b: V3,
  uv: [number, number],
  angle: number,
  all = false,
) {
  p.setCrease(a, b, [0, 0, 1]);
  p.begin(uv, all);
  for (const x of [0.1, 0.5, 1]) {
    p.preview(angle * x);
    check(p);
  }
  p.finish();
}
test("arbitrary off-grid crease forms a 180 degree flat fold and reopens without stretch", () => {
  const p = new FreePaper();
  fold(p, [-0.02, -0.2, 0], [0.018, 0.2, 0], [0.095, 0.13], Math.PI);
  assert.ok(p.panels.length > 1);
  assert.ok(p.panels.some((f) => f.points.some((q) => q.p[0] < -0.1)));
  p.preview(0);
  check(p);
  for (const f of p.panels)
    for (const q of f.points) {
      close(q.p[0], q.uv[0]);
      close(q.p[1], q.uv[1]);
      close(q.p[2], 0);
    }
});
test("consecutive user-defined airplane folds preserve material and open into two wings", () => {
  const p = new FreePaper();
  // Center precrease, reopen, two nose corners, narrower nose folds, center body,
  // then one material wing at a time. These are a test user's inputs, not app data.
  fold(p, [0, -0.1485, 0], [0, 0.1485, 0], [0.1, -0.13], -Math.PI);
  p.preview(0);
  fold(p, [-0.105, 0.0435, 0], [0, 0.1485, 0], [-0.1, 0.14], Math.PI);
  fold(p, [0, 0.1485, 0], [0.105, 0.0435, 0], [0.1, 0.14], Math.PI);
  fold(p, [-0.105, -0.06, 0], [0, 0.1485, 0], [-0.09, 0.01], Math.PI, true);
  fold(p, [0, 0.1485, 0], [0.105, -0.06, 0], [0.09, 0.01], Math.PI, true);
  fold(p, [0, -0.1485, 0], [0, 0.1485, 0], [-0.03, -0.13], Math.PI, true);
  // On the folded body, two material wings occupy the same footprint.
  fold(
    p,
    [0.018, -0.1485, 0],
    [0.018, 0.1485, 0],
    [-0.09, -0.13],
    -Math.PI / 2,
  );
  const firstWing = p.panels.filter((f) =>
    f.points.some((q) => q.p[2] > 0.01),
  ).length;
  assert.ok(firstWing > 0);
  fold(p, [0.018, -0.1485, 0], [0.018, 0.1485, 0], [0.09, -0.13], Math.PI / 2);
  assert.ok(p.panels.some((f) => f.points.some((q) => q.p[2] < -0.01)));
  assert.ok(p.panels.some((f) => f.points.some((q) => q.p[2] > 0.01)));
  check(p);
  assert.equal(p.records.length, 8);
  // Revisit the first wing after folding the second: both remain editable.
  p.editFold(6, -Math.PI * 0.52);
  p.editFold(7, Math.PI * 0.48);
  check(p);
  const shaped = p.save();
  p.unfoldFrom(5);
  check(p);
  assert.deepEqual(p.records.map(t=>Math.round(t.angle*180/Math.PI)), [0,180,180,180,180,0,0,0]);
  p.load(shaped);
  p.unfoldAll();
  check(p);
  for (const f of p.panels) for (const q of f.points) {
    close(q.p[0], q.uv[0]); close(q.p[1], q.uv[1]); close(q.p[2], 0);
  }
  assert.ok(p.creaseSegments(1).length > 0);
  const flat = new FreePaper(); flat.load(p.save());
  assert.equal(flat.records.length, 8);
  p.load(shaped);
  const saved = p.save(),
    copy = new FreePaper();
  copy.load(saved);
  assert.equal(copy.save(), saved);
  copy.preview(0);
  check(copy);
});
test("one connected layer can be folded without taking the other overlapping wing", () => {
  const p = new FreePaper();
  fold(p, [0, -0.15, 0], [0, 0.15, 0], [-0.1, -0.13], Math.PI, true);
  const rightBefore = p.pointAt([0.09, -0.13])!.point.p;
  fold(p, [0.02, -0.15, 0], [0.02, 0.15, 0], [-0.09, -0.13], -Math.PI / 2);
  p.pointAt([0.09, -0.13])!.point.p.forEach((v, i) => close(v, rightBefore[i]));
  check(p);
});
test("bad crease and malformed save preserve current geometry", () => {
  const p = new FreePaper(),
    initial = p.save();
  assert.throws(() => p.setCrease([0, 0, 0], [0.001, 0, 0], [0, 0, 1]));
  assert.equal(p.save(), initial);
  assert.throws(() =>
    p.load('{"version":1,"kind":"free-paper-panels","panels":[]}'),
  );
  assert.equal(p.save(), initial);
  assert.throws(() => p.setCrease([NaN, 0, 0], [0.1, 0, 0], [0, 0, 1]));
});

test("a corner can land at the user-selected point without an authored crease", async () => {
  const { creaseBetween } = await import("../assets/scripts/core/FreePaper");
  const p = new FreePaper(),
    from: V3 = [-0.105, 0.1485, 0],
    target: V3 = [0, 0.0435, 0],
    c = creaseBetween(from, target, [0, 0, 1]);
  p.setCrease(c.a, c.b, c.normal);
  p.begin([-0.105, 0.1485]);
  p.preview(Math.PI);
  p.pointAt([-0.105, 0.1485])!.point.p.forEach((v, i) => close(v, target[i]));
  check(p);
});

test("a new corner fold beside an unfolded crease tolerates nearby landing positions", async () => {
  const { creaseBetween } = await import("../assets/scripts/core/FreePaper");
  for (const x of [-0.0025, -0.001, 0, 0.001, 0.0025]) {
    const p = new FreePaper();
    fold(p, [0, -0.1485, 0], [0, 0.1485, 0], [-0.105, 0.1485], Math.PI);
    p.preview(0);
    const c = creaseBetween([-0.105, 0.1485, 0], [x, 0.0435, 0], [0, 0, 1]);
    p.setCrease(c.a, c.b, c.normal);
    p.begin([-0.105, 0.1485]);
    p.preview(Math.PI);
    check(p);
  }
});

test("finish is idempotent and precision adjustments retain near-flat angles", () => {
  const p = new FreePaper();
  fold(p, [0,-0.15,0], [0,0.15,0], [-0.1,0], Math.PI);
  p.finish(); p.finish();
  assert.equal(p.records.length, 1); assert.equal(p.folds, 1);
  p.editFold(0, 179 * Math.PI/180);
  close(p.records[0].angle, 179*Math.PI/180); check(p);
  p.editFold(0, .5 * Math.PI/180);
  close(p.records[0].angle, .5*Math.PI/180);
  const saved = p.save();
  const copy = new FreePaper(); copy.load(saved); assert.equal(copy.save(), saved);
});
test("incompatible history edits fail atomically and old files retain geometry", () => {
  const p = new FreePaper();
  fold(p, [0,-.15,0], [0,.15,0], [-.1,-.13], Math.PI, true);
  fold(p, [.02,-.15,0], [.02,.15,0], [-.09,-.13], -Math.PI/2);
  const before = p.save();
  // Malformed records cannot partially replace a valid paper.
  const bad = JSON.parse(before); bad.records[0].angle = 99;
  assert.throws(() => p.load(JSON.stringify(bad))); assert.equal(p.save(),before);
  const old = JSON.parse(before); delete old.records; delete old.committed; delete old.origin;
  const migrated = new FreePaper(); migrated.load(JSON.stringify(old));
  assert.deepEqual(migrated.panels,p.panels);
  migrated.preview(0); check(migrated);
});

test("crossing hinge edits reject tears without changing any fold", () => {
  const p = new FreePaper();
  fold(p, [0,-.15,0], [0,.15,0], [-.1,-.13], Math.PI, true);
  fold(p, [-.11,0,0], [.11,0,0], [.08,.13], Math.PI, true);
  const saved = p.save();
  assert.throws(() => p.editFold(0, Math.PI/2), /联动/);
  assert.equal(p.save(), saved);
  p.unfoldAll(); check(p);
});

test("hinge can be repositioned and rotated with topology rebuilt atomically", () => {
  const p=new FreePaper();
  fold(p,[0,-.15,0],[0,.15,0],[-.1,-.13],Math.PI);
  const area=p.panels.reduce((a,f)=>a+materialArea(f),0);
  p.moveAxis(0,[.006,-.1485],[.012,.1485]);
  check(p);
  close(p.panels.reduce((a,f)=>a+materialArea(f),0),area);
  assert.equal(p.records.length,1);
  const pose=p.foldPose(0);
  close(pose.crease.a[0],.006);close(pose.crease.b[0],.012);
  const before=p.save();
  assert.throws(()=>p.moveAxis(0,[2,0],[2,.2]));assert.equal(p.save(),before);
  const copy=new FreePaper();copy.load(before);assert.equal(copy.save(),before);
});

test("body hinge can open into a V without erasing two authored wing folds", () => {
  const p=new FreePaper();
  fold(p,[0,-.15,0],[0,.15,0],[-.1,-.13],Math.PI,true);
  fold(p,[.02,-.15,0],[.02,.15,0],[-.09,-.13],Math.PI/2);
  fold(p,[.02,-.15,0],[.02,.15,0],[.09,-.13],-Math.PI/2);
  p.editFold(0,150*Math.PI/180);
  check(p);assert.equal(p.records.length,3);
  close(p.records[1].angle,Math.PI/2);close(p.records[2].angle,-Math.PI/2);
  assert.equal(p.foldPose(0).moving.length>0,true);
});
