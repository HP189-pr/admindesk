# Run this from a PowerShell prompt (Admin privileges not required).
# Usage: Open PowerShell, then: & "e:\admindesk\run_backend.ps1"

# Allow script execution for this session if blocked
Try {
    $pythonExe = "e:\admindesk\.venv\Scripts\python.exe"
    if (-not (Test-Path $pythonExe)) {
        throw "Python not found at $pythonExe"
    }

    Write-Host "Using Python: $pythonExe"

    # Install required packages (skip if already installed)
    Write-Host "Installing backend packages (including websocket stack)..."
    & $pythonExe -m pip install --upgrade pip
    & $pythonExe -m pip install -r "e:\admindesk\backend\requirements.txt"

    # Ensure migrations are applied
    Write-Host "Running migrations..."
    cd "e:\admindesk\backend"
    & $pythonExe manage.py migrate

    # Start server
    Write-Host "Starting Django dev server..."
    & $pythonExe manage.py runserver 127.0.0.1:8001

} Catch {
    Write-Error "Script failed: $_"
}
