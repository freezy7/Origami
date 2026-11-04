/** User-defined rigid panel folds. Geometric constraints, not a calibrated shell solver. */
export type V3 = [number, number, number];
export type PaperPoint = { p: V3; uv: [number, number] };
export type Panel = { id: number; points: PaperPoint[] };
export type Crease = { a: V3; b: V3; normal: V3 };
export type Turn = {
  base: Panel[];
  moving: number[];
  crease: Crease;
  angle: number;
  grab: PaperPoint;
};
export function creaseBetween(grab: V3, target: V3, normal: V3): Crease {
  const delta = sub(target, grab),
    n = unit(normal);
  if (norm(delta) < 0.002) throw Error("把纸角稍微拖远一些");
  const a = mul(add(grab, target), 0.5),
    axis = unit(cross(n, delta));
  return { a, b: add(a, mul(axis, 0.2)), normal: n };
}
const E = 1e-8;
export const add = (a: V3, b: V3): V3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub = (a: V3, b: V3): V3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: V3) => Math.hypot(...a);
export const unit = (a: V3): V3 => {
  const n = norm(a);
  if (n < 1e-14) throw Error("折线太短，请重新压线");
  return mul(a, 1 / n);
};
export const rotate = (p: V3, c: Crease, angle: number): V3 => {
  const u = unit(sub(c.b, c.a)),
    r = sub(p, c.a),
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  return add(
    c.a,
    add(add(mul(r, cos), mul(cross(u, r), sin)), mul(u, dot(u, r) * (1 - cos))),
  );
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const panelNormal = (f: Panel): V3 => {
  for (let i = 1; i < f.points.length - 1; i++) {
    const n = cross(
      sub(f.points[i].p, f.points[0].p),
      sub(f.points[i + 1].p, f.points[0].p),
    );
    if (norm(n) > 1e-12) return unit(n);
  }
  throw Error("退化纸面");
};
export function materialArea(f: Panel): number {
  return (
    Math.abs(
      f.points.reduce((a, p, i) => {
        const q = f.points[(i + 1) % f.points.length];
        return a + p.uv[0] * q.uv[1] - p.uv[1] * q.uv[0];
      }, 0),
    ) / 2
  );
}
const interp = (a: PaperPoint, b: PaperPoint, t: number): PaperPoint => ({
  p: add(a.p, mul(sub(b.p, a.p), t)),
  uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t],
});
function clip(f: Panel, c: Crease, side: number): PaperPoint[] {
  const n = cross(unit(sub(c.b, c.a)), c.normal),
    out: PaperPoint[] = [];
  for (let i = 0; i < f.points.length; i++) {
    const a = f.points[i],
      b = f.points[(i + 1) % f.points.length],
      da = dot(sub(a.p, c.a), n) * side,
      db = dot(sub(b.p, c.a), n) * side;
    if (da >= -E) out.push(clone(a));
    if ((da > E && db < -E) || (da < -E && db > E))
      out.push(interp(a, b, da / (da - db)));
  }
  return out.filter(
    (p, i) => norm(sub(p.p, out[(i + out.length - 1) % out.length].p)) > E,
  );
}
function overlap(
  a: PaperPoint,
  b: PaperPoint,
  c: PaperPoint,
  d: PaperPoint,
): boolean {
  const x = b.uv[0] - a.uv[0],
    y = b.uv[1] - a.uv[1],
    l = x * x + y * y;
  if (l < 1e-18) return false;
  if (
    Math.abs(x * (c.uv[1] - a.uv[1]) - y * (c.uv[0] - a.uv[0])) >
      1e-8 * Math.sqrt(l) ||
    Math.abs(x * (d.uv[1] - a.uv[1]) - y * (d.uv[0] - a.uv[0])) >
      1e-8 * Math.sqrt(l)
  )
    return false;
  const t = (p: PaperPoint) =>
    ((p.uv[0] - a.uv[0]) * x + (p.uv[1] - a.uv[1]) * y) / l;
  return (
    (Math.min(1, Math.max(t(c), t(d))) - Math.max(0, Math.min(t(c), t(d)))) *
      Math.sqrt(l) >
    1e-8
  );
}
function adjacent(a: Panel, b: Panel): boolean {
  return a.points.some((p, i) =>
    b.points.some((q, j) =>
      overlap(
        p,
        a.points[(i + 1) % a.points.length],
        q,
        b.points[(j + 1) % b.points.length],
      ),
    ),
  );
}
function contains(f: Panel, uv: [number, number]): boolean {
  let sign = 0;
  for (let i = 0; i < f.points.length; i++) {
    const a = f.points[i].uv,
      b = f.points[(i + 1) % f.points.length].uv,
      d = (b[0] - a[0]) * (uv[1] - a[1]) - (b[1] - a[1]) * (uv[0] - a[0]);
    if (Math.abs(d) < 1e-10) continue;
    const s = Math.sign(d);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
export class FreePaper {
  panels: Panel[] = [];
  crease: Crease | null = null;
  turn: Turn | null = null;
  folds = 0;
  constructor() {
    this.reset();
  }
  reset(): void {
    this.panels = [
      {
        id: 0,
        points: [
          [-0.105, -0.1485],
          [0.105, -0.1485],
          [0.105, 0.1485],
          [-0.105, 0.1485],
        ].map(([u, v]) => ({ uv: [u, v], p: [u, v, 0] })),
      },
    ];
    this.crease = null;
    this.turn = null;
    this.folds = 0;
  }
  pointAt(uv: [number, number]): { point: PaperPoint; panel: Panel } | null {
    for (let j = this.panels.length - 1; j >= 0; j--) {
      const f = this.panels[j];
      if (!contains(f, uv)) continue;
      for (let i = 1; i < f.points.length - 1; i++) {
        const a = f.points[0],
          b = f.points[i],
          c = f.points[i + 1],
          dx = b.uv[0] - a.uv[0],
          dy = b.uv[1] - a.uv[1],
          ex = c.uv[0] - a.uv[0],
          ey = c.uv[1] - a.uv[1],
          det = dx * ey - dy * ex;
        if (Math.abs(det) < 1e-14) continue;
        const x = uv[0] - a.uv[0],
          y = uv[1] - a.uv[1],
          s = (x * ey - y * ex) / det,
          t = (dx * y - dy * x) / det;
        if (s >= -E && t >= -E && s + t <= 1 + E)
          return {
            point: {
              uv: [...uv],
              p: add(a.p, add(mul(sub(b.p, a.p), s), mul(sub(c.p, a.p), t))),
            },
            panel: f,
          };
      }
    }
    return null;
  }
  setCrease(a: V3, b: V3, normal: V3): void {
    if (
      ![a, b, normal].every((v) => v.length === 3 && v.every(Number.isFinite))
    )
      throw Error("折线坐标无效");
    if (norm(sub(b, a)) < 0.008) throw Error("请压出至少 8 mm 长的折线");
    this.crease = { a: [...a], b: [...b], normal: unit(normal) };
    this.turn = null;
  }
  begin(uv: [number, number], allLayers = false): void {
    const c = this.crease;
    if (!c) throw Error("先按住 Shift 划出折线，再抓一侧纸张翻折");
    const hit = this.pointAt(uv);
    if (!hit) throw Error("没有抓到纸张");
    const n = cross(unit(sub(c.b, c.a)), c.normal),
      side = Math.sign(dot(sub(hit.point.p, c.a), n));
    if (Math.abs(dot(sub(hit.point.p, c.a), n)) < 0.003)
      throw Error("请抓离折线稍远的纸角或边缘");
    const fragments: Panel[] = [],
      positive: number[] = [];
    let id = 0;
    for (const f of this.panels) {
      if (f.points.every((p) => Math.abs(dot(sub(p.p, c.a), n)) < E)) {
        fragments.push({ id: id++, points: clone(f.points) });
        continue;
      }
      for (const s of [-side, side]) {
        const points = clip(f, c, s);
        const part = { id: id++, points };
        if (points.length >= 3 && materialArea(part) > 1e-12) {
          fragments.push(part);
          if (s === side) positive.push(part.id);
        }
      }
    }
    const seed = fragments.find(
      (f) => positive.indexOf(f.id) !== -1 && contains(f, uv),
    );
    if (!seed) throw Error("无法确定要翻起的纸层");
    const moving = new Set<number>(allLayers ? positive : [seed.id]);
    if (!allLayers) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of fragments)
          if (
            positive.indexOf(f.id) !== -1 &&
            !moving.has(f.id) &&
            fragments.some((g) => moving.has(g.id) && adjacent(f, g))
          ) {
            moving.add(f.id);
            changed = true;
          }
      }
    }
    if (!moving.size || moving.size === fragments.length)
      throw Error("折线需要穿过纸张，压住一侧才能翻折");
    const axis = unit(sub(c.b, c.a));
    // A rotating region can only stay connected across the actual hinge axis.
    for (const f of fragments.filter((f) => moving.has(f.id)))
      for (const g of fragments.filter((g) => !moving.has(g.id)))
        for (let i = 0; i < f.points.length; i++)
          for (let j = 0; j < g.points.length; j++)
            if (
              overlap(
                f.points[i],
                f.points[(i + 1) % f.points.length],
                g.points[j],
                g.points[(j + 1) % g.points.length],
              )
            ) {
              const a = f.points[i],
                b = f.points[(i + 1) % f.points.length];
              if (
                norm(cross(sub(a.p, c.a), axis)) > 1e-6 ||
                norm(cross(sub(b.p, c.a), axis)) > 1e-6
              )
                throw Error("这处翻折会牵扯已立起的纸面，请先放平相关纸面");
            }
    if (
      fragments.length > 256 ||
      fragments.reduce((s, f) => s + f.points.length, 0) > 1200
    )
      throw Error("本轮纸面细分已到上限，请撤销一折");
    this.turn = {
      base: fragments,
      moving: Array.from(moving),
      crease: clone(c),
      angle: 0,
      grab: clone(hit.point),
    };
    this.preview(0);
  }
  preview(angle: number): void {
    const t = this.turn;
    if (!t) return;
    if (!Number.isFinite(angle)) throw Error("折角无效");
    t.angle = Math.max(-Math.PI, Math.min(Math.PI, angle));
    const still: Panel[] = [],
      moving: Panel[] = [];
    for (const f of t.base) {
      const out = clone(f);
      if (t.moving.indexOf(f.id) !== -1) {
        out.points.forEach((p) => (p.p = rotate(p.p, t.crease, t.angle)));
        moving.push(out);
      } else still.push(out);
    }
    this.panels = still.concat(moving);
  }
  finish(): void {
    if (this.turn && Math.abs(this.turn.angle) > 0.01) this.folds++;
  }
  save(): string {
    return JSON.stringify({
      version: 1,
      kind: "free-paper-panels",
      panels: this.panels,
      crease: this.crease,
      turn: this.turn,
      folds: this.folds,
    });
  }
  load(raw: string): void {
    if (raw.length > 2_000_000) throw Error("纸形文件过大");
    const q = JSON.parse(raw);
    if (
      q.version !== 1 ||
      q.kind !== "free-paper-panels" ||
      !Array.isArray(q.panels) ||
      q.panels.length < 1 ||
      q.panels.length > 256
    )
      throw Error("不是受支持的自由折纸存档");
    const validPanels = (panels: Panel[]) =>
      Array.isArray(panels) &&
      panels.length > 0 &&
      panels.length <= 256 &&
      panels.reduce(
        (s, f) => s + (Array.isArray(f.points) ? f.points.length : 1201),
        0,
      ) <= 1200 &&
      new Set(panels.map((f) => f.id)).size === panels.length &&
      panels.every(
        (f) =>
          Number.isInteger(f.id) &&
          Array.isArray(f.points) &&
          f.points.length >= 3 &&
          f.points.length <= 64 &&
          f.points.every(
            (p) =>
              Array.isArray(p.p) &&
              p.p.length === 3 &&
              p.p.every((v) => Number.isFinite(v) && Math.abs(v) < 2) &&
              Array.isArray(p.uv) &&
              p.uv.length === 2 &&
              p.uv.every((v) => Number.isFinite(v) && Math.abs(v) < 0.3),
          ) &&
          materialArea(f) > 1e-12 &&
          f.points.every((a, i) => {
            const b = f.points[(i + 1) % f.points.length];
            return (
              Math.abs(
                norm(sub(a.p, b.p)) -
                  Math.hypot(a.uv[0] - b.uv[0], a.uv[1] - b.uv[1]),
              ) < 1e-7
            );
          }),
      );
    const validCrease = (c: Crease) =>
      c &&
      [c.a, c.b, c.normal].every(
        (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
      ) &&
      norm(sub(c.b, c.a)) > 0.007 &&
      Math.abs(norm(c.normal) - 1) < 1e-6;
    if (
      !validPanels(q.panels) ||
      Math.abs(
        q.panels.reduce((s: number, f: Panel) => s + materialArea(f), 0) -
          0.21 * 0.297,
      ) > 1e-8 ||
      (q.crease && !validCrease(q.crease)) ||
      !Number.isInteger(q.folds) ||
      q.folds < 0 ||
      q.folds > 10000
    )
      throw Error("纸形几何数据损坏");
    if (
      q.turn &&
      (!validPanels(q.turn.base) ||
        !validCrease(q.turn.crease) ||
        !Array.isArray(q.turn.moving) ||
        !q.turn.moving.length ||
        q.turn.moving.some(
          (id: number) => !q.turn.base.some((f: Panel) => f.id === id),
        ) ||
        !Number.isFinite(q.turn.angle) ||
        Math.abs(q.turn.angle) > Math.PI ||
        !q.turn.grab ||
        !Array.isArray(q.turn.grab.p) ||
        q.turn.grab.p.length !== 3 ||
        !q.turn.grab.p.every(Number.isFinite))
    )
      throw Error("翻折状态损坏");
    // Verify the active operation reproduces the saved geometry before committing.
    const candidate = new FreePaper();
    candidate.panels = clone(q.panels);
    candidate.crease = q.crease ? clone(q.crease) : null;
    candidate.turn = q.turn ? clone(q.turn) : null;
    candidate.folds = q.folds;
    if (candidate.turn) {
      const expected = JSON.stringify(candidate.panels);
      candidate.preview(candidate.turn.angle);
      if (JSON.stringify(candidate.panels) !== expected)
        throw Error("翻折状态与纸形不一致");
    }
    this.panels = candidate.panels;
    this.crease = candidate.crease;
    this.turn = candidate.turn;
    this.folds = candidate.folds;
  }
}
