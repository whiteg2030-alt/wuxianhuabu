import {
	DragEvent as ReactDragEvent,
	FormEvent,
	MouseEvent as ReactMouseEvent,
	PointerEvent as ReactPointerEvent,
	WheelEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import './ai-canvas-agent.css'

type CanvasNodeType = 'image' | 'prompt' | 'text' | 'doodle' | 'video'
type PromptStatus = 'idle' | 'generating' | 'done' | 'error'
type ApiStatus = 'checking' | 'ready' | 'missing'
type AspectRatioId = '1:1' | '3:4' | '4:3' | '16:9' | '9:16'
type AgentAction = 'answer' | 'create_prompt' | 'generate_image'
type WorkflowPresetId =
	| 'six-view'
	| 'prompt-analysis'
	| 'lighting-contact-sheet'
	| 'motion-transfer'
type ToolbarTool = 'select' | 'text' | 'annotate'
type ImageSelectionRole = 'identity' | 'motion'
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

interface Point {
	x: number
	y: number
}

interface Rect {
	x: number
	y: number
	w: number
	h: number
}

interface BaseNode {
	id: string
	type: CanvasNodeType
	x: number
	y: number
}

interface ImageNode extends BaseNode {
	type: 'image'
	title: string
	imageUrl: string
	fileName: string
	mimeType: string
	naturalWidth: number
	naturalHeight: number
	displayWidth: number
	displayHeight: number
	prompt?: string
	annotations?: string[]
	annotationNote?: string
	targetAspectRatio?: AspectRatioId
}

interface PromptNode extends BaseNode {
	type: 'prompt'
	prompt: string
	size: AspectRatioId
	count: number
	status: PromptStatus
	sourceImageId: string
	sourceImageIds?: string[]
	width?: number
	height?: number
	presetId?: WorkflowPresetId
	presetTitle?: string
	error?: string
}

interface TextNode extends BaseNode {
	type: 'text'
	text: string
	width: number
	height: number
}

interface DoodleNode extends BaseNode {
	type: 'doodle'
	title: string
	width: number
	height: number
	paths: string[]
}

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

type CanvasNode = ImageNode | PromptNode | TextNode | DoodleNode | VideoNode

interface CanvasEdge {
	id: string
	from: string
	to: string
}

interface DraftConnection {
	fromNodeId: string
	from: Point
	to: Point
}

interface GenerationMenu {
	fromNodeId: string
	canvasPoint: Point
	screenPoint: Point
}

interface QuickActionMenu {
	canvasPoint: Point
	screenPoint: Point
}

interface DragState {
	nodeIds: string[]
	startPoint: Point
	initialPositions: Record<string, Point>
}

interface PanState {
	start: Point
	origin: Point
}

interface SelectionBox {
	startCanvas: Point
	currentCanvas: Point
	startScreen: Point
	currentScreen: Point
}

interface TransformState {
	x: number
	y: number
	zoom: number
}

interface GeneratedImageResponse {
	imageUrl?: string
	imageUrls?: string[]
	model?: string
	prompt?: string
	referenceCount?: number
	imageCount?: number
	error?: string
}

interface HistoryItem {
	id: string
	nodeId: string
	kind: 'uploaded' | 'generated'
	title: string
	imageUrl: string
	fileName: string
	mimeType: string
	naturalWidth: number
	naturalHeight: number
	displayWidth: number
	displayHeight: number
	prompt?: string
	size?: AspectRatioId
	model?: string
	sourceImageIds?: string[]
	createdAt: string
}

interface PersistedCanvasState {
	version: 1
	nodes: CanvasNode[]
	edges: CanvasEdge[]
	transform: TransformState
	historyItems: HistoryItem[]
	nodeCounter: number
	edgeCounter: number
}

interface ApiStatusResponse {
	configured?: boolean
	arkConfigured?: boolean
	baseUrl?: string
	imageApiUrl?: string
	error?: string
}

interface ModelOption {
	id: string
	label: string
}

interface PromptLibraryPreset {
	id: string
	title: string
	category: string
	description: string
	prompt: string
}

interface AiModelsResponse {
	textModels?: ModelOption[]
	imageModels?: ModelOption[]
	error?: string
}

interface AgentMessage {
	id: string
	role: 'user' | 'assistant'
	content: string
	thinking?: string[]
	prompt?: string
	size?: AspectRatioId
	references?: string[]
	referenceImages?: AgentImageReference[]
	action?: AgentAction
	status?: 'thinking' | 'done' | 'error'
}

interface AgentImageReference {
	id: string
	label: string
	title: string
	imageUrl: string
	naturalWidth: number
	naturalHeight: number
	prompt?: string
}

interface AgentChatResponse {
	message?: string
	thinking?: string[]
	action?: AgentAction
	prompt?: string
	size?: AspectRatioId
	count?: number
	model?: string
	error?: string
}

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

interface ImagePromptAnalysisResponse {
	prompt?: string
	model?: string
	error?: string
}

const IMAGE_NODE_PADDING = 12
const IMAGE_NODE_HEADER_HEIGHT = 28
const IMAGE_NODE_FOOTER_HEIGHT = 34
const IMAGE_NODE_GAP_TOP = 8
const IMAGE_NODE_GAP_BOTTOM = 10
const PROMPT_NODE_WIDTH = 360
const PROMPT_NODE_HEIGHT = 336
const PROMPT_NODE_MIN_HEIGHT = 320
const NODE_GAP = 140
const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
const STARTER_IMAGE_WIDTH = 900
const STARTER_IMAGE_HEIGHT = 700
const MIN_IMAGE_NODE_WIDTH = 360
const MIN_IMAGE_DISPLAY_WIDTH = 336
const MAX_IMAGE_DISPLAY_WIDTH = 440
const MAX_IMAGE_DISPLAY_HEIGHT = 340
const BLANK_IMAGE_WIDTH = 768
const BLANK_IMAGE_HEIGHT = 432
const MAX_GENERATION_COUNT = 4
const CANVAS_STORAGE_KEY = 'tap-ai-canvas-state'
const HISTORY_LIMIT = 80
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

const DEFAULT_IMAGE_MODELS: ModelOption[] = [
	{ id: 'gpt-image-2', label: 'gpt-image-2' },
	{ id: 'nanobanana', label: 'nanobanana' },
	{ id: 'nanobanana-pro', label: 'nanobanana-pro' },
	{ id: 'nanobanana-2', label: 'nanobanana-2' },
]

const DEFAULT_TEXT_MODELS: ModelOption[] = [
	{ id: 'gpt-5.5', label: 'gpt-5.5' },
	{ id: 'deepseek-chat', label: 'deepseek-chat' },
	{ id: 'deepseek-reasoner', label: 'deepseek-reasoner' },
]

const ASPECT_RATIOS: Array<{ id: AspectRatioId; label: string; apiSize: string }> = [
	{ id: '1:1', label: '1:1', apiSize: '1024x1024' },
	{ id: '3:4', label: '3:4', apiSize: '1152x1536' },
	{ id: '4:3', label: '4:3', apiSize: '1536x1152' },
	{ id: '16:9', label: '16:9', apiSize: '1536x864' },
	{ id: '9:16', label: '9:16', apiSize: '864x1536' },
]

const WHITE_WUCHANG_EXTENSION_URL =
	'https://chromewebstore.google.com/detail/pginmfcmpdpmknpnddmfkienphgelldg'

const LOCAL_ANNOTATION_PROMPT =
	'请根据参考图中的红色手绘标注进行局部修改。红色圈选、线条和文字只是编辑指示，不要出现在最终画面中。只修改标注区域，未标注区域保持原图的主体、构图、材质、光线、背景和风格不变。'

const MOTION_TRANSFER_PROMPT = `Motion transfer workflow.
Reference image 1 is the identity/source image and must remain visually locked: preserve the person or product identity, face, hairstyle, wardrobe logic, materials, background, lighting, color tone, camera angle, composition, rendering style, and all non-pose visual details.
Reference image 2 is pose/action guidance only: use only the body pose, limb direction, gesture, balance, action rhythm, and silhouette movement from image 2.
Only change the pose/action of the subject from image 1. Do not transfer clothing, face, background, color, lighting, style, props, scene, or product details from image 2.
Keep the result natural, anatomically coherent, photorealistic, and faithful to image 1 except for the pose. No text, no logos, no watermark, no UI elements.`

const PROMPT_LIBRARY_PRESETS: PromptLibraryPreset[] = [
	{
		id: 'local-edit',
		category: '局部修改',
		title: '标注局部修改',
		description: '配合图片上的红色标注，只改圈选区域。',
		prompt: LOCAL_ANNOTATION_PROMPT,
	},
	{
		id: 'product-six-view',
		category: '产品图',
		title: '产品六视图',
		description: '产品参考图生成标准 16:9 六视图。',
		prompt:
			'以参考图中的产品为唯一主体，生成一张 16:9 横向画幅产品六视图：正视图、侧视图、后视图、俯视图、后侧视图、顶视图。标准无透视变形，柔和电影光，轻微胶片颗粒，8K 超写实。保持产品材质、颜色、比例、细节与识别特征一致，不添加文字、标志、水印或 UI 元素。',
	},
	{
		id: 'commercial-lighting',
		category: '商业摄影',
		title: '高级商业灯光',
		description: '提升产品质感、金属反射和广告级光影。',
		prompt:
			'保留参考图主体结构与识别特征，重塑为高级商业广告摄影：精准布光、柔和主光、细腻边缘高光、真实材质反射、干净背景、克制阴影、超写实产品细节、杂志级修图，不添加文字、标志、水印或 UI 元素。',
	},
	{
		id: 'motion-transfer',
		category: 'AI 绘画',
		title: '动作迁移',
		description: '图1锁定形象，图2只提供动作姿态。',
		prompt: MOTION_TRANSFER_PROMPT,
	},
]

const WORKFLOW_PRESETS: Array<{
	id: WorkflowPresetId
	title: string
	description: string
	prompt: string
	size: AspectRatioId
	count: number
}> = [
	{
		id: 'six-view',
		title: '产品六视图',
		description: '上传产品图后直接生成 16:9 六视图',
		size: '16:9',
		count: 1,
		prompt:
			'以参考图片中的产品为唯一主体，生成一张图内整齐排列六视图：正视图、侧视图、后视图、俯视图、后侧视图、顶视图，标准无透视变形，柔和电影光，轻微胶片颗粒，8K 超写实。保持产品材质、颜色、比例、细节与识别特征完全一致，不添加文字、标志、水印或 UI 元素。',
	},
	{
		id: 'prompt-analysis',
		title: '反推提示词',
		description: '把图片分析成可复用的文生图提示词',
		size: '16:9',
		count: 1,
		prompt:
			'请分析这张图片，并生成一个能够指导 AI 生成工具重新创作类似作品的文生图提示词。提示词需含以下信息：主体内容、场景设定、风格类型、色彩色调、构图视角、附加细节，最后把提示词组合在一起，整合为适配 AI 生成的短句提示。',
	},
	{
		id: 'lighting-contact-sheet',
		title: '九宫格灯光',
		description: '固定 16:9 奢华时尚灯光探索',
		size: '16:9',
		count: 1,
		prompt: `Create a single 3x3 luxury fashion editorial lighting exploration contact sheet.
The final image must contain exactly nine separate panels arranged in a clean 3x3 grid.
The same subject must appear in all nine panels.
Maintain character continuity, facial features, hairstyle, styling logic, wardrobe logic, and product continuity.
The purpose of the contact sheet is to explore nine completely different luxury commercial lighting systems.
Each panel must use a distinctly different professional photography lighting setup.
Panel 1 - Luxury Beige Editorial: soft frontal beauty light, large octabox illumination, creamy beige gradient background, subtle shadow transition, luxury fashion campaign atmosphere, refined skin rendering, premium editorial portrait.
Panel 2 - High-Key Beauty Campaign: bright commercial beauty lighting, nearly shadowless illumination, white-to-sky-blue seamless background, glowing skin highlights, luxury cosmetics advertisement lighting, fresh and clean visual mood.
Panel 3 - Deep Brown Silhouette Portrait: strong side lighting, controlled shadow falloff, deep brown gradient background, shoulder rim light, cinematic silhouette effect, luxury fragrance campaign atmosphere.
Panel 4 - Dramatic Cut-Light Portrait: hard directional spotlight crossing the face, strong shadow geometry, high contrast facial sculpting, dark background, editorial fashion drama, luxury beauty campaign lighting.
Panel 5 - Red Luxury Mood Lighting: deep crimson background, narrow spotlight illumination, emotional luxury atmosphere, rich shadows, sophisticated fashion advertising aesthetic.
Panel 6 - Premium Product Advertising Light: strong side illumination, sharp highlight edges, cool white background, realistic shadow projection, luxury consumer electronics advertisement lighting.
Panel 7 - Contemporary Blue Commercial Light: cool blue gradient background, soft directional lighting, glossy fabric reflections, premium technology campaign atmosphere, fashion-tech advertising aesthetic.
Panel 8 - Luxury Eyewear Backlight: bright white background, strong side-backlight, clean contour lighting, wind-blown hair effect, premium eyewear advertising atmosphere, modern editorial portrait.
Panel 9 - High-Contrast Beauty Close-Up: macro beauty lighting, extreme skin detail visibility, controlled specular highlights, sharp facial contours, luxury skincare campaign aesthetic, premium cosmetic photography.
Every panel must have different lighting direction, different contrast ratio, different shadow structure, different highlight behavior, different mood, and different commercial advertising atmosphere.
Do not simply change background colors. Each panel must visibly demonstrate a unique professional photography lighting setup.
Luxury fashion editorial photography, commercial advertising portrait, realistic skin texture, visible pores, natural imperfections, premium retouching, ultra photorealistic, magazine-quality lighting study.
No text, no logos, no watermark, no UI elements. Nine clearly separated panels. Final aspect ratio must remain 16:9.`,
	},
]

export default function AiCanvasAgentExample() {
	const viewportRef = useRef<HTMLDivElement | null>(null)
	const nodeCounterRef = useRef(10)
	const edgeCounterRef = useRef(10)
	const aspectNormalizationRef = useRef(new Set<string>())
	const [nodes, setNodes] = useState<CanvasNode[]>(() => createInitialNodes())
	const [edges, setEdges] = useState<CanvasEdge[]>([])
	const [transform, setTransform] = useState<TransformState>({ x: 96, y: 108, zoom: 0.56 })
	const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
	const [dragState, setDragState] = useState<DragState | null>(null)
	const [panState, setPanState] = useState<PanState | null>(null)
	const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
	const [isDraggingFile, setIsDraggingFile] = useState(false)
	const [draftConnection, setDraftConnection] = useState<DraftConnection | null>(null)
	const [generationMenu, setGenerationMenu] = useState<GenerationMenu | null>(null)
	const [quickActionMenu, setQuickActionMenu] = useState<QuickActionMenu | null>(null)
	const [previewImageNodeId, setPreviewImageNodeId] = useState<string | null>(null)
	const [activeTool, setActiveTool] = useState<ToolbarTool>('select')
	const [annotationModeNodeId, setAnnotationModeNodeId] = useState<string | null>(null)
	const [edgesVisible, setEdgesVisible] = useState(true)
	const [agentPanelOpen, setAgentPanelOpen] = useState(true)
	const [historyPanelOpen, setHistoryPanelOpen] = useState(true)
	const [promptLibraryOpen, setPromptLibraryOpen] = useState(false)
	const [isStorageReady, setIsStorageReady] = useState(false)
	const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
	const [historySearch, setHistorySearch] = useState('')
	const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')
	const [apiRefreshNonce, setApiRefreshNonce] = useState(0)
	const [apiKeyPanelOpen, setApiKeyPanelOpen] = useState(false)
	const [apiKeyInput, setApiKeyInput] = useState('')
	const [apiBaseUrlInput, setApiBaseUrlInput] = useState('')
	const [apiKeySaving, setApiKeySaving] = useState(false)
	const [arkStatus, setArkStatus] = useState<ApiStatus>('checking')
	const [arkKeyInput, setArkKeyInput] = useState('')
	const [arkKeySaving, setArkKeySaving] = useState(false)
	const [imageModels, setImageModels] = useState<ModelOption[]>([])
	const [imageModel, setImageModel] = useState('')
	const [textModels, setTextModels] = useState<ModelOption[]>([])
	const [textModel, setTextModel] = useState('')
	const [modelError, setModelError] = useState<string | null>(null)
	const [canvasNotice, setCanvasNotice] = useState<string | null>(null)
	const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([
		{
			id: 'agent-welcome',
			role: 'assistant',
			content: '告诉我你想生成什么画面。我会先整理思路，再在画布上创建提示词节点并生成图片。',
			thinking: ['读取当前画布', '等待你的创作目标'],
			status: 'done',
		},
	])
	const [agentInput, setAgentInput] = useState('')
	const [agentBusy, setAgentBusy] = useState(false)
	const [agentAutoGenerate, setAgentAutoGenerate] = useState(true)
	const [agentReferenceImageIds, setAgentReferenceImageIds] = useState<string[]>([])

	const imageNodeCount = useMemo(() => nodes.filter(isImageNode).length, [nodes])
	const promptNodeCount = useMemo(() => nodes.filter(isPromptNode).length, [nodes])
	const filteredHistoryItems = useMemo(
		() => filterHistoryItems(historyItems, historySearch),
		[historyItems, historySearch]
	)
	const selectedImageNodes = useMemo(
		() =>
			selectedNodeIds
				.map((id) => nodes.find((node) => node.id === id))
				.filter((node): node is ImageNode => Boolean(node && isImageNode(node))),
		[nodes, selectedNodeIds]
	)
	const selectedImageRoleById = useMemo(() => {
		const roleById = new Map<string, ImageSelectionRole>()
		selectedImageNodes.slice(0, 2).forEach((node, index) => {
			roleById.set(node.id, index === 0 ? 'identity' : 'motion')
		})
		return roleById
	}, [selectedImageNodes])
	const selectedCount = selectedNodeIds.length
	const apiReady = apiStatus === 'ready'
	const activeImageModel = imageModel || imageModels[0]?.id || DEFAULT_IMAGE_MODELS[0].id
	const activeTextModel = textModel || textModels[0]?.id || DEFAULT_TEXT_MODELS[0].id
	const previewImageNode = previewImageNodeId
		? nodes.find((node): node is ImageNode => node.id === previewImageNodeId && isImageNode(node))
		: null
	const agentReferenceImages = useMemo(
		() =>
			agentReferenceImageIds
				.map((id) => nodes.find((node) => node.id === id))
				.filter((node): node is ImageNode => Boolean(node && isImageNode(node))),
		[nodes, agentReferenceImageIds]
	)

	const videoPollersRef = useRef(new Set<string>())
	const cancelledVideoTasksRef = useRef(new Set<string>())

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
				if (cancelledVideoTasksRef.current.has(taskId)) return
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
							(status === 'expired'
								? '任务已过期'
								: status === 'cancelled'
									? '任务已取消'
									: '视频生成失败'),
					})
					return
				}
				updateVideoNode(nodeId, {
					status: status === 'queued' ? 'queued' : 'running',
					errorMessage: null,
				})
			}
		} finally {
			videoPollersRef.current.delete(taskId)
		}
	}

	useEffect(() => {
		const normalizedNodes = normalizeCanvasNodeDisplayLayout(nodes)
		if (!normalizedNodes) return
		setNodes(normalizedNodes)
	}, [nodes])

	useEffect(() => {
		if (annotationModeNodeId && !selectedNodeIds.includes(annotationModeNodeId)) {
			setAnnotationModeNodeId(null)
			setActiveTool('select')
		}
	}, [annotationModeNodeId, selectedNodeIds])

	useEffect(() => {
		const candidates = nodes
			.filter(isImageNode)
			.map((node) => ({
				node,
				targetAspectRatio:
					node.targetAspectRatio || inferTargetAspectRatioFromPrompt(node.prompt || ''),
			}))
			.filter(({ node, targetAspectRatio }) => {
				if (!targetAspectRatio) return false
				if (aspectNormalizationRef.current.has(node.id)) return false
				const targetSize = parseApiSize(
					ASPECT_RATIOS.find((item) => item.id === targetAspectRatio)?.apiSize ||
						ASPECT_RATIOS[0].apiSize
				)
				return !isAspectRatioClose({ w: node.naturalWidth, h: node.naturalHeight }, targetSize)
			})

		if (!candidates.length) return
		let cancelled = false
		candidates.forEach(({ node }) => aspectNormalizationRef.current.add(node.id))
		Promise.all(
			candidates.map(async ({ node, targetAspectRatio }) => {
				const targetSize = parseApiSize(
					ASPECT_RATIOS.find((item) => item.id === targetAspectRatio)?.apiSize ||
						ASPECT_RATIOS[0].apiSize
				)
				const normalized = await fitImageToTargetCanvas(node.imageUrl, targetSize)
				const display = getTrueDisplaySize(normalized.dimensions.w, normalized.dimensions.h)
				return {
					id: node.id,
					imageUrl: normalized.imageUrl,
					naturalWidth: normalized.dimensions.w,
					naturalHeight: normalized.dimensions.h,
					displayWidth: display.w,
					displayHeight: display.h,
					targetAspectRatio,
				}
			})
		).then((patches) => {
			if (cancelled) return
			setNodes((current) =>
				current.map((node) => {
					if (!isImageNode(node)) return node
					const patch = patches.find((item) => item.id === node.id)
					return patch ? ({ ...node, ...patch } as ImageNode) : node
				})
			)
		})
		return () => {
			cancelled = true
		}
	}, [nodes])

	useEffect(() => {
		let cancelled = false
		loadPersistedCanvasState().then((savedState) => {
			if (cancelled) return
			if (savedState) {
				const normalized = normalizePersistedCanvasState(savedState)
				setNodes(normalized.nodes)
				setEdges(normalized.edges)
				setTransform(normalized.transform)
				setHistoryItems(normalized.historyItems)
				nodeCounterRef.current = Math.max(normalized.nodeCounter, getMaxNumericId(normalized.nodes))
				edgeCounterRef.current = Math.max(normalized.edgeCounter, getMaxNumericId(normalized.edges))
			}
			setIsStorageReady(true)
		})
		return () => {
			cancelled = true
		}
	}, [])

	useEffect(() => {
		if (!isStorageReady) return
		for (const node of nodes) {
			if (
				isVideoNode(node) &&
				node.taskId &&
				(node.status === 'queued' || node.status === 'running')
			) {
				void pollVideoTask(node.id, node.taskId)
			}
		}
	}, [isStorageReady, nodes])

	useEffect(() => {
		if (!isStorageReady) return
		const state = createPersistedCanvasState(
			nodes,
			edges,
			transform,
			historyItems,
			nodeCounterRef.current,
			edgeCounterRef.current
		)
		const timeout = window.setTimeout(() => {
			void savePersistedCanvasState(state)
		}, 250)
		return () => window.clearTimeout(timeout)
	}, [isStorageReady, nodes, edges, transform, historyItems])

	useEffect(() => {
		if (!isStorageReady) return
		function handlePageHide() {
			void savePersistedCanvasState(
				createPersistedCanvasState(
					nodes,
					edges,
					transform,
					historyItems,
					nodeCounterRef.current,
					edgeCounterRef.current
				)
			)
		}
		window.addEventListener('pagehide', handlePageHide)
		return () => window.removeEventListener('pagehide', handlePageHide)
	}, [isStorageReady, nodes, edges, transform, historyItems])

	useEffect(() => {
		let cancelled = false
		async function refreshApiState() {
			const status = await checkApiStatus()
			if (cancelled) return
			setApiStatus(status.configured ? 'ready' : 'missing')
			setArkStatus(status.arkConfigured ? 'ready' : 'missing')
			if (!status.configured) {
				setImageModels([])
				setImageModel('')
				setTextModels([])
				setTextModel('')
				return
			}

			try {
				setModelError(null)
				const response = await fetch('/api/ai-models')
				const data = (await response.json()) as AiModelsResponse
				if (!response.ok) throw new Error(data.error || '无法读取模型列表')
				const nextImageModels = data.imageModels?.length ? data.imageModels : DEFAULT_IMAGE_MODELS
				const nextTextModels = data.textModels?.length ? data.textModels : DEFAULT_TEXT_MODELS
				if (cancelled) return
				setImageModels(nextImageModels)
				setImageModel((current) =>
					nextImageModels.some((model) => model.id === current) ? current : nextImageModels[0].id
				)
				setTextModels(nextTextModels)
				setTextModel((current) =>
					nextTextModels.some((model) => model.id === current) ? current : nextTextModels[0].id
				)
			} catch (err) {
				if (cancelled) return
				setImageModels(DEFAULT_IMAGE_MODELS)
				setImageModel((current) => current || DEFAULT_IMAGE_MODELS[0].id)
				setTextModels(DEFAULT_TEXT_MODELS)
				setTextModel((current) => current || DEFAULT_TEXT_MODELS[0].id)
				setModelError(err instanceof Error ? err.message : '无法读取模型列表')
			}
		}
		refreshApiState()
		return () => {
			cancelled = true
		}
	}, [apiRefreshNonce])

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (isTextEditingElement(document.activeElement)) return
			if (event.key === 'Delete' || event.key === 'Backspace') {
				if (!selectedNodeIds.length) return
				event.preventDefault()
				deleteNodes(selectedNodeIds)
			}
			if (event.key.toLowerCase() === 'a' && (event.ctrlKey || event.metaKey)) {
				event.preventDefault()
				setSelectedNodeIds(nodes.map((node) => node.id))
			}
			if (event.key === 'Home' || event.key === '0') {
				event.preventDefault()
				handleResetView()
			}
			if (event.key === 'Escape') {
				setSelectionBox(null)
				setGenerationMenu(null)
				setQuickActionMenu(null)
				setDraftConnection(null)
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [nodes, selectedNodeIds])

	function createNodeId(type: CanvasNodeType) {
		nodeCounterRef.current += 1
		return `${type}-${nodeCounterRef.current}`
	}

	function createEdgeId() {
		edgeCounterRef.current += 1
		return `edge-${edgeCounterRef.current}`
	}

	function screenToCanvas(clientX: number, clientY: number): Point {
		const rect = viewportRef.current?.getBoundingClientRect()
		const viewportX = rect ? clientX - rect.left : clientX
		const viewportY = rect ? clientY - rect.top : clientY
		return {
			x: (viewportX - transform.x) / transform.zoom,
			y: (viewportY - transform.y) / transform.zoom,
		}
	}

	function screenPoint(clientX: number, clientY: number): Point {
		const rect = viewportRef.current?.getBoundingClientRect()
		return {
			x: rect ? clientX - rect.left : clientX,
			y: rect ? clientY - rect.top : clientY,
		}
	}

	function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if (event.button !== 0) return
		setGenerationMenu(null)
		setQuickActionMenu(null)
		const startCanvas = screenToCanvas(event.clientX, event.clientY)
		const startScreen = screenPoint(event.clientX, event.clientY)

		if (event.shiftKey) {
			setSelectedNodeIds([])
			setSelectionBox({
				startCanvas,
				currentCanvas: startCanvas,
				startScreen,
				currentScreen: startScreen,
			})
			return
		}

		setSelectedNodeIds([])
		setPanState({
			start: { x: event.clientX, y: event.clientY },
			origin: { x: transform.x, y: transform.y },
		})
	}

	function handleViewportDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
		const target = event.target as HTMLElement
		if (
			target.closest(
				'.tap-node, .tap-left-toolbar, .tap-agent-panel, .tap-history-panel, .tap-canvas__topbar, .tap-canvas__meta, .tap-generate-menu, .tap-quick-menu'
			)
		) {
			return
		}
		event.preventDefault()
		setGenerationMenu(null)
		setQuickActionMenu({
			canvasPoint: screenToCanvas(event.clientX, event.clientY),
			screenPoint: { x: event.clientX, y: event.clientY },
		})
	}

	function handleNodePointerDown(event: ReactPointerEvent<HTMLElement>, node: CanvasNode) {
		const target = event.target as HTMLElement
		if (target.closest('button, input, textarea, select, label, .tap-node__connector')) return
		event.stopPropagation()
		setGenerationMenu(null)
		setQuickActionMenu(null)

		let nextSelection = selectedNodeIds
		if (event.shiftKey) {
			nextSelection = selectedNodeIds.includes(node.id)
				? selectedNodeIds.filter((id) => id !== node.id)
				: [...selectedNodeIds, node.id]
			setSelectedNodeIds(nextSelection)
		} else if (!selectedNodeIds.includes(node.id)) {
			nextSelection = [node.id]
			setSelectedNodeIds(nextSelection)
		}

		const point = screenToCanvas(event.clientX, event.clientY)
		const nodeIds = nextSelection.includes(node.id) ? nextSelection : [node.id]
		const initialPositions = Object.fromEntries(
			nodes
				.filter((candidate) => nodeIds.includes(candidate.id))
				.map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }])
		)
		setDragState({
			nodeIds,
			startPoint: point,
			initialPositions,
		})
	}

	function handleConnectorPointerDown(
		event: ReactPointerEvent<HTMLButtonElement>,
		node: ImageNode
	) {
		event.stopPropagation()
		setSelectedNodeIds([node.id])
		setGenerationMenu(null)
		setQuickActionMenu(null)
		const from = getNodeOutputPoint(node)
		setDraftConnection({
			fromNodeId: node.id,
			from,
			to: from,
		})
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (draftConnection) {
			setDraftConnection({
				...draftConnection,
				to: screenToCanvas(event.clientX, event.clientY),
			})
			return
		}

		if (selectionBox) {
			setSelectionBox({
				...selectionBox,
				currentCanvas: screenToCanvas(event.clientX, event.clientY),
				currentScreen: screenPoint(event.clientX, event.clientY),
			})
			return
		}

		if (dragState) {
			const point = screenToCanvas(event.clientX, event.clientY)
			const delta = { x: point.x - dragState.startPoint.x, y: point.y - dragState.startPoint.y }
			setNodes((current) =>
				current.map((node) => {
					const initial = dragState.initialPositions[node.id]
					return initial ? { ...node, x: initial.x + delta.x, y: initial.y + delta.y } : node
				})
			)
			return
		}

		if (panState) {
			setTransform((current) => ({
				...current,
				x: panState.origin.x + event.clientX - panState.start.x,
				y: panState.origin.y + event.clientY - panState.start.y,
			}))
		}
	}

	function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
		if (draftConnection) {
			const canvasPoint = screenToCanvas(event.clientX, event.clientY)
			setGenerationMenu({
				fromNodeId: draftConnection.fromNodeId,
				canvasPoint,
				screenPoint: { x: event.clientX, y: event.clientY },
			})
			setDraftConnection(null)
		}
		if (selectionBox) {
			const rect = normalizeRectFromPoints(selectionBox.startCanvas, selectionBox.currentCanvas)
			const selectedIds = nodes
				.filter((node) => rectsIntersect(rect, getNodeRect(node)))
				.map((node) => node.id)
			setSelectedNodeIds(selectedIds)
			setCanvasNotice(selectedIds.length ? `已框选 ${selectedIds.length} 个节点` : '没有框选到节点')
			setSelectionBox(null)
		}
		setDragState(null)
		setPanState(null)
	}

	function handleWheel(event: WheelEvent<HTMLDivElement>) {
		event.preventDefault()
		const nextZoom = clamp(transform.zoom * (event.deltaY > 0 ? 0.92 : 1.08), MIN_ZOOM, MAX_ZOOM)
		const rect = viewportRef.current?.getBoundingClientRect()
		const screenX = rect ? event.clientX - rect.left : event.clientX
		const screenY = rect ? event.clientY - rect.top : event.clientY
		const canvasX = (screenX - transform.x) / transform.zoom
		const canvasY = (screenY - transform.y) / transform.zoom
		setTransform({
			zoom: nextZoom,
			x: screenX - canvasX * nextZoom,
			y: screenY - canvasY * nextZoom,
		})
	}

	function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
		if (!hasImageFiles(event.dataTransfer)) return
		event.preventDefault()
		setIsDraggingFile(true)
	}

	function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
		setIsDraggingFile(false)
	}

	async function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
		const files = Array.from(event.dataTransfer.files).filter((file) =>
			file.type.startsWith('image/')
		)
		if (!files.length) return
		event.preventDefault()
		setIsDraggingFile(false)
		await addImageFiles(files, screenToCanvas(event.clientX, event.clientY))
	}

	async function addImageFiles(files: File[], startPoint: Point) {
		const imageFiles = files.filter((file) => file.type.startsWith('image/'))
		if (!imageFiles.length) {
			setCanvasNotice('请拖入图片文件')
			return
		}

		const imageNodes: ImageNode[] = []
		for (let index = 0; index < imageFiles.length; index++) {
			try {
				const file = imageFiles[index]
				const imageUrl = await readFileAsDataUrl(file)
				const dimensions = await getImageDimensions(imageUrl, { w: 1024, h: 1024 })
				const display = getTrueDisplaySize(dimensions.w, dimensions.h)
				const node: ImageNode = {
					id: createNodeId('image'),
					type: 'image',
					x: startPoint.x + index * 80,
					y: startPoint.y + index * 80,
					title: file.name || `参考图 ${imageNodeCount + index + 1}`,
					fileName: file.name || `image-${imageNodeCount + index + 1}.png`,
					mimeType: file.type || 'image/png',
					imageUrl,
					naturalWidth: dimensions.w,
					naturalHeight: dimensions.h,
					displayWidth: display.w,
					displayHeight: display.h,
				}
				imageNodes.push(node)
			} catch {
				setCanvasNotice('图片读取失败')
			}
		}

		if (!imageNodes.length) return
		setNodes((current) => [...current, ...imageNodes])
		setHistoryItems((current) =>
			mergeHistoryItems(
				current,
				imageNodes.map((node) => createHistoryItemFromImageNode(node, 'uploaded'))
			)
		)
		setSelectedNodeIds(imageNodes.map((node) => node.id))
		setCanvasNotice(`已添加 ${imageNodes.length} 张图片`)
	}

	function getViewportCenter() {
		const rect = viewportRef.current?.getBoundingClientRect()
		const clientX = (rect?.left || 0) + (rect?.width || window.innerWidth) / 2
		const clientY = (rect?.top || 0) + (rect?.height || window.innerHeight) / 2
		return screenToCanvas(clientX, clientY)
	}

	function getSelectedImageNodes() {
		return selectedImageNodes
	}

	function createPromptNode({
		id = createNodeId('prompt'),
		sourceNodes = [],
		point,
		prompt = '',
		size = '1:1',
		count = 1,
		presetId,
		presetTitle,
	}: {
		id?: string
		sourceNodes?: ImageNode[]
		point: Point
		prompt?: string
		size?: AspectRatioId
		count?: number
		presetId?: WorkflowPresetId
		presetTitle?: string
	}): PromptNode {
		const matchedSize = getAdaptivePromptNodeSize(sourceNodes[0])
		return {
			id,
			type: 'prompt',
			sourceImageId: sourceNodes[0]?.id || '',
			sourceImageIds: sourceNodes.map((source) => source.id),
			x: point.x,
			y: point.y,
			prompt,
			size,
			count: normalizeGenerationCount(count),
			status: 'idle',
			width: matchedSize.w,
			height: matchedSize.h,
			presetId,
			presetTitle,
		}
	}

	function handleCreatePromptFromMenu() {
		if (!generationMenu) return
		const source = nodes.find(
			(node): node is ImageNode => node.id === generationMenu.fromNodeId && isImageNode(node)
		)
		if (!source) {
			setGenerationMenu(null)
			return
		}

		const promptId = createNodeId('prompt')
		const promptNode = createPromptNode({
			id: promptId,
			sourceNodes: [source],
			point: {
				x: generationMenu.canvasPoint.x + 28,
				y: generationMenu.canvasPoint.y - getAdaptivePromptNodeSize(source).h / 2,
			},
		})
		setNodes((current) => [...current, promptNode])
		setEdges((current) => [...current, { id: createEdgeId(), from: source.id, to: promptId }])
		setSelectedNodeIds([promptId])
		setGenerationMenu(null)
	}

	function handleCreateWorkflowPresetFromMenu(presetId: WorkflowPresetId) {
		if (!generationMenu) return
		const source = nodes.find(
			(node): node is ImageNode => node.id === generationMenu.fromNodeId && isImageNode(node)
		)
		if (!source) {
			setGenerationMenu(null)
			return
		}
		const point = {
			x: generationMenu.canvasPoint.x + 28,
			y: generationMenu.canvasPoint.y - getAdaptivePromptNodeSize(source).h / 2,
		}
		setGenerationMenu(null)
		createWorkflowPromptFromImage(source, presetId, point)
	}

	function handleCreateVideoFromMenu() {
		if (!generationMenu) return
		const source = nodes.find(
			(node): node is ImageNode => node.id === generationMenu.fromNodeId && isImageNode(node)
		)
		if (!source) {
			setGenerationMenu(null)
			return
		}
		const point = {
			x: generationMenu.canvasPoint.x + 28,
			y: generationMenu.canvasPoint.y - VIDEO_NODE_BASE_HEIGHT / 2,
		}
		setGenerationMenu(null)
		createVideoNodeFromImages([source], point)
	}

	function createWorkflowPromptFromImage(
		source: ImageNode,
		presetId: WorkflowPresetId,
		point?: Point
	) {
		const preset = WORKFLOW_PRESETS.find((item) => item.id === presetId)
		if (!preset) return
		const sourceSize = getNodeSize(source)
		const promptNode = createPromptNode({
			sourceNodes: [source],
			point: point || { x: source.x + sourceSize.w + NODE_GAP, y: source.y },
			prompt: preset.prompt,
			size: preset.size,
			count: preset.count,
			presetId,
			presetTitle: preset.title,
		})
		setNodes((current) => [...current, promptNode])
		setEdges((current) => [...current, { id: createEdgeId(), from: source.id, to: promptNode.id }])
		setSelectedNodeIds([promptNode.id])
		if (preset.id === 'prompt-analysis') {
			if (apiReady) {
				setCanvasNotice('已创建反推提示词工作流，正在分析图片')
				window.setTimeout(() => {
					void analyzePromptFromImage(promptNode, source)
				}, 0)
			} else {
				setCanvasNotice('已创建反推提示词工作流')
			}
			return
		}
		if (apiReady) {
			setCanvasNotice(`已创建「${preset.title}」工作流，正在生成`)
			window.setTimeout(() => {
				void generateImageForPromptNode(promptNode, [source])
			}, 0)
		} else {
			setCanvasNotice(`已创建「${preset.title}」工作流`)
		}
	}

	function createAnnotatedEditPromptFromImage(source?: ImageNode) {
		const target = source || getSelectedImageNodes()[0]
		if (!target) {
			setCanvasNotice('请先选中一张图片，再使用标注局部修改')
			return
		}
		const targetSize = getNodeSize(target)
		const note = target.annotationNote?.trim()
		const promptNode = createPromptNode({
			sourceNodes: [target],
			point: { x: target.x + targetSize.w + NODE_GAP, y: target.y },
			prompt: note ? `${LOCAL_ANNOTATION_PROMPT}\n具体修改要求：${note}` : LOCAL_ANNOTATION_PROMPT,
			size: inferAspectRatioFromDimensions(target.naturalWidth, target.naturalHeight),
			count: 1,
			presetTitle: '标注局部修改',
		})
		setNodes((current) => [...current, promptNode])
		setEdges((current) => [...current, { id: createEdgeId(), from: target.id, to: promptNode.id }])
		setSelectedNodeIds([promptNode.id])
		setAnnotationModeNodeId(null)
		setActiveTool('select')
		if (apiReady && (target.annotations?.length || note)) {
			setCanvasNotice('已创建标注局部修改工作流，正在生成')
			window.setTimeout(() => {
				void generateImageForPromptNode(promptNode, [target])
			}, 0)
		} else {
			setCanvasNotice('已创建标注局部修改提示词，请补充修改要求后生成')
		}
	}

	function createMotionTransferPrompt() {
		const sourceNodes = getSelectedImageNodes()
		if (sourceNodes.length < 2) {
			setCanvasNotice('请先选中两张图片：图1保留人物形象，图2提供动作参考')
			return
		}
		const identity = sourceNodes[0]
		const motion = sourceNodes[1]
		const identitySize = getNodeSize(identity)
		const promptNode = createPromptNode({
			sourceNodes: [identity, motion],
			point: { x: identity.x + identitySize.w + NODE_GAP, y: identity.y },
			prompt: MOTION_TRANSFER_PROMPT,
			size: inferAspectRatioFromDimensions(identity.naturalWidth, identity.naturalHeight),
			count: 1,
			presetId: 'motion-transfer',
			presetTitle: '动作迁移',
		})
		setNodes((current) => [...current, promptNode])
		setEdges((current) => [
			...current,
			{ id: createEdgeId(), from: identity.id, to: promptNode.id },
			{ id: createEdgeId(), from: motion.id, to: promptNode.id },
		])
		setSelectedNodeIds([promptNode.id])
		if (apiReady) {
			setCanvasNotice('已创建动作迁移工作流，正在生成')
			window.setTimeout(() => {
				void generateImageForPromptNode(promptNode, [identity, motion])
			}, 0)
		} else {
			setCanvasNotice('已创建动作迁移工作流')
		}
	}

	function createVideoNodeFromImages(sources: ImageNode[], point?: Point) {
		const sourceNodes = sources.slice(0, MAX_VIDEO_REFERENCE_IMAGES)
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
			x: point
				? point.x
				: anchor
					? anchor.x + getNodeSize(anchor).w + NODE_GAP
					: center.x - VIDEO_NODE_WIDTH / 2,
			y: point ? point.y : anchor ? anchor.y : center.y - VIDEO_NODE_BASE_HEIGHT / 2,
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
				...sourceNodes.map((sourceNode) => ({
					id: createEdgeId(),
					from: sourceNode.id,
					to: videoNode.id,
				})),
			])
		}
		setSelectedNodeIds([videoNode.id])
		setCanvasNotice(
			sourceNodes.length === 0
				? '已创建文生视频节点，填写提示词后生成'
				: `已创建「${VIDEO_MODE_LABELS[mode]}」节点，引用 ${sourceNodes.length} 张图片`
		)
	}

	function createVideoNodeFromSelection() {
		createVideoNodeFromImages(getSelectedImageNodes())
	}

	function createTextNodeAt(point: Point) {
		const textNode: TextNode = {
			id: createNodeId('text'),
			type: 'text',
			x: point.x,
			y: point.y,
			width: 320,
			height: 148,
			text: '双击编辑文本',
		}
		setNodes((current) => [...current, textNode])
		setSelectedNodeIds([textNode.id])
		setCanvasNotice('已添加文本工具节点')
	}

	function _createDoodleNodeAt(point: Point) {
		const doodleNode: DoodleNode = {
			id: createNodeId('doodle'),
			type: 'doodle',
			x: point.x,
			y: point.y,
			title: '涂鸦绘画',
			width: 360,
			height: 260,
			paths: [],
		}
		setNodes((current) => [...current, doodleNode])
		setSelectedNodeIds([doodleNode.id])
		setCanvasNotice('已添加涂鸦画板')
	}

	function createBlankImagePromptPair(point: Point) {
		const imageUrl = makeBlankImageDataUrl(BLANK_IMAGE_WIDTH, BLANK_IMAGE_HEIGHT)
		const display = getTrueDisplaySize(BLANK_IMAGE_WIDTH, BLANK_IMAGE_HEIGHT)
		const imageNode: ImageNode = {
			id: createNodeId('image'),
			type: 'image',
			x: point.x,
			y: point.y,
			title: '空白图片节点',
			fileName: 'blank-image.svg',
			mimeType: 'image/svg+xml',
			imageUrl,
			naturalWidth: BLANK_IMAGE_WIDTH,
			naturalHeight: BLANK_IMAGE_HEIGHT,
			displayWidth: display.w,
			displayHeight: display.h,
		}
		const imageSize = getNodeSize(imageNode)
		const promptNode = createPromptNode({
			sourceNodes: [],
			point: { x: point.x, y: point.y + imageSize.h + 18 },
			size: '16:9',
		})
		promptNode.width = imageSize.w
		promptNode.height = imageSize.h
		setNodes((current) => [...current, imageNode, promptNode])
		setEdges((current) => [
			...current,
			{ id: createEdgeId(), from: imageNode.id, to: promptNode.id },
		])
		setSelectedNodeIds([promptNode.id])
		setCanvasNotice('已添加空白图片节点和提示词对话框')
	}

	function startImageAnnotation() {
		const target = getSelectedImageNodes()[0]
		if (!target) {
			setCanvasNotice('请先选中一张图片，再点击标注工具')
			setActiveTool('select')
			return
		}
		setSelectedNodeIds([target.id])
		setAnnotationModeNodeId(target.id)
		setActiveTool('annotate')
		setCanvasNotice('已进入图片标注模式：直接在图片上圈选或手绘局部修改区域')
	}

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

	function handleToolbarTool(tool: ToolbarTool) {
		setActiveTool(tool)
		if (tool === 'text') createTextNodeAt(getViewportCenter())
		if (tool === 'annotate') startImageAnnotation()
	}

	function alignCanvasNodes(mode: 'left' | 'center' | 'right') {
		const targetIds = selectedNodeIds.length ? selectedNodeIds : nodes.map((node) => node.id)
		const targetNodes = nodes.filter((node) => targetIds.includes(node.id))
		if (targetNodes.length < 2) {
			setCanvasNotice('请至少选中两个节点进行对齐')
			return
		}
		const rects = targetNodes.map(getNodeRect)
		const left = Math.min(...rects.map((rect) => rect.x))
		const right = Math.max(...rects.map((rect) => rect.x + rect.w))
		const center = (left + right) / 2
		setNodes((current) =>
			current.map((node) => {
				if (!targetIds.includes(node.id)) return node
				const rect = getNodeRect(node)
				if (mode === 'left') return { ...node, x: left }
				if (mode === 'right') return { ...node, x: right - rect.w }
				return { ...node, x: center - rect.w / 2 }
			})
		)
		setCanvasNotice(
			mode === 'left' ? '已左对齐节点' : mode === 'right' ? '已右对齐节点' : '已居中对齐节点'
		)
	}

	function openPromptExtension() {
		setPromptLibraryOpen((current) => !current)
		setCanvasNotice('已打开画布内嵌提示词宝典，可直接插入或创建提示词节点')
	}

	function applyPromptLibraryPreset(preset: PromptLibraryPreset) {
		const selectedPrompt = selectedNodeIds
			.map((id) => nodes.find((node) => node.id === id))
			.find((node): node is PromptNode => Boolean(node && isPromptNode(node)))
		if (selectedPrompt) {
			updatePromptNode(selectedPrompt.id, {
				prompt: selectedPrompt.prompt.trim()
					? `${selectedPrompt.prompt.trim()}\n\n${preset.prompt}`
					: preset.prompt,
				error: '',
			})
			setCanvasNotice(`已把「${preset.title}」插入当前提示词节点`)
			return
		}

		const sourceNodes = getSelectedImageNodes()
		const center = getViewportCenter()
		const sourceRect = sourceNodes[0] ? getNodeRect(sourceNodes[0]) : null
		const promptNode = createPromptNode({
			sourceNodes,
			point: {
				x: sourceRect ? sourceRect.x + sourceRect.w + NODE_GAP : center.x - PROMPT_NODE_WIDTH / 2,
				y: sourceRect ? sourceRect.y : center.y - PROMPT_NODE_HEIGHT / 2,
			},
			prompt: preset.prompt,
			size:
				preset.id === 'product-six-view'
					? '16:9'
					: sourceNodes[0]
						? inferAspectRatioFromDimensions(
								sourceNodes[0].naturalWidth,
								sourceNodes[0].naturalHeight
							)
						: '1:1',
			count: 1,
			presetTitle: preset.title,
		})
		setNodes((current) => [...current, promptNode])
		if (sourceNodes.length) {
			setEdges((current) => [
				...current,
				...sourceNodes.map((sourceNode) => ({
					id: createEdgeId(),
					from: sourceNode.id,
					to: promptNode.id,
				})),
			])
		}
		setSelectedNodeIds([promptNode.id])
		setCanvasNotice(`已从提示词宝典创建「${preset.title}」节点`)
	}

	function updatePromptNode(nodeId: string, patch: Partial<PromptNode>) {
		setNodes((current) =>
			current.map((node) =>
				node.id === nodeId && isPromptNode(node) ? { ...node, ...patch } : node
			)
		)
	}

	function updateImageNode(nodeId: string, patch: Partial<ImageNode>) {
		setNodes((current) =>
			current.map((node) =>
				node.id === nodeId && isImageNode(node) ? { ...node, ...patch } : node
			)
		)
	}

	function updateTextNode(nodeId: string, patch: Partial<TextNode>) {
		setNodes((current) =>
			current.map((node) => (node.id === nodeId && isTextNode(node) ? { ...node, ...patch } : node))
		)
	}

	function updateDoodleNode(nodeId: string, patch: Partial<DoodleNode>) {
		setNodes((current) =>
			current.map((node) =>
				node.id === nodeId && isDoodleNode(node) ? { ...node, ...patch } : node
			)
		)
	}

	function updateVideoNode(nodeId: string, patch: Partial<VideoNode>) {
		setNodes((current) =>
			current.map((node) =>
				node.id === nodeId && isVideoNode(node) ? { ...node, ...patch } : node
			)
		)
	}

	async function handleGenerateImage(event: FormEvent<HTMLFormElement>, promptNode: PromptNode) {
		event.preventDefault()
		await generateImageForPromptNode(promptNode)
	}

	async function handleSaveApiKey(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const apiKey = apiKeyInput.trim()
		const baseUrl = apiBaseUrlInput.trim()
		if (!apiKey) {
			setModelError('请输入 API 密钥')
			return
		}

		setApiKeySaving(true)
		setModelError(null)
		try {
			const response = await fetch('/api/ai-key', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ apiKey, baseUrl }),
			})
			const data = (await response.json()) as { error?: string }
			if (!response.ok) throw new Error(data.error || 'API 密钥保存失败')
			setApiKeyInput('')
			setApiBaseUrlInput('')
			setApiKeyPanelOpen(false)
			setApiStatus('checking')
			setApiRefreshNonce((current) => current + 1)
			setCanvasNotice('API 密钥已保存，正在刷新接口和模型列表')
		} catch (err) {
			setModelError(err instanceof Error ? err.message : 'API 密钥保存失败')
		} finally {
			setApiKeySaving(false)
		}
	}

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
			updateVideoNode(videoNode.id, {
				status: 'failed',
				errorMessage: '首帧模式需要 1 张图片，请重新连接图片节点',
			})
			return
		}
		if (videoNode.mode === 'first_last' && sourceNodes.length < 2) {
			updateVideoNode(videoNode.id, {
				status: 'failed',
				errorMessage: '首尾帧模式需要 2 张图片，请重新连接图片节点',
			})
			return
		}
		if (videoNode.mode === 'reference' && sourceNodes.length < 1) {
			updateVideoNode(videoNode.id, {
				status: 'failed',
				errorMessage: '参考图模式至少需要 1 张图片',
			})
			return
		}
		const images = buildVideoImageInputs(videoNode.mode, sourceNodes)
		const sizeError = validateVideoImageSizes(images.map((image) => image.url))
		if (sizeError) {
			updateVideoNode(videoNode.id, { status: 'failed', errorMessage: sizeError })
			return
		}

		if (videoNode.taskId) cancelledVideoTasksRef.current.delete(videoNode.taskId)
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
			cancelledVideoTasksRef.current.add(videoNode.taskId)
			updateVideoNode(videoNode.id, { status: 'cancelled', errorMessage: '任务已取消' })
			setCanvasNotice('视频任务已取消')
		} catch (err) {
			setCanvasNotice(err instanceof Error ? err.message : '取消任务失败')
		}
	}

	async function generateImageForPromptNode(
		promptNode: PromptNode,
		sourceOverride?: ImageNode[] | ImageNode | null
	) {
		if (!apiReady) {
			updatePromptNode(promptNode.id, {
				status: 'error',
				error: '未配置图片接口，请点击顶部“检查接口”输入 API 密钥',
			})
			return null
		}
		if (!promptNode.prompt.trim()) {
			updatePromptNode(promptNode.id, { status: 'error', error: '请输入提示词' })
			return null
		}

		const sourceNodes = normalizeSourceImages(sourceOverride, promptNode, nodes)
		updatePromptNode(promptNode.id, { status: 'generating', error: '' })

		try {
			const sizeConfig =
				ASPECT_RATIOS.find((item) => item.id === promptNode.size) || ASPECT_RATIOS[0]
			const generationCount = normalizeGenerationCount(promptNode.count)
			const sourceImageUrls = await Promise.all(sourceNodes.map(createGenerationSourceImageUrl))
			const generationPrompt = buildImageGenerationPrompt(
				promptNode.prompt.trim(),
				promptNode.size,
				sourceNodes.some((node) => node.annotations?.length)
			)
			const response = await fetch('/api/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: activeImageModel,
					prompt: generationPrompt,
					size: sizeConfig.apiSize,
					aspectRatio: promptNode.size,
					count: generationCount,
					sourceImageUrl: sourceImageUrls[0] || '',
					sourceImageUrls,
				}),
			})
			const data = (await response.json()) as GeneratedImageResponse
			if (!response.ok) throw new Error(data.error || '图片生成失败')
			const imageUrls = normalizeGeneratedImageUrls(data)
			if (!imageUrls.length) throw new Error('接口没有返回图片')

			const fallbackSize = parseApiSize(sizeConfig.apiSize)
			const createdAt = Date.now()
			let nextY = promptNode.y
			const promptSize = getNodeSize(promptNode)
			const imageNodes: ImageNode[] = []
			for (let index = 0; index < imageUrls.length; index++) {
				let imageUrl = imageUrls[index]
				let dimensions = await getImageDimensions(imageUrl, fallbackSize)
				if (!isAspectRatioClose(dimensions, fallbackSize)) {
					const normalizedImage = await fitImageToTargetCanvas(imageUrl, fallbackSize)
					imageUrl = normalizedImage.imageUrl
					dimensions = normalizedImage.dimensions
				}
				const display = getTrueDisplaySize(dimensions.w, dimensions.h)
				const imageNode: ImageNode = {
					id: createNodeId('image'),
					type: 'image',
					x: promptNode.x + promptSize.w + NODE_GAP,
					y: nextY,
					title: `生成图 ${imageNodeCount + index + 1}`,
					fileName: `generated-${createdAt}-${index + 1}.png`,
					mimeType: inferImageMimeType(imageUrl),
					imageUrl,
					naturalWidth: dimensions.w,
					naturalHeight: dimensions.h,
					displayWidth: display.w,
					displayHeight: display.h,
					prompt: promptNode.prompt.trim(),
					targetAspectRatio: promptNode.size,
				}
				imageNodes.push(imageNode)
				nextY += getNodeSize(imageNode).h + 48
			}
			setNodes((current) =>
				current
					.map((node) =>
						node.id === promptNode.id && isPromptNode(node)
							? { ...node, status: 'done' as const, error: '' }
							: node
					)
					.concat(imageNodes)
			)
			setHistoryItems((current) =>
				mergeHistoryItems(
					current,
					imageNodes.map((node) =>
						createHistoryItemFromImageNode(node, 'generated', {
							model: data.model || activeImageModel,
							size: promptNode.size,
							sourceImageIds: sourceNodes.map((sourceNode) => sourceNode.id),
						})
					)
				)
			)
			setEdges((current) => [
				...current,
				...imageNodes.map((node) => ({ id: createEdgeId(), from: promptNode.id, to: node.id })),
			])
			setSelectedNodeIds(imageNodes.map((node) => node.id))
			focusCanvasPoint(getRectCenter(getNodeRect(imageNodes[0])))
			setCanvasNotice(imageNodes.length > 1 ? `已生成 ${imageNodes.length} 张图片` : '图片已生成')
			return imageNodes[0]
		} catch (err) {
			updatePromptNode(promptNode.id, {
				status: 'error',
				error: err instanceof Error ? err.message : '图片生成失败',
			})
			return null
		}
	}

	async function analyzePromptFromImage(promptNode: PromptNode, source: ImageNode) {
		if (!apiReady) {
			updatePromptNode(promptNode.id, {
				status: 'error',
				error: '未配置图片分析接口，请点击顶部“检查接口”输入 API 密钥',
			})
			return
		}

		updatePromptNode(promptNode.id, { status: 'generating', error: '' })
		try {
			const response = await fetch('/api/analyze-image-prompt', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: activeTextModel,
					imageUrl: source.imageUrl,
					imageTitle: source.title,
					instruction: promptNode.prompt,
				}),
			})
			const data = (await response.json()) as ImagePromptAnalysisResponse
			if (!response.ok) throw new Error(data.error || '图片提示词反推失败')
			const prompt = data.prompt?.trim()
			if (!prompt) throw new Error('接口没有返回可用提示词')
			updatePromptNode(promptNode.id, {
				prompt,
				status: 'done',
				error: '',
				presetTitle: '反推提示词结果',
			})
			setCanvasNotice('反推提示词已写入节点，可继续生成图片')
		} catch (err) {
			updatePromptNode(promptNode.id, {
				status: 'error',
				error: err instanceof Error ? err.message : '图片提示词反推失败',
			})
		}
	}

	async function handleAgentSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const content = agentInput.trim()
		if ((!content && !agentReferenceImages.length) || agentBusy) return
		const referencedImages = getAgentReferenceImages()
		const referenceLabels = referencedImages.map(createAgentImageReferenceLabel)
		const referencePreviews = referencedImages.map(createAgentImageReference)

		const userMessage: AgentMessage = {
			id: createAgentMessageId('user'),
			role: 'user',
			content: content || '请根据我发送的图片参数继续创作。',
			references: referenceLabels,
			referenceImages: referencePreviews,
			status: 'done',
		}
		const pendingMessage: AgentMessage = {
			id: createAgentMessageId('assistant'),
			role: 'assistant',
			content: '正在理解画布和你的创作目标...',
			thinking: ['读取当前画布', '分析参考图和节点关系', '整理生成策略'],
			status: 'thinking',
		}
		const history = [...agentMessages, userMessage]
			.filter((message) => message.content.trim())
			.slice(-8)
			.map((message) => ({ role: message.role, content: message.content }))

		setAgentInput('')
		setAgentReferenceImageIds([])
		setAgentBusy(true)
		setModelError(null)
		setAgentMessages((current) => [...current, userMessage, pendingMessage])

		if (!apiReady) {
			setAgentMessages((current) =>
				current.map((message) =>
					message.id === pendingMessage.id
						? {
								...message,
								content: '图片和对话接口还没有配置。请点击顶部“检查接口”输入 API 密钥。',
								status: 'error',
							}
						: message
				)
			)
			setAgentBusy(false)
			return
		}

		try {
			const response = await fetch('/api/agent-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: activeTextModel,
					messages: history,
					canvasSummary: buildCanvasSummary(
						nodes,
						edges,
						selectedNodeIds,
						referencedImages.map((node) => node.id)
					),
					referenceImages: referencePreviews.map((reference) => ({
						id: reference.id,
						label: reference.label,
						title: reference.title,
						naturalWidth: reference.naturalWidth,
						naturalHeight: reference.naturalHeight,
						prompt: reference.prompt || '',
					})),
					autoGenerate: agentAutoGenerate,
				}),
			})
			const data = (await response.json()) as AgentChatResponse
			if (!response.ok) throw new Error(data.error || 'Agent 对话失败')

			const thinking = data.thinking?.length
				? data.thinking.slice(0, 5)
				: ['理解需求', '规划画面', '准备执行']
			const fallbackPrompt = createClientFallbackImagePrompt(
				content,
				referencedImages,
				referenceLabels
			)
			const prompt = data.prompt?.trim() || fallbackPrompt
			const shouldUseFallbackAction =
				prompt &&
				data.action === 'answer' &&
				fallbackPrompt &&
				shouldRequestImageGeneration(content)
			const action =
				shouldUseFallbackAction || !data.action
					? prompt
						? agentAutoGenerate
							? 'generate_image'
							: 'create_prompt'
						: 'answer'
					: data.action
			const size = normalizeAspectRatio(data.size)
			const count = normalizeGenerationCount(data.count || inferGenerationCountFromText(content))

			setAgentMessages((current) =>
				current.map((message) =>
					message.id === pendingMessage.id
						? {
								...message,
								content: data.message || '我已经整理好下一步。',
								thinking,
								action,
								prompt,
								size,
								references: referenceLabels,
								status: 'done',
							}
						: message
				)
			)

			if (prompt && (action === 'generate_image' || action === 'create_prompt')) {
				const sourceNodes = referencedImages.length ? referencedImages : getAgentSourceImages()
				const promptNode = createPromptNodeFromAgent(prompt, size, sourceNodes, count)
				if (action === 'generate_image' && agentAutoGenerate) {
					setCanvasNotice('Agent 正在生成图片')
					await generateImageForPromptNode(promptNode, sourceNodes)
				} else {
					setCanvasNotice('Agent 已创建提示词节点')
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Agent 对话失败'
			setAgentMessages((current) =>
				current.map((item) =>
					item.id === pendingMessage.id
						? {
								...item,
								content: message,
								thinking: ['请求 Agent 失败', '请检查接口配置或重试'],
								status: 'error',
							}
						: item
				)
			)
			setModelError(message)
		} finally {
			setAgentBusy(false)
		}
	}

	function getAgentReferenceImages() {
		if (agentReferenceImages.length) return agentReferenceImages
		return getAgentSourceImages()
	}

	function getAgentSourceImages() {
		const selectedImages = selectedNodeIds
			.map((id) => nodes.find((node) => node.id === id))
			.filter((node): node is ImageNode => Boolean(node && isImageNode(node)))
		if (selectedImages.length) return selectedImages

		const selectedPrompt = selectedNodeIds
			.map((id) => nodes.find((node) => node.id === id))
			.find((node): node is PromptNode => Boolean(node && isPromptNode(node)))
		if (selectedPrompt) {
			const sourceIds = selectedPrompt.sourceImageIds?.length
				? selectedPrompt.sourceImageIds
				: selectedPrompt.sourceImageId
					? [selectedPrompt.sourceImageId]
					: []
			const sources = sourceIds
				.map((id) => nodes.find((node) => node.id === id))
				.filter((node): node is ImageNode => Boolean(node && isImageNode(node)))
			if (sources.length) return sources
		}
		return []
	}

	function createPromptNodeFromAgent(
		prompt: string,
		size: AspectRatioId,
		sourceNodes: ImageNode[],
		count = 1
	) {
		const promptId = createNodeId('prompt')
		const sourceRect = sourceNodes[0] ? getNodeRect(sourceNodes[0]) : null
		const center = getViewportCenter()
		const promptNode = createPromptNode({
			id: promptId,
			sourceNodes,
			point: {
				x: sourceRect ? sourceRect.x + sourceRect.w + NODE_GAP : center.x - PROMPT_NODE_WIDTH / 2,
				y: sourceRect ? sourceRect.y : center.y - PROMPT_NODE_HEIGHT / 2,
			},
			prompt,
			size,
			count,
		})
		setNodes((current) => [...current, promptNode])
		if (sourceNodes.length) {
			setEdges((current) => [
				...current,
				...sourceNodes.map((sourceNode) => ({
					id: createEdgeId(),
					from: sourceNode.id,
					to: promptId,
				})),
			])
		}
		setSelectedNodeIds([promptId])
		focusCanvasPoint(getRectCenter(getNodeRect(promptNode)))
		return promptNode
	}

	function handleResetView() {
		setTransform({ x: 96, y: 108, zoom: 0.56 })
	}

	function focusCanvasPoint(point: Point) {
		const rect = viewportRef.current?.getBoundingClientRect()
		if (!rect) return
		setTransform((current) => ({
			...current,
			x: rect.width / 2 - point.x * current.zoom,
			y: rect.height / 2 - point.y * current.zoom,
		}))
	}

	function deleteNodes(nodeIds: string[]) {
		const ids = new Set(nodeIds)
		setNodes((current) => current.filter((node) => !ids.has(node.id)))
		setEdges((current) => current.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to)))
		setSelectedNodeIds((current) => current.filter((id) => !ids.has(id)))
		setGenerationMenu((current) => (current && ids.has(current.fromNodeId) ? null : current))
		setDraftConnection((current) => (current && ids.has(current.fromNodeId) ? null : current))
		setCanvasNotice(`已删除 ${ids.size} 个节点`)
	}

	function sendImageParametersToAgent(nodeId: string) {
		const node = nodes.find((item): item is ImageNode => item.id === nodeId && isImageNode(item))
		if (!node) return
		setAgentPanelOpen(true)
		setAgentReferenceImageIds((current) =>
			current.includes(node.id) ? current : [...current, node.id]
		)
		setAgentInput((current) => appendImageParameterBlock(current, node))
		setCanvasNotice(`已把「${node.title}」参数发送到 Agent`)
	}

	function removeAgentReferenceImage(nodeId: string) {
		setAgentReferenceImageIds((current) => current.filter((id) => id !== nodeId))
	}

	function addHistoryItemToCanvas(item: HistoryItem) {
		const center = getViewportCenter()
		const node: ImageNode = {
			id: createNodeId('image'),
			type: 'image',
			x: center.x - Math.max(MIN_IMAGE_NODE_WIDTH, item.displayWidth) / 2,
			y: center.y - item.displayHeight / 2,
			title: item.title,
			fileName: item.fileName,
			mimeType: item.mimeType,
			imageUrl: item.imageUrl,
			naturalWidth: item.naturalWidth,
			naturalHeight: item.naturalHeight,
			displayWidth: item.displayWidth,
			displayHeight: item.displayHeight,
			prompt: item.prompt,
		}
		setNodes((current) => [...current, node])
		setSelectedNodeIds([node.id])
		setCanvasNotice('历史图片已放入画布')
	}

	return (
		<div
			className="tap-canvas"
			data-file-dragging={isDraggingFile}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<header className="tap-canvas__topbar">
				<div className="tap-brand">
					<div className="tap-brand__mark">T</div>
					<div>
						<h1>Ai无限画布</h1>
						<p>把图片拖进画布，向右拖出生成链路</p>
					</div>
				</div>
				<div className="tap-toolbar">
					<button
						className="tap-status"
						type="button"
						data-state={apiStatus}
						onClick={() => setApiKeyPanelOpen(true)}
						title="配置 API 密钥"
					>
						{apiStatus === 'checking' ? '检查接口' : apiReady ? '接口已连接' : '检查接口'}
					</button>
					{apiReady && imageModels.length > 0 ? (
						<label className="tap-model-select">
							<span>模型</span>
							<select
								value={activeImageModel}
								onChange={(event) => setImageModel(event.target.value)}
							>
								{imageModels.map((model) => (
									<option key={model.id} value={model.id}>
										{model.label}
									</option>
								))}
							</select>
						</label>
					) : (
						<div className="tap-model-disabled">模型已隐藏</div>
					)}
				</div>
			</header>

			{apiKeyPanelOpen && (
				<ApiKeyPanel
					apiStatus={apiStatus}
					apiKeyInput={apiKeyInput}
					baseUrlInput={apiBaseUrlInput}
					saving={apiKeySaving}
					error={modelError}
					onApiKeyInputChange={setApiKeyInput}
					onBaseUrlInputChange={setApiBaseUrlInput}
					onClose={() => setApiKeyPanelOpen(false)}
					onSubmit={handleSaveApiKey}
					arkStatus={arkStatus}
					arkKeyInput={arkKeyInput}
					arkSaving={arkKeySaving}
					onArkKeyInputChange={setArkKeyInput}
					onArkSubmit={handleSaveArkKey}
				/>
			)}

			<CanvasLeftToolbar
				activeTool={activeTool}
				edgesVisible={edgesVisible}
				agentPanelOpen={agentPanelOpen}
				historyPanelOpen={historyPanelOpen}
				promptLibraryOpen={promptLibraryOpen}
				selectedImageCount={selectedImageNodes.length}
				onToolSelect={handleToolbarTool}
				onAlign={alignCanvasNodes}
				onToggleEdges={() => setEdgesVisible((current) => !current)}
				onToggleAgent={() => setAgentPanelOpen((current) => !current)}
				onToggleHistory={() => setHistoryPanelOpen((current) => !current)}
				onCreateImage={() => createBlankImagePromptPair(getViewportCenter())}
				onMotionTransfer={createMotionTransferPrompt}
				onCreateVideo={createVideoNodeFromSelection}
				onOpenExtension={openPromptExtension}
			/>

			<div className="tap-canvas__meta">
				<span>{imageNodeCount} 个图片节点</span>
				<span>{promptNodeCount} 个提示词节点</span>
				<span>{edges.length} 条连接线</span>
				<span>{selectedCount} 个已选</span>
				<span>{Math.round(transform.zoom * 100)}%</span>
			</div>

			{agentPanelOpen && (
				<AgentPanel
					messages={agentMessages}
					input={agentInput}
					busy={agentBusy}
					apiReady={apiReady}
					autoGenerate={agentAutoGenerate}
					textModels={textModels}
					activeTextModel={activeTextModel}
					referenceImages={agentReferenceImages}
					selectedCount={selectedCount}
					onInputChange={setAgentInput}
					onRemoveReferenceImage={removeAgentReferenceImage}
					onAutoGenerateChange={setAgentAutoGenerate}
					onTextModelChange={setTextModel}
					onSubmit={handleAgentSubmit}
				/>
			)}

			{historyPanelOpen && (
				<HistoryGallery
					items={filteredHistoryItems}
					totalCount={historyItems.length}
					search={historySearch}
					onSearchChange={setHistorySearch}
					onAddToCanvas={addHistoryItemToCanvas}
				/>
			)}

			{promptLibraryOpen && (
				<PromptLibraryPanel
					presets={PROMPT_LIBRARY_PRESETS}
					extensionUrl={WHITE_WUCHANG_EXTENSION_URL}
					onApplyPreset={applyPromptLibraryPreset}
					onClose={() => setPromptLibraryOpen(false)}
				/>
			)}

			<div
				ref={viewportRef}
				className="tap-canvas__viewport"
				onPointerDown={handleViewportPointerDown}
				onDoubleClick={handleViewportDoubleClick}
				onWheel={handleWheel}
			>
				<div
					className="tap-canvas__world"
					style={{
						transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
					}}
				>
					{edgesVisible && (
						<svg
							className="tap-canvas__edges"
							width="8000"
							height="6000"
							viewBox="-3000 -2200 8000 6000"
						>
							{edges.map((edge) => (
								<EdgePath key={edge.id} edge={edge} nodes={nodes} />
							))}
							{draftConnection && (
								<path
									className="tap-edge tap-edge--draft"
									d={createBezierPath(draftConnection.from, draftConnection.to)}
								/>
							)}
						</svg>
					)}
					{nodes.map((node) => {
						if (isImageNode(node)) {
							return (
								<ImageNodeView
									key={node.id}
									node={node}
									selected={selectedNodeIds.includes(node.id)}
									onPointerDown={handleNodePointerDown}
									onConnectorPointerDown={handleConnectorPointerDown}
									onPreview={(targetNode) => setPreviewImageNodeId(targetNode.id)}
									onDownload={downloadImageNode}
									onReference={sendImageParametersToAgent}
									onDelete={(targetNode) => deleteNodes([targetNode.id])}
									onWorkflowPreset={createWorkflowPromptFromImage}
									onCreateVideo={(targetNode) => createVideoNodeFromImages([targetNode])}
									onMotionTransfer={createMotionTransferPrompt}
									onAnnotationChange={(nodeId, paths) =>
										updateImageNode(nodeId, { annotations: paths })
									}
									onAnnotationNoteChange={(nodeId, annotationNote) =>
										updateImageNode(nodeId, { annotationNote })
									}
									onClearAnnotations={(nodeId) =>
										updateImageNode(nodeId, { annotations: [], annotationNote: '' })
									}
									onAnnotatedEdit={createAnnotatedEditPromptFromImage}
									referenceToken={node.prompt ? '生成图' : '图片'}
									selectionRole={selectedImageRoleById.get(node.id)}
									motionTransferReady={selectedImageNodes.length >= 2}
									annotationMode={annotationModeNodeId === node.id}
								/>
							)
						}
						if (isPromptNode(node)) {
							return (
								<PromptNodeView
									key={node.id}
									node={node}
									selected={selectedNodeIds.includes(node.id)}
									apiReady={apiReady}
									onPointerDown={handleNodePointerDown}
									onChange={updatePromptNode}
									onGenerate={handleGenerateImage}
									onDelete={(targetNode) => deleteNodes([targetNode.id])}
								/>
							)
						}
						if (isTextNode(node)) {
							return (
								<TextNodeView
									key={node.id}
									node={node}
									selected={selectedNodeIds.includes(node.id)}
									onPointerDown={handleNodePointerDown}
									onChange={updateTextNode}
									onDelete={(targetNode) => deleteNodes([targetNode.id])}
								/>
							)
						}
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
						return (
							<DoodleNodeView
								key={node.id}
								node={node as DoodleNode}
								selected={selectedNodeIds.includes(node.id)}
								onPointerDown={handleNodePointerDown}
								onChange={updateDoodleNode}
								onDelete={(targetNode) => deleteNodes([targetNode.id])}
							/>
						)
					})}
				</div>
			</div>

			{selectionBox && <SelectionBoxView selectionBox={selectionBox} />}

			{isDraggingFile && (
				<div className="tap-drop-hint">
					<div>松开鼠标，把图片添加到画布</div>
				</div>
			)}

			{generationMenu && (
				<div
					className="tap-generate-menu"
					style={{
						left: Math.min(generationMenu.screenPoint.x, window.innerWidth - 288),
						top: Math.min(generationMenu.screenPoint.y, window.innerHeight - 420),
					}}
				>
					<button type="button" onClick={handleCreatePromptFromMenu}>
						<span className="tap-generate-menu__icon">+</span>
						图片生成
					</button>
					<button type="button" onClick={handleCreateVideoFromMenu}>
						<span className="tap-generate-menu__icon">▶</span>
						生成视频
					</button>
					<div className="tap-generate-menu__presets" aria-label="工作流预设">
						{WORKFLOW_PRESETS.map((preset) => (
							<button
								key={preset.id}
								type="button"
								onClick={() => handleCreateWorkflowPresetFromMenu(preset.id)}
							>
								<strong>{preset.title}</strong>
								<small>{preset.description}</small>
							</button>
						))}
					</div>
				</div>
			)}

			{quickActionMenu && (
				<QuickActionMenuView
					menu={quickActionMenu}
					onAction={handleQuickAction}
					onClose={() => setQuickActionMenu(null)}
				/>
			)}

			{previewImageNode && (
				<ImagePreviewOverlay
					node={previewImageNode}
					onClose={() => setPreviewImageNodeId(null)}
					onDownload={downloadImageNode}
				/>
			)}

			{(canvasNotice || modelError) && (
				<div className="tap-toast" role="status">
					{canvasNotice || modelError}
				</div>
			)}
		</div>
	)
}

