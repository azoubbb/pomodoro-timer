# 番茄钟

轻量级的系统托盘常驻番茄钟应用,基于 Electron 构建。

## 功能特性

- 专注 / 短休息 / 长休息 三阶段循环,时长可配置
- 漂移自由计时(系统休眠唤醒后依然精准)
- 系统托盘:运行/暂停图标、动态提示文本、右键菜单
- 全局快捷键:`Ctrl+Shift+P`(显示/隐藏)、`Ctrl+Shift+S`(开始/暂停)、`Ctrl+Shift+R`(重置)
- 任务清单,每个任务独立统计完成的番茄数;勾选完成时自动跳到下一个未完成任务
- 原生系统通知
- 设置、任务、计时状态全部持久化,意外崩溃后能恢复计时

## 开发

```bash
npm install
npm run gen-icons   # 首次运行:用纯 Node 生成 PNG 图标资源
npm start
```

## 打包

```bash
npm run dist:win    # Windows NSIS 安装器
npm run dist:mac    # macOS DMG
npm run dist        # 当前平台
```

产物输出到 `release/` 目录。

## 项目结构

- `src/main/` — Electron 主进程(Node,无 DOM)
- `src/preload/` — contextBridge 桥接层
- `src/renderer/` — 用户界面(原生 HTML/CSS/JS,ES Modules)

## 键盘快捷键

| 快捷键 | 动作 |
|---|---|
| `Ctrl+Shift+P` | 显示 / 隐藏主窗口 |
| `Ctrl+Shift+S` | 开始 / 暂停计时 |
| `Ctrl+Shift+R` | 重置当前阶段 |

## 数据存储

所有持久化数据都放在 Electron 的 `userData` 目录下:

- `settings.json` — 阶段时长、通知音效、自动开始开关
- `tasks.json` — 任务列表
- `state.json` — 当前阶段 / `endsAt`(用于崩溃恢复)
