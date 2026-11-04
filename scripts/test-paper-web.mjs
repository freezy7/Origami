import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const folder = "artifacts/paper-simulator/web";
mkdirSync(folder, { recursive: true });
const compiler = spawnSync(
  process.env.CXX ?? "clang++",
  [
    "-std=c++17",
    "-O2",
    "native/paper/Sheet.cpp",
    "native/paper/web/Bridge.cpp",
    "tests/paper/web_bridge_driver.cpp",
    "-o",
    `${folder}/bridge-driver`,
  ],
  { encoding: "utf8" },
);
assert.equal(compiler.status, 0, compiler.stderr);
const factory = createRequire(import.meta.url)(
  resolve("build/web-kernel/paper-kernel.js"),
);
const module = await factory({
  wasmBinary: readFileSync("build/web-kernel/paper-kernel.wasm"),
});
const raw = module.cwrap("paper_call", "string", [
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "string",
  "number",
]);
const call = (
  op,
  id = 0,
  u = 0,
  v = 0,
  x = 0,
  y = 0,
  z = 0,
  dt = 0,
  flags = 0,
  state = "",
) => JSON.parse(raw(op, id, u, v, x, y, z, dt, state, flags));
const commands = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 1, -0.1, -0.14, -0.1, -0.14, 0.000075, 0, 1],
  [3, 2, 0.09, 0.13, 0.09, 0.13, 0.000075, 0, 0],
];
for (let n = 1; n <= 12; n++) {
  commands.push([
    4,
    2,
    0,
    0,
    0.09 - n * 0.001,
    0.13 - n * 0.001,
    n * 0.003,
    0,
    0,
  ]);
  commands.push([2, 0, 0, 0, 0, 0, 0, 1 / 60, 0]);
}
commands.push([7, 0, 0, 0, 0, 0, 0, 0, 0]);
const native = spawnSync(`${folder}/bridge-driver`, [], {
  input: commands.map((c) => c.join(" ")).join("\n") + "\n",
  encoding: "utf8",
});
assert.equal(native.status, 0, native.stderr);
const expected = native.stdout
  .trim()
  .split("\n")
  .map((s) => JSON.parse(s));
let peakError = 0;
const frames = commands.map((cmd, i) => {
  const frame = call(...cmd);
  assert.equal(frame.ok, true, frame.error);
  assert.equal(expected[i].ok, true, expected[i].error);
  assert.deepEqual(frame.triangles, expected[i].triangles);
  assert.deepEqual(frame.uv, expected[i].uv);
  frame.positions.forEach((v, j) => {
    assert.ok(Number.isFinite(v));
    peakError = Math.max(peakError, Math.abs(v - expected[i].positions[j]));
  });
  return frame;
});
// Experimental port smoke budget: topology/commands are exact, nonlinear
// trajectories are bounded to 1 mm here. This is not a material-accuracy gate.
const portToleranceMeters = 0.001;
assert.ok(
  peakError < portToleranceMeters,
  `WASM/native position difference ${peakError}`,
);
for (const f of [...frames, ...expected]) assert.ok(f.stats.strainMax < 0.02);
const first = frames[0],
  last = frames.at(-1);
assert.equal(first.positions.length, 324);
assert.equal(first.stats.plastic, 0);
assert.ok(Math.abs(first.stats.mass - 0.21 * 0.297 * 0.08) < 1e-12);
assert.ok(Math.max(...last.positions.filter((_, i) => i % 3 === 2)) > 0.01);
const saved = last.state;
assert.ok(saved);
const loaded = call(8, 0, 0, 0, 0, 0, 0, 0, 0, saved);
assert.equal(loaded.ok, true);
assert.deepEqual(loaded.positions, last.positions);
assert.equal(call(8, 0, 0, 0, 0, 0, 0, 0, 0, "broken snapshot").ok, false);
assert.equal(call(7).state, saved, "Bad import preserves current sheet");
assert.equal(
  call(2, 0, 0, 0, 0, 0, 0, NaN).ok,
  false,
  "Nonfinite time rejected",
);
assert.equal(call(999).ok, false, "Unknown operation rejected");
const paused = call(6);
assert.equal(paused.anchors.length, 1);
assert.equal(paused.anchors[0].pin, true);
assert.ok(paused.state);
const reloaded = call(8, 0, 0, 0, 0, 0, 0, 0, 0, paused.state);
assert.deepEqual(reloaded.positions, paused.positions);
const crossLoaded = call(8, 0, 0, 0, 0, 0, 0, 0, 0, expected.at(-1).state);
assert.equal(crossLoaded.ok, true);
assert.deepEqual(crossLoaded.positions, expected.at(-1).positions);
const result = {
  date: new Date().toISOString(),
  platform:
    "Node WebAssembly and clang++ desktop; not browser/device acceptance",
  commands: commands.length,
  peakPositionDifferenceMeters: peakError,
  portToleranceMeters,
  nodes: 108,
  checks: [
    "A4 dimensions and mass",
    "No initial crease",
    "Exact topology and bounded trajectory difference",
    "Raised paper",
    "Exact snapshot reload",
    "Transactional malformed import",
    "Invalid operation and dt rejected",
    "Pause releases transient grip, retains pin",
  ],
};
writeFileSync(
  `${folder}/kernel-summary.json`,
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
