#!/bin/bash
set -e

echo "==========================================="
echo "   Merbana Linux 🐧 One-Shot Build Script    "
echo "==========================================="
echo ""
echo "🔥 0. Installing OS Dependencies for a fresh Ubuntu/Debian machine..."
# We assume Debian/Ubuntu for apt. If running as non-root, this prompts for sudo password.
sudo apt-get update
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
    gir1.2-webkit2-4.1 \
    libwebkit2gtk-4.1-dev

# 0.1 Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 0.2 Install UV for fast python builds if not present
if ! command -v uv &> /dev/null; then
    echo "🐍 Installing UV package manager..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi


echo ""
echo "📦 1. Installing/Updating NPM dependencies..."
npm install

echo ""
echo "🐍 2. Setting up Python environment..."
# Check if uv is installed, otherwise fallback to standard python/pip
if command -v uv &> /dev/null; then
    uv venv
    uv pip install -r requirements.txt
    
    echo ""
    echo "🔨 3. Starting the build process..."
    uv run python Deployment/build_linux.py
else
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    
    echo ""
    echo "🔨 3. Starting the build process..."
    python3 Deployment/build_linux.py
fi

echo ""
echo "🎉 All Done! If successful, the standalone Linux executable is in the 'dist/' folder."
