/** User-defined rigid panel folds. Geometric constraints, not a calibrated shell solver. */
import {findFoldLock,FoldLock} from './PaperContacts';
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
  allLayers?: boolean;
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
// Affine material coordinates also allow hinge endpoints outside a panel.
function mapPoint(f: Panel, p: V3, inverse = false): V3 {
  const a = f.points[0];
  for (let i = 1; i < f.points.length - 1; i++) {
    const b = f.points[i], c = f.points[i + 1];
    const source = (q: PaperPoint): V3 => inverse ? q.p : [q.uv[0], q.uv[1], 0];
    const target = (q: PaperPoint): V3 => inverse ? [q.uv[0], q.uv[1], 0] : q.p;
    const x = sub(source(b), source(a)), y = sub(source(c), source(a));
    const r = sub(p, source(a)), xx = dot(x,x), yy = dot(y,y), xy = dot(x,y);
    const det = xx * yy - xy * xy;
    if (Math.abs(det) < 1e-18) continue;
    const u = (dot(r,x)*yy-dot(r,y)*xy)/det;
    const v = (dot(r,y)*xx-dot(r,x)*xy)/det;
    return add(target(a), add(mul(sub(target(b),target(a)),u), mul(sub(target(c),target(a)),v)));
  }
  throw Error("退化纸面，不能恢复折轴");
}
const centerUV = (f: Panel): [number, number] => [
  f.points.reduce((s,p)=>s+p.uv[0],0)/f.points.length,
  f.points.reduce((s,p)=>s+p.uv[1],0)/f.points.length,
];
export class FreePaper {
  private contactPanels:Panel[]|null=null;
  private contactLocks:{[index:number]:FoldLock|null}={};
  panels: Panel[] = [];
  crease: Crease | null = null;
  turn: Turn | null = null;
  folds = 0;
  records: Turn[] = [];
  private committed = false;
  private origin: Panel[] | null = null;
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
    this.origin = null;
    this.records = [];
    this.committed = false;
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
    this.committed = false;
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
    this.committed = false;
    this.turn = {
      base: fragments,
      moving: Array.from(moving),
      crease: clone(c),
      angle: 0,
      grab: clone(hit.point),
      allLayers,
    };
    this.preview(0);
  }
  preview(angle: number): void {
    const t = this.turn;
    if (!t) return;
    if (this.committed) { this.editFold(this.records.length - 1, angle); return; }
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
    if (this.turn && !this.committed && Math.abs(this.turn.angle) > 0.01) {
      if (this.records.length >= 64) throw Error("已达 64 条折痕，请另存纸形后开始新纸");
      this.records.push(clone(this.turn));
      this.folds++;
      this.committed = true;
    }
  }
  /** Replay hinges on the final material topology; later folds travel with their parent face. */
  editFold(index: number, angle: number): void {
    if (!Number.isFinite(angle) || !this.records[index]) throw Error("折角或折痕无效");
    const angles = this.records.map(t => t.angle);
    angles[index] = Math.max(-Math.PI, Math.min(Math.PI, angle));
    if(Math.abs(angles[index]-this.records[index].angle)<1e-10)return;
    const lock=this.foldLock(index);
    if(lock)throw Error(`折痕 ${index+1} 被折痕 ${lock.blockedBy+1} 的闭合叠层压住，联动受限；请先展开覆盖折痕，不能单独调角`);
    this.replay(angles);
  }
  foldLock(index:number):FoldLock|null {
    if(this.contactPanels!==this.panels){this.contactPanels=this.panels;this.contactLocks={};}
    if(!(index in this.contactLocks))this.contactLocks[index]=findFoldLock(this.physicalPanels(),this.records,index);
    return this.contactLocks[index];
  }
  creaseSegments(index: number): [V3, V3][] {
    const t = this.records[index];
    if (!t) return [];
    const axis = unit(sub(t.crease.b,t.crease.a));
    const edges: [PaperPoint, PaperPoint][] = [];
    for (const f of t.base.filter(f => t.moving.indexOf(f.id) !== -1))
      f.points.forEach((a,i) => {
        const b = f.points[(i+1)%f.points.length];
        if (norm(cross(sub(a.p,t.crease.a),axis)) < 1e-7 && norm(cross(sub(b.p,t.crease.a),axis)) < 1e-7)
          edges.push([a,b]);
      });
    const out: [V3,V3][] = [];
    for (const f of this.panels) f.points.forEach((a,i) => {
      const b = f.points[(i+1)%f.points.length];
      if (edges.some(([c,d]) => overlap(a,b,c,d))) out.push([a.p,b.p]);
    });
    return out;
  }
  setAngles(angles: number[]): void {
    if (angles.length!==this.records.length || !angles.every(a=>Number.isFinite(a) && Math.abs(a)<=Math.PI)) throw Error("折角序列无效");
    this.replay(angles);
  }
  unfoldAll(): void { this.replay(this.records.map(() => 0)); }
  unfoldFrom(index: number): void {
    if (!Number.isInteger(index) || !this.records[index]) throw Error("请选择要展开的折痕");
    this.replay(this.records.map((t,i) => i >= index ? 0 : t.angle));
  }
  physicalPanels(): Panel[] {
    let order=this.panels.slice();
    const canonical=(n:V3):V3=>{
      const i=Math.abs(n[0])>=Math.abs(n[1])&&Math.abs(n[0])>=Math.abs(n[2])?0:Math.abs(n[1])>=Math.abs(n[2])?1:2;
      return n[i]<0?mul(n,-1):n;
    };
    for(const t of this.records) {
      if(Math.abs(t.angle)<1e-6)continue;
      const regions=t.base.filter(f=>t.moving.indexOf(f.id)!==-1);
      const ref=regions.find(f=>contains(f,t.grab.uv));if(!ref)continue;
      const axis=unit(sub(t.crease.b,t.crease.a)),n=canonical(panelNormal(ref));
      const transformed=rotate(n,{a:[0,0,0],b:axis,normal:n},t.angle),next=canonical(transformed);
      const moving=order.filter(f=>regions.some(g=>contains(g,centerUV(f)))),still=order.filter(f=>!regions.some(g=>contains(g,centerUV(f))));
      if(dot(transformed,next)<0)moving.reverse();
      const above=dot(cross(axis,sub(t.grab.p,t.crease.a)),n)*t.angle>=0;
      order=above?still.concat(moving):moving.concat(still);
    }
    return order;
  }
  foldPose(index: number): Turn {
    if (!this.records[index]) throw Error("请选择折痕");
    const pose=this.replay(this.records.map(t=>t.angle),index);
    if (!pose) throw Error("折痕状态不可用");
    return pose;
  }
  /** Change an authored hinge in material space and rebuild downstream cuts atomically. */
  moveAxis(index: number, a: [number,number], b: [number,number]): void {
    if (!this.records[index] || ![...a,...b].every(Number.isFinite) || Math.hypot(a[0]-b[0],a[1]-b[1])<.008)
      throw Error("折轴端点无效，需至少相距 8 mm");
    const lock=this.foldLock(index);
    if(lock)throw Error(`折痕 ${index+1} 被折痕 ${lock.blockedBy+1} 的闭合叠层压住，联动受限；请先展开覆盖折痕，不能单独改轴`);
    const candidate=new FreePaper();
    candidate.origin=clone(this.origin);
    if (this.origin) candidate.panels=clone(this.origin);
    for (let i=0;i<this.records.length;i++) {
      const t=this.records[i];
      const ref=t.base.find(f=>t.moving.indexOf(f.id)!==-1 && contains(f,t.grab.uv));
      if (!ref) throw Error("折轴缺少材料参考");
      // A recorded grip can sit exactly on an earlier crease. Picking the
      // topmost face there may select the opposite, already folded side and
      // mirror every later axis. Follow the recorded material region instead.
      const hit=candidate.pointAt(centerUV(ref)) ?? candidate.pointAt(t.grab.uv);
      if (!hit) throw Error("折轴改位后找不到原抓点");
      const uvA=i===index ? [a[0],a[1],0] as V3 : mapPoint(ref,t.crease.a,true);
      const uvB=i===index ? [b[0],b[1],0] as V3 : mapPoint(ref,t.crease.b,true);
      const normal=mul(panelNormal(hit.panel),Math.sign(dot(panelNormal(ref),t.crease.normal))||1);
      const c: Crease={a:mapPoint(hit.panel,uvA),b:mapPoint(hit.panel,uvB),normal};
      candidate.setCrease(c.a,c.b,c.normal);
      const n=cross(unit(sub(t.crease.b,t.crease.a)),t.crease.normal);
      const side=Math.sign(dot(sub(t.grab.p,t.crease.a),n));
      const positive=t.base.filter(f=>dot(sub(f.points[0].p,t.crease.a),n)*side>=-E && f.points.some(p=>dot(sub(p.p,t.crease.a),n)*side>E));
      const all=t.allLayers ?? positive.every(f=>t.moving.indexOf(f.id)!==-1);
      try {candidate.begin(t.grab.uv,all);} catch(error) {throw Error(`折痕 ${i+1} 无法随改轴重建：${String(error)}`);}
      candidate.preview(t.angle);
      // A fully opened precrease is still an authored hinge.
      candidate.records.push(clone(candidate.turn!));
      candidate.committed=true;
    }
    candidate.folds=this.folds;
    // Replaying verifies shared material points, including newly-created T junctions.
    candidate.replay(candidate.records.map(t=>t.angle));
    this.panels=candidate.panels;this.records=candidate.records;
    this.turn=candidate.turn;this.crease=candidate.crease;this.committed=true;
  }
  moveAxisWorld(index: number, a: V3, b: V3): void {
    const pose=this.foldPose(index);
    const ref=pose.base.find(f=>pose.moving.indexOf(f.id)!==-1 && contains(f,pose.grab.uv));
    if (!ref) throw Error("折轴缺少参考面");
    const uvA=mapPoint(ref,a,true),uvB=mapPoint(ref,b,true);
    this.moveAxis(index,[uvA[0],uvA[1]],[uvB[0],uvB[1]]);
  }
  private replay(angles: number[], inspect = -1): Turn | null {
    if (!this.records.length) return null;
    const panels = clone(this.panels);
    panels.forEach(f => f.points.forEach(p => {
      const source = this.origin?.find(g => contains(g, p.uv));
      p.p = source ? mapPoint(source, [p.uv[0],p.uv[1],0]) : [p.uv[0], p.uv[1], 0];
    }));
    let latest: Turn | null = null, inspected: Turn | null = null;
    for (let i = 0; i < this.records.length; i++) {
      const t = this.records[i];
      const ref = t.base.find(f => t.moving.indexOf(f.id) !== -1 && contains(f, t.grab.uv));
      if (!ref) throw Error("折痕缺少参考纸面");
      const current = panels.find(f => contains(ref, centerUV(f)));
      if (!current) throw Error("折痕参考纸面丢失");
      const transform = (p: V3) => mapPoint(current, mapPoint(ref, p, true));
      const crease: Crease = { a: transform(t.crease.a), b: transform(t.crease.b), normal: panelNormal(current) };
      const regions = t.base.filter(f => t.moving.indexOf(f.id) !== -1);
      const moving = panels.filter(f => regions.some(g => contains(g, centerUV(f)))).map(f => f.id);
      latest = { base: clone(panels), moving, crease, angle: angles[i], grab: {uv: [...t.grab.uv], p: transform(t.grab.p)} };
      if (i===inspect) inspected=clone(latest);
      panels.forEach(f => { if (moving.indexOf(f.id) !== -1) f.points.forEach(p => p.p = rotate(p.p, crease, angles[i])); });
    }
    // Reject incompatible hinge networks atomically, including T junctions.
    for (const f of panels) for (const g of panels) {
      if (f === g) continue;
      for (const p of f.points) if (contains(g, p.uv)) {
        if (norm(sub(mapPoint(g, [p.uv[0],p.uv[1],0]), p.p)) > 1e-6)
          throw Error("这条折痕与后续折叠联动受限，请先展开相关后续折痕再调整");
      }
    }
    if (inspect>=0) return inspected;
    this.records.forEach((t,i) => t.angle = angles[i]);
    this.panels = panels;
    this.turn = latest;
    this.crease = latest!.crease;
    this.committed = true;
    return latest;
  }
  save(): string {
    return JSON.stringify({
      version: 1,
      kind: "free-paper-panels",
      panels: this.panels,
      crease: this.crease,
      turn: this.turn,
      folds: this.folds,
      records: this.records,
      origin: this.origin,
      committed: this.committed,
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
    if (q.records !== undefined && (!Array.isArray(q.records) || q.records.length > 64))
      throw Error("折痕记录损坏");
    for (const t of q.records ?? []) {
      if (!t || !validPanels(t.base) || !validCrease(t.crease) || !Array.isArray(t.moving) ||
          !t.moving.length || t.moving.some((id: number) => !t.base.some((f: Panel) => f.id === id)) ||
          !Number.isFinite(t.angle) || Math.abs(t.angle) > Math.PI ||
          !t.grab || !Array.isArray(t.grab.uv) || t.grab.uv.length !== 2 || !t.grab.uv.every(Number.isFinite) ||
          !Array.isArray(t.grab.p) || t.grab.p.length !== 3 || !t.grab.p.every(Number.isFinite))
        throw Error("折痕记录损坏");
    }
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
    if (q.origin && !validPanels(q.origin)) throw Error("初始纸形损坏");
    candidate.records = clone(q.records ?? (q.turn ? [q.turn] : []));
    candidate.origin = clone(q.origin ?? (q.records === undefined ? (q.turn?.base ?? q.panels) : null));
    candidate.committed = q.committed ?? !!candidate.records.length;
    if (candidate.committed && !candidate.records.length) throw Error("折痕记录缺失");
    if (candidate.records.length && candidate.committed) {
      const expected = clone(candidate.panels);
      candidate.replay(candidate.records.map(t => t.angle));
      for (const f of expected) for (const p of f.points) {
        const actual = candidate.pointAt(p.uv);
        if (!actual || norm(sub(actual.point.p,p.p)) > 1e-6) throw Error("折痕与纸形不一致");
      }
      // Preserve exact serialized geometry and the active turn for stable round trips.
      candidate.panels = clone(q.panels);
      candidate.turn = q.turn ? clone(q.turn) : null;
      candidate.crease = q.crease ? clone(q.crease) : null;
    }
    this.origin = candidate.origin;
    this.records = candidate.records;
    this.committed = candidate.committed;
    this.panels = candidate.panels;
    this.crease = candidate.crease;
    this.turn = candidate.turn;
    this.folds = candidate.folds;
  }
}
