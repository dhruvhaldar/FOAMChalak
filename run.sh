#!/bin/bash
# FOAMFlask Runner Script for Linux/macOS
# This script runs the FOAMFlask application using the uv-managed environment.

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Ensure we are in the script's directory
cd "$(dirname "$0")"

# Pre-seed uv path
if [ -d "$HOME/.local/bin" ]; then
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        export PATH="$HOME/.local/bin:$PATH"
    fi
fi

# Ensure uv is installed
if ! command -v uv >/dev/null 2>&1; then
    echo -e "${RED}Error: 'uv' not found. Please run ./install.sh first to set up the environment.${NC}"
    exit 1
fi

# --- Docker Auto-Start ---
# Check if Docker is running
if ! docker version >/dev/null 2>&1; then
    echo -e "${YELLOW}Docker is not running. Attempting to start Docker service...${NC}"
    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl start docker
        echo -e "${CYAN}Docker service launch initiated. Waiting for startup...${NC}"
        sleep 5
    else
        echo -e "${YELLOW}Warning: systemctl not found. Please start the Docker daemon manually.${NC}"
    fi
fi

# Set Docker context to default to ensure we look for the correct socket/pipe
docker context use default >/dev/null 2>&1 || true

echo -e ""
echo -e "${CYAN}--- FOAMFlask Runner ---${NC}"
echo -e "Starting FOAMFlask..."
echo -e "Access the application at: ${GREEN}http://localhost:5000${NC}"
echo -e "Press Ctrl+C to stop the server."
echo -e ""

# --- Clean Restart ---
# Kill any existing FOAMFlask python processes so re-running always starts fresh.
echo -e "${YELLOW}Checking for existing FOAMFlask processes...${NC}"
OLD_PIDS=$(pgrep -f "(-m app|start_worker|foamflask_slice|foamflask_iso)" 2>/dev/null)
if [ -n "$OLD_PIDS" ]; then
    echo -e "${YELLOW}Stopping existing processes: $OLD_PIDS${NC}"
    kill $OLD_PIDS 2>/dev/null || true
    sleep 1
fi

# Run the application using python -m app
# We enforce Flask-only architecture as specified in AGENTS.md
uv run python backend/start_worker.py &
WORKER_PID=$!
uv run python -m app
kill $WORKER_PID 2>/dev/null || true
