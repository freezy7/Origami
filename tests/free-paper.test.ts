import test from "node:test";
import assert from "node:assert/strict";
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
