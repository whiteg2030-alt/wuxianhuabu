# 无限画布 AI 工作台

这是一个基于 tldraw SDK 改造的本地 AI 画布应用，面向图片生成、图片编辑、首帧图生视频、节点连线工作流和灵感草稿整理。项目可以在本地 Windows 电脑上直接运行，API Key 只保存在本机配置文件里，不会提交到仓库。

## 适合谁使用

- 想把图片生成、图片编辑、视频生成提示词放在同一个无限画布里整理的人。
- 想把工作流节点、参考图、提示词、结果图和视频生成任务串起来的人。
- 想二次开发 tldraw AI 画布原型的开发者。

## 快速开始

推荐先看 [QUICK_START.md](./QUICK_START.md)。

Windows 用户最短路径：

1. 第一次运行：双击 `setup-local-env.cmd`
2. 启动画布：双击 `open-ai-canvas.cmd`
3. 浏览器打开：`http://localhost:5420/ai-canvas-agent/full`

如果浏览器没有自动打开，手动访问上面的地址即可。

## API 配置

应用启动后，点击画布顶部的接口状态按钮填写自己的 API Key。

- 图片生成 / 图片编辑：填写 OpenAI-compatible 图片网关 Key。
- 视频生成：填写火山引擎 Ark API Key，用于 Seedance 视频生成。

也可以复制环境变量模板后手动配置：

```powershell
copy apps\examples\.env.example apps\examples\.env.local
```

然后编辑 `apps/examples/.env.local`。不要把 `.env.local` 提交到 Git，也不要发给别人。

## 常用地址

- 完整 AI 画布：`http://localhost:5420/ai-canvas-agent/full`
- 示例应用首页：`http://localhost:5420/`
- 基础 AI 画布路由：`http://localhost:5420/ai-canvas-agent`

## 常用脚本

| 文件 | 用途 |
| --- | --- |
| `setup-local-env.cmd` | 下载本地 Node 运行时并安装依赖，第一次使用时运行 |
| `open-ai-canvas.cmd` | 后台启动开发服务并打开完整 AI 画布 |
| `start-dev.cmd` | 在当前窗口启动开发服务，适合开发调试 |
| `start-dev-background.ps1` | 后台启动服务，写入日志和 pid |
| `stop-dev.ps1` | 停止本地开发服务 |
| `verify-ai-canvas-local.ps1` | 本地冒烟检查，确认页面、登录和接口状态可用 |

## 分享给别人

如果别人是开发者，直接分享这个仓库地址即可。对方 clone 后按 [QUICK_START.md](./QUICK_START.md) 启动。

如果要发给非开发者，可以使用便携包方式，详细规则见 [docs/SHARING.md](./docs/SHARING.md)。

分享前请确认不要包含这些本地私有文件：

- `apps/examples/.env.local`
- `apps/examples/.local-auth/`
- `ai-canvas-share/data/`
- `dev-server.*.log`
- `node_modules/`
- `apps/examples/dist/`

这些路径已经在 `.gitignore` 中排除。

## 开发命令

```powershell
corepack yarn oxfmt --check --no-error-on-unmatched-pattern apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx
corepack yarn oxlint apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx
corepack yarn workspace examples.tldraw.com build
```

## 项目来源与许可

本项目基于 tldraw 开源仓库改造。tldraw SDK 的生产使用可能需要遵守 tldraw 官方许可要求，详见 [LICENSE.md](./LICENSE.md) 和 [TRADEMARKS.md](./TRADEMARKS.md)。
