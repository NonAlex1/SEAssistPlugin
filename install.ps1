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
# Always unlock the current process first (required so npm.ps1 / npx.ps1 can
# run inside this very session, regardless of machine/user scope settings).
Set-ExecutionPolicy RemoteSigned -Scope Process -Force

$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -in 'Restricted', 'Undefined') {
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

# ── 5. PKI certificate + key ──────────────────────────────────────────────────
Write-OK "Installing proxy certificate..."
Invoke-WebRequest "$RAW/certs/seassist.crt" -OutFile "$INSTALL\seassist.crt" -UseBasicParsing
Invoke-WebRequest "$RAW/certs/seassist.key" -OutFile "$INSTALL\seassist.key" -UseBasicParsing

# ── 5a. CA trust check ────────────────────────────────────────────────────────
$CA_ISSUING_URL = "http://pki.extremenetworks.com/CertEnroll/usnc-pki-p5.corp.extremenetworks.com_Extreme%20Networks%20PKI%20Issuing%20CA(3).crt"
$CA_ROOT_URL    = "http://pki.extremenetworks.com/CertEnroll/usnc-pki-p4_Extreme%20Networks%20PKI%20Root(1).crt"

$cert  = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2("$INSTALL\seassist.crt")
$chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
$trusted = $chain.Build($cert)

if ($trusted) {
    Write-OK "CA certificate chain already trusted."
} else {
    Write-Warn "CA certificates not in trust store — installing..."

    # Intermediate CA → CurrentUser\CA (no admin required)
    Invoke-WebRequest $CA_ISSUING_URL -OutFile "$env:TEMP\extreme-issuing-ca.crt" -UseBasicParsing
    Import-Certificate -FilePath "$env:TEMP\extreme-issuing-ca.crt" `
        -CertStoreLocation Cert:\CurrentUser\CA | Out-Null

    # Root CA → CurrentUser\Root (shows a confirmation dialog, no admin required)
    Invoke-WebRequest $CA_ROOT_URL -OutFile "$env:TEMP\extreme-root-ca.crt" -UseBasicParsing
    Import-Certificate -FilePath "$env:TEMP\extreme-root-ca.crt" `
        -CertStoreLocation Cert:\CurrentUser\Root | Out-Null

    Remove-Item "$env:TEMP\extreme-issuing-ca.crt","$env:TEMP\extreme-root-ca.crt" -ErrorAction SilentlyContinue

    # Verify the chain now validates
    $chain2   = New-Object System.Security.Cryptography.X509Certificates.X509Chain
    $trusted2 = $chain2.Build($cert)
    if ($trusted2) {
        Write-OK "CA certificates installed and trusted."
    } else {
        Write-Warn "CA trust installation may require a reboot to take effect."
    }
}

# ── 6. Scheduled Task (auto-start on login) ───────────────────────────────────
$nodePath = (Get-Command node).Source

# Write a tiny VBScript launcher — wscript.exe is a GUI subsystem host so it
# never creates a console window or taskbar button.  Shell.Run with style 0
# makes the child process (node) fully invisible too.
# Use ASCII (no BOM) — VBScript compilation fails on UTF-8 BOM.
$vbsPath = "$INSTALL\run-proxy.vbs"
$vbsLines = @(
    'Set sh = CreateObject("WScript.Shell")',
    'sh.Run Chr(34) & WScript.Arguments(0) & Chr(34) & " " & Chr(34) & WScript.Arguments(1) & Chr(34), 0, False'
)
[System.IO.File]::WriteAllLines($vbsPath, $vbsLines, [System.Text.Encoding]::ASCII)

# Remove old task if present
if (Get-ScheduledTask -TaskName $TASK -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TASK -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TASK -Confirm:$false
}

# Launch via wscript.exe → VBS → node (completely hidden, no taskbar entry)
$action   = New-ScheduledTaskAction `
                -Execute "wscript.exe" `
                -Argument "`"$vbsPath`" `"$nodePath`" `"$INSTALL\server.js`"" `
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
    $resp = Invoke-RestMethod -Uri "https://127.0.0.1:3002/api/health" -Method GET
    if ($resp.ok) { Write-OK "Proxy is running at https://127.0.0.1:3002" }
} catch {
    Write-Warn "Proxy may still be starting. Check logs: $LOGS\proxy.log"
}

# ── 7. Download manifest ──────────────────────────────────────────────────────
Invoke-WebRequest "https://nonalex1.github.io/SEAssistPlugin/manifest.xml" -OutFile $MANIFEST -UseBasicParsing
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
Write-Host "     https://nonalex1.github.io/SEAssistPlugin/manifest.xml" -ForegroundColor Yellow
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
