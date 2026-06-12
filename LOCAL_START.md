# Local Startup

This repo is configured to run with the project-local Node 20 runtime in `.local-tools`.

## First-time setup

```powershell
cd C:\Users\haojie\Downloads\tldraw-main\tldraw-main
.\setup-local-env.cmd
```

## Start

```powershell
cd C:\Users\haojie\Downloads\tldraw-main\tldraw-main
powershell -ExecutionPolicy Bypass -File .\start-dev-background.ps1
```

Open:

```text
http://localhost:5420/
http://localhost:5420/ai-canvas-agent
```

The helper scripts also manage the local worker ports used by this dev stack:

```text
5420, 8786, 8990, 9339
```

Logs:

```text
dev-server.out.log
dev-server.err.log
```

## Verify

After starting the dev server, run the local smoke check:

```powershell
cd C:\Users\haojie\Downloads\tldraw-main\tldraw-main
powershell -ExecutionPolicy Bypass -File .\verify-ai-canvas-local.ps1
```

This checks the app shell, login/session/logout flow, API status, and the expected missing-key
behavior when `IMAGE_API_KEY` is not configured. After adding a real key, use the optional live image
API check:

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-ai-canvas-local.ps1 -LiveOpenAITest
```

## Stop

```powershell
cd C:\Users\haojie\Downloads\tldraw-main\tldraw-main
powershell -ExecutionPolicy Bypass -File .\stop-dev.ps1
```

## Image API gateway

Image generation uses the Vite dev server as a backend proxy. Configure secrets in either the repo
root `.env.local` or the app-local file below. The app-local file takes priority:

```text
apps/examples/.env.local
```

For the current OpenAI-compatible gateway, use:

```text
IMAGE_GATEWAY_BASE_URL=https://aidraw365.com
IMAGE_API_KEY=Bearer sk-...
```

For a future direct image endpoint, use:

```text
IMAGE_API_URL=https://example.com/v1/images/generate
IMAGE_API_KEY=sk-...
```

Then restart the dev server. The browser never receives the API key; all image requests go through
`POST /api/generate-image`. Model discovery uses `/v1/models` when a gateway base URL is configured,
and the UI hides the model selector when no image API key is present.
