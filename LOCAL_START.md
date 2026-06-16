# 本地开发启动说明

这份文档给需要调试源码的人使用。只想运行画布请优先看 [QUICK_START.md](./QUICK_START.md)。

## 首次安装

在项目根目录运行：

```powershell
.\setup-local-env.cmd
```

脚本会把 Node 20 下载到 `.local-tools/`，并通过项目内 Yarn 安装依赖。

## 启动服务

后台启动并写入日志：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev-background.ps1
```

或者在当前终端窗口启动，方便查看实时日志：

```powershell
.\start-dev.cmd
```

打开：

```text
http://localhost:5420/
http://localhost:5420/ai-canvas-agent
http://localhost:5420/ai-canvas-agent/full
```

本地开发栈会使用这些端口：

```text
5420, 8786, 8990, 9339
```

日志文件：

```text
dev-server.out.log
dev-server.err.log
```

## 停止服务

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-dev.ps1
```

## 本地验证

服务启动后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-ai-canvas-local.ps1
```

这个检查会验证页面、登录流程、接口状态和缺少图片 Key 时的错误提示。

如果已经配置真实图片接口，并且愿意触发一次真实接口调用：

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-ai-canvas-local.ps1 -LiveOpenAITest
```

## API 配置

推荐在画布顶部接口配置面板填写 Key。应用会写入：

```text
apps/examples/.env.local
```

也可以手动复制模板：

```powershell
copy apps\examples\.env.example apps\examples\.env.local
```

然后编辑 `apps/examples/.env.local`。

常用变量：

```text
IMAGE_GATEWAY_BASE_URL=https://your-openai-compatible-host.example
IMAGE_API_KEY=
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_API_KEY=
```

注意：`.env.local` 是本机私有文件，不要提交或分享。
