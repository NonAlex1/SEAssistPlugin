# SE Assist for Outlook — Windows uninstaller
# Run in PowerShell:
#   irm https://raw.githubusercontent.com/NonAlex1/SEAssistPlugin/main/uninstall.ps1 | iex

$TASK    = "SE Assist Proxy"
$INSTALL = "$env:USERPROFILE\.seassist"

function Write-OK  { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn{ param($msg) Write-Host "[!]  $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  SE Assist - Windows uninstaller"               -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Stop and remove scheduled task
if (Get-ScheduledTask -TaskName $TASK -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask  -TaskName $TASK -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TASK -Confirm:$false
    Write-OK "Proxy stopped and scheduled task removed."
} else {
    Write-Warn "Proxy task was not found."
}

# Remove install directory
if (Test-Path $INSTALL) {
    Remove-Item -Recurse -Force $INSTALL
    Write-OK "Proxy files removed ($INSTALL)."
}

Write-Host ""
Write-OK "SE Assist proxy uninstalled."
Write-Host ""
Write-Host "  To remove the Outlook add-in:"
Write-Host "  Outlook -> Get Add-ins -> My Add-ins -> SE Assist -> Remove"
Write-Host ""
