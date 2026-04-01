# FOAMFlask Runner Script for Windows
# This script runs the FOAMFlask application using the uv-managed environment.

# Ensure uv is installed and in the PATH
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    # Check if it's in the default local bin folder (installed by install.ps1)
    $uvPath = "$env:USERPROFILE\.local\bin\uv.exe"
    if (Test-Path $uvPath) {
        $env:Path = "$env:USERPROFILE\.local\bin;" + $env:Path
    } else {
        Write-Host "Error: 'uv' not found. Please run .\install.ps1 first to set up the environment." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "--- FOAMFlask Runner ---" -ForegroundColor Cyan
Write-Host "Starting FOAMFlask..." -ForegroundColor Green
Write-Host "Access the application at: http://localhost:5000"
Write-Host "Logs are being written to: app.log"
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

# Run the application using python -m app as per project architecture guidelines
# We use Tee-Object to show output in the console and also save to a log file
uv run python -m app 2>&1 | Tee-Object -FilePath app.log
