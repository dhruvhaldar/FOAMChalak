#!/bin/bash
# FOAMFlask Installer for Linux/macOS
# GPLv3 License
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
echo -e "${CYAN}--- FOAMFlask Installer ---${NC}"
echo -e "${CYAN}GPLv3 License${NC}"
echo -e ""

# Function to check command existence
check_cmd() {
    command -v "$1" >/dev/null 2>&1
}

# --- Pre-seed paths ---
# Pre-seed uv and cargo paths so they are immediately available if already installed
if [ -d "$HOME/.local/bin" ]; then
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        export PATH="$HOME/.local/bin:$PATH"
        echo -e "Pre-seeded path: $HOME/.local/bin"
    fi
fi
if [ -d "$HOME/.cargo/bin" ]; then
    if [[ ":$PATH:" != *":$HOME/.cargo/bin:"* ]]; then
        export PATH="$HOME/.cargo/bin:$PATH"
        echo -e "Pre-seeded path: $HOME/.cargo/bin"
    fi
fi

# 1. OS Detection
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

if [ "$MACHINE" != "Linux" ] && [ "$MACHINE" != "Mac" ]; then
    echo -e "${RED}Unsupported Operating System: ${MACHINE}. Exiting.${NC}"
    exit 1
fi

# 2. Virtualization Check (Diagnostic only, non-blocking on Linux)
echo -e "${CYAN}Checking system virtualization support...${NC}"
if [ "$MACHINE" == "Linux" ]; then
    if grep -E -q "vmx|svm" /proc/cpuinfo; then
        echo -e "${GREEN}✓ Hardware Virtualization (VT-x/AMD-V) is supported by CPU.${NC}"
        if [ -e /dev/kvm ]; then
            echo -e "${GREEN}✓ KVM virtualization is enabled and accessible.${NC}"
        else
            echo -e "${YELLOW}Warning: KVM (/dev/kvm) is not present. If you are running in a VM, enable nested virtualization in your hypervisor.${NC}"
        fi
    else
        echo -e "${YELLOW}Warning: Hardware Virtualization (VT-x/AMD-V) is not detected in /proc/cpuinfo.${NC}"
        echo -e "If you are running in a VM, you might need to enable nested virtualization in your hypervisor.${NC}"
    fi
elif [ "$MACHINE" == "Mac" ]; then
    if sysctl -a | grep -q "machdep.cpu.features.*VMX"; then
        echo -e "${GREEN}✓ Hardware Virtualization (VMX) is supported by CPU.${NC}"
    else
        echo -e "${YELLOW}Warning: Hardware Virtualization (VMX) is not detected.${NC}"
    fi
fi
echo -e ""

# 3. Detect System Package Manager (Linux only)
PM="unknown"
if [ "$MACHINE" == "Linux" ]; then
    if check_cmd pacman; then
        PM="pacman"
    elif check_cmd apt-get; then
        PM="apt"
    elif check_cmd dnf; then
        PM="dnf"
    elif check_cmd yum; then
        PM="yum"
    elif check_cmd zypper; then
        PM="zypper"
    fi
fi

# 4. Install Missing System Dependencies (Git, Python3, Node, Docker)
PACKAGES_TO_INSTALL=()

if ! check_cmd git; then
    PACKAGES_TO_INSTALL+=("git")
fi

if ! check_cmd python3; then
    PACKAGES_TO_INSTALL+=("python")
fi

if ! check_cmd node; then
    PACKAGES_TO_INSTALL+=("node")
fi

if ! check_cmd docker; then
    PACKAGES_TO_INSTALL+=("docker")
fi

