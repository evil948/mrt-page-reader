# Signs the Firefox extension via AMO (unlisted) so .xpi installs with a click.
# Credentials (do NOT commit): tools/amo-credentials.local.ps1
#   $env:WEB_EXT_API_KEY    = 'user:....'   # JWT issuer
#   $env:WEB_EXT_API_SECRET = '........'    # JWT secret
#
# Or set the same env vars in the shell before running.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ExtDir = Join-Path $Root 'extension'
$DistDir = Join-Path $Root 'dist'
$CredFile = Join-Path $PSScriptRoot 'amo-credentials.local.ps1'
$Artifacts = Join-Path $ExtDir 'web-ext-artifacts'

if (Test-Path $CredFile) {
  . $CredFile
}

if (-not $env:WEB_EXT_API_KEY -and $env:AMO_JWT_ISSUER) {
  $env:WEB_EXT_API_KEY = $env:AMO_JWT_ISSUER
}
if (-not $env:WEB_EXT_API_SECRET -and $env:AMO_JWT_SECRET) {
  $env:WEB_EXT_API_SECRET = $env:AMO_JWT_SECRET
}

if (-not $env:WEB_EXT_API_KEY -or -not $env:WEB_EXT_API_SECRET) {
  throw @"
Missing AMO API credentials.

1. Copy tools/amo-credentials.local.ps1.example -> tools/amo-credentials.local.ps1
2. Paste JWT issuer / secret from https://addons.mozilla.org/developers/addon/api/key/
3. Re-run: powershell -File tools/sign-extension.ps1
"@
}

# Ensure content.js is up to date
& (Join-Path $PSScriptRoot 'build-extension.ps1')

# Resolve web-ext
$webExt = $null
try {
  $webExt = (Get-Command web-ext -ErrorAction Stop).Source
} catch {
  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npmCmd) {
    throw 'Node.js/npm not found. Install Node.js LTS, then re-run this script (it will use npx web-ext).'
  }
}

Push-Location $ExtDir
try {
  if (Test-Path $Artifacts) {
    Remove-Item $Artifacts -Recurse -Force
  }

  $signArgs = @(
    'sign',
    '--channel=unlisted',
    '--source-dir=.',
    '--artifacts-dir=web-ext-artifacts',
    "--api-key=$($env:WEB_EXT_API_KEY)",
    "--api-secret=$($env:WEB_EXT_API_SECRET)"
  )

  if ($webExt) {
    & web-ext @signArgs
  } else {
    & npx --yes web-ext@8 @signArgs
  }

  $signed = Get-ChildItem -Path $Artifacts -Filter '*.xpi' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $signed) {
    throw 'Signing finished but no .xpi found in extension/web-ext-artifacts'
  }

  New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
  $version = '0.0.0'
  $manifest = Get-Content (Join-Path $ExtDir 'manifest.json') -Raw -Encoding UTF8
  if ($manifest -match '"version"\s*:\s*"([^"]+)"') { $version = $Matches[1] }

  $out = Join-Path $DistDir "mrt-plus-$version-signed.xpi"
  Copy-Item $signed.FullName $out -Force
  # Also refresh the main release artifact name
  Copy-Item $signed.FullName (Join-Path $DistDir "mrt-plus-$version.xpi") -Force

  Write-Host "Signed: $($signed.FullName)"
  Write-Host "Copied: $out"
  Write-Host "Ready to upload to GitHub Releases."
} finally {
  Pop-Location
}
