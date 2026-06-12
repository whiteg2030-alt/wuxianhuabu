# Seedance 2.0 视频生成节点实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ai-canvas-agent 画布应用中新增「视频节点」,通过火山引擎方舟(Ark)Seedance 2.0 模型生成视频,支持文生视频、首帧、首尾帧、参考图四种模式。

**Architecture:** 前端在 `AiCanvasAgentExample.tsx` 的轻量节点系统中新增 `video` 节点类型(创建 → 提交任务 → 轮询 → 内嵌播放);后端在 `apps/examples/vite.config.ts` 的 dev 中间件中新增 4 个端点,代理方舟异步任务 API 并把成品视频转存到本地缓存目录。独立 `ARK_API_KEY` 配置,沿用 `.env.local` 机制。

**Tech Stack:** React 单文件组件(无状态库)、Vite dev 中间件(Node http)、火山方舟 `contents/generations/tasks` 异步任务 API。

**设计依据:** `docs/superpowers/specs/2026-06-12-seedance-video-node-design.md`(含完整方舟 API 规格)。

**验证说明:** 此 example 应用没有单测体系(单文件 React 组件 + vite 配置内中间件),无法走标准 TDD。每个任务用「手动接口调用(curl.exe)+ `yarn typecheck`+ 浏览器实测」替代,失败路径(无 key、坏参数)是主要的可自动验证面。需要真实生成视频的步骤标注了「需要真实 ARK key」,由用户提供。

**通用注意:**
- 包管理用 `yarn`,命令在仓库根目录 `d:\work\ml\wuxianhuabu2` 执行。
- 永远不要跑裸 `tsc`;类型检查用根目录 `yarn typecheck`。
- 改 `vite.config.ts` 后 vite dev server 会自动重启,无需手动重启。
- 文件行号是写计划时的快照,以「锚点代码」为准定位。

---

### Task 1: 后端 — ARK 配置基础(常量、辅助函数、`/api/ark-key`、`/api/ai-status` 扩展)

**Files:**
- Modify: `apps/examples/vite.config.ts`
- Modify: `apps/examples/.env.example`

- [ ] **Step 1.1: 添加 ARK 常量**

在 `apps/examples/vite.config.ts` 中找到锚点(约 49–53 行):

```ts
const DEFAULT_AI_BASE_URL = 'https://api.openai.com'
const DEFAULT_TEXT_MODEL = 'gpt-5.5'
const DEFAULT_IMAGE_MODEL = 'gpt-image-2'
const TEXT_MODEL_IDS = new Set(['gpt-5.5', 'deepseek-chat', 'deepseek-reasoner'])
const IMAGE_MODEL_IDS = new Set(['gpt-image-2', 'nanobanana', 'nanobanana-pro', 'nanobanana-2'])
```

在其后追加:

```ts
const ARK_DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_VIDEO_MODEL = 'doubao-seedance-2-0-260128'
const VIDEO_MODEL_IDS = new Set(['doubao-seedance-2-0-260128', 'doubao-seedance-2-0-fast-260128'])
const VIDEO_RESOLUTIONS = new Set(['480p', '720p', '1080p'])
const VIDEO_RATIOS = new Set(['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'])
const VIDEO_IMAGE_ROLES = new Set(['first_frame', 'last_frame', 'reference_image'])
```

- [ ] **Step 1.2: 添加 ARK 辅助函数**

找到 `saveAiSettings` 函数(锚点 `function saveAiSettings(apiKey: string, baseUrl: string) {`,约 884 行),在该函数结束的 `}` 之后追加:

```ts
function getArkApiKey() {
	return process.env.ARK_API_KEY
}

function getArkAuthorizationHeader() {
	const apiKey = getArkApiKey()?.trim()
	if (!apiKey) return ''
	return apiKey.toLowerCase().startsWith('bearer ') ? apiKey : `Bearer ${apiKey}`
}

function getArkBaseUrl() {
	return normalizeAiBaseUrl(process.env.ARK_BASE_URL) || ARK_DEFAULT_BASE_URL
}

function saveArkSettings(apiKey: string, baseUrl: string) {
	const envPath = path.join(__dirname, '.env.local')
	const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : []
	let foundApiKey = false
	let foundBaseUrl = false
	const nextLines = lines.flatMap((line) => {
		if (line.startsWith('ARK_API_KEY=')) {
			foundApiKey = true
			return [`ARK_API_KEY=${apiKey}`]
		}
		if (line.startsWith('ARK_BASE_URL=')) {
			foundBaseUrl = true
			return baseUrl ? [`ARK_BASE_URL=${baseUrl}`] : []
		}
		return [line]
	})
	if (!foundApiKey) nextLines.push(`ARK_API_KEY=${apiKey}`)
	if (baseUrl && !foundBaseUrl) nextLines.push(`ARK_BASE_URL=${baseUrl}`)
	writeFileSync(envPath, `${nextLines.filter((line, index) => line || index < nextLines.length - 1).join('\n')}\n`)
	process.env.ARK_API_KEY = apiKey
	if (baseUrl) {
		process.env.ARK_BASE_URL = baseUrl
	} else {
		delete process.env.ARK_BASE_URL
	}
}
```

- [ ] **Step 1.3: 新增 `POST /api/ark-key` 端点**

找到 `/api/ai-key` 中间件块(锚点 `server.middlewares.use('/api/ai-key', ...)`,该块以 `})` 结束,约 301 行),在其后追加:

```ts
			server.middlewares.use('/api/ark-key', async (req, res) => {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				try {
					const body = await readJsonBody(req)
					const arkApiKey = getString(body.arkApiKey).trim()
					const existingArkApiKey = getArkApiKey() || ''
					const nextArkApiKey = arkApiKey || existingArkApiKey
					const arkBaseUrl = getString(body.arkBaseUrl).trim()
					const normalizedArkBaseUrl = normalizeAiBaseUrl(arkBaseUrl)

					if (!nextArkApiKey || !isValidAiApiKey(nextArkApiKey)) {
						sendJson(res, 400, { error: '请输入有效的火山引擎 ARK API Key。' })
						return
					}
					if (arkBaseUrl && !normalizedArkBaseUrl) {
						sendJson(res, 400, { error: '请输入有效的火山方舟接口地址。' })
						return
					}

					saveArkSettings(nextArkApiKey, normalizedArkBaseUrl)
					sendJson(res, 200, { arkConfigured: true, arkBaseUrl: getArkBaseUrl() })
				} catch (err) {
					sendJson(res, 500, { error: getErrorMessage(err) })
				}
			})
```

- [ ] **Step 1.4: 扩展 `/api/ai-status` 响应**

在 `/api/ai-status` 处理器中(约 237–242 行),把:

```ts
				sendJson(res, 200, {
					provider: 'OpenAI-compatible',
					configured: Boolean(getAiApiKey()),
					baseUrl: getAiBaseUrl(),
					imageApiUrl: getImageApiUrl(),
				})
```

改为:

```ts
				sendJson(res, 200, {
					provider: 'OpenAI-compatible',
					configured: Boolean(getAiApiKey()),
					baseUrl: getAiBaseUrl(),
					imageApiUrl: getImageApiUrl(),
					arkConfigured: Boolean(getArkApiKey()),
				})
```

- [ ] **Step 1.5: 更新 `.env.example`**

把 `apps/examples/.env.example` 改为:

```
IMAGE_API_KEY=YOUR_API_KEY
IMAGE_API_URL=
IMAGE_GATEWAY_API_KEY=
IMAGE_GATEWAY_BASE_URL=
ARK_API_KEY=
ARK_BASE_URL=
```

- [ ] **Step 1.6: 验证**

启动 dev server(若未在跑):仓库根目录执行 `yarn dev`(后台运行),等待 localhost:5420 就绪。然后:

```powershell
curl.exe -s http://localhost:5420/api/ai-status
```
预期:JSON 包含 `"arkConfigured":false`(若 `.env.local` 没有 ARK_API_KEY)。

```powershell
curl.exe -s -X POST http://localhost:5420/api/ark-key -H "Content-Type: application/json" -d "{\"arkApiKey\":\"short\"}"
```
预期:`{"error":"请输入有效的火山引擎 ARK API Key。"}`。

