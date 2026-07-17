<#
.SYNOPSIS
  Cut a signed TNM Downloader release and publish it to GitHub so installed
  copies auto-update.

.EXAMPLE
  .\scripts\release.ps1 -Version 0.2.0 -Notes "Adds the Beam-it button"

  Bumps the version everywhere, builds the signed NSIS installer, writes
  latest.json (the file the app polls), then tags and creates the GitHub
  release with the installer + signature + latest.json attached.
#>
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = ""
)
$ErrorActionPreference = "Stop"

# ---- app-specific constants -------------------------------------------------
$Repo        = "gant123/tnm-downloader"
$KeyPath     = "$HOME\.tauri\tnm-downloader.key"
$KeyPassword = ""   # this key was generated without a password
# -----------------------------------------------------------------------------

if ($Notes -eq "") { $Notes = "TNM Downloader v$Version" }

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$App         = Join-Path $ProjectRoot "app"
$SrcTauri    = Join-Path $App "src-tauri"
$Conf        = Join-Path $SrcTauri "tauri.conf.json"
$Pkg         = Join-Path $App "package.json"
$Cargo       = Join-Path $SrcTauri "Cargo.toml"

if (-not (Test-Path $KeyPath)) { throw "Signing key not found at $KeyPath" }

# ---- 1. bump the version in all three manifests ----
$confJson = Get-Content $Conf -Raw | ConvertFrom-Json
$oldVersion = $confJson.version
Write-Host "Bumping $oldVersion -> $Version" -ForegroundColor Cyan

$confJson.version = $Version
$confJson | ConvertTo-Json -Depth 20 | Set-Content $Conf -Encoding utf8

$pkgJson = Get-Content $Pkg -Raw | ConvertFrom-Json
$pkgJson.version = $Version
$pkgJson | ConvertTo-Json -Depth 20 | Set-Content $Pkg -Encoding utf8

(Get-Content $Cargo -Raw) -replace "version = `"$([regex]::Escape($oldVersion))`"", "version = `"$Version`"" |
  Set-Content $Cargo -Encoding utf8

# ---- 2. build the signed installer ----
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $KeyPath -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $KeyPassword
Push-Location $App
try { npm run tauri build } finally { Pop-Location }

# ---- 3. locate the artifacts ----
$NsisDir = Join-Path $SrcTauri "target\release\bundle\nsis"
$Setup = Get-ChildItem $NsisDir -Filter "*-setup.exe" | Select-Object -First 1
if (-not $Setup) { throw "No -setup.exe produced in $NsisDir" }
$SigPath = "$($Setup.FullName).sig"
if (-not (Test-Path $SigPath)) { throw "No .sig next to $($Setup.Name) - is createUpdaterArtifacts on?" }

# GitHub rewrites spaces to dots in uploaded asset names.
$AssetName = $Setup.Name -replace ' ', '.'
$Url = "https://github.com/$Repo/releases/download/v$Version/$AssetName"

# ---- 4. write latest.json (the manifest the app polls) ----
$latest = [ordered]@{
  version   = $Version
  notes     = $Notes
  pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = @{
    "windows-x86_64" = @{
      signature = (Get-Content $SigPath -Raw).Trim()
      url       = $Url
    }
  }
}
$LatestPath = Join-Path $NsisDir "latest.json"
$latest | ConvertTo-Json -Depth 6 | Set-Content $LatestPath -Encoding utf8

# ---- 5. commit, tag, and publish the release ----
Push-Location $ProjectRoot
try {
  git add -A
  git commit -m "Release v$Version"
  git tag "v$Version"
  git push
  git push origin "v$Version"
  gh release create "v$Version" `
    "$($Setup.FullName)" `
    "$SigPath" `
    "$LatestPath" `
    --repo $Repo --title "v$Version" --notes $Notes
} finally { Pop-Location }

Write-Host "Released v$Version. Installed copies will pick it up on next launch." -ForegroundColor Green
