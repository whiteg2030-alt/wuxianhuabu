---
title: 图像流画布
component: ./AiCanvasAgentExample.tsx
priority: 0
keywords: [ai, image generation, node editor, image board, connections, prompt node]
---

一个中文 AI 无限画布示例，支持上传参考图、创建提示词节点、连接图片节点、生成图片、编辑图片，并通过首帧图生成 Seedance 视频。

---

这个示例使用 React 实现无限画布式节点工作流，并通过本地 Vite 服务转发图片和视频生成请求。前端不会直接暴露 API Key；Key 会保存在本机 `apps/examples/.env.local` 中。
