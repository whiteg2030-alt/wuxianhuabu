@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "NODE_VERSION=v20.20.2"
set "NODE_DIR=%PROJECT_ROOT%.local-tools\node-v20.20.2-win-x64"
set "PATH=%PROJECT_ROOT%.local-bin;%PROJECT_ROOT%node_modules\.bin;%NODE_DIR%;%PATH%"

if not exist "%NODE_DIR%\node.exe" (
  echo Missing local Node runtime. Downloading %NODE_VERSION%...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $project='%PROJECT_ROOT%'; $version='%NODE_VERSION%'; $tools=Join-Path $project '.local-tools'; New-Item -ItemType Directory -Force -Path $tools | Out-Null; $zip=Join-Path $tools ($version + '-win-x64.zip'); $url='https://nodejs.org/dist/' + $version + '/node-' + $version + '-win-x64.zip'; Invoke-WebRequest -Uri $url -OutFile $zip; Expand-Archive -Path $zip -DestinationPath $tools -Force"
  if errorlevel 1 exit /b 1
)

echo Node:
node --version
echo Yarn:
call corepack.cmd enable
call corepack.cmd yarn --version
echo.
echo Installing dependencies with the project-local Node/Yarn environment...
call corepack.cmd yarn install
