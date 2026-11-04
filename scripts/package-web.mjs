import {
  cpSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
const out = "build/web-mobile";
const freeFoldOnly = process.argv.indexOf("--free-fold-only") !== -1;
const settingsPath = `${out}/src/settings.json`;
const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
settings.screen.exactFitScreen = false;
writeFileSync(settingsPath, JSON.stringify(settings));
const appPath = `${out}/application.js`;
writeFileSync(
  appPath,
  readFileSync(appPath, "utf8").replace(
    "this.showFPS = true",
    "this.showFPS = false",
  ),
);
if (
  !existsSync(`${out}/index.html`) ||
  (!freeFoldOnly && !existsSync("build/web-kernel/paper-kernel.wasm"))
)
  throw new Error("Build Cocos Web and the WebAssembly kernel first.");
if (!freeFoldOnly) {
  mkdirSync(`${out}/kernel`, { recursive: true });
  cpSync("build/web-kernel/paper-kernel.js", `${out}/kernel/paper-kernel.js`);
  cpSync("build/web-kernel/paper-kernel.wasm", `${out}/kernel/paper-kernel.wasm`);
  cpSync("web/paper-worker.js", `${out}/kernel/paper-worker.js`);
}
cpSync("web/workbench.css", `${out}/workbench.css`);
let html = readFileSync(`${out}/index.html`, "utf8")
  .replace(/<title>[\s\S]*?<\/title>/, "<title>纸间 · 白纸实验室</title>")
  .replace('cc_exact_fit_screen="true"', 'cc_exact_fit_screen="false"');
if (!html.includes("workbench.css"))
  html = html.replace(
    "</head>",
    '<link rel="stylesheet" href="workbench.css">\n<meta name="description" content="自由抓持、折叠与压痕的三维白纸实验工作台。">\n</head>',
  );
if (!html.includes('id="paper-boot"'))
  html = html.replace(
    "<body>",
    '<body>\n<div id="paper-boot" role="status"><strong>正在铺好白纸…</strong><span>正在载入三维工作台，首次打开可能需要一些时间。</span></div>',
  );
html = html.replace(
  "console.error(err);",
  'console.error(err); var boot=document.getElementById("paper-boot"); if(boot)boot.textContent="工作台打开失败，请刷新重试。";',
);
if (freeFoldOnly) html = html.replace("</head>", '<script>window.__ORIGAMI_FREE_FOLD_ONLY__=true;</script>\n</head>');
writeFileSync(`${out}/index.html`, html);
console.log("Web workbench ready: build/web-mobile");
