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
    Stop-ScheduledTask -TaskName $TASK -ErrorAction SilentlyContinue
    try {
        Unregister-ScheduledTask -TaskName $TASK -Confirm:$false -ErrorAction Stop
        Write-OK "Scheduled task removed."
    } catch {
        Write-Warn @"
Could not remove scheduled task '$TASK' (Access Denied).
It was likely created by an Administrator account.
To remove it, either:
  - Open Task Scheduler (taskschd.msc), find '$TASK' and delete it manually, or
  - Run this uninstaller once in an elevated (Administrator) PowerShell.
Continuing with file removal...
"@
    }
} else {
    Write-Warn "Proxy task was not found."
}

# Kill any node.exe process running server.js from the install directory.
# Stop-ScheduledTask only kills wscript.exe (the launcher); node.exe was
# spawned as a detached independent process and keeps running, holding
# file handles on the install folder — Remove-Item fails until it is gone.
$serverJs = "$INSTALL\server.js"
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    try { $_.MainModule.FileName } catch { $null }   # filter accessible processes
    $true
} | ForEach-Object {
    # Check command line for our server.js path
    $cmdline = (Get-WmiObject Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cmdline -like "*server.js*" -and $cmdline -like "*.seassist*") {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        Write-OK "Proxy process (PID $($_.Id)) terminated."
    }
}
# Give the OS a moment to release file handles
Start-Sleep -Milliseconds 500

# Remove install directory
if (Test-Path $INSTALL) {
    Remove-Item -Recurse -Force $INSTALL -ErrorAction SilentlyContinue
    if (Test-Path $INSTALL) {
        Write-Warn "Could not fully remove $INSTALL (a file may still be locked). Please delete it manually."
    } else {
        Write-OK "Proxy files removed ($INSTALL)."
    }
}

Write-Host ""
Write-OK "SE Assist proxy uninstalled."
Write-Host ""
Write-Host "  To remove the Outlook add-in:"
Write-Host "  Outlook -> Get Add-ins -> My Add-ins -> SE Assist -> Remove"
Write-Host ""
