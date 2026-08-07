#!/bin/bash
# ==============================================================================
#  Go WhatsApp Web Multi-Device (gowasi) - One-Click VPS Deploy & Update Script
#  Supports: Ubuntu 20.04 / 22.04 / 24.04 & Debian 11 / 12
# ==============================================================================

set -e

echo "========================================================"
echo "  🚀 Starting gowasi VPS Deployment & Server Manager"
echo "========================================================"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 1. Pull Latest Updates from GitHub if git repository exists
if [ -d ".git" ]; then
    echo "📦 Checking & pulling latest updates from GitHub..."
    git pull origin main || echo "⚠️ Git pull warning (continuing with local code)..."
fi

# 2. Install Go & build dependencies on Ubuntu/Debian if missing
if ! command -v go &> /dev/null; then
    echo "📥 Installing Go compiler and build essentials for Linux..."
    sudo apt-get update -y
    sudo apt-get install -y golang git build-essential curl ca-certificates
fi

# 3. Compile gowa-ui Frontend & Clean Source Cache to Minimize Storage Usage
if [ -d "gowa-ui" ] && command -v npm &> /dev/null; then
    echo "🔨 Building Vue 3 gowa-ui frontend..."
    cd "$SCRIPT_DIR/gowa-ui"
    if [ -f "package.json" ]; then
        npm install --silent || true
        npm run build || true
        echo "🧹 Cleaning up gowa-ui node_modules build cache to save VPS disk space..."
        rm -rf node_modules package-lock.json .vite
    fi
    cd "$SCRIPT_DIR"
fi

# 4. Build Go PureGo backend binary
echo "🔨 Building Go backend binary (whatsapp)..."
cd "$SCRIPT_DIR/src"
go build -tags purego -o whatsapp .

# 5. Run gowasi REST Server
echo "🟢 Launching gowasi REST Server on http://0.0.0.0:3000 ..."
./whatsapp rest
