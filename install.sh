#!/bin/bash
set -e

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e ""
echo -e "${CYAN}███████╗ ██████╗  █████╗ ███╗   ███╗███████╗██╗      █████╗ ███████╗██╗  ██╗"
echo -e "██╔════╝██╔═══██╗██╔══██╗████╗ ████║██╔════╝██║     ██╔══██╗██╔════╝██║ ██╔╝"
echo -e "█████╗  ██║   ██║███████║██╔████╔██║█████╗  ██║     ███████║███████╗█████╔╝ "
echo -e "██╔══╝  ██║   ██║██╔══██║██║╚██╔╝██║██╔══╝  ██║     ██╔══██║╚════██║██╔═██╗ "
echo -e "██║     ╚██████╔╝██║  ██║██║ ╚═╝ ██║██║     ███████╗██║  ██║███████║██║  ██╗"
echo -e "╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝"
echo -e "                                                                            ${NC}"
echo -e "${CYAN}GPLv3 License${NC}"
echo -e ""

# 1. OS Detection
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

# Function to check command existence
check_cmd() {
    command -v "$1" >/dev/null 2>&1
}

# 2. Check & Install System Tools (Python, Node, Docker)

# --- Python ---
if check_cmd python3; then
    echo -e "${GREEN}✓ Python 3 found${NC}"
else
    echo -e "${YELLOW}Python 3 not found. Installing...${NC}"
    if [ "$MACHINE" == "Linux" ]; then
        if check_cmd apt-get; then
            sudo apt-get update && sudo apt-get install -y python3 python3-venv
        elif check_cmd dnf; then
            sudo dnf install -y python3
        else
            echo -e "${RED}Failed to install Python. Please install manually.${NC}"
            exit 1
        fi
    elif [ "$MACHINE" == "Mac" ]; then
        if check_cmd brew; then
            brew install python
        else
            echo -e "${RED}Homebrew not found. Please install Python manually and add it to your PATH.${NC}"
            exit 1
        fi
    fi
fi

# --- Node.js ---
if check_cmd node; then
    echo -e "${GREEN}✓ Node.js found${NC}"
else
    echo -e "${YELLOW}Node.js not found. Installing...${NC}"
    if [ "$MACHINE" == "Linux" ]; then
        if check_cmd apt-get; then
             sudo apt-get install -y nodejs npm
        else
             echo -e "${RED}Failed to install Node.js. Please install manually.${NC}"
             exit 1
        fi
    elif [ "$MACHINE" == "Mac" ]; then
        brew install node
    fi
fi

# --- Docker ---
if check_cmd docker; then
    echo -e "${GREEN}✓ Docker found${NC}"
else
    echo -e "${YELLOW}Docker not found. Installing Docker Desktop...${NC}"
    echo -e "${RED}Please install Docker manually (Docker Desktop recommended).${NC}"
    echo -e "Visit: https://www.docker.com/products/docker-desktop/"
    exit 1
fi

# 3. Check & Install pnpm
if check_cmd pnpm; then
    echo -e "${GREEN}✓ pnpm found${NC}"
else
    echo -e "${YELLOW}pnpm not found. Installing...${NC}"
    if corepack enable 2>/dev/null; then
         echo -e "${GREEN}Enabled pnpm via corepack${NC}"
    else
         npm install -g pnpm || sudo npm install -g pnpm
    fi
fi

# --- uv ---
if check_cmd uv; then
    echo -e "${GREEN}✓ uv found${NC}"
else
    echo -e "${YELLOW}uv not found. Installing...${NC}"
    curl -LsSf https://astral.sh/uv/install.sh | sh
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install uv. Please install manually.${NC}"
        exit 1
    fi
    # Update PATH for current session
    export PATH="$HOME/.local/bin:$PATH"
fi

# 4. Setup Python Environment
echo -e "${CYAN}Setting up Python environment with uv...${NC}"
uv venv --clear
echo -e "${GREEN}Created virtual environment with uv${NC}"

echo "Installing Python dependencies with uv..."
uv sync --link-mode copy

# Install Rust Accelerator
if [ -d "backend/accelerator" ]; then
    echo -e "${CYAN}Building Rust Accelerator...${NC}"
    if check_cmd cargo; then
        uv add ./backend/accelerator
        echo -e "${GREEN}✓ Rust Accelerator installed${NC}"
    else
        echo -e "${YELLOW}Warning: Cargo not found. Rust accelerator will be skipped.${NC}"
    fi
fi

# 5. Build Frontend
echo -e "${CYAN}Building Frontend...${NC}"
pnpm install
pnpm run build

# 6. Launch Application
echo -e "${CYAN}Installation Complete!${NC}"
echo -e "${GREEN}Starting FOAMFlask...${NC}"
echo -e "Access the app at: http://localhost:5000"

uv run app.py
