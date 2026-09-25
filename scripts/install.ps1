# Jesun.Code installer for Windows (run in PowerShell).
#
# What this script does, nothing more:
#   1. Downloads the jesun-windows-x64.exe binary from the latest GitHub
#      release of JesunAhmadUshno/jesun-code.
#   2. Installs it to $HOME\bin\jesun.exe (or $env:JESUNCODE_INSTALL_DIR).
#   3. Adds that folder to your *user* PATH (not system-wide).
#   4. Downloads the OpenAI provider script for `ask ai` to
#      $HOME\.jesun-code\providers (optional, harmless if it fails).
#   5. Runs `jesun --version` to prove the install works.
#
# It installs nothing else, changes nothing else, and sends nothing anywhere.
# To uninstall: delete $HOME\bin\jesun.exe and remove the folder from your PATH.

$ErrorActionPreference = "Stop"

$Repo  = "JesunAhmadUshno/jesun-code"
$Asset = "jesun-windows-x64.exe"
$Url   = "https://github.com/$Repo/releases/latest/download/$Asset"

$Dest = if ($env:JESUNCODE_INSTALL_DIR) { $env:JESUNCODE_INSTALL_DIR } else { Join-Path $HOME "bin" }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Write-Host "Downloading $Asset ..."
Invoke-WebRequest -Uri $Url -OutFile (Join-Path $Dest "jesun.exe")

& (Join-Path $Dest "jesun.exe") --version
Write-Host "Installed to $(Join-Path $Dest 'jesun.exe')"

$ProviderDir = Join-Path $HOME ".jesun-code\providers"
New-Item -ItemType Directory -Force -Path $ProviderDir | Out-Null
Write-Host "Downloading the OpenAI provider for ``ask ai`` (optional) ..."
try {
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/$Repo/main/scripts/ai-providers/openai-provider" `
        -OutFile (Join-Path $ProviderDir "openai-provider")
    Write-Host "AI provider installed to $(Join-Path $ProviderDir 'openai-provider')"
} catch {
    Write-Host "Could not download the AI provider; Jesun.Code itself installed fine."
    Write-Host "Get it later from https://github.com/$Repo/tree/main/scripts/ai-providers"
}

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$Dest*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$Dest", "User")
    Write-Host "Added $Dest to your user PATH. Open a new terminal to use jesun anywhere."
}
