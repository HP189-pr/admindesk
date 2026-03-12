# Run this from a PowerShell prompt (Admin privileges not required).
# Usage: Open PowerShell, then: & "e:\admindesk\run_backend.ps1"

Try {
    $pythonExe = "e:\admindesk\.venv\Scripts\python.exe"
    $backendDir = "e:\admindesk\backend"
    $backendLauncher = Join-Path $backendDir "start_backend.bat"

    if (-not (Test-Path $pythonExe)) {
        throw "Python not found at $pythonExe"
    }
    if (-not (Test-Path $backendLauncher)) {
        throw "Backend launcher not found at $backendLauncher"
    }

    Write-Host "Using Python: $pythonExe"

    # Install required packages (skip if already installed)
    Write-Host "Installing backend packages..."
    & $pythonExe -m pip install --upgrade pip
    & $pythonExe -m pip install -r "e:\admindesk\backend\requirements.txt"

    # Ensure migrations are applied
    Write-Host "Running migrations..."
    Set-Location $backendDir
    & $pythonExe manage.py migrate

    # Start the ASGI server path used by the current app runtime.
    Write-Host "Starting ASGI backend via start_backend.bat..."
    & $backendLauncher dev 127.0.0.1 8001

} Catch {
    Write-Error "Script failed: $_"
}
