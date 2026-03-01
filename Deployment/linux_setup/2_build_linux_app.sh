#!/bin/bash
set -e

echo "==========================================="
echo "   🟢 Step 2: Bundle Linux Application     "
echo "==========================================="
echo ""
echo "📦 1. Checking for Frontend Build..."
if [ ! -f "../../dist/index.html" ] && [ ! -f "../dist/index.html" ] && [ ! -f "dist/index.html" ]; then
    echo "⚠️  WARNING: 'dist/index.html' not found!"
    echo "⚠️  You MUST run 'npm run build' on Windows entirely, then copy the 'dist/' folder"
    echo "⚠️  into this project directory before continuing!"
    echo "Waiting 5 seconds..."
    sleep 5
fi

# Navigate to project root properly
cd "$(dirname "$0")/../.."

echo ""
echo "🐍 2. Setting up Python environment..."

# Install UV for fast python builds if not present
if ! command -v uv &> /dev/null; then
    echo "🐍 Installing UV package manager..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

if command -v uv &> /dev/null; then
    uv venv
    uv pip install -r requirements.txt
    
    echo ""
    echo "🔨 3. Starting the pyinstaller build process..."
    uv run python Deployment/build_linux.py
else
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    
    echo ""
    echo "🔨 3. Starting the pyinstaller build process..."
    python3 Deployment/build_linux.py
fi

echo ""
echo "🎉 All Done! If successful, the standalone Linux executable is in the 'dist/' folder."
