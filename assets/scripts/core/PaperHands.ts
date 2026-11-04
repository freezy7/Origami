/** Touch ownership and continuous targets; no authored crease or fold angle. */
export type Position = [number, number, number];
export type GripPick = { uv: { x: number; y: number }; p: Position };
export type PaperAnchor = {
  id: number;
  p: Position;
  uv: [number, number];
  pin: boolean;
  press: boolean;
};
export type PaperCommand =
  | {
      op: "grip";
      id: number;
      u: number;
      v: number;
      target: Position;
      pin?: boolean;
      press?: boolean;
    }
  | { op: "move"; id: number; target: Position }
  | { op: "release"; id: number };
export type Hand = {
  finger: number;
  id: number;
  pick: GripPick;
  start: { x: number; y: number };
  target: Position;
  keep: boolean;
  press: boolean;
  height: number | null;
};
export const DESK_HEIGHT = 0.000075;
export const MAX_HEIGHT = 0.2;
const boundedHeight = (z: number) =>
  Math.max(DESK_HEIGHT, Math.min(MAX_HEIGHT, z));
export class PaperHands {
  readonly hands = new Map<number, Hand>();
  selected: number | null = null;
  constructor(private send: (command: PaperCommand) => void) {}
  begin(
    finger: number,
    id: number,
    pick: GripPick,
    start: { x: number; y: number },
    press = false,
    pin?: PaperAnchor,
  ): boolean {
    if (
      this.hands.has(finger) ||
      this.hands.size >= 2 ||
      Array.from(this.hands.values()).some((h) => h.id === id)
    )
      return false;
    const origin: GripPick = pin
      ? { uv: { x: pin.uv[0], y: pin.uv[1] }, p: [...pin.p] }
      : pick;
    const target: Position = [
      origin.p[0],
      origin.p[1],
      press ? DESK_HEIGHT : origin.p[2],
    ];
    this.send({
      op: "grip",
      id,
      u: origin.uv.x,
      v: origin.uv.y,
      target,
      press,
    });
    this.hands.set(finger, {
      finger,
      id,
      pick: origin,
      start,
      target,
      keep: !!pin,
      press,
      height: null,
    });
    this.selected = id;
    return true;
  }
  move(
    finger: number,
    delta: Position,
    distance: number,
    brush?: GripPick,
  ): void {
    const h = this.hands.get(finger);
    if (!h) return;
    if (h.press) {
      if (!brush) return;
      h.pick = brush;
      h.target = [brush.p[0], brush.p[1], DESK_HEIGHT];
      this.send({
        op: "grip",
        id: h.id,
        u: brush.uv.x,
        v: brush.uv.y,
        target: h.target,
        press: true,
      });
    } else {
      // A small, reversible pickup assists a flat sheet. Height becomes explicit
      // once the rail is used; planar dragging never changes it after that.
      const z = h.height ?? h.pick.p[2] + Math.min(0.025, distance * 0.00045);
      h.target = [
        h.pick.p[0] + delta[0],
        h.pick.p[1] + delta[1],
        boundedHeight(z),
      ];
      this.send({ op: "move", id: h.id, target: h.target });
    }
  }
  setHeight(id: number, z: number): void {
    const h = Array.from(this.hands.values()).find(
      (h) => h.id === id && !h.press,
    );
    if (!h) return;
    h.height = boundedHeight(z);
    h.target = [h.target[0], h.target[1], h.height];
    this.send({ op: "move", id, target: h.target });
  }
  keepSelected(): void {
    const h = Array.from(this.hands.values()).find(
      (h) => h.id === this.selected,
    );
    if (h && !h.press) h.keep = true;
  }
  finish(finger: number, anchors: PaperAnchor[]): void {
    const h = this.hands.get(finger);
    if (!h) return;
    const actual = anchors.find((a) => a.id === h.id);
    if (h.keep && !h.press && actual) {
      this.send({
        op: "grip",
        id: h.id,
        u: h.pick.uv.x,
        v: h.pick.uv.y,
        target: [...actual.p],
        pin: true,
      });
    } else this.send({ op: "release", id: h.id });
    this.hands.delete(finger);
    if (this.selected === h.id && (!h.keep || h.press))
      this.selected = Array.from(this.hands.values()).slice(-1)[0]?.id ?? null;
  }
  finishAll(anchors: PaperAnchor[]): void {
    for (const finger of Array.from(this.hands.keys()))
      this.finish(finger, anchors);
  }
}
