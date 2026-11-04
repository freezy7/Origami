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
  view,
  ResolutionPolicy,
  Layers,
  EventTouch,
  game,
  Game,
  sys,
  native,
  profiler,
} from "cc";
import {
  Face,
  Fold,
  STEPS,
  options,
  paperAt,
  foldPaper,
  Puzzle,
} from "./core/PaperModel";
import { PaperView } from "./PaperView";
import { PaperLab } from "./PaperLab";
import { WebPaperLab } from "./WebPaperLab";
import { FreeFoldLab } from "./FreeFoldLab";
import { DeviceInput } from "./DeviceInput";
import {
  XY,
  clamp,
  foldGrip,
  creaseSegment,
  distanceToSegment,
  dragProgress,
  MotionFold,
  MotionMode,
  NO_DEVICE,
} from "./core/Interaction";
const { ccclass } = _decorator;
const C = {
  bg: "#FFF8EC",
  ink: "#244B50",
  muted: "#718D8E",
  white: "#FFFEF9",
  mint: "#D4F0DF",
  yellow: "#FFE5AC",
  coral: "#FF8965",
  purple: "#E7DCF8",
};
const color = (s: string) => new Color().fromHEX(s),
  KEY = "origami.puppy.v1";
type Anim = {
  action: Fold;
  base: Face[];
  from: number;
  to: number;
  elapsed: number;
  duration: number;
  commit: boolean;
};
@ccclass("OrigamiGame")
export class OrigamiGame extends Component {
  private puzzle = new Puzzle();
  private paper!: PaperView;
  private device!: DeviceInput;
  private back!: Node;
  private front!: Node;
  private bg!: Node;
  private uiRoot!: Node;
  private overlay!: Graphics;
  private meter!: Label;
  private armLabel: Label | null = null;
  private h = 844;
  private selected = -1;
  private page: "studio" | "journal" | "tutorial" = "studio";
  private observing = false;
  private language: "zh" | "en" = "zh";
  private animation: Anim | null = null;
  private paused: Anim | null = null;
  private playing = false;
  private drag: {
    start: XY;
    action: Fold;
    base: Face[];
    axis: XY;
    travel: number;
    progress: number;
  } | null = null;
  private orbit: XY | null = null;
  private pinch: { x: number; y: number; distance: number } | null = null;
  private multi = false;
  private motion = new MotionFold();
  private mode: MotionMode = "touch";
  private motionAction: Fold | null = null;
  private sample = { ...NO_DEVICE };
  private panel = false;
  private hintOpen = false;
  private saveError = false;
  private initialized = false;
  private status = "";
  private reward = 0;
  private t(en: string, zh: string): string {
    return this.language === "zh" ? zh : en;
  }
  start(): void {
    if (!sys.isNative) document.getElementById("paper-boot")?.remove();
    if (
      !sys.isNative &&
      !new URLSearchParams(window.location.search).has("legacy")
    ) {
      const node = new Node("Web paper laboratory");
      this.node.addChild(node);
      if (new URLSearchParams(window.location.search).has("physics"))
        node.addComponent(WebPaperLab);
      else node.addComponent(FreeFoldLab);
      return;
    }
    const legacy =
      sys.isNative && sys.os === sys.OS.IOS
        ? native.reflection.callStaticMethod(
            "OrigamiPaperLab",
            "legacyRequested:",
            "",
          ) === "yes"
        : true;
    if (!legacy) {
      const node = new Node("White paper laboratory");
      this.node.addChild(node);
      const lab = node.addComponent(PaperLab);
      lab.onLegacy = () => {
        node.destroy();
        this.startLegacy();
      };
      return;
    }
    this.startLegacy();
  }
  private startLegacy(): void {
    view.setDesignResolutionSize(390, 844, ResolutionPolicy.FIXED_WIDTH);
    profiler.hideStats();
    this.h = view.getVisibleSize().height;
    try {
      this.puzzle = Puzzle.restore(sys.localStorage.getItem(KEY));
      const prefs = JSON.parse(
        sys.localStorage.getItem("origami.preferences") || "{}",
      );
      this.language = prefs.language === "en" ? "en" : "zh";
    } catch {
      this.saveError = true;
    }
    this.back = this.canvas("Paper desk", Layers.Enum.UI_2D, 0, true);
    this.paper = new PaperView(this.node);
    this.front = this.canvas("Tools", Layers.Enum.UI_3D, 200, false);
    this.device = new DeviceInput(this.node);
    try {
      this.device.sound =
        JSON.parse(sys.localStorage.getItem("origami.preferences") || "{}")
          .sound !== false;
    } catch {}
    this.initialized = true;
    this.render();
    game.on(Game.EVENT_HIDE, this.onHide, this);
    if (sys.isBrowser)
      (globalThis as any).__origami = { snapshot: () => this.puzzle.save() };
  }
  onDestroy(): void {
    game.off(Game.EVENT_HIDE, this.onHide, this);
    this.device?.stop();
    this.paper?.destroy();
  }
  private onHide(): void {
    this.animation = null;
    this.paused = null;
    this.playing = false;
    this.cancelInput();
    this.mode = "touch";
    this.device.stop();
    this.save();
    this.render();
  }
  private save(): void {
    try {
      sys.localStorage.setItem(KEY, JSON.stringify(this.puzzle.save()));
      sys.localStorage.setItem(
        "origami.preferences",
        JSON.stringify({ language: this.language, sound: this.device.sound }),
      );
      this.saveError = false;
    } catch {
      this.saveError = true;
    }
  }
  private canvas(
    name: string,
    layer: number,
    priority: number,
    solid: boolean,
  ): Node {
    const c = new Node(name + " camera");
    this.node.addChild(c);
    c.setPosition(0, 0, 1000);
    const camera = c.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = this.h / 2;
    camera.near = 0.1;
    camera.far = 2000;
    camera.visibility = layer;
    camera.clearFlags = solid
      ? Camera.ClearFlag.SOLID_COLOR
      : Camera.ClearFlag.DEPTH_ONLY;
    camera.clearColor = color(C.bg);
    const n = new Node(name);
    this.node.addChild(n);
    n.layer = layer;
    n.addComponent(UITransform).setContentSize(390, this.h);
    n.addComponent(Canvas).cameraComponent = camera;
    camera.priority = (1 << 30) + priority;
    return n;
  }
  private ui(
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    parent = this.uiRoot,
  ): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = parent.layer;
    n.setPosition(x, y);
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }
  private box(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    r = 18,
    parent = this.uiRoot,
  ): Node {
    const n = this.ui("Card", x, y, w, h, parent),
      g = n.addComponent(Graphics);
    g.fillColor = color(fill);
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();
    return n;
  }
  private text(
    s: string,
    x: number,
    y: number,
    size = 14,
    fill = C.ink,
    w = 330,
    h = 34,
    parent = this.uiRoot,
  ): Label {
    const n = this.ui("Text", x, y, w, h, parent),
      l = n.addComponent(Label);
    l.string = s;
    l.fontSize = size;
    l.lineHeight = size * 1.3;
    l.color = color(fill);
    l.fontFamily = size >= 22 ? "ArialRoundedMTBold" : "AvenirNext-DemiBold";
    l.useSystemFont = true;
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
    primary = false,
    enabled = true,
  ): Label {
    const n = this.box(
      x,
      y,
      w,
      36,
      enabled ? (primary ? C.ink : C.white) : "#EBE7DE",
      15,
    );
    const label = this.text(
      s,
      0,
      0,
      12,
      enabled ? (primary ? C.white : C.ink) : C.muted,
      w - 8,
      32,
      n,
    );
    n.on(Node.EventType.TOUCH_END, () => {
      if (enabled && !this.drag) fn();
    });
    return label;
  }
  private cancelInput(): void {
    this.drag = null;
    this.orbit = null;
    this.pinch = null;
    this.multi = false;
    this.motion.cancel();
    this.motionAction = null;
  }
  private navigate(page: typeof this.page): void {
    this.animation = null;
    this.paused = null;
    this.playing = false;
    this.cancelInput();
    this.page = page;
    this.panel = false;
    this.hintOpen = false;
    this.observing = false;
    this.paper.reset();
    this.render();
  }
  private faces(): Face[] {
    if (this.page === "journal")
      return this.puzzle.complete ? paperAt(4) : paperAt(0);
    if (this.page === "tutorial") {
      const a = this.animation ?? this.paused;
      if (a) {
        const t = clamp(a.elapsed / a.duration);
        return foldPaper(
          a.base,
          a.action,
          a.from + (a.to - a.from) * t * t * (3 - 2 * t),
        );
      }
      return paperAt(this.puzzle.tutorialStep);
    }
    return this.puzzle.faces;
  }
  private actions(): Fold[] {
    if (this.page === "tutorial")
      return this.puzzle.tutorialStep < 4
        ? [STEPS[this.puzzle.tutorialStep]]
        : [];
    return this.page === "studio" && !this.puzzle.wrong && !this.puzzle.finished
      ? options(this.puzzle.step)
      : [];
  }
  private action(): Fold | null {
    const a = this.actions();
    return a.length === 1 ? a[0] : (a[this.selected] ?? null);
  }
  private draw(faces = this.faces()): void {
    this.paper.render(
      faces,
      this.animation || this.drag || this.motion.armed ? [] : this.actions(),
      this.actions().length === 1 ? 0 : this.selected,
      this.page === "journal"
        ? this.puzzle.complete
        : this.page === "tutorial"
          ? this.puzzle.tutorialStep === 4
          : this.puzzle.finished,
    );
  }
  private render(): void {
    if (!this.initialized) return;
    this.armLabel = null;
    this.bg?.destroy();
    this.uiRoot?.destroy();
    this.bg = this.ui("Desk", 0, 0, 390, this.h, this.back);
    this.uiRoot = this.ui("Tools", 0, 0, 390, this.h, this.front);
    const top = this.h / 2,
      bottom = -top,
      stageTop = top - 130,
      stageBottom = bottom + 155,
      stageH = stageTop - stageBottom;
    this.box(
      0,
      (stageTop + stageBottom) / 2 - 5,
      366,
      stageH,
      C.yellow,
      30,
      this.bg,
    );
    this.box(
      0,
      (stageTop + stageBottom) / 2,
      366,
      stageH,
      this.page === "journal" ? C.purple : C.yellow,
      30,
      this.bg,
    );
    const specks = this.ui(
      "Paper fibers",
      0,
      (stageTop + stageBottom) / 2,
      366,
      stageH,
      this.bg,
    ).addComponent(Graphics);
    specks.fillColor = color("#F2D69D");
    for (let i = 0; i < 70; i++) {
      specks.circle(
        ((i * 97) % 330) - 165,
        ((i * 71) % (stageH - 30)) - (stageH - 30) / 2,
        0.7,
      );
      specks.fill();
    }
    specks.fillColor = color("#EDCD98");
    specks.ellipse(0, -stageH / 2 + 65, 100, 12);
    specks.fill();
    const logo = this.box(-158, top - 61, 38, 38, C.coral, 12);
    logo.angle = 10;
    this.text("✦", 0, 0, 29, C.white, 38, 38, logo);
    this.text("origami", -38, top - 61, 28, C.ink, 184, 44);
    this.button(
      this.language === "zh" ? "EN" : "中文",
      108,
      top - 61,
      48,
      () => {
        this.language = this.language === "zh" ? "en" : "zh";
        this.save();
        this.render();
      },
    );
    this.button(
      this.t("Fold studio", "折纸工坊"),
      -89,
      top - 106,
      172,
      () => this.navigate("studio"),
      this.page === "studio",
    );
    this.button(
      this.t("Collection", "我的作品"),
      89,
      top - 106,
      172,
      () => this.navigate("journal"),
      this.page !== "studio",
    );
    const step =
        this.page === "tutorial" ? this.puzzle.tutorialStep : this.puzzle.step,
      done = this.page === "journal" ? this.puzzle.complete : step === 4;
    this.text(
      this.page === "tutorial"
        ? this.t("Fold together", "跟着折一折")
        : this.page === "journal"
          ? this.t("My paper friends", "我的纸上伙伴")
          : this.t("Little paper puppy", "折一只小狗"),
      -37,
      stageTop - 29,
      21,
      C.ink,
      260,
      36,
    );
    this.text(
      this.page === "journal"
        ? this.puzzle.complete
          ? "01 / 01"
          : "00 / 01"
        : `${Math.min(step + 1, 4)} / 4`,
      137,
      stageTop - 29,
      12,
      C.muted,
      58,
      30,
    );
    this.paper.viewport(173, Math.max(160, stageH - 78), this.h);
    const touch = this.ui(
      "Paper gestures",
      0,
      (stageTop + stageBottom) / 2 - 12,
      346,
      stageH - 72,
    );
    touch.on(Node.EventType.TOUCH_START, this.touchStart, this);
    touch.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
    touch.on(Node.EventType.TOUCH_END, this.touchEnd, this);
    touch.on(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
    if (this.page === "studio" && !done) {
      const target = this.ui("Target puppy", 128, stageTop - 79, 70, 48),
        g = target.addComponent(Graphics);
      for (const face of paperAt(4).sort((a, b) => a.layer - b.layer)) {
        g.fillColor = color("#E59868");
        g.strokeColor = color("#B97F55");
        g.lineWidth = 0.6;
        face.vertices.forEach((p, i) =>
          i
            ? g.lineTo(p.x * 29, (p.y + 0.36) * 29)
            : g.moveTo(p.x * 29, (p.y + 0.36) * 29),
        );
        g.close();
        g.fill();
        g.stroke();
      }
      g.fillColor = color(C.ink);
      for (const x of [-0.22, 0.22]) {
        g.circle(x * 29, 0.07 * 29, 1.2);
        g.fill();
      }
      g.circle(0, -0.13 * 29, 1.5);
      g.fill();
      this.text(
        this.t("target", "目标"),
        128,
        stageTop - 105,
        9,
        C.muted,
        70,
        18,
      );
    }
    if (this.page === "tutorial" && step < 4)
      this.text(
        this.language === "zh"
          ? [
              "上角向背面折，与下角重合。",
              "左边纸角向正面下折，做出耳朵。",
              "另一侧纸角向下折，与左耳对称。",
              "下方纸角藏到背面，整理轮廓。",
            ][step]
          : STEPS[step].instruction,
        0,
        stageTop - 73,
        12,
        C.ink,
        312,
        40,
      );
    this.overlay = this.ui("Grip indicators", 0, 0, 390, this.h).addComponent(
      Graphics,
    );
    this.meter = this.text("", 0, stageBottom + 21, 11, C.ink, 330, 26);
    this.button(
      this.t("Reset view", "视角复位"),
      116,
      stageBottom + 51,
      106,
      () => {
        this.cancelInput();
        this.paper.reset();
        this.draw();
      },
    );
    this.button(
      this.observing
        ? this.t("Fold mode", "返回折纸")
        : this.t("Look around", "自由观察"),
      -105,
      stageBottom + 51,
      122,
      () => {
        this.cancelInput();
        this.observing = !this.observing;
        this.draw();
        this.render();
      },
    );
    let instruction = this.t(
      "Grab the ring. Drag along the arrow. Two fingers to orbit / zoom.",
      "抓住圆环，沿箭头拖折；双指旋转、缩放。",
    );
    if (this.observing)
      instruction = this.t(
        "Drag anywhere to orbit. Pinch to zoom.",
        "任意拖动旋转，双指捏合缩放。",
      );
    else if (this.puzzle.wrong && this.page === "studio")
      instruction = this.t(
        "Compare the shape. Undo and try another crease.",
        "看看形状哪里不同？撤回后试试另一条折线。",
      );
    else if (this.actions().length > 1 && this.selected < 0)
      instruction = this.t(
        "Tap a crease or choose A / B. Then grab the ring.",
        "先点折线或选择 A / B，再抓住圆环拖折。",
      );
    if (done)
      instruction = this.t(
        "Made by you! Turn it over and take a closer look.",
        "亲手完成啦！转一转，看看自己的纸上伙伴。",
      );
    if (this.page === "tutorial")
      instruction = this.t(
        "Pause at any time to look from another angle.",
        "随时暂停，换个角度看清每一次折叠。",
      );
    if (this.page === "journal" && !this.puzzle.complete)
      instruction = this.t(
        "Your first paper friend is waiting in the studio.",
        "第一位纸上伙伴，正等你到工坊发现。",
      );
    this.text(instruction, 0, bottom + 131, 12, C.ink, 350, 36);
    if (this.page === "tutorial") {
      this.button(
        this.t("Previous", "上一步"),
        -116,
        bottom + 92,
        106,
        () => this.seek(step - 1),
        false,
        step > 0 && !this.animation,
      );
      this.button(
        this.playing
          ? this.t("Pause", "暂停")
          : this.paused
            ? this.t("Resume", "继续")
            : this.t("Play fold", "播放这步"),
        0,
        bottom + 92,
        110,
        () => this.playTutorial(),
        true,
        step < 4,
      );
      this.button(
        this.t("Next", "下一步"),
        116,
        bottom + 92,
        106,
        () => this.seek(step + 1),
        false,
        step < 4 && !this.animation,
      );
      this.text(
        this.t("15 × 15 cm square · no glue", "15 × 15 cm 方纸 · 无需胶水"),
        0,
        bottom + 47,
        12,
        C.muted,
      );
    } else if (this.page === "journal") {
      this.button(
        this.puzzle.complete
          ? this.t("Folding guide", "折纸教程")
          : this.t("Start creating", "开始创作"),
        0,
        bottom + 92,
        220,
        () => this.navigate(this.puzzle.complete ? "tutorial" : "studio"),
        true,
      );
      if (this.puzzle.complete)
        this.button(
          this.puzzle.favorite
            ? this.t("Collected ♥", "已收藏 ♥")
            : this.t("Collect ♥", "收藏 ♥"),
          0,
          bottom + 47,
          180,
          () => {
            this.puzzle.favorite = !this.puzzle.favorite;
            this.save();
            this.render();
          },
        );
    } else if (done) {
      this.button(
        this.t("Folding guide", "折纸教程"),
        -87,
        bottom + 92,
        164,
        () => this.navigate("tutorial"),
        true,
      );
      this.button(
        this.puzzle.favorite
          ? this.t("Collected ♥", "已收藏 ♥")
          : this.t("Collect ♥", "收藏 ♥"),
        87,
        bottom + 92,
        164,
        () => {
          this.puzzle.favorite = !this.puzzle.favorite;
          this.save();
          this.render();
        },
      );
      this.button(this.t("Fold again", "再折一次"), 0, bottom + 47, 180, () => {
        this.puzzle.restart();
        this.selected = -1;
        this.paper.reset();
        this.save();
        this.render();
      });
      this.text(
        this.t("FIRST FOLD ★", "首次折纸 ★"),
        0,
        stageTop - 63,
        12,
        C.ink,
      );
    } else {
      const opts = this.actions();
      if (!this.puzzle.wrong)
        opts.forEach((a, i) =>
          this.button(
            step === 3
              ? i === 0
                ? this.t("Tuck behind", "藏到背面")
                : this.t("Fold in front", "折到正面")
              : this.t(
                  `Crease ${String.fromCharCode(65 + i)}`,
                  `折线 ${String.fromCharCode(65 + i)}`,
                ),
            opts.length === 1 ? 0 : i === 0 ? -87 : 87,
            bottom + 92,
            opts.length === 1 ? 180 : 164,
            () => {
              if (this.animation) return;
              this.cancelInput();
              this.selected = i;
              this.draw();
              this.render();
            },
            opts.length === 1 || this.selected === i,
          ),
        );
      else
        this.button(
          this.t("Undo & try again", "撤回，再试一次"),
          0,
          bottom + 92,
          230,
          () => this.undo(),
          true,
        );
      this.button(
        this.t("Undo", "撤回"),
        -137,
        bottom + 47,
        68,
        () => this.undo(),
        false,
        step > 0 || !!this.puzzle.wrong,
      );
      this.button(this.t("Hint", "提示"), -57, bottom + 47, 80, () => {
        this.hintOpen = !this.hintOpen;
        this.render();
      });
      this.button(
        this.mode === "touch"
          ? this.t("Motion", "体感")
          : this.mode === "tilt"
            ? this.t("Tilt", "倾斜")
            : this.t("Hinge", "铰链"),
        35,
        bottom + 47,
        92,
        () => {
          this.cancelInput();
          this.panel = !this.panel;
          this.render();
        },
      );
      this.button(
        this.device.sound
          ? this.t("Sound on", "声音 开")
          : this.t("Sound off", "声音 关"),
        135,
        bottom + 47,
        88,
        () => {
          this.device.sound = !this.device.sound;
          this.save();
          this.render();
        },
      );
      if (this.mode !== "touch" && !this.panel)
        this.armLabel = this.button(
          this.motion.armed
            ? this.t("Cancel motion", "取消体感")
            : this.t("Calibrate & fold", "归零并开始体感"),
          0,
          stageTop - 67,
          216,
          () => this.arm(),
          true,
          !this.animation && !!this.action(),
        );
    }
    if (this.hintOpen) {
      this.box(0, stageTop - 111, 326, 112, C.mint);
      this.text(
        this.t(
          "Choose a crease, then drag the ring toward its outline. Pull back to cancel. Need help? Tap to fold.",
          "选折线后，把圆环拖向空心圆；往回拖可取消。需要帮助时，也可点按钮折叠。",
        ),
        0,
        stageTop - 95,
        13,
        C.ink,
        302,
        64,
      );
      this.button(
        this.t("Fold selected", "辅助折叠所选"),
        0,
        stageTop - 144,
        198,
        () => {
          this.hintOpen = false;
          this.startAction();
        },
        true,
        !!this.action() && !this.observing && !this.animation,
      );
    }
    if (this.panel) this.motionPanel(stageTop);
    if (this.saveError)
      this.text(
        this.t(
          "Save failed; this session is still playable.",
          "保存失败，当前仍可继续游玩。",
        ),
        0,
        bottom + 16,
        10,
        "#AE4E3E",
        350,
        22,
      );
    this.paper.frame(this.faces(), true);
    this.draw();
    this.updateOverlay();
    this.publish();
  }
  private motionPanel(top: number): void {
    this.sample = this.device.sample();
    this.box(0, top - 168, 334, 234, C.mint);
    this.text(
      this.t("Your hands, your paper", "让动作带动纸张"),
      0,
      top - 77,
      20,
      C.ink,
      306,
      36,
    );
    const labels = [
        this.t("Touch", "触屏拖折"),
        this.t("Tilt", "倾斜控制"),
        this.t("Hinge", "铰链控制"),
      ],
      modes: MotionMode[] = ["touch", "tilt", "hinge"];
    modes.forEach((mode, i) =>
      this.button(
        labels[i],
        -105 + i * 105,
        top - 121,
        98,
        () => {
          this.cancelInput();
          this.mode = mode;
          this.device.configure(mode);
          this.panel = false;
          this.render();
        },
        this.mode === mode,
        mode === "touch" ||
          (mode === "tilt"
            ? this.sample.tiltAvailable
            : this.sample.hingeAvailable),
      ),
    );
    this.text(
      this.t(
        "Select a crease, hold comfortably, then calibrate. Tilt along the arrow, or close the hinge by 55°.",
        "选好折线，拿稳后点“归零”。沿箭头倾斜约 32°，或合拢铰链约 55°。",
      ),
      0,
      top - 175,
      12,
      C.ink,
      302,
      62,
    );
    this.text(
      this.t(
        "Unavailable controls stay disabled. Touch always works.",
        "灰色表示当前设备不支持；随时可用触屏。",
      ),
      0,
      top - 218,
      11,
      C.muted,
      302,
      30,
    );
    this.button(this.t("Close", "关闭"), 0, top - 260, 140, () => {
      this.panel = false;
      this.render();
    });
  }
  private projected(action: Fold): {
    grip: XY;
    end: XY;
    axis: XY;
    travel: number;
  } {
    const p = foldGrip(this.puzzle.faces, action),
      dx = action.b[0] - action.a[0],
      dy = action.b[1] - action.a[1],
      d =
        ((p.x - action.a[0]) * -dy + (p.y - action.a[1]) * dx) /
        (dx * dx + dy * dy);
    const grip = this.paper.project(p, this.front),
      end = this.paper.project(
        { ...p, x: p.x + 2 * dy * d, y: p.y - 2 * dx * d },
        this.front,
      ),
      axis = { x: end.x - grip.x, y: end.y - grip.y };
    return {
      grip,
      end,
      axis,
      travel: clamp(Math.hypot(axis.x, axis.y), 75, 150),
    };
  }
  private updateOverlay(): void {
    if (!this.overlay) return;
    const g = this.overlay;
    g.clear();
    const action = this.action();
    let text = this.paper.back
      ? this.t("BACK · two fingers to orbit / zoom", "背面 · 双指旋转 / 缩放")
      : this.t("Two fingers to orbit / zoom", "双指旋转 / 缩放");
    if (
      action &&
      !this.observing &&
      this.page === "studio" &&
      !this.animation &&
      !this.panel &&
      !this.hintOpen
    ) {
      const { grip, end, axis } = this.projected(action),
        len = Math.hypot(axis.x, axis.y) || 1;
      g.strokeColor = color(C.ink);
      g.lineWidth = 2;
      const rect = this.paper.camera.rect;
      const bottom = rect.y * this.h - this.h / 2;
      const inside = (p: XY, margin: number) =>
        Math.abs(p.x) < 173 - margin &&
        p.y > bottom + margin &&
        p.y < bottom + rect.height * this.h - margin;
      if (inside(grip, 16)) {
        g.circle(grip.x, grip.y, 15);
        g.stroke();
      } else
        text = this.t(
          "Zoom out or reset to reach the paper corner",
          "缩小或复位视角，找回纸角",
        );
      if (inside(end, 14)) {
        g.circle(end.x, end.y, 12);
        g.stroke();
      }
      const x = grip.x + (axis.x / len) * 39,
        y = grip.y + (axis.y / len) * 39;
      if (inside(grip, 16) && inside({ x, y }, 8)) {
        g.moveTo(grip.x + (axis.x / len) * 21, grip.y + (axis.y / len) * 21);
        g.lineTo(x, y);
        g.lineTo(
          x - (axis.x / len) * 7 - (axis.y / len) * 5,
          y - (axis.y / len) * 7 + (axis.x / len) * 5,
        );
        g.moveTo(x, y);
        g.lineTo(
          x - (axis.x / len) * 7 + (axis.y / len) * 5,
          y - (axis.y / len) * 7 - (axis.x / len) * 5,
        );
        g.stroke();
      }
      const progress =
        this.drag?.progress ?? (this.motion.armed ? this.motion.progress : 0);
      if (progress > 0)
        text = `${Math.round(progress * 100)}% · ${this.t("Pull back to reverse", "回拉可逆转")}`;
      else if (this.motion.armed)
        text = this.t(
          "Calibrated · move gently along the arrow",
          "已归零 · 沿箭头缓缓倾斜 / 合拢铰链",
        );
    }
    if (this.reward > 0) {
      g.fillColor = color(C.coral);
      for (let i = 0; i < 18; i++) {
        const a = i * 2.4,
          r = 70 + (1 - this.reward / 1.4) * 120;
        g.circle(Math.cos(a) * r, Math.sin(a) * r + 25, 3 + (i % 3));
        g.fill();
      }
    }
    this.meter.string = text;
    if (this.armLabel)
      this.armLabel.string = this.motion.armed
        ? this.t("Cancel motion", "取消体感")
        : this.t("Calibrate & fold", "归零并开始体感");
  }
  private arm(): void {
    if (this.motion.armed) {
      this.cancelInput();
      this.draw();
      return;
    }
    const action = this.action();
    if (!action) return;
    this.sample = this.device.sample();
    const axis = this.projected(action).axis;
    if (this.motion.arm(this.mode, this.sample, axis)) {
      this.motionAction = action;
      this.device.feedback("grab");
      this.render();
    } else {
      this.panel = true;
      this.render();
    }
  }
  private startAction(): void {
    const action = this.action();
    if (!action) return;
    this.cancelInput();
    this.animation = {
      action,
      base: this.puzzle.faces,
      from: 0,
      to: 1,
      elapsed: 0,
      duration: 0.55,
      commit: true,
    };
    this.draw();
  }
  private pos(e: EventTouch): XY {
    const p = e.getUILocation();
    return { x: p.x - 195, y: p.y - this.h / 2 };
  }
  private touchStart(e: EventTouch): void {
    if (this.panel || this.hintOpen) return;
    if (e.getAllTouches().length > 1) {
      this.drag = null;
      this.motion.cancel();
      this.motionAction = null;
      this.multi = true;
      this.pinch = null;
      this.draw();
      return;
    }
    if (this.animation) return;
    this.motion.cancel();
    this.motionAction = null;
    const p = this.pos(e),
      a = this.action();
    if (!this.observing && this.page === "studio" && a) {
      const v = this.projected(a);
      if (Math.hypot(p.x - v.grip.x, p.y - v.grip.y) < 28) {
        this.drag = {
          start: p,
          action: a,
          base: this.puzzle.faces,
          axis: v.axis,
          travel: v.travel,
          progress: 0,
        };
        this.device.feedback("grab");
        this.draw();
        return;
      }
    }
    if (!this.observing && this.page === "studio") {
      let best = -1,
        distance = 20;
      this.actions().forEach((a, i) => {
        const line = creaseSegment(this.puzzle.faces, a);
        if (!line) return;
        const d = distanceToSegment(
          p,
          this.paper.project(line[0], this.front),
          this.paper.project(line[1], this.front),
        );
        if (d < distance) {
          distance = d;
          best = i;
        }
      });
      if (best >= 0) {
        this.selected = best;
        this.render();
        return;
      }
    }
    this.orbit = p;
  }
  private touchMove(e: EventTouch): void {
    if (this.panel || this.hintOpen) return;
    const touches = e.getAllTouches();
    if (touches.length >= 2) {
      const a = touches[0].getUILocation(),
        b = touches[1].getUILocation(),
        v = {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          distance: Math.hypot(a.x - b.x, a.y - b.y),
        };
      this.drag = null;
      this.multi = true;
      if (this.pinch) {
        this.paper.orbit(v.x - this.pinch.x, v.y - this.pinch.y);
        this.paper.zoom = clamp(
          (this.paper.zoom * v.distance) / Math.max(1, this.pinch.distance),
          0.65,
          1.8,
        );
        this.paper.applyTransform();
      }
      this.pinch = v;
      this.draw();
      return;
    }
    if (this.multi || this.animation) return;
    const p = this.pos(e);
    if (this.drag) {
      this.drag.progress = dragProgress(
        this.drag.start,
        p,
        this.drag.axis,
        this.drag.travel,
      );
      this.paper.render(
        foldPaper(this.drag.base, this.drag.action, this.drag.progress),
      );
    } else if (this.orbit) {
      this.paper.orbit(p.x - this.orbit.x, p.y - this.orbit.y);
      this.orbit = p;
      this.draw();
    }
  }
  private touchEnd(e: EventTouch): void {
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      const commit = d.progress >= 0.78;
      this.animation = {
        action: d.action,
        base: d.base,
        from: d.progress,
        to: commit ? 1 : 0,
        elapsed: 0,
        duration: 0.28,
        commit,
      };
    }
    this.orbit = null;
    this.pinch = null;
    if (e.getAllTouches().length <= 1) this.multi = false;
  }
  private touchCancel(e: EventTouch): void {
    if (e.getEventCode() === Node.EventType.TOUCH_END) {
      this.touchEnd(e);
      return;
    }
    this.cancelInput();
    this.draw();
  }
  private undo(): void {
    this.animation = null;
    this.paused = null;
    this.cancelInput();
    this.puzzle.undo();
    this.selected = -1;
    this.save();
    this.render();
  }
  private seek(step: number): void {
    this.animation = null;
    this.paused = null;
    this.playing = false;
    this.cancelInput();
    this.puzzle.tutorialStep = clamp(step, 0, 4);
    this.save();
    this.render();
  }
  private playTutorial(): void {
    if (this.playing) {
      this.playing = false;
      this.paused = this.animation;
      this.animation = null;
      this.render();
      return;
    }
    const step = this.puzzle.tutorialStep;
    if (step >= 4) return;
    this.playing = true;
    this.animation = this.paused ?? {
      action: STEPS[step],
      base: paperAt(step),
      from: 0,
      to: 1,
      elapsed: 0,
      duration: 3,
      commit: false,
    };
    this.paused = null;
    this.render();
  }
  update(dt: number): void {
    if (!this.initialized) return;
    const height = view.getVisibleSize().height;
    if (Math.abs(height - this.h) > 1) {
      this.h = height;
      this.cancelInput();
      this.back.getComponent(Canvas)!.cameraComponent!.orthoHeight = height / 2;
      this.front.getComponent(Canvas)!.cameraComponent!.orthoHeight =
        height / 2;
      this.render();
    }
    this.paper.update(dt);
    this.reward = Math.max(0, this.reward - dt);
    if (this.motion.armed && this.motionAction) {
      const action = this.motionAction,
        result = this.motion.update(this.device.sample(), dt);
      if (result === "lost") {
        this.motionAction = null;
        this.draw();
      } else if (result === "complete") {
        const from = this.motion.progress;
        this.motion.cancel();
        this.motionAction = null;
        this.animation = {
          action,
          base: this.puzzle.faces,
          from,
          to: 1,
          elapsed: 0,
          duration: 0.25,
          commit: true,
        };
      } else
        this.paper.render(
          foldPaper(this.puzzle.faces, action, this.motion.progress),
        );
    }
    const a = this.animation;
    if (a) {
      a.elapsed += Math.min(dt, 0.1);
      const t = clamp(a.elapsed / a.duration);
      this.paper.render(
        foldPaper(
          a.base,
          a.action,
          a.from + (a.to - a.from) * t * t * (3 - 2 * t),
        ),
      );
      if (t >= 1) {
        this.animation = null;
        if (this.page === "tutorial") {
          this.playing = false;
          this.puzzle.tutorialStep = Math.min(4, this.puzzle.tutorialStep + 1);
        } else if (a.commit) {
          const was = this.puzzle.complete;
          this.puzzle.commit(a.action.id);
          this.selected = -1;
          this.device.feedback(
            !was && this.puzzle.complete ? "complete" : "fold",
          );
          if (!was && this.puzzle.complete) this.reward = 1.4;
        }
        this.save();
        this.render();
      }
    }
    this.updateOverlay();
    this.publish();
  }
  private publish(): void {
    const a = this.action(),
      v = a ? this.projected(a) : null;
    const s = `${this.page}|step:${this.puzzle.step}|wrong:${!!this.puzzle.wrong}|complete:${this.puzzle.complete}|favorite:${this.puzzle.favorite}|tutorial:${this.puzzle.tutorialStep}|playing:${this.playing}|mode:${this.mode}|armed:${this.motion.armed}|back:${this.paper.back}|zoom:${this.paper.zoom.toFixed(2)}|grip:${v ? Math.round(v.grip.x + 195) + "," + Math.round(this.h / 2 - v.grip.y) : "-"}|axis:${v ? Math.round(v.axis.x) + "," + Math.round(-v.axis.y) : "-"}|busy:${!!this.animation}`;
    if (s !== this.status) {
      this.status = s;
      if (sys.isNative && sys.os === sys.OS.IOS)
        native.reflection.callStaticMethod(
          "OrigamiAccessibility",
          "updateState:",
          s,
        );
    }
  }
}
