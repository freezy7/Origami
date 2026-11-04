# Origami

以现实纸张为目标的三维纸艺制作模拟器：选纸、裁剪初始纸形、自由折叠与压痕、剪切打孔、制作零件，再组装并保存作品。成品参考、教程、挑战和评分属于后续体验层。

## 当前状态

2026-11-04 材料与试飞实现：新增直接拖翼、V 形合页、折轴平移／旋转、材料 Worker、纸层接触和释放回弹，以及固定场地试飞与记录比较。**完整纸飞机材料验收未通过**：8 步飞机在后续多层成形时停滞，成形偏差约 63 mm；试飞入口已增加形状检查并拦截该纸形。浏览器工具仍拒绝本地地址，本轮新页面尚无实操验收。见 [材料与试飞验收记录](research/paper-simulator/PHYSICS_AND_FLIGHT_2026-11-04.md)。

2026-11-04 几何交互验收：已在 Chrome 从新白纸实操完成 8 折纸飞机，验证双翼独立微调、早期步骤展开、全部展开、刷新恢复和撤销/重做；修复取景移动、同向折翼、选层、假折痕与输入应用等问题。该结果早于本轮材料实现，见 [几何验收记录及边界](research/paper-simulator/AIRPLANE_ACCEPTANCE_2026-11-04.md)。

2026-11-04：Web 默认新增用户自由翻折约束模式，支持直接拖纸角到落点、Shift 压线、连续折角、展开与选层。它是几何操作验证，不代表完整现实纸张物理。已在 Chrome 实际从白纸连续折出双翼纸飞机，并验证保存和刷新恢复，见 [本轮记录](research/paper-simulator/FREE_FOLD_2026-11-03.md)。原薄片物理实验通过 `?physics` 进入。

**已实现 A4 白纸物理研究原型，G1 尚未完整验收。** iOS 默认打开连续抓持、固定、弯曲／压痕和保存实验；旧小狗 Demo 可从界面或启动参数进入。实物材料未校准，固定网格的任意折痕精度和通用接触稳定性仍待验证。剪切、打孔和组装尚未实现。当前结果见 [G1 验证记录](G1_VALIDATION.md)。

现有技术为 Cocos Creator 3.8.8 + TypeScript + 独立 C++ 薄片内核。当前转为 Web 优先验证：通过 WebAssembly 复用同一套隐式候选内核，提供鼠标抓持、调高、固定与自由观察；iOS 实验保留。截图和视觉参考继续统一忽略，不提交。构建、操作和实际验收范围见 [Web 验证交付](WEB_VALIDATION.md)。

## 当前设计与下一步

1. [纸艺模拟器产品定义](PAPER_SIMULATOR_SPEC.md)：用户已明确的制作方向、自由操作与作品结构。
2. [技术研究与验证路线](PAPER_SIMULATOR_TECHNICAL_PLAN.md)：候选薄片模型、接触、折痕、动态拓扑、工程边界及一手来源。
3. [实验协议与验收表](research/paper-simulator/EXPERIMENTS.md)：从一张白纸到加工、组装的门槛与本轮部分执行状态。
4. [项目概况与继续开发入口](PROJECT_STATUS.md)：已有能力与新目标之间的差距。

近期继续验证一张无预设折痕的 A4 白纸：抓持、弯曲、压痕、展开、任意位置／方向新折线、基本纸层接触及连续状态保存。通过后推进加工和多件组装；目前不继续扩关或开发评分。

## 历史样板与运行方法

Web 默认进入白纸工作台；`?legacy` 保留旧样板回归入口。旧方向与验证记录保留供查阅，不再作为模拟器的产品规格：

- [旧竞品调研及游戏路线](RESEARCH_AND_ROADMAP.md)
- [旧单关原型计划](PROTOTYPE_PLAN.md)
- [旧游戏体验评估](PRODUCT_REVIEW.md)
- [已执行的单关体验升级及边界](NEXT_ROUND_VALIDATION.md)
- [当前 A4 白纸实验、操作与验收](G1_VALIDATION.md)
- [第二轮抓持、固定与高度控制改进](research/paper-simulator/CONTROLS_ROUND_2.md)

## 仓库与本地目录

- 远端：<https://github.com/freezy7/Origami>
- 默认分支：`main`
- 当前工作目录：`/Users/protonclaw/Projects/Origami`；构建脚本从仓库根目录运行，不依赖特定用户名。

```sh
git clone https://github.com/freezy7/Origami.git
cd Origami
```

```sh
npm ci
# 首次需安装并激活 Emscripten，详见 WEB_VALIDATION.md
npm run build:web
# 仅验证自由折叠时，无需 Emscripten：
npm run build:fold-web
npm run preview:web
# 浏览器打开 http://127.0.0.1:4173
npm run test:web-kernel
npm test
npm run test:paper
# 完整纸飞机材料门槛；目前会因多层成形偏差返回失败，禁止自动转入试飞
npm run test:material-folding
# 先运行上一命令生成输入，再用实际 WebAssembly 内核复验
npm run test:material-wasm
# 运行桌面数值及循环实验，参数未做实物校准
npm run bench:paper -- --cycles
# 导出 Cocos 资源，生成并编译 Apple Silicon 模拟器工程
npm run build:ios:simulator
# 首次导出后生成 Cocos 类型定义，之后可运行
npm run typecheck
# 启动一个 iPhone 模拟器后执行；会重置本原型的本地测试进度
npm run test:ios
```

默认编辑器位置：`/Applications/CocosCreator-3.8.8.app/Contents/MacOS/CocosCreator`；可通过 `COCOS_CREATOR` 覆盖。需 Xcode、Node 和 Ruby `xcodeproj` gem。模拟器脚本使用编辑器自带的 `ios-m1-simulator` 库，不修改安装的引擎；真机工程仍由 `npm run build:ios` 导出。

模拟器应用：`build/ios-simulator/proj/Debug-iphonesimulator/Origami-mobile.app`。使用 `xcrun simctl install <UDID> <app路径>` 安装，再用 `xcrun simctl launch <UDID> com.freezy7.origami` 打开。多个模拟器同时启动时，运行测试需设置 `SIMULATOR_UDID`。

用 Cocos 编辑器打开仓库，进入 `assets/scenes/Origami.scene` 可预览和编辑。`npm run build:preview` 提供辅助网页构建。

验证范围和已知限制见 [BUILD_VALIDATION.md](BUILD_VALIDATION.md)，首件作品数据见 [CONTENT_DOG_FACE.md](CONTENT_DOG_FACE.md)。

截图与视觉参考统一放在 `artifacts/screenshots/`，由 Git 忽略，不提交。`npm run test:ios` 会按运行编号自动导出原始测试截图（包括产生结果包的失败运行）；测试报告仍在忽略的 `build/` 下。应用图标、启动图等运行资源继续跟踪。