function CanvasLeftToolbar({
	activeTool,
	edgesVisible,
	agentPanelOpen,
	historyPanelOpen,
	promptLibraryOpen,
	selectedImageCount,
	onToolSelect,
	onAlign,
	onToggleEdges,
	onToggleAgent,
	onToggleHistory,
	onCreateImage,
	onMotionTransfer,
	onCreateVideo,
	onOpenExtension,
}: {
	activeTool: ToolbarTool
	edgesVisible: boolean
	agentPanelOpen: boolean
	historyPanelOpen: boolean
	promptLibraryOpen: boolean
	selectedImageCount: number
	onToolSelect(tool: ToolbarTool): void
	onAlign(mode: 'left' | 'center' | 'right'): void
	onToggleEdges(): void
	onToggleAgent(): void
	onToggleHistory(): void
	onCreateImage(): void
	onMotionTransfer(): void
	onCreateVideo(): void
	onOpenExtension(): void
}) {
	const [alignMenuOpen, setAlignMenuOpen] = useState(false)

	function handleAlign(mode: 'left' | 'center' | 'right') {
		onAlign(mode)
		setAlignMenuOpen(false)
	}

	return (
		<aside className="tap-left-toolbar" onPointerDown={(event) => event.stopPropagation()}>
			<div className="tap-left-toolbar__group" aria-label="布局工具">
				<div className="tap-left-toolbar__toolwrap">
					<button
						type="button"
						data-active={alignMenuOpen}
						onClick={() => setAlignMenuOpen((current) => !current)}
						title="画布对齐"
						aria-label="画布对齐"
					>
						<Icon name="align" />
					</button>
					{alignMenuOpen && (
						<div className="tap-left-toolbar__popover" aria-label="对齐选项">
							<button
								type="button"
								onClick={() => handleAlign('left')}
								title="左对齐"
								aria-label="左对齐"
							>
								<Icon name="alignLeft" />
							</button>
							<button
								type="button"
								onClick={() => handleAlign('center')}
								title="居中对齐"
								aria-label="居中对齐"
							>
								<Icon name="alignCenter" />
							</button>
							<button
								type="button"
								onClick={() => handleAlign('right')}
								title="右对齐"
								aria-label="右对齐"
							>
								<Icon name="alignRight" />
							</button>
						</div>
					)}
				</div>
				<button
					type="button"
					data-active={activeTool === 'select'}
					onClick={() => onToolSelect('select')}
					title="选择"
					aria-label="选择"
				>
					<Icon name="cursor" />
				</button>
			</div>
			<div className="tap-left-toolbar__group" aria-label="创作工具">
				<button
					type="button"
					data-active={activeTool === 'text'}
					onClick={() => onToolSelect('text')}
					title="文本工具"
					aria-label="文本工具"
				>
					<Icon name="text" />
				</button>
				<button
					type="button"
					data-active={activeTool === 'annotate'}
					onClick={() => onToolSelect('annotate')}
					title="图片标注"
					aria-label="图片标注"
				>
					<Icon name="annotate" />
				</button>
				<button
					type="button"
					onClick={onCreateImage}
					title="空白图片节点"
					aria-label="空白图片节点"
				>
					<Icon name="image" />
				</button>
			</div>
			<div className="tap-left-toolbar__group" aria-label="面板">
				<button
					type="button"
					data-active={edgesVisible}
					onClick={onToggleEdges}
					title="隐藏或显示连线"
					aria-label="隐藏或显示连线"
				>
					<Icon name="link" />
				</button>
				<button
					type="button"
					data-active={historyPanelOpen}
					onClick={onToggleHistory}
					title="图库历史"
					aria-label="图库历史"
				>
					<Icon name="history" />
				</button>
				<button
					type="button"
					data-active={agentPanelOpen}
					onClick={onToggleAgent}
					title="Agent 对话"
					aria-label="Agent 对话"
				>
					<Icon name="bot" />
				</button>
			</div>
			<div className="tap-left-toolbar__group" aria-label="AI 工作流">
				<button
					type="button"
					data-active={selectedImageCount >= 2}
					onClick={onMotionTransfer}
					title="动作迁移"
					aria-label="动作迁移"
				>
					<Icon name="motion" />
				</button>
				<button
					type="button"
					onClick={onCreateVideo}
					title="生成视频（Seedance 2.0）"
					aria-label="生成视频"
				>
					<Icon name="video" />
				</button>
				<button
					type="button"
					data-active={promptLibraryOpen}
					onClick={onOpenExtension}
					title="白无常AI提示词宝典"
					aria-label="白无常AI提示词宝典"
				>
					<Icon name="book" />
				</button>
			</div>
		</aside>
	)
}

