import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'
import {
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'fs'
import type { ServerResponse } from 'http'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import react from '@vitejs/plugin-react'
import { Plugin, PluginOption, defineConfig, loadEnv } from 'vite'

/**
 * Plugin to enable SPA fallback for vite preview.
 * In dev mode, Vite handles SPA routing automatically.
 * In preview mode, we need to rewrite page-like URLs to /index.html
 * so the static file server (sirv) serves the SPA entry point.
 */
function spaFallbackPlugin(): Plugin {
	return {
		name: 'spa-fallback',
		configurePreviewServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = req.url || '/'
				const pathname = url.split('?')[0]
				const ext = path.extname(pathname)

				// If this looks like a page request (no file extension),
				// rewrite to index.html so sirv serves the SPA
				if (!ext) {
					req.url = '/index.html' + (url.includes('?') ? url.substring(url.indexOf('?')) : '')
				}
				next()
			})
		},
	}
}

const PR_NUMBER = process.env.VERCEL_GIT_PULL_REQUEST_ID

function getEnv() {
	if (!process.env.VERCEL_ENV) {
		return 'development'
	}
	if (PR_NUMBER !== undefined && PR_NUMBER !== '') {
		return 'preview'
	}
	if (process.env.VERCEL_ENV === 'production') {
		return 'production'
	}
	return 'canary'
}

const env = getEnv()
const DEFAULT_AI_BASE_URL = 'https://api.openai.com'
const DEFAULT_TEXT_MODEL = 'gpt-5.5'
const DEFAULT_IMAGE_MODEL = 'gpt-image-2'
const TEXT_MODEL_IDS = new Set(['gpt-5.5', 'deepseek-chat', 'deepseek-reasoner'])
const IMAGE_MODEL_IDS = new Set(['gpt-image-2', 'nanobanana', 'nanobanana-pro', 'nanobanana-2'])

const ARK_DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const DEFAULT_VIDEO_MODEL = 'doubao-seedance-2-0-260128'
const VIDEO_MODEL_IDS = new Set(['doubao-seedance-2-0-260128', 'doubao-seedance-2-0-fast-260128'])
const VIDEO_RESOLUTIONS = new Set(['480p', '720p', '1080p'])
const VIDEO_RATIOS = new Set(['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'])
const VIDEO_IMAGE_ROLES = new Set(['first_frame', 'last_frame', 'reference_image'])

// eslint-disable-next-line no-console
console.log('build env:', env)

function urlOrLocalFallback(mode: string, url: string | undefined, localFallbackPort: number) {
	if (url) {
		return JSON.stringify(url)
	}

	if (mode === 'development') {
		// in dev, vite lets us inline javascript expressions - so we return a template string that
		// will be evaluated on the client
		return '`http://${location.hostname}:' + localFallbackPort + '`'
	} else {
		// in production, we have to fall back to a hardcoded value
		return JSON.stringify(`http://localhost:${localFallbackPort}`)
	}
}

const TLDRAW_BEMO_URL_STRING =
	env === 'production'
		? 'https://demo.tldraw.xyz'
		: env === 'canary'
			? 'https://canary-demo.tldraw.xyz'
			: PR_NUMBER
				? `https://pr-${PR_NUMBER}-demo.tldraw.xyz`
				: undefined

export default defineConfig(({ mode }) => {
	const rootEnv = loadEnv(mode, path.join(__dirname, '../..'), '')
	const localEnv = loadEnv(mode, __dirname, '')
	Object.assign(process.env, rootEnv, localEnv)

	return {
		plugins: [spaFallbackPlugin(), aiStudioApiPlugin(), react(), exampleReadmePlugin()],
		root: path.join(__dirname, 'src'),
		publicDir: path.join(__dirname, 'public'),
		build: {
			outDir: path.join(__dirname, 'dist'),
			assetsInlineLimit: 0,
			target: 'es2022',
			minify: false,
		},
		oxc: {
			target: 'es2022',
		},
		server: {
			port: 5420,
			allowedHosts: true,
		},
		preview: {
			port: 5420,
		},
		clearScreen: false,
		optimizeDeps: {
			exclude: ['@tldraw/assets'],
		},
		define: {
			'process.env.TLDRAW_ENV': JSON.stringify(process.env.VERCEL_ENV ?? 'development'),
			'process.env.TLDRAW_DEPLOY_ID': JSON.stringify(
				process.env.VERCEL_GIT_COMMIT_SHA ?? `local-${Date.now()}`
			),
			'process.env.TLDRAW_BEMO_URL': urlOrLocalFallback(mode, TLDRAW_BEMO_URL_STRING, 8990),
			'process.env.TLDRAW_IMAGE_URL': urlOrLocalFallback(
				mode,
				env === 'development' ? undefined : 'https://images.tldraw.xyz',
				8786
			),
		},
	}
})

