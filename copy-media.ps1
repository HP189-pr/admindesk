# PowerShell script to copy Django media files to Vite dist folder

$ErrorActionPreference = "Stop"

Write-Host "Copying media files from Django backend to dist folder..." -ForegroundColor Cyan

# Define paths
$sourceProfilePics = "backend\media\profile_pictures"
$targetProfilePics = "dist\media\profile_pictures"
$sourceLogo = "backend\media\logo"
$targetLogo = "dist\media\logo"

# Create target directories
if (!(Test-Path $targetProfilePics)) {
    New-Item -ItemType Directory -Path $targetProfilePics -Force | Out-Null
    Write-Host "✓ Created directory: $targetProfilePics" -ForegroundColor Green
}

# Copy profile pictures
if (Test-Path $sourceProfilePics) {
    $files = Get-ChildItem -Path $sourceProfilePics -File
    foreach ($file in $files) {
        Copy-Item -Path $file.FullName -Destination $targetProfilePics -Force
    }
    Write-Host "✓ Copied $($files.Count) profile picture(s)" -ForegroundColor Green
} else {
    Write-Host "⚠ Source directory not found: $sourceProfilePics" -ForegroundColor Yellow
}

# Copy logo files
if (Test-Path $sourceLogo) {
    if (!(Test-Path $targetLogo)) {
        New-Item -ItemType Directory -Path $targetLogo -Force | Out-Null
    }
    $logoFiles = Get-ChildItem -Path $sourceLogo -File
    foreach ($file in $logoFiles) {
        Copy-Item -Path $file.FullName -Destination $targetLogo -Force
    }
    Write-Host "✓ Copied $($logoFiles.Count) logo file(s)" -ForegroundColor Green
}

Write-Host "`n✓ Media files copy completed successfully!" -ForegroundColor Green
