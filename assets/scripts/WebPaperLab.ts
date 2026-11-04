import {
  _decorator,
  Component,
  view,
  ResolutionPolicy,
  Color,
  Camera,
  screen,
  Size,
} from "cc";
import { PaperLabView, LabFrame } from "./PaperLabView";
import { WebPaperRuntime } from "./WebPaperRuntime";
import {
  PaperHands,
  PaperAnchor,
  Position,
  MAX_HEIGHT,
  DESK_HEIGHT,
} from "./core/PaperHands";
const { ccclass } = _decorator;
const KEY = "origami.web-paper.v2";
@ccclass("WebPaperLab")
export class WebPaperLab extends Component {
  private runtime!: WebPaperRuntime;
  private paper!: PaperLabView;
  private frame!: LabFrame;
  private root!: HTMLElement;
  private stage!: HTMLElement;
  private overlay!: SVGSVGElement;
  private hands = new PaperHands((q) => this.use(q));
  private pointer: number | null = null;
  private orbit: { finger: number; x: number; y: number } | null = null;
  private mode: "grab" | "pin" | "press" = "grab";
  private nextId = 1;
  private h = 300;
  private elapsed = 0;
  private savedAge = 0;
  private time = 0;
  private paused = false;
  private ready = false;
  private history: string[] = [];
  private status = "正在准备白纸…";
  private resized!: ResizeObserver;
  private listeners: (() => void)[] = [];
  start(): void {
    this.boot().catch((e) => {
      this.message(`无法打开工作台：${String(e)}。请刷新重试。`);
      this.root?.classList.add("failed");
    });
  }
  private async boot(): Promise<void> {
    this.shell();
    this.runtime = await WebPaperRuntime.create();
    let snapshot: string | null = null;
    try {
      snapshot = localStorage.getItem(KEY);
    } catch {
      this.status = "浏览器禁止本地存储；仍可操作并导出文件";
    }
    try {
      this.frame = this.runtime.call(
        snapshot ? { op: "load", state: snapshot } : { op: "reset" },
      );
    } catch {
      try {
        if (snapshot) localStorage.setItem(KEY + ".unreadable", snapshot);
      } catch {
        /* Storage may be unavailable. */
      }
      this.frame = this.runtime.call({ op: "reset" });
      this.status = "存档读取失败，已尝试保留原文；可恢复备份或导入纸形。";
    }
    this.frame = this.runtime.call({ op: "pause" });
    this.nextId = 1 + Math.max(0, ...this.frame.anchors.map((a) => a.id));
    this.paper = new PaperLabView(this.node);
    this.paper.paper.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.paper.paper.camera.clearColor = new Color().fromHEX("#EEF2E9");
    this.paper.paper.pitch = 48;
    this.paper.paper.yaw = -14;
    this.paper.paper.applyTransform();
    this.resized = new ResizeObserver(() => this.resize());
    this.resized.observe(this.stage);
    this.resize();
    this.paper.setFrame(this.frame, true);
    this.hands.selected =
      this.frame.anchors.filter((a) => a.pin).slice(-1)[0]?.id ?? null;
    this.bind();
    this.ready = true;
    this.root.classList.add("ready");
    for (const el of this.root.querySelectorAll<HTMLButtonElement>("button"))
      el.disabled = false;
    this.message(
      this.status !== "正在准备白纸…"
        ? this.status
        : snapshot
          ? "已恢复上次纸形。拖动标记可继续调整。"
          : "从一个纸角开始。拖动时滚轮可调高，按 F 留住抓点。",
    );
    this.draw();
  }
  private shell(): void {
    this.root = document.createElement("div");
    this.root.id = "paper-studio";
    this.root.innerHTML = `<header class="studio-header"><div class="brand"><span class="brand-icon">◩</span><div><strong>纸间</strong><small>PAPER STUDIO</small></div></div><span class="edition">自由白纸 · Web 实验版</span><div class="header-actions"><span id="save-state" role="status">仅保存在此浏览器</span><button data-action="save" disabled>保存纸形</button></div></header>
  <main class="studio-main"><section class="paper-workspace" aria-label="三维折纸工作区"><div class="stage-label"><span class="live-dot"></span><span>A4 白纸</span><small>210 × 297 mm</small></div><div class="paper-stage" id="paper-stage"><svg id="paper-overlay" aria-hidden="true"></svg><div class="loading" role="status">正在准备你的白纸…</div></div><div class="view-controls"><button data-action="zoom-out" title="缩小" disabled>−</button><button data-action="view" disabled>复位视角</button><button data-action="zoom-in" title="放大" disabled>＋</button></div><div class="workspace-tip">拖动抓纸 <span>·</span> 滚轮调高 <span>·</span> 右键转视角 <span>·</span> <kbd>F</kbd> 留住抓点</div></section>
  <aside class="studio-panel"><div class="panel-heading"><span class="eyebrow">一张纸，无限可能</span><h1>从指尖开始</h1><p>抓起、折叠，再轻轻压平。<br>纸张的形状由你决定。</p></div><div class="tool-group" role="group" aria-label="纸张工具"><button data-mode="grab" aria-pressed="true" disabled><span>↗</span>抓持</button><button data-mode="pin" aria-pressed="false" disabled><span>⊙</span>固定</button><button data-mode="press" aria-pressed="false" disabled><span>⌁</span>压痕</button></div>
  <section class="height-card"><div class="card-title"><label for="grip-height">抓点高度</label><output id="height-value">未选中</output></div><input id="grip-height" type="range" min="0" max="200" step="1" value="0" disabled aria-label="抓点高度，毫米"><div class="range-labels"><span>贴近桌面</span><span>提起</span></div><p id="selection-hint">先固定一处，或抓纸时按 F 留住抓点。</p><div class="selection-actions"><button data-action="keep" disabled>留住抓点 <kbd>F</kbd></button><button data-action="release" disabled>松开抓点</button></div></section>
  <div class="quick-help"><h2>像两只手一样操作</h2><p><kbd>Shift</kbd> ＋ 点击纸张，固定另一侧。</p><p>拖动一个纸角，用滚轮调高；按 <kbd>F</kbd> 后松鼠标，留住当前位置。</p><p>固定标记可以直接再拖。选“压痕”后按住弯曲位置向桌面压下。</p></div>
  <div class="panel-bottom"><p id="paper-message" role="status" aria-live="polite">正在加载纸张内核…</p><div class="history-actions"><button data-action="undo" disabled>↶ 撤销</button><button data-action="new" disabled>＋ 新白纸</button><button data-action="pause" disabled>暂停</button></div><details><summary>存档与实验信息</summary><div class="file-actions"><button data-action="export" disabled>导出纸形</button><label class="file-button">导入纸形<input id="paper-file" type="file" accept=".paper,text/plain"></label><button data-action="backup" disabled>恢复备份</button></div><p>A4 计算参数尚未实物校准。任意折痕精度与紧密叠层仍在验证。</p><output id="paper-stats"></output></details></div></aside></main>`;
    document.body.append(this.root);
    this.stage = this.root.querySelector<HTMLElement>("#paper-stage")!;
    this.stage.tabIndex = 0;
    this.overlay = this.root.querySelector<SVGSVGElement>("#paper-overlay")!;
    const game = document.getElementById("GameDiv");
    if (!game) throw new Error("找不到 Cocos 画布");
    this.stage.prepend(game);
  }
  private on(
    target: EventTarget,
    type: string,
    fn: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn, options);
    this.listeners.push(() => target.removeEventListener(type, fn, options));
  }
  private bind(): void {
    this.on(this.stage, "contextmenu", (e) => e.preventDefault());
    this.on(this.stage, "pointerdown", (e) => this.down(e as PointerEvent));
    this.on(this.stage, "pointermove", (e) => this.move(e as PointerEvent));
    this.on(this.stage, "pointerup", (e) => this.up(e as PointerEvent));
    this.on(this.stage, "pointercancel", (e) => this.up(e as PointerEvent));
    this.on(this.stage, "lostpointercapture", (e) =>
      this.up(e as PointerEvent),
    );
    this.on(this.stage, "wheel", (e) => this.wheel(e as WheelEvent), {
      passive: false,
    });
    this.on(window, "keydown", (e) => this.key(e as KeyboardEvent));
    this.on(window, "blur", () => this.suspend());
    this.on(document, "visibilitychange", () => {
      if (document.hidden) this.suspend();
    });
    this.on(window, "pagehide", () => this.suspend());
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-mode]",
    ))
      this.on(b, "click", () => {
        this.mode = b.dataset.mode as typeof this.mode;
        this.draw();
        this.message(
          this.mode === "pin"
            ? "点纸张放固定点；点已有标记可解除。"
            : this.mode === "press"
              ? "按住弯曲区域向桌面压下，移动可抹压。"
              : "拖动抓纸；滚轮调高度，F 留住抓点。",
        );
      });
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-action]",
    ))
      this.on(b, "click", () => this.action(b.dataset.action!));
    const slider = this.root.querySelector<HTMLInputElement>("#grip-height")!;
    this.on(slider, "pointerdown", () => {
      if (document.activeElement === slider) this.checkpoint();
    });
    this.on(slider, "focus", () => this.checkpoint());
    this.on(slider, "input", () => this.setHeight(Number(slider.value) / 1000));
    this.on(this.root.querySelector("#paper-file")!, "change", async (e) => {
      const input = e.target as HTMLInputElement,
        file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error("文件超过 2 MB");
        this.checkpoint();
        this.finish();
        this.use({ op: "load", state: await file.text() });
        this.hands.selected = null;
        this.paper.setFrame(this.frame, true);
        this.save();
        this.message("已导入纸形与折痕。");
      } catch (err) {
        this.message(`未导入，当前纸形保留：${String(err)}`);
      } finally {
        input.value = "";
      }
    });
  }
  private resize(): void {
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
    this.paper.setFrame(this.frame, true);
    this.paper.paper.applyTransform();
    this.overlay.setAttribute("viewBox", `0 0 390 ${this.h}`);
  }
  private use(q: Parameters<WebPaperRuntime["call"]>[0]): void {
    let next = this.runtime.call(q);
    if (q.op === "load") next = this.runtime.call({ op: "pause" });
    this.frame = next;
    this.nextId = Math.max(
      this.nextId,
      1 + Math.max(0, ...next.anchors.map((a) => a.id)),
    );
    this.paper?.setFrame(this.frame);
  }
  private point(e: { clientX: number; clientY: number }): {
    x: number;
    y: number;
  } {
    const r = this.stage.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * 390) / r.width - 195,
      y: this.h / 2 - ((e.clientY - r.top) * this.h) / r.height,
    };
  }
  private pinAt(p: { x: number; y: number }): PaperAnchor | undefined {
    return this.frame.anchors
      .filter((a) => a.pin)
      .map((a) => ({
        a,
        d: Math.hypot(this.project(a.p).x - p.x, this.project(a.p).y - p.y),
      }))
      .filter((a) => a.d < 16)
      .sort((a, b) => a.d - b.d)[0]?.a;
  }
  private down(e: PointerEvent): void {
    if (
      !this.ready ||
      (e.target instanceof HTMLElement && e.target.closest("button"))
    )
      return;
    e.preventDefault();
    this.stage.focus();
    this.stage.setPointerCapture(e.pointerId);
    const p = this.point(e);
    if (e.button === 2 || e.button === 1 || e.altKey) {
      if (!Array.from(this.hands.hands.keys()).some((f) => f !== -2))
        this.orbit = { finger: e.pointerId, ...p };
      return;
    }
    if (e.button !== 0 || this.orbit) return;
    const pin = this.pinAt(p),
      hit = this.paper.pick(p, this.node);
    if (!pin && !hit) {
      this.orbit = { finger: e.pointerId, ...p };
      return;
    }
    if (this.hands.hands.has(-2)) this.hands.finish(-2, this.frame.anchors);
    if (!pin && this.frame.anchors.length >= 12) {
      this.message("固定点已满，请先松开一处。");
      return;
    }
    if (!this.hands.hands.size) this.checkpoint();
    if (this.mode === "pin" || e.shiftKey) {
      if (pin) {
        this.use({ op: "release", id: pin.id });
        this.hands.selected = null;
      } else if (hit) {
        const id = this.nextId++;
        this.use({
          op: "grip",
          id,
          u: hit.uv.x,
          v: hit.uv.y,
          target: [hit.p.x, hit.p.y, hit.p.z],
          pin: true,
        });
        this.hands.selected = id;
      }
      this.mode = "grab";
      this.save();
      this.draw();
      return;
    }
    const pick = pin
      ? { uv: { x: pin.uv[0], y: pin.uv[1] }, p: pin.p }
      : { uv: hit!.uv, p: [hit!.p.x, hit!.p.y, hit!.p.z] as Position };
    this.hands.begin(
      e.pointerId,
      pin?.id ?? this.nextId++,
      pick,
      p,
      this.mode === "press",
      pin,
    );
    this.pointer = e.pointerId;
    this.message(
      this.mode === "press"
        ? "正在向桌面压纸…"
        : "抓住了。滚轮调高，按 F 可以留住抓点。",
    );
    this.draw();
  }
  private move(e: PointerEvent): void {
    if (!this.ready) return;
    const p = this.point(e),
      hand = this.hands.hands.get(e.pointerId);
    if (hand) {
      if (hand.press) {
        const hit = this.paper.pick(p, this.node);
        if (hit)
          this.hands.move(hand.finger, [0, 0, 0], 0, {
            uv: hit.uv,
            p: [hit.p.x, hit.p.y, hit.p.z],
          });
      } else {
        const dx = p.x - hand.start.x,
          dy = p.y - hand.start.y,
          d = this.paper.displacement(dx, dy);
        this.hands.move(hand.finger, [d.x, d.y, 0], Math.hypot(dx, dy));
      }
    } else if (this.orbit?.finger === e.pointerId) {
      this.paper.paper.orbit(p.x - this.orbit.x, p.y - this.orbit.y);
      this.orbit = { finger: e.pointerId, ...p };
      this.paper.redraw();
    }
  }
  private up(e: PointerEvent): void {
    if (!this.ready) return;
    if (this.hands.hands.has(e.pointerId)) {
      this.hands.finish(e.pointerId, this.frame.anchors);
      if (this.pointer === e.pointerId) this.pointer = null;
      this.save();
      this.message(
        this.hands.selected !== null
          ? "抓点已留住。继续拖标记，或用右侧调高度。"
          : "已松手。Shift＋点击可固定另一侧。",
      );
    }
    if (this.orbit?.finger === e.pointerId) this.orbit = null;
    this.draw();
  }
  private wheel(e: WheelEvent): void {
    if (!this.ready) return;
    e.preventDefault();
    const id = this.hands.selected,
      a = this.frame.anchors.find((a) => a.id === id);
    if (a && this.mode !== "press") {
      const active = Array.from(this.hands.hands.values()).find(
        (h) => h.id === id,
      );
      if (!active) this.checkpoint();
      this.setHeight((active?.target[2] ?? a.p[2]) - e.deltaY * 0.00015);
    } else {
      this.paper.paper.zoom = Math.max(
        0.45,
        Math.min(2, this.paper.paper.zoom * Math.exp(-e.deltaY * 0.001)),
      );
      this.paper.paper.applyTransform();
      this.paper.redraw();
    }
  }
  private setHeight(z: number): void {
    const id = this.hands.selected,
      a = this.frame.anchors.find((a) => a.id === id);
    if (!a) return;
    if (!Array.from(this.hands.hands.values()).some((h) => h.id === id)) {
      this.hands.begin(
        -2,
        a.id,
        { uv: { x: a.uv[0], y: a.uv[1] }, p: a.p },
        { x: 0, y: 0 },
        false,
        a,
      );
    }
    this.hands.setHeight(a.id, Math.max(DESK_HEIGHT, Math.min(MAX_HEIGHT, z)));
    this.message("正在向目标高度抬纸。可转动视角；点“留住抓点”停在当前位置。");
    this.draw();
  }
  private key(e: KeyboardEvent): void {
    if (!this.ready || e.target instanceof HTMLInputElement) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      this.save(true);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      this.action("undo");
      return;
    }
    if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      this.hands.keepSelected();
      if (this.hands.hands.has(-2)) {
        this.hands.finish(-2, this.frame.anchors);
        this.save();
      }
      this.message("松开鼠标后留住这个抓点。");
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.action("release");
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.action("undo");
    }
  }
  private finish(): void {
    this.hands.finishAll(this.frame.anchors);
    this.pointer = null;
    this.orbit = null;
  }
  private checkpoint(): void {
    this.history.push(this.runtime.call({ op: "save" }).state!);
    if (this.history.length > 24) this.history.shift();
  }
  private save(announce = false): void {
    try {
      const state = this.runtime.call({ op: "save" }).state!,
        old = localStorage.getItem(KEY);
      if (old && old !== state) localStorage.setItem(KEY + ".backup", old);
      localStorage.setItem(KEY, state);
      this.savedAge = 0;
      this.root.querySelector("#save-state")!.textContent = "已保存在此浏览器";
      if (announce) this.message("已保存纸形、折痕与固定点。");
    } catch {
      this.message("本地保存失败，建议导出纸形文件。");
    }
  }
  private suspend(): void {
    if (!this.ready) return;
    this.finish();
    this.use({ op: "pause" });
    this.save();
    this.elapsed = 0;
  }
  private action(name: string): void {
    if (!this.ready) return;
    try {
      if (name === "keep") {
        this.hands.keepSelected();
        if (this.hands.hands.has(-2)) {
          this.hands.finish(-2, this.frame.anchors);
          this.save();
        }
        this.message("松开鼠标后留住抓点；也可以直接拖动已有固定标记。");
      }
      if (name === "release") {
        const id = this.hands.selected;
        if (id === null) return;
        this.checkpoint();
        this.finish();
        this.use({ op: "release", id });
        this.hands.selected = null;
        this.save();
        this.message("已松开选中的抓点。");
      }
      if (name === "save") this.save(true);
      if (name === "view") {
        this.paper.paper.reset();
        this.paper.paper.pitch = 48;
        this.paper.paper.yaw = -14;
        this.paper.paper.zoom = 0.9;
        this.paper.paper.applyTransform();
        this.paper.setFrame(this.frame, true);
      }
      if (name === "zoom-in" || name === "zoom-out") {
        this.paper.paper.zoom = Math.max(
          0.45,
          Math.min(
            2,
            this.paper.paper.zoom * (name === "zoom-in" ? 1.15 : 1 / 1.15),
          ),
        );
        this.paper.paper.applyTransform();
        this.paper.redraw();
      }
      if (name === "undo") {
        const state = this.history.pop();
        if (!state) {
          this.message("还没有可以撤销的操作。");
          return;
        }
        this.finish();
        this.use({ op: "load", state });
        this.hands.selected = null;
        this.save();
        this.message("已恢复上一操作前的纸形。");
      }
      if (name === "new") {
        this.checkpoint();
        this.finish();
        this.use({ op: "reset" });
        this.hands.selected = null;
        this.paused = false;
        this.paper.setFrame(this.frame, true);
        this.save();
        this.message("新的 A4 白纸已铺好。旧纸形可以撤销恢复。");
      }
      if (name === "pause") {
        this.paused = !this.paused;
        this.finish();
        this.elapsed = 0;
        this.message(
          this.paused ? "模拟已暂停，可继续观察纸形。" : "模拟继续。",
        );
      }
      if (name === "export") {
        const state = this.runtime.call({ op: "save" }).state!,
          url = URL.createObjectURL(new Blob([state], { type: "text/plain" })),
          a = document.createElement("a");
        a.href = url;
        a.download = "paper-studio.paper";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.message("纸形已导出，可在这里重新导入。");
      }
      if (name === "backup") {
        const state = localStorage.getItem(KEY + ".backup");
        if (!state) {
          this.message("暂无上一份本地备份。");
          return;
        }
        this.checkpoint();
        this.finish();
        this.use({ op: "load", state });
        this.hands.selected = null;
        this.save();
        this.message("已恢复上一份本地备份。");
      }
      this.draw();
    } catch (e) {
      this.message(`操作未完成：${String(e)}`);
    }
  }
  private message(s: string): void {
    this.status = s;
    const el = this.root?.querySelector("#paper-message");
    if (el) el.textContent = s;
  }
  private project(p: number[]): { x: number; y: number } {
    return this.paper.project(p, this.node);
  }
  private draw(): void {
    if (!this.ready) return;
    const a = this.frame.anchors.find((a) => a.id === this.hands.selected),
      slider = this.root.querySelector<HTMLInputElement>("#grip-height")!;
    slider.disabled = !a || this.mode === "press";
    const adjusting = Array.from(this.hands.hands.values()).find(
      (h) => h.id === a?.id && h.height !== null,
    );
    if (document.activeElement !== slider)
      slider.value = String(
        Math.round((adjusting?.target[2] ?? a?.p[2] ?? 0) * 1000),
      );
    this.root.querySelector("#height-value")!.textContent = a
      ? `${Math.round(a.p[2] * 1000)} mm${adjusting ? ` → ${Math.round(adjusting.target[2] * 1000)}` : ""}`
      : "未选中";
    this.root.querySelector("#selection-hint")!.textContent = a
      ? a.pin
        ? "已固定 · 直接拖动标记可调整"
        : "抓持中 · 滚轮调高，F 留住抓点"
      : "先固定一处，或抓纸时按 F 留住抓点。";
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-mode]",
    ))
      b.setAttribute("aria-pressed", String(b.dataset.mode === this.mode));
    this.root.querySelector<HTMLButtonElement>(
      '[data-action="release"]',
    )!.disabled = !a;
    this.root.querySelector<HTMLButtonElement>(
      '[data-action="keep"]',
    )!.disabled = !this.hands.hands.size || this.mode === "press";
    this.root.querySelector<HTMLButtonElement>(
      '[data-action="undo"]',
    )!.disabled = !this.history.length;
    this.root.querySelector('[data-action="pause"]')!.textContent = this.paused
      ? "继续"
      : "暂停";
    this.stage.classList.toggle("grabbing", this.hands.hands.size > 0);
    this.stage.classList.toggle("pressing", this.mode === "press");
    let svg = "";
    for (const anchor of this.frame.anchors) {
      const p = this.project(anchor.p),
        x = p.x + 195,
        y = this.h / 2 - p.y,
        active = anchor.id === this.hands.selected,
        fill = anchor.pin ? "#285a59" : "#e58263";
      svg += `<circle cx="${x}" cy="${y}" r="${active ? 7 : 5}" fill="#fff9ed" stroke="${fill}" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="1.5" fill="${fill}"/>`;
      if (active) {
        const t = this.project(anchor.target);
        svg += `<path d="M${x},${y} L${t.x + 195},${this.h / 2 - t.y}" stroke="#e58263" stroke-width="1" stroke-dasharray="2 2"/><circle cx="${t.x + 195}" cy="${this.h / 2 - t.y}" r="3" fill="none" stroke="#e58263"/>`;
      }
    }
    this.overlay.innerHTML = svg;
    const s = this.frame.stats;
    this.root.querySelector("#paper-stats")!.textContent =
      `${this.frame.positions.length / 3} 节点 · ${s.ms.toFixed(1)} ms/次推进 · 峰值拉伸 ${(s.strainMax * 100).toFixed(2)}% · 残余铰链 ${s.plastic}`;
    this.root.dataset.ready = "true";
    this.root.dataset.pins = String(
      this.frame.anchors.filter((a) => a.pin).length,
    );
    this.root.dataset.grips = String(
      this.frame.anchors.filter((a) => !a.pin).length,
    );
    this.root.dataset.height = String(
      Math.max(...this.frame.positions.filter((_, i) => i % 3 === 2)),
    );
    this.root.dataset.plastic = String(s.plastic);
  }
  update(dt: number): void {
    if (!this.ready || document.hidden) return;
    this.time += dt;
    this.savedAge += dt;
    try {
      const heightHand = this.hands.hands.get(-2),
        actual = this.frame.anchors.find((a) => a.id === heightHand?.id);
      if (
        heightHand &&
        actual &&
        Math.abs(actual.p[2] - heightHand.target[2]) < 0.001
      ) {
        this.hands.finish(-2, this.frame.anchors);
        this.save();
        this.message("已到达目标高度并留住抓点。");
      }
      this.paper.paper.update(dt);
      if (!this.paused) {
        this.elapsed += dt;
        if (this.elapsed >= 1 / 30) {
          const step = Math.min(this.elapsed, 1);
          this.use({ op: "advance", dt: step });
          this.elapsed -= step;
        }
      }
      if (this.savedAge > 10 && !this.hands.hands.size) this.save();
      this.draw();
    } catch (e) {
      this.paused = true;
      this.message(`模拟已暂停：${String(e)}。可撤销或换新纸。`);
    }
  }
  onDestroy(): void {
    if (this.ready) this.suspend();
    this.ready = false;
    this.resized?.disconnect();
    for (const off of this.listeners) off();
    this.paper?.destroy();
  }
}
