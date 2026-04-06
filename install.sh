#!/usr/bin/env bash
# SE Assist for Outlook — macOS installer
# Usage: curl -fsSL https://raw.githubusercontent.com/NonAlex1/SEAssistPlugin/main/install.sh | bash

set -euo pipefail

REPO="NonAlex1/SEAssistPlugin"
INSTALL_DIR="$HOME/.seassist"
PLIST_LABEL="com.extreme.seassist"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
LOG_DIR="$HOME/.seassist/logs"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
err()     { echo -e "${RED}[✗]${NC} $*"; exit 1; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SE Assist for Outlook — installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Homebrew ───────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  warn "Homebrew not found — installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for Apple Silicon
  eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || true
fi
info "Homebrew: $(brew --version | head -1)"

# ── 2. Node.js ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "Node.js not found — installing..."
  brew install node
fi
info "Node.js: $(node --version)"

# ── 3. Salesforce CLI ─────────────────────────────────────────────────────────
if ! command -v sf &>/dev/null && ! test -f /opt/homebrew/bin/sf; then
  warn "Salesforce CLI not found — installing..."
  brew install sf
fi
SF_BIN="$(command -v sf 2>/dev/null || echo /opt/homebrew/bin/sf)"
info "Salesforce CLI: $($SF_BIN --version 2>/dev/null | head -1)"

# ── 4. Download proxy files ───────────────────────────────────────────────────
info "Installing proxy to $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR" "$LOG_DIR"

RAW="https://raw.githubusercontent.com/${REPO}/main"
curl -fsSL "${RAW}/proxy/server.js"      -o "$INSTALL_DIR/server.js"
curl -fsSL "${RAW}/proxy/package.json"   -o "$INSTALL_DIR/package.json"

# ── 5. npm install ────────────────────────────────────────────────────────────
info "Installing proxy dependencies..."
cd "$INSTALL_DIR"
npm install --silent

# ── 6. Dev certificates (HTTPS on localhost) ──────────────────────────────────
CERT_DIR="$HOME/.office-addin-dev-certs"
if [ ! -f "$CERT_DIR/localhost.crt" ] || [ ! -f "$CERT_DIR/localhost.key" ]; then
  info "Installing localhost dev certificates..."
  # Use npx from the install dir node_modules
  npx --yes office-addin-dev-certs install
else
  info "Dev certificates already installed."
fi

# ── 7. LaunchAgent (auto-start on login) ─────────────────────────────────────
NODE_BIN="$(command -v node)"

# Unload old agent if present
if launchctl list | grep -q "$PLIST_LABEL" 2>/dev/null; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${INSTALL_DIR}/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/proxy.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/proxy-error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
</dict>
</plist>
PLIST

launchctl load "$PLIST_PATH"
info "Proxy LaunchAgent installed — will auto-start on login."

# Give the server a moment to start
sleep 2

# Quick health check
if curl -sk https://127.0.0.1:3002/api/health | grep -q '"ok":true'; then
  info "Proxy is running at https://127.0.0.1:3002"
else
  warn "Proxy may still be starting. Check logs: tail -f $LOG_DIR/proxy.log"
fi

# ── Download manifest to Downloads folder ─────────────────────────────────────
MANIFEST_DEST="$HOME/Downloads/seassist-manifest.xml"
curl -fsSL "${RAW}/manifest.prod.xml" -o "$MANIFEST_DEST"
info "Manifest saved to $MANIFEST_DEST"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}  Installation complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Next step — add the add-in to Outlook."
echo "  Choose whichever option works for you:"
echo ""
echo "  ── Option A: Add from URL (try this first) ──────────────"
echo "  1. Open Outlook (desktop or outlook.office.com)"
echo "  2. Click  Get Add-ins  →  My Add-ins"
echo "     →  Add a custom add-in  →  Add from URL"
echo "  3. Paste:"
echo ""
echo "     https://raw.githubusercontent.com/${REPO}/main/manifest.prod.xml"
echo ""
echo "  ── Option B: Add from file (if URL option is grayed out) ─"
echo "  1. Open Outlook (desktop or outlook.office.com)"
echo "  2. Click  Get Add-ins  →  My Add-ins"
echo "     →  Add a custom add-in  →  Add from file"
echo "  3. Select the manifest saved to your Downloads folder:"
echo ""
echo "     $MANIFEST_DEST"
echo ""
echo "  ──────────────────────────────────────────────────────────"
echo "  Once installed, the 'Create SE Assist' button will appear"
echo "  in your email and calendar ribbon."
echo ""
echo "  Logs:       $LOG_DIR/proxy.log"
echo "  To uninstall: curl -fsSL ${RAW}/uninstall.sh | bash"
echo ""
