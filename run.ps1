# FOAMFlask Runner Script for Windows
# This script runs the FOAMFlask application using the uv-managed environment.

# Ensure uv is installed and in the PATH
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    $uvPath = "$env:USERPROFILE\.local\bin\uv.exe"
    if (Test-Path $uvPath) {
        $env:Path = "$env:USERPROFILE\.local\bin;" + $env:Path
    } else {
        Write-Host "Error: 'uv' not found. Please run .\install.ps1 first to set up the environment." -ForegroundColor Red
        exit 1
    }
}

# --- Docker Auto-Start ---
# Check if Docker is running
if (-not (docker version 2>&1 | Select-String "Server:")) {
    Write-Host "Docker is not running. Attempting to start Docker Desktop..." -ForegroundColor Yellow
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
        Write-Host "Docker Desktop launch initiated. Waiting for startup..." -ForegroundColor Cyan
        # Give it a few seconds to at least start the process before moving on
        Start-Sleep -Seconds 20
    } else {
        Write-Host "Warning: Docker Desktop executable not found at $dockerExe. Please start it manually." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "--- FOAMFlask Runner ---" -ForegroundColor Cyan
Write-Host "Starting FOAMFlask..." -ForegroundColor Green
Write-Host "Access the application at: http://localhost:5000"
Write-Host "Logs are being written to: app.log"
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

# Set Docker context to default to ensure we look for the correct named pipe
# This fixes "The system cannot find the file specified" errors if the context was swapped
docker context use default 2>$null | Out-Null

# Run the application using python -m app
# We use --no-python-downloads to ensure we use the local environment
uv run python -m app
