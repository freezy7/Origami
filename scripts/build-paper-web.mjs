import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const sdk = resolve(".cache/emsdk");
const compiler = process.env.EMXX ?? resolve(sdk, "upstream/emscripten/em++");
if (!existsSync(compiler))
  throw new Error(
    "Install Emscripten (see WEB_VALIDATION.md), or set EMXX to em++.",
  );
mkdirSync("build/web-kernel", { recursive: true });
const env = { ...process.env };
const sdkPython = resolve(sdk, "python/3.13.3_64bit/bin/python3");
if (!env.EMSDK_PYTHON && existsSync(sdkPython)) env.EMSDK_PYTHON = sdkPython;
const r = spawnSync(
  compiler,
  [
    "-std=c++17",
    "-O2",
    "-fexceptions",
    "native/paper/Sheet.cpp",
    "native/paper/web/Bridge.cpp",
    "--no-entry",
    "-sDISABLE_EXCEPTION_CATCHING=0",
    "-sMODULARIZE=1",
    "-sEXPORT_NAME=createPaperKernel",
    "-sENVIRONMENT=web,worker,node",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sMAXIMUM_MEMORY=268435456",
    '-sEXPORTED_FUNCTIONS=["_paper_call"]',
    '-sEXPORTED_RUNTIME_METHODS=["cwrap"]',
    "-o",
    "build/web-kernel/paper-kernel.js",
  ],
  {
    stdio: "inherit",
    env,
  },
);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(
  "Built shared C++ sheet kernel → build/web-kernel/paper-kernel.wasm",
);
