#!/bin/bash
# ClipFinder Backend Startup Script
# Usage: ./start.sh

echo "🎬 Starting ClipFinder Backend..."
echo "   Models will be downloaded on first run (~500MB)"
echo ""

# Ensure storage directories exist
mkdir -p storage/videos storage/lancedb

# Start the server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
