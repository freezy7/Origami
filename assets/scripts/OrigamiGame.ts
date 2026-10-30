import {
  _decorator, Component, Node, Canvas, Camera, Color, Graphics, Label, UITransform,
  view, ResolutionPolicy, Layers, Rect, Mesh, MeshRenderer, Material, utils,
  EventTouch, game, Game, sys, Vec3, native, profiler,
} from 'cc';
import { Face, Point, Fold, STEPS, options, paperAt, foldPaper, normal, Puzzle } from './core/PaperModel';
const { ccclass } = _decorator;
const C = { cream: '#F8F5EF', ink: '#314440', muted: '#8B9690', mint: '#DDE9DD', green: '#456A59', coral: '#D98D77', light: '#EEE9DF', white: '#FFFDFA', edge: '#DDD8CC' };
const color = (hex: string) => new Color().fromHEX(hex);
const KEY = 'origami.puppy.v1';
type Animation = { action: Fold; base: Face[]; from: number; to: number; elapsed: number; duration: number; commit: boolean };

@ccclass('OrigamiGame')
export class OrigamiGame extends Component {
  private puzzle = new Puzzle();
  private canvasNode!: Node;
  private pageNode!: Node;
  private paperNode!: Node;
  private renderer!: MeshRenderer;
  private paperCamera!: Camera;
  private mesh: Mesh | null = null;
  private h = 844;
  private stageY = 0;
  private stageHeight = 300;
  private selected = -1;
  private page: 'studio' | 'journal' | 'tutorial' = 'studio';
  private observing = false;
  private yaw = -10;
  private pitch = 12;
  private animation: Animation | null = null;
  private drag: { y: number; x: number; progress: number; action: Fold; base: Face[] } | null = null;
  private replayPlaying = false;
  private pausedReplay: Animation | null = null;
  private saveError = false;
  private language: 'en' | 'zh' = 'en';
  private t(en: string, zh: string): string { return this.language === 'en' ? en : zh; }

