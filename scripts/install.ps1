# Jesun.Code installer for Windows (run in PowerShell).
#
# What this script does, nothing more:
#   1. Downloads the jesun-windows-x64.exe binary from the latest GitHub
#      release of JesunAhmadUshno/jesun-code.
#   2. Installs it to $HOME\bin\jesun.exe (or $env:JESUNCODE_INSTALL_DIR).
#   3. Adds that folder to your *user* PATH (not system-wide).
#   4. Downloads the AI provider scripts for `ask ai` to
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
Write-Host "Downloading the AI providers for ``ask ai`` (optional) ..."
foreach ($Provider in @("openai-provider", "gemini-provider")) {
    try {
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/$Repo/main/scripts/ai-providers/$Provider" `
            -OutFile (Join-Path $ProviderDir $Provider)
        Write-Host "AI provider installed to $(Join-Path $ProviderDir $Provider)"
    } catch {
        Write-Host "Could not download $Provider; Jesun.Code itself installed fine."
    }
}
Write-Host "Get providers later from https://github.com/$Repo/tree/main/scripts/ai-providers"

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$Dest*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$Dest", "User")
    Write-Host "Added $Dest to your user PATH. Open a new terminal to use jesun anywhere."
}
