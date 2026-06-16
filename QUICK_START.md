# 快速启动

这份说明给第一次拿到项目的人使用。按顺序做即可。

## 1. 准备环境

系统要求：

- Windows 10 / Windows 11
- 能访问网络，用于第一次下载 Node 和安装依赖
- Git 可选；如果已经下载 zip，也可以直接解压运行

第一次运行时，在项目根目录双击：

```text
setup-local-env.cmd
```

这个脚本会下载项目本地 Node 运行时，并安装依赖。首次安装时间取决于网络速度。

## 2. 启动画布

安装完成后，双击：

```text
open-ai-canvas.cmd
```

脚本会在后台启动本地服务，并打开：

```text
http://localhost:5420/ai-canvas-agent/full
```

如果浏览器没有自动打开，请手动复制上面的地址访问。

## 3. 配置自己的 API Key

进入画布后，点击顶部的接口状态按钮：

- 图片生成 / 图片编辑：填写 OpenAI-compatible 图片网关 Key。
- 视频生成：填写火山引擎 Ark API Key。

Key 会写入本机的 `apps/examples/.env.local`。这个文件是私有文件，已经被 Git 忽略，不要发给别人。

## 常见问题

### 端口被占用

运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-dev.ps1
```

然后重新双击 `open-ai-canvas.cmd`。

### 修改 API Key 后没有生效

重新启动服务：

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-dev.ps1
```

再双击 `open-ai-canvas.cmd`。

### 想看运行日志

查看项目根目录：

```text
dev-server.out.log
dev-server.err.log
```

### 想做本地检查

服务启动后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-ai-canvas-local.ps1
```

如果配置了真实图片接口，并且愿意触发一次真实接口调用，可以运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-ai-canvas-local.ps1 -LiveOpenAITest
```
