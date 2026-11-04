import {
  _decorator,
  Component,
  Node,
  Canvas,
  Camera,
  Color,
  Graphics,
  Label,
  UITransform,
  Layers,
  view,
  ResolutionPolicy,
  EventTouch,
  game,
  Game,
  sys,
  native,
  profiler,
  Vec3,
} from "cc";
import { PaperLabView, LabFrame } from "./PaperLabView";
import {
  PaperHands,
  GripPick,
  PaperAnchor,
  Position,
  DESK_HEIGHT,
  MAX_HEIGHT,
} from "./core/PaperHands";
const { ccclass } = _decorator,
  KEY = "origami.paper-lab.v2",
  ink = "#264D51",
  muted = "#6D8381";
const color = (s: string) => new Color().fromHEX(s);
@ccclass("PaperLab")
export class PaperLab extends Component {
  onLegacy: (() => void) | null = null;
  private paper!: PaperLabView;
  private canvas!: Node;
  private back!: Node;
  private root!: Node;
  private markers!: Graphics;
  private h = 844;
  private frame!: LabFrame;
  private notice!: Label;
  private metrics!: Label;
  private mode: "grab" | "pin" | "press" = "grab";
  private nextId = 1;
  private hands = new PaperHands((q) => this.use(q));
  private heightTouch: {
    finger: number;
    id: number;
    y: number;
    height: number;
    xy: [number, number];
    ownsHand: boolean;
  } | null = null;
  private heightLabel!: Label;
  private heightGraphics!: Graphics;
  private diagnostic = false;
  private lastPressureHeight = 0;
  private peakHands = 0;
  private orbit: { x: number; y: number; distance: number } | null = null;
  private elapsed = 0;
  private savedAgo = 0;
  private paused = false;
  private error = "";
  private info = "";
  private infoSeen = "";
  private infoAge = 0;
  private history: string[] = [];
  private lastStatus = "";
  private restored = false;
  start(): void {
    view.setDesignResolutionSize(390, 844, ResolutionPolicy.FIXED_WIDTH);
    profiler.hideStats();
    this.h = view.getVisibleSize().height;
    this.back = this.makeCanvas("Lab desk", Layers.Enum.UI_2D, 0, true);
    this.paper = new PaperLabView(this.node);
    this.canvas = this.makeCanvas(
      "Lab controls",
      Layers.Enum.UI_3D,
      200,
      false,
    );
    try {
      const state = sys.localStorage.getItem(KEY);
      this.frame = this.call(state ? { op: "load", state } : { op: "reset" });
      this.restored = !!state;
    } catch (e) {
      this.error = String(e);
      this.frame = this.call({ op: "state" });
      this.info = "存档未能读取，保留原文件；可尝试恢复备份。";
    }
    this.nextId = 1 + Math.max(0, ...this.frame.anchors.map((a) => a.id));
    this.layout();
    this.paper.setFrame(this.frame, true);
    this.draw();
    game.on(Game.EVENT_HIDE, this.hide, this);
    game.on(Game.EVENT_SHOW, this.show, this);
  }
  private call(q: object): LabFrame {
    if (!sys.isNative || sys.os !== sys.OS.IOS)
      throw new Error("白纸内核实验目前使用 iOS 原生入口");
    const value = native.reflection.callStaticMethod(
      "OrigamiPaperLab",
      "command:",
      JSON.stringify(q),
    );
    const result = JSON.parse(value) as LabFrame;
    if (!result.ok) throw new Error(result.error || "物理内核返回错误");
    return result;
  }
  private use(q: object): void {
    try {
      const result = this.call(q);
      this.frame = { ...this.frame, ...result };
      this.nextId = Math.max(
        this.nextId,
        1 + Math.max(0, ...this.frame.anchors.map((a) => a.id)),
      );
      this.error = "";
      this.paper.setFrame(this.frame);
      this.draw();
    } catch (e) {
      this.error = String(e);
      this.paused = true;
      this.draw();
    }
  }
  private makeCanvas(
    name: string,
    layer: number,
    priority: number,
    solid: boolean,
  ): Node {
    const camNode = new Node(name + " camera");
    this.node.addChild(camNode);
    camNode.setPosition(0, 0, 1000);
    const cam = camNode.addComponent(Camera);
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = this.h / 2;
    cam.near = 0.1;
    cam.far = 2000;
    cam.visibility = layer;
    cam.clearFlags = solid
      ? Camera.ClearFlag.SOLID_COLOR
      : Camera.ClearFlag.DEPTH_ONLY;
    cam.clearColor = color("#F8F3E9");
    const n = new Node(name);
    this.node.addChild(n);
    n.layer = layer;
    n.addComponent(UITransform).setContentSize(390, this.h);
    n.addComponent(Canvas).cameraComponent = cam;
    cam.priority = (1 << 30) + priority;
    return n;
  }
  private ui(
    x: number,
    y: number,
    w: number,
    h: number,
    parent = this.root,
  ): Node {
    const n = new Node("Lab control");
    parent.addChild(n);
    n.layer = parent.layer;
    n.setPosition(x, y);
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }
  private text(
    s: string,
    x: number,
    y: number,
    size = 14,
    fill = ink,
    w = 350,
    h = 34,
    parent = this.root,
  ): Label {
    const n = this.ui(x, y, w, h, parent),
      l = n.addComponent(Label);
    l.string = s;
    l.fontSize = size;
    l.lineHeight = size * 1.3;
    l.fontFamily = "AvenirNext-DemiBold";
    l.useSystemFont = true;
    l.color = color(fill);
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.SHRINK;
    return l;
  }
  private button(
    s: string,
    x: number,
    y: number,
    w: number,
    fn: () => void,
    active = false,
    duringGrab = false,
  ): void {
    const n = this.ui(x, y, w, 36),
      g = n.addComponent(Graphics);
    g.fillColor = color(active ? ink : "#FFFEF8");
    g.roundRect(-w / 2, -18, w, 36, 14);
    g.fill();
    this.text(s, 0, 0, 12, active ? "#FFFEF8" : ink, w - 8, 34, n);
    n.on(Node.EventType.TOUCH_END, () => {
      if (!this.hands.hands.size || duringGrab) fn();
    });
  }
  private layout(): void {
    this.root?.destroy();
    this.root = this.ui(0, 0, 390, this.h, this.canvas);
    const top = this.h / 2,
      bottom = -top;
    this.text("白纸 · 物理实验", -62, top - 62, 23, ink, 240, 42);
    this.button("旧样板", 132, top - 62, 80, () => {
      this.save();
      this.onLegacy?.();
    });
    this.text(
      "A4 · 210 × 297 mm · 材料参数未校准",
      0,
      top - 99,
      11,
      muted,
      350,
      26,
    );
    this.paper.screenHeight = this.h;
    this.paper.viewport(142, Math.max(170, this.h - 270), this.h);
    const touch = this.ui(0, 0, 350, this.h - 255);
    touch.setPosition(0, 14 / 2);
    touch.on(Node.EventType.TOUCH_START, this.touchStart, this);
    touch.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
    touch.on(Node.EventType.TOUCH_END, this.touchEnd, this);
    touch.on(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
    this.markers = this.ui(0, 0, 390, this.h).addComponent(Graphics);
    this.button(
      "抓持",
      -120,
      bottom + 91,
      108,
      () => {
        this.mode = "grab";
        this.layout();
      },
      this.mode === "grab",
    );
    this.button(
      "固定",
      0,
      bottom + 91,
      116,
      () => {
        if (this.hands.hands.size) {
          this.hands.keepSelected();
          this.info = "已留住抓点，松手后保持；直接拖动标记可调整";
        } else {
          this.mode = this.mode === "pin" ? "grab" : "pin";
          this.layout();
        }
      },
      this.mode === "pin",
      true,
    );
    this.button(
      "局部压痕",
      120,
      bottom + 91,
      108,
      () => {
        this.mode = "press";
        this.layout();
      },
      this.mode === "press",
    );
    this.button("撤销", -140, bottom + 46, 60, () => this.undo());
    this.button("视角复位", -62, bottom + 46, 88, () => {
      this.paper.paper.reset();
      this.paper.paper.zoom = 0.9;
      this.paper.paper.pitch = 52;
      this.paper.paper.applyTransform();
      this.paper.setFrame(this.frame, true);
    });
    this.button("保存", 16, bottom + 46, 56, () => this.save(true));
    this.button("新纸", 86, bottom + 46, 56, () => {
      this.checkpoint();
      this.use({ op: "reset" });
      this.nextId = 1;
      this.hands.selected = null;
      this.peakHands = 0;
      this.paused = false;
      this.restored = false;
      this.info = "新 A4 白纸";
      this.paper.setFrame(this.frame, true);
      this.save();
    });
    this.button("恢复", 151, bottom + 46, 56, () => this.restore());
    this.metrics = this.text("", 0, top - 126, 10, muted, 350, 24);
    this.metrics.node.on(Node.EventType.TOUCH_END, () => {
      this.diagnostic = !this.diagnostic;
      this.draw();
    });
    const rail = this.ui(156, 0, 34, 230);
    this.heightGraphics = rail.addComponent(Graphics);
    this.heightLabel = this.text("提起\n↕\n放下", 156, 0, 11, muted, 34, 94);
    rail.on(Node.EventType.TOUCH_START, this.heightStart, this);
    rail.on(Node.EventType.TOUCH_MOVE, this.heightMove, this);
    rail.on(Node.EventType.TOUCH_END, this.heightEnd, this);
    rail.on(Node.EventType.TOUCH_CANCEL, this.heightEnd, this);
    this.notice = this.text("", 0, bottom + 132, 11, ink, 350, 38);
    this.draw();
  }
  private checkpoint(): void {
    try {
      const state = this.call({ op: "save" }).state!;
      this.history.push(state);
      if (this.history.length > 16) this.history.shift();
    } catch (e) {
      this.error = String(e);
    }
  }
  private undo(): void {
    const state = this.history.pop();
    if (!state) return;
    this.use({ op: "load", state });
    this.hands.selected = null;
    this.paused = false;
    this.info = "已恢复上一操作前的连续状态";
    this.save();
  }
  private save(announce = false): void {
    try {
      const result = this.call({ op: "save" });
      const previous = sys.localStorage.getItem(KEY);
      if (previous) sys.localStorage.setItem(KEY + ".backup", previous);
      sys.localStorage.setItem(KEY, result.state!);
      this.savedAgo = 0;
      if (announce) this.info = "已保存纸形与折痕";
    } catch (e) {
      this.error = "保存失败：" + String(e);
    }
    this.draw();
  }
  private restore(): void {
    const state = sys.localStorage.getItem(KEY);
    if (!state) return;
    this.checkpoint();
    try {
      this.use({ op: "load", state });
      this.hands.selected = null;
      if (this.error) {
        const backup = sys.localStorage.getItem(KEY + ".backup");
        if (backup) this.use({ op: "load", state: backup });
      }
      this.paused = !!this.error;
      this.restored = !this.error;
      this.info = this.error ? "无法恢复，保留原存档" : "已恢复纸形与折痕";
    } catch (e) {
      this.error = String(e);
    }
    this.draw();
  }
  private point(e: EventTouch): { x: number; y: number } {
    const p = e.getUILocation();
    return { x: p.x - 195, y: p.y - this.h / 2 };
  }
  private gripPick(hit: { uv: { x: number; y: number }; p: Vec3 }): GripPick {
    return { uv: hit.uv, p: [hit.p.x, hit.p.y, hit.p.z] };
  }
  private pinAt(p: { x: number; y: number }): PaperAnchor | undefined {
    return this.frame.anchors
      .filter((a) => a.pin)
      .map((a) => ({
        a,
        distance: Math.hypot(
          this.paper.project(a.p, this.canvas).x - p.x,
          this.paper.project(a.p, this.canvas).y - p.y,
        ),
      }))
      .filter((v) => v.distance < 22)
      .sort((a, b) => a.distance - b.distance)[0]?.a;
  }
  private touchStart(e: EventTouch): void {
    if (!e.touch || this.orbit) return;
    const p = this.point(e),
      finger = e.touch.getID();
    const pin = this.pinAt(p);
    const hit = this.paper.pick(p, this.canvas);
    this.info = "";
    if (pin || hit) {
      if (!pin && this.frame.anchors.length >= 12) {
        this.info = "固定点已满，点固定工具解除一处后再抓纸";
        return;
      }
      if (!this.hands.hands.size) this.checkpoint();
      if (this.mode === "pin") {
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
        this.layout();
        return;
      }
      const pick = pin
        ? { uv: { x: pin.uv[0], y: pin.uv[1] }, p: [...pin.p] as Position }
        : this.gripPick(hit!);
      this.hands.begin(
        finger,
        pin?.id ?? this.nextId++,
        pick,
        p,
        this.mode === "press",
        pin,
      );
      this.peakHands = Math.max(this.peakHands, this.hands.hands.size);
    } else if (
      !this.hands.hands.size &&
      !this.heightTouch &&
      e.getAllTouches().length === 1
    ) {
      this.orbit = { x: p.x, y: p.y, distance: 0 };
    }
  }
  private touchMove(e: EventTouch): void {
    if (!e.touch) return;
    const p = this.point(e),
      hand = this.hands.hands.get(e.touch.getID());
    if (hand) {
      if (hand.press) {
        const hit = this.paper.pick(p, this.canvas);
        this.hands.move(
          hand.finger,
          [0, 0, 0],
          0,
          hit ? this.gripPick(hit) : undefined,
        );
      } else {
        const dx = p.x - hand.start.x,
          dy = p.y - hand.start.y;
        const d = this.paper.displacement(dx, dy);
        this.hands.move(hand.finger, [d.x, d.y, 0], Math.hypot(dx, dy));
      }
      return;
    }
    const touches = e.getAllTouches();
    if (this.orbit) {
      if (touches.length >= 2) {
        const a = touches[0].getUILocation(),
          b = touches[1].getUILocation(),
          center = {
            x: (a.x + b.x) / 2 - 195,
            y: (a.y + b.y) / 2 - this.h / 2,
          },
          dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.orbit.distance > 0) {
          this.paper.paper.orbit(
            center.x - this.orbit.x,
            center.y - this.orbit.y,
          );
          this.paper.paper.zoom = Math.max(
            0.55,
            Math.min(2, (this.paper.paper.zoom * dist) / this.orbit.distance),
          );
          this.paper.paper.applyTransform();
        }
        this.orbit = { ...center, distance: dist };
      } else {
        this.paper.paper.orbit(p.x - this.orbit.x, p.y - this.orbit.y);
        this.orbit = { x: p.x, y: p.y, distance: 0 };
      }
      this.paper.redraw();
    }
  }
  private touchEnd(e: EventTouch): void {
    if (!e.touch) return;
    const finger = e.touch.getID();
    if (this.hands.hands.has(finger)) {
      const h = this.hands.hands.get(finger)!;
      if (h.press)
        this.lastPressureHeight =
          this.frame.anchors.find((a) => a.id === h.id)?.p[2] ?? 0;
      this.hands.finish(finger, this.frame.anchors);
      if (!this.hands.hands.size) this.save();
    }
    if (e.getAllTouches().filter((t) => t.getID() !== finger).length === 0)
      this.orbit = null;
  }
  private touchCancel(e: EventTouch): void {
    // Cancellation releases only that finger; the other hand keeps its grip.
    this.touchEnd(e);
  }
  private heightStart(e: EventTouch): void {
    if (!e.touch || this.heightTouch || this.orbit || this.mode === "press")
      return;
    const id = this.hands.selected,
      a = this.frame.anchors.find((a) => a.id === id);
    if (!a) {
      this.info = "先抓住纸张，或点固定标记，再在这里上下调高度";
      return;
    }
    if (!this.hands.hands.size) this.checkpoint();
    const hand = Array.from(this.hands.hands.values()).find((h) => h.id === id);
    // Moving a parked pin uses the same force-limited grip as direct touch;
    // keep the actual resulting position when the rail finger lifts.
    if (!hand && a.pin) {
      this.hands.begin(
        e.touch.getID(),
        a.id,
        { uv: { x: a.uv[0], y: a.uv[1] }, p: a.p },
        this.point(e),
        false,
        a,
      );
    }
    this.heightTouch = {
      finger: e.touch.getID(),
      id: a.id,
      y: this.point(e).y,
      height: hand?.target[2] ?? a.p[2],
      xy: [a.p[0], a.p[1]],
      ownsHand: !hand,
    };
  }
  private heightMove(e: EventTouch): void {
    const h = this.heightTouch;
    if (!h || !e.touch || h.finger !== e.touch.getID()) return;
    const z = Math.max(
      DESK_HEIGHT,
      Math.min(MAX_HEIGHT, h.height + (this.point(e).y - h.y) * 0.001),
    );
    if (Array.from(this.hands.hands.values()).some((v) => v.id === h.id))
      this.hands.setHeight(h.id, z);
    else if (this.frame.anchors.some((a) => a.id === h.id && a.pin)) {
      this.use({ op: "move", id: h.id, target: [h.xy[0], h.xy[1], z] });
    }
  }
  private heightEnd(e: EventTouch): void {
    if (!e.touch || this.heightTouch?.finger !== e.touch.getID()) return;
    if (this.heightTouch.ownsHand)
      this.hands.finish(e.touch.getID(), this.frame.anchors);
    this.heightTouch = null;
    this.save();
  }
  private hide(): void {
    this.hands.finishAll(this.frame.anchors);
    this.heightTouch = null;
    this.orbit = null;
    this.use({ op: "pause" });
    this.save();
    this.paused = true;
    this.elapsed = 0;
  }
  private show(): void {
    if (!this.error) this.paused = false;
    this.elapsed = 0;
  }
  update(dt: number): void {
    if (!this.frame || !this.paper) return;
    const height = view.getVisibleSize().height;
    if (Math.abs(height - this.h) > 1) {
      this.h = height;
      this.back.getComponent(Canvas)!.cameraComponent!.orthoHeight = height / 2;
      this.canvas.getComponent(Canvas)!.cameraComponent!.orthoHeight =
        height / 2;
      this.hands.finishAll(this.frame.anchors);
      this.heightTouch = null;
      this.orbit = null;
      this.use({ op: "pause" });
      this.layout();
    }
    this.paper.paper.update(dt);
    this.savedAgo += dt;
    if (this.info !== this.infoSeen) {
      this.infoSeen = this.info;
      this.infoAge = 0;
    }
    if (this.info) {
      this.infoAge += dt;
      if (this.infoAge > 3) this.info = "";
    }
    if (!this.paused) {
      this.elapsed += dt;
      if (this.elapsed >= 1 / 30) {
        const elapsed = this.elapsed;
        this.elapsed = 0;
        this.use({ op: "advance", dt: elapsed });
        if (this.frame.stats.plastic > 0) this.use({ op: "state" });
      }
    }
    if (
      this.savedAgo > 10 &&
      !this.hands.hands.size &&
      !this.heightTouch &&
      !this.error
    )
      this.save();
    this.draw();
  }
  private draw(): void {
    if (!this.frame || !this.metrics || !this.notice) return;
    const s = this.frame.stats;
    this.metrics.string = this.diagnostic
      ? `形变 P95 ${(s.strainP95 * 100).toFixed(2)}% · 峰值 ${(s.strainMax * 100).toFixed(2)}% · 内核 ${s.ms.toFixed(1)} ms · 痕 ${s.plastic}`
      : "双指可分别抓纸 · 点此查看实验数据";
    this.notice.string =
      this.error ||
      this.info ||
      (this.mode === "pin"
        ? "点纸张放置固定点；点已有标记可解除"
        : this.mode === "press"
          ? "按住弯折区域向桌面压下；移动手指可抹压"
          : this.hands.hands.size
            ? "停住仍可继续拖动 · 右侧调高度\n想留住位置，按住纸张时点“固定”"
            : "拖动纸角提起 · 直接拖动固定点可调整\n空白处拖动观察 · 右侧上下调抓点高度");
    const selected = this.frame.anchors.find(
      (a) => a.id === this.hands.selected,
    );
    this.heightLabel.string = selected
      ? `提起\n${Math.round(selected.p[2] * 1000)} mm\n放下`
      : "提起\n↕\n放下";
    this.heightLabel.color = color(selected ? ink : muted);
    const rail = this.heightGraphics;
    rail.clear();
    rail.fillColor = color(selected ? "#E5ECE5" : "#F0EDE4");
    rail.roundRect(-17, -115, 34, 230, 17);
    rail.fill();
    rail.strokeColor = color(selected ? "#629590" : "#CAD2C9");
    rail.lineWidth = 3;
    rail.moveTo(0, -92);
    rail.lineTo(0, -60);
    rail.stroke();
    rail.moveTo(0, 60);
    rail.lineTo(0, 92);
    rail.stroke();
    if (selected) {
      const y = -92 + Math.min(1, selected.p[2] / MAX_HEIGHT) * 184;
      rail.fillColor = color(ink);
      rail.circle(0, y, 6);
      rail.fill();
    }
    this.paper.markers(
      this.markers,
      this.frame,
      this.canvas,
      this.hands.selected,
    );
    const p = this.frame.positions,
      center = this.paper.project([p[0], p[1], p[2]], this.canvas),
      opposite = this.paper.project(
        [p[p.length - 3], p[p.length - 2], p[p.length - 1]],
        this.canvas,
      );
    const mean: Position = [0, 0, 0];
    for (let i = 0; i < p.length; i += 3) {
      mean[0] += p[i];
      mean[1] += p[i + 1];
      mean[2] += p[i + 2];
    }
    const count = p.length / 3;
    const focus = this.paper.project(
      mean.map((v) => v / count),
      this.canvas,
    );
    const summary = `lab|nodes:${p.length / 3}|pins:${this.frame.anchors.filter((a) => a.pin).length}|grips:${this.frame.anchors.filter((a) => !a.pin).length}|plastic:${s.plastic}|strain:${s.strainP95.toFixed(5)}|max:${s.strainMax.toFixed(5)}|height:${Math.max(...this.frame.positions.filter((_, i) => i % 3 === 2)).toFixed(5)}|time:${s.time.toFixed(1)}|az:${p[2].toFixed(5)}|bz:${p[p.length - 1].toFixed(5)}|hands:${this.hands.hands.size}|peakHands:${this.peakHands}|focus:${Math.round(focus.x + 195 - 36)},${Math.round(this.h / 2 - focus.y - 36)},72,72|selected:${this.hands.selected ?? -1}|pressheight:${this.lastPressureHeight.toFixed(5)}|yaw:${this.paper.paper.yaw.toFixed(1)}|pitch:${this.paper.paper.pitch.toFixed(1)}|restored:${this.restored}|error:${!!this.error}|a:${Math.round(center.x + 195)},${Math.round(this.h / 2 - center.y)}|b:${Math.round(opposite.x + 195)},${Math.round(this.h / 2 - opposite.y)}`;
    if (summary !== this.lastStatus) {
      this.lastStatus = summary;
      native.reflection.callStaticMethod(
        "OrigamiAccessibility",
        "updateState:",
        summary,
      );
    }
  }
  onDestroy(): void {
    game.off(Game.EVENT_HIDE, this.hide, this);
    game.off(Game.EVENT_SHOW, this.show, this);
    if (this.frame) this.hands.finishAll(this.frame.anchors);
    this.paper?.destroy();
  }
}
