# Origami

一款结合真实折纸推理、作品勋章与教程收藏的手帐风格游戏。

玩家在关键步骤选择折法、观察 3D 纸张的真实变化，并通过撤回尝试不同路径；通关后收藏作品和可用于现实折纸的完整教程。

## 项目状态

- 当前阶段：调研完成初稿，准备可玩原型；尚未初始化 Cocos 游戏工程。
- 开发方式：独立开发。
- 候选技术：Cocos Creator 3.8 LTS 系列 + TypeScript；具体补丁版本待双端样例验证后锁定。
- 目标平台：微信小游戏、iOS 原生；iOS 首轮发行面向海外 App Store。
- 首轮用户验证：英文 iOS TestFlight 为主，微信受控测试辅助。

## 文档

- [竞品、技术评估与中期路线](RESEARCH_AND_ROADMAP.md)
- [第一阶段：可玩原型与双端验证计划](PROTOTYPE_PLAN.md)

## 仓库与本地目录

- 远端：<https://github.com/freezy7/Origami>
- 默认分支：`main`
- 正确的本地目录：`/Users/nikki/house/github/Origami`

```sh
git clone https://github.com/freezy7/Origami.git
cd Origami
```

当前只有 Markdown 文档，无需安装依赖。Cocos 项目初始化后再加入明确的启动、测试及构建命令，不提供尚不可执行的脚本。

## 第一阶段目标

用一件经过实折验证的作品，跑通「选择折法 → 实际折叠 → 观察与撤回 → 通关 → 勋章／教程收藏 → 完整正确回放」。同一份内容在 Android 微信、iPhone 微信与 iOS 原生真机验证。

先验证折纸动作、玩法和发布链路，再扩展主题与作品数量。
