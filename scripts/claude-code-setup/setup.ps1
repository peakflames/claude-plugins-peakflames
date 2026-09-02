$ErrorActionPreference = 'Stop'

$RawUrl = 'https://raw.githubusercontent.com/peakflames/claude-plugins-peakflames/main/scripts/claude-code-setup/setupHelper.js'
$Marker = 'CLAUDE_CODE_SETUP_HELPER_V1'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "node is required but was not found on PATH. Install Node.js (https://nodejs.org) and re-run this script."
    exit 1
}

$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -Force -ItemType Directory -Path $TmpDir | Out-Null
$Dest = Join-Path $TmpDir 'setupHelper.js'

try {
    Invoke-WebRequest -UseBasicParsing -Uri $RawUrl -OutFile $Dest

    $content = Get-Content -Raw -Path $Dest -ErrorAction SilentlyContinue
    if (-not $content -or -not ($content -match [regex]::Escape($Marker))) {
        Write-Error "downloaded setupHelper.js failed validation."
        exit 1
    }

    node $Dest
}
finally {
    Remove-Item -Force -Recurse -Path $TmpDir -ErrorAction SilentlyContinue
}
