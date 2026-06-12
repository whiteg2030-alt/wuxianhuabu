@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "NODE_DIR=%PROJECT_ROOT%.local-tools\node-v20.20.2-win-x64"
set "PATH=%PROJECT_ROOT%.local-bin;%PROJECT_ROOT%node_modules\.bin;%NODE_DIR%;%PATH%"

if not exist "%NODE_DIR%\node.exe" (
  echo Missing local Node runtime: "%NODE_DIR%\node.exe"
  echo Run setup-local-env.cmd first.
  exit /b 1
)

cd /d "%PROJECT_ROOT%"
echo Starting tldraw dev server with:
node --version
call corepack.cmd yarn --version
echo.
call corepack.cmd yarn dev
