$ErrorActionPreference = 'Stop'

$RawUrl = 'https://raw.githubusercontent.com/peakflames/claude-plugins-peakflames/main/scripts/claude-code-setup/setupHelper.js'
$Marker = 'CLAUDE_CODE_SETUP_HELPER_V1'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "node is required but was not found on PATH. Install Node.js (https://nodejs.org) and re-run this script."
    exit 1
}

# Node can be on PATH yet fail to launch (e.g. a corrupted install or a missing
# runtime library). Catch that up front with a clear message.
$NodePath = (Get-Command node).Source
$NodeErr = $null
try {
    $NodeErr = & node -e '' 2>&1 | Out-String
    $NodeOk = ($LASTEXITCODE -eq 0)
}
catch {
    $NodeErr = $_.Exception.Message
    $NodeOk = $false
}
if (-not $NodeOk) {
    $detail = (($NodeErr -split "`r?`n") | Where-Object { $_ } | Select-Object -First 3) -join "`n"
    $msg = "node was found at $NodePath but failed to start:`n$detail`n`n" +
           "Reinstall Node.js and re-run this script, e.g.:`n" +
           "    winget install OpenJS.NodeJS.LTS   # or download from https://nodejs.org"
    Write-Error $msg
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
