/** Engine-independent planar paper folds. Only authored, flat-folded steps are supported. */
export type Point = { x: number; y: number; z: number; u?: number; v?: number };
export type Face = { vertices: Point[]; layer: number };
export type Fold = {
  id: string;
  title: string;
  instruction: string;
  a: [number, number];
  b: [number, number];
  side: 1 | -1;
  angle: number;
  toward: "front" | "back";
  valid: boolean;
};
export const MODEL_VERSION = 1;
export const THICKNESS = 0.008;
const EPS = 1e-8;
const fold = (v: Fold): Fold => v;
export const STEPS: Fold[] = [
  fold({
    id: "diagonal",
    title: "A simple beginning",
    instruction:
      "Bring the top corner behind the bottom corner. Make a triangle.",
    a: [-1, 0],
    b: [1, 0],
    side: 1,
    angle: -Math.PI,
    toward: "back",
    valid: true,
  }),
  fold({
    id: "left-ear",
    title: "Find the floppy ear",
    instruction:
      "Compare the two crease lines with the little puppy. Which makes a drooping ear?",
    a: [-0.5, 0],
    b: [-0.82, -0.18],
    side: -1,
    angle: -Math.PI,
    toward: "front",
    valid: true,
  }),
  fold({
    id: "right-ear",
    title: "A matching pair",
    instruction: "Fold the other ear down to match the first one.",
    a: [0.5, 0],
    b: [0.82, -0.18],
    side: 1,
    angle: Math.PI,
    toward: "front",
    valid: true,
  }),
  fold({
    id: "chin",
    title: "Shape the little face",
    instruction:
      "Tuck the bottom corner behind the face. Look from the side if you need to.",
    a: [-1.2, -0.72],
    b: [1.2, -0.72],
    side: -1,
    angle: Math.PI,
    toward: "back",
    valid: true,
  }),
];
export const WRONG_EAR: Fold = {
  ...STEPS[1],
  id: "short-ear",
  a: [-0.5, 0],
  b: [-0.93, -0.07],
  valid: false,
};
export const WRONG_CHIN: Fold = {
  ...STEPS[3],
  id: "chin-front",
  angle: -Math.PI,
  toward: "front",
  valid: false,
};
export function options(step: number): Fold[] {
  if (step === 1) return [WRONG_EAR, STEPS[1]];
  if (step === 3) return [STEPS[3], WRONG_CHIN];
  return step < STEPS.length ? [STEPS[step]] : [];
}
export function initialPaper(): Face[] {
  return [
    {
      layer: 0,
      vertices: [
        { x: -1, y: 0, z: 0 },
        { x: 0, y: -1, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
    },
  ];
}
export function copyPaper(faces: Face[]): Face[] {
  return faces.map((f) => ({
    layer: f.layer,
    vertices: f.vertices.map((p) => ({ ...p })),
  }));
}
function distance(p: Point, action: Fold): number {
  return (
    (action.b[0] - action.a[0]) * (p.y - action.a[1]) -
    (action.b[1] - action.a[1]) * (p.x - action.a[0])
  );
}
function area(vertices: Point[]): number {
  return (
    Math.abs(
      vertices.reduce((sum, p, i) => {
        const q = vertices[(i + 1) % vertices.length];
        return sum + p.x * q.y - q.x * p.y;
      }, 0),
    ) / 2
  );
}
function clip(vertices: Point[], action: Fold, side: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i],
      q = vertices[(i + 1) % vertices.length];
    const dp = distance(p, action) * side,
      dq = distance(q, action) * side;
    if (dp >= -EPS) result.push({ ...p });
    if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
      const t = dp / (dp - dq);
      result.push({
        x: p.x + t * (q.x - p.x),
        y: p.y + t * (q.y - p.y),
        z: p.z + t * (q.z - p.z),
        u: (p.u ?? p.x) + t * ((q.u ?? q.x) - (p.u ?? p.x)),
        v: (p.v ?? p.y) + t * ((q.v ?? q.y) - (p.v ?? p.y)),
      });
    }
  }
  return result.filter(
    (p, i) =>
      i === 0 || Math.hypot(p.x - result[i - 1].x, p.y - result[i - 1].y) > EPS,
  );
}
export function normal(face: Face): Point {
  for (let i = 1; i < face.vertices.length - 1; i++) {
    const [a, b, c] = [
      face.vertices[0],
      face.vertices[i],
      face.vertices[i + 1],
    ];
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const n = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    const length = Math.hypot(n.x, n.y, n.z);
    if (length > EPS)
      return { x: n.x / length, y: n.y / length, z: n.z / length };
  }
  return { x: 0, y: 0, z: 1 };
}
export function foldPaper(
  faces: Face[],
  action: Fold,
  progress: number,
): Face[] {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) return copyPaper(faces);
  const angle = action.angle * t;
  const dx = action.b[0] - action.a[0],
    dy = action.b[1] - action.a[1];
  const length = Math.hypot(dx, dy),
    ux = dx / length,
    uy = dy / length;
  if (length < EPS) throw new Error("Fold axis has zero length");
  const min = Math.min(...faces.map((f) => f.layer)),
    max = Math.max(...faces.map((f) => f.layer));
  const result: Face[] = [];
  for (const face of faces) {
    const stationary = clip(face.vertices, action, -action.side);
    if (stationary.length >= 3 && area(stationary) > EPS)
      result.push({ layer: face.layer, vertices: stationary });
    const moving = clip(face.vertices, action, action.side);
    if (moving.length < 3 || area(moving) < EPS) continue;
    const layer =
      action.toward === "front"
        ? max + 1 + max - face.layer
        : min - 1 - face.layer + min;
    const pivotZ = face.layer * THICKNESS;
    const lift = (layer - face.layer) * THICKNESS * t;
    result.push({
      layer,
      vertices: moving.map((p) => {
        const x = p.x - action.a[0],
          y = p.y - action.a[1],
          z = p.z - pivotZ;
        const dot = x * ux + y * uy,
          cos = Math.cos(angle),
          sin = Math.sin(angle);
        return {
          u: p.u ?? p.x,
          v: p.v ?? p.y,
          x: action.a[0] + x * cos + uy * z * sin + ux * dot * (1 - cos),
          y: action.a[1] + y * cos - ux * z * sin + uy * dot * (1 - cos),
          z: pivotZ + (ux * y - uy * x) * sin + z * cos + lift,
        };
      }),
    });
  }
  return result;
}
export function paperAt(step: number): Face[] {
  let faces = initialPaper();
  for (const action of STEPS.slice(
    0,
    Math.max(0, Math.min(STEPS.length, step)),
  ))
    faces = foldPaper(faces, action, 1);
  return faces;
}
export type SaveData = {
  version: number;
  step: number;
  complete: boolean;
  favorite: boolean;
  tutorialStep: number;
};
export type SaveResult = { ok: boolean; message?: string };
export class Puzzle {
  step = 0;
  wrong: Fold | null = null;
  complete = false;
  favorite = false;
  tutorialStep = 0;
  hints = 0;
  get faces(): Face[] {
    return this.wrong
      ? foldPaper(paperAt(this.step), this.wrong, 1)
      : paperAt(this.step);
  }
  get finished(): boolean {
    return this.step === STEPS.length;
  }
  commit(actionId: string): boolean {
    if (this.wrong || this.finished) return false;
    const action = options(this.step).find((a) => a.id === actionId);
    if (!action) return false;
    if (action.valid) {
      this.step++;
      if (this.finished) {
        if (!this.complete) this.favorite = true;
        this.complete = true;
      }
    } else this.wrong = action;
    this.hints = 0;
    return true;
  }
  undo(): boolean {
    if (this.wrong) {
      this.wrong = null;
      return true;
    }
    if (this.step === 0) return false;
    this.step--;
    this.hints = 0;
    return true;
  }
  restart(): void {
    this.step = 0;
    this.wrong = null;
    this.hints = 0;
  }
  save(): SaveData {
    return {
      version: MODEL_VERSION,
      step: this.step,
      complete: this.complete,
      favorite: this.favorite,
      tutorialStep: this.tutorialStep,
    };
  }
  static restore(raw: string | null): Puzzle {
    const puzzle = new Puzzle();
    if (!raw) return puzzle;
    try {
      const d = JSON.parse(raw) as Partial<SaveData>;
      puzzle.complete = d.complete === true;
      puzzle.favorite = puzzle.complete && d.favorite === true;
      if (d.version === MODEL_VERSION) {
        puzzle.step =
          Number.isInteger(d.step) && d.step! >= 0 && d.step! <= STEPS.length
            ? d.step!
            : 0;
        // A finished state is itself an earned completion, even if a partial save omitted the flag.
        puzzle.complete ||= puzzle.step === STEPS.length;
        puzzle.tutorialStep = Number.isInteger(d.tutorialStep)
          ? Math.max(0, Math.min(STEPS.length, d.tutorialStep!))
          : 0;
      }
    } catch {
      /* Corrupt local data must not prevent entering the game. */
    }
    return puzzle;
  }
}