function aiStudioApiPlugin(): Plugin {
	return {
		name: 'ai-studio-api',
		configureServer(server) {
			server.middlewares.use('/api/auth/session', async (req, res) => {
				if (req.method !== 'GET') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				sendJson(res, 200, { user: getAuthSessionUser(req) })
			})

			server.middlewares.use('/api/auth/register', async (req, res) => {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				try {
					const body = await readJsonBody(req)
					const name = getString(body.name).trim()
					const email = normalizeEmail(getString(body.email))
					const password = getString(body.password)

					if (!name) {
						sendJson(res, 400, { error: 'Enter your name.' })
						return
					}
					if (!email.includes('@')) {
						sendJson(res, 400, { error: 'Enter a valid email.' })
						return
					}
					if (password.length < 6) {
						sendJson(res, 400, { error: 'Use at least 6 password characters.' })
						return
					}

					const store = readAuthStore()
					if (store.users.some((user) => user.email === email)) {
						sendJson(res, 409, { error: 'This email already has an account.' })
						return
					}

					const passwordSalt = randomBytes(16).toString('hex')
					const passwordHash = hashPassword(password, passwordSalt)
					store.users.push({
						email,
						name,
						passwordHash,
						passwordSalt,
						createdAt: new Date().toISOString(),
					})
					const session = createAuthSession(store, email)
					writeAuthStore(store)
					setAuthCookie(res, session.id)
					sendJson(res, 200, { user: { email, name } })
				} catch (err) {
					sendJson(res, 500, { error: getErrorMessage(err) })
				}
			})

			server.middlewares.use('/api/auth/login', async (req, res) => {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				try {
					const body = await readJsonBody(req)
					const email = normalizeEmail(getString(body.email))
					const password = getString(body.password)
					const store = readAuthStore()
					const user = store.users.find((candidate) => candidate.email === email)

					if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
						sendJson(res, 401, { error: 'Email or password is incorrect.' })
						return
					}

					const session = createAuthSession(store, email)
					writeAuthStore(store)
					setAuthCookie(res, session.id)
					sendJson(res, 200, { user: { email: user.email, name: user.name } })
				} catch (err) {
					sendJson(res, 500, { error: getErrorMessage(err) })
				}
			})

			server.middlewares.use('/api/auth/logout', async (req, res) => {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				const sessionId = getCookie(req, AUTH_COOKIE_NAME)
				if (sessionId) {
					const store = readAuthStore()
					store.sessions = store.sessions.filter((session) => session.id !== sessionId)
					writeAuthStore(store)
				}
				clearAuthCookie(res)
				sendJson(res, 200, { user: null })
			})

			server.middlewares.use('/api/ai-status', async (req, res) => {
				if (req.method !== 'GET') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				sendJson(res, 200, {
					provider: 'OpenAI-compatible',
					configured: Boolean(getAiApiKey()),
					baseUrl: getAiBaseUrl(),
					imageApiUrl: getImageApiUrl(),
					arkConfigured: Boolean(getArkApiKey()),
				})
			})

			server.middlewares.use('/api/ai-models', async (req, res) => {
				if (req.method !== 'GET') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				try {
					const authHeader = getAiAuthorizationHeader()
					if (!authHeader) {
						sendJson(res, 503, {
							error:
								'Image API key is not configured. Open the canvas interface settings and enter your API key.',
						})
						return
					}

					const models = await fetchGatewayModels(authHeader)
					sendJson(res, 200, filterGatewayModels(models))
				} catch (err) {
					const message = getErrorMessage(err)
					console.error('[ai-studio-api] Model discovery failed:', message)
					sendJson(res, 502, { error: message })
				}
			})

			server.middlewares.use('/api/ai-key', async (req, res) => {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				try {
					const body = await readJsonBody(req)
					const apiKey = getString(body.apiKey).trim()
					const existingApiKey = getAiApiKey()
					const nextApiKey = apiKey || existingApiKey
					const baseUrl = getString(body.baseUrl).trim()
					const normalizedBaseUrl = normalizeAiBaseUrl(baseUrl)

					if (!nextApiKey || !isValidAiApiKey(nextApiKey)) {
						sendJson(res, 400, { error: 'Enter a valid image API key.' })
						return
					}
					if (baseUrl && !normalizedBaseUrl) {
						sendJson(res, 400, { error: 'Enter a valid image gateway base URL.' })
						return
					}

					saveAiSettings(nextApiKey, normalizedBaseUrl)
					sendJson(res, 200, {
						provider: 'OpenAI-compatible',
						configured: true,
						baseUrl: getAiBaseUrl(),
					})
				} catch (err) {
					sendJson(res, 500, { error: getErrorMessage(err) })
				}
			})

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

			server.middlewares.use('/api/generate-image', async (req, res) => {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				try {
					const authHeader = getAiAuthorizationHeader()
					if (!authHeader) {
						sendJson(res, 503, {
							error:
								'Image API key is not configured. Open the canvas interface settings and enter your API key.',
						})
						return
					}

					const body = await readJsonBody(req)
					const prompt = getString(body.prompt).trim()
					const model = getString(body.model) || DEFAULT_IMAGE_MODEL
					const size = getString(body.size) || '1024x1024'
					const aspectRatio = getString(body.aspectRatio)
					const count = normalizeImageCount(body.count)
					const sourceImageUrl = getString(body.sourceImageUrl).trim()
					const sourceImageUrls = Array.isArray(body.sourceImageUrls)
						? body.sourceImageUrls.map((value: unknown) => getString(value).trim()).filter(Boolean)
						: sourceImageUrl
							? [sourceImageUrl]
							: []

					if (!prompt) {
						sendJson(res, 400, { error: 'Prompt is required.' })
						return
					}
					if (!isImageModelAllowed(model)) {
						sendJson(res, 400, { error: `Model ${model} is not allowed for image generation.` })
						return
					}

					const generationPrompt = appendImageGenerationConstraints(
						prompt,
						aspectRatio,
						sourceImageUrls.length > 0
					)
					const imageUrls = sourceImageUrls.length
						? await generateImageFromImage({
								authHeader,
								model,
								prompt: generationPrompt,
								size,
								count,
								sourceImageUrls,
							})
						: await generateImageFromText({
								authHeader,
								model,
								prompt: generationPrompt,
								size,
								count,
							})
					if (!imageUrls.length) {
						sendJson(res, 502, { error: 'The image API returned no image.' })
						return
					}

					sendJson(res, 200, {
						imageUrl: imageUrls[0],
						imageUrls,
						model,
						prompt,
						referenceCount: sourceImageUrls.length,
						imageCount: imageUrls.length,
					})
				} catch (err) {
					const message = getErrorMessage(err)
					console.error('[ai-studio-api] Image generation failed:', message)
					sendJson(res, 500, { error: message })
				}
			})

			server.middlewares.use('/api/analyze-image-prompt', async (req, res) => {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				try {
					const authHeader = getAiAuthorizationHeader()
					if (!authHeader) {
						sendJson(res, 503, {
							error:
								'Image API key is not configured. Open the canvas interface settings and enter your API key.',
						})
						return
					}

					const body = await readJsonBody(req)
					const model = getString(body.model) || DEFAULT_TEXT_MODEL
					const imageUrl = getString(body.imageUrl).trim()
					const imageTitle = getString(body.imageTitle).trim()
					const instruction =
						getString(body.instruction).trim() ||
						'请分析这张图片，并生成一个能够指导 AI 生成工具重新创作类似作品的文生图提示词。'

					if (!imageUrl) {
						sendJson(res, 400, { error: 'Image URL is required.' })
						return
					}
					if (!isTextModelAllowed(model)) {
						sendJson(res, 400, {
							error: `Model ${model} is not allowed for image prompt analysis.`,
						})
						return
					}

					const response = await fetchWithTimeout(
						getAiEndpoint('chat/completions'),
						{
							method: 'POST',
							headers: {
								Authorization: authHeader,
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({
								model,
								messages: [
									{
										role: 'system',
										content:
											'你是专业 AI 绘画提示词分析师。只输出可直接用于文生图的提示词，不要输出解释、标题、Markdown、列表或免责声明。',
									},
									{
										role: 'user',
										content: [
											{
												type: 'text',
												text: [
													instruction,
													imageTitle ? `图片名称：${imageTitle}` : '',
													'输出要求：主体内容、场景设定、风格类型、色彩色调、构图视角、附加细节都要融入一个紧凑短句提示词。',
												]
													.filter(Boolean)
													.join('\n'),
											},
											{ type: 'image_url', image_url: { url: imageUrl } },
										],
									},
								],
							}),
						},
						120_000
					)
					const responseText = await response.text()
					if (!response.ok) {
						const message = getAiErrorFromText(responseText)
						console.error('[ai-studio-api] Image prompt analysis failed:', message)
						sendJson(res, response.status, { error: message })
						return
					}

					const prompt = extractChatCompletionTextFromText(responseText)
						.replace(/^["'“”]+|["'“”]+$/g, '')
						.trim()
					sendJson(res, 200, { prompt, model })
				} catch (err) {
					const message = getErrorMessage(err)
					console.error('[ai-studio-api] Image prompt analysis failed:', message)
					sendJson(res, 500, { error: message })
				}
			})

			server.middlewares.use('/api/agent-chat', async (req, res) => {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}

				try {
					const authHeader = getAiAuthorizationHeader()
					if (!authHeader) {
						sendJson(res, 503, {
							error:
								'Image API key is not configured. Open the canvas interface settings and enter your API key.',
						})
						return
					}

					const body = await readJsonBody(req)
					const model = getString(body.model) || DEFAULT_TEXT_MODEL
					const messages = Array.isArray(body.messages) ? body.messages : []
					const latestUserContent = getLatestUserContent(messages)
					const canvasSummary = getString(body.canvasSummary)
					const referenceImages = Array.isArray(body.referenceImages)
						? body.referenceImages.map(stringifyAgentReferenceImage).filter(Boolean)
						: []
					const autoGenerate = body.autoGenerate !== false

					if (!isTextModelAllowed(model)) {
						sendJson(res, 400, { error: `Model ${model} is not allowed for text or agent chat.` })
						return
					}

					const chatMessages = [
						{
							role: 'system',
							content: [
								'You are a Lovart-like visual creation agent inside a Chinese infinite image canvas.',
								'You can inspect a text summary of the canvas, plan the next visual step, write an image prompt, and decide whether the app should generate an image.',
								'Do not expose hidden chain-of-thought. Provide only a concise visible thinking summary in Chinese.',
								'Return JSON only with this shape: {"reply":"中文回复","thinking":["高层思考摘要1","高层思考摘要2"],"action":"answer|create_prompt|generate_image","prompt":"用于图片生成的完整提示词","size":"1:1|3:4|4:3|16:9|9:16","count":1}.',
								'When the user asks for multiple images, set count to 2, 3, or 4. Do not ask the image model to create one collage.',
								'Use action "generate_image" when the user asks to create or continue an image. Use "create_prompt" when generation should wait. Use "answer" only for non-generation questions.',
								'Users attach image parameters from selected canvas image nodes. Treat attached referenceImages as the chosen visual references and write the prompt for multi-image reference generation.',
								'If no attached image parameters exist but selected image nodes exist in the canvas summary, assume selected images are visual references. If neither exists, write for text-to-image generation.',
								'Keep all user-facing text in Simplified Chinese.',
							].join('\n'),
						},
						...(canvasSummary
							? [
									{
										role: 'user',
										content: `Current canvas context:\n${canvasSummary}${
											referenceImages.length
												? `\nAttached image parameters:\n${referenceImages.join('\n')}`
												: ''
										}`,
									},
								]
							: []),
						...messages.map((message) => ({
							role: message.role === 'assistant' ? 'assistant' : 'user',
							content: getString(message.content),
						})),
					]

					const response = await fetch(getAiEndpoint('chat/completions'), {
						method: 'POST',
						headers: {
							Authorization: authHeader,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							model,
							messages: chatMessages,
						}),
					})

					const responseText = await response.text()
					if (!response.ok) {
						const message = getAiErrorFromText(responseText)
						console.error('[ai-studio-api] Agent chat failed:', message)
						sendJson(res, response.status, { error: message })
						return
					}

					sendJson(res, 200, {
						...parseAgentChatPlan(
							extractChatCompletionTextFromText(responseText),
							autoGenerate,
							latestUserContent,
							referenceImages
						),
						model,
					})
				} catch (err) {
					const message = getErrorMessage(err)
					console.error('[ai-studio-api] Agent chat failed:', message)
					sendJson(res, 500, { error: message })
				}
			})

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

					const contentLength = Number(req.headers['content-length'] || 0)
					if (contentLength > 70 * 1024 * 1024) {
						sendJson(res, 413, { error: '请求体超过 70MB 限制，请压缩参考图后重试。' })
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

					const firstFrameCount = images.filter((image) => image.role === 'first_frame').length
					const lastFrameCount = images.filter((image) => image.role === 'last_frame').length
					if (firstFrameCount > 1) {
						sendJson(res, 400, { error: '首帧参考图最多 1 张。' })
						return
					}
					if (lastFrameCount > 1) {
						sendJson(res, 400, { error: '尾帧参考图最多 1 张。' })
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
								getArkError(parseJsonSafely(responseText)) ||
								`取消任务失败（HTTP ${response.status}）`
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
				let fileSize = 0
				try {
					fileSize = statSync(filePath).size
				} catch {
					sendJson(res, 404, { error: '视频文件不存在。' })
					return
				}
				const rangeHeader = req.headers?.range
				res.setHeader('Accept-Ranges', 'bytes')
				res.setHeader('Content-Type', 'video/mp4')

				const rangeMatch =
					typeof rangeHeader === 'string' ? rangeHeader.match(/^bytes=(\d*)-(\d*)$/) : null
				if (rangeMatch && (rangeMatch[1] !== '' || rangeMatch[2] !== '')) {
					const start = rangeMatch[1]
						? Number(rangeMatch[1])
						: Math.max(0, fileSize - Number(rangeMatch[2]))
					const end =
						rangeMatch[1] && rangeMatch[2]
							? Math.min(Number(rangeMatch[2]), fileSize - 1)
							: fileSize - 1
					if (
						!Number.isFinite(start) ||
						!Number.isFinite(end) ||
						start > end ||
						start >= fileSize
					) {
						res.statusCode = 416
						res.setHeader('Content-Range', `bytes */${fileSize}`)
						res.end()
						return
					}
					res.statusCode = 206
					res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
					res.setHeader('Content-Length', String(end - start + 1))
					pipeVideoFileToResponse(filePath, res, { start, end })
					return
				}

				res.statusCode = 200
				res.setHeader('Content-Length', String(fileSize))
				pipeVideoFileToResponse(filePath, res)
			})
		},
	}
}