function Icon({
	name,
}: {
	name:
		| 'align'
		| 'alignLeft'
		| 'alignCenter'
		| 'alignRight'
		| 'annotate'
		| 'book'
		| 'bot'
		| 'cursor'
		| 'history'
		| 'image'
		| 'link'
		| 'motion'
		| 'text'
		| 'trash'
		| 'video'
		| 'wand'
}) {
	const common = {
		width: 20,
		height: 20,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 2,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		'aria-hidden': true,
	}

	if (name === 'align') {
		return (
			<svg {...common}>
				<path d="M5 6h14" />
				<path d="M8 12h8" />
				<path d="M6 18h12" />
			</svg>
		)
	}
	if (name === 'alignLeft') {
		return (
			<svg {...common}>
				<path d="M5 5v14" />
				<path d="M8 7h11" />
				<path d="M8 12h7" />
				<path d="M8 17h10" />
			</svg>
		)
	}
	if (name === 'alignCenter') {
		return (
			<svg {...common}>
				<path d="M12 5v14" />
				<path d="M6 7h12" />
				<path d="M8 12h8" />
				<path d="M7 17h10" />
			</svg>
		)
	}
	if (name === 'alignRight') {
		return (
			<svg {...common}>
				<path d="M19 5v14" />
				<path d="M5 7h11" />
				<path d="M9 12h7" />
				<path d="M6 17h10" />
			</svg>
		)
	}
	if (name === 'annotate') {
		return (
			<svg {...common}>
				<path d="M4 18l5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9-1 5z" />
				<path d="M14 6l3 3" />
				<path d="M4 21h12" />
			</svg>
		)
	}
	if (name === 'book') {
		return (
			<svg {...common}>
				<path d="M5 4h8a3 3 0 0 1 3 3v15H8a3 3 0 0 0-3-3z" />
				<path d="M16 7h3v15" />
				<path d="M8 8h6" />
				<path d="M8 12h5" />
			</svg>
		)
	}
	if (name === 'bot') {
		return (
			<svg {...common}>
				<path d="M12 4v3" />
				<rect x="5" y="7" width="14" height="12" rx="3" />
				<path d="M9 12h.01" />
				<path d="M15 12h.01" />
				<path d="M9 16h6" />
			</svg>
		)
	}
	if (name === 'cursor') {
		return (
			<svg {...common}>
				<path d="M6 4l11 8-6 1-3 5z" />
			</svg>
		)
	}
	if (name === 'history') {
		return (
			<svg {...common}>
				<path d="M7 7h12v12H7z" />
				<path d="M4 4h12" />
				<path d="M4 4v12" />
				<path d="M10 12h6" />
				<path d="M10 15h4" />
			</svg>
		)
	}
	if (name === 'image') {
		return (
			<svg {...common}>
				<rect x="4" y="5" width="16" height="14" rx="2" />
				<path d="M7 16l4-4 3 3 2-2 3 3" />
				<path d="M15 9h.01" />
			</svg>
		)
	}
	if (name === 'link') {
		return (
			<svg {...common}>
				<path d="M8 12h8" />
				<path d="M9 7H7a5 5 0 0 0 0 10h2" />
				<path d="M15 7h2a5 5 0 0 1 0 10h-2" />
			</svg>
		)
	}
	if (name === 'motion') {
		return (
			<svg {...common}>
				<path d="M6 17c4-8 8-8 12-4" />
				<path d="M15 9h5v5" />
				<circle cx="7" cy="7" r="2" />
				<path d="M7 9v5l-3 3" />
			</svg>
		)
	}
	if (name === 'text') {
		return (
			<svg {...common}>
				<path d="M5 6h14" />
				<path d="M12 6v14" />
				<path d="M9 20h6" />
			</svg>
		)
	}
	if (name === 'video') {
		return (
			<svg {...common}>
				<rect x="3" y="6" width="13" height="12" rx="2" />
				<path d="M16 10l5-3v10l-5-3" />
			</svg>
		)
	}
	if (name === 'trash') {
		return (
			<svg {...common}>
				<path d="M5 7h14" />
				<path d="M9 7V5h6v2" />
				<path d="M8 10l1 9h6l1-9" />
			</svg>
		)
	}
	return (
		<svg {...common}>
			<path d="M4 20l12-12" />
			<path d="M14 4l2 2" />
			<path d="M18 8l2 2" />
			<path d="M8 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
		</svg>
	)
}

