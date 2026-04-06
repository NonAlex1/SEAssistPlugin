@echo off
REM SE Assist Proxy — Windows startup script
REM Place a shortcut to this file in:
REM   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
REM to auto-start on login.

cd /d "%~dp0..\proxy"
node server.js
