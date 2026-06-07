# 🍅 桌面番茄钟

一个使用 Electron 构建的桌面番茄钟应用，帮你专注工作、合理休息。

## ✨ 功能

- ⏱ **标准番茄循环**：默认 25 分钟工作 + 5 分钟短休息，4 轮后 15 分钟长休息
- ⚙ **自定义时长**：工作时长、短/长休息时长、轮次数全部可调
- 🔔 **声音 + 系统通知**：阶段切换时蜂鸣 + 桌面通知
- 📊 **任务记录与统计**：自动记录每个完成的番茄，查看今日 / 本周 / 累计
- ⌨ **快捷键**：空格 开始/暂停，R 重置
- 💾 **数据持久化**：所有记录与设置自动保存到本地

## 🚀 运行

```bash
cd pomodoro-app
npm install
npm start
```

> **⚠ 在 VS Code 内置终端启动？** VS Code 会注入 `ELECTRON_RUN_AS_NODE=1`，
> 这会让 `electron .` 退化为纯 Node 模式（你会看到 `app is undefined`）。
> 本项目的 `npm start` 已用 `cross-env` 自动清掉这个变量，可直接使用。
> 也可以手动运行 `npm run start:cmd`（cmd/PowerShell 内置写法）。

## 📦 打包为 exe（Windows portable）

```bash
npm run dist
```

打包好的 exe 会输出到 `release/` 目录。

## 📁 项目结构

```
pomodoro-app/
├── main.js        # Electron 主进程
├── preload.js     # 预加载脚本（IPC 桥接）
├── renderer.js    # 渲染进程（业务逻辑）
├── index.html     # 主界面
├── styles.css     # 样式
└── package.json
```

## 🛠 数据存放位置

设置和番茄记录保存在系统的 userData 目录：
- Windows: `%APPDATA%/pomodoro-app/pomodoro-data.json`
