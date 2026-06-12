$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $projectRoot 'dev-server.pid'
$devPorts = @(5420, 8786, 8990, 9339)

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

if (-not (Test-Path $pidFile)) {
  Stop-DevPorts $devPorts
  Write-Output 'No dev-server.pid found. Cleaned known dev ports.'
  exit 0
}

$serverPid = (Get-Content $pidFile -Raw).Trim()
if (-not $serverPid) {
  Remove-Item $pidFile -Force
  Stop-DevPorts $devPorts
  Write-Output 'Empty dev-server.pid removed. Cleaned known dev ports.'
  exit 0
}

if (-not (Get-Process -Id $serverPid -ErrorAction SilentlyContinue)) {
  Remove-Item $pidFile -Force
  Stop-DevPorts $devPorts
  Write-Output "Stale dev-server.pid removed. Process was not running: $serverPid"
  exit 0
}

taskkill.exe /PID $serverPid /T /F | Out-Null
Remove-Item $pidFile -Force
Write-Output "Stopped dev server process tree: $serverPid"
Stop-DevPorts $devPorts
