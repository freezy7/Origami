# 项目概况与继续开发入口

更新：2026-11-04。用户已将产品主线明确为真实纸艺模拟器。当前定义以 [PAPER_SIMULATOR_SPEC.md](PAPER_SIMULATOR_SPEC.md) 为准，技术路线见 [PAPER_SIMULATOR_TECHNICAL_PLAN.md](PAPER_SIMULATOR_TECHNICAL_PLAN.md)，待执行实验见 [EXPERIMENTS.md](research/paper-simulator/EXPERIMENTS.md)。

## 产品目标与实际实现

目标是选纸、裁剪、自由操作白纸、保留折痕、剪切／打孔、制作独立零件并组装成作品。用户可以没有目标成品地自由制作；教程、挑战和评分后置。

**当前 iOS 默认进入 A4 白纸物理研究原型，G1 尚未完整验收。** 独立 C++ 内核提供连续抓持、固定、弯曲、压痕、接触和半折存档。旧 Paper Puppy 四步 Demo 从界面或 `--origami-legacy` 参数进入，仍按原 `valid/step` 运行并保留原存档。Web 默认增加几何自由翻折操作验证，原 C++／WebAssembly 薄片实验由 `?physics` 进入；旧 Demo 由 `?legacy` 进入。Web 构建、操作与验收见 [WEB_VALIDATION.md](WEB_VALIDATION.md)。

已有薄片动力学和塑性、顶点—面／边—边接触的近似实现，但任意折痕的网格精度、通用接触稳定性、真实材料校准未达验收；自由裁剪／打孔、动态拓扑与组装未实现。旧 Demo 的纸层偏移只用于显示，新实验使用内核三维位置与接触厚度。

本轮实际实现与证据见 [G1_VALIDATION.md](G1_VALIDATION.md)。已对照 XPBD 与隐式候选，隐式候选暂用于实验；两种候选都不能因此视为最终生产内核。

用户实测反馈白纸难以操作；[可操作性复核](research/paper-simulator/USABILITY_REVIEW_2026-11-01.md) 已确认控制问题及自动化覆盖缺口。第二轮已修正抓持、固定与压纸控制，新增双点抓持与明确高度条，见 [交互改进记录](research/paper-simulator/CONTROLS_ROUND_2.md)；仍需真人复评，交互尚未验收。

## 已有验证边界

2026-11-04 TypeScript 共 22 项测试通过；第二轮白纸原生 3 项复测通过，旧样板回归通过，证据见交互改进记录。新内核已有 325 项数值／状态断言及 ASan／UBSan 检查，桌面基准覆盖抓持、压痕、展开、20 次往返及存档。iPhone 18 Pro 模拟器的旧样板与新白纸自动交互已通过。新真机包构建及签名校验通过，安装仍被 CoreDevice 4016 连接状态阻止。没有本轮真机手感、热状态或持续性能验收。

本轮结果以 [G1_VALIDATION.md](G1_VALIDATION.md) 及其中的 JSON 摘要为准。历史样板结果见 [NEXT_ROUND_VALIDATION.md](NEXT_ROUND_VALIDATION.md)，旧启动修复见 [BUILD_VALIDATION.md](BUILD_VALIDATION.md)。数值及模拟器通过不代替实物或真机验收。

## 代码入口

