import test from "node:test";
import assert from "node:assert/strict";
import {
  PaperHands,
  PaperCommand,
  PaperAnchor,
  GripPick,
  DESK_HEIGHT,
  MAX_HEIGHT,
} from "../assets/scripts/core/PaperHands";
const pick: GripPick = { uv: { x: 0.1, y: 0.14 }, p: [0.1, 0.14, DESK_HEIGHT] };
const pin: PaperAnchor = {
  id: 7,
  p: [0.08, 0.1, 0.04],
  uv: [0.1, 0.14],
  pin: true,
  press: false,
};
const fixture = () => {
  const sent: PaperCommand[] = [];
  return { sent, hands: new PaperHands((q) => sent.push(q)) };
};
test("a grip stays live until release, and release has no implicit pin", () => {
  const { sent, hands } = fixture();
  hands.begin(1, 1, pick, { x: 0, y: 0 });
  hands.move(1, [0.01, 0, 0], 20);
  hands.move(1, [0.05, 0, 0], 100);
  assert.equal(hands.hands.size, 1);
  assert.deepEqual(sent.at(-1), {
    op: "move",
    id: 1,
    target: [0.1 + 0.05, 0.14, 0.025075],
  });
  hands.finish(1, []);
  assert.deepEqual(sent.at(-1), { op: "release", id: 1 });
  assert.equal(hands.hands.size, 0);
});
test("two fingers own two grips; one ending never releases the other", () => {
  const { sent, hands } = fixture();
  hands.begin(2, 1, pick, { x: 0, y: 0 });
  hands.begin(9, 2, pick, { x: 20, y: 0 });
  assert.equal(hands.begin(3, 3, pick, { x: 0, y: 0 }), false);
  hands.move(9, [-0.01, 0, 0], 20);
  assert.equal(sent.at(-1)?.id, 2);
  hands.finish(2, []);
  assert.ok(hands.hands.has(9));
  hands.move(9, [0.02, 0, 0], 40);
  assert.equal(sent.at(-1)?.id, 2);
  hands.finishAll([]);
  assert.equal(hands.hands.size, 0);
});
test("regrabbing a pin replaces the same constraint and repins the actual position", () => {
  const { sent, hands } = fixture();
  hands.begin(1, pin.id, pick, { x: 0, y: 0 }, false, pin);
  assert.equal(sent[0].op, "grip");
  assert.equal(sent[0].id, pin.id);
  assert.equal((sent[0] as any).pin, undefined);
  hands.move(1, [0.02, 0, 0], 50);
  hands.finish(1, [{ ...pin, p: [0.09, 0.11, 0.045], pin: false }]);
  assert.deepEqual(sent.at(-1), {
    op: "grip",
    id: 7,
    u: 0.1,
    v: 0.14,
    target: [0.09, 0.11, 0.045],
    pin: true,
  });
});
test("explicit keep survives suspension, with no automatic keep for the other hand", () => {
  const { sent, hands } = fixture();
  hands.begin(1, 1, pick, { x: 0, y: 0 });
  hands.begin(2, 2, pick, { x: 0, y: 0 });
  hands.keepSelected();
  hands.finishAll([
    { ...pin, id: 1, pin: false },
    { ...pin, id: 2, pin: false },
  ]);
  assert.deepEqual(sent.slice(-2), [
    { op: "release", id: 1 },
    { op: "grip", id: 2, u: 0.1, v: 0.14, target: pin.p, pin: true },
  ]);
});
test("height adjustment is independent of planar motion, bounded and reversible", () => {
  const { sent, hands } = fixture();
  hands.begin(1, 1, pick, { x: 0, y: 0 });
  hands.setHeight(1, 0.09);
  hands.move(1, [0.02, -0.02, 0], 50);
  assert.equal((sent.at(-1) as any).target[2], 0.09);
  hands.setHeight(1, 5);
  assert.equal((sent.at(-1) as any).target[2], MAX_HEIGHT);
  hands.setHeight(1, -1);
  assert.equal((sent.at(-1) as any).target[2], DESK_HEIGHT);
});
test("stationary pressure targets the desk on touch down, and does not leave a pin", () => {
  const { sent, hands } = fixture();
  hands.begin(1, 7, pick, { x: 0, y: 0 }, true, pin);
  assert.deepEqual(sent[0], {
    op: "grip",
    id: 7,
    u: 0.1,
    v: 0.14,
    target: [0.08, 0.1, DESK_HEIGHT],
    press: true,
  });
  hands.setHeight(7, 0.1);
  assert.equal(sent.length, 1);
  hands.move(1, [0, 0, 0], 0, { ...pick, p: [0.03, 0.02, 0.05] });
  assert.equal((sent.at(-1) as any).target[2], DESK_HEIGHT);
  hands.finish(1, [pin]);
  assert.deepEqual(sent.at(-1), { op: "release", id: 7 });
});
