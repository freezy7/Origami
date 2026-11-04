# Web 白纸工作台

2026-11-04 更新：默认入口现为自由翻折几何操作验证，支持直接拖角到落点；原 C++ 薄片实验用 `?physics` 进入。本轮实际连续折飞机、恢复验证及物理边界见 [自由翻折记录](research/paper-simulator/FREE_FOLD_2026-11-03.md)。下文的 2026-11-02 物理实验验证为历史记录，不能套用到新模式。

日期：2026-11-02。按用户要求改为 Web 优先验证，先验证无预制折痕 A4 白纸的操作。产品方向继续以 `PAPER_SIMULATOR_SPEC.md` 为准。

## 实现范围

- Cocos Creator 3.8.8 负责三维画面，浏览器 DOM 提供工具与存档界面。Web 默认进入白纸工作台，`?legacy` 进入旧小狗样板。
- `native/paper/web/Bridge.cpp` 将同一份 `Sheet.cpp` 编译为 WebAssembly，无服务端计算，没有改写成预制折叠动画。
- 与 iOS 共用 `PaperHands`、`PaperLabView`；Web 另有鼠标、键盘和侧栏高度交互。画布按工作区尺寸计算，支持布局变化后重新适配。
- A4 为 210 × 297 mm；80 g/m²、0.15 mm 等为未校准研究参数，不代表用户已确认材料的全部物性。
- 白纸连续状态与固定点保存在当前站点的 `origami.web-paper.v2`，与 iOS 存档隔离。支持撤销、上一份本地备份、`.paper` 文件导入导出。恢复时释放临时抓持，保留固定点。

## 操作

1. 左键拖动纸张抓持。初始有小幅拾起辅助；拖动时滚轮调高度，按 `F` 再松鼠标可留住抓点。
2. `Shift`＋点击纸张固定另一侧；也可选“固定”后点击。固定标记可直接再拖。选中后可以用侧栏高度滑杆调整。
3. 右键、中键、`Alt`＋拖动或拖动空白处旋转视角。未选抓点时滚轮缩放；选中抓点后用画布角落的 `＋／−` 缩放。
4. 选“压痕”后按住纸张向桌面施压，拖动可抹压。它施加物理目标，不会直接生成指定折线。
5. `Ctrl/Cmd+Z` 撤销，`Delete` 松开选中抓点，`Ctrl/Cmd+S` 保存。新白纸可撤销恢复。

工具选择、视角和存档按钮不推进制作步骤；折纸过程没有预制步骤提交按钮。

## 本地运行

需 Node、Cocos Creator 3.8.8、C++ 编译器和 Emscripten 4.0.12。Cocos 可用 `COCOS_CREATOR` 指定路径；Emscripten 编译器默认 `.cache/emsdk/upstream/emscripten/em++`，可用 `EMXX` 指定绝对路径。

```sh
npm ci
# 首次安装 SDK；目录已存在时跳过 clone
git clone https://github.com/emscripten-core/emsdk.git .cache/emsdk
.cache/emsdk/emsdk install 4.0.12
.cache/emsdk/emsdk activate 4.0.12
source .cache/emsdk/emsdk_env.sh
npm run build:web
npm run test:web-kernel
npm run test:web-bundle
npm run typecheck
npm test
npm run preview:web
```

打开 `http://127.0.0.1:4173`。静态发布目录为 `build/web-mobile`，须包含 `kernel/paper-kernel.js` 和 `.wasm`；本地服务器为 WASM 设置正确 MIME。构建脚本先编译内核、导出 Cocos，再复制内核与工作台样式，不能只用 Cocos 原始导出目录代替。

SDK 安装脚本需 Python 3.10 或以上；本机使用 Python 3.13 安装。Python/SDK/构建产物均不进源码。浏览器不需要安装 SDK。

## 验证记录

- `npm run build:web` 完整构建通过；TypeScript 类型检查通过；现有 16 项源码回归通过。
- `npm run test:web-kernel`：28 条相同命令对照桌面 C++ 与 Node WebAssembly，拓扑与初始状态一致；连续求解轨迹最大坐标差为 **0.673 mm**。移植烟测使用明确的 1 mm 差异预算，通过不代表两端逐位一致，也不代表材料精度验收。FMA 关闭实验未消除差异，跨架构求解敏感性仍待研究，未修改物理内核来掩盖该边界。
- 内核 A4 面积／质量、初始无残余折痕、实际抬高、精确保存恢复、桌面快照导入 WASM、坏存档原状态保留、非法时间／操作拒绝及暂停释放临时抓持通过。
- 真实 Cocos 构建中发现 `Map.values()/keys()` 的展开被转换为 `[].concat(iterator)`，导致高度、留住、批量释放和纸张边界遍历失效。已在共享控制器、显示及平台调用处改用 `Array.from()`。`npm run test:web-bundle` 直接执行真实导出的控制器模块，覆盖高度、重复抓点、留住和收尾，不仅测试 TypeScript 源码。iOS 共用代码已修复，本轮未重新完成 iOS 构建／真机验收。
- 浏览器实际点击／拖动验证：纸角命中与标记对齐；两处固定；连续拖动纸角；高度从约 54 mm 调整至 65 mm 并达到目标；空白拖动旋转；新白纸清零后撤销恢复；`.paper` 导出再导入，保留 2 个固定点与 2 个残余铰链；刷新后恢复同一纸形。高度控制不会按固定的 400 ms 计时提前结束。
- 检查 1440 × 900 桌面、390 × 844 窄屏布局，画布与工作区矩形一致，窄屏无水平溢出。这是桌面浏览器尺寸适配验证，不是手机触控验收。

原始日志、内核对照摘要存入忽略的 `artifacts/paper-simulator/web/`，截图统一放在忽略的 `artifacts/screenshots/`。源码的历史验收记录不自动升级为本轮真机验收。

## 验收边界与后续

Web 迁移验证输入、画面与存档链路，不等于 G1 物理验收通过。当前仍为 108 节点固定网格实验：任意位置／方向的尖锐折线、反复折展和紧密叠层接触未完成通用验收；已有重复操作拉伸超限等问题继续按 `G1_VALIDATION.md` 跟进。尚未实现选纸、裁剪、打孔、零件组装及评分。

桌面鼠标验收不替代手机浏览器触控、传感器、折叠屏或真机性能验收。下一轮先根据用户在 Web 中实际抓持的反馈收敛交互，再推进折痕和接触精度。

## 发布位置

Sites 私有验证站点 ID：`appgprj_6ae89c3b99388191b5e22861b0158dc3`。隔离发布源位于忽略的 `.cache/web-delivery`，其中 `.openai/hosting.json` 绑定同一站点；后续复用此 ID，不能重复创建。原项目本轮按用户要求提交推送；隔离站点源码用于独立部署。

- 本地交付：<http://127.0.0.1:4173>，服务器保留运行，页面已实际操作验收。重启用 `npm run preview:web`。
- 私有站点：<https://paper-studio-origami-lab.lucky-chick-7534.chatgpt.site>。
- 发布提交：`b5a48ae656ec4338bcfb26fce9376fc06a5a2f9c`。
- 部署 ID：`appgdep_6aea840096388191b1b506f43d403425`，发布服务返回 `succeeded`。
- **线上访问尚未验收**：本次网络请求返回 Cloudflare HTTP 403，浏览器标题为 `Attention Required! | Cloudflare`；未绕过拦截或调整站点权限。发布成功不等于线上实操通过，当前可用交付以本地网页为准。