```powershell
curl.exe -s -X POST http://localhost:5420/api/ark-key -H "Content-Type: application/json" -d "{\"arkApiKey\":\"test-ark-key-1234567890\"}"
```
预期:`{"arkConfigured":true,"arkBaseUrl":"https://ark.cn-beijing.volces.com/api/v3"}`;且 `apps/examples/.env.local` 出现 `ARK_API_KEY=test-ark-key-1234567890`;再查 `/api/ai-status` 返回 `"arkConfigured":true`。

验证完把 `.env.local` 里的测试 key 行删掉(或保留待用户填真实 key 覆盖)。

- [ ] **Step 1.7: 提交**

```powershell
git add apps/examples/vite.config.ts apps/examples/.env.example
git commit -m "feat(examples): add Volcengine Ark key config endpoints for ai canvas"
```

---

### Task 2: 后端 — `POST /api/generate-video`(创建方舟视频任务)

**Files:**
- Modify: `apps/examples/vite.config.ts`

- [ ] **Step 2.1: 添加视频请求辅助函数**

在 Task 1.2 添加的 `saveArkSettings` 函数之后追加:

```ts
function normalizeVideoDuration(value: unknown): number | null {
	const duration = Number(value ?? 5)
	if (!Number.isInteger(duration)) return null
	if (duration === -1) return -1
	if (duration < 4 || duration > 15) return null
	return duration
}

function normalizeVideoImageInput(value: unknown): { url: string; role: string } | null {
	if (!value || typeof value !== 'object') return null
	const input = value as { url?: unknown; role?: unknown }
	const url = getString(input.url).trim()
	const role = getString(input.role).trim()
	if (!url || !VIDEO_IMAGE_ROLES.has(role)) return null
	if (!url.startsWith('data:image/') && !/^https?:\/\//.test(url)) return null
	return { url, role }
}

function parseJsonSafely(value: string): any {
	try {
		return JSON.parse(value)
	} catch {
		return null
	}
}

function getArkError(data: any): string {
	const error = data?.error
	if (!error) return ''
	const code = getString(error.code)
	const message = getString(error.message)
	return [code, message].filter(Boolean).join(': ')
}
```

- [ ] **Step 2.2: 新增 `/api/generate-video` 端点**

找到 `/api/agent-chat` 中间件块的结束(锚点:`configureServer(server)` 内最后一个 `})`,其后紧跟 `},` 与 `}`,约 548 行),在 `/api/agent-chat` 块之后、`configureServer` 结束之前插入:

```ts
			server.middlewares.use('/api/generate-video', async (req, res) => {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				try {
					const authHeader = getArkAuthorizationHeader()
					if (!authHeader) {
						sendJson(res, 503, { error: '火山引擎 ARK API Key 未配置，请在接口配置面板填写。' })
						return
					}

					const body = await readJsonBody(req)
					const model = getString(body.model) || DEFAULT_VIDEO_MODEL
					const prompt = getString(body.prompt).trim()
					const resolution = getString(body.resolution) || '720p'
					const ratio = getString(body.ratio) || 'adaptive'
					const duration = normalizeVideoDuration(body.duration)
					const generateAudio = body.generateAudio !== false
					const images = Array.isArray(body.images)
						? body.images
								.map(normalizeVideoImageInput)
								.filter((image): image is { url: string; role: string } => Boolean(image))
						: []

					if (!prompt) {
						sendJson(res, 400, { error: '请输入视频提示词。' })
						return
					}
					if (!VIDEO_MODEL_IDS.has(model)) {
						sendJson(res, 400, { error: `模型 ${model} 不在视频生成白名单内。` })
						return
					}
					if (!VIDEO_RESOLUTIONS.has(resolution)) {
						sendJson(res, 400, { error: `不支持的分辨率 ${resolution}。` })
						return
					}
					if (model.includes('-fast-') && resolution === '1080p') {
						sendJson(res, 400, { error: '快速版模型最高支持 720p，请切换分辨率或使用标准版模型。' })
						return
					}
					if (!VIDEO_RATIOS.has(ratio)) {
						sendJson(res, 400, { error: `不支持的画幅比例 ${ratio}。` })
						return
					}
					if (duration === null) {
						sendJson(res, 400, { error: '时长必须是 4-15 秒的整数，或 -1 表示自适应。' })
						return
					}
					if (images.length > 9) {
						sendJson(res, 400, { error: '参考图最多 9 张。' })
						return
					}

					const content = [
						{ type: 'text', text: prompt },
						...images.map((image) => ({
							type: 'image_url',
							image_url: { url: image.url },
							role: image.role,
						})),
					]
					const response = await fetchWithTimeout(
						`${getArkBaseUrl()}/contents/generations/tasks`,
						{
							method: 'POST',
							headers: {
								Authorization: authHeader,
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({
								model,
								content,
								resolution,
								ratio,
								duration,
								generate_audio: generateAudio,
								watermark: false,
							}),
						},
						60_000
					)
					const responseText = await response.text()
					const data = parseJsonSafely(responseText)
					if (!response.ok) {
						const message = getArkError(data) || `视频任务创建失败（HTTP ${response.status}）`
						console.error('[ai-studio-api] Video task creation failed:', message)
						sendJson(res, response.status, { error: message })
						return
					}
					const taskId = getString(data?.id)
					if (!taskId) {
						sendJson(res, 502, { error: '火山方舟没有返回任务 ID。' })
						return
					}
					sendJson(res, 200, { taskId })
				} catch (err) {
					const message = getErrorMessage(err)
					console.error('[ai-studio-api] Video generation failed:', message)
					sendJson(res, 500, { error: message })
				}
			})
```

- [ ] **Step 2.3: 验证错误路径**

确保 `.env.local` 暂时没有 `ARK_API_KEY`(删掉测试行,等 vite 重启):

```powershell
curl.exe -s -X POST http://localhost:5420/api/generate-video -H "Content-Type: application/json" -d "{\"prompt\":\"x\"}"
```
预期:`{"error":"火山引擎 ARK API Key 未配置，请在接口配置面板填写。"}`。

写入测试 key 后(POST /api/ark-key,同 Task 1.6),验证参数校验:

```powershell
curl.exe -s -X POST http://localhost:5420/api/generate-video -H "Content-Type: application/json" -d "{\"prompt\":\"\",\"model\":\"doubao-seedance-2-0-260128\"}"
```
预期:`{"error":"请输入视频提示词。"}`。

```powershell
curl.exe -s -X POST http://localhost:5420/api/generate-video -H "Content-Type: application/json" -d "{\"prompt\":\"x\",\"model\":\"bad-model\"}"
```
预期:`{"error":"模型 bad-model 不在视频生成白名单内。"}`。

```powershell
curl.exe -s -X POST http://localhost:5420/api/generate-video -H "Content-Type: application/json" -d "{\"prompt\":\"x\",\"model\":\"doubao-seedance-2-0-fast-260128\",\"resolution\":\"1080p\"}"
```
预期:`{"error":"快速版模型最高支持 720p，请切换分辨率或使用标准版模型。"}`。

用假 key 走到方舟会返回鉴权错误(预期透传 401 与方舟错误信息),也可顺手确认。

(可选,需要真实 ARK key)用真实 key 提交一个最小文生视频请求,预期返回 `{"taskId":"cgt-..."}`。

- [ ] **Step 2.4: 提交**

```powershell
git add apps/examples/vite.config.ts
git commit -m "feat(examples): add Seedance video task creation endpoint"
```

---

### Task 3: 后端 — 任务查询/取消、视频转存与本地文件服务

**Files:**
- Modify: `apps/examples/vite.config.ts`
- Modify: `.gitignore`

- [ ] **Step 3.1: 扩展 fs 导入**

把 `apps/examples/vite.config.ts` 第 2 行:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
```

改为:

```ts
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
```

- [ ] **Step 3.2: 添加视频缓存辅助函数**

在 Task 2.1 添加的 `getArkError` 之后追加:

```ts
function getVideoCacheDir() {
	return path.join(__dirname, '.cache', 'ai-videos')
}

function getVideoCachePath(fileName: string) {
	return path.join(getVideoCacheDir(), fileName)
}

