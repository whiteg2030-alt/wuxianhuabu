---
title: 图像流画布
component: ./AiCanvasAgentExample.tsx
priority: 0
keywords: [ai, image generation, node editor, image board, connections, prompt node]
---

一个中文极简图片生成节点画布，支持上传图片、从图片节点拖出连接线、创建提示词节点并调用后端图片生成接口。

---

这个示例使用 React 实现无限画布式节点工作流，并通过本地服务端 `/api/generate-image` 转发图片生成请求，前端不会暴露任何 API Key。