function exampleReadmePlugin(): PluginOption {
	return {
		name: 'example-readme',
		async transform(src, id) {
			const [filePath, query] = id.split('?')
			const isContentQuery = query?.split('&').includes('content')
			const match = filePath.match(/examples\/src\/examples\/(.+)\/README.md$/)
			if (!match) return

			const separator = '\n<hr>\n'
			const relativePath = match[1]
			const segments = relativePath.split('/')
			const slug = segments[segments.length - 1]
			const category = segments.slice(0, -1).join('/')
			if (!category) {
				throw new Error(`Example category folder missing for ${filePath}`)
			}
			const path = `/${slug}`
			const codeUrl = `https://github.com/tldraw/tldraw/tree/main/apps/examples/src/examples/${relativePath}`

			if (isContentQuery) {
				const remark = (await import('remark')).remark
				const remarkFrontmatter = (await import('remark-frontmatter')).default
				const remarkHtml = (await import('remark-html')).default
				const matter = (await import('vfile-matter')).matter

				const file = await remark()
					.use(remarkFrontmatter)
					.use(remarkHtml)
					.use(() => (_, file) => matter(file))
					.process(src)

				const parts = String(file).split(separator)
				const description = parts[0]
				const details = parts.slice(1).join(separator)

				const result = [
					`export const description = ${JSON.stringify(description)};`,
					`export const details = ${JSON.stringify(details)};`,
				]

				return result.join('\n')
			}

			const remark = (await import('remark')).remark
			const remarkFrontmatter = (await import('remark-frontmatter')).default
			const matter = (await import('vfile-matter')).matter

			const file = await remark()
				.use(remarkFrontmatter)
				.use(() => (_, file) => matter(file))
				.process(src)

			const frontmatter = parseFrontMatter(file.data.matter, filePath)

			const meta = {
				title: frontmatter.title,
				priority: frontmatter.priority,
				category,
				multiplayer: frontmatter.multiplayer,
				keywords: frontmatter.keywords,
				codeUrl,
				path,
			}

			const result = [
				`export const meta = ${JSON.stringify(meta)};`,
				`export const loadComponent = async () => {`,
				`    return (await import(${JSON.stringify(frontmatter.component)})).default;`,
				`};`,
				`export const loadContent = async () => {`,
				`    return await import(${JSON.stringify(filePath + '?content')});`,
				`};`,
			]

			return result.join('\n')
		},
	}
}