function QuickActionMenuView({
	menu,
	onAction,
	onClose,
}: {
	menu: QuickActionMenu
	onAction(action: 'image' | 'text' | 'annotate' | 'motion' | 'video' | 'agent'): void
	onClose(): void
}) {
	return (
		<div
			className="tap-quick-menu"
			style={{
				left: Math.min(menu.screenPoint.x, window.innerWidth - 236),
				top: Math.min(menu.screenPoint.y, window.innerHeight - 300),
			}}
			onPointerDown={(event) => event.stopPropagation()}
		>
			<header>
				<strong>快捷功能</strong>
				<button type="button" onClick={onClose} aria-label="关闭快捷菜单">
					×
				</button>
			</header>
			<button type="button" onClick={() => onAction('image')}>
				<span>生成图片</span>
				<small>空白图片节点 + 提示词框</small>
			</button>
			<button type="button" onClick={() => onAction('text')}>
				<span>添加文本</span>
				<small>类似设计工具的文本层</small>
			</button>
			<button type="button" onClick={() => onAction('annotate')}>
				<span>图片标注</span>
				<small>直接在选中图片上圈选局部修改区域</small>
			</button>
			<button type="button" onClick={() => onAction('motion')}>
				<span>动作迁移</span>
				<small>需要先选中两张图片</small>
			</button>
			<button type="button" onClick={() => onAction('video')}>
				<span>生成视频</span>
				<small>Seedance 2.0，选中图片可作首帧/参考图</small>
			</button>
			<button type="button" onClick={() => onAction('agent')}>
				<span>调出 Agent</span>
				<small>打开右侧对话模式</small>
			</button>
		</div>
	)
}

