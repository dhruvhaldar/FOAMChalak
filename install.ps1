Write-Host ""
Write-Host "--- FOAMFlask Installer ---" -ForegroundColor Cyan
Write-Host "GPLv3 License" -ForegroundColor Cyan
Write-Host ""

# 1. Check for Winget
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "Error: winget not found. Please ensure App Installer is installed from the Microsoft Store." -ForegroundColor Red
    exit 1
}
Write-Host "Winget found" -ForegroundColor Green

# 2. Check & Install System Tools (Python, Node, Docker)

# --- Python ---
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "Python found" -ForegroundColor Green
} else {
    Write-Host "Python not found. Installing..." -ForegroundColor Yellow
    winget install Python.Python.3.13 -e --source winget
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install Python. Please install manually." -ForegroundColor Red
        exit 1
    }
    # Refresh env vars for current session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# --- Node.js ---
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "Node.js found" -ForegroundColor Green
} else {
    Write-Host "Node.js not found. Installing..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS -e --source winget
    if ($LASTEXITCODE -ne 0) {
         Write-Host "Failed to install Node.js. Please install manually." -ForegroundColor Red
         exit 1
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# --- Docker ---
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "Docker found" -ForegroundColor Green
} else {
    Write-Host "Docker not found. Installing Docker Desktop..." -ForegroundColor Yellow
    winget install Docker.DockerDesktop -e --source winget
    if ($LASTEXITCODE -ne 0) {
         Write-Host "Failed to install Docker Desktop. Please install manually." -ForegroundColor Red
         Write-Host "Visit: https://www.docker.com/products/docker-desktop/"
         exit 1
    }
    Write-Host "Docker installed. You may need to restart your computer and start Docker Desktop." -ForegroundColor Yellow
}

# 3. Check & Install pnpm
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Host "pnpm found" -ForegroundColor Green
} else {
    Write-Host "pnpm not found. Installing..." -ForegroundColor Yellow
    # Try enabling corepack first
    try {
        corepack enable
        Write-Host "Enabled pnpm via corepack" -ForegroundColor Green
    } catch {
        # Fallback to npm install
        npm install -g pnpm
    }
}

# --- uv ---
if (Get-Command uv -ErrorAction SilentlyContinue) {
    Write-Host "uv found" -ForegroundColor Green
} else {
    Write-Host "uv not found. Installing..." -ForegroundColor Yellow
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install uv. Please install manually." -ForegroundColor Red
        exit 1
    }
    # Update Path for current session
    $env:Path = "$env:USERPROFILE\.local\bin;" + $env:Path
}

# 4. Setup Python Environment
Write-Host "Setting up Python environment with uv..." -ForegroundColor Cyan

uv venv --clear

Write-Host "Created virtual environment with uv" -ForegroundColor Green

Write-Host "Installing Python dependencies with uv..."
uv sync --link-mode copy

# Install Rust Accelerator
if (Test-Path "backend/accelerator") {
    Write-Host "Building Rust Accelerator..." -ForegroundColor Cyan
    if (Get-Command cargo -ErrorAction SilentlyContinue) {
        uv add ./backend/accelerator
        Write-Host "Rust Accelerator installed" -ForegroundColor Green
    } else {
        Write-Host "Warning: Cargo not found. Rust accelerator will be skipped." -ForegroundColor Yellow
    }
}

# 5. Build Frontend
Write-Host "Building Frontend..." -ForegroundColor Cyan
pnpm install
pnpm run build

# 6. Launch Application
Write-Host "Installation Complete!" -ForegroundColor Cyan
Write-Host "Starting FOAMFlask..." -ForegroundColor Green
Write-Host "Access the app at: http://localhost:5000"

uv run app.py
