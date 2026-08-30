$ErrorActionPreference = 'Stop'

$RawUrl = 'https://raw.githubusercontent.com/peakflames/claude-plugins-peakflames/main/scripts/claude-code-setup/statusline.js'
$Dest = Join-Path $HOME '.claude/statusline.js'
$Marker = 'CLAUDE_CODE_STATUSLINE_V1'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "node is required but was not found on PATH. Install Node.js (https://nodejs.org) and re-run this script."
    exit 1
}

New-Item -Force -ItemType Directory -Path (Join-Path $HOME '.claude') | Out-Null

Invoke-WebRequest -UseBasicParsing -Uri $RawUrl -OutFile $Dest

$content = Get-Content -Raw -Path $Dest -ErrorAction SilentlyContinue
if (-not $content -or -not ($content -match [regex]::Escape($Marker))) {
    Write-Error "downloaded statusline.js failed validation."
    Remove-Item -Force -Path $Dest -ErrorAction SilentlyContinue
    exit 1
}

node $Dest --install