function ImageNodeView({
	node,
	selected,
	referenceToken,
	onPointerDown,
	onConnectorPointerDown,
	onPreview,
	onDownload,
	onReference,
	onDelete,
	onWorkflowPreset,
	onCreateVideo,
	onMotionTransfer,
	onAnnotationChange,
	onAnnotationNoteChange,
	onClearAnnotations,
	onAnnotatedEdit,
	selectionRole,
	motionTransferReady,
	annotationMode,
}: {
	node: ImageNode
	selected: boolean
	referenceToken: string
	selectionRole?: ImageSelectionRole
	motionTransferReady: boolean
	annotationMode: boolean
	onPointerDown(event: ReactPointerEvent<HTMLElement>, node: CanvasNode): void
	onConnectorPointerDown(event: ReactPointerEvent<HTMLButtonElement>, node: ImageNode): void
	onPreview(node: ImageNode): void
	onDownload(node: ImageNode): void
	onReference(nodeId: string): void
	onDelete(node: ImageNode): void
	onWorkflowPreset(node: ImageNode, presetId: WorkflowPresetId): void
	onCreateVideo(node: ImageNode): void
	onMotionTransfer(): void
	onAnnotationChange(nodeId: string, paths: string[]): void
	onAnnotationNoteChange(nodeId: string, note: string): void
	onClearAnnotations(nodeId: string): void
	onAnnotatedEdit(node: ImageNode): void
}) {
	const size = getNodeSize(node)
	const [draftAnnotationPath, setDraftAnnotationPath] = useState('')
	const annotationPointsRef = useRef<Point[]>([])
	const annotations = node.annotations || []

	function getAnnotationPoint(event: ReactPointerEvent<SVGSVGElement>): Point {
		const rect = event.currentTarget.getBoundingClientRect()
		return {
			x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * node.displayWidth,
			y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * node.displayHeight,
		}
	}

	function handleAnnotationPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
		if (!annotationMode) return
		event.stopPropagation()
		event.preventDefault()
		const point = getAnnotationPoint(event)
		annotationPointsRef.current = [point]
		setDraftAnnotationPath(pointsToSvgPath(annotationPointsRef.current))
		event.currentTarget.setPointerCapture(event.pointerId)
	}

	function handleAnnotationPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
		if (!annotationMode || !annotationPointsRef.current.length) return
		event.stopPropagation()
		const point = getAnnotationPoint(event)
		annotationPointsRef.current = [...annotationPointsRef.current, point]
		setDraftAnnotationPath(pointsToSvgPath(annotationPointsRef.current))
	}

	function commitAnnotationPath(event: ReactPointerEvent<SVGSVGElement>) {
		if (!annotationMode || !annotationPointsRef.current.length) return
		event.stopPropagation()
		const nextPath = pointsToSvgPath(annotationPointsRef.current)
		annotationPointsRef.current = []
		setDraftAnnotationPath('')
		if (nextPath) onAnnotationChange(node.id, [...annotations, nextPath])
	}

	return (
		<article
			className="tap-node tap-node--image"
			data-selected={selected}
			data-annotation-mode={annotationMode}
			style={{ left: node.x, top: node.y, width: size.w, height: size.h }}
			onPointerDown={(event) => onPointerDown(event, node)}
		>
			<header className="tap-node__header">
				<div className="tap-node__titleline">
					<span>{referenceToken || '图片'}</span>
					{selectionRole && (
						<em className="tap-node__role-badge" data-role={selectionRole}>
							{selectionRole === 'identity' ? '图1 保持形象' : '图2 参考动作'}
						</em>
					)}
				</div>
				<strong>{node.title}</strong>
			</header>
			<button
				className="tap-image-frame"
				type="button"
				style={{ width: node.displayWidth, height: node.displayHeight }}
				onClick={(event) => {
					if (annotationMode) return
					event.stopPropagation()
					onPreview(node)
				}}
				aria-label={`放大查看 ${node.title}`}
			>
				<img src={node.imageUrl} alt={node.title} draggable={false} />
				<svg
					className="tap-image-annotation-layer"
					viewBox={`0 0 ${node.displayWidth} ${node.displayHeight}`}
					data-active={annotationMode}
					onPointerDown={handleAnnotationPointerDown}
					onPointerMove={handleAnnotationPointerMove}
					onPointerUp={commitAnnotationPath}
					onPointerCancel={commitAnnotationPath}
				>
					{annotations.map((path, index) => (
						<path key={`${node.id}-annotation-${index}`} d={path} />
					))}
					{draftAnnotationPath ? <path d={draftAnnotationPath} data-draft="true" /> : null}
				</svg>
			</button>
			<div className="tap-node__footer">
				<button type="button" onClick={() => onDownload(node)}>
					下载原图
				</button>
				<button type="button" onClick={() => onReference(node.id)}>
					参数
				</button>
				<button type="button" onClick={() => onDelete(node)}>
					删除
				</button>
				<span>
					{node.naturalWidth}×{node.naturalHeight}
				</span>
			</div>
			{selected && (
				<div
					className="tap-node__workflow-presets"
					onPointerDown={(event) => event.stopPropagation()}
				>
					{(annotationMode || annotations.length > 0 || node.annotationNote) && (
						<div className="tap-node__annotation-panel">
							<div>
								<strong>图片标注</strong>
								<span>直接在图片上圈选局部，红色标注只作为 AI 修改指令</span>
							</div>
							<textarea
								value={node.annotationNote || ''}
								onChange={(event) => onAnnotationNoteChange(node.id, event.target.value)}
								placeholder="例如：把圈出的区域改成粉色，其他部分不变"
								rows={2}
							/>
							<div className="tap-node__annotation-actions">
								<button type="button" onClick={() => onAnnotatedEdit(node)}>
									<Icon name="wand" />
									<span>标注局改</span>
								</button>
								<button type="button" onClick={() => onClearAnnotations(node.id)}>
									<Icon name="trash" />
									<span>清除</span>
								</button>
							</div>
						</div>
					)}
					{motionTransferReady && selectionRole === 'identity' && (
						<button className="tap-node__workflow-motion" type="button" onClick={onMotionTransfer}>
							<strong>动作迁移</strong>
							<span>图1保持形象，图2只提供动作姿态</span>
						</button>
					)}
					<button
						className="tap-node__workflow-motion"
						type="button"
						onClick={() => onCreateVideo(node)}
					>
						<strong>视频生成</strong>
						<span>以这张图为首帧生成 Seedance 视频</span>
					</button>
					{WORKFLOW_PRESETS.map((preset) => (
						<button key={preset.id} type="button" onClick={() => onWorkflowPreset(node, preset.id)}>
							<strong>{preset.title}</strong>
							<span>{preset.description}</span>
						</button>
					))}
				</div>
			)}
			<button
				className="tap-node__connector"
				type="button"
				aria-label="从图片节点拖出连接线"
				onPointerDown={(event) => onConnectorPointerDown(event, node)}
			>
				+
			</button>
		</article>
	)
}

