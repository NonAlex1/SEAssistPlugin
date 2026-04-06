#!/usr/bin/env bash
# SE Assist for Outlook — macOS uninstaller

set -euo pipefail

PLIST_LABEL="com.extreme.seassist"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
INSTALL_DIR="$HOME/.seassist"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SE Assist — uninstaller"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Stop and remove LaunchAgent
if launchctl list | grep -q "$PLIST_LABEL" 2>/dev/null; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  info "Proxy stopped."
else
  warn "Proxy was not running."
fi

if [ -f "$PLIST_PATH" ]; then
  rm -f "$PLIST_PATH"
  info "LaunchAgent removed."
fi

# Remove install directory
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  info "Proxy files removed ($INSTALL_DIR)."
fi

echo ""
info "SE Assist proxy uninstalled."
echo ""
echo "  To remove the Outlook add-in:"
echo "  Outlook → Get Add-ins → My Add-ins → SE Assist → Remove"
echo ""