function parseFrontMatter(data: unknown, fileName: string) {
	if (!data || typeof data !== 'object') {
		throw new Error(`Frontmatter missing in ${fileName}`)
	}

	if (!('title' in data && typeof data.title === 'string')) {
		throw new Error(`Frontmatter key 'title' must be string in ${fileName}`)
	}

	if (!('component' in data && typeof data.component === 'string')) {
		throw new Error(`Frontmatter key 'component' must be string in ${fileName}`)
	}

	const priority = 'priority' in data ? data.priority : 999999
	if (typeof priority !== 'number') {
		throw new Error(`Frontmatter key 'priority' must be number in ${fileName}`)
	}

	const keywords = 'keywords' in data ? data.keywords : []
	if (!Array.isArray(keywords)) {
		throw new Error(`Frontmatter key 'keywords' must be array in ${fileName}`)
	}

	const multiplayer = 'multiplayer' in data ? data.multiplayer : false
	if (typeof multiplayer !== 'boolean') {
		throw new Error(`Frontmatter key 'multiplayer' must be boolean in ${fileName}`)
	}

	return {
		title: data.title,
		component: data.component,
		priority,
		keywords,
		multiplayer,
	}
}

async function readJsonBody(req: { on(event: string, handler: (chunk: Buffer) => void): void }) {
	const chunks: Buffer[] = []
	await new Promise<void>((resolve, reject) => {
		req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
		req.on('end', resolve)
		req.on('error', reject)
	})
	const raw = Buffer.concat(chunks).toString('utf8')
	return raw ? JSON.parse(raw) : {}
}

function sendJson(
	res: {
		statusCode: number
		setHeader(name: string, value: string): void
		end(body: string): void
	},
	statusCode: number,
	payload: unknown
) {
	res.statusCode = statusCode
	res.setHeader('Content-Type', 'application/json')
	res.end(JSON.stringify(payload))
}

const AUTH_COOKIE_NAME = 'tldraw_ai_studio_session'

interface AuthUserRecord {
	email: string
	name: string
	passwordHash: string
	passwordSalt: string
	createdAt: string
}

interface AuthSessionRecord {
	id: string
	email: string
	createdAt: string
	expiresAt: string
}

interface AuthStore {
	users: AuthUserRecord[]
	sessions: AuthSessionRecord[]
}

function getAuthStorePath() {
	return path.join(__dirname, '.local-auth', 'auth-store.json')
}

function readAuthStore(): AuthStore {
	try {
		const storePath = getAuthStorePath()
		if (!existsSync(storePath)) return { users: [], sessions: [] }
		const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as Partial<AuthStore>
		return {
			users: Array.isArray(parsed.users) ? parsed.users : [],
			sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
		}
	} catch {
		return { users: [], sessions: [] }
	}
}