function PromptNodeView({
	node,
	selected,
	apiReady,
	onPointerDown,
	onChange,
	onGenerate,
	onDelete,
}: {
	node: PromptNode
	selected: boolean
	apiReady: boolean
	onPointerDown(event: ReactPointerEvent<HTMLElement>, node: CanvasNode): void
	onChange(nodeId: string, patch: Partial<PromptNode>): void
	onGenerate(event: FormEvent<HTMLFormElement>, node: PromptNode): void
	onDelete(node: PromptNode): void
}) {
	const isGenerating = node.status === 'generating'
	const size = getNodeSize(node)
	return (
		<form
			className="tap-node tap-node--prompt"
			data-selected={selected}
			style={{ left: node.x, top: node.y, width: size.w, height: size.h }}
			onPointerDown={(event) => onPointerDown(event, node)}
			onSubmit={(event) => onGenerate(event, node)}
		>
			<header className="tap-node__header">
				<span>提示词</span>
				<div className="tap-node__header-actions">
					<strong>{node.presetTitle || '图片生成'}</strong>
					<button type="button" onClick={() => onDelete(node)} aria-label="删除提示词节点">
						删除
					</button>
				</div>
			</header>
			<label className="tap-prompt-field">
				<span>提示词输入框</span>
				<textarea
					value={node.prompt}
					onChange={(event) => onChange(node.id, { prompt: event.target.value, error: '' })}
					placeholder="输入你想生成的画面"
					rows={5}
				/>
			</label>
			<div className="tap-size-group" role="radiogroup" aria-label="尺寸选择">
				{ASPECT_RATIOS.map((size) => (
					<button
						key={size.id}
						type="button"
						data-selected={node.size === size.id}
						onClick={() => onChange(node.id, { size: size.id, error: '' })}
					>
						{size.label}
					</button>
				))}
			</div>
			<div className="tap-count-group" role="radiogroup" aria-label="生成数量">
				{[1, 2, 3, 4].map((count) => (
					<button
						key={count}
						type="button"
						data-selected={normalizeGenerationCount(node.count) === count}
						onClick={() => onChange(node.id, { count, error: '' })}
					>
						{count} 张
					</button>
				))}
			</div>
			{node.error && <div className="tap-node__error">{node.error}</div>}
			<button
				className="tap-generate-button"
				type="submit"
				disabled={isGenerating || !node.prompt.trim() || !apiReady}
			>
				{isGenerating ? '生成中' : apiReady ? '生成图片' : '接口未配置'}
			</button>
		</form>
	)
}

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
	onPointerDown(event: ReactPointerEvent<HTMLElement>, node: CanvasNode): void
	onChange(nodeId: string, patch: Partial<VideoNode>): void
	onGenerate(node: VideoNode): void
	onCancel(node: VideoNode): void
	onDelete(node: VideoNode): void
}) {
	const size = getNodeSize(node)
	const isWorking =
		node.status === 'submitting' || node.status === 'queued' || node.status === 'running'
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
							onChange(node.id, {
								resolution: event.target.value as VideoResolution,
								errorMessage: null,
							})
						}
					>
						{VIDEO_RESOLUTION_OPTIONS.map((resolution) => (
							<option
								key={resolution}
								value={resolution}
								disabled={isFastModel && resolution === '1080p'}
							>
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
						onChange={(event) =>
							onChange(node.id, { ratio: event.target.value as VideoRatio, errorMessage: null })
						}
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
						onChange={(event) =>
							onChange(node.id, { duration: Number(event.target.value), errorMessage: null })
						}
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
					onChange={(event) =>
						onChange(node.id, { generateAudio: event.target.checked, errorMessage: null })
					}
				/>
				<span>生成原生音频</span>
			</label>
			<label className="tap-prompt-field">
				<span>视频提示词</span>
				<textarea
					value={node.prompt}
					onChange={(event) =>
						onChange(node.id, { prompt: event.target.value, errorMessage: null })
					}
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
				<div className={isWorking ? 'tap-video-warning' : 'tap-node__error'}>
					{node.errorMessage}
				</div>
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
					{isWorking
						? '生成中'
						: arkReady
							? isFinished
								? '重新生成'
								: '生成视频'
							: 'ARK 接口未配置'}
				</button>
			</div>
		</form>
	)
}

function TextNodeView({
	node,
	selected,
	onPointerDown,
	onChange,
	onDelete,
}: {
	node: TextNode
	selected: boolean
	onPointerDown(event: ReactPointerEvent<HTMLElement>, node: CanvasNode): void
	onChange(nodeId: string, patch: Partial<TextNode>): void
	onDelete(node: TextNode): void
}) {
	const size = getNodeSize(node)
	return (
		<article
			className="tap-node tap-node--text"
			data-selected={selected}
			style={{ left: node.x, top: node.y, width: size.w, height: size.h }}
			onPointerDown={(event) => onPointerDown(event, node)}
		>
			<header className="tap-node__header">
				<span>文本工具</span>
				<div className="tap-node__header-actions">
					<strong>MasterGo 式文本层</strong>
					<button type="button" onClick={() => onDelete(node)} aria-label="删除文本节点">
						删除
					</button>
				</div>
			</header>
			<label className="tap-text-field">
				<span>文本内容</span>
				<textarea
					value={node.text}
					onChange={(event) => onChange(node.id, { text: event.target.value })}
					placeholder="输入标题、说明或画面标注"
					rows={5}
				/>
			</label>
		</article>
	)
}

function DoodleNodeView({
	node,
	selected,
	onPointerDown,
	onChange,
	onDelete,
}: {
	node: DoodleNode
	selected: boolean
	onPointerDown(event: ReactPointerEvent<HTMLElement>, node: CanvasNode): void
	onChange(nodeId: string, patch: Partial<DoodleNode>): void
	onDelete(node: DoodleNode): void
}) {
	const size = getNodeSize(node)
	const stageWidth = Math.max(160, size.w - 24)
	const stageHeight = Math.max(140, size.h - 84)
	const [draftPath, setDraftPath] = useState('')
	const pointsRef = useRef<Point[]>([])

	function getLocalPoint(event: ReactPointerEvent<SVGSVGElement>): Point {
		const rect = event.currentTarget.getBoundingClientRect()
		return {
			x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * stageWidth,
			y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * stageHeight,
		}
	}

	function handleDoodlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
		event.stopPropagation()
		event.preventDefault()
		const point = getLocalPoint(event)
		pointsRef.current = [point]
		setDraftPath(pointsToSvgPath(pointsRef.current))
		event.currentTarget.setPointerCapture(event.pointerId)
	}

	function handleDoodlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
		if (!pointsRef.current.length) return
		event.stopPropagation()
		const point = getLocalPoint(event)
		pointsRef.current = [...pointsRef.current, point]
		setDraftPath(pointsToSvgPath(pointsRef.current))
	}

	function commitDoodlePath(event: ReactPointerEvent<SVGSVGElement>) {
		if (!pointsRef.current.length) return
		event.stopPropagation()
		const nextPath = pointsToSvgPath(pointsRef.current)
		pointsRef.current = []
		setDraftPath('')
		if (nextPath) onChange(node.id, { paths: [...node.paths, nextPath] })
	}

	return (
		<article
			className="tap-node tap-node--doodle"
			data-selected={selected}
			style={{ left: node.x, top: node.y, width: size.w, height: size.h }}
			onPointerDown={(event) => onPointerDown(event, node)}
		>
			<header className="tap-node__header">
				<span>涂鸦绘画</span>
				<div className="tap-node__header-actions">
					<strong>{node.title}</strong>
					<button type="button" onClick={() => onChange(node.id, { paths: [] })}>
						清空
					</button>
					<button type="button" onClick={() => onDelete(node)} aria-label="删除涂鸦节点">
						删除
					</button>
				</div>
			</header>
			<svg
				className="tap-doodle-stage"
				viewBox={`0 0 ${stageWidth} ${stageHeight}`}
				onPointerDown={handleDoodlePointerDown}
				onPointerMove={handleDoodlePointerMove}
				onPointerUp={commitDoodlePath}
				onPointerCancel={commitDoodlePath}
			>
				<rect width={stageWidth} height={stageHeight} />
				{node.paths.map((path, index) => (
					<path key={`${node.id}-path-${index}`} d={path} />
				))}
				{draftPath ? <path d={draftPath} data-draft="true" /> : null}
			</svg>
		</article>
	)
}

function PromptLibraryPanel({
	presets,
	extensionUrl,
	onApplyPreset,
	onClose,
}: {
	presets: PromptLibraryPreset[]
	extensionUrl: string
	onApplyPreset(preset: PromptLibraryPreset): void
	onClose(): void
}) {
	return (
		<aside className="tap-prompt-library" onPointerDown={(event) => event.stopPropagation()}>
			<header className="tap-prompt-library__header">
				<div>
					<h2>白无常 AI 提示词宝典</h2>
					<p>已内嵌到画布：选中图片或提示词节点后，可直接套用。</p>
				</div>
				<button type="button" onClick={onClose} aria-label="关闭提示词宝典">
					×
				</button>
			</header>
			<div className="tap-prompt-library__detail">
				<strong>使用方式</strong>
				<p>
					点击「使用」会优先插入当前提示词节点；如果没有选中提示词，会根据当前选中图片创建新的工作流节点。
				</p>
				<a href={extensionUrl} target="_blank" rel="noreferrer">
					查看 Chrome Web Store 详情
				</a>
			</div>
			<div className="tap-prompt-library__list">
				{presets.map((preset) => (
					<article key={preset.id} className="tap-prompt-library__item">
						<div>
							<span>{preset.category}</span>
							<strong>{preset.title}</strong>
							<p>{preset.description}</p>
						</div>
						<button type="button" onClick={() => onApplyPreset(preset)}>
							<Icon name="wand" />
							<span>使用</span>
						</button>
					</article>
				))}
			</div>
		</aside>
	)
}

function ApiKeyPanel({
	apiStatus,
	apiKeyInput,
	baseUrlInput,
	saving,
	error,
	onApiKeyInputChange,
	onBaseUrlInputChange,
	onClose,
	onSubmit,
	arkStatus,
	arkKeyInput,
	arkSaving,
	onArkKeyInputChange,
	onArkSubmit,
}: {
	apiStatus: ApiStatus
	apiKeyInput: string
	baseUrlInput: string
	saving: boolean
	error: string | null
	onApiKeyInputChange(value: string): void
	onBaseUrlInputChange(value: string): void
	onClose(): void
	onSubmit(event: FormEvent<HTMLFormElement>): void
	arkStatus: ApiStatus
	arkKeyInput: string
	arkSaving: boolean
	onArkKeyInputChange(value: string): void
	onArkSubmit(event: FormEvent<HTMLFormElement>): void
}) {
	return (
		<section className="tap-api-key-panel" onPointerDown={(event) => event.stopPropagation()}>
			<header>
				<div>
					<h2>接口配置</h2>
					<p>
						{apiStatus === 'ready'
							? '当前接口已连接，可在这里替换密钥。'
							: '输入你自己的 API 密钥后即可使用图片生成与 Agent。'}
					</p>
				</div>
				<button type="button" onClick={onClose} aria-label="关闭接口配置">
					x
				</button>
			</header>
			<form onSubmit={onSubmit}>
				<label>
					<span>API 密钥</span>
					<input
						type="password"
						value={apiKeyInput}
						onChange={(event) => onApiKeyInputChange(event.target.value)}
						placeholder="例如 sk-... 或你的 OpenAI-compatible 网关密钥"
						autoComplete="off"
					/>
				</label>
				<label>
					<span>网关地址（可选）</span>
					<input
						value={baseUrlInput}
						onChange={(event) => onBaseUrlInputChange(event.target.value)}
						placeholder="默认 https://api.openai.com，可填自定义 /v1 网关"
						autoComplete="off"
					/>
				</label>
				{error ? <div className="tap-api-key-panel__error">{error}</div> : null}
				<div className="tap-api-key-panel__actions">
					<button type="button" onClick={onClose}>
						取消
					</button>
					<button type="submit" disabled={saving || !apiKeyInput.trim()}>
						{saving ? '保存中' : '保存并检查'}
					</button>
				</div>
			</form>
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
		</section>
	)
}

function ImagePreviewOverlay({
	node,
	onClose,
	onDownload,
}: {
	node: ImageNode
	onClose(): void
	onDownload(node: ImageNode): void
}) {
	return (
		<div className="tap-image-preview" role="dialog" aria-modal="true" onPointerDown={onClose}>
			<section
				className="tap-image-preview__surface"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<header>
					<div>
						<span>{node.prompt ? '生成图片' : '图片预览'}</span>
						<h2>{node.title}</h2>
						<p>
							{node.naturalWidth} x {node.naturalHeight} · {node.fileName}
						</p>
					</div>
					<div className="tap-image-preview__actions">
						<button type="button" onClick={() => onDownload(node)}>
							下载原图
						</button>
						<button type="button" onClick={onClose} aria-label="关闭图片预览">
							x
						</button>
					</div>
				</header>
				<div className="tap-image-preview__stage">
					<img src={node.imageUrl} alt={node.title} draggable={false} />
				</div>
				{node.prompt ? (
					<div className="tap-image-preview__prompt">
						<span>来源提示词</span>
						<p>{node.prompt}</p>
					</div>
				) : null}
			</section>
		</div>
	)
}

