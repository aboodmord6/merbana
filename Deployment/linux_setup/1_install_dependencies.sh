#!/bin/bash
set -e

echo "==========================================="
echo "   🟢 Step 1: Install OS Dependencies      "
echo "==========================================="
echo ""
echo "Cleaning up any broken nodejs installations..."
sudo rm -f /etc/apt/sources.list.d/nodesource.list || true
sudo apt-get --fix-broken install -y
sudo apt-get update

echo ""
echo "🔥 Installing required Ubuntu libraries..."
sudo apt-get install -y \
    curl \
    git \
    build-essential \
    python3 \
    python3-dev \
    python3-venv \
    python3-pip \
    libgirepository1.0-dev \
    libcairo2-dev \
    pkg-config \
    gir1.2-gtk-3.0 \
    gir1.2-webkit2-4.0 \
    libwebkit2gtk-4.0-dev

echo ""
echo "✅ Step 1 complete! You can now run step 2."
