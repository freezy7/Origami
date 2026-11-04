/** Input math shared by touch, device motion and the authored fold player. */
import { Face, Fold, Point } from "./PaperModel";
export type XY = { x: number; y: number };
export const clamp = (v: number, lo = 0, hi = 1): number =>
  Math.max(lo, Math.min(hi, v));
export function distanceToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = dx * dx + dy * dy;
  const t = len > 1e-8 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function foldGrip(faces: Face[], action: Fold): Point {
  const dx = action.b[0] - action.a[0],
    dy = action.b[1] - action.a[1];
  let best = faces[0].vertices[0],
    score = -Infinity;
  for (const f of faces)
    for (const p of f.vertices) {
      const d =
        (dx * (p.y - action.a[1]) - dy * (p.x - action.a[0])) * action.side;
      if (d > score + 1e-7 || (Math.abs(d - score) < 1e-7 && p.z > best.z)) {
        score = d;
        best = p;
      }
    }
  return { ...best };
}
export function creaseSegment(
  faces: Face[],
  action: Fold,
): [Point, Point] | null {
  const dx = action.b[0] - action.a[0],
    dy = action.b[1] - action.a[1],
    points: Point[] = [];
  for (const face of faces)
    for (let i = 0; i < face.vertices.length; i++) {
      const p = face.vertices[i],
        q = face.vertices[(i + 1) % face.vertices.length];
      const dp = dx * (p.y - action.a[1]) - dy * (p.x - action.a[0]),
        dq = dx * (q.y - action.a[1]) - dy * (q.x - action.a[0]);
      if (Math.abs(dp) < 1e-7) points.push({ ...p });
      if (dp * dq < 0) {
        const t = dp / (dp - dq);
        points.push({
          x: p.x + (q.x - p.x) * t,
          y: p.y + (q.y - p.y) * t,
          z: p.z + (q.z - p.z) * t,
        });
      }
    }
  if (points.length < 2) return null;
  points.sort((p, q) => (p.x - q.x) * dx + (p.y - q.y) * dy);
  return [points[0], points[points.length - 1]];
}
/** Signed projection: perpendicular/wrong-way motion cannot complete a fold; pulling back reverses it. */
export function dragProgress(
  start: XY,
  now: XY,
  direction: XY,
  travel: number,
): number {
  const len = Math.hypot(direction.x, direction.y);
  if (len < 1e-5 || travel < 1) return 0;
  return clamp(
    ((now.x - start.x) * direction.x + (now.y - start.y) * direction.y) /
      (len * travel),
  );
}
export type DeviceSample = {
  tiltAvailable: boolean;
  hingeAvailable: boolean;
  active: boolean;
  age: number;
  pitch: number;
  roll: number;
  hinge: number | null;
};
export const NO_DEVICE: DeviceSample = {
  tiltAvailable: false,
  hingeAvailable: false,
  active: false,
  age: 999,
  pitch: 0,
  roll: 0,
  hinge: null,
};
export type MotionMode = "touch" | "tilt" | "hinge";
const delta = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
export class MotionFold {
  private baseline: DeviceSample | null = null;
  private axis: XY = { x: 0, y: 1 };
  private settled = 0;
  progress = 0;
  mode: MotionMode = "touch";
  get armed(): boolean {
    return this.baseline !== null;
  }
  cancel(): void {
    this.baseline = null;
    this.progress = 0;
    this.settled = 0;
  }
  arm(mode: MotionMode, s: DeviceSample, axis: XY): boolean {
    this.cancel();
    this.mode = mode;
    if (!this.usable(mode, s)) return false;
    const length = Math.hypot(axis.x, axis.y);
    this.axis =
      length > 1e-5
        ? { x: axis.x / length, y: axis.y / length }
        : { x: 0, y: 1 };
    this.baseline = { ...s };
    return true;
  }
  private usable(mode: MotionMode, s: DeviceSample): boolean {
    return mode === "tilt"
      ? s.tiltAvailable &&
          s.active &&
          s.age < 0.4 &&
          Number.isFinite(s.pitch) &&
          Number.isFinite(s.roll)
      : mode === "hinge"
        ? s.hingeAvailable && s.hinge !== null && Number.isFinite(s.hinge)
        : false;
  }
  update(s: DeviceSample, dt: number): "idle" | "moving" | "complete" | "lost" {
    if (!this.baseline) return "idle";
    if (!this.usable(this.mode, s)) {
      this.cancel();
      return "lost";
    }
    const raw =
      this.mode === "hinge"
        ? (this.baseline.hinge! - s.hinge!) / ((Math.PI * 55) / 180)
        : (delta(s.roll, this.baseline.roll) * this.axis.x +
            delta(s.pitch, this.baseline.pitch) * this.axis.y) /
          ((Math.PI * 32) / 180);
    const target = clamp((raw - 0.045) / 0.955);
    this.progress +=
      (target - this.progress) *
      (1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * 12));
    if (this.progress > 0.93) this.settled += Math.max(0, Math.min(dt, 0.1));
    else if (this.progress < 0.87) this.settled = 0;
    return this.settled >= 0.28 ? "complete" : "moving";
  }
}