function AgentPanel({
	messages,
	input,
	busy,
	apiReady,
	autoGenerate,
	textModels,
	activeTextModel,
	referenceImages,
	selectedCount,
	onInputChange,
	onRemoveReferenceImage,
	onAutoGenerateChange,
	onTextModelChange,
	onSubmit,
}: {
	messages: AgentMessage[]
	input: string
	busy: boolean
	apiReady: boolean
	autoGenerate: boolean
	textModels: ModelOption[]
	activeTextModel: string
	referenceImages: ImageNode[]
	selectedCount: number
	onInputChange(value: string): void
	onRemoveReferenceImage(nodeId: string): void
	onAutoGenerateChange(value: boolean): void
	onTextModelChange(value: string): void
	onSubmit(event: FormEvent<HTMLFormElement>): void
}) {
	const threadRef = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		const thread = threadRef.current
		if (!thread) return
		thread.scrollTop = thread.scrollHeight
	}, [messages])

	return (
		<aside className="tap-agent-panel" onPointerDown={(event) => event.stopPropagation()}>
			<header className="tap-agent-panel__header">
				<div>
					<h2>Agent 创作助手</h2>
					<p>{selectedCount ? `已读取 ${selectedCount} 个选中节点` : '读取整张画布上下文'}</p>
				</div>
				<div
					className="tap-agent-panel__badge"
					data-state={busy ? 'thinking' : apiReady ? 'ready' : 'missing'}
				>
					{busy ? '思考中' : apiReady ? '可生成' : '未配置'}
				</div>
			</header>

			<div ref={threadRef} className="tap-agent-thread" aria-live="polite">
				{messages.map((message) => (
					<div
						key={message.id}
						className="tap-agent-message"
						data-role={message.role}
						data-status={message.status}
					>
						<div className="tap-agent-message__role">
							{message.role === 'user' ? '你' : 'Agent'}
						</div>
						<div className="tap-agent-message__body">
							<p>{message.content}</p>
							{message.references?.length ? (
								<div className="tap-agent-reference-row">
									{message.references.map((token) => (
										<span key={`${message.id}-${token}`}>{token}</span>
									))}
								</div>
							) : null}
							{message.referenceImages?.length ? (
								<div className="tap-agent-message-images" aria-label="发送给 Agent 的图片">
									{message.referenceImages.map((reference) => (
										<figure key={`${message.id}-${reference.id}`}>
											<img src={reference.imageUrl} alt={reference.title} draggable={false} />
											<figcaption>
												<strong>{reference.title}</strong>
												<span>
													{reference.naturalWidth}x{reference.naturalHeight}
												</span>
											</figcaption>
										</figure>
									))}
								</div>
							) : null}
							{message.thinking?.length ? (
								<div className="tap-agent-thinking">
									<span>思考摘要</span>
									<ol>
										{message.thinking.map((item, index) => (
											<li key={`${message.id}-thinking-${index}`}>{item}</li>
										))}
									</ol>
								</div>
							) : null}
							{message.prompt ? (
								<div className="tap-agent-prompt-preview">
									<span>生成提示词</span>
									<p>{message.prompt}</p>
									{message.size ? <small>{message.size}</small> : null}
								</div>
							) : null}
						</div>
					</div>
				))}
			</div>

			<form className="tap-agent-compose" onSubmit={onSubmit}>
				{referenceImages.length ? (
					<div className="tap-agent-reference-picker" aria-label="已发送图片参数">
						<span>已发送图片参数</span>
						<div className="tap-agent-reference-list">
							{referenceImages.map((reference) => (
								<article key={reference.id} className="tap-agent-reference-card">
									<img src={reference.imageUrl} alt={reference.title} draggable={false} />
									<div>
										<strong>{reference.title}</strong>
										<span>
											{reference.naturalWidth}x{reference.naturalHeight}
										</span>
									</div>
									<button
										type="button"
										onClick={() => onRemoveReferenceImage(reference.id)}
										title={`移除 ${reference.title}`}
									>
										x
									</button>
								</article>
							))}
						</div>
					</div>
				) : null}
				<textarea
					value={input}
					onChange={(event) => onInputChange(event.target.value)}
					placeholder="描述你想生成或修改的画面；选中图片后点击“参数”，图片参数会自动发送到这里"
					rows={4}
				/>
				<div className="tap-agent-compose__controls">
					<label className="tap-agent-model">
						<span>文本模型</span>
						<select
							value={activeTextModel}
							onChange={(event) => onTextModelChange(event.target.value)}
							disabled={!apiReady || !textModels.length || busy}
						>
							{(textModels.length ? textModels : DEFAULT_TEXT_MODELS).map((model) => (
								<option key={model.id} value={model.id}>
									{model.label}
								</option>
							))}
						</select>
					</label>
					<label className="tap-agent-toggle">
						<input
							type="checkbox"
							checked={autoGenerate}
							onChange={(event) => onAutoGenerateChange(event.target.checked)}
							disabled={busy}
						/>
						<span>自动生成图片</span>
					</label>
				</div>
				<button
					type="submit"
					disabled={(!input.trim() && !referenceImages.length) || busy || !apiReady}
				>
					{busy ? 'Agent 思考中' : apiReady ? '发送给 Agent' : '接口未配置'}
				</button>
			</form>
		</aside>
	)
}

function HistoryGallery({
	items,
	totalCount,
	search,
	onSearchChange,
	onAddToCanvas,
}: {
	items: HistoryItem[]
	totalCount: number
	search: string
	onSearchChange(value: string): void
	onAddToCanvas(item: HistoryItem): void
}) {
	return (
		<aside className="tap-history-panel" onPointerDown={(event) => event.stopPropagation()}>
			<header className="tap-history-panel__header">
				<div>
					<h2>历史图库</h2>
					<p>{totalCount ? `${totalCount} 张图片记录` : '暂无历史记录'}</p>
				</div>
			</header>
			<label className="tap-history-search">
				<span>搜索历史</span>
				<input
					value={search}
					onChange={(event) => onSearchChange(event.target.value)}
					placeholder="搜索图片名或提示词"
				/>
			</label>
			<div className="tap-history-list">
				{items.length ? (
					items.map((item) => (
						<article key={item.id} className="tap-history-item">
							<div className="tap-history-item__thumb">
								<img src={item.imageUrl} alt={item.title} draggable={false} />
							</div>
							<div className="tap-history-item__body">
								<div className="tap-history-item__title">
									<strong>{item.title}</strong>
									<span>{item.kind === 'generated' ? '生成' : '上传'}</span>
								</div>
								<p>{item.prompt || item.fileName}</p>
								<small>
									{item.naturalWidth}x{item.naturalHeight} · {formatHistoryTime(item.createdAt)}
								</small>
							</div>
							<button type="button" onClick={() => onAddToCanvas(item)}>
								放入画布
							</button>
						</article>
					))
				) : (
					<div className="tap-history-empty">
						<strong>{search.trim() ? '没有匹配结果' : '等待第一张图片'}</strong>
						<p>{search.trim() ? '换一个关键词再找。' : '拖入图片或生成图片后会自动记录。'}</p>
					</div>
				)}
			</div>
		</aside>
	)
}

function SelectionBoxView({ selectionBox }: { selectionBox: SelectionBox }) {
	const rect = normalizeRectFromPoints(selectionBox.startScreen, selectionBox.currentScreen)
	return (
		<div
			className="tap-selection-box"
			style={{
				left: rect.x,
				top: rect.y,
				width: rect.w,
				height: rect.h,
			}}
		/>
	)
}

function EdgePath({ edge, nodes }: { edge: CanvasEdge; nodes: CanvasNode[] }) {
	const fromNode = nodes.find((node) => node.id === edge.from)
	const toNode = nodes.find((node) => node.id === edge.to)
	if (!fromNode || !toNode) return null
	const from = getNodeOutputPoint(fromNode)
	const to = getNodeInputPoint(toNode)
	return <path className="tap-edge" d={createBezierPath(from, to)} />
}

function createInitialNodes(): CanvasNode[] {
	const imageUrl = makeStarterImageDataUrl()
	const display = getTrueDisplaySize(STARTER_IMAGE_WIDTH, STARTER_IMAGE_HEIGHT)
	return [
		{
			id: 'image-1',
			type: 'image',
			x: 80,
			y: 160,
			title: '参考图 1',
			fileName: 'starter-reference.svg',
			mimeType: 'image/svg+xml',
			imageUrl,
			naturalWidth: STARTER_IMAGE_WIDTH,
			naturalHeight: STARTER_IMAGE_HEIGHT,
			displayWidth: display.w,
			displayHeight: display.h,
		},
	]
}

function createAgentMessageId(role: AgentMessage['role']) {
	return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createAgentImageReferenceLabel(node: ImageNode) {
	const title = node.title || node.fileName || '图片'
	return `${title} · ${node.naturalWidth}x${node.naturalHeight}`
}

function createAgentImageReference(node: ImageNode): AgentImageReference {
	return {
		id: node.id,
		label: createAgentImageReferenceLabel(node),
		title: node.title || node.fileName || '图片',
		imageUrl: node.imageUrl,
		naturalWidth: node.naturalWidth,
		naturalHeight: node.naturalHeight,
		prompt: node.prompt || '',
	}
}

function appendImageParameterBlock(value: string, node: ImageNode) {
	const marker = `【图片参数：${node.id}】`
	if (value.includes(marker)) return value
	const lines = [
		marker,
		`标题：${node.title}`,
		`文件：${node.fileName}`,
		`尺寸：${node.naturalWidth}x${node.naturalHeight}`,
		node.prompt ? `来源提示词：${node.prompt}` : '',
		node.annotationNote ? `标注说明：${node.annotationNote}` : '',
	].filter(Boolean)
	const block = lines.join('\n')
	const normalized = value.trim()
	return normalized ? `${normalized}\n\n${block}` : block
}

function normalizeSourceImages(
	sourceOverride: ImageNode[] | ImageNode | null | undefined,
	promptNode: PromptNode,
	nodes: CanvasNode[]
) {
	if (Array.isArray(sourceOverride)) return sourceOverride
	if (sourceOverride) return [sourceOverride]
	const sourceIds = promptNode.sourceImageIds?.length
		? promptNode.sourceImageIds
		: promptNode.sourceImageId
			? [promptNode.sourceImageId]
			: []
	return sourceIds
		.map((id) => nodes.find((node) => node.id === id))
		.filter((node): node is ImageNode => Boolean(node && isImageNode(node)))
}

function normalizeAspectRatio(value: string | undefined): AspectRatioId {
	return ASPECT_RATIOS.some((item) => item.id === value) ? (value as AspectRatioId) : '1:1'
}

function inferTargetAspectRatioFromPrompt(prompt: string): AspectRatioId | null {
	if (!prompt) return null
	if (/\b16\s*[:：]\s*9\b/.test(prompt) || /16:9/.test(prompt)) return '16:9'
	return null
}

function inferAspectRatioFromDimensions(width: number, height: number): AspectRatioId {
	const ratio = width / Math.max(1, height)
	const candidates: Array<{ id: AspectRatioId; ratio: number }> = [
		{ id: '1:1', ratio: 1 },
		{ id: '3:4', ratio: 3 / 4 },
		{ id: '4:3', ratio: 4 / 3 },
		{ id: '16:9', ratio: 16 / 9 },
		{ id: '9:16', ratio: 9 / 16 },
	]
	return candidates.reduce((best, candidate) =>
		Math.abs(candidate.ratio - ratio) < Math.abs(best.ratio - ratio) ? candidate : best
	).id
}

function normalizeGenerationCount(value: unknown) {
	const count = Number(value)
	if (!Number.isFinite(count)) return 1
	return Math.min(MAX_GENERATION_COUNT, Math.max(1, Math.round(count)))
}

function inferGenerationCountFromText(value: string) {
	const digitMatch = value.match(/([1-4])\s*(张|幅|个|版|种)/)
	if (digitMatch) return normalizeGenerationCount(digitMatch[1])
	if (/两\s*(张|幅|个|版|种)|二\s*(张|幅|个|版|种)/.test(value)) return 2
	if (/三\s*(张|幅|个|版|种)/.test(value)) return 3
	if (/四\s*(张|幅|个|版|种)/.test(value)) return 4
	return 1
}

function createClientFallbackImagePrompt(
	userRequest: string,
	referencedImages: ImageNode[],
	referenceTokens: string[]
) {
	const request = userRequest.trim().replace(/\s+/g, ' ')
	if (!request || !shouldRequestImageGeneration(request)) return ''
	const references = referenceTokens.length
		? referenceTokens.join('、')
		: referencedImages.map((node) => node.title).join('、')
	const referenceText = references
		? `参考 ${references} 的主体风格、构图、比例、材质细节与整体视觉气质。`
		: ''
	const count = inferGenerationCountFromText(request)
	const countText = count > 1 ? `生成 ${count} 张彼此独立的图片，不要拼图、网格、分屏或合集。` : ''
	return [
		referenceText,
		request,
		countText,
		'画面完整清晰，细节精致，不添加文字、水印、边框或 UI 元素。',
	]
		.filter(Boolean)
		.join(' ')
}

function shouldRequestImageGeneration(value: string) {
	return /生成|出图|重绘|改图|变体|配色|图片|画面|海报|封面|create|generate|image/i.test(value)
}

function normalizeGeneratedImageUrls(data: GeneratedImageResponse) {
	const urls = Array.isArray(data.imageUrls) ? data.imageUrls : data.imageUrl ? [data.imageUrl] : []
	return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)))
}

function inferImageMimeType(imageUrl: string) {
	const dataUrlMatch = imageUrl.match(/^data:([^;,]+)/)
	if (dataUrlMatch?.[1]) return dataUrlMatch[1]
	if (imageUrl.toLowerCase().includes('.jpg') || imageUrl.toLowerCase().includes('.jpeg'))
		return 'image/jpeg'
	if (imageUrl.toLowerCase().includes('.webp')) return 'image/webp'
	return 'image/png'
}

function createHistoryItemFromImageNode(
	node: ImageNode,
	kind: HistoryItem['kind'],
	meta: Pick<HistoryItem, 'model' | 'size' | 'sourceImageIds'> = {}
): HistoryItem {
	return {
		id: `history-${node.id}-${Date.now()}`,
		nodeId: node.id,
		kind,
		title: node.title,
		imageUrl: node.imageUrl,
		fileName: node.fileName,
		mimeType: node.mimeType,
		naturalWidth: node.naturalWidth,
		naturalHeight: node.naturalHeight,
		displayWidth: node.displayWidth,
		displayHeight: node.displayHeight,
		prompt: node.prompt,
		model: meta.model,
		size: meta.size,
		sourceImageIds: meta.sourceImageIds,
		createdAt: new Date().toISOString(),
	}
}

function mergeHistoryItems(current: HistoryItem[], nextItems: HistoryItem[]) {
	const nextNodeIds = new Set(nextItems.map((item) => item.nodeId))
	return [...nextItems, ...current.filter((item) => !nextNodeIds.has(item.nodeId))]
		.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
		.slice(0, HISTORY_LIMIT)
}

function filterHistoryItems(items: HistoryItem[], search: string) {
	const keyword = search.trim().toLowerCase()
	const sorted = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
	if (!keyword) return sorted
	return sorted.filter((item) =>
		[item.title, item.fileName, item.prompt || '', item.model || '', item.size || '']
			.join(' ')
			.toLowerCase()
			.includes(keyword)
	)
}

function formatHistoryTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return ''
	return date.toLocaleString('zh-CN', {
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	})
}

function createPersistedCanvasState(
	nodes: CanvasNode[],
	edges: CanvasEdge[],
	transform: TransformState,
	historyItems: HistoryItem[],
	nodeCounter: number,
	edgeCounter: number
): PersistedCanvasState {
	return {
		version: 1,
		nodes: normalizeCanvasNodeDisplayLayout(nodes) || nodes,
		edges,
		transform,
		historyItems: historyItems.map(normalizeHistoryItemDisplaySize).slice(0, HISTORY_LIMIT),
		nodeCounter,
		edgeCounter,
	}
}

function normalizePersistedCanvasState(state: PersistedCanvasState): PersistedCanvasState {
	const baseNodes = Array.isArray(state.nodes)
		? state.nodes
				.filter(
					(node) =>
						node &&
						(node.type === 'image' ||
							node.type === 'prompt' ||
							node.type === 'text' ||
							node.type === 'doodle' ||
							node.type === 'video')
				)
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
		: createInitialNodes()
	const nodes = normalizeCanvasNodeDisplayLayout(baseNodes) || baseNodes
	const nodeIds = new Set(nodes.map((node) => node.id))
	const edges = Array.isArray(state.edges)
		? state.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
		: []
	return {
		version: 1,
		nodes,
		edges,
		transform: isValidTransform(state.transform) ? state.transform : { x: 96, y: 108, zoom: 0.56 },
		historyItems: Array.isArray(state.historyItems)
			? state.historyItems
					.filter(isValidHistoryItem)
					.map(normalizeHistoryItemDisplaySize)
					.slice(0, HISTORY_LIMIT)
			: [],
		nodeCounter: Number(state.nodeCounter) || 10,
		edgeCounter: Number(state.edgeCounter) || 10,
	}
}

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
		duration: VIDEO_DURATION_OPTIONS.some((option) => option.value === node.duration)
			? node.duration
			: 5,
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

function isValidTransform(value: unknown): value is TransformState {
	return Boolean(
		value &&
		typeof value === 'object' &&
		Number.isFinite((value as TransformState).x) &&
		Number.isFinite((value as TransformState).y) &&
		Number.isFinite((value as TransformState).zoom)
	)
}

function isValidHistoryItem(value: unknown): value is HistoryItem {
	return Boolean(
		value &&
		typeof value === 'object' &&
		typeof (value as HistoryItem).id === 'string' &&
		typeof (value as HistoryItem).imageUrl === 'string' &&
		typeof (value as HistoryItem).createdAt === 'string'
	)
}

function normalizeCanvasNodeDisplayLayout(nodes: CanvasNode[]) {
	let changed = false
	const imageNormalizedNodes = nodes.map((node) => {
		if (!isImageNode(node)) return node
		const nextNode = normalizeImageNodeDisplaySize(node)
		if (nextNode !== node) changed = true
		return nextNode
	})
	const normalizedNodes = imageNormalizedNodes.map((node) => {
		if (!isPromptNode(node)) return node
		const nextNode = normalizePromptNodeDisplaySize(node, imageNormalizedNodes)
		if (nextNode !== node) changed = true
		return nextNode
	})
	return changed ? normalizedNodes : null
}

function normalizeImageNodeDisplaySize(node: ImageNode): ImageNode {
	const display = getTrueDisplaySize(
		node.naturalWidth || node.displayWidth,
		node.naturalHeight || node.displayHeight
	)
	if (Math.abs(node.displayWidth - display.w) <= 1 && Math.abs(node.displayHeight - display.h) <= 1)
		return node
	return {
		...node,
		displayWidth: display.w,
		displayHeight: display.h,
	}
}