async function downloadVideoToCache(remoteUrl: string, localPath: string) {
	const response = await fetchWithTimeout(remoteUrl, { method: 'GET' }, 300_000)
	if (!response.ok) {
		throw new Error(`视频下载失败（HTTP ${response.status}）`)
	}
	const buffer = Buffer.from(await response.arrayBuffer())
	if (!buffer.length) throw new Error('视频内容为空。')
	mkdirSync(getVideoCacheDir(), { recursive: true })
	writeFileSync(localPath, buffer)
}
```

- [ ] **Step 3.3: 新增 `/api/video-task` 端点(GET 轮询 + DELETE 取消)**

在 Task 2.2 插入的 `/api/generate-video` 块之后追加:

```ts
			server.middlewares.use('/api/video-task', async (req, res) => {
				const requestUrl = new URL(req.url || '/', 'http://localhost')
				const taskId = (requestUrl.searchParams.get('id') || '').trim()
				if (!/^cgt-[A-Za-z0-9-]+$/.test(taskId)) {
					sendJson(res, 400, { error: '任务 ID 无效。' })
					return
				}
				const authHeader = getArkAuthorizationHeader()
				if (!authHeader) {
					sendJson(res, 503, { error: '火山引擎 ARK API Key 未配置，请在接口配置面板填写。' })
					return
				}

				if (req.method === 'DELETE') {
					try {
						const response = await fetchWithTimeout(
							`${getArkBaseUrl()}/contents/generations/tasks/${taskId}`,
							{ method: 'DELETE', headers: { Authorization: authHeader } },
							30_000
						)
						const responseText = await response.text()
						if (!response.ok) {
							const message =
								getArkError(parseJsonSafely(responseText)) || `取消任务失败（HTTP ${response.status}）`
							sendJson(res, response.status, { error: message })
							return
						}
						sendJson(res, 200, { status: 'cancelled' })
					} catch (err) {
						sendJson(res, 500, { error: getErrorMessage(err) })
					}
					return
				}

				if (req.method !== 'GET') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				try {
					const localVideoPath = getVideoCachePath(`${taskId}.mp4`)
					if (existsSync(localVideoPath)) {
						sendJson(res, 200, { status: 'succeeded', videoUrl: `/api/video-file/${taskId}.mp4` })
						return
					}

					const response = await fetchWithTimeout(
						`${getArkBaseUrl()}/contents/generations/tasks/${taskId}`,
						{ method: 'GET', headers: { Authorization: authHeader } },
						30_000
					)
					const responseText = await response.text()
					const data = parseJsonSafely(responseText)
					if (!response.ok) {
						const message = getArkError(data) || `查询任务失败（HTTP ${response.status}）`
						sendJson(res, response.status, { error: message })
						return
					}

					const status = getString(data?.status)
					if (status !== 'succeeded') {
						sendJson(res, 200, {
							status: status || 'running',
							error: data?.error ? getArkError(data) : '',
						})
						return
					}

					const remoteVideoUrl = getString(data?.content?.video_url)
					if (!remoteVideoUrl) {
						sendJson(res, 502, { error: '任务成功但没有返回视频地址。' })
						return
					}
					try {
						await downloadVideoToCache(remoteVideoUrl, localVideoPath)
						sendJson(res, 200, { status: 'succeeded', videoUrl: `/api/video-file/${taskId}.mp4` })
					} catch (err) {
						console.error('[ai-studio-api] Video download failed:', getErrorMessage(err))
						sendJson(res, 200, {
							status: 'succeeded',
							videoUrl: remoteVideoUrl,
							warning: '视频转存本地失败，当前链接 24 小时后过期，请及时下载。',
						})
					}
				} catch (err) {
					sendJson(res, 500, { error: getErrorMessage(err) })
				}
			})
```

- [ ] **Step 3.4: 新增 `/api/video-file` 端点(本地视频流式服务,支持 Range)**

紧接 Step 3.3 的块后追加:

```ts
			server.middlewares.use('/api/video-file', async (req, res) => {
				if (req.method !== 'GET') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}
				const requestUrl = new URL(req.url || '/', 'http://localhost')
				const fileName = decodeURIComponent(requestUrl.pathname.replace(/^\/+/, ''))
				if (!/^cgt-[A-Za-z0-9-]+\.mp4$/.test(fileName)) {
					sendJson(res, 400, { error: '文件名无效。' })
					return
				}
				const filePath = getVideoCachePath(fileName)
				if (!existsSync(filePath)) {
					sendJson(res, 404, { error: '视频文件不存在。' })
					return
				}

				const fileSize = statSync(filePath).size
				const rangeHeader = req.headers?.range
				res.setHeader('Accept-Ranges', 'bytes')
				res.setHeader('Content-Type', 'video/mp4')

				const rangeMatch = typeof rangeHeader === 'string' ? rangeHeader.match(/^bytes=(\d*)-(\d*)$/) : null
				if (rangeMatch && (rangeMatch[1] || rangeMatch[2])) {
					const start = rangeMatch[1] ? Number(rangeMatch[1]) : Math.max(0, fileSize - Number(rangeMatch[2]))
					const end = rangeMatch[1] && rangeMatch[2] ? Math.min(Number(rangeMatch[2]), fileSize - 1) : fileSize - 1
					if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fileSize) {
						res.statusCode = 416
						res.setHeader('Content-Range', `bytes */${fileSize}`)
						res.end()
						return
					}
					res.statusCode = 206
					res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
					res.setHeader('Content-Length', String(end - start + 1))
					createReadStream(filePath, { start, end }).pipe(res)
					return
				}

				res.statusCode = 200
				res.setHeader('Content-Length', String(fileSize))
				createReadStream(filePath).pipe(res)
			})
```

- [ ] **Step 3.5: `.gitignore` 加缓存目录**

在仓库根 `.gitignore` 中 `.env.local`(约 108 行)之后加一行:

```
apps/examples/.cache
```

- [ ] **Step 3.6: 验证**

```powershell
curl.exe -s "http://localhost:5420/api/video-task?id=bad!!id"
```
预期:`{"error":"任务 ID 无效。"}`。

```powershell
curl.exe -s "http://localhost:5420/api/video-file/..%2f..%2fsecret.mp4"
```
预期:`{"error":"文件名无效。"}`(路径穿越被拒)。

```powershell
curl.exe -s "http://localhost:5420/api/video-file/cgt-notexist.mp4"
```
预期:`{"error":"视频文件不存在。"}`。

本地文件 + Range 验证:手动放一个测试文件到 `apps/examples/.cache/ai-videos/cgt-test-1.mp4`(任意 mp4 或随便一个小文件),然后:

```powershell
curl.exe -s -o NUL -w "%{http_code} %{size_download}" -H "Range: bytes=0-99" http://localhost:5420/api/video-file/cgt-test-1.mp4
```
预期:`206 100`。无 Range 时返回 200 和完整大小。验证后删掉测试文件。

(可选,需要真实 ARK key)对 Task 2.3 创建的真实任务轮询 `curl.exe -s "http://localhost:5420/api/video-task?id=cgt-..."`,先返回 `{"status":"queued"...}` / `{"status":"running"...}`,成功后返回本地 `videoUrl`,且 `.cache/ai-videos/` 出现 mp4 文件;再次查询直接命中本地缓存。

- [ ] **Step 3.7: 提交**

```powershell
git add apps/examples/vite.config.ts .gitignore
git commit -m "feat(examples): add video task polling, local caching, and file serving"
```

---

### Task 4: 前端 — VideoNode 类型、常量、守卫与持久化

**Files:**
- Modify: `apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx`

- [ ] **Step 4.1: 类型定义**

文件顶部(锚点第 14 行起),把:

```ts
type CanvasNodeType = 'image' | 'prompt' | 'text' | 'doodle'
```

改为:

```ts
type CanvasNodeType = 'image' | 'prompt' | 'text' | 'doodle' | 'video'
```

在 `type ImageSelectionRole = 'identity' | 'motion'`(约 21 行)之后追加:

```ts
type VideoGenerationMode = 'text' | 'first_frame' | 'first_last' | 'reference'
type VideoNodeStatus =
	| 'idle'
	| 'submitting'
	| 'queued'
	| 'running'
	| 'succeeded'
	| 'failed'
	| 'cancelled'
	| 'expired'
type VideoResolution = '480p' | '720p' | '1080p'
type VideoRatio = 'adaptive' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9'
```

在 `DoodleNode` 接口(约 80–86 行)之后追加:

```ts
interface VideoNode extends BaseNode {
	type: 'video'
	prompt: string
	mode: VideoGenerationMode
	sourceImageIds: string[]
	model: string
	resolution: VideoResolution
	ratio: VideoRatio
	duration: number
	generateAudio: boolean
	status: VideoNodeStatus
	taskId: string | null
	videoUrl: string | null
	errorMessage: string | null
	startedAt: number | null
	width: number
	height: number
}
```

把 `type CanvasNode = ImageNode | PromptNode | TextNode | DoodleNode` 改为:

```ts
type CanvasNode = ImageNode | PromptNode | TextNode | DoodleNode | VideoNode
```

在 `ApiStatusResponse` 接口(约 176–181 行)中 `configured?: boolean` 之后加一行:

```ts
	arkConfigured?: boolean
