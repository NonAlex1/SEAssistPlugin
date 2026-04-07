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
# Always inject Homebrew into PATH — covers both Apple Silicon and Intel,
# and ensures tools installed during THIS run are immediately visible.
eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || \
  eval "$(/usr/local/bin/brew shellenv)"  2>/dev/null || true
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v brew &>/dev/null; then
  warn "Homebrew not found — installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || true
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
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

# ── 6. PKI certificate + key ──────────────────────────────────────────────────
info "Installing proxy certificate..."
curl -fsSL "${RAW}/certs/seassist.crt" -o "$INSTALL_DIR/seassist.crt"
curl -fsSL "${RAW}/certs/seassist.key" -o "$INSTALL_DIR/seassist.key"
chmod 600 "$INSTALL_DIR/seassist.key"

# ── 6a. CA trust check ────────────────────────────────────────────────────────
# AIA URLs embedded in seassist.crt — no need to bundle CA certs in repo
CA_ISSUING_URL="http://pki.extremenetworks.com/CertEnroll/usnc-pki-p5.corp.extremenetworks.com_Extreme%20Networks%20PKI%20Issuing%20CA(3).crt"
CA_ROOT_URL="http://pki.extremenetworks.com/CertEnroll/usnc-pki-p4_Extreme%20Networks%20PKI%20Root(1).crt"

if security verify-cert -c "$INSTALL_DIR/seassist.crt" &>/dev/null; then
  info "CA certificate chain already trusted."
else
  warn "CA certificates not in trust store — installing to login keychain..."

  # Download and install Intermediate CA
  curl -fsSL "$CA_ISSUING_URL" -o /tmp/extreme-issuing-ca.crt
  security add-trusted-cert -r trustAsRoot \
    -k "$HOME/Library/Keychains/login.keychain-db" \
    /tmp/extreme-issuing-ca.crt

  # Download and install Root CA
  curl -fsSL "$CA_ROOT_URL" -o /tmp/extreme-root-ca.crt
  security add-trusted-cert -r trustRoot \
    -k "$HOME/Library/Keychains/login.keychain-db" \
    /tmp/extreme-root-ca.crt

  rm -f /tmp/extreme-issuing-ca.crt /tmp/extreme-root-ca.crt

  # Verify the chain now validates
  if security verify-cert -c "$INSTALL_DIR/seassist.crt" &>/dev/null; then
    info "CA certificates installed and trusted."
  else
    warn "CA trust installation may need a reboot to take effect."
  fi
fi

# ── 7. LaunchAgent (auto-start on login) ─────────────────────────────────────
NODE_BIN="$(command -v node 2>/dev/null || echo /opt/homebrew/bin/node)"
if [ ! -x "$NODE_BIN" ]; then
  err "Cannot locate node binary at '$NODE_BIN'. Installation may be incomplete."
fi

# Remove old agent if present (use modern bootout API — avoids deprecation warning)
launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true

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

launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
info "Proxy LaunchAgent installed — will auto-start on login."

# Give the server a moment to start
sleep 2

# Quick health check
if curl -s https://127.0.0.1:3002/api/health | grep -q '"ok":true'; then
  info "Proxy is running at https://127.0.0.1:3002"
else
  warn "Proxy may still be starting. Check logs: tail -f $LOG_DIR/proxy.log"
fi

# ── Download manifest to Downloads folder ─────────────────────────────────────
MANIFEST_DEST="$HOME/Downloads/seassist-manifest.xml"
curl -fsSL "https://nonalex1.github.io/SEAssistPlugin/manifest.xml" -o "$MANIFEST_DEST"
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
echo "     https://nonalex1.github.io/SEAssistPlugin/manifest.xml"
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
