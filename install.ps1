param(
    [switch]$SkipSandboxCheck
)

# --- Elevation Check ---
# This script must run as Administrator to install system-level dependencies (Docker, Node, MSVC)
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script needs to be run as Administrator to install system dependencies." -ForegroundColor Yellow
    Write-Host "Attempting to restart with elevated privileges..." -ForegroundColor Cyan
    # Use -NoExit so the window stays open for debugging if an error occurs
    Start-Process powershell -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

# --- Directory Context ---
# Ensure we are running from the script's directory (important after elevation which defaults to System32)
Set-Location $PSScriptRoot

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

# --- Virtualization Check ---
Write-Host "Checking system virtualization support..." -ForegroundColor Cyan
try {
    $compSystem = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1
    $virtEnabled = (Get-CimInstance Win32_Processor | Select-Object -First 1).VirtualizationFirmwareEnabled
    
    if ($compSystem.HypervisorPresent) {
        Write-Host "Virtualization is active (Hypervisor detected)." -ForegroundColor Green
    } elseif ($null -ne $virtEnabled -and -not $virtEnabled) {
        Write-Host "CRITICAL: Hardware Virtualization (VT-x/AMD-V) is DISABLED in your BIOS/UEFI." -ForegroundColor Red
        Write-Host "Docker Desktop cannot run without this enabled at the hardware level." -ForegroundColor Yellow
        Write-Host "Action Needed: Restart your computer, enter BIOS/UEFI settings, and enable 'Virtualization Technology'." -ForegroundColor White
    } else {
        Write-Host "Hardware Virtualization is likely enabled." -ForegroundColor Green
    }
} catch {
    Write-Host "Could not verify virtualization state via software. Please ensure VT-x/AMD-V is enabled in BIOS." -ForegroundColor Gray
}

# Check Windows Features (WSL2 / Virtual Machine Platform)
try {
    $wslFeature = Get-WindowsOptionalFeature -Online -FeatureName "Microsoft-Windows-Subsystem-Linux" -ErrorAction SilentlyContinue
    $vmpFeature = Get-WindowsOptionalFeature -Online -FeatureName "VirtualMachinePlatform" -ErrorAction SilentlyContinue
    
    $missing = @()
    if ($wslFeature -and $wslFeature.State -ne "Enabled") { $missing += "Microsoft-Windows-Subsystem-Linux" }
    if ($vmpFeature -and $vmpFeature.State -ne "Enabled") { $missing += "VirtualMachinePlatform" }

    if ($missing.Count -gt 0) {
        Write-Host "Required Windows Features (WSL2) are missing." -ForegroundColor Yellow
        $response = Read-Host "Would you like to automatically install WSL2 now? (Requires REBOOT) [Y/N]"
        if ($response -eq 'y' -or $response -eq 'Y') {
            Write-Host "Installing WSL2 components..." -ForegroundColor Yellow
            # Modern way to install WSL and features
            wsl --install --no-distribution
            
            Write-Host "`nWSL2 installation initiated!" -ForegroundColor Green
            Write-Host "--- IMPORTANT ---" -ForegroundColor Red
            Write-Host "You MUST RESTART your computer now." -ForegroundColor Red
            Write-Host "After restarting, run this script again to finish the FOAMFlask setup." -ForegroundColor Red
            Read-Host "Press ENTER to exit and then restart your PC manually"
            Read-Host "After restarting, you can manually run Docker Desktop to verify that it launches successfully."
            exit
        }
    } else {
        Write-Host "Windows Virtualization features are enabled." -ForegroundColor Green
    }
} catch {
    Write-Host "Could not verify Windows Features. If Docker fails, ensure 'WSL2' and 'Virtual Machine Platform' are enabled in 'Turn Windows features on or off'." -ForegroundColor Gray
}
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
    if ($LASTEXITCODE -eq -1978335189) {
        Write-Host "Error: winget could not reach its package sources (Network/CDN issue)." -ForegroundColor Red
        Write-Host "Try running 'winget source update' in a separate terminal, then restart this installer." -ForegroundColor Yellow
    }
    elseif ($LASTEXITCODE -notin $benignCodes) {
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
    Write-Host "(Docker Desktop is required on Windows to provide the Linux kernel environment and file-sharing integration needed to run OpenFOAM containers.)" -ForegroundColor Gray
    
    # Fix for common "C:\ProgramData\DockerDesktop must be owned by an elevated account" error
    $programDataDocker = "C:\ProgramData\DockerDesktop"
    if (Test-Path $programDataDocker) {
        Write-Host "Cleaning up existing Docker metadata to prevent ownership errors..." -ForegroundColor Gray
        Remove-Item -Path $programDataDocker -Recurse -Force -ErrorAction SilentlyContinue
    }

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
    Write-Host "Docker installed. Starting Docker Desktop in the background..." -ForegroundColor Yellow
    # Try to find Docker Desktop installation path from Registry
    $dockerReg = Get-ItemProperty "HKLM:\SOFTWARE\Docker Inc.\Docker\1.0" -ErrorAction SilentlyContinue
    if ($dockerReg -and $dockerReg.InstallPath) {
        $dockerExe = Join-Path $dockerReg.InstallPath "Docker Desktop.exe"
    } else {
        # Fallback to default
        $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    }
    
    if (Test-Path $dockerExe) {
        Start-Process -FilePath $dockerExe
        
        # Wait for Docker to actually be responsive
        Write-Host "Waiting for Docker Engine to be ready (this may take a minute)..." -ForegroundColor Yellow
        $dockerReady = $false
        for ($i = 0; $i -lt 20; $i++) {
            if (docker version 2>&1 | Select-String "Server:") {
                $dockerReady = $true
                break
            }
            Write-Host "." -NoNewline -ForegroundColor Gray
            Start-Sleep -Seconds 5
        }
        if ($dockerReady) {
            Write-Host "`nDocker Engine is ready!" -ForegroundColor Green
        } else {
            Write-Host "`nDocker Engine is still starting. You may need to wait a moment before running FOAMFlask." -ForegroundColor Yellow
        }
    } else {
        Write-Host "Could not find Docker Desktop executable. Please start it manually." -ForegroundColor Red
    }
}
# --- Visual Studio Build Tools (Required for Rust) ---
$vswherePath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasMSVC = $false
$vsInstallPath = ""

