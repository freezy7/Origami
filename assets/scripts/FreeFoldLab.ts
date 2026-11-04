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
  profiler,
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
import { FlightBench } from "./FlightBench";
import { PaperDynamics, PHYSICAL_PROFILE } from "./core/PaperDynamics";
const { ccclass } = _decorator;
const KEY = "origami.web-fold.v1";
type XY = { x: number; y: number };
@ccclass("FreeFoldLab")
export class FreeFoldLab extends Component {
  private model = new FreePaper();
  private dynamics:PaperDynamics|null=null;
  private flightBench:FlightBench|null=null;
  private flightLaunching=false;
  private dynamicsLoading=false;
  private dynamicsFailed=false;
  private dynamicsSource="";
  private paper!: PaperLabView;
  private root!: HTMLElement;
  private stage!: HTMLElement;
  private svg!: SVGSVGElement;
  private h = 390;
  private mode: "fold" | "crease" | "adjust" | "axis" | "orbit" = "fold";
  private gesture: {
    id: number;
    kind: "line" | "fold" | "auto" | "orbit" | "edit" | "axis" | "physical";
    index?: number;
    crease?: Crease;
    ends?: [V3,V3];
    endpoint?: number;
    start: XY;
    last: XY;
    point?: PaperPoint;
    normal?: V3;
    angle?: number;
    sign?: number;
    changed?: boolean;
    error?: string;
  } | null = null;
  private line: { a: V3; b: V3; normal: V3 } | null = null;
  private lineLocked = false;
  private hover: XY | null = null;
  private layerOffset = 0;
  private layerHits = 0;
  private lastSize = "";
  private selectedFold = -1;
  private showCreases = true;
  private snapHint: { p: V3; label: string } | null = null;
  private foldedState: string | null = null;
  private autoBase: string | null = null;
  private resizeObserver!: ResizeObserver;
  private history: string[] = [];
  private future: string[] = [];
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
    profiler.hideStats();
    this.root = document.createElement("div");
    this.root.id = "paper-studio";
    this.root.className = "ready fold-studio";
    this.root.innerHTML = `
<header class="studio-header"><div class="brand"><span class="brand-icon">◩</span><div><strong>纸间</strong><small>PAPER STUDIO</small></div></div><span class="edition">自由折叠工作台</span><div class="header-actions"><span id="save-state">纸形保存在当前浏览器</span><button data-action="save">保存纸形</button></div></header>
<main class="studio-main"><section class="paper-workspace" aria-label="三维折纸工作区"><div class="stage-label"><span class="live-dot"></span><span>A4 白纸</span><small>210 × 297 mm</small></div><p id="paper-message" role="status" aria-live="polite"></p><div class="paper-stage" id="paper-stage" tabindex="0"><svg id="paper-overlay" aria-hidden="true"></svg></div><div class="view-controls"><button data-action="out" title="缩小">−</button><button data-mode="orbit" aria-pressed="false">转动视角</button><button data-action="view">立体视角</button><button data-action="top">俯视对齐</button><button data-action="flight">侧面观察</button><button data-action="in" title="放大">＋</button></div><div class="workspace-tip"><kbd>Shift</kbd> 划折线 <span>·</span><kbd>Tab</kbd> 切换纸层 <span>·</span> 空白处拖动转视角</div></section>
<aside class="studio-panel"><div class="panel-heading"><h1>折叠与整理</h1><p>拖角对齐；折完切到“整理”调整机翼。</p></div>
<div class="tool-group fold-tools" role="group" aria-label="纸张工具"><button data-mode="fold" aria-pressed="true"><span>↗</span>拖角对齐</button><button data-mode="crease" aria-pressed="false"><span>╱</span>划折线</button><button data-mode="adjust" aria-pressed="false"><span>⌁</span>拖翼整理</button><button data-mode="axis" aria-pressed="false"><span>⊹</span>改折轴</button></div>
<section class="height-card"><label for="crease-select" class="control-label">操作折痕</label><select id="crease-select" aria-label="折痕历史"><option value="-1">当前翻折</option></select><button class="open-from" data-action="peel-open">从最后一折逐步展开</button><div class="crease-navigation"><button data-action="crease-prev">上一折</button><button data-action="crease-next">下一折</button><button data-action="ease-open">展开 15°</button></div><div class="card-title"><label for="fold-angle" id="angle-label">翻折角度</label><output id="angle-value">先折一条折痕</output></div><input id="fold-angle" type="range" min="-180" max="180" step="0.5" value="0" disabled aria-label="翻折角度，度"><div class="angle-precise"><button data-action="degree-down" aria-label="减小一度">−1°</button><input id="angle-number" type="number" min="-180" max="180" step="0.5" value="0" aria-label="精确折角"><span>°</span><button data-action="degree-up" aria-label="增加一度">＋1°</button><button data-action="apply-angle">应用</button></div><div class="angle-presets"><button data-action="open">展开 0°</button><button data-action="half">立起 90°</button><button data-action="flat">压平 180°</button><button data-action="reverse">反向</button></div><button class="open-from" data-action="open-from">展开此折及后续</button><p id="fold-hint">拖角时会吸附顶点、边中点与边缘。相邻纸边可精确对齐。</p><button data-action="select-cover" class="open-from" hidden>选择覆盖折痕</button></section>
<section class="layer-card"><label class="layer-choice"><input id="all-layers" type="checkbox"> 一起翻动重叠纸层</label><div class="layer-row"><span id="layer-value">指向纸面查看纸层</span><button data-action="layer">换一层 ↹</button></div></section>
<div class="crease-options"><label class="layer-choice"><input id="show-creases" type="checkbox" checked> 显示折痕</label><label class="layer-choice"><input id="xray-creases" type="checkbox"> 透视隐藏折痕</label></div><div class="history-actions"><button data-action="open-all">全部展开看折痕</button><button data-action="restore-folded">恢复立体纸形</button></div>
<section class="material-card"><h2>材料与接触</h2><p>80 g/m² · 0.15 mm · 参数未实测校准</p><div class="history-actions"><button data-action="physics">材料整理 / 回弹</button><button data-action="physics-stop" disabled>返回折轴编辑</button></div><output id="physics-state">几何编辑状态；试飞前需材料与接触检查。</output><button data-action="preflight" disabled>进入固定场地试飞</button></section><div class="history-actions main-actions"><button data-action="undo">↶ 撤销</button><button data-action="redo">↷ 重做</button><button data-action="new">＋ 新白纸</button></div>
<details><summary>操作说明与纸形文件</summary><p>拖角到另一条纸边可对齐边缘。划线模式下，从一点拖到另一点，再拖纸面翻折；选定折线后也可直接使用角度按钮。</p><p>拖翼整理时抓住机翼调角，选机身合页可打开成 V 形；Tab 或“换一层”可选择被挡住的纸层。改折轴时拖动两端圆点旋转、拖线身平移。</p><p>材料整理会从白纸逐步成形，并计算纸层接触和释放回弹。检查通过后可进入统一条件试飞；材料与气动参数尚未实测校准。</p><div class="file-actions"><button data-action="export">导出几何折叠步骤</button><label class="file-button">导入折叠步骤<input type="file" id="paper-file" accept=".foldpaper,application/json"></label></div><p>物理纸形另存于当前浏览器。返回改折轴后将按新步骤重新成形。</p><a href="?physics">原薄片物理实验</a><output id="paper-stats"></output></details>
</aside></main>`;
    if ((window as Window & {__ORIGAMI_FREE_FOLD_ONLY__?: boolean}).__ORIGAMI_FREE_FOLD_ONLY__)
      this.root.querySelector('a[href="?physics"]')?.remove();
    document.body.append(this.root);
    this.stage = this.root.querySelector("#paper-stage")!;
    this.svg = this.root.querySelector("#paper-overlay")!;
    const game = document.getElementById("GameDiv");
    if (!game) throw Error("未找到画布");
    this.stage.prepend(game);
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) this.model.load(saved);
      this.foldedState = localStorage.getItem(KEY + ".folded");
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
          this.angle((this.model.records[this.selectedFold]?.angle ?? this.model.turn.angle) - w.deltaY * 0.003);
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
        if(this.dynamics || this.dynamicsLoading){this.message("材料模式下可直接拖纸面。要改折轴，请先返回折轴编辑。");return;}
        this.mode = b.dataset.mode as typeof this.mode;
        if (this.mode !== "crease") this.lineLocked = false;
        this.message(
          this.mode === "crease"
            ? "沿纸面划出折线。随后抓纸翻折，或选定一侧后用角度按钮。"
            : this.mode === "adjust" ? "抓住机翼直接拖动，沿原折轴整理；点虚线或从列表选择合页折痕，可展开成 V 形。"
            : this.mode === "orbit" ? "拖动任意位置转动视角，可连续翻到纸张背面。点“拖翼整理”继续展开。"
            : this.mode === "axis" ? "先选择要改位的折痕，再拖两端圆点旋转折轴，或拖线身平移。后续折痕会重新求交。"
            : "拖角到落点；相邻纸边可精确对齐。Tab 切换重叠纸层。",
        );
        this.hover = null;
        this.render();
      });
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-action]"))
      this.on(b, "click", () => this.action(b.dataset.action!));
    const range = this.root.querySelector<HTMLInputElement>("#fold-angle")!;
    this.on(range, "pointerdown", () => this.checkpoint());
    this.on(range, "keydown", (e) => {
      const k=e as KeyboardEvent;
      if (!k.repeat && ["Home","End","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].indexOf(k.key)!==-1) this.checkpoint();
    });
    this.on(range, "input", () => this.angle(Number(range.value)*Math.PI/180));
    this.on(range, "change", () => this.save());
    const number = this.root.querySelector<HTMLInputElement>("#angle-number")!;
    this.on(number, "change", () => this.applyNumber());
    this.on(number, "keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); this.applyNumber(); }
    });
    this.on(this.root.querySelector("#crease-select")!, "change", (e) => {
      this.selectedFold = Number((e.target as HTMLSelectElement).value);
      this.lineLocked = false;
      this.mode = "adjust";
      this.render();
    });
    this.on(this.root.querySelector("#show-creases")!, "change", (e) => {
      this.showCreases = (e.target as HTMLInputElement).checked;
      this.overlay();
    });
    this.on(this.root.querySelector("#xray-creases")!, "change", () => this.overlay());
    this.on(this.stage, "pointerleave", () => { if (!this.gesture) { this.hover = null; this.overlay(); } });
    this.on(window, "keydown", (e) => {
      const k = e as KeyboardEvent;
      if (k.target instanceof HTMLInputElement || k.target instanceof HTMLSelectElement) return;
      if (k.key === "Tab" && document.activeElement === this.stage && this.hover) {
        k.preventDefault(); this.action("layer"); return;
      }
      if ((k.metaKey || k.ctrlKey) && k.key === "z") {
        k.preventDefault();
        this.action(k.shiftKey ? "redo" : "undo");
      } else if ((k.metaKey || k.ctrlKey) && k.key === "s") {
        k.preventDefault();
        this.save();
      } else if (k.key === "Escape") {
        this.cancel();
      }
    });
    this.on(window, "blur", () => {
      if (this.gesture) this.cancel();
      this.save();
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
        this.selectedFold = -1;
        this.foldedState = null;
        this.lineLocked = false;
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
    const size = `${r.width}:${r.height}`;
    if (size === this.lastSize) return;
    this.lastSize = size;
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
    this.render();
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
        z: -this.paper.paper.surface.position.z,
      };
    const a: V3 = [
        (base.x + center.x) / LAB_SCALE,
        (base.y + center.y) / LAB_SCALE,
        (base.z + center.z) / LAB_SCALE,
      ],
      d: V3 = [dir.x, dir.y, dir.z],
      den = dot(d, normal);
    if (Math.abs(den) < 0.15) return null;
    return add(a, mul(d, dot(sub(origin, a), normal) / den));
  }
  private hits(p: XY): {point: PaperPoint; panel: Panel; depth: number; distance: number}[] {
    const radius = 8 * 390 / this.stage.getBoundingClientRect().width;
    const out: {point: PaperPoint; panel: Panel; depth: number; distance: number}[] = [];
    this.model.panels.forEach((f,rank) => {
      const screen = f.points.map(q => this.project(q.p));
      let hit: PaperPoint | null = null, distance = Infinity;
      for (let i=1;i<f.points.length-1;i++) {
        const a=screen[0], b=screen[i], c=screen[i+1];
        const d=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
        if (Math.abs(d)<1e-9) continue;
        const u=((p.x-a.x)*(c.y-a.y)-(p.y-a.y)*(c.x-a.x))/d;
        const v=((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))/d;
        if (u>=-1e-7 && v>=-1e-7 && u+v<=1+1e-7) {
          const aa=f.points[0], bb=f.points[i], cc=f.points[i+1];
          hit={p:add(aa.p,add(mul(sub(bb.p,aa.p),u),mul(sub(cc.p,aa.p),v))),uv:[aa.uv[0]+(bb.uv[0]-aa.uv[0])*u+(cc.uv[0]-aa.uv[0])*v,aa.uv[1]+(bb.uv[1]-aa.uv[1])*u+(cc.uv[1]-aa.uv[1])*v]};
          distance=0; break;
        }
      }
      if (!hit) screen.forEach((a,i) => {
        const b=screen[(i+1)%screen.length], dx=b.x-a.x, dy=b.y-a.y;
        const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(1e-14,dx*dx+dy*dy)));
        const d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
        if (d<distance && d<radius) {
          const aa=f.points[i],bb=f.points[(i+1)%f.points.length];
          hit={p:add(aa.p,mul(sub(bb.p,aa.p),t)),uv:[aa.uv[0]+(bb.uv[0]-aa.uv[0])*t,aa.uv[1]+(bb.uv[1]-aa.uv[1])*t]};distance=d;
        }
      });
      if (hit) {
        const q=(hit as PaperPoint).p;
        const depth=Vec3.transformQuat(new Vec3(),new Vec3(q[0],q[1],q[2]),this.paper.paper.rig.rotation).z + rank*1e-8;
        out.push({point:hit,panel:f,depth,distance});
      }
    });
    const interior=out.some(q=>q.distance===0);
    const sorted=out.filter(q=>!interior || q.distance===0).sort((a,b)=> b.depth-a.depth || a.distance-b.distance);
    return sorted.filter((q,i)=>!sorted.slice(0,i).some(r=>Math.hypot(q.point.uv[0]-r.point.uv[0],q.point.uv[1]-r.point.uv[1])<1e-7));
  }
  private hit(p: XY): {point: PaperPoint; panel: Panel} | null {
    const hits=this.hits(p);
    this.layerHits=hits.length;
    return hits.length ? hits[this.layerOffset % hits.length] : null;
  }
  private selectCrease(p: XY): boolean {
    let best=-1, distance=12*390/this.stage.getBoundingClientRect().width;
    this.model.records.forEach((_,i)=>this.model.creaseSegments(i).forEach(([a,b])=>{
      const aa=this.project(a), bb=this.project(b), dx=bb.x-aa.x,dy=bb.y-aa.y;
      const t=Math.max(0,Math.min(1,((p.x-aa.x)*dx+(p.y-aa.y)*dy)/Math.max(1e-12,dx*dx+dy*dy)));
      const d=Math.hypot(p.x-aa.x-t*dx,p.y-aa.y-t*dy);
      if (d<=distance+1e-7) { best=i; distance=d; }
    }));
    if (best<0) return false;
    this.selectedFold=best; this.lineLocked=false; this.render();
    this.message(`正在整理折痕 ${best+1}，可展开、立起或精确调整折角。`);
    return true;
  }
  private snap(p: XY, origin: V3, normal: V3, grab?: V3): V3 | null {
    this.snapHint = null;
    // A fixed CSS-pixel radius remains usable on narrow and wide viewports.
    const radius = 12 * 390 / this.stage.getBoundingClientRect().width;
    let best: V3 | null = null, score = Infinity;
    if (grab) {
      const pivots: V3[] = [];
      for (const f of this.model.panels) f.points.forEach((a,i)=>{
        const b=f.points[(i+1)%f.points.length];
        if (norm(sub(a.p,grab))<1e-7) pivots.push(b.p);
        if (norm(sub(b.p,grab))<1e-7) pivots.push(a.p);
      });
      for (const f of this.model.panels) f.points.forEach((a,i)=>{
        const b=f.points[(i+1)%f.points.length], edge=sub(b.p,a.p), length=norm(edge);
        if (length<1e-7) return;
        const u=mul(edge,1/length);
        for (const pivot of pivots) {
          const along=dot(sub(pivot,a.p),u);
          if (norm(cross(sub(pivot,a.p),u))>1e-7 || along < -1e-7 || along > length+1e-7) continue;
          const r=norm(sub(grab,pivot));
          for (const sign of [-1,1]) {
            const q=add(pivot,mul(u,sign*r)), t=dot(sub(q,a.p),u);
            if (t < -1e-7 || t > length+1e-7 || norm(sub(q,grab))<.002 || Math.abs(dot(sub(q,origin),normal))>1e-6) continue;
            const v=this.project(q),d=Math.hypot(v.x-p.x,v.y-p.y);
            if (d<radius && d-radius*.7<score) { best=q;score=d-radius*.7;this.snapHint={p:q,label:"纸边对齐"}; }
          }
        }
      });
    }
    for (const f of this.model.panels) for (let i = 0; i < f.points.length; i++) {
      const a = f.points[i].p, b = f.points[(i+1)%f.points.length].p;
      const pa = this.project(a), pb = this.project(b);
      const dx = pb.x-pa.x, dy = pb.y-pa.y, len = dx*dx+dy*dy;
      const t = len > 1e-8 ? Math.max(0,Math.min(1,((p.x-pa.x)*dx+(p.y-pa.y)*dy)/len)) : 0;
      // Intersect the cursor ray with the paper plane before projecting to an edge.
      const cursor = this.unproject(p, origin, normal);
      const edge = sub(b,a), edgeLength = dot(edge,edge);
      const edgeT = cursor && edgeLength > 1e-14 ? Math.max(0,Math.min(1,dot(sub(cursor,a),edge)/edgeLength)) : t;
      const candidates: [V3,string,number][] = [[a,"顶点",0], [mul(add(a,b),0.5),"边中点",0], [add(a,mul(edge,edgeT)),"边缘 / 已有折痕",radius*0.3]];
      for (const [q,label,penalty] of candidates) {
        if (Math.abs(dot(sub(q,origin),normal)) > 1e-6) continue;
        const v = this.project(q), d = Math.hypot(v.x-p.x,v.y-p.y);
        if (d <= radius && d+penalty < score) {
          best=q; score=d+penalty; this.snapHint={p:q,label};
        }
      }
    }
    return best;
  }
  private axisEnds(index: number): [V3,V3] {
    const c=this.model.foldPose(index).crease, u=unit(sub(c.b,c.a));
    const samples=this.model.creaseSegments(index).reduce<V3[]>((ps,[a,b])=>ps.concat([a,b]),[]);
    if (samples.length<2) return [c.a,c.b];
    samples.sort((a,b)=>dot(sub(a,b),u));
    return [samples[0],samples[samples.length-1]];
  }
  private startAdjustment(p: XY, hit: {point:PaperPoint;panel:Panel}, id: number): boolean {
    let index=this.selectedFold;
    const selectedLock=index>=0?this.model.foldLock(index):null;
    if(selectedLock){this.message(`折痕 ${index+1} 被折痕 ${selectedLock.blockedBy+1} 压住，先展开覆盖层后才能调角。`);return true;}
    const moves=(i:number)=>this.model.records[i]?.base.some(f=>this.model.records[i].moving.indexOf(f.id)!==-1 && this.uvInside(f,hit.point.uv));
    if (index<0 || !moves(index)) {
      index=-1;
      for (let i=this.model.records.length-1;i>=0;i--) if (moves(i)) { index=i;break; }
    }
    if (index<0) return false;
    const lock=this.model.foldLock(index);
    if(lock){this.selectedFold=index;this.render();this.message(`折痕 ${index+1} 被折痕 ${lock.blockedBy+1} 压住，先展开覆盖层后才能调角。`);return true;}
    const pose=this.model.foldPose(index), c=pose.crease;
    if (norm(cross(sub(hit.point.p,c.a),unit(sub(c.b,c.a))))<.003) {
      this.selectCrease(p);return true;
    }
    this.checkpoint();this.selectedFold=index;this.lineLocked=false;
    this.gesture={id,kind:"edit",index,crease:c,start:p,last:p,angle:this.model.records[index].angle,
      point:{uv:[...hit.point.uv],p:rotate(hit.point.p,c,-this.model.records[index].angle)}};
    this.message(`正在直接整理折痕 ${index+1}。松手保留角度；Escape 取消。`);
    this.render();return true;
  }
  private startAxis(p: XY, id:number): boolean {
    if (this.selectedFold<0) { this.selectCrease(p);return true; }
    const lock=this.model.foldLock(this.selectedFold);
    if(lock){this.message(`折痕 ${this.selectedFold+1} 被折痕 ${lock.blockedBy+1} 压住，先展开覆盖层后才能改轴。`);return true;}
    const c=this.model.foldPose(this.selectedFold).crease, ends=this.axisEnds(this.selectedFold);
    const a=this.project(ends[0]),b=this.project(ends[1]),radius=14*390/this.stage.getBoundingClientRect().width;
    const da=Math.hypot(p.x-a.x,p.y-a.y),db=Math.hypot(p.x-b.x,p.y-b.y);
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(1e-12,dx*dx+dy*dy)));
    const lineDistance=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
    if (Math.min(da,db,lineDistance)>radius) return false;
    this.checkpoint();this.autoBase=this.model.save();
    this.gesture={id,kind:"axis",index:this.selectedFold,crease:c,ends,endpoint:da<radius?0:db<radius?1:-1,
      start:p,last:p,normal:c.normal};
    this.message("正在改位折轴。松手提交，Escape 恢复；不相容的改动会保留上一有效纸形。");
    return true;
  }
  private down(e: PointerEvent): void {
    if (this.gesture) return;
    e.preventDefault();
    this.stage.focus();
    this.stage.setPointerCapture(e.pointerId);
    const p = this.point(e);
    if(this.dynamics) {
      const hit=this.paper.pick(p,this.node);
      if(e.altKey || e.button!==0 || !hit) {this.gesture={id:e.pointerId,kind:"orbit",start:p,last:p};return;}
      if(this.dynamics.isForming){this.message("正在逐步压折并求解接触，请等待材料成形后再抓纸面整理。");return;}
      const inv=Quat.invert(new Quat(),this.paper.paper.rig.rotation),n=Vec3.transformQuat(new Vec3(),new Vec3(0,0,1),inv);
      const point:PaperPoint={uv:[hit.uv.x,hit.uv.y],p:[hit.p.x,hit.p.y,hit.p.z]};
      this.gesture={id:e.pointerId,kind:"physical",point,normal:[n.x,n.y,n.z],start:p,last:p};
      void this.dynamics.grip(100,point.uv[0],point.uv[1],point.p).catch(err=>this.message(String(err)));
      this.message("正在抓持真实材料点；松手后由弹塑性与接触求解器计算回弹。");return;
    }
    const hit=this.hit(p);
    if (e.button===0 && !e.altKey && this.mode==="axis" && this.startAxis(p,e.pointerId)) return;
    if (e.button === 2 || e.button === 1 || e.altKey || this.mode === "orbit" || !hit) {
      this.gesture = { id: e.pointerId, kind: "orbit", start: p, last: p };
      return;
    }
    if (e.button !== 0) return;
    if (this.mode === "adjust") {
      try {
        if (!this.startAdjustment(p,hit,e.pointerId) && !this.selectCrease(p)) this.message("抓住机翼拖动，或点选虚线折痕。");
      } catch(e) { this.message(String(e)); }
      return;
    }
    if (this.mode==="axis") { this.message("拖动橙色折轴的两端圆点或线身进行改位。");return; }
    this.selectedFold = -1;
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
        distance = 12 * 390 / this.stage.getBoundingClientRect().width;
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
              panelNormal(hit.panel),
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
    const p = this.point(e);
    if (!g) { this.hover=p; this.overlay(); return; }
    if (g.id !== e.pointerId) return;
    if(g.kind==="physical" && this.dynamics){
      const target=this.unproject(p,g.point!.p,g.normal!);
      if(target)this.dynamics.move(100,target);
    }
    if (g.kind==="edit") {
      const previous=this.model.records[g.index!].angle;
      let best=previous,error=Infinity;
      for(let i=-180;i<=180;i++) {
        const a=i*Math.PI/180,q=this.project(rotate(g.point!.p,g.crease!,a));
        const d=(q.x-p.x)**2+(q.y-p.y)**2+.006*((a-previous)*180/Math.PI)**2;
        if(d<error){error=d;best=a;}
      }
      // At a flat fold the projected circular motion has zero slope, so
      // nearest-point fitting can stick at 180 degrees. Pull it open by
      // screen distance; returning to the grip restores the starting angle.
      const pixels=this.stage.getBoundingClientRect().width/390;
      const before=this.project(rotate(g.point!.p,g.crease!,g.angle!-Math.PI/180));
      const after=this.project(rotate(g.point!.p,g.crease!,g.angle!+Math.PI/180));
      if(Math.abs(Math.sin(g.angle!))<.174 && Math.hypot(after.x-before.x,after.y-before.y)*pixels/2<.15) {
        const delta=Math.hypot(p.x-g.start.x,p.y-g.start.y)*pixels*.6*Math.PI/180;
        const a=g.angle!,sign=Math.sign(a)||1;
        best=sign*(Math.abs(a)>Math.PI/2?Math.max(0,Math.abs(a)-delta):Math.min(Math.PI,Math.abs(a)+delta));
      }
      if(this.angle(best)){g.changed=Math.abs(best-g.angle!)>1e-9;delete g.error;}
    }
    if (g.kind==="axis" && this.autoBase) {
      const from=this.unproject(g.start,g.crease!.a,g.normal!),to=this.unproject(p,g.crease!.a,g.normal!);
      if (!from || !to) {g.error="当前折轴参考面接近侧视，请切换俯视或转动视角后再改位。";this.message(g.error);}
      else {
        const prior=this.model.save(),delta=sub(to,from),ends=g.ends!.map(q=>[...q] as V3) as [V3,V3];
        if(g.endpoint===-1) {ends[0]=add(ends[0],delta);ends[1]=add(ends[1],delta);}
        else ends[g.endpoint!]=add(ends[g.endpoint!],delta);
        try {
          this.model.load(this.autoBase);
          this.model.moveAxisWorld(g.index!,ends[0],ends[1]);g.changed=norm(delta)>1e-9;delete g.error;this.revision++;this.render();
        } catch(e) {this.model.load(prior);g.error=String(e);this.message(g.error);}
      }
    }
    if (g.kind === "orbit") {
      const pixels=this.stage.getBoundingClientRect().width/390;
      this.paper.paper.orbit((p.x - g.last.x)*pixels, (p.y - g.last.y)*pixels);
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
            const landed = this.snap(p, g.point!.p, g.normal!, g.point!.p) ?? target,
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
    this.snapHint = null;
    this.hover = null;
    if(g.kind==="physical" && this.dynamics){
      void this.dynamics.release(100).then(()=>this.save()).catch(err=>this.message(String(err)));
      this.message("已松手，正在计算回弹与层间接触。绿色检查通过后才能保存试飞纸形。");return;
    }
    if (g.kind==="edit" || g.kind==="axis") {
      if(!g.changed){const before=this.history.pop();if(before)this.model.load(before);}
      this.autoBase=null;this.save();this.render();
      this.message(g.error ? `${g.changed?"已保留上次有效调整":"未应用本次调整"}；${g.error}` : !g.changed ? "纸形未改变。" : g.kind==="edit" ? "机翼折角已随拖动保留，可继续整理机身合页的 V 形开口。" : "折轴改位已保留，后续折叠已重新构建。");
      return;
    }
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
  private angle(a: number): boolean {
    if (!this.model.turn && !this.model.records[this.selectedFold]) return false;
    try {
      // Precision controls must retain values near 0° and 180°.
      if (this.selectedFold >= 0) this.model.editFold(this.selectedFold, a);
      else this.model.preview(a);
      if (!this.gesture) this.model.finish();
      this.revision++;
      this.render();
      return true;
    } catch (e) {
      if(this.gesture?.kind==="edit")this.gesture.error=String(e);
      this.message(String(e));
      const t=this.model.records[this.selectedFold] ?? this.model.turn;
      this.root.querySelector<HTMLInputElement>("#angle-number")!.value=String(Number(((t?.angle ?? 0)*180/Math.PI).toFixed(1)));
      this.root.querySelector<HTMLInputElement>("#fold-angle")!.value=String((t?.angle ?? 0)*180/Math.PI);
      this.controls(); return false;
    }
  }
  private applyNumber(): void {
    const input=this.root.querySelector<HTMLInputElement>("#angle-number")!;
    const t=this.model.records[this.selectedFold] ?? this.model.turn;
    if (!t) return;
    if(this.selectedFold>=0 && this.model.foldLock(this.selectedFold)){this.controls();return;}
    if (input.value === "" || !input.checkValidity()) {
      input.value=String(Number((t.angle*180/Math.PI).toFixed(1)));
      this.message("请输入 −180° 到 180° 的角度，步长 0.5°。");
      return;
    }
    const a=Number(input.value)*Math.PI/180;
    if (Math.abs(a-t.angle)<1e-10) return;
    this.checkpoint();
    if (this.angle(a)) { this.save(); this.message("折角已应用，可继续整理另一侧机翼。"); }
  }
  private checkpoint(): void {
    this.future = [];
    this.history.push(this.model.save());
    if (this.history.length > 40) this.history.shift();
  }
  private cancel(): void {
    if (!this.gesture) return;
    const kind = this.gesture.kind;
    if(kind==="physical" && this.dynamics){void this.dynamics.release(100);this.gesture=null;this.message("已解除材料抓持。");return;}
    this.gesture = null;
    this.line = null;
    if (kind !== "orbit") {
      const raw = this.history.pop();
      if (raw) this.model.load(raw);
    }
    this.render();
    this.message("已取消本次操作。");
  }
  private async openDynamics():Promise<void>{
    if(this.dynamics || this.dynamicsLoading)return;
    if((window as Window & {__ORIGAMI_FREE_FOLD_ONLY__?:boolean}).__ORIGAMI_FREE_FOLD_ONLY__){this.message("当前为纯几何构建。请运行 npm run build:web 后使用材料整理。");return;}
    this.cancel();this.dynamicsLoading=true;this.dynamicsFailed=false;this.controls();
    this.message("正在建立材料网格并载入物理线程。此前的几何纸形会保留。");
    const dynamics=new PaperDynamics(),source=this.model.save();
    try{
      let state:string|undefined;
      try{const q=JSON.parse(localStorage.getItem(KEY+".material")||"null");if(q?.source===source && q?.profile===PHYSICAL_PROFILE.id)state=q.state;}catch{}
      await dynamics.open(this.model,state);
      this.dynamics=dynamics;this.dynamicsSource=source;
      this.paper.paper.originZ=dynamics.offset*LAB_SCALE;
      this.paper.paper.zoom=.85;this.paper.paper.applyTransform();
      this.render(true);this.message(state?"物理纸形已恢复，可直接抓住机翼整理。":"从白纸逐步压折，接触和回弹由材料求解器计算。");
    }catch(e){dynamics.close();this.message(`未进入材料模式：${String(e)}`);}
    finally{this.dynamicsLoading=false;this.controls();}
  }
  private async stopDynamics():Promise<void>{
    const d=this.dynamics;if(!d)return;
    await d.pause();
    if(!d.isForming)localStorage.setItem(KEY+".material",JSON.stringify({profile:PHYSICAL_PROFILE.id,source:this.dynamicsSource,state:d.snapshot}));
    this.dynamics=null;d.close();this.gesture=null;this.paper.paper.originZ=0;
    this.render(true);this.message("已返回几何折轴编辑；材料状态另行保存，改位折轴后会重新建立材料网格。");
  }
  private async launchFlight():Promise<void>{
    const d=this.dynamics;if(!d || !d.check().ready || this.flightLaunching || this.flightBench)return;
    this.flightLaunching=true;
    try{
      await d.pause();const frame=await d.auditNow(),q=d.check();
      if(!q.ready)throw Error(q.reasons.join("；")||"纸面尚未稳定");
      let hash=2166136261;for(let i=0;i<d.snapshot.length;i++){hash^=d.snapshot.charCodeAt(i);hash=Math.imul(hash,16777619);}
      this.flightBench=new FlightBench({positions:frame.positions.slice(),uv:frame.uv!.slice(),triangles:frame.triangles!.slice()},
        {stable:q.ready,intersections:q.intersections,penetration:q.penetration,strain:q.strain},String(hash>>>0),PHYSICAL_PROFILE.id,
        ()=>{this.flightBench=null;this.message("已返回材料整理；再次试飞使用相同场地与投掷条件。");});
    }catch(e){this.message(`未进入试飞：${String(e)}`);}
    finally{this.flightLaunching=false;}
  }
  private physicalControls():void{
    const el=this.root.querySelector("#physics-state");if(!el)return;
    this.root.classList.toggle("material-active",!!this.dynamics);
    this.root.querySelector<HTMLButtonElement>('[data-action="physics"]')!.disabled=!!this.dynamics||this.dynamicsLoading;
    this.root.querySelector<HTMLButtonElement>('[data-action="physics-stop"]')!.disabled=!this.dynamics||this.dynamicsLoading;
    if(!this.dynamics){el.textContent=this.dynamicsLoading?"正在载入材料内核…":"几何编辑状态；试飞前需材料与接触检查。";this.root.dataset.physicsReady="false";this.root.querySelector<HTMLButtonElement>('[data-action="preflight"]')!.disabled=true;return;}
    const q=this.dynamics.check(),s=this.dynamics.frame.stats;
    el.textContent=`${this.dynamics.isForming?`成形 ${Math.round(this.dynamics.progress*100)}% · `:""}拉伸 ${(q.strain*100).toFixed(2)}% · 相交 ${q.intersections} · 厚度残差 ${(Math.max(0,q.penetration)*1e3).toFixed(3)} mm · 物理时刻 ${s.time.toFixed(2)} s\n${q.ready?"接触 / 形变检查通过":q.reasons.join("；")||"正在检查静置稳定性"}\n成形参考偏差 ${(q.shapeError*1000).toFixed(1)} mm；以当前可见物理纸形为准。`;
    this.root.dataset.physicsReady=String(q.ready&&!this.dynamicsFailed);
    this.root.querySelector<HTMLButtonElement>('[data-action="preflight"]')!.disabled=!q.ready||this.dynamicsFailed;
  }
  private save(): void {
    if (!this.root) return;
    try {
      localStorage.setItem(KEY, this.model.save());
      if (this.foldedState) localStorage.setItem(KEY + ".folded", this.foldedState);
      else localStorage.removeItem(KEY + ".folded");
      this.root.querySelector("#save-state")!.textContent = "已保存纸形";
      if(this.dynamics && !this.dynamics.isForming){
        const d=this.dynamics,source=this.dynamicsSource;
        void d.save().then(state=>{
          localStorage.setItem(KEY+".material",JSON.stringify({profile:PHYSICAL_PROFILE.id,source,state}));
          this.root.querySelector("#save-state")!.textContent="已保存物理纸形";
        }).catch(e=>this.message(`物理状态未保存：${String(e)}`));
      }
    } catch {
      this.message("本地保存不可用，请导出纸形文件。");
    }
  }
  private action(name: string): void {
    try {
      if(name==="physics"){void this.openDynamics();return;}
      if(name==="physics-stop"){void this.stopDynamics().catch(e=>this.message(String(e)));return;}
      if(name==="preflight"){
        if(!this.dynamics?.check().ready)return;
        this.save();void this.launchFlight();return;
      }
      if((this.dynamics||this.dynamicsLoading) && ["save","view","flight","top","in","out"].indexOf(name)===-1){this.message("请先返回折轴编辑，再修改几何折叠步骤。");return;}
      const lock=this.selectedFold>=0?this.model.foldLock(this.selectedFold):null;
      if(name==="select-cover" && lock){this.selectedFold=lock.blockedBy;this.mode="adjust";this.render();this.message(`已选择覆盖折痕 ${lock.blockedBy+1}，先展开它再调整里面的纸层。`);return;}
      if(lock && ["apply-angle","degree-down","degree-up","half","flat","reverse","open","ease-open"].indexOf(name)!==-1){this.message(`折痕 ${this.selectedFold+1} 被折痕 ${lock.blockedBy+1} 压住，先展开覆盖层后才能调角。`);return;}
      if (name === "apply-angle") { this.applyNumber(); return; }
      if(name==="peel-open") {
        let index=this.model.records.length-1;
        while(index>=0 && Math.abs(this.model.records[index].angle)<1e-8)index--;
        if(index<0){this.message("所有折痕都已展开。");return;}
        const before=this.model.save(),angle=this.model.records[index].angle;
        this.selectedFold=index;this.mode="adjust";this.lineLocked=false;
        if(!this.angle(Math.sign(angle)*Math.max(0,Math.abs(angle)-Math.PI/12)))return;
        this.history.push(before);this.future=[];
        if(this.history.length>40)this.history.shift();
        if(!this.foldedState)this.foldedState=before;
        this.save();this.render();
        this.message(`正在逐步展开第 ${index+1} 折；继续点击会先展开这一折，再自动切到上一折。可撤销或恢复立体纸形。`);
        return;
      }
      if(name==="crease-prev" || name==="crease-next" || name==="ease-open") {
        const count=this.model.records.length;if(!count)return;
        const current=this.selectedFold<0?count-1:this.selectedFold;
        this.selectedFold=this.selectedFold<0?current:Math.max(0,Math.min(count-1,current+(name==="crease-prev"?-1:name==="crease-next"?1:0)));
        this.mode="adjust";this.lineLocked=false;
        if(name==="ease-open") {
          const angle=this.model.records[this.selectedFold].angle;
          if(Math.abs(angle)<1e-8){this.render();this.message("这条折痕已经展开，可切换上一折或下一折。");return;}
          const before=this.model.save();
          if(!this.angle(Math.sign(angle)*Math.max(0,Math.abs(angle)-Math.PI/12))){this.message("此折受后续折叠约束。请用“从最后一折逐步展开”，或“展开此折及后续”。");return;}
          this.history.push(before);this.future=[];
          this.save();
          this.message(`折痕 ${this.selectedFold+1} 已展开 15°，可继续拖动橙色纸面。`);
        }else this.message(`已选择折痕 ${this.selectedFold+1}，橙色为将要展开的纸面；可点“展开 15°”。`);
        this.render();return;
      }
      if (name === "layer") {
        this.layerOffset++;
        const count=this.layerHits;
        this.root.querySelector("#layer-value")!.textContent=count ? `第 ${this.layerOffset%count+1} / ${count} 层` : "指向纸面查看纸层";
        this.message(count>1 ? `下一次抓取第 ${this.layerOffset%count+1} / ${count} 层；指向纸面可查看高亮。` : "指向重叠纸面后可切换抓取的纸层。");
        this.overlay();
        return;
      }
      if (name === "half" || name === "flat" || name === "reverse") {
        const t=this.model.records[this.selectedFold] ?? this.model.turn;
        if (!t) return;
        this.checkpoint();
        const a=t.angle;
        const face=t.base.find(f=>t.moving.indexOf(f.id)!==-1 && this.uvInside(f,t.grab.uv));
        const normal=face ? panelNormal(face) : t.crease.normal;
        const sign=Math.sign(a) || Math.sign(dot(cross(unit(sub(t.crease.b,t.crease.a)),sub(t.grab.p,t.crease.a)),normal)) || 1;
        const next=name==="reverse" ? -a : sign*(name==="half" ? Math.PI/2 : Math.PI);
        if (this.angle(next)) { this.save(); this.message("折角已保留。可切换到另一条机翼折痕继续整理。"); }
        return;
      }
      if (name === "redo") {
        const raw=this.future.pop();
        if (!raw) return;
        this.history.push(this.model.save());
        this.model.load(raw);this.selectedFold=-1;this.lineLocked=false;
        this.revision++;this.save();this.render();this.message("已重做上一操作。");return;
      }
      if (name === "degree-down" || name === "degree-up") {
        this.checkpoint();
        const a = this.model.records[this.selectedFold]?.angle ?? this.model.turn?.angle ?? 0;
        this.angle(a + (name === "degree-up" ? 1 : -1) * Math.PI / 180);
        this.save();
      }
      if (name === "open-from") {
        const index=this.selectedFold >= 0 ? this.selectedFold : this.model.records.length-1;
        if (index<0) return;
        const before=this.model.save();
        this.model.unfoldFrom(index);
        this.future=[];this.history.push(before);this.foldedState=before;
        this.lineLocked=false;this.mode="adjust";
        this.revision++;this.save();this.render();
        this.message(`已展开折痕 ${index+1} 及后续折叠。更早折叠保留，可恢复立体纸形。`);
        return;
      }
      if (name === "open-all") {
        if (!this.model.records.length) return;
        const before = this.model.save();
        if (this.model.records.every(t=>Math.abs(t.angle)<1e-8)) return;
        this.model.unfoldAll();
        this.future=[];
        this.history.push(before);
        this.foldedState = before;
        this.selectedFold = -1;
        this.lineLocked = false;
        this.mode = "adjust";
        this.revision++;
        this.save();
        this.message("已展开全部已记录折痕；可选择任意折痕重折，或恢复展开前纸形。");
      }
      if (name === "restore-folded" && this.foldedState) {
        this.checkpoint();
        this.model.load(this.foldedState);
        this.foldedState = null;
        this.selectedFold = -1;
        this.lineLocked = false;
        this.mode = "adjust";
        this.revision++;
        this.save();
        this.message("已恢复展开前的立体纸形和全部折角。");
      }
      if (name === "undo") {
        this.gesture = null;
        this.line = null;
        const raw = this.history.pop();
        if (raw) { this.future.push(this.model.save()); this.model.load(raw); this.selectedFold = -1; this.lineLocked = false; }
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
        this.selectedFold = -1;
        this.foldedState = null;
        this.lineLocked = false;
        this.layerOffset = 0;
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
      if (name === "flight") {
        this.paper.paper.pitch=25;
        this.paper.paper.yaw=65;
        this.paper.paper.applyTransform();
        this.paper.redraw();
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
        if (!this.angle(0)) return;
        this.save();
        this.message("所选折痕已展开，后续折叠和折痕记录保留。");
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
    if(this.dynamics){this.paper.setFrame(this.dynamics.frame,first);this.controls();this.overlay();return;}
    const positions: number[] = [],
      uv: number[] = [],
      triangles: number[] = [],
      boundary: number[][] = [];
    // Tiny display-only separation prevents coplanar depth fighting. The model
    // and all fold calculations use exact zero-thickness panel coordinates.
    this.model.panels.forEach((f, rank) => {
      const offset = positions.length / 3;
      for (const q of f.points) {
        positions.push(q.p[0], q.p[1], q.p[2] + rank * 0.000012);
        uv.push(...q.uv);
      }
      for (let i=0;i<f.points.length;i++) {
        const a=f.points[i].uv,b=f.points[(i+1)%f.points.length].uv;
        const exterior=[0,1].some(k=>Math.abs(a[k]-b[k])<1e-8 && Math.abs(Math.abs(a[k])-(k===0 ? .105 : .1485))<1e-8);
        if (exterior) boundary.push([offset+i,offset+(i+1)%f.points.length,0]);
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
      boundary,
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
      t = this.model.records[this.selectedFold] ?? this.model.turn;
    range.disabled = !t;
    for (const action of ["degree-down", "degree-up", "half", "flat", "reverse", "apply-angle"])
      this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled = !t;
    if (document.activeElement !== range)
      range.value = String(Number(((t?.angle ?? 0) * 180 / Math.PI).toFixed(1)));
    const precise = this.root.querySelector<HTMLInputElement>("#angle-number")!;
    precise.disabled = !t;
    if (document.activeElement !== precise) precise.value = String(Math.round((t?.angle ?? 0)*1800/Math.PI)/10);
    const select = this.root.querySelector<HTMLSelectElement>("#crease-select")!;
    if (this.selectedFold >= this.model.records.length) this.selectedFold = -1;
    select.innerHTML = '<option value="-1">当前翻折</option>' + this.model.records.map((r,i) => `<option value="${i}">折痕 ${i+1} · ${(r.angle*180/Math.PI).toFixed(1)}°</option>`).join("");
    select.value = String(this.selectedFold);
    this.root.querySelector<HTMLButtonElement>('[data-action="open-from"]')!.disabled = !this.model.records.length;
    this.root.querySelector<HTMLButtonElement>('[data-action="open-all"]')!.disabled = !this.model.records.length;
    this.root.querySelector<HTMLButtonElement>('[data-action="restore-folded"]')!.disabled = !this.foldedState;
    this.root.querySelector<HTMLButtonElement>('[data-action="redo"]')!.disabled=!this.future.length;
    for(const action of ["crease-prev","crease-next","ease-open","peel-open"])
      this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled=!this.model.records.length || !!this.dynamics || this.dynamicsLoading;
    this.root.querySelector("#fold-hint")!.textContent=this.selectedFold>=0
      ? this.mode==="axis" ? "拖动折轴两端改变位置与方向，拖线身可平移。后续材料切分会一并重建。" : "抓住橙色纸面直接拖动即可调角。选择机身合页折痕，可整理成 V 形开口。"
      : this.mode === "adjust" ? "点选纸上的虚线折痕，或从列表选择；也可按步骤展开检查。"
      : this.lineLocked ? "折线已锁定。点一下要翻动的一侧，再选角度；点击“拖角对齐”开始新折叠。"
      : "拖角时会吸附顶点、边中点与边缘。相邻纸边可精确对齐。";
    this.root.querySelector("#angle-label")!.textContent = this.selectedFold>=0 ? `折痕 ${this.selectedFold+1} 的折角` : "当前折角";
    this.root.querySelector("#angle-value")!.textContent = t
      ? `${Number((t.angle*180/Math.PI).toFixed(1))}°`
      : this.model.crease
        ? "抓纸角开始翻折"
        : "拖纸角开始翻折";
    this.root.querySelector<HTMLButtonElement>(
      '[data-action="undo"]',
    )!.disabled = !this.history.length;
    this.root.querySelector<HTMLButtonElement>(
      '[data-action="open"]',
    )!.disabled = !t;
    const lock=this.selectedFold>=0?this.model.foldLock(this.selectedFold):null;
    const coverButton=this.root.querySelector<HTMLButtonElement>('[data-action="select-cover"]')!;
    coverButton.hidden=!lock;coverButton.textContent=lock?`选择覆盖折痕 ${lock.blockedBy+1}`:"选择覆盖折痕";
    if(lock){
      range.disabled=true;precise.disabled=true;
      for(const action of ["degree-down","degree-up","half","flat","reverse","apply-angle","open","ease-open"])
        this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled=true;
      this.root.querySelector("#fold-hint")!.textContent=`受压锁定：折痕 ${this.selectedFold+1} 被折痕 ${lock.blockedBy+1} 的闭合纸层覆盖。先展开覆盖层，不能单独调角或改轴。`;
    }
    this.root.dataset.foldLocked=String(!!lock);
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-mode]"))
      b.setAttribute("aria-pressed", String(b.dataset.mode === this.mode));
    if(this.dynamics || this.dynamicsLoading){
      range.disabled=true;precise.disabled=true;select.disabled=true;
      for(const b of this.root.querySelectorAll<HTMLButtonElement>('[data-mode],.angle-presets button,.angle-precise button,.open-from,[data-action="undo"],[data-action="redo"],[data-action="new"]'))b.disabled=true;
    }else{
      select.disabled=false;for(const b of this.root.querySelectorAll<HTMLButtonElement>('[data-mode]'))b.disabled=false;
      this.root.querySelector<HTMLButtonElement>('[data-action="new"]')!.disabled=false;
    }
    this.physicalControls();
    this.root.dataset.ready = "true";
    this.root.dataset.foldAngle = String(t?.angle ?? 0);
    this.root.dataset.folds = String(this.model.records.length);
    this.root.dataset.selectedFold = String(this.selectedFold);
    this.root.dataset.panels = String(this.model.panels.length);
    this.root.dataset.revision = String(this.revision);
    this.root.dataset.crease = String(!!this.model.crease);
    this.root.querySelector("#paper-stats")!.textContent =
      this.dynamics?`${this.dynamics.frame.positions.length/3} 个材料点 · 弹塑性薄片 / 纸层接触`:
      `${this.model.panels.length} 个纸面 · 材料面积 ${(this.model.panels.reduce((s, f) => s + materialArea(f), 0) * 1e6).toFixed(0)} mm² · 几何约束模式`;
  }
  private overlay(): void {
    if (!this.paper) return;
    let html = "";
    const px=390/this.stage.getBoundingClientRect().width;
    if(this.dynamics){
      this.svg.innerHTML=this.dynamics.frame.anchors.map(q=>{const p=this.project(q.p);return `<circle cx="${p.x+195}" cy="${this.h/2-p.y}" r="${4*px}" fill="${q.pin?'#3b8073':'#d27f55'}" stroke="white" stroke-width="1" vector-effect="non-scaling-stroke"/>`;}).join("");return;
    }
    if (!this.gesture && this.hover && this.mode !== "adjust") {
      const hit=this.hit(this.hover);
      if (hit) {
        const ps=hit.panel.points.map(q=>this.project(q.p));
        html+=`<polygon points="${ps.map(p=>`${p.x+195},${this.h/2-p.y}`).join(" ")}" fill="#408f7820" stroke="#408f78" stroke-width=".5"/>`;
        hit.panel.points.forEach(q=>{const p=this.project(q.p);html+=`<circle cx="${p.x+195}" cy="${this.h/2-p.y}" r="1.6" fill="#408f78"/>`;});
      }
      this.root.querySelector("#layer-value")!.textContent=this.layerHits ? `第 ${this.layerOffset%this.layerHits+1} / ${this.layerHits} 层` : "指向纸面查看纸层";
    }
    const selected=this.model.records[this.selectedFold];
    if (selected && !this.gesture) {
      const regions=selected.base.filter(f=>selected.moving.indexOf(f.id)!==-1);
      for (const f of this.model.panels) {
        const uv: [number,number]=[f.points.reduce((s,p)=>s+p.uv[0],0)/f.points.length,f.points.reduce((s,p)=>s+p.uv[1],0)/f.points.length];
        if (!regions.some(g=>this.uvInside(g,uv))) continue;
        const ps=f.points.map(q=>this.project(q.p));
        html+=`<polygon data-selected-fold="${this.selectedFold}" points="${ps.map(p=>`${p.x+195},${this.h/2-p.y}`).join(" ")}" fill="#e9a06e35"/>`;
      }
    }
    if (this.showCreases) this.model.records.forEach((_,i) => {
      const seen=new Set<string>();
      for (const [a,b] of this.model.creaseSegments(i)) {
        const key=[a,b].map(p=>p.map(v=>v.toFixed(7)).join(",")).sort().join("|");
        if (seen.has(key)) continue; seen.add(key);
        const p=this.project(a), q=this.project(b), selected=i===this.selectedFold;
        if (!selected && !this.root.querySelector<HTMLInputElement>("#xray-creases")!.checked) {
          const middle=mul(add(a,b),.5), screen=this.project(middle), hits=this.hits(screen);
          const z=Vec3.transformQuat(new Vec3(),new Vec3(...middle),this.paper.paper.rig.rotation).z;
          if (hits.length && hits[0].depth-z>1e-6) continue;
        }
        html += `<line x1="${p.x+195}" y1="${this.h/2-p.y}" x2="${q.x+195}" y2="${this.h/2-q.y}" stroke="${selected ? '#bc5833' : '#688c89'}" stroke-width="${selected ? 1.8 : .8}" vector-effect="non-scaling-stroke" stroke-dasharray="4 4" opacity="${selected ? 1 : .85}"/>`;
      }
    });
    if (this.snapHint) {
      const p=this.project(this.snapHint.p);
      html += `<circle cx="${p.x+195}" cy="${this.h/2-p.y}" r="${6*px}" fill="#e5eee2" stroke="#347d70" stroke-width="1.5" vector-effect="non-scaling-stroke"/><text x="${p.x+195+9*px}" y="${this.h/2-p.y-9*px}" font-size="${12*px}" fill="#245e54">吸附：${this.snapHint.label}</text>`;
    }
    if(this.mode==="axis" && this.selectedFold>=0) {
      const ends=this.axisEnds(this.selectedFold),a=this.project(ends[0]),b=this.project(ends[1]);
      html+=`<line x1="${a.x+195}" y1="${this.h/2-a.y}" x2="${b.x+195}" y2="${this.h/2-b.y}" stroke="#bc5833" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      [a,b].forEach((p,i)=>html+=`<circle data-axis-end="${i}" cx="${p.x+195}" cy="${this.h/2-p.y}" r="${7*px}" fill="#fff9ed" stroke="#bc5833" stroke-width="2" vector-effect="non-scaling-stroke"/>`);
    }
    const showAxis = this.lineLocked || !this.model.turn || !!this.gesture;
    const c = this.line ?? (this.selectedFold < 0 && showAxis ? this.model.crease : null);
    if (c) {
      let ends=[c.a,c.b];
      if (norm(sub(c.b,c.a))>1e-8 && !this.line) {
        const axis=unit(sub(c.b,c.a)), samples: V3[]=[];
        for (const f of this.model.turn?.base ?? this.model.panels) for (const q of f.points)
          if (norm(cross(sub(q.p,c.a),axis))<1e-6) samples.push(q.p);
        if (samples.length>1) {
          samples.sort((a,b)=>dot(sub(a,b),axis));
          ends=[samples[0],samples[samples.length-1]];
        }
      }
      const a=this.project(ends[0]), b=this.project(ends[1]);
      html+=`<line x1="${a.x+195}" y1="${this.h/2-a.y}" x2="${b.x+195}" y2="${this.h/2-b.y}" stroke="#c87850" stroke-width="1.2" vector-effect="non-scaling-stroke" stroke-dasharray="${4*px} ${3*px}"/>`;
      for (const p of [a,b]) html+=`<circle cx="${p.x+195}" cy="${this.h/2-p.y}" r="${4*px}" fill="#fff9ed" stroke="#c87850" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
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
      html += `<circle cx="${p.x + 195}" cy="${this.h / 2 - p.y}" r="${5*px}" fill="#fff9ed" stroke="#d27f55" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
    }
    this.svg.innerHTML = html;
  }
  update(dt: number): void {
    if (!this.paper || this.disposed) return;
    this.paper.paper.update(dt);
    if(this.dynamics && !this.dynamics.busy && !this.dynamicsFailed && !this.flightBench && !this.flightLaunching){
      const dynamics=this.dynamics;
      void dynamics.advance(dt).then(frame=>{
        if(this.dynamics!==dynamics)return;
        this.paper.setFrame(frame);this.physicalControls();this.overlay();
      }).catch(e=>{if(this.dynamics!==dynamics || this.disposed)return;this.dynamicsFailed=true;this.message(`材料求解已停止，禁止试飞：${String(e)}`);this.physicalControls();});
    }
    if (this.gesture?.kind === "orbit") this.overlay();
  }
  onDestroy(): void {
    this.disposed = true;
    this.save();
    this.resizeObserver?.disconnect();
    this.off.forEach((fn) => fn());
    this.flightBench?.close();
    this.dynamics?.close();
    this.paper?.destroy();
    this.root?.remove();
  }
}