```

在 `AgentChatResponse` 接口(约 225–234 行)之后追加:

```ts
interface VideoGenerationResponse {
	taskId?: string
	error?: string
}

interface VideoTaskResponse {
	status?: string
	videoUrl?: string
	warning?: string
	error?: string
}
```

- [ ] **Step 4.2: 常量**

在 `const HISTORY_LIMIT = 80`(约 263 行)之后追加:

```ts
const VIDEO_NODE_WIDTH = 420
const VIDEO_NODE_BASE_HEIGHT = 540
const VIDEO_PLAYER_HEIGHT = 250
const VIDEO_POLL_INTERVAL_MS = 5000
const VIDEO_POLL_MAX_INTERVAL_MS = 30000
const MAX_VIDEO_REFERENCE_IMAGES = 9
const MAX_VIDEO_IMAGE_BYTES = 30 * 1024 * 1024
const MAX_VIDEO_TOTAL_IMAGE_BYTES = 60 * 1024 * 1024

const VIDEO_MODELS: ModelOption[] = [
	{ id: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0 标准版' },
	{ id: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 快速版' },
]
const VIDEO_RESOLUTION_OPTIONS: VideoResolution[] = ['480p', '720p', '1080p']
const VIDEO_RATIO_OPTIONS: VideoRatio[] = ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
const VIDEO_DURATION_OPTIONS: Array<{ value: number; label: string }> = [
	{ value: -1, label: '自适应' },
	{ value: 4, label: '4 秒' },
	{ value: 5, label: '5 秒' },
	{ value: 8, label: '8 秒' },
	{ value: 10, label: '10 秒' },
	{ value: 15, label: '15 秒' },
]
const VIDEO_MODE_LABELS: Record<VideoGenerationMode, string> = {
	text: '文生视频',
	first_frame: '首帧图生视频',
	first_last: '首尾帧视频',
	reference: '参考图视频',
}
```

- [ ] **Step 4.3: 类型守卫与 getNodeSize**

在 `isDoodleNode`(约 3627 行)之后追加:

```ts
function isVideoNode(node: CanvasNode): node is VideoNode {
	return node.type === 'video'
}
```

在 `getNodeSize` 函数中(约 3631 行),在 `if (isTextNode(node) || isDoodleNode(node))` 分支之前插入:

```ts
	if (isVideoNode(node)) {
		const baseHeight = node.sourceImageIds.length ? VIDEO_NODE_BASE_HEIGHT + 40 : VIDEO_NODE_BASE_HEIGHT
		return {
			w: VIDEO_NODE_WIDTH,
			h: node.status === 'succeeded' && node.videoUrl ? baseHeight + VIDEO_PLAYER_HEIGHT : baseHeight,
		}
	}
```

(说明:视频节点卡片实际渲染时高度自适应内容,此处的 h 只用于边线锚点与框选的近似计算。)

- [ ] **Step 4.4: updateVideoNode**

在组件内 `updateDoodleNode`(约 1284–1288 行)之后追加:

```ts
	function updateVideoNode(nodeId: string, patch: Partial<VideoNode>) {
		setNodes((current) =>
			current.map((node) => (node.id === nodeId && isVideoNode(node) ? { ...node, ...patch } : node))
		)
	}
```

- [ ] **Step 4.5: 持久化兼容**

在 `normalizePersistedCanvasState`(约 3384 行)中,把节点过滤条件:

```ts
						(node) =>
							node &&
							(node.type === 'image' || node.type === 'prompt' || node.type === 'text' || node.type === 'doodle')
```

改为:

```ts
						(node) =>
							node &&
							(node.type === 'image' ||
								node.type === 'prompt' ||
								node.type === 'text' ||
								node.type === 'doodle' ||
								node.type === 'video')
```

把紧随其后的 `.map(...)` 中:

```ts
					.map((node) =>
						node.type === 'prompt'
							? ({
									...node,
									prompt: replaceLegacyImageReferenceText((node as PromptNode).prompt),
									count: normalizeGenerationCount((node as PromptNode).count),
								} as PromptNode)
							: (node as CanvasNode)
					)
```

改为:

```ts
					.map((node) => {
						if (node.type === 'prompt') {
							return {
								...node,
								prompt: replaceLegacyImageReferenceText((node as PromptNode).prompt),
								count: normalizeGenerationCount((node as PromptNode).count),
							} as PromptNode
						}
						if (node.type === 'video') {
							return normalizeLoadedVideoNode(node as VideoNode)
						}
						return node as CanvasNode
					})
```

在 `normalizePersistedCanvasState` 函数之后追加:

```ts
function normalizeLoadedVideoNode(node: VideoNode): VideoNode {
	let status: VideoNodeStatus = node.status || 'idle'
	if (status === 'submitting') status = 'idle'
	if ((status === 'queued' || status === 'running') && !node.taskId) status = 'idle'
	if (status === 'succeeded' && !node.videoUrl) status = 'idle'
	return {
		...node,
		prompt: node.prompt || '',
		mode: VIDEO_MODE_LABELS[node.mode] ? node.mode : 'text',
		sourceImageIds: Array.isArray(node.sourceImageIds) ? node.sourceImageIds : [],
		model: VIDEO_MODELS.some((model) => model.id === node.model) ? node.model : VIDEO_MODELS[0].id,
		resolution: VIDEO_RESOLUTION_OPTIONS.includes(node.resolution) ? node.resolution : '720p',
		ratio: VIDEO_RATIO_OPTIONS.includes(node.ratio) ? node.ratio : 'adaptive',
		duration: VIDEO_DURATION_OPTIONS.some((option) => option.value === node.duration) ? node.duration : 5,
		generateAudio: node.generateAudio !== false,
		status,
		taskId: node.taskId || null,
		videoUrl: node.videoUrl || null,
		errorMessage: node.errorMessage || null,
		startedAt: node.startedAt || null,
		width: VIDEO_NODE_WIDTH,
		height: VIDEO_NODE_BASE_HEIGHT,
	}
}
```

- [ ] **Step 4.6: buildCanvasSummary 增加视频分支**

在 `buildCanvasSummary`(约 3570 行)的 `nodeLines` 映射中,把:

```ts
		if (isImageNode(node)) {
			return `图片节点 ${createAgentImageReferenceLabel(node)}（${markers.join('，')}）：${node.title}，文件 ${node.fileName}${node.prompt ? `，来源提示词：${node.prompt}` : ''}`
		}
		return `提示词节点 ${node.id}（${markers.join('，')}）：尺寸 ${node.size}，数量 ${normalizeGenerationCount(node.count)} 张，状态 ${node.status}，提示词：${node.prompt || '空'}`
```

改为:

```ts
		if (isImageNode(node)) {
			return `图片节点 ${createAgentImageReferenceLabel(node)}（${markers.join('，')}）：${node.title}，文件 ${node.fileName}${node.prompt ? `，来源提示词：${node.prompt}` : ''}`
		}
		if (isVideoNode(node)) {
			return `视频节点 ${node.id}（${markers.join('，')}）：模式 ${VIDEO_MODE_LABELS[node.mode]}，状态 ${node.status}，提示词：${node.prompt || '空'}`
		}
		return `提示词节点 ${node.id}（${markers.join('，')}）：尺寸 ${node.size}，数量 ${normalizeGenerationCount(node.count)} 张，状态 ${node.status}，提示词：${node.prompt || '空'}`
```

注意:原第二个 return 对 text/doodle 节点也会走到(读取不存在的 `node.size` 等),这是既有行为,本任务不改它,只确保 video 节点有自己的分支。若 TypeScript 因联合类型收窄报错(`node.size` 在 text/doodle 上不存在),按既有代码风格用 `(node as PromptNode)` 收窄该行。

- [ ] **Step 4.7: 类型检查**

仓库根目录执行:

```powershell
yarn typecheck
```

预期:通过,无错误。(此时 VideoNode 已定义但尚无 UI 与调用方,`isVideoNode`/常量可能报 unused —— 若 lint 报 unused 不阻塞 typecheck 则继续;Task 5–7 会消费它们。)

- [ ] **Step 4.8: 提交**

```powershell
git add apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx
git commit -m "feat(examples): add video node type, constants, and persistence support"
```

---

### Task 5: 前端 — 创建入口(工具栏按钮、快捷菜单)与节点创建函数

**Files:**
- Modify: `apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx`

- [ ] **Step 5.1: createVideoNodeFromSelection**

在组件内 `createMotionTransferPrompt`(约 1072–1105 行)之后追加:

```ts
	function createVideoNodeFromSelection() {
		const sourceNodes = getSelectedImageNodes().slice(0, MAX_VIDEO_REFERENCE_IMAGES)
		const mode: VideoGenerationMode =
			sourceNodes.length === 0
				? 'text'
				: sourceNodes.length === 1
					? 'first_frame'
					: sourceNodes.length === 2
						? 'first_last'
						: 'reference'
		const anchor = sourceNodes[0]
		const center = getViewportCenter()
		const videoNode: VideoNode = {
			id: createNodeId('video'),
			type: 'video',
			x: anchor ? anchor.x + getNodeSize(anchor).w + NODE_GAP : center.x - VIDEO_NODE_WIDTH / 2,
			y: anchor ? anchor.y : center.y - VIDEO_NODE_BASE_HEIGHT / 2,
			prompt: '',
			mode,
			sourceImageIds: sourceNodes.map((node) => node.id),
			model: VIDEO_MODELS[0].id,
			resolution: '720p',
			ratio: 'adaptive',
			duration: 5,
			generateAudio: true,
			status: 'idle',
			taskId: null,
			videoUrl: null,
			errorMessage: null,
			startedAt: null,
			width: VIDEO_NODE_WIDTH,
			height: VIDEO_NODE_BASE_HEIGHT,
		}
		setNodes((current) => [...current, videoNode])
		if (sourceNodes.length) {
			setEdges((current) => [
				...current,
				...sourceNodes.map((sourceNode) => ({ id: createEdgeId(), from: sourceNode.id, to: videoNode.id })),
			])
		}
		setSelectedNodeIds([videoNode.id])
		setCanvasNotice(
			sourceNodes.length === 0
				? '已创建文生视频节点，填写提示词后生成'
				: `已创建「${VIDEO_MODE_LABELS[mode]}」节点，引用 ${sourceNodes.length} 张图片`
		)
	}
```

- [ ] **Step 5.2: 快捷菜单与工具栏接入**

`handleQuickAction`(约 1182 行)签名和分支,把:

```ts
	function handleQuickAction(action: 'image' | 'text' | 'annotate' | 'motion' | 'agent') {
		if (!quickActionMenu) return
		if (action === 'image') createBlankImagePromptPair(quickActionMenu.canvasPoint)
		if (action === 'text') createTextNodeAt(quickActionMenu.canvasPoint)
		if (action === 'annotate') startImageAnnotation()
		if (action === 'motion') createMotionTransferPrompt()
		if (action === 'agent') setAgentPanelOpen(true)
		setQuickActionMenu(null)
	}
```

改为:

```ts
	function handleQuickAction(action: 'image' | 'text' | 'annotate' | 'motion' | 'video' | 'agent') {
		if (!quickActionMenu) return
		if (action === 'image') createBlankImagePromptPair(quickActionMenu.canvasPoint)
		if (action === 'text') createTextNodeAt(quickActionMenu.canvasPoint)
		if (action === 'annotate') startImageAnnotation()
		if (action === 'motion') createMotionTransferPrompt()
		if (action === 'video') createVideoNodeFromSelection()
		if (action === 'agent') setAgentPanelOpen(true)
		setQuickActionMenu(null)
	}
```

`QuickActionMenuView`(约 2300 行)的 `onAction` 类型同步加 `'video'`:

```ts
	onAction: (action: 'image' | 'text' | 'annotate' | 'motion' | 'video' | 'agent') => void
```

在「动作迁移」按钮之后、「调出 Agent」按钮之前插入:

```tsx
			<button type="button" onClick={() => onAction('video')}>
				<span>生成视频</span>
				<small>Seedance 2.0，选中图片可作首帧/参考图</small>
			</button>
```

同时把菜单定位的高度余量 `window.innerHeight - 252` 改为 `window.innerHeight - 300`(菜单变高)。

- [ ] **Step 5.3: 左侧工具栏按钮**

`CanvasLeftToolbar`(约 2010 行)的 props 加:声明里加 `onCreateVideo,`,类型里加 `onCreateVideo: () => void`。在「AI 工作流」分组中「动作迁移」按钮之后插入:

```tsx
				<button type="button" onClick={onCreateVideo} title="生成视频（Seedance 2.0）" aria-label="生成视频">
					<Icon name="video" />
				</button>
```

调用处(约 1802–1817 行)加一行 prop:

```tsx
				onCreateVideo={createVideoNodeFromSelection}
```

- [ ] **Step 5.4: Icon 增加 video 图标**

找到 `Icon` 组件的 name 联合类型(约 2127–2145 行,包含 `| 'motion'` 的联合),加 `| 'video'`。在 `Icon` 函数体内 `if (name === 'trash')` 分支之前插入:

```tsx
	if (name === 'video') {
		return (
			<svg {...common}>
				<rect x="3" y="6" width="13" height="12" rx="2" />
				<path d="M16 10l5-3v10l-5-3" />
			</svg>
		)
	}
```

- [ ] **Step 5.5: 临时渲染兜底(避免 video 节点命中 DoodleNodeView)**

`nodes.map` 渲染处(约 1888–1950 行)最后的 fallback 把所有非 image/prompt/text 节点都当 doodle 渲染。在 `isTextNode` 分支之后、fallback 之前插入临时分支(Task 7 会替换成 VideoNodeView):

```tsx
						if (isVideoNode(node)) {
							return null
						}
```

- [ ] **Step 5.6: 验证**

```powershell
yarn typecheck
```
预期通过。浏览器打开 `http://localhost:5420/ai-canvas-agent`:左侧工具栏出现视频图标按钮;双击空白处的快捷菜单出现「生成视频」项;点击后画布 meta 栏选中数变化、出现连线(选中图片时),节点本体暂不渲染(Task 7 接入)。刷新页面无报错。

- [ ] **Step 5.7: 提交**

```powershell
git add apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx
git commit -m "feat(examples): add video node creation entries in toolbar and quick menu"
```

---

### Task 6: 前端 — 任务提交、轮询、恢复、取消

**Files:**
- Modify: `apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx`

- [ ] **Step 6.1: 模块级辅助函数**

在文件底部 `isVideoNode` 之后追加:

```ts
function getVideoSourceImages(node: VideoNode, nodes: CanvasNode[]) {
	return node.sourceImageIds
		.map((id) => nodes.find((item) => item.id === id))
		.filter((item): item is ImageNode => Boolean(item && isImageNode(item)))
}

function buildVideoImageInputs(mode: VideoGenerationMode, sourceNodes: ImageNode[]) {
	if (mode === 'text' || !sourceNodes.length) return []
	if (mode === 'first_frame') {
		return [{ url: sourceNodes[0].imageUrl, role: 'first_frame' }]
	}
	if (mode === 'first_last') {
		return [
			{ url: sourceNodes[0].imageUrl, role: 'first_frame' },
			{ url: sourceNodes[1].imageUrl, role: 'last_frame' },
		]
	}
	return sourceNodes.slice(0, MAX_VIDEO_REFERENCE_IMAGES).map((node) => ({
		url: node.imageUrl,
		role: 'reference_image',
	}))
}

function estimateDataUrlBytes(url: string) {
	if (!url.startsWith('data:')) return 0
	const base64 = url.slice(url.indexOf(',') + 1)
	return Math.floor((base64.length * 3) / 4)
}

function validateVideoImageSizes(urls: string[]) {
	let total = 0
	for (const url of urls) {
		const bytes = estimateDataUrlBytes(url)
		if (bytes > MAX_VIDEO_IMAGE_BYTES) return '单张参考图超过 30MB，请压缩后重试。'
		total += bytes
	}
	if (total > MAX_VIDEO_TOTAL_IMAGE_BYTES) return '参考图总大小超过 60MB，请减少图片数量或压缩。'
	return ''
}

function getVideoSourceRoleLabel(mode: VideoGenerationMode, index: number) {
	if (mode === 'first_frame') return '首帧'
	if (mode === 'first_last') return index === 0 ? '首帧' : '尾帧'
	return `参考图${index + 1}`
}
```

- [ ] **Step 6.2: ark 状态(供按钮置灰)**

组件状态区(锚点 `const [apiKeySaving, setApiKeySaving] = useState(false)`,约 416 行)之后追加:

```ts
	const [arkStatus, setArkStatus] = useState<ApiStatus>('checking')
	const [arkKeyInput, setArkKeyInput] = useState('')
	const [arkKeySaving, setArkKeySaving] = useState(false)
```

在 `refreshApiState`(约 592–602 行)中,`setApiStatus(status.configured ? 'ready' : 'missing')` 之后、`if (!status.configured)` 之前插入:

```ts
			setArkStatus(status.arkConfigured ? 'ready' : 'missing')
```

修改 `checkApiStatus`(约 3601–3613 行)为:

```ts
async function checkApiStatus() {
	try {
		const response = await fetch('/api/ai-status')
		const data = (await response.json()) as ApiStatusResponse
		return {
			configured: Boolean(response.ok && data.configured),
			arkConfigured: Boolean(response.ok && data.arkConfigured),
			baseUrl: data.baseUrl || '',
			imageApiUrl: data.imageApiUrl || '',
		}
	} catch {
		return { configured: false, arkConfigured: false, baseUrl: '', imageApiUrl: '' }
	}
}
```

- [ ] **Step 6.3: 轮询器(单一来源:effect 驱动)**

在组件内(锚点:`const agentReferenceImages = useMemo(...)` 之后、第一个 `useEffect` 之前)追加 ref 与函数:

```ts
	const videoPollersRef = useRef(new Set<string>())

	async function pollVideoTask(nodeId: string, taskId: string) {
		if (videoPollersRef.current.has(taskId)) return
		videoPollersRef.current.add(taskId)
		let delay = VIDEO_POLL_INTERVAL_MS
		try {
			while (true) {
				await new Promise((resolve) => window.setTimeout(resolve, delay))
				let data: VideoTaskResponse
				try {
					const response = await fetch(`/api/video-task?id=${encodeURIComponent(taskId)}`)
					data = (await response.json()) as VideoTaskResponse
					if (!response.ok) throw new Error(data.error || '查询视频任务失败')
				} catch {
					delay = Math.min(VIDEO_POLL_MAX_INTERVAL_MS, delay * 2)
					updateVideoNode(nodeId, { errorMessage: '网络连接中断，正在重试…' })
					continue
				}
				delay = VIDEO_POLL_INTERVAL_MS
				const status = data.status || 'running'
				if (status === 'succeeded' && data.videoUrl) {
					updateVideoNode(nodeId, {
						status: 'succeeded',
						videoUrl: data.videoUrl,
						errorMessage: data.warning || null,
					})
					setCanvasNotice(data.warning ? '视频已生成（转存失败，请及时下载）' : '视频已生成')
					return
				}
				if (status === 'failed' || status === 'cancelled' || status === 'expired') {
					updateVideoNode(nodeId, {
						status: status as VideoNodeStatus,
						errorMessage:
							data.error ||
							(status === 'expired' ? '任务已过期' : status === 'cancelled' ? '任务已取消' : '视频生成失败'),
					})
					return
				}
				updateVideoNode(nodeId, { status: status === 'queued' ? 'queued' : 'running', errorMessage: null })
			}
		} finally {
			videoPollersRef.current.delete(taskId)
		}
	}
```

在持久化加载的 `useEffect`(锚点 `loadPersistedCanvasState().then(...)`,约 536–554 行)之后追加轮询保障 effect(节点变化时确保每个进行中的任务都有轮询器;`pollVideoTask` 内的 Set 去重保证幂等):

```ts
	useEffect(() => {
		if (!isStorageReady) return
		for (const node of nodes) {
			if (isVideoNode(node) && node.taskId && (node.status === 'queued' || node.status === 'running')) {
				void pollVideoTask(node.id, node.taskId)
			}
		}
	}, [isStorageReady, nodes])
```

注:若 eslint 的 `react-hooks/exhaustive-deps` 要求把 `pollVideoTask` 加入依赖,按提示处理(该函数每次渲染新建,但 Set 去重使重复调用无害;也可以把它加进依赖数组,行为不变)。

- [ ] **Step 6.4: 提交与取消**

在组件内 `generateImageForPromptNode`(约 1327 行)之前追加:

```ts
	async function generateVideoForNode(videoNode: VideoNode) {
		if (arkStatus !== 'ready') {
			updateVideoNode(videoNode.id, {
				status: 'failed',
				errorMessage: '未配置火山引擎 ARK API Key，请点击顶部「检查接口」填写。',
			})
			return
		}
		const prompt = videoNode.prompt.trim()
		if (!prompt) {
			updateVideoNode(videoNode.id, { status: 'failed', errorMessage: '请输入视频提示词' })
			return
		}
		const sourceNodes = getVideoSourceImages(videoNode, nodes)
		if (videoNode.mode === 'first_frame' && sourceNodes.length < 1) {
			updateVideoNode(videoNode.id, { status: 'failed', errorMessage: '首帧模式需要 1 张图片，请重新连接图片节点' })
			return
		}
		if (videoNode.mode === 'first_last' && sourceNodes.length < 2) {
			updateVideoNode(videoNode.id, { status: 'failed', errorMessage: '首尾帧模式需要 2 张图片，请重新连接图片节点' })
			return
		}
		if (videoNode.mode === 'reference' && sourceNodes.length < 1) {
			updateVideoNode(videoNode.id, { status: 'failed', errorMessage: '参考图模式至少需要 1 张图片' })
			return
		}
		const images = buildVideoImageInputs(videoNode.mode, sourceNodes)
		const sizeError = validateVideoImageSizes(images.map((image) => image.url))
		if (sizeError) {
			updateVideoNode(videoNode.id, { status: 'failed', errorMessage: sizeError })
			return
		}

		updateVideoNode(videoNode.id, {
			status: 'submitting',
			errorMessage: null,
			videoUrl: null,
			taskId: null,
			startedAt: Date.now(),
		})
		try {
			const response = await fetch('/api/generate-video', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: videoNode.model,
					prompt,
					images,
					resolution: videoNode.resolution,
					ratio: videoNode.ratio,
					duration: videoNode.duration,
					generateAudio: videoNode.generateAudio,
				}),
			})
			const data = (await response.json()) as VideoGenerationResponse
			if (!response.ok || !data.taskId) throw new Error(data.error || '视频任务创建失败')
			updateVideoNode(videoNode.id, { status: 'queued', taskId: data.taskId })
			setCanvasNotice('视频任务已创建，正在排队生成')
		} catch (err) {
			updateVideoNode(videoNode.id, {
				status: 'failed',
				errorMessage: err instanceof Error ? err.message : '视频任务创建失败',
			})
		}
	}

	async function cancelVideoTask(videoNode: VideoNode) {
		if (!videoNode.taskId) return
		try {
			const response = await fetch(`/api/video-task?id=${encodeURIComponent(videoNode.taskId)}`, {
				method: 'DELETE',
			})
			const data = (await response.json()) as VideoTaskResponse
			if (!response.ok) throw new Error(data.error || '取消任务失败')
			updateVideoNode(videoNode.id, { status: 'cancelled', errorMessage: '任务已取消' })
			setCanvasNotice('视频任务已取消')
		} catch (err) {
			setCanvasNotice(err instanceof Error ? err.message : '取消任务失败')
		}
	}
```

(提交成功后无需手动启动轮询 —— Step 6.3 的 effect 检测到 `queued + taskId` 会自动拉起轮询器;页面刷新后同理,实现「恢复轮询」。)

- [ ] **Step 6.5: 验证**

```powershell
yarn typecheck
```
预期通过(`generateVideoForNode`/`cancelVideoTask` 暂未被 UI 引用,等 Task 7;若 lint 报 unused 不阻塞则继续)。

- [ ] **Step 6.6: 提交**

```powershell
git add apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx
git commit -m "feat(examples): add video task submission, polling, resume, and cancel"
```

---

### Task 7: 前端 — VideoNodeView 组件、渲染接入与 CSS

**Files:**
- Modify: `apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx`
- Modify: `apps/examples/src/examples/use-cases/ai-canvas-agent/ai-canvas-agent.css`

- [ ] **Step 7.1: VideoNodeView 组件**

在 `PromptNodeView` 组件(约 2539–2618 行)之后追加:

```tsx
function VideoNodeView({
	node,
	sourceImages,
	selected,
	arkReady,
	onPointerDown,
	onChange,
	onGenerate,
	onCancel,
	onDelete,
}: {
	node: VideoNode
	sourceImages: ImageNode[]
	selected: boolean
	arkReady: boolean
	onPointerDown: (event: ReactPointerEvent<HTMLElement>, node: CanvasNode) => void
	onChange: (nodeId: string, patch: Partial<VideoNode>) => void
	onGenerate: (node: VideoNode) => void
	onCancel: (node: VideoNode) => void
	onDelete: (node: VideoNode) => void
}) {
	const size = getNodeSize(node)
	const isWorking = node.status === 'submitting' || node.status === 'queued' || node.status === 'running'
	const isFinished =
		node.status === 'succeeded' ||
		node.status === 'failed' ||
		node.status === 'cancelled' ||
		node.status === 'expired'
	const [, setNowTick] = useState(0)
	useEffect(() => {
		if (!isWorking) return
		const interval = window.setInterval(() => setNowTick((current) => current + 1), 1000)
		return () => window.clearInterval(interval)
	}, [isWorking])
	const elapsedSeconds =
		isWorking && node.startedAt ? Math.max(0, Math.round((Date.now() - node.startedAt) / 1000)) : 0
	const isFastModel = node.model.includes('-fast-')
	const statusText =
		node.status === 'submitting'
			? '提交任务中'
			: node.status === 'queued'
				? `排队中 · 已等待 ${elapsedSeconds} 秒`
				: node.status === 'running'
					? `生成中 · 已等待 ${elapsedSeconds} 秒`
					: ''

	return (
		<form
			className="tap-node tap-node--video"
			data-selected={selected}
			style={{ left: node.x, top: node.y, width: size.w }}
			onPointerDown={(event) => onPointerDown(event, node)}
			onSubmit={(event) => {
				event.preventDefault()
				onGenerate(node)
			}}
		>
			<header className="tap-node__header">
				<span>视频生成 · Seedance 2.0</span>
				<div className="tap-node__header-actions">
					<strong>{VIDEO_MODE_LABELS[node.mode]}</strong>
					<button type="button" onClick={() => onDelete(node)} aria-label="删除视频节点">
						删除
					</button>
				</div>
			</header>
			{sourceImages.length > 0 && (
				<div className="tap-video-sources">
					{sourceImages.map((image, index) => (
						<span key={image.id} className="tap-video-sources__item">
							{getVideoSourceRoleLabel(node.mode, index)} · {image.title}
						</span>
					))}
				</div>
			)}
			{sourceImages.length === 2 && (
				<div className="tap-size-group" role="radiogroup" aria-label="双图模式选择">
					<button
						type="button"
						data-selected={node.mode === 'first_last'}
						onClick={() => onChange(node.id, { mode: 'first_last', errorMessage: null })}
					>
						首尾帧
					</button>
					<button
						type="button"
						data-selected={node.mode === 'reference'}
						onClick={() => onChange(node.id, { mode: 'reference', errorMessage: null })}
					>
						参考图
					</button>
				</div>
			)}
			<div className="tap-video-params">
				<label>
					<span>模型</span>
					<select
						value={node.model}
						onChange={(event) => {
							const model = event.target.value
							const patch: Partial<VideoNode> = { model, errorMessage: null }
							if (model.includes('-fast-') && node.resolution === '1080p') patch.resolution = '720p'
							onChange(node.id, patch)
						}}
					>
						{VIDEO_MODELS.map((model) => (
							<option key={model.id} value={model.id}>
								{model.label}
							</option>
						))}
					</select>
				</label>
				<label>
					<span>分辨率</span>
					<select
						value={node.resolution}
						onChange={(event) =>
							onChange(node.id, { resolution: event.target.value as VideoResolution, errorMessage: null })
						}
					>
						{VIDEO_RESOLUTION_OPTIONS.map((resolution) => (
							<option key={resolution} value={resolution} disabled={isFastModel && resolution === '1080p'}>
								{resolution}
								{isFastModel && resolution === '1080p' ? '（快速版不支持）' : ''}
							</option>
						))}
					</select>
				</label>
				<label>
					<span>画幅比例</span>
					<select
						value={node.ratio}
						onChange={(event) => onChange(node.id, { ratio: event.target.value as VideoRatio, errorMessage: null })}
					>
						{VIDEO_RATIO_OPTIONS.map((ratio) => (
							<option key={ratio} value={ratio}>
								{ratio === 'adaptive' ? '自适应' : ratio}
							</option>
						))}
					</select>
				</label>
				<label>
					<span>时长</span>
					<select
						value={String(node.duration)}
						onChange={(event) => onChange(node.id, { duration: Number(event.target.value), errorMessage: null })}
					>
						{VIDEO_DURATION_OPTIONS.map((option) => (
							<option key={option.value} value={String(option.value)}>
								{option.label}
							</option>
						))}
					</select>
				</label>
			</div>
			<label className="tap-video-audio">
				<input
					type="checkbox"
					checked={node.generateAudio}
					onChange={(event) => onChange(node.id, { generateAudio: event.target.checked, errorMessage: null })}
				/>
				<span>生成原生音频</span>
			</label>
			<label className="tap-prompt-field">
				<span>视频提示词</span>
				<textarea
					value={node.prompt}
					onChange={(event) => onChange(node.id, { prompt: event.target.value, errorMessage: null })}
					placeholder="描述画面、动作与镜头，例如：女孩睁开眼温柔看向镜头，镜头缓慢推近"
					rows={4}
				/>
			</label>
			{node.status === 'succeeded' && node.videoUrl ? (
				<div className="tap-video-frame">
					<video src={node.videoUrl} controls preload="metadata" />
				</div>
			) : null}
			{statusText ? <div className="tap-video-status">{statusText}</div> : null}
			{node.errorMessage && node.status !== 'succeeded' ? (
				<div className="tap-node__error">{node.errorMessage}</div>
			) : null}
			{node.errorMessage && node.status === 'succeeded' ? (
				<div className="tap-video-warning">{node.errorMessage}</div>
			) : null}
			<div className="tap-video-actions">
				{isWorking && node.taskId ? (
					<button type="button" onClick={() => onCancel(node)}>
						取消任务
					</button>
				) : null}
				<button
					className="tap-generate-button"
					type="submit"
					disabled={isWorking || !node.prompt.trim() || !arkReady}
				>
					{isWorking ? '生成中' : arkReady ? (isFinished ? '重新生成' : '生成视频') : 'ARK 接口未配置'}
				</button>
			</div>
		</form>
	)
}
```

- [ ] **Step 7.2: 渲染接入**

把 Task 5.5 的临时分支:

```tsx
						if (isVideoNode(node)) {
							return null
						}
```

替换为:

```tsx
						if (isVideoNode(node)) {
							return (
								<VideoNodeView
									key={node.id}
									node={node}
									sourceImages={getVideoSourceImages(node, nodes)}
									selected={selectedNodeIds.includes(node.id)}
									arkReady={arkStatus === 'ready'}
									onPointerDown={handleNodePointerDown}
									onChange={updateVideoNode}
									onGenerate={(targetNode) => void generateVideoForNode(targetNode)}
									onCancel={(targetNode) => void cancelVideoTask(targetNode)}
									onDelete={(targetNode) => deleteNodes([targetNode.id])}
								/>
							)
						}
```

- [ ] **Step 7.3: CSS**

在 `apps/examples/src/examples/use-cases/ai-canvas-agent/ai-canvas-agent.css` 文件末尾追加:

```css
/* Video node (Seedance 2.0) */
.tap-node--video {
	display: flex;
	flex-direction: column;
	gap: 10px;
	width: 420px;
	padding: 12px;
}

.tap-video-sources {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.tap-video-sources__item {
	max-width: 100%;
	overflow: hidden;
	padding: 3px 8px;
	border: 1px solid rgba(255, 255, 255, 0.14);
	border-radius: 999px;
	background: #282a2f;
	color: #d8dce3;
	font-size: 11px;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.tap-video-params {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 8px;
}

.tap-video-params label {
	display: grid;
	gap: 4px;
	color: #9aa1ab;
	font-size: 11px;
}

.tap-video-params select {
	height: 32px;
	padding: 0 8px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 6px;
	background: #282a2f;
	color: #d8dce3;
	font: inherit;
	font-size: 12px;
}

.tap-video-audio {
	display: flex;
	align-items: center;
	gap: 8px;
	color: #d8dce3;
	font-size: 12px;
}

.tap-video-frame {
	overflow: hidden;
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 8px;
	background: #101114;
}

.tap-video-frame video {
	display: block;
	width: 100%;
	max-height: 240px;
}

.tap-video-status {
	padding: 8px 10px;
	border-radius: 6px;
	background: rgba(74, 144, 255, 0.12);
	color: #9ec1ff;
	font-size: 12px;
}

.tap-video-warning {
	padding: 8px 10px;
	border-radius: 6px;
	background: rgba(255, 184, 71, 0.12);
	color: #ffd79e;
	font-size: 12px;
}

.tap-video-actions {
	display: flex;
	gap: 8px;
}

.tap-video-actions .tap-generate-button {
	flex: 1;
}

.tap-video-actions > button[type='button'] {
	height: 40px;
	padding: 0 12px;
	border: 1px solid rgba(255, 255, 255, 0.14);
	border-radius: 8px;
	background: #282a2f;
	color: #d8dce3;
	font: inherit;
	font-size: 12px;
	cursor: pointer;
}
```

- [ ] **Step 7.4: 验证**

```powershell
yarn typecheck
```
预期通过。浏览器实测:创建视频节点后卡片完整渲染(参数下拉、提示词框、按钮);未配置 ARK key 时按钮显示「ARK 接口未配置」且禁用;快速版模型下 1080p 选项禁用、若已选 1080p 自动降为 720p;双图时出现「首尾帧/参考图」切换;拖动、框选、删除、连线显示正常;刷新页面节点还在。

- [ ] **Step 7.5: 提交**

```powershell
git add apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx apps/examples/src/examples/use-cases/ai-canvas-agent/ai-canvas-agent.css
git commit -m "feat(examples): render Seedance video node card with params and player"
```

---

### Task 8: 前端 — 接口配置面板增加 ARK Key

**Files:**
- Modify: `apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx`

- [ ] **Step 8.1: 保存处理函数**

在组件内 `handleSaveApiKey`(约 1295–1325 行)之后追加:

```ts
	async function handleSaveArkKey(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const arkApiKey = arkKeyInput.trim()
		if (!arkApiKey) {
			setModelError('请输入火山引擎 ARK API Key')
			return
		}
		setArkKeySaving(true)
		setModelError(null)
		try {
			const response = await fetch('/api/ark-key', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ arkApiKey }),
			})
			const data = (await response.json()) as { error?: string }
			if (!response.ok) throw new Error(data.error || 'ARK Key 保存失败')
			setArkKeyInput('')
			setArkStatus('ready')
			setApiRefreshNonce((current) => current + 1)
			setCanvasNotice('火山引擎 ARK Key 已保存，可以生成视频了')
		} catch (err) {
			setModelError(err instanceof Error ? err.message : 'ARK Key 保存失败')
		} finally {
			setArkKeySaving(false)
		}
	}
```

- [ ] **Step 8.2: ApiKeyPanel 增加 ARK 表单**

`ApiKeyPanel` 组件(约 2801–2865 行)props 声明与类型分别加:

```ts
	arkStatus,
	arkKeyInput,
	arkSaving,
	onArkKeyInputChange,
	onArkSubmit,
```

```ts
	arkStatus: ApiStatus
	arkKeyInput: string
	arkSaving: boolean
	onArkKeyInputChange: (value: string) => void
	onArkSubmit: (event: FormEvent<HTMLFormElement>) => void
```

在该组件现有 `</form>` 之后、`</section>` 之前插入:

```tsx
			<form onSubmit={onArkSubmit} className="tap-api-key-panel__ark">
				<label>
					<span>火山引擎 ARK API Key（Seedance 视频生成）</span>
					<input
						type="password"
						value={arkKeyInput}
						onChange={(event) => onArkKeyInputChange(event.target.value)}
						placeholder="火山方舟控制台创建的 API Key"
						autoComplete="off"
					/>
				</label>
				<div className="tap-api-key-panel__actions">
					<span className="tap-api-key-panel__ark-status" data-state={arkStatus}>
						{arkStatus === 'ready' ? 'ARK 已配置' : 'ARK 未配置'}
					</span>
					<button type="submit" disabled={arkSaving || !arkKeyInput.trim()}>
						{arkSaving ? '保存中' : '保存 ARK Key'}
					</button>
				</div>
			</form>
```

调用处(约 1788–1800 行)补传 props:

```tsx
					arkStatus={arkStatus}
					arkKeyInput={arkKeyInput}
					arkSaving={arkKeySaving}
					onArkKeyInputChange={setArkKeyInput}
					onArkSubmit={handleSaveArkKey}
```

- [ ] **Step 8.3: ARK 面板 CSS**

在 `ai-canvas-agent.css` 末尾(Task 7.3 块之后)追加:

```css
.tap-api-key-panel__ark {
	margin-top: 12px;
	padding-top: 12px;
	border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.tap-api-key-panel__ark-status {
	align-self: center;
	color: #9aa1ab;
	font-size: 12px;
}

.tap-api-key-panel__ark-status[data-state='ready'] {
	color: #7ddb9a;
}
```

- [ ] **Step 8.4: 验证**

```powershell
yarn typecheck
```
预期通过。浏览器实测:点顶部「检查接口」打开面板,出现 ARK Key 输入区与「ARK 未配置」状态;输入短 key 报错;输入 ≥12 位无空格的 key 保存成功,状态变「ARK 已配置」,`.env.local` 写入 `ARK_API_KEY=`;视频节点按钮从「ARK 接口未配置」变为「生成视频」。

- [ ] **Step 8.5: 提交**

```powershell
git add apps/examples/src/examples/use-cases/ai-canvas-agent/AiCanvasAgentExample.tsx apps/examples/src/examples/use-cases/ai-canvas-agent/ai-canvas-agent.css
git commit -m "feat(examples): add Ark key section to interface settings panel"
```

---

### Task 9: 端到端验证与收尾

**Files:** 无新改动(只验证;发现问题就地修复后补提交)

- [ ] **Step 9.1: 全量类型检查**

```powershell
yarn typecheck
```
预期通过。

- [ ] **Step 9.2: 无 key 错误路径回归**

临时把 `.env.local` 的 `ARK_API_KEY` 行删掉(vite 自动重启),浏览器确认:视频节点按钮禁用并显示「ARK 接口未配置」;面板显示「ARK 未配置」。恢复 key。

- [ ] **Step 9.3: 真实生成实测(需要用户提供真实 ARK key)**

在设置面板填入真实 key 后,逐一实测:

1. **文生视频**:不选图片 → 工具栏「生成视频」→ 填提示词(如「晴朗蓝天下的白色雏菊花田,镜头缓慢拉近」)→ 生成 → 观察「排队中 → 生成中 → 视频已生成」,播放器可播放、可拖动进度条。
2. **首帧**:选中 1 张图片 → 创建 → 卡片显示「首帧 · 图片名」→ 生成成功。
3. **首尾帧**:选中 2 张图片 → 创建 → 默认首尾帧,生成成功;切到「参考图」再生成一次。
4. **参考图**:选中 3 张图片 → 创建 → 模式为参考图,生成成功。
5. **刷新恢复**:生成中刷新页面 → 节点状态保持「生成中」并自动恢复轮询直至完成。
6. **取消**:发起任务后点「取消任务」→ 状态变「任务已取消」。
7. **转存确认**:`apps/examples/.cache/ai-videos/` 出现 `cgt-*.mp4`;`git status` 不显示缓存目录(已 ignore)。

- [ ] **Step 9.4: 最终提交(如有修复)**

```powershell
git status
git add -A
git commit -m "fix(examples): polish Seedance video node after end-to-end testing"
```
(若 9.1–9.3 没有产生新改动则跳过。)

---

## 完成定义

- 四种模式都能从画布发起并成功生成视频(9.3 实测)。
- 方舟视频转存本地,刷新后视频可继续播放。
- 无 key / 坏参数 / 任务失败 / 取消 / 过期都有明确的中文反馈。
- `yarn typecheck` 通过;`.cache` 不进 git;现有图片生成流程未受影响。
