<#
.SYNOPSIS
  Copies the latest built extension from GitHub onto the practice shared drive.

.DESCRIPTION
  This is the one step that is not in GitHub and not in Chrome: something on the
  practice network has to move two files from the private repository's latest
  release onto the shared drive that Chrome polls.

  Run it on a machine that can see both — a scheduled task every hour or two is
  enough, since Chrome only checks for updates every five hours or so anyway.

  The files land in a staging folder first and are then moved into place, .crx
  before updates.xml. Downloading straight into the shared folder would let
  Chrome read a half-written .crx, or read an updates.xml announcing a version
  whose .crx has not arrived yet.

.PARAMETER Destination
  The shared-drive folder Chrome's update_url points at, e.g. Z:\RiversideExtension.

.PARAMETER Repo
  owner/repo of the private repository holding the releases.

.EXAMPLE
  .\sync-extension.ps1 -Destination Z:\RiversideExtension

.NOTES
  Needs the GitHub CLI (https://cli.github.com), authenticated once as a user
  who can read the private repository:  gh auth login
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Destination,
  [string]$Repo = 'F12-Syntex/Riverside-Helpdesk'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "The GitHub CLI (gh) is not installed or not on PATH. See https://cli.github.com."
}

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "gh is not signed in. Run 'gh auth login' as an account that can read $Repo."
}

if (-not (Test-Path -LiteralPath $Destination)) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
}

$staging = Join-Path $Destination '.staging'
if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

try {
  Write-Host "Downloading the latest release of $Repo..."
  gh release download --repo $Repo --pattern '*.crx' --pattern 'updates.xml' --dir $staging --clobber
  if ($LASTEXITCODE -ne 0) { throw "gh release download failed (exit $LASTEXITCODE)." }

  $crx = Join-Path $staging 'extension.crx'
  $xml = Join-Path $staging 'updates.xml'
  foreach ($file in @($crx, $xml)) {
    if (-not (Test-Path -LiteralPath $file)) { throw "The release did not contain $(Split-Path $file -Leaf)." }
  }

  # The version Chrome is about to be offered, so the log says what happened.
  $version = ([xml](Get-Content -LiteralPath $xml)).gupdate.app.updatecheck.version

  # .crx first: updates.xml is the announcement, and must never arrive before
  # the thing it announces.
  Move-Item -LiteralPath $crx -Destination (Join-Path $Destination 'extension.crx') -Force
  Move-Item -LiteralPath $xml -Destination (Join-Path $Destination 'updates.xml') -Force

  Write-Host "Synced version $version to $Destination."
  Write-Host "Chrome will pick it up at its next update check (within about five hours),"
  Write-Host "or immediately from chrome://extensions with Update clicked."
}
finally {
  if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
