param(
    [switch]$SkipSandboxCheck
)

Write-Host ""
# 0. Early Sandbox Detection
if ($env:USERNAME -eq 'WDAGUtilityAccount' -and -not $SkipSandboxCheck) {
    Write-Host "Windows Sandbox detected. Docker Desktop cannot be installed here due to DISM limitations (Error 12006)." -ForegroundColor Red
    Write-Host "To make it work, you must enable nested virtualization for the Sandbox." -ForegroundColor Yellow
    Write-Host "`nI have created a config file for you: FOAMFlask.wsb" -ForegroundColor Cyan
    Write-Host "1. Close this Sandbox session." -ForegroundColor Yellow
    Write-Host "2. Double-click 'FOAMFlask.wsb' on your HOST machine." -ForegroundColor Yellow
    Write-Host "3. This will launch a new Sandbox with virtualization enabled and auto-run the installer.`n" -ForegroundColor Yellow
    exit 1
}

if ($SkipSandboxCheck) {
    Write-Host "Running in Sandbox Mode (Bypass Enabled)" -ForegroundColor Cyan
}

Write-Host "--- FOAMFlask Installer ---" -ForegroundColor Cyan
Write-Host "GPLv3 License" -ForegroundColor Cyan
Write-Host ""

function Assert-WinGet {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "Winget is missing, but is required to install dependencies." -ForegroundColor Red
        $response = Read-Host "Would you like to attempt to install Winget now? (Recommended for Windows Sandbox) [Y/N]"
        if ($response -eq 'y' -or $response -eq 'Y') {
            Write-Host "Installing Microsoft.WinGet.Client module..." -ForegroundColor Yellow
            Install-Module -Name Microsoft.WinGet.Client -Force -AllowClobber -Scope CurrentUser
            Write-Host "Repairing WinGet Package Manager..." -ForegroundColor Yellow
            Repair-WinGetPackageManager
            # Check again
            if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
                # Force refresh path for current session
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
                if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
                    Write-Host "Failed to initialize winget automatically. Please install it manually." -ForegroundColor Red
                    exit 1
                }
            }
            Write-Host "Winget initialized successfully!" -ForegroundColor Green
        } else {
            Write-Host "Installation aborted. Please install dependencies manually." -ForegroundColor Red
            exit 1
        }
    }
}

# Checks the winget exit code and only warns on genuine errors.
# Winget returns non-zero codes for benign outcomes (already installed, newer version present, etc.)
function Assert-WinGetSuccess {
    param([string]$PackageName)
    $benignCodes = @(
        0,            # Success
        0x8A150039,   # APPINSTALLER_CLI_ERROR_PACKAGE_ALREADY_INSTALLED
        0x8A150077,   # No applicable upgrade found (newer version already installed)
        0x8A15007B,   # APPINSTALLER_CLI_ERROR_UPDATE_NOT_APPLICABLE (already up-to-date)
        3010          # ERROR_SUCCESS_REBOOT_REQUIRED (installed, reboot needed)
    )
    if ($LASTEXITCODE -notin $benignCodes) {
        Write-Host "Warning: winget returned unexpected code $LASTEXITCODE for '$PackageName'." -ForegroundColor Yellow
    }
}

# 1. Pre-seed known tool paths so they are available if already installed but not in PATH yet
# This is important for uv which installs to a user-local bin dir that may not be in the system PATH
$uvBinPath = "$env:USERPROFILE\.local\bin"
if (Test-Path $uvBinPath) {
    if ($env:Path -notlike "*$uvBinPath*") {
        $env:Path = "$uvBinPath;$env:Path"
        Write-Host "Pre-seeded uv path: $uvBinPath" -ForegroundColor Gray
    }
}

# 2. Check & Install System Tools (Python, Node, Docker)

# --- Python ---
# We specifically need 3.13 for VTK compatibility (3.14 is currently incompatible)
# Note: Windows has a fake "python" stub that opens the Microsoft Store - we must detect and skip it.
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
$isStub = $pythonCmd -and ($pythonCmd.Source -like "*WindowsApps*")
if ($pythonCmd -and -not $isStub) {
    $pyVersion = python --version 2>&1
    Write-Host "Python found: $pyVersion" -ForegroundColor Green
} elseif ($isStub) {
    Write-Host "Python not found (Windows Store stub detected - ignored)." -ForegroundColor Yellow
} else {
    Write-Host "Python not found." -ForegroundColor Yellow
}

# Always ensure Python 3.13 is installed (required for VTK compatibility)
Assert-WinGet
Write-Host "Ensuring Python 3.13 is installed (required for VTK compatibility)..." -ForegroundColor Yellow
winget install Python.Python.3.13 -e --source winget --accept-package-agreements --accept-source-agreements
Assert-WinGetSuccess "Python.Python.3.13"

