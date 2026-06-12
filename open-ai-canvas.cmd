@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "AI_CANVAS_URL=http://localhost:5420/ai-canvas-agent"

powershell -ExecutionPolicy Bypass -File "%PROJECT_ROOT%start-dev-background.ps1"
if errorlevel 1 (
  echo.
  echo Failed to start the local AI canvas server.
  echo If this is the first run on this computer, run setup-local-env.cmd first.
  pause
  exit /b 1
)

start "" "%AI_CANVAS_URL%"
echo Opened %AI_CANVAS_URL%