function writeAuthStore(store: AuthStore) {
	const storePath = getAuthStorePath()
	mkdirSync(path.dirname(storePath), { recursive: true })
	writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`)
}

function createAuthSession(store: AuthStore, email: string) {
	const now = Date.now()
	const session = {
		id: randomBytes(32).toString('hex'),
		email,
		createdAt: new Date(now).toISOString(),
		expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
	}
	store.sessions = store.sessions.filter(
		(candidate) => new Date(candidate.expiresAt).getTime() > now && candidate.email !== email
	)
	store.sessions.push(session)
	return session
}

function getAuthSessionUser(req: { headers?: { cookie?: string } }) {
	const sessionId = getCookie(req, AUTH_COOKIE_NAME)
	if (!sessionId) return null

	const now = Date.now()
	const store = readAuthStore()
	const session = store.sessions.find((candidate) => candidate.id === sessionId)
	if (!session || new Date(session.expiresAt).getTime() <= now) {
		if (session) {
			store.sessions = store.sessions.filter((candidate) => candidate.id !== sessionId)
			writeAuthStore(store)
		}
		return null
	}
	const user = store.users.find((candidate) => candidate.email === session.email)
	return user ? { email: user.email, name: user.name } : null
}

function hashPassword(password: string, salt: string) {
	return pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex')
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
	const actual = Buffer.from(hashPassword(password, salt), 'hex')
	const expected = Buffer.from(expectedHash, 'hex')
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function normalizeEmail(email: string) {
	return email.trim().toLowerCase()
}

function getCookie(req: { headers?: { cookie?: string } }, name: string) {
	const cookies = req.headers?.cookie?.split(';') ?? []
	for (const cookie of cookies) {
		const [rawName, ...rawValue] = cookie.trim().split('=')
		if (rawName === name) return decodeURIComponent(rawValue.join('='))
	}
	return null
}

function setAuthCookie(res: { setHeader(name: string, value: string): void }, sessionId: string) {
	res.setHeader(
		'Set-Cookie',
		`${AUTH_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
	)
}

