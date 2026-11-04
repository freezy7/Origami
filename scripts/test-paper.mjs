import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
const root = ".cache/paper-lab";
mkdirSync(root, { recursive: true });
const run = (cmd, args, options = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...options });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    process.exit(r.status ?? 1);
  }
  return r;
};
for (const [source, name] of [
  ["paper_tests.cpp", "paper-tests"],
  ["paper_bench.cpp", "paper-bench"],
  ["paper_cycles.cpp", "paper-cycles"],
])
  run(process.env.CXX ?? "clang++", [
    "-std=c++17",
    "-O2",
    "-Wall",
    "-Wextra",
    "-I",
    "native/paper",
    "native/paper/Sheet.cpp",
    `tests/paper/${source}`,
    "-o",
    `${root}/${name}`,
  ]);
console.log(run(`${root}/paper-tests`, []).stdout.trim());
if (process.argv.includes("--bench") || process.argv.includes("--cycles")) {
  const folder = `artifacts/paper-simulator/${Date.now()}`;
  mkdirSync(folder, { recursive: true });
  const runs = [];
  if (process.argv.includes("--bench"))
    runs.push(run(`${root}/paper-bench`, [folder]));
  if (process.argv.includes("--cycles"))
    runs.push(run(`${root}/paper-cycles`, []));
  const r = { stdout: runs.map((x) => x.stdout.trim()).join("\n") };
  const cases = r.stdout
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  const result = {
    date: new Date().toISOString(),
    host: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0].model },
    build: "clang++ -O2 C++17; desktop, not iOS",
    compilerVersion:run(process.env.CXX ?? "clang++",["--version"]).stdout.split("\n")[0],
    nodeVersion:process.version,
    sourceSha256: createHash("sha256")
      .update(
        [
          "native/paper/Geometry.hpp",
          "native/paper/Sheet.hpp",
          "native/paper/Sheet.cpp",
          "tests/paper/paper_bench.cpp",
          "tests/paper/paper_cycles.cpp",
        ]
          .map((p) => readFileSync(p, "utf8"))
          .join("\n"),
      )
      .digest("hex"),
    material: {
      reference: "A4 printing paper requested by user",
      widthM: 0.21,
      heightM: 0.297,
      grammageKgM2: 0.08,
      grammageMeasured: false,
      thicknessM: 0.00015,
      thicknessMeasured: false,
      calibrated: false,
    },
    cases,
  };
  writeFileSync(
    `${folder}/results.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(r.stdout);
  console.log(`Raw benchmark data: ${folder}`);
}
