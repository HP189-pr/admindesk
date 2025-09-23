# Run this from a PowerShell prompt (Admin privileges not required).
# Usage: Open PowerShell, then: & "e:\admindesk\run_backend.ps1"

# Allow script execution for this session if blocked
Try {
    # dot-source venv activation (PowerShell)
    $venvActivate = Join-Path -Path "e:\admindesk\backend" -ChildPath ".venv\Scripts\Activate.ps1"
    if (Test-Path $venvActivate) {
        . $venvActivate
    } else {
        # fallback to activate for cmd-style
        $venvActivateBat = Join-Path -Path "e:\admindesk\backend" -ChildPath ".venv\Scripts\activate"
        if (Test-Path $venvActivateBat) { & $venvActivateBat }
    }

    Write-Host "Virtualenv activated (if present)."

    # Install required packages (skip if already installed)
    Write-Host "Installing common backend packages (djangorestframework, django-cors-headers, pandas, openpyxl, psycopg2-binary, python-dotenv)..."
    pip install --upgrade pip
    pip install djangorestframework django-cors-headers pandas openpyxl psycopg2-binary python-dotenv || Write-Host "Some packages may already be installed."

    # Ensure migrations are applied
    Write-Host "Running migrations..."
    cd "e:\admindesk\backend"
    python manage.py migrate

    # Start server
    Write-Host "Starting Django dev server..."
    python manage.py runserver

} Catch {
    Write-Error "Script failed: $_"
}
