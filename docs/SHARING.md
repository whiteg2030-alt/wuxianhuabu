# 分享与隐私检查

这份文档用于把项目分享给别人之前做最后确认。

## 推荐分享方式

### 方式一：分享 GitHub 仓库

适合开发者或需要二次修改的人。

对方拿到仓库后：

1. 下载或 clone 项目。
2. 双击 `setup-local-env.cmd`。
3. 双击 `open-ai-canvas.cmd`。
4. 打开 `http://localhost:5420/ai-canvas-agent/full`。
5. 在画布顶部接口配置里填写自己的 API Key。

### 方式二：分享便携包

适合只想试用、不想接触源码的人。

如果你已经生成了 `ai-canvas-share.zip`：

1. 把 `ai-canvas-share.zip` 发给对方。
2. 对方解压后双击 `ai-canvas-share/start.cmd`。
3. 使用时保持本地服务窗口打开。
4. 对方填写的 API Key 只应留在自己的电脑上。

不要把已经输入过私有 API Key 的 `data/` 目录再打包发给别人。

## 不要分享的文件

这些文件可能包含本地密钥、登录状态、缓存或机器信息：

| 路径 | 原因 |
| --- | --- |
| `apps/examples/.env.local` | 本机 API Key |
| `apps/examples/.local-auth/` | 本地登录和会话数据 |
| `ai-canvas-share/data/` | 便携包运行后生成的本地数据 |
| `dev-server.out.log` / `dev-server.err.log` | 本地运行日志 |
| `dev-server.pid` | 本地进程信息 |
| `node_modules/` | 本地依赖目录，体积大且不适合分享 |
| `apps/examples/dist/` | 本地构建产物 |
| `.local-tools/` | 本地 Node 运行时 |

以上路径已经通过 `.gitignore` 排除。分享前仍建议做一次检查。

## 分享前检查命令

查看 Git 是否干净：

```powershell
git status -sb
```

确认私有文件被忽略：

```powershell
git check-ignore -v apps/examples/.env.local apps/examples/.local-auth ai-canvas-share ai-canvas-share.zip
```

扫描常见密钥格式：

```powershell
rg -n -i "sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]+|api[_-]?key|secret|token|password" README.md QUICK_START.md docs/SHARING.md .env.example apps/examples/.env.example
```

如果扫描结果只出现“API Key”这类说明文字或空模板变量，是正常的；不要提交真实密钥。

## 环境变量模板

公开仓库只保留模板文件：

- `.env.example`
- `apps/examples/.env.example`

真实配置只写在：

- `apps/examples/.env.local`

## 给接收者的一句话

不要使用别人发来的 API Key。请进入画布后填写你自己的接口 Key，并自行承担接口调用费用。
