$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $projectRoot 'dev-server.out.log'
$err = Join-Path $projectRoot 'dev-server.err.log'
$pidFile = Join-Path $projectRoot 'dev-server.pid'
$cmd = Join-Path $projectRoot 'start-dev.cmd'
$url = 'http://localhost:5420/'
$requiredPorts = @(5420)
$devPorts = @(5420, 8786, 8990, 9339)

function Test-DevStackReady([string]$readyUrl, [int[]]$ports) {
  try {
    $response = Invoke-WebRequest -Uri $readyUrl -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 500) {
      return $false
    }
  } catch {
    return $false
  }

  $listeningPorts = Get-ListeningDevPorts $ports
  foreach ($port in $ports) {
    if (-not ($listeningPorts -contains $port)) {
      return $false
    }
  }
  return $true
}

function Get-ListeningDevPorts([int[]]$ports) {
  $escapedPorts = ($ports | ForEach-Object { [regex]::Escape([string]$_) }) -join '|'
  $lines = netstat -ano | Select-String -Pattern "LISTENING"
  $listeningPorts = @()

  foreach ($line in $lines) {
    $parts = ($line.ToString() -split '\s+') | Where-Object { $_ }
    if ($parts.Count -ge 5 -and $parts[1] -match ":($escapedPorts)$") {
      $listeningPorts += [int]$Matches[1]
    }
  }

  return $listeningPorts | Sort-Object -Unique
}

function Stop-DevPorts([int[]]$ports) {
  $escapedPorts = ($ports | ForEach-Object { [regex]::Escape([string]$_) }) -join '|'
  $lines = netstat -ano | Select-String -Pattern "LISTENING"
  $pids = @()

  foreach ($line in $lines) {
    $parts = ($line.ToString() -split '\s+') | Where-Object { $_ }
    if ($parts.Count -ge 5 -and $parts[1] -match ":($escapedPorts)$") {
      $pids += [int]$parts[-1]
    }
  }

  $pids |
    Sort-Object -Unique |
    Where-Object { $_ -ne $PID } |
    ForEach-Object {
      taskkill.exe /PID $_ /T /F | Out-Null
      Write-Output "Stopped process on known dev port: $_"
    }
}

if (Test-Path $pidFile) {
  $existingPid = (Get-Content $pidFile -Raw).Trim()
  if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
    if (Test-DevStackReady $url $requiredPorts) {
      Write-Output "Dev server already running: $existingPid"
      Write-Output "URL: $url"
      Write-Output "Logs: $out"
      exit 0
    }

    Write-Output "Dev server process exists but the stack is incomplete. Restarting: $existingPid"
    taskkill.exe /PID $existingPid /T /F | Out-Null
  }
  Remove-Item $pidFile -Force
}

Stop-DevPorts $devPorts

$process = Start-Process -FilePath $cmd `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $out `
  -RedirectStandardError $err `
  -PassThru

Set-Content -Path $pidFile -Value $process.Id
Write-Output "Started dev server process: $($process.Id)"
Write-Output "Logs: $out"

$deadline = (Get-Date).AddSeconds(60)
do {
  if (Test-DevStackReady $url $requiredPorts) {
    Write-Output "Ready: $url"
    exit 0
  }
  Start-Sleep -Milliseconds 750
} while ((Get-Date) -lt $deadline)

Write-Output "Started, but $url did not become ready within 60 seconds."
Write-Output "Check logs:"
Write-Output "  $out"
Write-Output "  $err"
exit 1
