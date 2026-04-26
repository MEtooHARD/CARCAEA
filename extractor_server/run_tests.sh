#!/bin/bash

# Test script runner
# Activates virtual environment and runs the test endpoint script

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Activate virtual environment
if [ -d "$SCRIPT_DIR/.venv" ]; then
    echo "🔌 Activating virtual environment..."
    source "$SCRIPT_DIR/.venv/bin/activate"
else
    echo "⚠ Virtual environment not found at $SCRIPT_DIR/.venv"
    echo "Please create it first with: python -m venv .venv"
    exit 1
fi

# Check if requests package is installed
python -c "import requests" 2>/dev/null || {
    echo "📦 Installing requests package..."
    pip install requests
}

# Run the test
echo ""
echo "🧪 Starting endpoint tests..."
echo ""
cd "$SCRIPT_DIR"
python test_endpoint.py

echo ""
echo "✅ Done! Results saved to test_res/"
