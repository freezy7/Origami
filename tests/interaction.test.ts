import test from "node:test";
import assert from "node:assert/strict";
import {
  dragProgress,
  MotionFold,
  NO_DEVICE,
  foldGrip,
  creaseSegment,
} from "../assets/scripts/core/Interaction";
import { STEPS, paperAt, foldPaper } from "../assets/scripts/core/PaperModel";
const sample = {
  ...NO_DEVICE,
  tiltAvailable: true,
  hingeAvailable: true,
  active: true,
  age: 0,
  hinge: Math.PI,
};
test("drag is directional, reversible, bounded, and rejects degenerate mapping", () => {
  const start = { x: 20, y: 30 },
    axis = { x: 0, y: -3 };
  assert.equal(dragProgress(start, { x: 120, y: 30 }, axis, 100), 0);
  assert.equal(dragProgress(start, { x: 20, y: 130 }, axis, 100), 0);
  assert.equal(dragProgress(start, { x: 20, y: -50 }, axis, 100), 0.8);
  assert.equal(dragProgress(start, { x: 20, y: 10 }, axis, 100), 0.2);
  assert.equal(dragProgress(start, { x: 20, y: -200 }, axis, 100), 1);
  assert.equal(dragProgress(start, { x: 20, y: -200 }, { x: 0, y: 0 }, 100), 0);
});
test("every authored crease intersects the checkpoint and its grip is on the moving side", () => {
  STEPS.forEach((a, i) => {
    const faces = paperAt(i),
      p = foldGrip(faces, a),
      line = creaseSegment(faces, a);
    assert.ok(line);
    const dx = a.b[0] - a.a[0],
      dy = a.b[1] - a.a[1];
    assert.ok((dx * (p.y - a.a[1]) - dy * (p.x - a.a[0])) * a.side > 0);
    for (const q of line!)
      assert.ok(Math.abs(dx * (q.y - a.a[1]) - dy * (q.x - a.a[0])) < 1e-7);
  });
});
test("motion requires explicit calibration, fresh supported readings and cancels on loss", () => {
  const m = new MotionFold();
  assert.equal(m.update(sample, 0.1), "idle");
  assert.equal(m.arm("tilt", NO_DEVICE, { x: 0, y: 1 }), false);
  assert.ok(m.arm("tilt", sample, { x: 0, y: 1 }));
  for (let i = 0; i < 30; i++) assert.equal(m.update(sample, 0.02), "moving");
  assert.equal(m.progress, 0);
  for (let i = 0; i < 10; i++) m.update({ ...sample, pitch: 0.3 }, 0.02);
  assert.ok(m.progress > 0.3 && m.progress < 0.6);
  for (let i = 0; i < 20; i++) m.update(sample, 0.02);
  assert.ok(m.progress < 0.01);
  assert.equal(m.update({ ...sample, age: 1 }, 0.02), "lost");
  assert.equal(m.armed, false);
  assert.equal(m.progress, 0);
});
test("tilt threshold is smoothed and held before completion; hinge uses relative radians", () => {
  for (const mode of ["tilt", "hinge"] as const) {
    const m = new MotionFold();
    assert.ok(m.arm(mode, sample, { x: 0, y: 1 }));
    const target = {
      ...sample,
      pitch: (Math.PI * 32) / 180,
      hinge: Math.PI - (Math.PI * 55) / 180,
    };
    assert.equal(m.update(target, 0.02), "moving");
    let result = "";
    for (let i = 0; i < 80; i++) {
      result = m.update(target, 0.02);
      if (result === "complete") break;
    }
    assert.equal(result, "complete");
    m.cancel();
    assert.equal(m.update(target, 0.02), "idle");
  }
});
test("folded points retain original paper coordinates through animation and repeated folds", () => {
  const faces = foldPaper(paperAt(0), STEPS[0], 0.5),
    top = faces.flatMap((f) => f.vertices).find((p) => p.v === 1);
  assert.ok(top);
  assert.ok(Math.abs(top.y) < 1e-7);
  assert.equal(top.v, 1);
  for (const f of paperAt(4))
    for (const p of f.vertices) {
      assert.ok(Number.isFinite(p.u ?? p.x));
      assert.ok(Math.abs(p.u ?? p.x) <= 1.000001);
      assert.ok(Math.abs(p.v ?? p.y) <= 1.000001);
    }
});
