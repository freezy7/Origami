# Origami

一款结合真实折纸推理、作品勋章与教程收藏的手帐风格游戏。

玩家在关键步骤选择折法、观察 3D 纸张的真实变化，并通过撤回尝试不同路径；通关后收藏作品和可用于现实折纸的完整教程。

## 项目状态

- 当前阶段：已实现一关 Cocos 可玩原型，第一阶段聚焦 iOS。
- 开发方式：独立开发。
- 技术：Cocos Creator 3.8.8 + TypeScript，内置 Node 测试。
- 目标平台：微信小游戏、iOS 原生；iOS 首轮发行面向海外 App Store。
- 首轮用户验证：英文 iOS TestFlight 为主，微信受控测试辅助。

## 文档

- [竞品、技术评估与中期路线](RESEARCH_AND_ROADMAP.md)
- [第一阶段：iOS 可玩原型计划](PROTOTYPE_PLAN.md)

## 仓库与本地目录

- 远端：<https://github.com/freezy7/Origami>
- 默认分支：`main`
- 正确的本地目录：`/Users/nikki/house/github/Origami`

```sh
git clone https://github.com/freezy7/Origami.git
cd Origami
```

```sh
npm ci
npm test
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

## 第一阶段目标

用一件经过实折验证的作品，跑通「选择折法 → 实际折叠 → 观察与撤回 → 通关 → 勋章／教程收藏 → 完整正确回放」。当前只在 iOS 验证，微信适配后移。

先验证折纸动作、玩法和 iOS 运行链路，再扩展主题、作品和平台。