# Refresh env vars for current session to find the newly installed Python
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# --- Node.js ---
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "Node.js found" -ForegroundColor Green
} else {
    Assert-WinGet
    Write-Host "Node.js not found. Installing..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
    Assert-WinGetSuccess "OpenJS.NodeJS.LTS"
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
    Assert-WinGet
    Write-Host "Docker not found. Installing Docker Desktop..." -ForegroundColor Yellow
    winget install Docker.DockerDesktop -e --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
         Write-Host "Failed to install Docker Desktop. Please install manually." -ForegroundColor Red
         Write-Host "Visit: https://www.docker.com/products/docker-desktop/"
         if ($SkipSandboxCheck) {
             Write-Host "Proceeding with 'Remote Docker' workaround for Sandbox Mode..." -ForegroundColor Yellow
             
             # Attempt to install only Docker CLI
             Write-Host "Installing Docker CLI..." -ForegroundColor Yellow
             winget install Docker.DockerCLI -e --source winget
             
             # Prompt for Remote Docker Host
             Write-Host "`nTo use FOAMFlask in the Sandbox, you must connect to a Remote Docker Engine." -ForegroundColor Cyan
             Write-Host "Please ensure your Host machine exposes the Docker daemon on a TCP socket (e.g., tcp://localhost:2375 without TLS)." -ForegroundColor Yellow
             
             # Try to guess the gateway IP (Host machine's IP from Sandbox perspective)
             $gateway = (Get-NetIPConfiguration | Select-Object -ExpandProperty IPv4DefaultGateway -ErrorAction SilentlyContinue).NextHop
             if (-not $gateway) {
                 # Fallback guess
                 $gateway = "172.16.0.1" 
             }
             $defaultHost = "tcp://$gateway:2375"
             
             $remoteHost = Read-Host "Enter Remote Docker Host [$defaultHost]"
             if (-not $remoteHost) { $remoteHost = $defaultHost }
             
             $env:DOCKER_HOST = $remoteHost
             $env:FOAMFLASK_SANDBOX_MODE = "1"
             Write-Host "DOCKER_HOST set to: $remoteHost" -ForegroundColor Green
         } else {
             exit 1
         }
    }
    Write-Host "Docker installed. You may need to restart your computer and start Docker Desktop." -ForegroundColor Yellow
}

# 3. Check & Install Rust (Cargo)
if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Write-Host "Rust (Cargo) found" -ForegroundColor Green
} else {
    Assert-WinGet
    Write-Host "Rust (Cargo) not found. Installing Rustup..." -ForegroundColor Yellow
    winget install Rustlang.Rustup -e --source winget --accept-package-agreements --accept-source-agreements
    Assert-WinGetSuccess "Rustlang.Rustup"
    # Refresh Path to find cargo
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 4. Check & Install pnpm
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Host "pnpm found" -ForegroundColor Green
} else {
    Write-Host "pnpm not found. Installing..." -ForegroundColor Yellow
    # Try enabling corepack first
    try {
        Write-Host "Attempting to enable corepack..." -ForegroundColor Yellow
        corepack enable
        # Refresh path in case corepack added shims
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        if (Get-Command pnpm -ErrorAction SilentlyContinue) {
            Write-Host "Enabled pnpm via corepack" -ForegroundColor Green
        } else {
             throw "pnpm still not found after corepack enable"
        }
    } catch {
        Write-Host "Corepack failed or pnpm not found. Falling back to npm install..." -ForegroundColor Yellow
        npm install -g pnpm
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
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
    # Add uv's user-local bin dir to the current session path
    # We do this explicitly (not via full system path refresh) to avoid clobbering the uv path
    $uvBinPath = "$env:USERPROFILE\.local\bin"
    if ($env:Path -notlike "*$uvBinPath*") {
        $env:Path = "$uvBinPath;$env:Path"
    }
    Write-Host "uv installed and added to session path." -ForegroundColor Green
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: uv still not found after installation. Please restart your shell and re-run the installer." -ForegroundColor Red
        exit 1
    }
}

# 5. Setup Python Environment
Write-Host "Setting up Python environment with uv (Targeting Python 3.13)..." -ForegroundColor Cyan

# Force usage of Python 3.13 to avoid issues with 3.14/VTK
uv venv --python 3.13 --clear

Write-Host "Created virtual environment with uv" -ForegroundColor Green

Write-Host "Installing Python dependencies with uv..."
uv sync --python 3.13 --link-mode copy

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

# 6. Build Frontend
Write-Host "Building Frontend..." -ForegroundColor Cyan
pnpm install
pnpm run build

# 7. Launch Application
Write-Host "Installation Complete!" -ForegroundColor Cyan
Write-Host "Starting FOAMFlask..." -ForegroundColor Green
Write-Host "Access the app at: http://localhost:5000"

uv run app.py