if (Test-Path $vswherePath) {
    $vsInstallPath = &$vswherePath -latest -products * -property installationPath
    if ($vsInstallPath) {
        # Check if the specific C++ tools component is installed
        $compCheck = &$vswherePath -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($compCheck) { $hasMSVC = $true }
    }
}

if (-not $hasMSVC) {
    if ($vsInstallPath) {
        Write-Host "Visual Studio found at $vsInstallPath, but C++ Build Tools component is MISSING." -ForegroundColor Yellow
    } else {
        Write-Host "C++ Build Tools not found. These are REQUIRED to build the Rust accelerator." -ForegroundColor Yellow
    }
    
    $response = Read-Host "Would you like to install/fix Visual Studio Build Tools 2022? (Large download ~2GB) [Y/N]"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Assert-WinGet
        
        # Check if winget thinks it's already there (even if vswhere is confused)
        $wingetCheck = winget list --id Microsoft.VisualStudio.2022.BuildTools -e --source winget 2>&1
        $wingetInstalled = $wingetCheck -like "*Microsoft.VisualStudio.2022.BuildTools*"

        if ($vsInstallPath -or $wingetInstalled) {
            Write-Host "An existing installation was detected." -ForegroundColor Cyan
            $cleanReinstall = Read-Host "Perform a CLEAN REINSTALL? (Recommended if build is failing) [Y/N]"
            if ($cleanReinstall -eq 'y' -or $cleanReinstall -eq 'Y') {
                Write-Host "Uninstalling existing Build Tools (All Versions)..." -ForegroundColor Yellow
                winget uninstall --id Microsoft.VisualStudio.2022.BuildTools --accept-source-agreements --all-versions
                Write-Host "Uninstallation initiated. If a separate window opened, please wait for it to finish." -ForegroundColor Cyan
                Read-Host "Press ENTER once the uninstallation is complete to continue"
                Write-Host "Waiting for final cleanup..." -ForegroundColor Gray
                Start-Sleep -Seconds 5
                $vsInstallPath = ""
                $wingetInstalled = $false
            }
        }

        if ($vsInstallPath -and (Test-Path "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\setup.exe")) {
            Write-Host "Adding C++ workload to existing installation..." -ForegroundColor Yellow
            $vsInstaller = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\setup.exe"
            Start-Process -FilePath $vsInstaller -ArgumentList "modify --installPath `"$vsInstallPath`" --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --norestart" -Wait
        } else {
            Write-Host "Installing Visual Studio Build Tools with C++ workload..." -ForegroundColor Yellow
            winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" --accept-package-agreements --accept-source-agreements
        }
        Write-Host "Build Tools installation/modification finished. Refreshing state..." -ForegroundColor Cyan
        
        # Re-check paths after installation
        if (Test-Path $vswherePath) {
            $vsInstallPath = &$vswherePath -latest -products * -property installationPath
            $compCheck = &$vswherePath -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
            if ($compCheck) { $hasMSVC = $true }
        }
    } else {
         Write-Host "Warning: Without C++ Build Tools, the Rust accelerator will fail to build." -ForegroundColor Red
    }
} else {
    Write-Host "C++ Build Tools found" -ForegroundColor Green
}

# --- MSVC Linker Auto-Discovery ---
# Re-run discovery to ensure we have the linker in the session PATH
if (-not (Get-Command link -ErrorAction SilentlyContinue)) {
    if (Test-Path $vswherePath) {
        $vsInstallPath = &$vswherePath -latest -products * -property installationPath
        if ($vsInstallPath) {
            $msvcBase = Join-Path $vsInstallPath "VC\Tools\MSVC"
            if (Test-Path $msvcBase) {
                $latestMsvc = Get-ChildItem $msvcBase | Sort-Object Name -Descending | Select-Object -First 1
                if ($latestMsvc) {
                    $linkerPath = Join-Path $latestMsvc.FullName "bin\Hostx64\x64"
                    if (-not (Test-Path $linkerPath)) {
                        $linkerPath = Join-Path $latestMsvc.FullName "bin\Hostx64\x86"
                    }
                    if (Test-Path (Join-Path $linkerPath "link.exe")) {
                        $env:Path = "$linkerPath;$env:Path"
                        Write-Host "Auto-discovered MSVC Linker: $linkerPath" -ForegroundColor Gray
                    } else {
                        Write-Host "Found MSVC directory but could not locate link.exe in $linkerPath" -ForegroundColor Yellow
                    }
                }
            } else {
                Write-Host "Found Visual Studio but 'VC\Tools\MSVC' directory is missing. C++ components may still be installing in the background." -ForegroundColor Yellow
            }
        }
    }
}

# 3. Check & Install Rust (Cargo)
if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Write-Host "Rust (Cargo) found" -ForegroundColor Green
} else {
    Assert-WinGet
    Write-Host "Rust (Cargo) not found. Attempting to install Rustup..." -ForegroundColor Yellow
    
    # Try winget first (sometimes fails due to source naming)
    winget install Rustlang.Rustup -e --source winget --accept-package-agreements --accept-source-agreements
    
    # Refresh Path to check if winget succeeded
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Write-Host "Winget failed or cargo not in path. Falling back to direct download..." -ForegroundColor Yellow
        $rustupUrl = "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe"
        $rustupExe = "$env:TEMP\rustup-init.exe"
        Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupExe
        & $rustupExe -y --default-host x86_64-pc-windows-msvc --default-toolchain stable --profile minimal
        Remove-Item $rustupExe
        
        # Refresh Path again
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        $cargoBin = "$env:USERPROFILE\.cargo\bin"
        if ($env:Path -notlike "*$cargoBin*") { $env:Path = "$cargoBin;$env:Path" }
    }
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
        try {
            uv add ./backend/accelerator
            Write-Host "Rust Accelerator installed" -ForegroundColor Green
        } catch {
            Write-Host "Failed to build Rust Accelerator. Error: $_" -ForegroundColor Red
            Write-Host "This usually means C++ Build Tools (link.exe) are missing or outdated." -ForegroundColor Yellow
            Write-Host "Try running 'winget install --id Microsoft.VisualStudio.2022.BuildTools --override \"--passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended\"' manually." -ForegroundColor Gray
        }
    } else {
        Write-Host "Warning: Cargo not found. Rust accelerator will be skipped." -ForegroundColor Yellow
    }
}

# 6. Build Frontend
Write-Host "Building Frontend..." -ForegroundColor Cyan
pnpm install
pnpm run build

# 7. Final Verification (Dry Run)
Write-Host "Installation Complete!" -ForegroundColor Cyan
Write-Host "Performing final environment verification..." -ForegroundColor Cyan

$success = $true

# Check Python Environment
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "[FAIL] Python virtual environment missing." -ForegroundColor Red
    $success = $false
} else {
    Write-Host "[OK] Python virtual environment verified." -ForegroundColor Green
}

# Check Frontend Assets
if (-not (Test-Path "static/js/foamflask_frontend.js")) {
    Write-Host "[FAIL] Frontend build artifacts missing." -ForegroundColor Red
    $success = $false
} else {
    Write-Host "[OK] Frontend build artifacts verified." -ForegroundColor Green
}

# Check Docker (Non-blocking check)
if (docker version 2>&1 | Select-String "Server:") {
    Write-Host "[OK] Docker engine is ready." -ForegroundColor Green
} else {
    Write-Host "[WARNING] Docker engine is not yet responsive. Ensure Docker Desktop is running." -ForegroundColor Yellow
}

if ($success) {
    Write-Host "`nSetup verified successfully!" -ForegroundColor Green
    Write-Host "--------------------------------------------------" -ForegroundColor White
    Write-Host "To start the application, run:" -ForegroundColor White
    Write-Host ".\run.ps1" -ForegroundColor Cyan
    Write-Host "--------------------------------------------------" -ForegroundColor White
} else {
    Write-Host "`nSetup failed verification. Please check the errors above." -ForegroundColor Red
}
