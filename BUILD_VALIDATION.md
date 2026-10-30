# 原型构建与验证记录

日期：2026-10-30。收尾基线：`ab7cc3a`（`update`）。本轮补完该提交尚未结束的 iOS 导出、原生运行与闭环验证，没有扩展关卡或平台。

## 本轮实际环境

- Apple Silicon（arm64），Xcode 27.1（27A9275），iOS Simulator SDK 27.1。
- Cocos Creator 3.8.8，官方 macOS 包，安装于 `/Applications/CocosCreator-3.8.8.app`。
- Node.js 24.17.0，Ruby 2.6.10，`xcodeproj` 1.27.0。
- 验收设备：iPhone 18 Pro / iOS 27.0 模拟器，UDID `C1E6F3E3-3328-4A5B-834F-2ABE143AACCA`。
- 发现已配对的 iPhone 14 Pro Max 及开发证书，但本轮没有执行真机签名、安装或性能验收。

原提交所记 Xcode 27.2、Node 22.23.1、iPhone 17 Pro / iOS 26.1 属于此前机器环境，不代表本机结果。

## 本轮发现并修复的启动阻塞

1. 旧 Cocos 宿主未声明 UIScene 生命周期，iOS 27 启动直接失败。`AppDelegate.mm` 与 `Info.plist` 改为单窗口场景，在窗口连接后启动引擎，转发场景的活跃、失活和前后台事件。
2. 接入场景后，引擎 `Screen::getDeviceOrientation()` 仍调用失效的 `statusBarOrientation`，返回 Unknown 后 `CC_ABORT`。项目 CMake 从锁定的 3.8.8 引擎生成局部兼容副本，改为查询窗口场景方向，并对连接期间的 Unknown 使用竖屏默认值；不修改安装的引擎。

Apple 的生命周期要求与迁移依据见 [Transitioning to the UIKit scene-based life cycle](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle)。上述两次启动失败均留有本地失败 xcresult，以下通过记录来自修复后的最终运行。

## 已通过

| 检查 | 实际结果 |
| --- | --- |
| `npm ci` | 依赖安装成功 |
| `npm test` | 5 项通过；覆盖面积守恒、中间帧有限坐标、候选差异、标准路径、收藏幂等、错误撤回与存档兜底 |
| `npm run build:ios` | Cocos 资源与原生工程导出成功 |
| `npm run typecheck` | 使用导出生成的 Cocos 类型定义，通过 |
| `npm run build:ios:simulator` | 最终完整导出、CMake 与 Xcode Debug arm64 模拟器构建成功，确认重新导出保留宿主兼容修复 |
| `SIMULATOR_UDID=C1E6F3E3-3328-4A5B-834F-2ABE143AACCA npm run test:ios` | 1 项完整 UI 流程通过，0 失败／0 跳过，9 张截图 |
| `plutil -lint native/engine/ios/Info.plist` | 通过 |
| `git diff --check` | 通过 |

UI 流程实际覆盖：初始状态、第一步折叠、进入后台再返回、挑战中途杀进程后恢复、耳朵与下角两类错误折法和撤回、四步通关、勋章／教程解锁、逐步播放与暂停／继续、播放到教程终点、上一步／下一步、手帐与取消收藏、再次杀进程后的完成／收藏状态恢复、重玩、小幅拖动回退、有效拖动提交、撤回、中英文切换。

检查了初始、错误、通关、暂停、教程终点、收藏及中文画面的截图，主要内容和操作区可见。这里没有将状态摘要检查等同于完整辅助功能验收。

## 可复现产物与证据

- 模拟器应用：`build/ios-simulator/proj/Debug-iphonesimulator/Origami-mobile.app`，本机 Debug 产物约 97 MB，不是发行包体。
- 最终通过的完整结果：`build/OrigamiSmoke-1793371595804.xcresult`，含测试轨迹与原始附件。
- [UI 测试结果摘要](docs/validation/2026-10-30/test-summary.json)。
- [初始画面](docs/validation/2026-10-30/01-studio.png)、[错误折法](docs/validation/2026-10-30/02-wrong-fold.png)、[通关](docs/validation/2026-10-30/03-completed.png)。
- [暂停教程](docs/validation/2026-10-30/04-paused-tutorial.png)、[教程终点](docs/validation/2026-10-30/05-tutorial-completed.png)、[收藏](docs/validation/2026-10-30/06-journal.png)。
- [重启恢复](docs/validation/2026-10-30/07-restored.png)、[中文画面](docs/validation/2026-10-30/08-chinese-studio.png)、[恢复待玩状态](docs/validation/2026-10-30/09-ready-to-play.png)。

`build/`、`temp/`、`library/`、`.cache/` 和 `artifacts/` 是忽略的本地产物；可保留的截图与结果摘要在 `docs/validation/2026-10-30/`。本地构建日志位于 `.cache/build-ios.log`、`.cache/build-simulator.log`、`.cache/test-ios.log`。

从干净仓库执行 README 中的 `npm ci` → `npm run build:ios:simulator` → `npm run typecheck` → 指定模拟器运行 `npm run test:ios`，可重建上述链路。测试只重置 `com.freezy7.origami` 的本地原型进度；不会重置整个模拟器。

## 验收边界与后续事项

- 第一阶段的单关 iOS **模拟器技术闭环已完成**；没有执行真机验收、Release／Archive、签名分发或 TestFlight。
- 真机触摸、较老系统、iPad／Duo 窗口适配、完整 VoiceOver、长时间操作、内存／热状态与帧率仍未验收。引擎编译仍有第三方弃用等警告，本轮未改造其依赖。
- 未将动画中断、系统触摸取消、存储失败等所有边界逐一做原生自动化验证；核心存档与错误恢复已有上述逻辑和交互覆盖。
- 真人实折、5–8 人玩法观察、2–3 人照教程复现尚未执行；不能由几何测试或截图推断教学与玩法价值已成立。
- 微信适配、扩充作品、商业化、账号同步等属于后续范围，本轮没有启动。