if [ ${#PACKAGES_TO_INSTALL[@]} -ne 0 ]; then
    echo -e "${YELLOW}The following system packages are missing and need to be installed: ${PACKAGES_TO_INSTALL[*]}${NC}"
    echo -e "${YELLOW}This requires administrative privileges (sudo).${NC}"
    
    if [ "$MACHINE" == "Linux" ]; then
        case "$PM" in
            pacman)
                ARCH_PKGS=()
                for pkg in "${PACKAGES_TO_INSTALL[@]}"; do
                    case "$pkg" in
                        python) ARCH_PKGS+=("python") ;;
                        node) ARCH_PKGS+=("nodejs" "npm") ;;
                        docker) ARCH_PKGS+=("docker") ;;
                        git) ARCH_PKGS+=("git") ;;
                    esac
                done
                echo -e "${CYAN}Running: sudo pacman -S --needed --noconfirm ${ARCH_PKGS[*]}${NC}"
                sudo pacman -S --needed --noconfirm "${ARCH_PKGS[@]}"
                ;;
            apt)
                APT_PKGS=()
                for pkg in "${PACKAGES_TO_INSTALL[@]}"; do
                    case "$pkg" in
                        python) APT_PKGS+=("python3" "python3-venv" "python3-pip") ;;
                        node) APT_PKGS+=("nodejs" "npm") ;;
                        docker) APT_PKGS+=("docker.io") ;;
                        git) APT_PKGS+=("git") ;;
                    esac
                done
                echo -e "${CYAN}Running: sudo apt-get update && sudo apt-get install -y ${APT_PKGS[*]}${NC}"
                sudo apt-get update && sudo apt-get install -y "${APT_PKGS[@]}"
                ;;
            dnf|yum)
                FEDORA_PKGS=()
                for pkg in "${PACKAGES_TO_INSTALL[@]}"; do
                    case "$pkg" in
                        python) FEDORA_PKGS+=("python3" "python3-pip") ;;
                        node) FEDORA_PKGS+=("nodejs" "npm") ;;
                        docker) FEDORA_PKGS+=("docker") ;;
                        git) FEDORA_PKGS+=("git") ;;
                    esac
                done
                echo -e "${CYAN}Running: sudo $PM install -y ${FEDORA_PKGS[*]}${NC}"
                sudo $PM install -y "${FEDORA_PKGS[@]}"
                ;;
            zypper)
                SUSE_PKGS=()
                for pkg in "${PACKAGES_TO_INSTALL[@]}"; do
                    case "$pkg" in
                        python) SUSE_PKGS+=("python3" "python3-pip") ;;
                        node) SUSE_PKGS+=("nodejs" "npm") ;;
                        docker) SUSE_PKGS+=("docker") ;;
                        git) SUSE_PKGS+=("git") ;;
                    esac
                done
                echo -e "${CYAN}Running: sudo zypper install -y ${SUSE_PKGS[*]}${NC}"
                sudo zypper install -y "${SUSE_PKGS[@]}"
                ;;
            *)
                echo -e "${RED}Unknown package manager. Please install the following packages manually: ${PACKAGES_TO_INSTALL[*]}${NC}"
                exit 1
                ;;
        esac
    elif [ "$MACHINE" == "Mac" ]; then
        if check_cmd brew; then
            MAC_PKGS=()
            for pkg in "${PACKAGES_TO_INSTALL[@]}"; do
                case "$pkg" in
                    python) MAC_PKGS+=("python") ;;
                    node) MAC_PKGS+=("node") ;;
                    docker) MAC_PKGS+=("docker") ;;
                    git) MAC_PKGS+=("git") ;;
                esac
            done
            echo -e "${CYAN}Running: brew install ${MAC_PKGS[*]}${NC}"
            brew install "${MAC_PKGS[@]}"
        else
            echo -e "${RED}Homebrew not found. Please install Homebrew or install the following packages manually: ${PACKAGES_TO_INSTALL[*]}${NC}"
            exit 1
        fi
    fi
else
    echo -e "${GREEN}✓ All base system dependencies (git, python3, node, docker) are already installed.${NC}"
fi
echo -e ""

# 5. Docker Service & Permission Check
echo -e "${CYAN}Verifying Docker accessibility...${NC}"
if ! docker version >/dev/null 2>&1; then
    echo -e "${YELLOW}Docker is not running or the current user does not have permission to access the Docker daemon.${NC}"
    
    # Try to start Docker on Linux
    if [ "$MACHINE" == "Linux" ] && check_cmd systemctl; then
        if ! systemctl is-active --quiet docker; then
            echo -e "${CYAN}Starting and enabling Docker service...${NC}"
            sudo systemctl enable --now docker
            sleep 3
        fi
    fi
    
    # Re-check
    if ! docker version >/dev/null 2>&1; then
        echo -e "${YELLOW}User does not have access to Docker daemon without sudo.${NC}"
        echo -e "To access Docker without sudo, you may need to add your user to the docker group:"
        echo -e "  ${CYAN}sudo usermod -aG docker \$USER${NC}"
        echo -e "Then run 'newgrp docker' or log out and back in."
        
        # Interactive prompt to add user to docker group
        if [ "$MACHINE" == "Linux" ]; then
            read -p "Would you like to add your user to the docker group now? [Y/n]: " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ || -z $REPLY ]]; then
                sudo usermod -aG docker "$USER"
                echo -e "${GREEN}Successfully added user to the docker group. Please run 'newgrp docker' or restart your session after installation.${NC}"
            fi
        fi
    fi
else
    echo -e "${GREEN}✓ Docker daemon is active and accessible.${NC}"
fi
echo -e ""

# 6. Check & Install Rust (Cargo)
if check_cmd cargo; then
    echo -e "${GREEN}✓ Rust (Cargo) found${NC}"
