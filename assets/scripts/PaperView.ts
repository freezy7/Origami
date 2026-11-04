import {
  Node,
  Camera,
  MeshRenderer,
  Material,
  Mesh,
  Texture2D,
  Color,
  Vec3,
  Rect,
  Layers,
  utils,
  view,
} from "cc";
import { Face, Fold, Point, normal } from "./core/PaperModel";
import { creaseSegment, XY } from "./core/Interaction";
const color = (s: string) => new Color().fromHEX(s);
export class PaperView {
  readonly camera: Camera;
  readonly rig: Node;
  readonly surface: Node;
  private renderer: MeshRenderer;
  private mesh: Mesh | null = null;
  private material: Material;
  private texture: Texture2D;
  private center = { x: 0, y: 0 };
  private target = { x: 0, y: 0, width: 2 };
  private span = 2;
  private aspect = 1;
  originZ=0;
  yaw = -12;
  pitch = 18;
  zoom = 1;
  paperColor = "#F4AA72";
  backColor = "#FFE8BB";
  constructor(parent: Node) {
    const cam = new Node("Paper camera");
    parent.addChild(cam);
    cam.setPosition(0, 0, 8);
    this.camera = cam.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 30;
    this.camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    this.camera.visibility = Layers.Enum.DEFAULT;
    this.camera.priority = (1 << 30) + 100;
    this.rig = new Node("Paper orbit");
    parent.addChild(this.rig);
    this.surface = new Node("Paper surface");
    this.rig.addChild(this.surface);
    this.renderer = this.surface.addComponent(MeshRenderer);
    this.texture = new Texture2D();
    this.texture.reset({
      width: 256,
      height: 256,
      format: Texture2D.PixelFormat.RGBA8888,
    });
    const pixels = new Uint8Array(256 * 256 * 4);
    let seed = 731;
    for (let i = 0; i < 256 * 256; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = 249 + (seed % 7);
      pixels.set([n, n, n, 255], i * 4);
    }
    this.texture.uploadData(pixels);
    this.material = new Material();
    this.material.initialize({
      effectName: "builtin-unlit",
      defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: true },
    });
    this.material.setProperty("mainTexture", this.texture);
    this.renderer.setMaterial(this.material, 0);
  }
  viewport(
    bottom: number,
    height: number,
    screenHeight: number,
    width = 346,
    left = 22,
  ): void {
    this.camera.rect = new Rect(
      left / 390,
      bottom / screenHeight,
      width / 390,
      height / screenHeight,
    );
    this.aspect = width / height;
    this.applyTransform();
  }
  frame(faces: Face[], immediate = false): void {
    const points = faces.reduce<Point[]>(
        (all, f) => all.concat(f.vertices),
        [],
      ),
      xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    const x0 = Math.min(...xs),
      x1 = Math.max(...xs),
      y0 = Math.min(...ys),
      y1 = Math.max(...ys);
    this.target = {
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      width: Math.max(x1 - x0, (y1 - y0) * this.aspect, 1.3),
    };
    if (immediate) {
      this.center = { x: this.target.x, y: this.target.y };
      this.span = this.target.width;
    }
    this.applyTransform();
  }
  update(dt: number): void {
    const t = 1 - Math.exp(-Math.min(dt, 0.1) * 12);
    this.center.x += (this.target.x - this.center.x) * t;
    this.center.y += (this.target.y - this.center.y) * t;
    this.span += (this.target.width - this.span) * t;
    this.applyTransform();
  }
  applyTransform(): void {
    this.rig.setRotationFromEuler(this.pitch, this.yaw, 0);
    this.surface.setPosition(-this.center.x, -this.center.y, -this.originZ);
    this.camera.orthoHeight =
      (this.span * 1.25) / (2 * this.aspect * this.zoom);
  }
  orbit(dx: number, dy: number): void {
    this.yaw = ((((this.yaw + dx * 0.55 + 180) % 360) + 360) % 360) - 180;
    this.pitch = ((((this.pitch - dy * 0.5 + 180) % 360) + 360) % 360) - 180;
    this.applyTransform();
  }
  reset(): void {
    this.yaw = -12;
    this.pitch = 18;
    this.zoom = 1;
    this.applyTransform();
  }
  get back(): boolean {
    return Math.cos((this.yaw * Math.PI) / 180) < 0;
  }
  project(p: Point, canvas: Node): XY {
    const world = Vec3.transformMat4(
      new Vec3(),
      new Vec3(p.x, p.y, p.z),
      this.surface.worldMatrix,
    );
    // Fixed, unrotated orthographic camera: project directly in design points.
    // Cocos 3.8.8 worldToScreen uses a flipped viewport origin on Metal.
    const height = view.getVisibleSize().height,
      rect = this.camera.rect;
    const scale = (rect.height * height) / (2 * this.camera.orthoHeight);
    return {
      x: (rect.x + rect.width / 2 - 0.5) * 390 + world.x * scale,
      y: (rect.y + rect.height / 2) * height - height / 2 + world.y * scale,
    };
  }
  render(
    faces: Face[],
    creases: Fold[] = [],
    selected = -1,
    decorate = false,
    drawEdges = true,
  ): void {
    const positions: number[] = [],
      colors: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    const triangle = (a: Point, b: Point, c: Point, fill: Color, shade = 1) => {
      const index = positions.length / 3;
      for (const p of [a, b, c]) {
        positions.push(p.x, p.y, p.z);
        colors.push(
          (fill.r / 255) * shade,
          (fill.g / 255) * shade,
          (fill.b / 255) * shade,
          1,
        );
        uvs.push(((p.u ?? p.x) + 1) * 0.5, ((p.v ?? p.y) + 1) * 0.5);
      }
      indices.push(index, index + 1, index + 2);
    };
    for (const f of faces) {
      const n = normal(f),
        worldN = Vec3.transformQuat(
          new Vec3(),
          new Vec3(n.x, n.y, n.z),
          this.rig.rotation,
        );
      const shade =
        0.83 +
        0.17 * Math.abs(worldN.x * -0.35 + worldN.y * 0.4 + worldN.z * 0.85);
      for (let i = 1; i < f.vertices.length - 1; i++) {
        triangle(
          f.vertices[0],
          f.vertices[i],
          f.vertices[i + 1],
          color(this.paperColor),
          shade,
        );
        triangle(
          f.vertices[0],
          f.vertices[i + 1],
          f.vertices[i],
          color(this.backColor),
          shade,
        );
      }
      if (drawEdges)
        for (let i = 0; i < f.vertices.length; i++) {
          const a = f.vertices[i],
            b = f.vertices[(i + 1) % f.vertices.length],
            dx = b.x - a.x,
            dy = b.y - a.y,
            dz = b.z - a.z,
            len = Math.hypot(dx, dy, dz);
          if (len < 1e-6) continue;
          const side = {
            x: ((dy * n.z - dz * n.y) / len) * 0.002,
            y: ((dz * n.x - dx * n.z) / len) * 0.002,
            z: ((dx * n.y - dy * n.x) / len) * 0.002,
          };
          for (const sign of [1, -1]) {
            const v = (p: Point, k: number) => ({
              ...p,
              x: p.x + side.x * k + n.x * 0.0015 * sign,
              y: p.y + side.y * k + n.y * 0.0015 * sign,
              z: p.z + side.z * k + n.z * 0.0015 * sign,
            });
            const aa = v(a, -1),
              ab = v(a, 1),
              ba = v(b, -1),
              bb = v(b, 1),
              ink = color("#BE825B");
            triangle(aa, ba, ab, ink);
            triangle(ab, ba, bb, ink);
            triangle(ab, ba, aa, ink);
            triangle(bb, ba, ab, ink);
          }
        }
    }
    if (decorate) {
      const ink = color("#244B50"),
        z = 0.005;
      for (const x of [-0.22, 0.22])
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2,
            b = ((i + 1) / 20) * Math.PI * 2;
          triangle(
            { x, y: -0.29, z },
            { x: x + Math.cos(a) * 0.026, y: -0.29 + Math.sin(a) * 0.026, z },
            { x: x + Math.cos(b) * 0.026, y: -0.29 + Math.sin(b) * 0.026, z },
            ink,
          );
        }
      triangle(
        { x: -0.05, y: -0.45, z },
        { x: 0, y: -0.51, z },
        { x: 0.05, y: -0.45, z },
        ink,
      );
    }
    creases.forEach((a, i) => {
      const line = creaseSegment(faces, a);
      if (!line) return;
      const [p, q] = line,
        dx = q.x - p.x,
        dy = q.y - p.y,
        l = Math.hypot(dx, dy);
      if (l < 1e-6) return;
      const maxZ = Math.max(
          ...faces.reduce<number[]>(
            (all, f) => all.concat(f.vertices.map((p) => p.z)),
            [],
          ),
        ),
        minZ = Math.min(
          ...faces.reduce<number[]>(
            (all, f) => all.concat(f.vertices.map((p) => p.z)),
            [],
          ),
        );
      // Dashes on both visible sides: selection color never encodes the answer.
      for (const z of [maxZ + 0.006, minZ - 0.006])
        for (let j = 0; j < 18; j += 2) {
          const pt = (t: number, s: number) => ({
            x: p.x + dx * t - (dy / l) * 0.004 * s,
            y: p.y + dy * t + (dx / l) * 0.004 * s,
            z,
          });
          const aa = pt(j / 18, -1),
            ab = pt(j / 18, 1),
            ba = pt((j + 1) / 18, -1),
            bb = pt((j + 1) / 18, 1);
          const ink = color(i === selected ? "#257A82" : "#7A777F");
          triangle(aa, ab, ba, ink);
          triangle(ab, bb, ba, ink);
          triangle(ab, aa, ba, ink);
          triangle(bb, ab, ba, ink);
        }
    });
    if (!positions.length) return;
    const geometry = {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      uvs: new Float32Array(uvs),
      indices16: new Uint16Array(indices),
      minPos: new Vec3(-4, -4, -4),
      maxPos: new Vec3(4, 4, 4),
    };
    if (!this.mesh) {
      this.mesh = utils.MeshUtils.createDynamicMesh(0, geometry, undefined, {
        maxSubMeshes: 1,
        maxSubMeshVertices: 8192,
        maxSubMeshIndices: 8192,
      });
      this.renderer.mesh = this.mesh;
    } else {
      this.mesh.updateSubMesh(0, geometry);
      this.renderer.onGeometryChanged();
    }
  }
  destroy(): void {
    this.mesh?.destroy();
    this.material.destroy();
    this.texture.destroy();
  }
}
