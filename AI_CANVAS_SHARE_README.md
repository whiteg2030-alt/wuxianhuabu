# AI Canvas sharing notes

## Full project

1. On the first run, double-click `setup-local-env.cmd`.
2. Then double-click `open-ai-canvas.cmd`.
3. Open `http://localhost:5420/ai-canvas-agent/full` if the browser does not open automatically.
4. Click the top API status button in the canvas and enter your own API key.
   - Image generation / Agent: enter the OpenAI-compatible image gateway key.
   - Video generation: enter the Volcengine Ark API key for Doubao Seedance 2.0.

Do not commit or share `apps/examples/.env.local` unless you intentionally want to share that local API key.

## Portable share package

Use `ai-canvas-share.zip` when sending the app to someone else. It is much smaller than the full repository and includes a local Node runtime.

1. Unzip `ai-canvas-share.zip`.
2. Double-click `ai-canvas-share/start.cmd`.
3. Keep the "AI Canvas Server" window open while using the app.
4. Do not share the generated `data/` folder after entering private API keys.