| 路径 | 职责与修改注意事项 |
| --- | --- |
| `assets/scenes/Origami.scene` | 唯一场景，挂载 `OrigamiGame`；iOS 默认路由至白纸实验，旧样板保留 |
| `native/paper/` | 独立 C++ 薄片能量、双求解候选、塑性、接触、审计及 v2 状态 |
| `assets/scripts/PaperLab.ts`、`PaperLabView.ts` | 白纸工作区、抓持／固定／压力工具、三维观察、恢复与诊断 |
| `native/engine/ios/OrigamiPaperLab.mm` | 内核原生桥接及旧样板启动参数 |
| `scripts/test-paper.mjs`、`tests/paper/` | 编译和运行内核断言、基准、循环试验；原始大数据进忽略目录 |
| `assets/scripts/core/PaperModel.ts` | 无引擎依赖；裁分面片、沿轴旋转、纸层、四步动作、错误候选、Puzzle 状态与存档版本 |
| `assets/scripts/OrigamiGame.ts` | 工作区、挑战／教程／收藏 UI、手势仲裁、连续预览与提交、双语与本地存储 |
| `assets/scripts/PaperView.ts` | 动态双色网格、纹理坐标、程序纸纹、方向性明暗、自由观察／缩放、纸角投影 |
| `assets/scripts/core/Interaction.ts` | 无引擎依赖的命中／拖折数学与体感归零、平滑、失效取消 |
| `assets/scripts/DeviceInput.ts`、`native/engine/ios/OrigamiDeviceInput.mm` | 真实能力探测、Core Motion、可用系统上的 UIKit 铰链输入、声音／触觉 |
| `native/engine/ios/` | Cocos 原生宿主；`AppDelegate.mm` 接入单窗口 UIScene 生命周期，并提供 UI 测试读取的状态摘要，不是完整 VoiceOver 控件 |
| `native/engine/ios/CMakeLists.txt` | 原生工程、Apple Silicon 模拟器库选择、新 Clang 的第三方依赖诊断；构建时生成局部 Screen 兼容副本，通过窗口场景读取方向；为真机重整旧 WebP 库对齐，不修改安装的引擎 |
| `build-ios.json`、`scripts/` | Cocos 导出、模拟器构建、生成 UI 测试工程与执行；均从仓库根目录运行 |
| `tests/paper.test.ts`、`tests/interaction.test.ts` | 几何面积／有限坐标、候选差异、正确路径、错误撤回、奖励与存档 |
| `tests/ios/OrigamiSmokeTests.swift` | 原生交互与截图；测试会重置本原型的本地数据 |

旧作品数据仍硬编码在旧 Core。白纸内核不消费这些动作，初始残余角为零；它是固定网格的实验近似，不能视为已完成通用仿真。新白纸已接入 iOS 触屏和 Web 鼠标操作；旧倾斜／铰链实验尚未映射到新内核。

## 继续工作的顺序

已完成 [自由翻折记录](research/paper-simulator/FREE_FOLD_2026-11-03.md) 中的实际拖角、连续折飞机与刷新恢复验证；下一步由用户复评自然程度，并继续研究选层、柔性和接触。几何层测试通过不代表原 G1 物理门槛通过。

1. 优先在 Web 验证抓持、固定与三维观察的实际操作，再继续 G1：以用户指定的 A4 打印纸完成实际材料记录与对照，研究固定网格的方向／位置偏差和局部细化。
2. 修复高强度重复操作的拉伸峰值及接触迭代上限问题，完成新手的深度、抓持、固定与压痕观察。
3. 连接真机后测实际响应和持续性能。G1 门槛通过后再启动加工／重网格 G2 和多件组装 G3，成品与评分继续后置。

保留旧 Demo 与存档。新白纸保存完整连续状态到 `origami.paper-lab.v2`，不按制作步骤回退。截图继续放在统一忽略目录。

## 文档优先级

- 当前产品要求：`PAPER_SIMULATOR_SPEC.md`。
- 当前工程提案与待执行验收：`PAPER_SIMULATOR_TECHNICAL_PLAN.md`、`research/paper-simulator/EXPERIMENTS.md`。
- 当前代码事实：本页与源码；运行证据按对应验证记录的日期和范围读取。
- 历史材料：`RESEARCH_AND_ROADMAP.md`、`PROTOTYPE_PLAN.md`、`PRODUCT_REVIEW.md`、`CONTENT_DOG_FACE.md`，其中旧的“预设折线／正确步骤／先扩三关”等方案不再约束新产品。

截图继续统一放在忽略的 `artifacts/screenshots/`。本轮按用户要求整理后提交并推送至原项目 main。旧小狗存档键保留，新实验使用独立状态格式。
