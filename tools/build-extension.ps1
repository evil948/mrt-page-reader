# Builds extension/content.js from mrt-page-reader.user.js and packs dist/*.xpi
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$UserScript = Join-Path $Root 'mrt-page-reader.user.js'
$ExtDir = Join-Path $Root 'extension'
$ContentOut = Join-Path $ExtDir 'content.js'
$DistDir = Join-Path $Root 'dist'

if (-not (Test-Path $UserScript)) { throw "Missing $UserScript" }

$raw = Get-Content -Path $UserScript -Raw -Encoding UTF8
if ($raw -notmatch '// ==/UserScript==\r?\n') {
  throw 'Userscript header end marker not found'
}
$body = $raw -replace '(?s)^.*?// ==/UserScript==\r?\n', ''

# Sync version from userscript into manifest
$version = '0.0.0'
if ($raw -match '@version\s+(\S+)') { $version = $Matches[1] }
$manifestPath = Join-Path $ExtDir 'manifest.json'
$manifestText = Get-Content $manifestPath -Raw -Encoding UTF8
$manifestText = [regex]::Replace($manifestText, '"version"\s*:\s*"[^"]+"', ("`"version`": `"$version`""))
[System.IO.File]::WriteAllText($manifestPath, $manifestText, [System.Text.UTF8Encoding]::new($false))

$polyfill = @'
/* Generated from mrt-page-reader.user.js - do not edit by hand; run tools/build-extension.ps1 */
'use strict';

const GM = {
  async getValue(key, def) {
    const data = await browser.storage.local.get(key);
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : def;
  },
  async setValue(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
  registerMenuCommand() {
    /* context menus live in background.js */
  },
};

'@

$bridge = @'

  // Extension bridge: context menu + browser command Alt+R
  if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
    browser.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'mrt-plus') return;
      if (msg.action === 'speak') startSpeak();
      else if (msg.action === 'speak-selection') startSpeak({ selectionOnly: true });
      else if (msg.action === 'stop') stopPlayback();
      else if (msg.action === 'toggle') {
        if (isPaused) resumePlayback();
        else if (isPlaying) togglePause(true);
        else startSpeak();
      }
    });
  }
})();
'@

# Replace closing of IIFE with bridge + close
if ($body -notmatch '\}\)\(\);\s*$') {
  throw 'Unexpected userscript footer'
}
$bodyCore = $body -replace '\}\)\(\);\s*$', ''
$content = $polyfill + $bodyCore + $bridge
[System.IO.File]::WriteAllText($ContentOut, $content, [System.Text.UTF8Encoding]::new($false))

# Pack unsigned xpi (zip)
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
$xpiName = "mrt-plus-$version.xpi"
$xpiPath = Join-Path $DistDir $xpiName
$zipPath = Join-Path $DistDir ("mrt-plus-$version.zip")
if (Test-Path $xpiPath) { Remove-Item $xpiPath -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$stage = Join-Path $DistDir '_stage'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item (Join-Path $ExtDir 'manifest.json') $stage
Copy-Item (Join-Path $ExtDir 'background.js') $stage
Copy-Item (Join-Path $ExtDir 'content.js') $stage
Copy-Item (Join-Path $ExtDir 'icons') (Join-Path $stage 'icons') -Recurse

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -Force
Move-Item $zipPath $xpiPath -Force
Remove-Item $stage -Recurse -Force

Write-Host "Built $ContentOut"
Write-Host "Packed $xpiPath"
Write-Host "Version $version"
