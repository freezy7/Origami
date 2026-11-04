import {
  _decorator,
  Component,
  view,
  ResolutionPolicy,
  screen,
  Size,
  Camera,
  Color,
  Vec3,
  Quat,
} from "cc";
import { PaperLabView, LabFrame, LAB_SCALE } from "./PaperLabView";
import {
  FreePaper,
  PaperPoint,
  Panel,
  Crease,
  V3,
  add,
  sub,
  mul,
  dot,
  cross,
  norm,
  unit,
  rotate,
  panelNormal,
  materialArea,
  creaseBetween,
} from "./core/FreePaper";
const { ccclass } = _decorator;
const KEY = "origami.web-fold.v1";
type XY = { x: number; y: number };
@ccclass("FreeFoldLab")
export class FreeFoldLab extends Component {
  private model = new FreePaper();
  private paper!: PaperLabView;
  private root!: HTMLElement;
  private stage!: HTMLElement;
  private svg!: SVGSVGElement;
  private h = 390;
  private mode: "fold" | "crease" = "fold";
  private gesture: {
    id: number;
    kind: "line" | "fold" | "auto" | "orbit";
    start: XY;
    last: XY;
    point?: PaperPoint;
    normal?: V3;
    angle?: number;
    sign?: number;
  } | null = null;
  private line: { a: V3; b: V3; normal: V3 } | null = null;
  private lineLocked = false;
  private autoBase: string | null = null;
  private resizeObserver!: ResizeObserver;
  private history: string[] = [];
  private off: (() => void)[] = [];
  private disposed = false;
  private revision = 0;
  start(): void {
    try {
      this.boot();
    } catch (e) {
      this.message(`工作台打开失败：${String(e)}`);
    }
  }
  private boot(): void {
    this.root = document.createElement("div");
    this.root.id = "paper-studio";
    this.root.className = "ready fold-studio";
    this.root.innerHTML = `<header class="studio-header"><div class="brand"><span class="brand-icon">◩</span><div><strong>纸间</strong><small>PAPER STUDIO</small></div></div><span class="edition">自由折叠 · 操作验证版</span><div class="header-actions"><span id="save-state">纸形保存在当前浏览器</span><button data-action="save">保存纸形</button></div></header><main class="studio-main"><section class="paper-workspace" aria-label="三维折纸工作区"><div class="stage-label"><span class="live-dot"></span><span>A4 白纸</span><small>210 × 297 mm</small></div><div class="paper-stage" id="paper-stage" tabindex="0"><svg id="paper-overlay" aria-hidden="true"></svg></div><div class="view-controls"><button data-action="out" title="缩小">−</button><button data-action="view">复位视角</button><button data-action="top">俯视对齐</button><button data-action="in" title="放大">＋</button></div><div class="workspace-tip"><kbd>Shift</kbd> 精确压线 <span>·</span> 拖纸角到落点 <span>·</span> 空白处转视角</div></section><aside class="studio-panel"><div class="panel-heading"><span class="eyebrow">折线，由你的手决定</span><h1>把纸翻过去</h1><p>直接把纸角带到希望对齐的位置。<br>也可以压住折线，慢慢翻起纸面。</p></div><div class="tool-group fold-tools" role="group" aria-label="纸张工具"><button data-mode="fold" aria-pressed="true"><span>↗</span>抓纸翻折</button><button data-mode="crease" aria-pressed="false"><span>╱</span>压住折线</button></div><section class="height-card"><div class="card-title"><label for="fold-angle">当前翻折角度</label><output id="angle-value">拖纸角开始翻折</output></div><input id="fold-angle" type="range" min="-180" max="180" step="1" value="0" disabled aria-label="翻折角度，度"><div class="range-labels"><span>反向翻折</span><span>正向翻折</span></div><p id="fold-hint">直接拖纸角到落点，松手压平；Shift＋划线可锁定折线并控制任意折角。</p><label class="layer-choice"><input id="all-layers" type="checkbox"> 一起翻动重叠纸层</label></section><div class="quick-help"><h2>像手压着纸一样折</h2><p>按住 <kbd>Shift</kbd> 在纸上划线，等于用另一只手压住折线。也可先选“压住折线”。再次点“抓纸翻折”可解除压线。</p><p>抓离折线远一些的纸角拖动。松手保留角度，角度条可以连续微调；靠近 180° 时会对齐压平。</p><p>半透明纸形显示落点。拖动空白处转视角；重新划线后可继续下一折。</p></div><div class="panel-bottom"><p id="paper-message" role="status" aria-live="polite"></p><div class="history-actions"><button data-action="undo">↶ 撤销</button><button data-action="new">＋ 新白纸</button><button data-action="open">展开这一折</button></div><details><summary>纸形文件与验证范围</summary><div class="file-actions"><button data-action="export">导出纸形</button><label class="file-button">导入纸形<input type="file" id="paper-file" accept=".foldpaper,application/json"></label></div><p>本轮验证不拉伸纸面的折叠约束。材料回弹、厚纸层接触与复杂折叠仍需研究。</p><a href="?physics">打开原薄片物理实验</a><output id="paper-stats"></output></details></div></aside></main>`;
    document.body.append(this.root);
    this.stage = this.root.querySelector("#paper-stage")!;
    this.svg = this.root.querySelector("#paper-overlay")!;
    const game = document.getElementById("GameDiv");
    if (!game) throw Error("未找到画布");
    this.stage.prepend(game);
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) this.model.load(saved);
    } catch {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) localStorage.setItem(KEY + ".unreadable", raw);
      } catch {
        /* Browser storage can be unavailable. */
      }
      this.message("上次纸形无法读取，已保留原存档；可以重新导入。");
    }
    this.paper = new PaperLabView(this.node, false);
    this.paper.paper.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.paper.paper.camera.clearColor = new Color().fromHEX("#EEF2E9");
    this.paper.paper.pitch = 35;
    this.paper.paper.yaw = -12;
    this.paper.paper.zoom = 1.04;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);
    this.resize();
    this.render(true);
    this.bind();
    this.message("直接拖动纸角到希望对齐的位置。Shift＋划线可压住精确折线。");
  }
  private on(
    t: EventTarget,
    event: string,
    fn: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    t.addEventListener(event, fn, options);
    this.off.push(() => t.removeEventListener(event, fn, options));
  }
  private bind(): void {
    this.on(this.stage, "contextmenu", (e) => e.preventDefault());
    this.on(this.stage, "pointerdown", (e) => this.down(e as PointerEvent));
    this.on(this.stage, "pointermove", (e) => this.move(e as PointerEvent));
    this.on(this.stage, "pointerup", (e) => this.end(e as PointerEvent, false));
    this.on(this.stage, "pointercancel", (e) =>
      this.end(e as PointerEvent, true),
    );
    this.on(this.stage, "lostpointercapture", (e) =>
      this.end(e as PointerEvent, true),
    );
    this.on(
      this.stage,
      "wheel",
      (e) => {
        const w = e as WheelEvent;
        w.preventDefault();
        if (this.model.turn && w.altKey) {
          this.angle(this.model.turn.angle - w.deltaY * 0.003);
          this.save();
        } else if (this.gesture?.kind === "fold") {
          this.angle(this.model.turn!.angle - w.deltaY * 0.003);
        } else {
          this.paper.paper.zoom = Math.max(
            0.4,
            Math.min(2.5, this.paper.paper.zoom * Math.exp(-w.deltaY * 0.001)),
          );
          this.paper.paper.applyTransform();
          this.paper.redraw();
          this.overlay();
        }
      },
      { passive: false },
    );
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-mode]"))
      this.on(b, "click", () => {
        this.mode = b.dataset.mode as typeof this.mode;
        if (this.mode === "fold") this.lineLocked = false;
        this.message(
          this.mode === "crease"
            ? "在纸面沿想要的折线划过去，随后直接抓纸翻折。"
            : "直接拖纸角到落点；Shift＋划线可以锁住精确折线。",
        );
        this.controls();
      });
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-action]"))
      this.on(b, "click", () => this.action(b.dataset.action!));
    const range = this.root.querySelector<HTMLInputElement>("#fold-angle")!;
    this.on(range, "focus", () => this.checkpoint());
    this.on(range, "pointerdown", () => {
      if (document.activeElement === range) this.checkpoint();
    });
    this.on(range, "input", () => {
      this.angle((Number(range.value) * Math.PI) / 180);
    });
    this.on(range, "change", () => {
      this.save();
    });
    this.on(window, "keydown", (e) => {
      const k = e as KeyboardEvent;
      if (k.target instanceof HTMLInputElement) return;
      if ((k.metaKey || k.ctrlKey) && k.key === "z") {
        k.preventDefault();
        this.action("undo");
      } else if ((k.metaKey || k.ctrlKey) && k.key === "s") {
        k.preventDefault();
        this.save();
      } else if (k.key === "Escape") {
        this.cancel();
      }
    });
    this.on(window, "blur", () => {
      if (this.gesture?.kind === "line") this.cancel();
      else {
        this.gesture = null;
        this.save();
      }
    });
    this.on(window, "pagehide", () => this.save());
    this.on(this.root.querySelector("#paper-file")!, "change", async (e) => {
      const input = e.target as HTMLInputElement,
        file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 2_000_000) throw Error("文件超过 2 MB");
        const candidate = new FreePaper();
        candidate.load(await file.text());
        this.checkpoint();
        this.model = candidate;
        this.revision++;
        this.render(true);
        this.save();
        this.message("纸形与当前折线已恢复。");
      } catch (err) {
        this.message(`没有导入，当前纸形保留：${String(err)}`);
      } finally {
        input.value = "";
      }
    });
  }
  private resize(): void {
    if (!this.paper) return;
    const r = this.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    screen.windowSize = new Size(
      r.width * screen.devicePixelRatio,
      r.height * screen.devicePixelRatio,
    );
    view.setDesignResolutionSize(
      390,
      (390 * r.height) / r.width,
      ResolutionPolicy.FIXED_WIDTH,
    );
    view.resizeWithBrowserSize(true);
    this.h = view.getVisibleSize().height;
    this.paper.screenHeight = this.h;
    this.paper.viewport(0, this.h, this.h, 390, 0);
    this.svg.setAttribute("viewBox", `0 0 390 ${this.h}`);
    this.render(true);
  }
  private point(e: { clientX: number; clientY: number }): XY {
    const r = this.stage.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * 390) / r.width - 195,
      y: this.h / 2 - ((e.clientY - r.top) * this.h) / r.height,
    };
  }
  private project(p: V3): XY {
    return this.paper.project(p, this.node);
  }
  private unproject(p: XY, origin: V3, normal: V3): V3 | null {
    const scale = this.h / (2 * this.paper.paper.camera.orthoHeight),
      inv = Quat.invert(new Quat(), this.paper.paper.rig.rotation),
      base = Vec3.transformQuat(
        new Vec3(),
        new Vec3(p.x / scale, p.y / scale, 0),
        inv,
      ),
      dir = Vec3.transformQuat(new Vec3(), new Vec3(0, 0, 1), inv),
      center = {
        x: -this.paper.paper.surface.position.x,
        y: -this.paper.paper.surface.position.y,
      };
    const a: V3 = [
        (base.x + center.x) / LAB_SCALE,
        (base.y + center.y) / LAB_SCALE,
        base.z / LAB_SCALE,
      ],
      d: V3 = [dir.x, dir.y, dir.z],
      den = dot(d, normal);
    if (Math.abs(den) < 0.15) return null;
    return add(a, mul(d, dot(sub(origin, a), normal) / den));
  }
  private hit(p: XY): { point: PaperPoint; panel: Panel } | null {
    const hit = this.paper.pick(p, this.node);
    return hit ? this.model.pointAt([hit.uv.x, hit.uv.y]) : null;
  }
  private snap(p: XY, origin: V3, normal: V3): V3 | null {
    let best: V3 | null = null,
      distance = 7;
    for (const f of this.model.panels)
      for (let i = 0; i < f.points.length; i++) {
        const a = f.points[i].p,
          b = f.points[(i + 1) % f.points.length].p;
        for (const q of [a, mul(add(a, b), 0.5)]) {
          if (Math.abs(dot(sub(q, origin), normal)) > 1e-6) continue;
          const screen = this.project(q),
            d = Math.hypot(screen.x - p.x, screen.y - p.y);
          if (d < distance) {
            best = q;
            distance = d;
          }
        }
      }
    return best;
  }
  private down(e: PointerEvent): void {
    if (this.gesture) return;
    e.preventDefault();
    this.stage.focus();
    this.stage.setPointerCapture(e.pointerId);
    const p = this.point(e),
      hit = this.hit(p);
    if (e.button === 2 || e.button === 1 || e.altKey || !hit) {
      this.gesture = { id: e.pointerId, kind: "orbit", start: p, last: p };
      return;
    }
    if (e.button !== 0) return;
    if (this.mode === "crease" || e.shiftKey) {
      this.checkpoint();
      const normal = panelNormal(hit.panel);
      const a = this.snap(p, hit.point.p, normal) ?? hit.point.p;
      this.line = { a, b: a, normal };
      this.gesture = {
        id: e.pointerId,
        kind: "line",
        start: p,
        last: p,
        point: hit.point,
        normal,
      };
      this.message("沿想压住的折线划过去；松手后抓纸角翻折。");
      return;
    }
    if (!this.lineLocked) {
      this.checkpoint();
      this.autoBase = this.model.save();
      let grab = hit.point,
        distance = 7;
      for (let i = 0; i < hit.panel.points.length; i++) {
        const a = hit.panel.points[i],
          b = hit.panel.points[(i + 1) % hit.panel.points.length];
        const mid: PaperPoint = {
          p: mul(add(a.p, b.p), 0.5),
          uv: [(a.uv[0] + b.uv[0]) / 2, (a.uv[1] + b.uv[1]) / 2],
        };
        for (const q of [a, mid]) {
          const v = this.project(q.p),
            d = Math.hypot(v.x - p.x, v.y - p.y);
          if (d < distance) {
            distance = d;
            grab = q;
          }
        }
      }
      this.gesture = {
        id: e.pointerId,
        kind: "auto",
        start: p,
        last: p,
        point: grab,
        normal: panelNormal(hit.panel),
      };
      this.message(
        "把纸角拖向希望对齐的位置，折线会随落点变化；松手压平这一折。",
      );
      return;
    }
    try {
      this.checkpoint();
      const t = this.model.turn;
      // Reuse a turn whenever the touched material belongs to its moving region.
      const onMoving =
        t &&
        t.base
          .filter((f) => t.moving.indexOf(f.id) !== -1)
          .some((f) => this.uvInside(f, hit.point.uv));
      if (!onMoving)
        this.model.begin(
          hit.point.uv,
          this.root.querySelector<HTMLInputElement>("#all-layers")!.checked,
        );
      const turn = this.model.turn!,
        grab = onMoving
          ? { ...hit.point, p: rotate(hit.point.p, turn.crease, -turn.angle) }
          : hit.point;
      turn.grab = grab;
      this.gesture = {
        id: e.pointerId,
        kind: "fold",
        start: p,
        last: p,
        point: grab,
        angle: turn.angle,
        sign:
          Math.sign(turn.angle) ||
          Math.sign(
            dot(
              cross(
                unit(sub(turn.crease.b, turn.crease.a)),
                sub(grab.p, turn.crease.a),
              ),
              turn.crease.normal,
            ),
          ) ||
          1,
      };
      this.message(
        "沿纸角的弧线翻过去。半透明轮廓是压平后的落点；松手保留折角。",
      );
      this.render();
    } catch (err) {
      this.history.pop();
      this.message(String(err));
    }
  }
  private uvInside(f: Panel, uv: [number, number]): boolean {
    let s = 0;
    for (let i = 0; i < f.points.length; i++) {
      const a = f.points[i].uv,
        b = f.points[(i + 1) % f.points.length].uv,
        d = (b[0] - a[0]) * (uv[1] - a[1]) - (b[1] - a[1]) * (uv[0] - a[0]);
      if (Math.abs(d) < 1e-10) continue;
      if (s && s !== Math.sign(d)) return false;
      s = Math.sign(d);
    }
    return true;
  }
  private move(e: PointerEvent): void {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    const p = this.point(e);
    if (g.kind === "orbit") {
      this.paper.paper.orbit(p.x - g.last.x, p.y - g.last.y);
      this.paper.redraw();
      this.overlay();
    }
    if (g.kind === "line") {
      const b = this.unproject(p, g.point!.p, g.normal!);
      if (b && this.line) {
        this.line.b = this.snap(p, g.point!.p, g.normal!) ?? b;
        this.overlay();
      }
    }
    if (g.kind === "auto" && this.autoBase) {
      const distance = Math.hypot(p.x - g.start.x, p.y - g.start.y);
      if (distance <= 5 && g.angle !== undefined) {
        this.model.load(this.autoBase);
        g.angle = undefined;
        this.render();
      }
      if (distance > 5) {
        const target = this.unproject(p, g.point!.p, g.normal!);
        const prior = this.model.save();
        if (target)
          try {
            this.model.load(this.autoBase);
            const landed = this.snap(p, g.point!.p, g.normal!) ?? target,
              c = creaseBetween(g.point!.p, landed, g.normal!);
            this.model.setCrease(c.a, c.b, c.normal);
            this.model.begin(
              g.point!.uv,
              this.root.querySelector<HTMLInputElement>("#all-layers")!.checked,
            );
            const sign =
              Math.sign(
                dot(cross(unit(sub(c.b, c.a)), sub(g.point!.p, c.a)), c.normal),
              ) || 1;
            g.angle = sign * Math.PI;
            this.angle(sign * Math.PI * Math.min(1, distance / 24));
          } catch (err) {
            this.model.load(prior);
            this.message(String(err));
          }
      }
    }
    if (g.kind === "fold") {
      const t = this.model.turn!;
      let best = t.angle,
        error = Infinity;
      // Closest point along the actual 3-D hinge arc, with temporal continuity.
      const previous = t.angle;
      for (let i = -180; i <= 180; i++) {
        const a = (i * Math.PI) / 180;
        if (a * g.sign! < -1e-6) continue;
        const q = this.project(rotate(g.point!.p, t.crease, a)),
          d =
            (q.x - p.x) ** 2 +
            (q.y - p.y) ** 2 +
            0.015 * (((a - previous) * 180) / Math.PI) ** 2;
        if (d < error) {
          error = d;
          best = a;
        }
      }
      const displacement = Math.hypot(p.x - g.start.x, p.y - g.start.y);
      // Near a top-down view the two arc directions project onto one another.
      // Start by lifting above the touched face, then preserve that branch.
      if (
        Math.abs(previous) < 0.08 &&
        Math.abs(best) < 0.08 &&
        displacement > 3
      )
        best = 0.08 * g.sign!;
      this.angle(best);
    }
    g.last = p;
  }
  private end(e: PointerEvent, cancelled: boolean): void {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    if (cancelled) {
      this.cancel();
      return;
    }
    this.gesture = null;
    if (g.kind === "line" && this.line) {
      try {
        this.model.setCrease(this.line.a, this.line.b, this.line.normal);
        this.line = null;
        this.mode = "fold";
        this.lineLocked = true;
        this.message("折线已压住。抓一侧纸角，向折线另一侧翻过去。");
        this.save();
      } catch (err) {
        this.line = null;
        this.message(String(err));
      }
    }
    if (g.kind === "auto" && g.angle !== undefined) this.angle(g.angle);
    if (g.kind === "fold" || (g.kind === "auto" && g.angle !== undefined)) {
      this.model.finish();
      this.save();
      this.message(
        Math.abs(this.model.turn!.angle) > 3.12
          ? this.lineLocked
            ? "这一折已压平。再次点“抓纸翻折”可继续自由拖角；角度条可展开检查。"
            : "这一折已压平。继续拖其他纸角可开始下一折；角度条可展开当前一折。"
          : "折角已保留。可以继续拖这一侧，或用角度条调整。",
      );
    }
    if (g.kind === "auto" && g.angle === undefined) {
      const raw = this.history.pop();
      if (raw) this.model.load(raw);
    }
    this.autoBase = null;
    this.render();
  }
  private angle(a: number): void {
    if (!this.model.turn) return;
    const degrees = (a * 180) / Math.PI;
    if (Math.abs(degrees) > 174) a = Math.sign(a) * Math.PI;
    else if (Math.abs(degrees) < 2) a = 0;
    this.model.preview(a);
    this.revision++;
    this.render();
  }
  private checkpoint(): void {
    this.history.push(this.model.save());
    if (this.history.length > 40) this.history.shift();
  }
  private cancel(): void {
    if (!this.gesture) return;
    const kind = this.gesture.kind;
    this.gesture = null;
    this.line = null;
    if (kind !== "orbit") {
      const raw = this.history.pop();
      if (raw) this.model.load(raw);
    }
    this.render();
    this.message("已取消本次操作。");
  }
  private save(): void {
    if (!this.root) return;
    try {
      localStorage.setItem(KEY, this.model.save());
      this.root.querySelector("#save-state")!.textContent = "已保存纸形";
    } catch {
      this.message("本地保存不可用，请导出纸形文件。");
    }
  }
  private action(name: string): void {
    try {
      if (name === "undo") {
        this.gesture = null;
        this.line = null;
        const raw = this.history.pop();
        if (raw) this.model.load(raw);
        else {
          this.message("还没有可以撤销的操作。");
          return;
        }
        this.revision++;
        this.save();
        this.message("已恢复上一操作前的纸形。");
      }
      if (name === "new") {
        this.checkpoint();
        this.gesture = null;
        this.line = null;
        this.model.reset();
        this.lineLocked = false;
        this.revision++;
        this.save();
        this.message(
          "新的 A4 白纸。直接拖纸角到落点，或者 Shift＋划线精确控制。",
        );
        this.render(true);
      }
      if (name === "view") {
        this.paper.paper.pitch = 35;
        this.paper.paper.yaw = -12;
        this.paper.paper.zoom = 1.04;
        this.render(true);
      }
      if (name === "top") {
        this.paper.paper.pitch = 0;
        this.paper.paper.yaw = 0;
        this.paper.paper.applyTransform();
        this.paper.redraw();
      }
      if (name === "in" || name === "out") {
        this.paper.paper.zoom = Math.max(
          0.4,
          Math.min(
            2.5,
            this.paper.paper.zoom * (name === "in" ? 1.15 : 1 / 1.15),
          ),
        );
        this.paper.paper.applyTransform();
        this.paper.redraw();
      }
      if (name === "save") {
        this.save();
        this.message("纸形、折线与当前折角已保存。");
      }
      if (name === "open") {
        this.checkpoint();
        this.angle(0);
        this.save();
        this.message("当前这一折已展开。折线仍在，可向两个方向翻折。");
      }
      if (name === "export") {
        const url = URL.createObjectURL(
            new Blob([this.model.save()], { type: "application/json" }),
          ),
          a = document.createElement("a");
        a.href = url;
        a.download = "paper-studio.foldpaper";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.message("纸形已导出。");
      }
      this.render();
    } catch (e) {
      this.message(`没有完成：${String(e)}`);
    }
  }
  private message(s: string): void {
    const el = this.root?.querySelector("#paper-message");
    if (el) el.textContent = s;
  }
  private render(first = false): void {
    if (!this.paper) return;
    const positions: number[] = [],
      uv: number[] = [],
      triangles: number[] = [];
    // Tiny display-only separation prevents coplanar depth fighting. The model
    // and all fold calculations use exact zero-thickness panel coordinates.
    this.model.panels.forEach((f, rank) => {
      const offset = positions.length / 3;
      for (const q of f.points) {
        positions.push(q.p[0], q.p[1], q.p[2] + rank * 0.000012);
        uv.push(...q.uv);
      }
      for (let i = 1; i < f.points.length - 1; i++)
        triangles.push(offset, offset + i, offset + i + 1);
    });
    const area = this.model.panels.reduce((s, f) => s + materialArea(f), 0);
    const frame: LabFrame = {
      ok: true,
      positions,
      uv,
      triangles,
      creases: [],
      anchors: [],
      solver: "user-defined-panel-fold",
      stats: {
        time: 0,
        ms: 0,
        strainMax: 0,
        strainP95: 0,
        mass: area * 0.08,
        area,
        plastic: 0,
        maxPlastic: 0,
        contacts: 0,
        ccdLimited: 0,
        backlog: 0,
      },
    };
    this.paper.setFrame(frame, first);
    this.controls();
    this.overlay();
  }
  private controls(): void {
    const range = this.root.querySelector<HTMLInputElement>("#fold-angle")!,
      t = this.model.turn;
    range.disabled = !t;
    if (document.activeElement !== range)
      range.value = String(Math.round(((t?.angle ?? 0) * 180) / Math.PI));
    this.root.querySelector("#angle-value")!.textContent = t
      ? `${Math.round((t.angle * 180) / Math.PI)}°`
      : this.model.crease
        ? "抓纸角开始翻折"
        : "拖纸角开始翻折";
    this.root.querySelector<HTMLButtonElement>(
      '[data-action="undo"]',
    )!.disabled = !this.history.length;
    this.root.querySelector<HTMLButtonElement>(
      '[data-action="open"]',
    )!.disabled = !t;
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-mode]"))
      b.setAttribute("aria-pressed", String(b.dataset.mode === this.mode));
    this.root.dataset.ready = "true";
    this.root.dataset.foldAngle = String(t?.angle ?? 0);
    this.root.dataset.panels = String(this.model.panels.length);
    this.root.dataset.revision = String(this.revision);
    this.root.dataset.crease = String(!!this.model.crease);
    this.root.querySelector("#paper-stats")!.textContent =
      `${this.model.panels.length} 个纸面 · 材料面积 ${(this.model.panels.reduce((s, f) => s + materialArea(f), 0) * 1e6).toFixed(0)} mm² · 几何约束模式`;
  }
  private overlay(): void {
    if (!this.paper) return;
    let html = "";
    const c = this.line ?? this.model.crease;
    if (c) {
      const a = this.project(c.a),
        b = this.project(c.b),
        dx = b.x - a.x,
        dy = b.y - a.y,
        l = Math.hypot(dx, dy);
      if (l > 1) {
        const scale = 600 / l,
          x = (a.x + b.x) / 2 + 195,
          y = this.h / 2 - (a.y + b.y) / 2;
        html += `<line x1="${x - dx * scale}" y1="${y + dy * scale}" x2="${x + dx * scale}" y2="${y - dy * scale}" stroke="#d27f55" stroke-width="1" stroke-dasharray="3 3"/>`;
      }
      for (const p of [a, b])
        html += `<circle cx="${p.x + 195}" cy="${this.h / 2 - p.y}" r="3" fill="#fff9ed" stroke="#c87850"/>`;
    }
    const t = this.model.turn;
    if (t && (this.gesture?.kind === "fold" || this.gesture?.kind === "auto")) {
      const moving = t.base.filter((f) => t.moving.indexOf(f.id) !== -1);
      for (const f of moving) {
        const ps = f.points.map((p) =>
          this.project(rotate(p.p, t.crease, Math.PI)),
        );
        html += `<polygon points="${ps.map((p) => `${p.x + 195},${this.h / 2 - p.y}`).join(" ")}" fill="#e5826318" stroke="#d27f55" stroke-width=".6" stroke-dasharray="2 2"/>`;
      }
      const p = this.project(rotate(t.grab.p, t.crease, t.angle));
      html += `<circle cx="${p.x + 195}" cy="${this.h / 2 - p.y}" r="5" fill="#fff9ed" stroke="#d27f55" stroke-width="1.2"/>`;
    }
    this.svg.innerHTML = html;
  }
  update(dt: number): void {
    if (!this.paper || this.disposed) return;
    this.paper.paper.update(dt);
    if (this.gesture?.kind === "orbit") this.overlay();
  }
  onDestroy(): void {
    this.disposed = true;
    this.save();
    this.resizeObserver?.disconnect();
    this.off.forEach((fn) => fn());
    this.paper?.destroy();
    this.root?.remove();
  }
}