else
    echo -e "${YELLOW}Rust (Cargo) not found. Installing Rustup...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
    
    # Export and source cargo environment immediately for this session
    export PATH="$HOME/.cargo/bin:$PATH"
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
    
    if ! check_cmd cargo; then
        echo -e "${RED}Rust/Cargo installation failed or not found in PATH.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Rust (Cargo) installed successfully!${NC}"
fi
echo -e ""

# 7. Check & Install pnpm
if check_cmd pnpm; then
    echo -e "${GREEN}✓ pnpm found${NC}"
else
    echo -e "${YELLOW}pnpm not found. Installing...${NC}"
    # Try corepack first
    if check_cmd corepack; then
        echo -e "Attempting to enable corepack..."
        # Corepack might need sudo depending on node installation directory
        sudo corepack enable || corepack enable --install-directory "$HOME/.local/bin" || true
        corepack prepare pnpm@latest --activate || true
    fi
    
    # Fallback to npm if still missing
    if ! check_cmd pnpm; then
        if check_cmd npm; then
            echo -e "Corepack failed or not found. Installing pnpm via npm..."
            npm install -g pnpm || npm install -g pnpm --prefix "$HOME/.local" || true
            export PATH="$HOME/.local/bin:$PATH"
        fi
    fi
    
    # Final check
    if ! check_cmd pnpm; then
        echo -e "${RED}pnpm could not be installed automatically. Please install it manually: npm install -g pnpm${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ pnpm installed successfully!${NC}"
fi
echo -e ""

# 8. Check & Install uv
if check_cmd uv; then
    echo -e "${GREEN}✓ uv found${NC}"
else
    echo -e "${YELLOW}uv not found. Installing...${NC}"
    curl -LsSf https://astral.sh/uv/install.sh | sh
    
    # Update PATH for the current session
    export PATH="$HOME/.local/bin:$PATH"
    
    if ! check_cmd uv; then
        echo -e "${RED}uv installation failed or not found in PATH.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ uv installed successfully!${NC}"
fi
echo -e ""

# 9. Setup Python Environment
echo -e "${CYAN}Setting up Python environment with uv (Targeting Python 3.13)...${NC}"

# Force usage of Python 3.13 to avoid issues with 3.14/VTK compatibility
# uv will download its own standalone python-3.13 binary if not present
uv venv --python 3.13 --clear
echo -e "${GREEN}✓ Created virtual environment with uv${NC}"

echo -e "Installing Python dependencies with uv..."
uv sync --python 3.13 --link-mode copy
echo -e ""

# Build Rust Accelerator
if [ -d "backend/accelerator" ]; then
    echo -e "${CYAN}Building Rust Accelerator...${NC}"
    if check_cmd cargo; then
        if uv add ./backend/accelerator; then
            echo -e "${GREEN}✓ Rust Accelerator installed${NC}"
        else
            echo -e "${RED}Failed to build Rust Accelerator. Ensure compiler tools are installed.${NC}"
        fi
    else
        echo -e "${YELLOW}Warning: Cargo not found. Rust accelerator will be skipped.${NC}"
    fi
fi
echo -e ""

# 10. Build Frontend
echo -e "${CYAN}Building Frontend...${NC}"
pnpm install
pnpm run build
echo -e ""

# 11. Final Verification (Dry Run)
echo -e "${CYAN}Installation Complete! Performing final environment verification...${NC}"
success=true

# Check Python Environment
if [ ! -f ".venv/bin/python" ]; then
    echo -e "${RED}[FAIL] Python virtual environment missing.${NC}"
    success=false
else
    echo -e "${GREEN}[OK] Python virtual environment verified.${NC}"
fi

# Check Frontend Assets
if [ ! -f "static/js/foamflask_frontend.js" ]; then
    echo -e "${RED}[FAIL] Frontend build artifacts missing.${NC}"
    success=false
else
    echo -e "${GREEN}[OK] Frontend build artifacts verified.${NC}"
fi

# Check Docker (Non-blocking check)
if docker version >/dev/null 2>&1; then
    echo -e "${GREEN}[OK] Docker engine is ready.${NC}"
else
    echo -e "${YELLOW}[WARNING] Docker engine is not yet responsive. Ensure Docker service is running.${NC}"
fi

if [ "$success" = true ]; then
    echo -e "\n${GREEN}Setup verified successfully!${NC}"
    echo -e "--------------------------------------------------"
    echo -e "To start the application, run:"
    echo -e "  ${CYAN}./run.sh${NC}"
    echo -e "--------------------------------------------------"
else
    echo -e "\n${RED}Setup failed verification. Please check the errors above.${NC}"
    exit 1
fi
