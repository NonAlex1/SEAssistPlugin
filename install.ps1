# SE Assist for Outlook — Windows installer
# Run in PowerShell as your normal user (no admin required for most steps):
#   irm https://raw.githubusercontent.com/NonAlex1/SEAssistPlugin/main/install.ps1 | iex

#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$REPO     = "NonAlex1/SEAssistPlugin"
$RAW      = "https://raw.githubusercontent.com/$REPO/main"
$INSTALL  = "$env:USERPROFILE\.seassist"
$LOGS     = "$INSTALL\logs"
$TASK     = "SE Assist Proxy"
$MANIFEST = "$env:USERPROFILE\Downloads\seassist-manifest.xml"

function Write-OK  { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn{ param($msg) Write-Host "[!]  $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "[X]  $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  SE Assist for Outlook - Windows installer"     -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── Execution policy ─────────────────────────────────────────────────────────
$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -eq 'Restricted') {
    Write-Warn "Setting PowerShell execution policy to RemoteSigned for current user..."
    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
}

# ── Helper: refresh PATH from registry ───────────────────────────────────────
function Refresh-Path {
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH','User')
}

# ── 1. Node.js ────────────────────────────────────────────────────────────────
Refresh-Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Warn "Node.js not found — installing via winget..."
    winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements -e
    Refresh-Path
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Err "Node.js install failed. Install manually from https://nodejs.org then re-run this script."
    }
}
Write-OK "Node.js: $(node --version)"

# ── 2. Salesforce CLI ─────────────────────────────────────────────────────────
Refresh-Path
if (-not (Get-Command sf -ErrorAction SilentlyContinue)) {
    Write-Warn "Salesforce CLI not found — installing via npm..."
    npm install -g @salesforce/cli --silent
    Refresh-Path
    if (-not (Get-Command sf -ErrorAction SilentlyContinue)) {
        Write-Err "Salesforce CLI install failed. Install manually from https://developer.salesforce.com/tools/salesforcecli then re-run."
    }
}
Write-OK "Salesforce CLI: $(sf --version 2>$null | Select-Object -First 1)"

# ── 3. Download proxy files ───────────────────────────────────────────────────
Write-OK "Installing proxy to $INSTALL ..."
New-Item -ItemType Directory -Force -Path $INSTALL | Out-Null
New-Item -ItemType Directory -Force -Path $LOGS    | Out-Null

Invoke-WebRequest "$RAW/proxy/server.js"    -OutFile "$INSTALL\server.js"    -UseBasicParsing
Invoke-WebRequest "$RAW/proxy/package.json" -OutFile "$INSTALL\package.json" -UseBasicParsing

# ── 4. npm install ────────────────────────────────────────────────────────────
Write-OK "Installing proxy dependencies..."
Push-Location $INSTALL
npm install --silent
Pop-Location

# ── 5. Dev certificates ───────────────────────────────────────────────────────
$certStore = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -like "*localhost*" } | Select-Object -First 1
if (-not $certStore) {
    Write-OK "Installing localhost dev certificates..."
    Set-Location $INSTALL
    npx --yes office-addin-dev-certs install
} else {
    Write-OK "Dev certificates already installed."
}

# ── 6. Scheduled Task (auto-start on login) ───────────────────────────────────
$nodePath = (Get-Command node).Source

# Remove old task if present
if (Get-ScheduledTask -TaskName $TASK -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TASK -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TASK -Confirm:$false
}

$action   = New-ScheduledTaskAction `
                -Execute $nodePath `
                -Argument "`"$INSTALL\server.js`"" `
                -WorkingDirectory $INSTALL

$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
                -ExecutionTimeLimit 0 `
                -RestartCount 3 `
                -RestartInterval (New-TimeSpan -Minutes 1) `
                -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal `
                -UserId $env:USERNAME `
                -LogonType Interactive `
                -RunLevel Limited

Register-ScheduledTask `
    -TaskName  $TASK `
    -Action    $action `
    -Trigger   $trigger `
    -Settings  $settings `
    -Principal $principal `
    -Force | Out-Null

# Start it now without waiting for next login
Start-ScheduledTask -TaskName $TASK
Write-OK "Proxy task registered — will auto-start on every login."

# Wait for proxy to come up
Start-Sleep -Seconds 3
try {
    # Skip TLS validation for localhost self-signed cert
    add-type @"
        using System.Net; using System.Security.Cryptography.X509Certificates;
        public class TrustAll : ICertificatePolicy {
            public bool CheckValidationResult(ServicePoint sp, X509Certificate cert, WebRequest req, int problem) { return true; }
        }
"@
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAll
    $resp = Invoke-RestMethod -Uri "https://127.0.0.1:3002/api/health" -Method GET
    if ($resp.ok) { Write-OK "Proxy is running at https://127.0.0.1:3002" }
} catch {
    Write-Warn "Proxy may still be starting. Check logs: $LOGS\proxy.log"
}

# ── 7. Download manifest ──────────────────────────────────────────────────────
Invoke-WebRequest "$RAW/manifest.prod.xml" -OutFile $MANIFEST -UseBasicParsing
Write-OK "Manifest saved to $MANIFEST"

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Next step - add the add-in to Outlook."
Write-Host "  Choose whichever option works for you:"
Write-Host ""
Write-Host "  -- Option A: Add from URL (try this first) --" -ForegroundColor Cyan
Write-Host "  1. Open Outlook (desktop or outlook.office.com)"
Write-Host "  2. Click  Get Add-ins -> My Add-ins"
Write-Host "     -> Add a custom add-in -> Add from URL"
Write-Host "  3. Paste:"
Write-Host ""
Write-Host "     https://raw.githubusercontent.com/$REPO/main/manifest.prod.xml" -ForegroundColor Yellow
Write-Host ""
Write-Host "  -- Option B: Add from file (if URL is grayed out) --" -ForegroundColor Cyan
Write-Host "  1. Open Outlook (desktop or outlook.office.com)"
Write-Host "  2. Click  Get Add-ins -> My Add-ins"
Write-Host "     -> Add a custom add-in -> Add from file"
Write-Host "  3. Select the manifest saved to your Downloads:"
Write-Host ""
Write-Host "     $MANIFEST" -ForegroundColor Yellow
Write-Host ""
Write-Host "  -----------------------------------------------"
Write-Host "  Once installed, the 'Create SE Assist' button"
Write-Host "  will appear in your email and calendar ribbon."
Write-Host ""
Write-Host "  Logs:       $LOGS\proxy.log"
Write-Host "  To uninstall: irm $RAW/uninstall.ps1 | iex"
Write-Host ""
