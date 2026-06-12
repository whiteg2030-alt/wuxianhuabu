# Seedance 2.0 视频生成节点设计

日期:2026-06-12
状态:已与用户确认

## 目标

在 ai-canvas-agent 应用(`apps/examples/src/examples/use-cases/ai-canvas-agent/`,访问路径 `localhost:5420/ai-canvas-agent`)中新增「视频节点」,接入火山引擎方舟(Ark)的 Doubao Seedance 2.0 系列模型,支持四种生成模式:文生视频、首帧图生视频、首尾帧、多参考图(1–9 张)。

## 范围

- 前端:在 `AiCanvasAgentExample.tsx` 的轻量节点系统中新增 `video` 节点类型及交互。
- 后端:在 `apps/examples/vite.config.ts` 的 dev 中间件中新增视频生成相关端点。
- 配置:新增独立的 `ARK_API_KEY`(可选 `ARK_BASE_URL`),沿用现有 `.env.local` + 设置面板机制。
- 不改动现有图片生成流程、不引入新依赖、不动 tldraw 各 SDK 包。

## 方舟 API 规格(实现依据)

- 创建任务:`POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`
- 查询任务:`GET .../tasks/{id}`;取消:`DELETE .../tasks/{id}`
- 鉴权:`Authorization: Bearer $ARK_API_KEY`
- 模型 ID:`doubao-seedance-2-0-260128`(标准,最高 1080p)、`doubao-seedance-2-0-fast-260128`(快速,最高 720p)。
- 请求体:`model` + `content` 数组 + 顶层参数(推荐用顶层 JSON 参数而非 `--xx` 文本指令):
  - `content` 项:`{type:'text', text}`;`{type:'image_url', image_url:{url}, role:'first_frame'|'last_frame'|'reference_image'}`。`url` 支持 https 与 `data:image/...;base64,`(画布图片即为 data URL,可直接转发)。
  - 顶层参数:`resolution`(480p/720p/1080p)、`ratio`(16:9/4:3/1:1/3:4/9:16/21:9/adaptive,默认 adaptive)、`duration`(4–15 秒整数或 -1 自适应,默认 5)、`generate_audio`(默认 true)、`watermark`(默认 false)、`seed`(默认 -1)。
  - 2.0 不支持 `camera_fixed`、`frames`(帧率固定 24fps)。
- 输入限制:首帧 1 张;首尾帧 2 张;参考图 1–9 张;单图 <30MB、300–6000px、宽高比 0.4–2.5;整个请求体 <64MB。
- 创建响应:`{ id: "cgt-..." }`。
- 轮询响应:`status` ∈ `queued | running | succeeded | failed | cancelled | expired`;成功时 `content.video_url`(及可选 `content.last_frame_url`);失败时 `error: {code, message}`。
- 视频链接 24 小时过期;任务记录保留 7 天。

## 架构

```
画布(VideoNode) ──POST /api/generate-video──▶ vite 中间件 ──▶ 方舟创建任务
      │                                            │
      │◀── { taskId } ──────────────────────────────┘
      │
      ├──每 5 秒 GET /api/video-task?id= ──▶ 中间件代理方舟查询
      │       成功时:中间件下载 mp4 到 apps/examples/.cache/ai-videos/
      │◀── { status, videoUrl: '/api/video-file/<taskId>.mp4' } ──┘
      │
      └── <video> 播放 /api/video-file/<taskId>.mp4(支持 Range)
```

## 前端设计

### VideoNode 数据结构

加入 `CanvasNodeType` 联合类型:

```ts
interface VideoNode extends BaseNode {
	type: 'video'
	prompt: string
	mode: 'text' | 'first_frame' | 'first_last' | 'reference'
	sourceImageIds: string[] // 0–9 张,连线的图片节点 id,顺序即角色顺序
	model: string // 默认 doubao-seedance-2-0-260128
	resolution: '480p' | '720p' | '1080p'
	ratio: 'adaptive' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9'
	duration: number // 4–15,或 -1 表示自适应
	generateAudio: boolean // 默认 true
	status: 'idle' | 'submitting' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
	taskId: string | null
	videoUrl: string | null // 本地转存 URL
	errorMessage: string | null
	startedAt: number | null // 用于显示已等待时长
}
```

### 交互

- 工具栏新增「视频」快捷按钮(`handleQuickAction` 增加 `'video'`),按当前选中图片节点数定初始模式:
  - 0 张 → 文生视频;1 张 → 首帧;2 张 → 首尾帧(节点卡片上可切换为参考图);3–9 张 → 参考图。