function normalizePromptNodeDisplaySize(node: PromptNode, nodes: CanvasNode[]): PromptNode {
	const sourceId = node.sourceImageIds?.[0] || node.sourceImageId
	if (!sourceId) return node
	const source = nodes.find((item): item is ImageNode => item.id === sourceId && isImageNode(item))
	if (!source) return node
	const matchedSize = getAdaptivePromptNodeSize(source)
	if (
		Math.abs((node.width || 0) - matchedSize.w) <= 1 &&
		Math.abs((node.height || 0) - matchedSize.h) <= 1
	) {
		return node
	}
	return {
		...node,
		width: matchedSize.w,
		height: matchedSize.h,
	}
}

function normalizeHistoryItemDisplaySize(item: HistoryItem): HistoryItem {
	const display = getTrueDisplaySize(
		item.naturalWidth || item.displayWidth,
		item.naturalHeight || item.displayHeight
	)
	if (Math.abs(item.displayWidth - display.w) <= 1 && Math.abs(item.displayHeight - display.h) <= 1)
		return item
	return {
		...item,
		displayWidth: display.w,
		displayHeight: display.h,
	}
}

function replaceLegacyImageReferenceText(value: string) {
	return value.replace(/参考图\s*@图片\d+/g, '参考图').replace(/@图片\d+/g, '参考图')
}

function getMaxNumericId(items: Array<{ id: string }>) {
	return items.reduce((max, item) => {
		const match = item.id.match(/-(\d+)$/)
		return match ? Math.max(max, Number(match[1])) : max
	}, 0)
}

async function loadPersistedCanvasState() {
	try {
		const db = await openCanvasDb()
		const state = await readCanvasDbValue<PersistedCanvasState>(db, CANVAS_STORAGE_KEY)
		db.close()
		if (state?.version === 1) return state
	} catch {
		const value = window.localStorage.getItem(CANVAS_STORAGE_KEY)
		if (!value) return null
		try {
			return JSON.parse(value) as PersistedCanvasState
		} catch {
			return null
		}
	}
	return null
}

async function savePersistedCanvasState(state: PersistedCanvasState) {
	try {
		const db = await openCanvasDb()
		await writeCanvasDbValue(db, CANVAS_STORAGE_KEY, state)
		db.close()
	} catch {
		try {
			window.localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(state))
		} catch {
			// Best effort persistence only.
		}
	}
}

function openCanvasDb() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		if (!window.indexedDB) {
			reject(new Error('IndexedDB is unavailable.'))
			return
		}
		const request = window.indexedDB.open('tap-ai-canvas-agent', 1)
		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains('states')) db.createObjectStore('states')
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

function readCanvasDbValue<T>(db: IDBDatabase, key: string) {
	return new Promise<T | null>((resolve, reject) => {
		const transaction = db.transaction('states', 'readonly')
		const request = transaction.objectStore('states').get(key)
		request.onsuccess = () => resolve((request.result as T | undefined) || null)
		request.onerror = () => reject(request.error)
	})
}

function writeCanvasDbValue(db: IDBDatabase, key: string, value: PersistedCanvasState) {
	return new Promise<void>((resolve, reject) => {
		const transaction = db.transaction('states', 'readwrite')
		transaction.oncomplete = () => resolve()
		transaction.onerror = () => reject(transaction.error)
		transaction.objectStore('states').put(value, key)
	})
}

function buildCanvasSummary(
	nodes: CanvasNode[],
	edges: CanvasEdge[],
	selectedNodeIds: string[],
	referenceImageIds: string[] = []
) {
	const selected = new Set(selectedNodeIds)
	const referenced = new Set(referenceImageIds)
	const nodeLines = nodes.slice(-12).map((node) => {
		const markers = [
			selected.has(node.id) ? '已选中' : '未选中',
			referenced.has(node.id) ? '已引用' : '未引用',
		]
		if (isImageNode(node)) {
			return `图片节点 ${createAgentImageReferenceLabel(node)}（${markers.join('，')}）：${node.title}，文件 ${node.fileName}${node.prompt ? `，来源提示词：${node.prompt}` : ''}`
		}
		if (isVideoNode(node)) {
			return `视频节点 ${node.id}（${markers.join('，')}）：模式 ${VIDEO_MODE_LABELS[node.mode]}，状态 ${node.status}，提示词：${node.prompt || '空'}`
		}
		return `提示词节点 ${node.id}（${markers.join('，')}）：尺寸 ${(node as PromptNode).size}，数量 ${normalizeGenerationCount((node as PromptNode).count)} 张，状态 ${(node as PromptNode).status}，提示词：${(node as PromptNode).prompt || '空'}`
	})
	const edgeLines = edges.slice(-12).map((edge) => `${edge.from} -> ${edge.to}`)
	const imageParameterLabels = nodes.filter(isImageNode).map(createAgentImageReferenceLabel)
	return [
		`图片节点数量：${nodes.filter(isImageNode).length}`,
		`提示词节点数量：${nodes.filter(isPromptNode).length}`,
		`连接线数量：${edges.length}`,
		`选中节点：${selectedNodeIds.length ? selectedNodeIds.join(', ') : '无'}`,
		`对话发送的图片参数：${referenceImageIds.length ? referenceImageIds.join(', ') : '无'}`,
		`可用图片参数：${imageParameterLabels.join('；') || '无'}`,
		'节点摘要：',
		...nodeLines,
		edgeLines.length ? '连接关系：' : '连接关系：无',
		...edgeLines,
	].join('\n')
}

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

function isImageNode(node: CanvasNode): node is ImageNode {
	return node.type === 'image'
}

function isPromptNode(node: CanvasNode): node is PromptNode {
	return node.type === 'prompt'
}

function isTextNode(node: CanvasNode): node is TextNode {
	return node.type === 'text'
}

function isDoodleNode(node: CanvasNode): node is DoodleNode {
	return node.type === 'doodle'
}

function isVideoNode(node: CanvasNode): node is VideoNode {
	return node.type === 'video'
}

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

function getNodeSize(node: CanvasNode) {
	if (isImageNode(node)) {
		return {
			w: Math.max(MIN_IMAGE_NODE_WIDTH, node.displayWidth + IMAGE_NODE_PADDING * 2),
			h:
				node.displayHeight +
				IMAGE_NODE_PADDING * 2 +
				IMAGE_NODE_HEADER_HEIGHT +
				IMAGE_NODE_FOOTER_HEIGHT +
				IMAGE_NODE_GAP_TOP +
				IMAGE_NODE_GAP_BOTTOM,
		}
	}
	if (isPromptNode(node)) {
		return {
			w: Math.max(MIN_IMAGE_NODE_WIDTH, node.width || PROMPT_NODE_WIDTH),
			h: Math.max(PROMPT_NODE_MIN_HEIGHT, node.height || PROMPT_NODE_HEIGHT),
		}
	}
	if (isVideoNode(node)) {
		const baseHeight = node.sourceImageIds.length
			? VIDEO_NODE_BASE_HEIGHT + 40
			: VIDEO_NODE_BASE_HEIGHT
		return {
			w: VIDEO_NODE_WIDTH,
			h:
				node.status === 'succeeded' && node.videoUrl
					? baseHeight + VIDEO_PLAYER_HEIGHT
					: baseHeight,
		}
	}
	if (isTextNode(node) || isDoodleNode(node)) {
		return {
			w: Math.max(260, node.width),
			h: Math.max(148, node.height),
		}
	}
	return { w: PROMPT_NODE_WIDTH, h: PROMPT_NODE_HEIGHT }
}

function getAdaptivePromptNodeSize(source?: ImageNode) {
	if (!source) return { w: PROMPT_NODE_WIDTH, h: PROMPT_NODE_HEIGHT }
	const sourceSize = getNodeSize(source)
	return {
		w: sourceSize.w,
		h: Math.max(PROMPT_NODE_MIN_HEIGHT, sourceSize.h),
	}
}

function getNodeRect(node: CanvasNode): Rect {
	const size = getNodeSize(node)
	return { x: node.x, y: node.y, w: size.w, h: size.h }
}

function getNodeOutputPoint(node: CanvasNode): Point {
	const rect = getNodeRect(node)
	return { x: rect.x + rect.w, y: rect.y + rect.h / 2 }
}

function getNodeInputPoint(node: CanvasNode): Point {
	const rect = getNodeRect(node)
	return { x: rect.x, y: rect.y + rect.h / 2 }
}

function getRectCenter(rect: Rect): Point {
	return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

function createBezierPath(from: Point, to: Point) {
	const distance = Math.max(80, Math.abs(to.x - from.x) * 0.52)
	const c1 = { x: from.x + distance, y: from.y }
	const c2 = { x: to.x - distance, y: to.y }
	return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

function normalizeRectFromPoints(a: Point, b: Point): Rect {
	const x = Math.min(a.x, b.x)
	const y = Math.min(a.y, b.y)
	return {
		x,
		y,
		w: Math.abs(a.x - b.x),
		h: Math.abs(a.y - b.y),
	}
}

function rectsIntersect(a: Rect, b: Rect) {
	return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
}

function getTrueDisplaySize(width: number, height: number) {
	const safeWidth = Math.max(1, width)
	const safeHeight = Math.max(1, height)
	let scale = Math.min(
		1,
		MAX_IMAGE_DISPLAY_WIDTH / safeWidth,
		MAX_IMAGE_DISPLAY_HEIGHT / safeHeight
	)
	let displayWidth = Math.max(1, Math.round(safeWidth * scale))
	let displayHeight = Math.max(1, Math.round(safeHeight * scale))

	if (displayWidth < MIN_IMAGE_DISPLAY_WIDTH) {
		scale = MIN_IMAGE_DISPLAY_WIDTH / displayWidth
		displayWidth = Math.round(displayWidth * scale)
		displayHeight = Math.round(displayHeight * scale)
	}

	if (displayHeight > MAX_IMAGE_DISPLAY_HEIGHT) {
		scale = MAX_IMAGE_DISPLAY_HEIGHT / displayHeight
		displayWidth = Math.max(1, Math.round(displayWidth * scale))
		displayHeight = Math.max(1, Math.round(displayHeight * scale))
	}

	return {
		w: displayWidth,
		h: displayHeight,
	}
}

function pointsToSvgPath(points: Point[]) {
	if (!points.length) return ''
	const [first, ...rest] = points
	return [
		`M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`,
		...rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`),
	].join(' ')
}

function parseApiSize(size: string) {
	const match = size.match(/^(\d+)x(\d+)$/)
	return match ? { w: Number(match[1]), h: Number(match[2]) } : { w: 1024, h: 1024 }
}

function readFileAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(file)
	})
}

function getImageDimensions(src: string, fallback: { w: number; h: number }) {
	return new Promise<{ w: number; h: number }>((resolve) => {
		const image = new Image()
		image.onload = () =>
			resolve({
				w: image.naturalWidth || fallback.w,
				h: image.naturalHeight || fallback.h,
			})
		image.onerror = () => resolve(fallback)
		image.src = src
	})
}

function loadImageElement(src: string) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image()
		if (!src.startsWith('data:') && !src.startsWith('blob:')) image.crossOrigin = 'anonymous'
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error('Image failed to load.'))
		image.src = src
	})
}

function buildImageGenerationPrompt(prompt: string, size: AspectRatioId, hasAnnotations: boolean) {
	const constraints: string[] = []
	if (size === '16:9') {
		constraints.push(
			'Final output must be a true 16:9 landscape image canvas. Do not create a square composition. Fill the wide 16:9 frame with the requested content.'
		)
	}
	if (hasAnnotations) {
		constraints.push(
			'The red hand-drawn marks and red handwritten labels in the reference image are editing instructions only. Do not reproduce any red annotation lines, labels, numbers, UI, or markup in the final image.'
		)
	}
	return constraints.length ? `${prompt}\n\n${constraints.join('\n')}` : prompt
}

function isAspectRatioClose(actual: { w: number; h: number }, target: { w: number; h: number }) {
	const actualRatio = actual.w / Math.max(1, actual.h)
	const targetRatio = target.w / Math.max(1, target.h)
	return Math.abs(actualRatio - targetRatio) <= 0.035
}

async function fitImageToTargetCanvas(imageUrl: string, target: { w: number; h: number }) {
	try {
		const image = await loadImageElement(imageUrl)
		const canvas = document.createElement('canvas')
		canvas.width = target.w
		canvas.height = target.h
		const context = canvas.getContext('2d')
		if (!context) throw new Error('Canvas is unavailable.')
		context.fillStyle = '#ffffff'
		context.fillRect(0, 0, target.w, target.h)
		const scale = Math.min(
			target.w / Math.max(1, image.naturalWidth),
			target.h / Math.max(1, image.naturalHeight)
		)
		const width = image.naturalWidth * scale
		const height = image.naturalHeight * scale
		context.drawImage(image, (target.w - width) / 2, (target.h - height) / 2, width, height)
		return {
			imageUrl: canvas.toDataURL('image/png'),
			dimensions: target,
		}
	} catch {
		return {
			imageUrl,
			dimensions: await getImageDimensions(imageUrl, target),
		}
	}
}

async function createGenerationSourceImageUrl(node: ImageNode) {
	if (!node.annotations?.length && !node.annotationNote?.trim()) return node.imageUrl
	try {
		const image = await loadImageElement(node.imageUrl)
		const canvas = document.createElement('canvas')
		canvas.width = node.naturalWidth || image.naturalWidth || node.displayWidth
		canvas.height = node.naturalHeight || image.naturalHeight || node.displayHeight
		const context = canvas.getContext('2d')
		if (!context) throw new Error('Canvas is unavailable.')
		context.drawImage(image, 0, 0, canvas.width, canvas.height)
		context.save()
		context.scale(
			canvas.width / Math.max(1, node.displayWidth),
			canvas.height / Math.max(1, node.displayHeight)
		)
		context.lineCap = 'round'
		context.lineJoin = 'round'
		context.strokeStyle = '#ff2f1f'
		context.lineWidth = 7
		node.annotations?.forEach((path) => {
			context.stroke(new Path2D(path))
		})
		context.restore()
		const note = node.annotationNote?.trim()
		if (note) {
			const fontSize = Math.max(28, Math.round(canvas.width * 0.045))
			context.font = `700 ${fontSize}px Arial, sans-serif`
			context.fillStyle = '#ff2f1f'
			context.strokeStyle = '#ffffff'
			context.lineWidth = Math.max(4, Math.round(fontSize * 0.16))
			const x = Math.round(canvas.width * 0.06)
			const y = Math.round(canvas.height * 0.12)
			context.strokeText(note.slice(0, 36), x, y)
			context.fillText(note.slice(0, 36), x, y)
		}
		return canvas.toDataURL('image/png')
	} catch {
		return node.imageUrl
	}
}

async function downloadImageNode(node: ImageNode) {
	const fileName = node.fileName || `${node.title || 'image'}.png`
	if (node.imageUrl.startsWith('data:') || node.imageUrl.startsWith('blob:')) {
		triggerDownload(node.imageUrl, fileName)
		return
	}

	try {
		const response = await fetch(node.imageUrl)
		if (!response.ok) throw new Error(String(response.status))
		const blob = await response.blob()
		const objectUrl = URL.createObjectURL(blob)
		triggerDownload(objectUrl, fileName)
		window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200)
	} catch {
		triggerDownload(node.imageUrl, fileName)
	}
}

function triggerDownload(url: string, fileName: string) {
	const link = document.createElement('a')
	link.href = url
	link.download = sanitizeFileName(fileName)
	link.rel = 'noreferrer'
	document.body.appendChild(link)
	link.click()
	link.remove()
}

function sanitizeFileName(value: string) {
	return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'image.png'
}

function hasImageFiles(dataTransfer: DataTransfer) {
	return Array.from(dataTransfer.items).some(
		(item) => item.kind === 'file' && item.type.startsWith('image/')
	)
}

function isTextEditingElement(element: Element | null) {
	if (!element) return false
	const tagName = element.tagName.toLowerCase()
	return (
		tagName === 'input' ||
		tagName === 'textarea' ||
		tagName === 'select' ||
		element.hasAttribute('contenteditable')
	)
}

function makeStarterImageDataUrl() {
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${STARTER_IMAGE_WIDTH}" height="${STARTER_IMAGE_HEIGHT}" viewBox="0 0 ${STARTER_IMAGE_WIDTH} ${STARTER_IMAGE_HEIGHT}">
  <rect width="${STARTER_IMAGE_WIDTH}" height="${STARTER_IMAGE_HEIGHT}" fill="#202124"/>
  <rect x="80" y="72" width="760" height="556" rx="34" fill="#2b2c30" stroke="#6f737b" stroke-width="4"/>
  <path d="M170 524 L344 334 L468 445 L585 255 L755 524 Z" fill="#d8dce3"/>
  <circle cx="650" cy="202" r="54" fill="#9ca3af"/>
  <text x="112" y="138" fill="#f5f7fb" font-family="Arial, sans-serif" font-size="44" font-weight="700">参考图</text>
  <text x="112" y="186" fill="#9ca3af" font-family="Arial, sans-serif" font-size="28">从这里拖出连接线</text>
</svg>`
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function makeBlankImageDataUrl(width: number, height: number) {
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#15171b"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="24" fill="#202329" stroke="#555b66" stroke-width="3" stroke-dasharray="16 12"/>
  <path d="M${width * 0.34} ${height * 0.6} L${width * 0.45} ${height * 0.45} L${width * 0.56} ${height * 0.56} L${width * 0.66} ${height * 0.4} L${width * 0.78} ${height * 0.6} Z" fill="#7d8796"/>
  <circle cx="${width * 0.68}" cy="${height * 0.32}" r="${Math.max(24, width * 0.045)}" fill="#a8afbc"/>
  <text x="${width / 2}" y="${height * 0.78}" text-anchor="middle" fill="#d8dce3" font-family="Arial, sans-serif" font-size="28" font-weight="700">默认图片节点</text>
  <text x="${width / 2}" y="${height * 0.85}" text-anchor="middle" fill="#8f96a3" font-family="Arial, sans-serif" font-size="18">下方提示词框会跟随图片节点尺寸</text>
</svg>`
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
