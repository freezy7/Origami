import {
  Node,
  MeshRenderer,
  Mesh,
  Material,
  utils,
  Vec3,
  Quat,
  Color,
  Graphics,
} from "cc";
import { PaperAnchor } from "./core/PaperHands";
import { PaperView } from "./PaperView";
import { Face, Point } from "./core/PaperModel";
export const LAB_SCALE = 13.3333333333333;
export type LabFrame = {
  ok: boolean;
  error?: string;
  positions: number[];
  uv?: number[];
  triangles?: number[];
  creases?: number[][];
  boundary?: number[][];
  anchors: (PaperAnchor & { target: [number, number, number] })[];
  state?: string;
  audit?: {checked:boolean;intersections:number;penetration:number};
  solver: string;
  stats: {
    time: number;
    ms: number;
    strainMax: number;
    strainP95: number;
    mass: number;
    area: number;
    plastic: number;
    maxPlastic: number;
    contacts: number;
    ccdLimited: number;
    backlog: number;
    maxSpeed?: number;
  };
};
export type PaperPick = {
  uv: { x: number; y: number };
  p: Vec3;
  screen: { x: number; y: number };
};
const color = (hex: string) => new Color().fromHEX(hex);
export class PaperLabView {
  readonly paper: PaperView;
  private floorMesh: Mesh;
  private lineMesh: Mesh | null = null;
  private lineRenderer: MeshRenderer;
  private floorMaterial: Material;
  private lineMaterial: Material;
  private positions: number[] = [];
  private uv: number[] = [];
  private triangles: number[] = [];
  private creases: number[][] = [];
  private boundary: number[][] = [];
  constructor(parent: Node, showDesk = true) {
    this.paper = new PaperView(parent);
    this.paper.paperColor = "#FFFDF6";
    this.paper.backColor = "#E8EEEB";
    this.paper.zoom = 0.9;
    this.paper.pitch = 52;
    this.paper.yaw = -16;
    this.paper.applyTransform();
    const floor = new Node("Paper work surface");
    floor.active = showDesk;
    this.paper.surface.addChild(floor);
    floor.setPosition(0, 0, -0.004);
    const renderer = floor.addComponent(MeshRenderer);
    this.floorMaterial = new Material();
    this.floorMaterial.initialize({
      effectName: "builtin-unlit",
      defines: { USE_VERTEX_COLOR: true },
    });
    renderer.setMaterial(this.floorMaterial, 0);
    const p: number[] = [],
      c: number[] = [],
      idx: number[] = [];
    const quad = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      z: number,
      fill: string,
    ) => {
      const n = p.length / 3,
        ink = color(fill);
      p.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
      for (let i = 0; i < 4; i++)
        c.push(ink.r / 255, ink.g / 255, ink.b / 255, 1);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    };
    quad(-3, -3.7, 3, 3.7, 0, "#AAC3B7");
    for (let x = -2.75; x < 3; x += 0.25)
      quad(x - 0.001, -3.7, x + 0.001, 3.7, 0.0005, "#91ACA1");
    for (let y = -3.5; y < 3.7; y += 0.25)
      quad(-3, y - 0.001, 3, y + 0.001, 0.0005, "#91ACA1");
    this.floorMesh = utils.MeshUtils.createDynamicMesh(
      0,
      {
        positions: new Float32Array(p),
        colors: new Float32Array(c),
        indices16: new Uint16Array(idx),
      },
      undefined,
      { maxSubMeshes: 1, maxSubMeshVertices: 2048, maxSubMeshIndices: 4096 },
    );
    renderer.mesh = this.floorMesh;
    const line = new Node("Material creases");
    this.paper.surface.addChild(line);
    this.lineRenderer = line.addComponent(MeshRenderer);
    this.lineMaterial = new Material();
    this.lineMaterial.initialize({
      effectName: "builtin-unlit",
      defines: { USE_VERTEX_COLOR: true },
    });
    this.lineRenderer.setMaterial(this.lineMaterial, 0);
  }
  viewport(
    bottom: number,
    height: number,
    h: number,
    width = 318,
    left = 12,
  ): void {
    this.paper.viewport(bottom, height, h, width, left);
  }
  private point(i: number): Point {
    return {
      x: this.positions[i * 3] * LAB_SCALE,
      y: this.positions[i * 3 + 1] * LAB_SCALE,
      z: this.positions[i * 3 + 2] * LAB_SCALE,
      u: this.uv[i * 2] / 0.105,
      v: this.uv[i * 2 + 1] / 0.1485,
    };
  }
  setFrame(frame: LabFrame, first = false): void {
    this.positions = frame.positions;
    if (frame.uv) this.uv = frame.uv;
    if (frame.triangles) {
      this.triangles = frame.triangles;
      const counts = new Map<string, { a: number; b: number; count: number }>();
      for (let i = 0; i < this.triangles.length; i += 3)
        for (let j = 0; j < 3; j++) {
          const a = this.triangles[i + j],
            b = this.triangles[i + ((j + 1) % 3)],
            key = [Math.min(a, b), Math.max(a, b)].join(",");
          const value = counts.get(key);
          if (value) value.count++;
          else counts.set(key, { a, b, count: 1 });
        }
      this.boundary = Array.from(counts.values())
        .filter((e) => e.count === 1)
        .map((e) => [e.a, e.b, 0]);
    }
    if (frame.boundary) this.boundary = frame.boundary;
    if (frame.creases) this.creases = frame.creases;
    const faces: Face[] = [];
    for (let i = 0; i < this.triangles.length; i += 3)
      faces.push({
        layer: 0,
        vertices: [
          this.point(this.triangles[i]),
          this.point(this.triangles[i + 1]),
          this.point(this.triangles[i + 2]),
        ],
      });
    if (first) this.paper.frame(faces, true);
    this.paper.render(faces, [], -1, false, false);
    this.drawCreases();
  }
  redraw(): void {
    if (this.positions.length)
      this.setFrame({ positions: this.positions } as LabFrame);
  }
  private drawCreases(): void {
    const lines = this.boundary.concat(this.creases);
    this.lineRenderer.enabled = lines.length > 0;
    if (!lines.length) return;
    const pos: number[] = [],
      colors: number[] = [],
      indices: number[] = [],
      normals: Vec3[] = Array.from(
        { length: this.positions.length / 3 },
        () => new Vec3(),
      );
    for (let i = 0; i < this.triangles.length; i += 3) {
      const ids = this.triangles.slice(i, i + 3),
        p = ids.map((id) => {
          const v = this.point(id);
          return new Vec3(v.x, v.y, v.z);
        }),
        n = Vec3.cross(
          new Vec3(),
          Vec3.subtract(new Vec3(), p[1], p[0]),
          Vec3.subtract(new Vec3(), p[2], p[0]),
        ).normalize();
      ids.forEach((id) => normals[id].add(n));
    }
    for (const e of lines) {
      const a = this.point(e[0]),
        b = this.point(e[1]),
        t = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z).normalize(),
        n = normals[e[0]].clone().add(normals[e[1]]).normalize(),
        side = Vec3.cross(new Vec3(), t, n).normalize().multiplyScalar(0.002),
        raise = n.clone().multiplyScalar(0.001),
        base = pos.length / 3;
      for (const [p, s] of [
        [a, -1],
        [a, 1],
        [b, -1],
        [b, 1],
      ] as [Point, number][]) {
        pos.push(
          p.x + side.x * s + raise.x,
          p.y + side.y * s + raise.y,
          p.z + side.z * s + raise.z,
        );
        colors.push(0.47, 0.51, 0.48, 1);
      }
      indices.push(
        base,
        base + 1,
        base + 2,
        base + 1,
        base + 3,
        base + 2,
        base + 2,
        base + 1,
        base,
        base + 2,
        base + 3,
        base + 1,
      );
    }
    const geo = {
      positions: new Float32Array(pos),
      colors: new Float32Array(colors),
      indices16: new Uint16Array(indices),
    };
    if (!this.lineMesh) {
      this.lineMesh = utils.MeshUtils.createDynamicMesh(0, geo, undefined, {
        maxSubMeshes: 1,
        maxSubMeshVertices: 8192,
        maxSubMeshIndices: 16384,
      });
      this.lineRenderer.mesh = this.lineMesh;
    } else {
      this.lineMesh.updateSubMesh(0, geo);
      this.lineRenderer.onGeometryChanged();
    }
  }
  pick(p: { x: number; y: number }, canvas: Node): PaperPick | null {
    let best: PaperPick | null = null,
      depth = -Infinity,
      edgeDistance = 19;
    const projected = this.positions
      .filter((_, i) => i % 3 === 0)
      .map((_, i) => {
        const point = this.point(i),
          screen = this.paper.project(point, canvas),
          world = Vec3.transformMat4(
            new Vec3(),
            new Vec3(point.x, point.y, point.z),
            this.paper.surface.worldMatrix,
          );
        return { screen, z: world.z };
      });
    const hit = (ids: number[], w: number[], distance = 0) => {
      const z = ids.reduce((v, id, i) => v + projected[id].z * w[i], 0);
      if (
        (distance === 0 && z > depth) ||
        (depth === -Infinity && distance < edgeDistance)
      ) {
        if (distance === 0) depth = z;
        edgeDistance = distance;
        const uv = { x: 0, y: 0 },
          physical = new Vec3();
        ids.forEach((id, i) => {
          uv.x += this.uv[id * 2] * w[i];
          uv.y += this.uv[id * 2 + 1] * w[i];
          physical.x += this.positions[id * 3] * w[i];
          physical.y += this.positions[id * 3 + 1] * w[i];
          physical.z += this.positions[id * 3 + 2] * w[i];
        });
        best = { uv, p: physical, screen: p };
      }
    };
    for (let i = 0; i < this.triangles.length; i += 3) {
      const ids = this.triangles.slice(i, i + 3),
        a = projected[ids[0]].screen,
        b = projected[ids[1]].screen,
        c = projected[ids[2]].screen,
        den = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(den) < 1e-5) continue;
      const w1 = ((p.x - a.x) * (c.y - a.y) - (p.y - a.y) * (c.x - a.x)) / den,
        w2 = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / den,
        w0 = 1 - w1 - w2;
      if (Math.min(w0, w1, w2) >= 0) hit(ids, [w0, w1, w2]);
      for (let e = 0; e < 3; e++) {
        const aa = projected[ids[e]].screen,
          bb = projected[ids[(e + 1) % 3]].screen,
          dx = bb.x - aa.x,
          dy = bb.y - aa.y,
          t = Math.max(
            0,
            Math.min(
              1,
              ((p.x - aa.x) * dx + (p.y - aa.y) * dy) /
                Math.max(1e-8, dx * dx + dy * dy),
            ),
          ),
          distance = Math.hypot(p.x - aa.x - t * dx, p.y - aa.y - t * dy);
        if (distance < edgeDistance)
          hit([ids[e], ids[(e + 1) % 3]], [1 - t, t], distance);
      }
    }
    return best;
  }
  displacement(dx: number, dy: number): Vec3 {
    const viewport = this.paper.camera.rect,
      pixels =
        (viewport.height * this.screenHeight) /
        (2 * this.paper.camera.orthoHeight),
      sx = dx / pixels,
      sy = dy / pixels,
      ex = Vec3.transformQuat(
        new Vec3(),
        new Vec3(1, 0, 0),
        this.paper.rig.rotation,
      ),
      ey = Vec3.transformQuat(
        new Vec3(),
        new Vec3(0, 1, 0),
        this.paper.rig.rotation,
      ),
      det = ex.x * ey.y - ey.x * ex.y;
    if (Math.abs(det) > 0.25)
      return new Vec3(
        (sx * ey.y - ey.x * sy) / det,
        (ex.x * sy - sx * ex.y) / det,
        0,
      ).multiplyScalar(1 / LAB_SCALE);
    // Edge-on views have no unique planar inverse. Bounded screen-plane
    // projection avoids exploding targets; the separate rail still sets z.
    const delta = Vec3.transformQuat(
      new Vec3(),
      new Vec3(sx, sy, 0),
      Quat.invert(new Quat(), this.paper.rig.rotation),
    );
    delta.z = 0;
    return delta.multiplyScalar(1 / LAB_SCALE);
  }

  screenHeight = 844;
  project(p: number[], canvas: Node): { x: number; y: number } {
    return this.paper.project(
      { x: p[0] * LAB_SCALE, y: p[1] * LAB_SCALE, z: p[2] * LAB_SCALE },
      canvas,
    );
  }
  markers(
    g: Graphics,
    frame: LabFrame,
    canvas: Node,
    selected: number | null = null,
  ): void {
    g.clear();
    for (const a of frame.anchors) {
      const p = this.project(a.p, canvas),
        r = this.paper.camera.rect,
        bottom = r.y * this.screenHeight - this.screenHeight / 2;
      if (
        Math.abs(p.x) > 160 ||
        p.y < bottom + 14 ||
        p.y > bottom + r.height * this.screenHeight - 14
      )
        continue;
      g.strokeColor = color(a.pin ? "#277F83" : "#DB8259");
      g.fillColor = color(a.pin ? "#277F83" : "#DB8259");
      g.lineWidth = 2;
      g.circle(p.x, p.y, a.pin ? 8 : 12);
      g.stroke();
      g.circle(p.x, p.y, 2);
      g.fill();
      if (a.id === selected) {
        const target = this.project(a.target, canvas);
        g.strokeColor = color("#DB8259");
        g.moveTo(p.x, p.y);
        g.lineTo(target.x, target.y);
        g.stroke();
        g.circle(target.x, target.y, 5);
        g.stroke();
        g.circle(p.x, p.y, 16);
        g.stroke();
      }
    }
  }
  destroy(): void {
    this.paper.destroy();
    this.floorMesh.destroy();
    this.lineMesh?.destroy();
    this.floorMaterial.destroy();
    this.lineMaterial.destroy();
  }
}
