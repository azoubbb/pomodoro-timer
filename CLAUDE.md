# CLAUDE.md — Pomodoro Timer (Electron)

## 项目概述

轻量级系统托盘番茄钟应用，基于 Electron 构建。纯原生开发，无前端框架、无打包工具、无 TypeScript。

核心特性：三阶段番茄循环（专注/短休/长休）、防漂移计时器（休眠恢复不丢时间）、系统托盘常驻、全局热键、任务管理、原生通知、状态持久化 + 崩溃恢复。

## 技术栈

- **Electron** ^31.0.0 — 框架
- **electron-store** ^8.2.0 — 唯一运行时依赖，JSON 持久化
- **electron-builder** ^24.13.3 — 打包分发
- **Vanilla JS** — 无 React/Vue/Svelte，无 Webpack/Vite
- Renderer 层使用 ES Modules（`type="module"`），Main/Preload 层使用 CommonJS

## 架构

三层 Electron 架构，严格隔离：

```
Main Process (Node/CommonJS)
  ├── main.js          入口，BrowserWindow + 生命周期
  ├── timer-engine.js  核心状态机，防漂移计时
  ├── store.js         electron-store 封装（settings/tasks/state 三个文件）
  ├── tray.js          系统托盘图标 + 右键菜单
  ├── notifications.js 原生 OS 通知
  ├── shortcuts.js     全局热键 (Ctrl+Shift+P/S/R)
  ├── ipc-handlers.js  所有 ipcMain.handle 注册
  └── paths.js         asar 安全路径解析

Preload Bridge (隔离层)
  └── preload.js       contextBridge 暴露 window.api，sandbox: true

Renderer Process (ES Modules)
  ├── index.html       单页 UI，中文界面
  ├── js/
  │   ├── app.js       入口，组装各模块
  │   ├── timer-view.js SVG 圆环倒计时
  │   ├── settings.js  设置面板
  │   ├── sound.js     提示音播放
  │   └── task-list.js 任务 CRUD + 激活任务追踪
  └── styles/
      ├── base.css     重置 + 布局
      ├── theme.css    CSS 自定义属性 / 设计 token
      └── timer.css    圆环、任务列表、设置面板
```

安全模型：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、CSP `default-src 'self'`。Renderer 不接触任何 Node API。

## 开发命令

```bash
npm install           # 安装依赖
npm run gen-assets    # 生成图标 + 提示音（首次运行必须）
npm start             # 启动应用
npm run dev           # 启动（带 Electron 日志）
npm test              # 运行 smoke-test（待添加到 package.json）
node scripts/smoke-test.js  # 等价于 npm test
```

打包命令：
```bash
npm run dist:win      # Windows NSIS 安装包
npm run dist:mac      # macOS DMG（需要 .icns 图标）
npm run dist          # 当前平台安装包
npm run pack          # 仅打包目录（不生成安装程序）
```

产物输出到 `release/` 目录。

## 数据存储

三个独立 JSON 文件，位于 Electron `userData` 目录：

| 文件 | 内容 |
|------|------|
| `settings.json` | 时长、长休间隔、声音开关、自动启动设置 |
| `tasks.json` | 任务列表（id, title, completed, pomodorosSpent, createdAt, completedAt） |
| `state.json` | 计时器运行状态（崩溃恢复用：currentPhase, endsAt, isRunning 等） |

## 关键设计决策

1. **防漂移计时**：`timer-engine.js` 基于绝对时间戳 `endsAt` 计算剩余时间，而非 `setInterval` 递减。系统休眠/睡眠后恢复不会丢时间。

2. **崩溃恢复**：每次 start/pause/resume/阶段切换都持久化 state.json。重启时 engine 自动检测过期阶段并安全推进。

3. **无框架**：纯 vanilla JS，保持极简。不引入 React/Vue。如需 UI 改动，直接操作 DOM。

4. **单实例锁**：第二次启动会聚焦已有窗口，不会打开新实例。

5. **关闭即隐藏**：窗口关闭按钮只是隐藏到托盘，不退出应用。

## 资产生成

`scripts/` 目录包含零外部依赖的纯 Node 脚本：

- `gen-icons.js` — 纯手写 PNG 生成器（含 CRC32、抗锯齿绘图），输出 256x256 应用图标 + 32x32 托盘图标（running/paused 两套）
- `gen-sound.js` — 纯手写 WAV 生成器，双音上升正弦波（E5→A5），0.45 秒，指数衰减
- `smoke-test.js` — 计时器引擎测试，10 个用例，使用 `node:assert/strict` + 内存 mock store

## 测试

当前只有一个手写 smoke-test，无正式测试框架：

- 运行方式：`npm test`（或 `node scripts/smoke-test.js`）
- 覆盖 timer-engine 的核心逻辑（start/pause/resume/skip/reset/长休触发/任务计数/崩溃恢复等）
- 使用内存 mock 绕过 electron-store
- **无 renderer 测试、无集成测试、无 E2E 测试**

## 已知问题 / 待办

- [ ] macOS 缺少 `build/icon.icns`，`gen-icons.js` 不生成此格式
- [ ] 无正式测试框架（建议引入 Vitest 或 Jest）
- [x] CI/CD — GitHub Actions（ci.yml 跑测试，release.yml 打包发布）
- [ ] UI 文本硬编码中文，无 i18n 支持
- [ ] 无自动更新机制（可引入 electron-updater）
- [ ] `appId` 仍为 `com.example.pomodoro`，发布前应修改
- [ ] 无代码签名

## 代码规范

- Main/Preload 层：CommonJS（`require`/`module.exports`）
- Renderer 层：ES Modules（`import`/`export`）
- 不使用 TypeScript
- 不使用 CSS 预处理器（纯 CSS + 自定义属性）
- 命名：文件 kebab-case，变量/函数 camelCase
- 中文注释和 UI 文本