  start(): void {
    view.setDesignResolutionSize(390, 844, ResolutionPolicy.FIXED_WIDTH);
    profiler.hideStats();
    this.h = view.getVisibleSize().height;
    try { this.puzzle = Puzzle.restore(sys.localStorage.getItem(KEY)); } catch { this.saveError = true; }
    this.makeCameras();
    this.render();
    game.on(Game.EVENT_HIDE, this.onHide, this);
    // A browser-only inspection hook never bypasses gameplay or unlocks native production state.
    if (sys.isBrowser) (globalThis as any).__origami = { snapshot: () => this.puzzle.save(), app: this };
    console.log('[Origami] ready; iOS prototype v0.1.0');
  }
  onDestroy(): void { game.off(Game.EVENT_HIDE, this.onHide, this); this.mesh?.destroy(); }
  private onHide(): void {
    this.animation = null; this.pausedReplay = null; this.drag = null; this.replayPlaying = false;
    this.save(); this.render();
  }
  private save(): void {
    try { sys.localStorage.setItem(KEY, JSON.stringify(this.puzzle.save())); this.saveError = false; }
    catch { this.saveError = true; }
  }
  private makeCameras(): void {
    const uiCameraNode = new Node('JournalCamera'); this.node.addChild(uiCameraNode);
    uiCameraNode.setPosition(0, 0, 1000);
    const uiCamera = uiCameraNode.addComponent(Camera);
    uiCamera.projection = Camera.ProjectionType.ORTHO;
    uiCamera.orthoHeight = this.h / 2; uiCamera.near = 0.1; uiCamera.far = 2000;
    uiCamera.visibility = Layers.Enum.UI_2D; uiCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    uiCamera.clearColor = color(C.cream); uiCamera.priority = 0;
    this.canvasNode = new Node('JournalCanvas'); this.node.addChild(this.canvasNode);
    this.canvasNode.layer = Layers.Enum.UI_2D;
    this.canvasNode.addComponent(UITransform).setContentSize(390, this.h);
    const canvas = this.canvasNode.addComponent(Canvas); canvas.cameraComponent = uiCamera;
    const camNode = new Node('PaperCamera'); this.node.addChild(camNode); camNode.setPosition(0, 0, 6);
    this.paperCamera = camNode.addComponent(Camera); this.paperCamera.projection = Camera.ProjectionType.ORTHO;
    this.paperCamera.orthoHeight = 1.28; this.paperCamera.near = 0.1; this.paperCamera.far = 50;
    this.paperCamera.visibility = Layers.Enum.DEFAULT; this.paperCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    // Canvas assigns its own priority, so paper is deliberately rendered after the journal surface.
    this.paperCamera.priority = (1 << 30) + 100;
    this.paperNode = new Node('FoldedPaper'); this.node.addChild(this.paperNode);
    this.paperNode.layer = Layers.Enum.DEFAULT;
    this.renderer = this.paperNode.addComponent(MeshRenderer);
    const mat = new Material(); mat.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
    this.renderer.setMaterial(mat, 0);
  }
  private ui(name: string, x: number, y: number, w: number, h: number, parent = this.pageNode): Node {
    const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n); n.setPosition(x, y);
    n.addComponent(UITransform).setContentSize(w, h); return n;
  }
  private box(x: number, y: number, w: number, h: number, fill: string, radius = 16, stroke?: string, parent = this.pageNode): Node {
    const n = this.ui('Card', x, y, w, h, parent); const g = n.addComponent(Graphics);
    g.fillColor = color(fill); g.roundRect(-w/2,-h/2,w,h,radius); g.fill();
    if (stroke) { g.strokeColor = color(stroke); g.lineWidth = 1; g.roundRect(-w/2,-h/2,w,h,radius);g.stroke(); }
    return n;
  }
  private text(value: string, x: number, y: number, size = 14, fill = C.ink, w = 330, h = 40, serif = false, align = Label.HorizontalAlign.LEFT, parent = this.pageNode): Label {
    const n=this.ui('Text',x,y,w,h,parent);const l=n.addComponent(Label);
    l.string=value;l.fontSize=size;l.lineHeight=size*1.3;l.color=color(fill);
    l.fontFamily=serif?'Georgia':'Arial';l.useSystemFont=true;
    l.horizontalAlign=align;l.verticalAlign=Label.VerticalAlign.CENTER;l.overflow=Label.Overflow.SHRINK;
    return l;
  }
  private button(value: string, x: number, y: number, w: number, h: number, action: () => void, primary=false, active=true, interrupt=false): Node {
    const n=this.box(x,y,w,h,active?(primary?C.green:C.white):C.light,14,primary?undefined:C.edge);
    this.text(value,0,0,14,active?(primary?C.white:C.ink):C.muted,w-12,h,false,Label.HorizontalAlign.CENTER,n);
    n.on(Node.EventType.TOUCH_END,()=>{if(active&&(interrupt||!this.animation)&&!this.drag) action();});return n;
  }
  private render(): void {
    this.pageNode?.destroy();this.pageNode=this.ui('Page',0,0,390,this.h,this.canvasNode);
    const top=this.h/2;
    this.text('origami',-75,top-74,35,C.ink,190,50,true);
    this.text(this.t('A SMALL PAPER JOURNAL','一本折纸手帐'),-69,top-107,9,C.muted,205,20);
    this.button(this.language==='en'?'中':'EN',152,top-78,36,34,()=>{this.language=this.language==='en'?'zh':'en';this.render();});
    this.tab(this.t('Fold studio','折纸桌面'),-83,top-148,this.page==='studio',()=>{this.page='studio';this.observing=false;this.replayPlaying=false;this.pausedReplay=null;this.render();});
    this.tab(this.t('My journal','我的手帐'),83,top-148,this.page!=='studio',()=>{this.page='journal';this.replayPlaying=false;this.pausedReplay=null;this.render();});
    if(this.page==='journal')this.journal();else this.studio(this.page==='tutorial');
    if(this.saveError)this.text(this.t('Could not save. Your current session is still playable.','存档未成功，当前游戏仍可继续。'),0,-top+34,10,C.coral,340,24,false,Label.HorizontalAlign.CENTER);
    if (sys.isNative && sys.os === sys.OS.IOS) {
      native.reflection.callStaticMethod('OrigamiAccessibility', 'updateState:',
        `${this.page}|step:${this.puzzle.step}|wrong:${!!this.puzzle.wrong}|complete:${this.puzzle.complete}|favorite:${this.puzzle.favorite}|tutorial:${this.puzzle.tutorialStep}|playing:${this.replayPlaying}`);
    }
  }
  private tab(value:string,x:number,y:number,selected:boolean,action:()=>void):void {
    const n=this.box(x,y,160,38,selected?C.mint:C.cream,19);
    this.text(value,0,0,13,selected?C.green:C.muted,150,30,false,Label.HorizontalAlign.CENTER,n);
    n.on(Node.EventType.TOUCH_END,()=>{if(!this.animation&&!this.drag)action();});
  }
  private studio(tutorial:boolean):void {
    this.paperCamera.enabled=true;
    const top=this.h/2;
    const step=tutorial?this.puzzle.tutorialStep:this.puzzle.step;
    const done=!tutorial&&this.puzzle.finished;
    this.text(tutorial?this.t('THE FOLDING GUIDE','完整折纸教程'):this.t('CHAPTER 01  /  LITTLE COMPANIONS','第一章  /  纸上伙伴'),0,top-198,10,C.muted);
    this.text(this.t('A little paper puppy','一只纸上小狗'),0,top-231,27,C.ink,330,44,true);
    this.text(tutorial?this.t('One square. Four folds. Yours to make.','一张方纸，四次折叠，亲手完成。'):this.t('Find its shape, one thoughtful fold at a time.','观察、尝试，用每一次折叠找到它。'),0,top-263,12,C.muted);
    const stageTop=top-292,stageBottom=-top+310;
    this.stageHeight=Math.max(220,stageTop-stageBottom);this.stageY=(stageTop+stageBottom)/2;
    this.box(0,this.stageY,342,this.stageHeight,C.white,22,C.edge);
    // Small journal tape, dotted grid and soft contact shadow are all code-native graphics.
    const tape=this.box(-112,stageTop-2,74,15,C.mint,2);tape.angle=8;
    const grid=this.ui('Paper grid',0,this.stageY,342,this.stageHeight);const g=grid.addComponent(Graphics);
    g.fillColor=color('#EAE9E0');for(let x=-150;x<=150;x+=20)for(let y=-this.stageHeight/2+18;y<this.stageHeight/2-8;y+=20){g.circle(x,y,0.7);g.fill();}
    g.fillColor=color('#EAE7DE');g.ellipse(0,-this.stageHeight/2+36,88,9);g.fill();
    this.text(tutorial?this.t('PAUSE. LOOK. FOLD.','暂停 · 观察 · 折叠'):this.t('YOUR PAPER','你的纸张'),0,stageTop-26,9,C.muted,300,20,false,Label.HorizontalAlign.CENTER);
    this.target(117,stageTop-71,0.038);
    this.text(this.t('target','目标'),117,stageTop-107,8,C.muted,60,15,false,Label.HorizontalAlign.CENTER);
    this.paperCamera.rect=new Rect(35/390,(stageBottom+this.h/2+24)/this.h,320/390,(this.stageHeight-65)/this.h);
    this.paperCamera.orthoHeight=step===0?1.20:1.00;
    const stageTouch=this.ui('Paper interaction',0,this.stageY-12,325,this.stageHeight-66);
    stageTouch.on(Node.EventType.TOUCH_START,this.touchStart,this);
    stageTouch.on(Node.EventType.TOUCH_MOVE,this.touchMove,this);
    stageTouch.on(Node.EventType.TOUCH_END,this.touchEnd,this);
    stageTouch.on(Node.EventType.TOUCH_CANCEL,this.touchCancel,this);
    const line=this.ui('Progress',0,-top+285,330,8);const pg=line.addComponent(Graphics);
    for(let i=0;i<4;i++){pg.fillColor=color(i<step?C.green:C.edge);pg.roundRect(-165+i*84,-2,76,4,2);pg.fill();}
    this.text(`0${Math.min(step+1,4)} / 04`,-138,-top+260,10,C.muted,54,20);
    this.button(this.observing?this.t('Done looking','结束观察'):this.t('Rotate paper','旋转观察'),98,-top+260,134,29,()=>{this.observing=!this.observing;this.render();});
    const wrong=!tutorial&&this.puzzle.wrong!==null;
    const instruction=tutorial?(step===4?this.t('Your puppy is ready. Optional: draw a face with a pen.','小狗折好了。可以用笔画上五官。'):this.tutorialInstruction(step)):
      done?this.t('A new companion for your journal.','新的纸上伙伴，已加入你的手帐。'):
      wrong?this.t('Look at the result. How does it differ from the target? Undo to try another fold.','观察折后的样子，与目标有什么不同？撤回后再试一次。'):
      this.observing?this.t('Drag to look around. Tap “Done looking” to fold again.','拖动观察纸张，完成后点“结束观察”继续折叠。'):this.localizedInstruction(step);
    this.text(instruction,0,-top+215,13,C.ink,330,58);
    if(tutorial) {
      this.button(this.t('Previous','上一步'),-113,-top+100,100,44,()=>this.seek(step-1),false,step>0);
      this.button(this.replayPlaying?this.t('Pause','暂停'):this.pausedReplay?this.t('Resume','继续播放'):this.t('Play fold','播放这步'),0,-top+100,110,44,()=>this.playTutorial(),true,step<4,true);
      this.button(this.t('Next','下一步'),113,-top+100,100,44,()=>this.seek(step+1),false,step<4);
      this.text(this.t('Real paper guide · 15 × 15 cm square · no glue','实物教程 · 15 × 15 cm 方纸 · 无需胶水'),0,-top+61,10,C.muted,340,24,false,Label.HorizontalAlign.CENTER);
    } else if(done) {
      this.button(this.t('Open my folding guide','打开完整折纸教程'),0,-top+105,330,48,()=>{this.page='tutorial';this.puzzle.tutorialStep=0;this.save();this.render();},true);
      this.button(this.puzzle.favorite?this.t('Saved in journal  ✓','已收藏  ✓'):this.t('Save to journal','收藏到手帐'),-85,-top+51,160,34,()=>{this.puzzle.favorite=!this.puzzle.favorite;this.save();this.render();});
      this.button(this.t('Fold again','再挑战一次'),85,-top+51,160,34,()=>{this.puzzle.restart();this.selected=-1;this.save();this.render();});
      this.text(this.t('FIRST FOLD BADGE  ·  EARNED','首次折纸勋章  ·  已获得'),0,stageBottom+40,11,C.green,300,24,false,Label.HorizontalAlign.CENTER);
    } else {
      const opts=options(step);
      if(wrong) this.button(this.t('Undo & explore again','撤回，再试一次'),0,-top+105,330,48,()=>this.undo(),true);
      else if(opts.length>1) {
        opts.forEach((a,i)=>{const n=this.button(step===1?this.t(`Crease ${i===0?'A':'B'}`,`折线 ${i===0?'A':'B'}`):i===0?this.t('Fold behind','向背面折'):this.t('Fold in front','向正面折'),i===0?-85:85,-top+145,160,42,()=>{this.selected=i;this.render();},this.selected===i);
          if(step===1){const dot=n.getComponent(Graphics)!;dot.fillColor=color(i===0?C.coral:C.green);dot.circle(-64,0,3);dot.fill();}});
        this.button(this.t('Fold selected · or drag paper','折叠选中线路 · 或拖动纸张'),0,-top+94,330,40,()=>this.startAction(),true,this.selected>=0&&!this.observing);
      } else this.button(this.t('Make this fold · or drag paper','完成这次折叠 · 或拖动纸张'),0,-top+94,330,48,()=>this.startAction(),true,!this.observing);
      this.button(this.t('Undo','撤回'),-113,-top+43,100,30,()=>this.undo(),false,step>0||wrong);
      this.button(this.t('A little hint','一点提示'),0,-top+43,110,30,()=>this.hint());
      this.button(this.t('Start over','重新开始'),113,-top+43,100,30,()=>{this.puzzle.restart();this.selected=-1;this.save();this.render();});
    }
    this.updatePaper(this.displayedFaces());
  }
  private localizedInstruction(step:number):string {
    if(this.language==='en')return STEPS[step]?.instruction??'Your paper puppy is ready.';
    return ['把上角折向背面，与下角重合，形成三角形。','哪条折线能折出下垂的耳朵？先选折线，再折叠比较。','将另一只耳朵向下折，和第一只耳朵对称。','将下方纸角藏到脸的背面，整理小狗的轮廓。'][step]??'你的小狗折好了。';
  }
  private tutorialInstruction(step:number):string {
    return this.language==='en' ? [
      'Fold the top corner behind the bottom corner along the green crease.',
      'Fold the left corner down along the green crease, toward the front.',
      'Fold the right corner down to mirror the left ear.',
      'Fold the bottom point behind the face along the green crease.',
    ][step] : [
      '沿绿色折线把上角折到背面，与下角重合。',
      '沿绿色折线，将左侧纸角向正面下折。',
      '沿绿色折线，将右侧纸角对称向下折。',
      '沿绿色折线，将下方纸角折到脸的背面。',
    ][step];
  }
  private journal():void {
    this.paperCamera.enabled=false;const top=this.h/2;
    this.text(this.t('PAPER THINGS, KEPT CLOSE','把纸上的美好收藏起来'),0,top-202,10,C.muted);
    this.text(this.t('Little things I made','我折过的小美好'),0,top-240,28,C.ink,330,50,true);
    this.text(this.t('Every fold leaves a little story.','每一道折痕，都留下一点故事。'),0,top-275,13,C.muted);
    const card=this.box(0,top-438,330,254,C.white,20,C.edge);
    this.box(0,86,82,15,C.mint,2,undefined,card);
    if(this.puzzle.complete) {
      this.target(0,top-407,.085);
      this.text(this.t('Paper puppy','纸上小狗'),0,top-487,24,C.ink,290,40,true,Label.HorizontalAlign.CENTER);
      this.text(this.puzzle.favorite?this.t('COLLECTED  ·  FIRST FOLD BADGE','已收藏  ·  首次折纸勋章'):this.t('COMPLETED  ·  NOT FAVORITED','已完成  ·  未加入收藏'),0,top-522,10,C.green,290,25,false,Label.HorizontalAlign.CENTER);
      this.button(this.t('Open folding guide','打开折纸教程'),0,top-603,330,48,()=>{this.page='tutorial';this.observing=false;this.render();},true);
      this.button(this.puzzle.favorite?this.t('Remove from favorites','取消收藏'):this.t('Add to favorites','加入收藏'),0,top-659,330,38,()=>{this.puzzle.favorite=!this.puzzle.favorite;this.save();this.render();});
    } else {
      this.text('?',0,top-415,64,C.edge,120,100,true,Label.HorizontalAlign.CENTER);
      this.text(this.t('Your first companion awaits','第一位纸上伙伴，等你发现'),0,top-497,17,C.muted,290,50,true,Label.HorizontalAlign.CENTER);
      this.button(this.t('Make my first fold','开始第一次折纸'),0,top-603,330,48,()=>{this.page='studio';this.render();},true);
    }
  }
  private target(x:number,y:number,scale:number):void {
    const n=this.ui('Puppy target',x,y,110,90);const g=n.addComponent(Graphics);const s=scale*1000;
    for(const f of paperAt(4).sort((a,b)=>a.layer-b.layer)){
      g.fillColor=color(normal(f).z>0?'#D9977E':'#F3D8BA');g.strokeColor=color('#B47F69');g.lineWidth=.6;
      f.vertices.forEach((p,i)=>i?g.lineTo(p.x*s,(p.y+.36)*s):g.moveTo(p.x*s,(p.y+.36)*s));g.close();g.fill();g.stroke();
    }
    g.fillColor=color(C.ink);for(const dx of [-.22,.22]){g.circle(dx*s,.07*s,Math.max(1.1,.024*s));g.fill();}
    g.moveTo(-.045*s,-.09*s);g.lineTo(.045*s,-.09*s);g.lineTo(0,-.15*s);g.close();g.fill();
  }
  private selectedAction():Fold|null {
    if(this.page!=='studio'||this.puzzle.wrong||this.puzzle.finished||this.observing)return null;
    const opts=options(this.puzzle.step);return opts.length===1?opts[0]:opts[this.selected]??null;
  }
  private startAction():void {
    const action=this.selectedAction();if(!action)return;
    this.animation={action,base:this.puzzle.faces,from:0,to:1,elapsed:0,duration:.75,commit:true};
  }
  private touchStart(e:EventTouch):void {
    if(this.animation)return;const pos=e.getUILocation();
    if(this.observing){this.drag={x:pos.x,y:pos.y,progress:0,action:STEPS[0],base:[]};return;}
    const action=this.selectedAction();if(action)this.drag={x:pos.x,y:pos.y,progress:0,action,base:this.puzzle.faces};
  }
  private touchMove(e:EventTouch):void {
    if(!this.drag)return;const p=e.getUILocation();
    if(this.observing){this.yaw=Math.max(-70,Math.min(70,this.yaw+(p.x-this.drag.x)*.45));this.pitch=Math.max(-60,Math.min(60,this.pitch-(p.y-this.drag.y)*.45));this.drag.x=p.x;this.drag.y=p.y;this.updatePaper(this.displayedFaces());return;}
    this.drag.progress=Math.min(1,Math.hypot(p.x-this.drag.x,p.y-this.drag.y)/115);
    this.updatePaper(foldPaper(this.drag.base,this.drag.action,this.drag.progress));
  }
  private touchEnd():void {
    if(!this.drag)return;if(this.observing){this.drag=null;return;}
    const d=this.drag;this.drag=null;const commit=d.progress>=.35;
    this.animation={action:d.action,base:d.base,from:d.progress,to:commit?1:0,elapsed:0,duration:.35,commit};
  }
  private touchCancel(e:EventTouch):void {
    // Cocos reports a finger release outside the node as TOUCH_CANCEL.
    // Preserve a normal release; genuine system cancellation restores the checkpoint.
    if(e.getEventCode()===Node.EventType.TOUCH_END){this.touchEnd();return;}
    this.drag=null;this.updatePaper(this.displayedFaces());
  }
  private undo():void { this.puzzle.undo();this.selected=-1;this.save();this.render(); }
  private hint():void {
    this.puzzle.hints=Math.min(3,this.puzzle.hints+1);this.render();
    const hints=this.language==='en'?['Compare the paper edges with the target.','A drooping ear folds down; a neat chin tucks behind.','Follow the green crease. For the chin, choose “Fold behind”.']:['观察纸张边缘与目标的区别。','耳朵向下垂，整理面部时把纸角藏到背面。','耳朵选绿色折线；下角选择“向背面折”。'];
    this.box(0,this.stageY-80,300,64,C.mint,12);
    this.text(hints[this.puzzle.hints-1],0,this.stageY-80,12,C.green,270,56,false,Label.HorizontalAlign.CENTER);
  }
  private seek(step:number):void { this.replayPlaying=false;this.pausedReplay=null;this.puzzle.tutorialStep=Math.max(0,Math.min(4,step));this.save();this.render(); }
  private playTutorial():void {
    if(this.replayPlaying){this.replayPlaying=false;this.pausedReplay=this.animation;this.animation=null;this.render();return;}
    const step=this.puzzle.tutorialStep;if(step>=4)return;
    this.replayPlaying=true;this.animation=this.pausedReplay??{action:STEPS[step],base:paperAt(step),from:0,to:1,elapsed:0,duration:3,commit:false};
    this.pausedReplay=null;
    this.render();
  }
  private displayedFaces():Face[] {
    if(this.page!=='tutorial')return this.puzzle.faces;
    const a=this.animation??this.pausedReplay;
    if(!a)return paperAt(this.puzzle.tutorialStep);
    const t=Math.min(1,a.elapsed/a.duration),smooth=t*t*(3-2*t);
    return foldPaper(a.base,a.action,a.from+(a.to-a.from)*smooth);
  }
  update(dt:number):void {
    const a=this.animation;if(!a)return;a.elapsed+=Math.min(dt,.1);
    const t=Math.min(1,a.elapsed/a.duration),smooth=t*t*(3-2*t),progress=a.from+(a.to-a.from)*smooth;
    this.updatePaper(foldPaper(a.base,a.action,progress));
    if(t>=1){this.animation=null;
      if(this.page==='tutorial'){this.replayPlaying=false;this.puzzle.tutorialStep=Math.min(4,this.puzzle.tutorialStep+1);}
      else if(a.commit){this.puzzle.commit(a.action.id);this.selected=-1;console.log(`[Origami] action=${a.action.id} step=${this.puzzle.step} wrong=${!!this.puzzle.wrong}`);}
      this.save();this.render();
    }
  }
  private updatePaper(faces:Face[]):void {
    const pos:number[]=[],colors:number[]=[],indices:number[]=[];
    const triangle=(a:Point,b:Point,c:Point,fill:Color,shade=1)=>{const index=pos.length/3;
      for(const p of [a,b,c]){pos.push(p.x,p.y,p.z);colors.push(fill.r/255*shade,fill.g/255*shade,fill.b/255*shade,1);}indices.push(index,index+1,index+2);};
    for(const f of faces){const n=normal(f);const shade=.78+.22*Math.abs(n.z);
      for(let i=1;i<f.vertices.length-1;i++){
        triangle(f.vertices[0],f.vertices[i],f.vertices[i+1],color('#DD9E81'),shade);
        triangle(f.vertices[0],f.vertices[i+1],f.vertices[i],color('#F3DDC0'),shade);
      }
      // Raised edge ribbons on both sides let the depth buffer hide folded-away creases.
      for(let i=0;i<f.vertices.length;i++){
        const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
        const len=Math.hypot(dx,dy,dz);if(len<1e-6)continue;
        const side={x:(dy*n.z-dz*n.y)/len*.0019,y:(dz*n.x-dx*n.z)/len*.0019,z:(dx*n.y-dy*n.x)/len*.0019};
        for(const sign of [1,-1]){
          const v=(p:Point,k:number)=>({x:p.x+side.x*k+n.x*.001*sign,y:p.y+side.y*k+n.y*.001*sign,z:p.z+side.z*k+n.z*.001*sign});
          const aa=v(a,-1),ab=v(a,1),ba=v(b,-1),bb=v(b,1);
          triangle(aa,ba,ab,color('#B78069'));triangle(ab,ba,bb,color('#B78069'));
          triangle(ab,ba,aa,color('#B78069'));triangle(bb,ba,ab,color('#B78069'));
        }
      }
    }
    // Optional drawn details are a decoration, never a folding step or completion criterion.
    const shownStep=this.page==='tutorial'?this.puzzle.tutorialStep:this.puzzle.step;
    if(shownStep===4){
      const ink=color(C.ink),z=.004;
      for(const x of [-.22,.22])for(let i=0;i<16;i++){
        const a=i/16*Math.PI*2,b=(i+1)/16*Math.PI*2;
        triangle({x,y:-.29,z},{x:x+Math.cos(a)*.023,y:-.29+Math.sin(a)*.023,z},{x:x+Math.cos(b)*.023,y:-.29+Math.sin(b)*.023,z},ink);
      }
      triangle({x:-.045,y:-.45,z},{x:0,y:-.51,z},{x:.045,y:-.45,z},ink);
    }
    if(!this.animation&&!this.drag&&!this.observing&&!this.puzzle.wrong){
      const activeStep=this.page==='tutorial'?this.puzzle.tutorialStep:this.puzzle.step;
      const opts=this.page==='tutorial'?(activeStep<4?[STEPS[activeStep]]:[]):options(activeStep);
      const lines=this.page==='studio'&&activeStep===3?opts.slice(0,1):opts;
      lines.forEach((a,i)=>{
        const dx=a.b[0]-a.a[0],dy=a.b[1]-a.a[1],l=Math.hypot(dx,dy),nx=-dy/l*.005,ny=dx/l*.005;
        const crossings:Point[]=[];
        for(const f of faces)for(let j=0;j<f.vertices.length;j++){
          const p=f.vertices[j],q=f.vertices[(j+1)%f.vertices.length];
          const dp=dx*(p.y-a.a[1])-dy*(p.x-a.a[0]),dq=dx*(q.y-a.a[1])-dy*(q.x-a.a[0]);
          if(Math.abs(dp)<1e-6)crossings.push(p);
          if(dp*dq<0){const t=dp/(dp-dq);crossings.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:0});}
        }
        if(crossings.length<2)return;
        crossings.sort((p,q)=>(p.x-q.x)*dx+(p.y-q.y)*dy);
        const p=crossings[0],q=crossings[crossings.length-1],z=.13;
        const aa={x:p.x+nx,y:p.y+ny,z},ab={x:p.x-nx,y:p.y-ny,z},ba={x:q.x+nx,y:q.y+ny,z},bb={x:q.x-nx,y:q.y-ny,z};
        const ink=color(lines.length>1&&i===0?C.coral:C.green);
        triangle(aa,ab,ba,ink);triangle(ab,bb,ba,ink);
      });
    }
    if(pos.length===0)return;
    const geometry={positions:new Float32Array(pos),colors:new Float32Array(colors),indices16:new Uint16Array(indices),minPos:new Vec3(-3,-3,-3),maxPos:new Vec3(3,3,3)};
    if(!this.mesh){this.mesh=utils.MeshUtils.createDynamicMesh(0,geometry,undefined,{maxSubMeshes:1,maxSubMeshVertices:8192,maxSubMeshIndices:8192});this.renderer.mesh=this.mesh;}
    else{this.mesh.updateSubMesh(0,geometry);this.renderer.onGeometryChanged();}
    let center=this.page==='tutorial'?this.puzzle.tutorialStep:this.puzzle.step;
    const active=this.animation??this.pausedReplay;
    if(active?.action.id==='diagonal')center=active.from+(active.to-active.from)*Math.min(1,active.elapsed/active.duration);
    this.paperNode.setPosition(0,center>0?.38:0,0);
    this.paperNode.setRotationFromEuler(this.pitch,this.yaw,-3);
  }
}