function clearAuthCookie(res: { setHeader(name: string, value: string): void }) {
	res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

function getAiApiKey() {
	return (
		process.env.IMAGE_API_KEY ||
		process.env.IMAGE_GATEWAY_API_KEY ||
		process.env.API_KEY ||
		process.env.OPENAI_API_KEY
	)
}

function getAiAuthorizationHeader() {
	const apiKey = getAiApiKey()?.trim()
	if (!apiKey) return ''
	return apiKey.toLowerCase().startsWith('bearer ') ? apiKey : `Bearer ${apiKey}`
}

function getAiBaseUrl() {
	return getImageGatewayBaseUrl() || inferGatewayBaseUrlFromImageApiUrl() || DEFAULT_AI_BASE_URL
}

function getImageGatewayBaseUrl() {
	return normalizeAiBaseUrl(
		process.env.IMAGE_GATEWAY_BASE_URL || process.env.API_BASE_URL || process.env.OPENAI_BASE_URL
	)
}

function getImageApiUrl() {
	return normalizeAiBaseUrl(process.env.IMAGE_API_URL)
}

function inferGatewayBaseUrlFromImageApiUrl() {
	const imageApiUrl = getImageApiUrl()
	if (!imageApiUrl) return ''

	try {
		const url = new URL(imageApiUrl)
		const v1Index = url.pathname.indexOf('/v1/')
		if (v1Index >= 0) {
			url.pathname = url.pathname.slice(0, v1Index)
			url.search = ''
			url.hash = ''
			return url.toString().replace(/\/+$/, '')
		}
		return `${url.protocol}//${url.host}`
	} catch {
		return ''
	}
}

function normalizeAiBaseUrl(value: string | undefined) {
	const trimmed = value?.trim()
	if (!trimmed) return ''

	try {
		const url = new URL(trimmed)
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
		return trimmed.replace(/\/+$/, '')
	} catch {
		return ''
	}
}

function getAiEndpoint(pathname: string) {
	const baseUrl = getAiBaseUrl().replace(/\/+$/, '')
	const versionedBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`
	return `${versionedBaseUrl}/${pathname.replace(/^\/?(v1\/)?/, '')}`
}

function getImageGenerationEndpoint() {
	return getImageApiUrl() || getAiEndpoint('images/generations')
}

function isValidAiApiKey(value: string) {
	const token = value.replace(/^Bearer\s+/i, '').trim()
	return token.length >= 12 && !/\s/.test(token)
}

function saveAiSettings(apiKey: string, baseUrl: string) {
	const envPath = path.join(__dirname, '.env.local')
	const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : []
	let foundApiKey = false
	let foundBaseUrl = false
	const nextLines = lines.flatMap((line) => {
		if (/^(IMAGE_API_KEY|IMAGE_GATEWAY_API_KEY|API_KEY|OPENAI_API_KEY)=/.test(line)) {
			foundApiKey = true
			return line.startsWith('IMAGE_API_KEY=') ? [`IMAGE_API_KEY=${apiKey}`] : []
		}
		if (/^(IMAGE_GATEWAY_BASE_URL|API_BASE_URL|OPENAI_BASE_URL)=/.test(line)) {
			foundBaseUrl = true
			return line.startsWith('IMAGE_GATEWAY_BASE_URL=') && baseUrl
				? [`IMAGE_GATEWAY_BASE_URL=${baseUrl}`]
				: []
		}
		return [line]
	})

	if (!foundApiKey) nextLines.push(`IMAGE_API_KEY=${apiKey}`)
	if (baseUrl && !foundBaseUrl) nextLines.push(`IMAGE_GATEWAY_BASE_URL=${baseUrl}`)
	writeFileSync(
		envPath,
		`${nextLines.filter((line, index) => line || index < nextLines.length - 1).join('\n')}\n`
	)
	process.env.IMAGE_API_KEY = apiKey
	delete process.env.IMAGE_GATEWAY_API_KEY
	delete process.env.API_KEY
	delete process.env.OPENAI_API_KEY
	if (baseUrl) {
		process.env.IMAGE_GATEWAY_BASE_URL = baseUrl
	} else {
		delete process.env.IMAGE_GATEWAY_BASE_URL
	}
}

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
	writeFileSync(
		envPath,
		`${nextLines.filter((line, index) => line || index < nextLines.length - 1).join('\n')}\n`
	)
	process.env.ARK_API_KEY = apiKey
	if (baseUrl) {
		process.env.ARK_BASE_URL = baseUrl
	} else {
		delete process.env.ARK_BASE_URL
	}
}

function normalizeVideoDuration(value: unknown): number | null {
	if (value === null || value === undefined) return 5
	if (typeof value !== 'number' && typeof value !== 'string') return null
	const duration = Number(value)
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
	if (!response.body) {
		throw new Error('视频内容为空。')
	}
	mkdirSync(getVideoCacheDir(), { recursive: true })
	const tmpPath = `${localPath}.tmp`
	try {
		await pipeline(Readable.fromWeb(response.body as any), createWriteStream(tmpPath))
		if (!statSync(tmpPath).size) {
			throw new Error('视频内容为空。')
		}
		renameSync(tmpPath, localPath)
	} catch (err) {
		try {
			unlinkSync(tmpPath)
		} catch {
			// best-effort cleanup
		}
		throw err
	}
}

function pipeVideoFileToResponse(
	filePath: string,
	res: ServerResponse,
	options?: { start: number; end: number }
) {
	const stream = options ? createReadStream(filePath, options) : createReadStream(filePath)
	stream.on('error', (err) => {
		if (res.headersSent) {
			res.destroy(err instanceof Error ? err : new Error(String(err)))
			return
		}
		res.removeHeader('Content-Length')
		res.removeHeader('Content-Range')
		sendJson(res, 500, { error: getErrorMessage(err) })
	})
	stream.pipe(res)
}

function getString(value: unknown) {
	return typeof value === 'string' ? value : ''
}

function stringifyAgentReferenceImage(value: unknown) {
	if (typeof value === 'string') return value.trim()
	if (!value || typeof value !== 'object') return ''
	const image = value as {
		id?: unknown
		label?: unknown
		token?: unknown
		title?: unknown
		naturalWidth?: unknown
		naturalHeight?: unknown
		prompt?: unknown
	}
	const label = getString(image.label || image.token).trim()
	const title = getString(image.title).trim()
	const id = getString(image.id).trim()
	const width = Number(image.naturalWidth) || 0
	const height = Number(image.naturalHeight) || 0
	const prompt = getString(image.prompt).trim()
	const name = label || title || id
	if (!name) return ''
	return [
		name,
		width && height ? `size ${width}x${height}` : '',
		title && title !== name ? `title ${title}` : '',
		prompt ? `source prompt ${prompt.slice(0, 800)}` : '',
	]
		.filter(Boolean)
		.join(' | ')
}

function getLatestUserContent(messages: any[]) {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index]
		if (message?.role !== 'assistant') {
			const content = getString(message?.content).trim()
			if (content) return content
		}
	}
	return ''
}

function normalizeImageCount(value: unknown) {
	const count = Number(value)
	if (!Number.isFinite(count)) return 1
	return Math.min(4, Math.max(1, Math.round(count)))
}

function appendImageGenerationConstraints(
	prompt: string,
	aspectRatio: string,
	hasReferenceImages: boolean
) {
	const constraints: string[] = []
	if (aspectRatio === '16:9') {
		constraints.push(
			'Final output must be a true 16:9 landscape image canvas. Do not return a square image or square composition. Fill the wide 16:9 frame with the requested content.'
		)
	}
	if (hasReferenceImages) {
		constraints.push(
			'If the reference image contains red hand-drawn marks, red labels, or annotation numbers, treat them as editing instructions only. Never reproduce those red annotations, labels, numbers, UI elements, or markups in the final image.'
		)
	}
	return constraints.length ? `${prompt}\n\n${constraints.join('\n')}` : prompt
}

function createStandaloneImagePrompts(prompt: string, count: number) {
	const normalizedCount = normalizeImageCount(count)
	return Array.from({ length: normalizedCount }, (_, index) => {
		if (normalizedCount <= 1) return prompt
		return [
			prompt,
			`Create standalone image ${index + 1} of ${normalizedCount}.`,
			'Return only this one image. Do not create a collage, grid, contact sheet, split-frame image, or combined set.',
			'Make this version visually distinct from the other requested versions while preserving the user request.',
		].join('\n\n')
	})
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 180_000) {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), timeoutMs)
	try {
		return await fetch(url, { ...init, signal: controller.signal })
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error(`Image API request timed out after ${Math.round(timeoutMs / 1000)} seconds.`)
		}
		throw err
	} finally {
		clearTimeout(timeout)
	}
}

async function fetchGatewayModels(authHeader: string) {
	const response = await fetch(getAiEndpoint('models'), {
		method: 'GET',
		headers: { Authorization: authHeader },
	})
	const data = await response.json()
	if (!response.ok) {
		throw new Error(getAiError(data))
	}
	return Array.isArray(data?.data)
		? data.data.map((model: any) => getString(model.id)).filter(Boolean)
		: []
}

function filterGatewayModels(modelIds: string[]) {
	const textModels = modelIds.filter(isTextModelAllowed).map(toModelOption)
	const imageModels = modelIds.filter(isImageModelAllowed).map(toModelOption)
	return {
		textModels: textModels.length ? textModels : [toModelOption(DEFAULT_TEXT_MODEL)],
		imageModels: imageModels.length ? imageModels : [toModelOption(DEFAULT_IMAGE_MODEL)],
	}
}

function toModelOption(id: string) {
	return { id, label: id }
}

function isTextModelAllowed(model: string) {
	return TEXT_MODEL_IDS.has(model) || model.startsWith('deepseek-v4-')
}

function isImageModelAllowed(model: string) {
	return isStandardImageModel(model) || isNanoBananaModel(model)
}

function isStandardImageModel(model: string) {
	return model === 'gpt-image-2' || (model.includes('image') && !isTextModelAllowed(model))
}

function isNanoBananaModel(model: string) {
	return IMAGE_MODEL_IDS.has(model) || model.startsWith('nanobanana-')
}

async function generateImageFromText({
	authHeader,
	model,
	prompt,
	size,
	count,
}: {
	authHeader: string
	model: string
	prompt: string
	size: string
	count: number
}) {
	const prompts = createStandaloneImagePrompts(prompt, count)
	const urls = await Promise.all(
		prompts.map((standalonePrompt) =>
			generateSingleImageFromText({ authHeader, model, prompt: standalonePrompt, size })
		)
	)
	return uniqueStrings(urls.flat()).slice(0, count)
}

async function generateSingleImageFromText({
	authHeader,
	model,
	prompt,
	size,
}: {
	authHeader: string
	model: string
	prompt: string
	size: string
}) {
	const response = await fetchWithTimeout(getImageGenerationEndpoint(), {
		method: 'POST',
		headers: {
			Authorization: authHeader,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model,
			prompt,
			n: 1,
			size,
		}),
	})
	const data = await response.json()
	if (!response.ok) {
		throw new Error(getAiError(data))
	}
	return extractImageResponseUrls(data)
}

async function generateImageFromImage({
	authHeader,
	model,
	prompt,
	size,
	count,
	sourceImageUrls,
}: {
	authHeader: string
	model: string
	prompt: string
	size: string
	count: number
	sourceImageUrls: string[]
}) {
	const prompts = createStandaloneImagePrompts(prompt, count)
	const urls = await Promise.all(
		prompts.map((standalonePrompt) =>
			generateSingleImageFromImage({
				authHeader,
				model,
				prompt: standalonePrompt,
				size,
				sourceImageUrls,
			})
		)
	)
	return uniqueStrings(urls.flat()).slice(0, count)
}

async function generateSingleImageFromImage({
	authHeader,
	model,
	prompt,
	size,
	sourceImageUrls,
}: {
	authHeader: string
	model: string
	prompt: string
	size: string
	sourceImageUrls: string[]
}) {
	if (isNanoBananaModel(model)) {
		return generateNanoBananaImageEdit({ authHeader, model, prompt, sourceImageUrls })
	}
	try {
		return await generateMultipartImageEdit({
			authHeader,
			model,
			prompt,
			size,
			sourceImageUrls,
			imageFieldName: 'image',
		})
	} catch (err) {
		const message = getErrorMessage(err)
		if (!message.toLowerCase().includes('image')) throw err
		console.error('[ai-studio-api] Retrying image edit with image[] field:', message)
		return generateMultipartImageEdit({
			authHeader,
			model,
			prompt,
			size,
			sourceImageUrls,
			imageFieldName: 'image[]',
		})
	}
}

async function generateMultipartImageEdit({
	authHeader,
	model,
	prompt,
	size,
	sourceImageUrls,
	imageFieldName,
}: {
	authHeader: string
	model: string
	prompt: string
	size: string
	sourceImageUrls: string[]
	imageFieldName: 'image' | 'image[]'
}) {
	const imageBlobs = await Promise.all(
		sourceImageUrls.map((sourceImageUrl) => imageSourceToBlob(sourceImageUrl))
	)
	const formData = new FormData()
	formData.append('model', model)
	formData.append('prompt', prompt)
	imageBlobs.forEach((imageBlob, index) => {
		formData.append(imageFieldName, imageBlob, `input-${index + 1}.png`)
	})
	formData.append('n', '1')
	formData.append('size', size)
	formData.append('response_format', 'b64_json')

	const response = await fetchWithTimeout(getAiEndpoint('images/edits'), {
		method: 'POST',
		headers: { Authorization: authHeader },
		body: formData,
	})
	const data = await response.json()
	if (!response.ok) {
		throw new Error(getAiError(data))
	}
	return extractImageResponseUrls(data)
}

async function generateNanoBananaImageEdit({
	authHeader,
	model,
	prompt,
	sourceImageUrls,
}: {
	authHeader: string
	model: string
	prompt: string
	sourceImageUrls: string[]
}) {
	const imageUrls = await Promise.all(
		sourceImageUrls.map((sourceImageUrl) =>
			sourceImageUrl.startsWith('data:image/') ? sourceImageUrl : resourceToDataUrl(sourceImageUrl)
		)
	)
	const response = await fetchWithTimeout(getAiEndpoint('chat/completions'), {
		method: 'POST',
		headers: {
			Authorization: authHeader,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: prompt },
						...imageUrls.map((imageUrl) => ({ type: 'image_url', image_url: { url: imageUrl } })),
					],
				},
			],
		}),
	})
	const responseText = await response.text()
	if (!response.ok) {
		throw new Error(getAiErrorFromText(responseText))
	}
	return extractImagesFromText(extractChatCompletionTextFromText(responseText))
}

async function imageSourceToBlob(sourceImageUrl: string) {
	if (sourceImageUrl.startsWith('data:')) {
		const match = sourceImageUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/)
		if (!match) throw new Error('Selected image has an invalid data URL.')
		const mimeType = match[1] || 'image/png'
		const isBase64 = Boolean(match[2])
		const payload = match[3] || ''
		const bytes = isBase64
			? Buffer.from(payload, 'base64')
			: Buffer.from(decodeURIComponent(payload), 'utf8')
		return new Blob([bytes], { type: mimeType })
	}

	const response = await fetch(sourceImageUrl)
	if (!response.ok) throw new Error(`Could not read selected image: ${response.status}`)
	return response.blob()
}

async function resourceToDataUrl(sourceImageUrl: string) {
	const blob = await imageSourceToBlob(sourceImageUrl)
	const buffer = Buffer.from(await blob.arrayBuffer())
	return `data:${blob.type || 'image/png'};base64,${buffer.toString('base64')}`
}

function extractImageResponseUrls(data: any) {
	const results = Array.isArray(data?.data) ? data.data : []
	return uniqueStrings(
		results
			.map((result: any) => {
				const url = getString(result?.url).trim()
				if (url) return url
				const b64 = getString(result?.b64_json).trim()
				return b64 ? `data:image/png;base64,${b64}` : ''
			})
			.filter(Boolean)
	)
}

function extractImagesFromText(value: string) {
	const dataUrls = value.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/g) || []
	if (dataUrls.length) return uniqueStrings(dataUrls)

	const markdownUrls = Array.from(value.matchAll(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/g)).map(
		(match) => match[1]
	)
	if (markdownUrls.length) return uniqueStrings(markdownUrls)

	const plainUrls = (value.match(/https?:\/\/\S+/g) || []).map((url) =>
		url.replace(/[)\].,]+$/, '')
	)
	return uniqueStrings(plainUrls)
}

function uniqueStrings(values: string[]) {
	return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function getAiError(data: unknown) {
	if (data && typeof data === 'object' && 'error' in data) {
		const error = (
			data as { error?: { message?: string; type?: string; param?: string; code?: string } }
		).error
		if (typeof error?.message === 'string') return error.message
	}
	return 'OpenAI-compatible API request failed.'
}

function getErrorMessage(err: unknown) {
	return err instanceof Error ? err.message : 'Unexpected server error.'
}

function extractChatCompletionText(data: any) {
	return getString(data?.choices?.[0]?.message?.content).trim()
}

function extractChatCompletionTextFromText(responseText: string) {
	const parsed = parseJsonMaybe(responseText)
	if (parsed) return extractChatCompletionText(parsed)

	const chunks = parseSseDataLines(responseText)
	if (!chunks.length) return responseText.trim()

	const content = chunks
		.map((chunk) => {
			const choice = chunk?.choices?.[0]
			return getString(choice?.delta?.content) || getString(choice?.message?.content)
		})
		.join('')
		.trim()
	return content
}

function getAiErrorFromText(responseText: string) {
	const parsed = parseJsonMaybe(responseText)
	if (parsed) return getAiError(parsed)

	for (const chunk of parseSseDataLines(responseText)) {
		const message = getAiError(chunk)
		if (message !== 'OpenAI-compatible API request failed.') return message
	}

	const text = responseText.replace(/^data:\s*/gm, '').trim()
	return text || 'OpenAI-compatible API request failed.'
}

function parseJsonMaybe(value: string) {
	const trimmed = value.trim()
	if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null
	try {
		return JSON.parse(trimmed)
	} catch {
		return null
	}
}

function parseSseDataLines(value: string) {
	const chunks: any[] = []
	for (const line of value.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed.startsWith('data:')) continue
		const payload = trimmed.slice(5).trim()
		if (!payload || payload === '[DONE]') continue
		const parsed = parseJsonMaybe(payload)
		if (parsed) chunks.push(parsed)
	}
	return chunks
}

function parseAgentChatPlan(
	content: string,
	autoGenerate: boolean,
	userRequest = '',
	referenceImages: string[] = []
) {
	const fallback = createFallbackAgentPlan(userRequest, referenceImages, autoGenerate, content)
	const trimmed = content.trim()
	if (!trimmed || trimmed === 'The agent returned an empty response.') return fallback

	const jsonText = extractJsonObjectText(content)
	if (!jsonText) return fallback

	try {
		const data = JSON.parse(jsonText)
		const prompt = getString(data.prompt || data.imagePrompt).trim()
		let action = normalizeAgentAction(getString(data.action), prompt, autoGenerate)
		if (!autoGenerate && action === 'generate_image') action = 'create_prompt'
		if (
			!prompt &&
			action === 'answer' &&
			fallback.prompt &&
			shouldRequestGenerateImage(userRequest)
		) {
			return fallback
		}
		const thinking = Array.isArray(data.thinking)
			? data.thinking
					.map((item: unknown) => getString(item).trim())
					.filter(Boolean)
					.slice(0, 5)
			: []
		return {
			message: getString(data.reply || data.message).trim() || content,
			thinking: thinking.length ? thinking : fallback.thinking,
			action,
			prompt,
			size: normalizeAgentSize(getString(data.size || data.aspectRatio)),
			count: normalizeImageCount(
				data.count || data.n || inferImageCount(`${prompt} ${content} ${userRequest}`)
			),
		}
	} catch {
		return fallback
	}
}

function createFallbackAgentPlan(
	userRequest: string,
	referenceImages: string[],
	autoGenerate: boolean,
	modelContent: string
) {
	const count = inferImageCount(userRequest)
	const prompt = createFallbackImagePrompt(userRequest, referenceImages, count)
	const shouldGenerate =
		shouldRequestGenerateImage(userRequest) || Boolean(referenceImages.length && prompt)
	return {
		message: prompt
			? '模型这次没有返回有效内容，我已根据你的请求和引用图生成可执行提示词。'
			: modelContent || '模型这次没有返回有效内容，请补充生成目标后重试。',
		thinking: ['读取当前画布和引用图', '根据用户原始需求生成兜底提示词'],
		action:
			prompt && shouldGenerate ? (autoGenerate ? 'generate_image' : 'create_prompt') : 'answer',
		prompt,
		size: inferAspectRatioFromText(userRequest),
		count,
	}
}

function createFallbackImagePrompt(userRequest: string, referenceImages: string[], count: number) {
	const request = userRequest.replace(/\s+/g, ' ').trim()
	if (!request) return ''
	const references = referenceImages
		.map((item) => item.split('|')[0]?.trim())
		.filter(Boolean)
		.join('、')
	const referenceText = references
		? `参考 ${references} 的主体风格、构图、比例、材质细节与整体视觉气质。`
		: ''
	const countText =
		count > 1 ? `生成 ${count} 张彼此独立的图片，每张是单独作品，不要拼图、网格、分屏或合集。` : ''
	return [
		referenceText,
		request,
		countText,
		'画面要完整、清晰、精致，不添加文字、水印、边框或 UI 元素。',
	]
		.filter(Boolean)
		.join(' ')
}

function shouldRequestGenerateImage(value: string) {
	return /生成|出图|重绘|改图|变体|配色|图片|画面|海报|封面|create|generate|image/i.test(value)
}

function inferImageCount(value: string) {
	const digitMatch = value.match(/([1-4])\s*(张|幅|个|版|种)/)
	if (digitMatch) return normalizeImageCount(digitMatch[1])
	if (/两\s*(张|幅|个|版|种)|二\s*(张|幅|个|版|种)/.test(value)) return 2
	if (/三\s*(张|幅|个|版|种)/.test(value)) return 3
	if (/四\s*(张|幅|个|版|种)/.test(value)) return 4
	return 1
}

function inferAspectRatioFromText(value: string) {
	if (/9:16|竖版|竖图|手机|portrait/i.test(value)) return '9:16'
	if (/16:9|横版|宽屏|landscape/i.test(value)) return '16:9'
	if (/3:4/.test(value)) return '3:4'
	if (/4:3/.test(value)) return '4:3'
	if (/1:1|方图|头像|square/i.test(value)) return '1:1'
	return '3:4'
}

function extractJsonObjectText(content: string) {
	const trimmed = content.trim()
	if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed

	const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
	if (codeFenceMatch?.[1]) {
		const fenced = codeFenceMatch[1].trim()
		if (fenced.startsWith('{') && fenced.endsWith('}')) return fenced
	}

	const start = trimmed.indexOf('{')
	const end = trimmed.lastIndexOf('}')
	return start >= 0 && end > start ? trimmed.slice(start, end + 1) : ''
}

function normalizeAgentAction(value: string, prompt: string, autoGenerate: boolean) {
	if (value === 'answer' || value === 'create_prompt' || value === 'generate_image') return value
	if (!prompt) return 'answer'
	return autoGenerate ? 'generate_image' : 'create_prompt'
}

function normalizeAgentSize(value: string) {
	return ['1:1', '3:4', '4:3', '16:9', '9:16'].includes(value) ? value : '1:1'
}