- 创建节点时与来源图片节点建立现有 edges 连线;来源图片角色在视频节点卡片上标注(首帧/尾帧/参考图 N)。
- 节点卡片:模式标签、模型/分辨率/比例/时长下拉、音频开关、提示词输入、「生成视频」按钮。
  - 快速版模型选中时 1080p 选项禁用,若当前为 1080p 自动降为 720p。
  - 未配置 ARK key 时生成按钮置灰并提示去设置面板配置。
- 生成中:显示「排队中 / 生成中」+ 已等待秒数 + 取消按钮(调 DELETE 端点)。
- 成功:卡片内嵌 `<video controls>` 播放器。
- 失败 / expired / cancelled:显示中文状态与方舟 error.message,提供重试按钮(重新提交任务)。
- 轮询恢复:页面加载时扫描节点,凡 `taskId` 非空且 status 为非终态者恢复轮询。
- 提交前校验:估算 data URL 图片体积,单图 >30MB 或总和 >60MB 时阻止提交并提示。

## 后端设计(vite.config.ts 中间件)

| 端点 | 行为 |
| --- | --- |
| `POST /api/generate-video` | 入参 `{ model, prompt, images: [{url, role}], resolution, ratio, duration, generateAudio }`。校验 ARK key 存在、prompt 非空、图片数量与角色合法,组装方舟请求并转发;返回 `{ taskId }`;方舟同步错误透传 `{ code, message }` 与对应状态码。 |
| `GET /api/video-task?id=` | 代理方舟查询。`status === 'succeeded'` 时:若本地缓存不存在,先把 `content.video_url` 下载到 `apps/examples/.cache/ai-videos/<taskId>.mp4`,然后返回 `{ status, videoUrl: '/api/video-file/<taskId>.mp4' }`(幂等,文件已存在直接返回);下载失败时返回原始方舟 URL 并附 `warning` 字段。其余状态原样返回 `{ status, error? }`。 |
| `GET /api/video-file/<name>` | 从缓存目录流式返回视频,设置 `Content-Type: video/mp4`,支持基本 HTTP Range(进度条拖动);文件名做白名单校验(仅 `cgt-` 前缀 + `.mp4`),防止路径穿越。 |
| `DELETE /api/video-task?id=` | 代理方舟取消任务。 |

- 方舟 base URL 常量 `https://ark.cn-beijing.volces.com/api/v3`,可被 `ARK_BASE_URL` 覆盖。
- 模型白名单:`doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128`;后端拒绝白名单外模型。
- 缓存目录 `apps/examples/.cache/ai-videos/` 加入 `.gitignore`;不放 `public/`,避免 vite 监听触发整页刷新。

## API key 配置

- 新增 `ARK_API_KEY`(必需)与 `ARK_BASE_URL`(可选)环境变量,由 `saveAiSettings` 同款机制写入 `apps/examples/.env.local`。
- 新增独立端点 `POST /api/ark-key`(入参 `{ arkApiKey, arkBaseUrl? }`),不改动现有 `/api/ai-key`(它与图像网关校验逻辑强耦合);写 `.env.local` 复用现有的 env 文件读写辅助函数。
- `/api/ai-status` 响应增加 `arkConfigured: boolean`;设置面板新增「火山引擎 ARK API Key」输入框与状态显示。
- 与现有图像网关 key 相互独立。

## 错误处理

- 未配置 key:前端按钮置灰;后端兜底返回 401 风格错误信息。
- 方舟同步 4xx/5xx:透传 `{ code, message }`,节点显示。
- 任务 `failed`(如内容审核 `OutputVideoSensitiveContentDetected`):显示 error.message,可重试。
- 轮询网络错误:前端退避重试(5s → 10s → 20s,上限 30s),连续失败不改变节点状态,仅显示「连接中断,重试中」。
- 转存磁盘失败:返回方舟原始 URL + warning,前端提示「视频 24 小时后过期,请及时下载」。

## 验证

该 example 应用无单测体系,以手动验证为主:

1. `yarn dev` 启动,进入 `/ai-canvas-agent`,配置 ARK key。
2. 实跑四种模式各一次(文生视频 / 首帧 / 首尾帧 / 参考图),确认轮询、播放、刷新后恢复。
3. 错误路径:无 key 提交、非法模型、生成中取消、刷新后恢复轮询。
4. PowerShell 直接调用后端端点验证参数校验与错误透传。
5. repo 根目录 `yarn typecheck` 通过。
