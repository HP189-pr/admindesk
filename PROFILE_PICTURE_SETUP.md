# Profile Picture Setup Guide

## Overview

Profile pictures are stored in Django's media folder (`backend/media/profile_pictures/`) and need to be accessible from the frontend during development and production.

## Setup Complete ✓

### 1. Development Mode (Vite Dev Server)

**How it works:**
- Vite dev server proxies `/media/` requests to Django backend
- Django serves media files from `backend/media/`
- No file copying needed during development

**Configuration:**
- `vite.config.js` now includes `/media` proxy to `http://localhost:8000`
- Django `settings.py` already configured to serve media files when `DEBUG=True`

**To use:**
```bash
# Start backend
npm run dev

# Profile pictures automatically accessible at:
# http://localhost:3000/media/profile_pictures/username.jpg
```

### 2. Production Build

**How it works:**
- Build command now copies media files from Django to dist folder
- Media files bundled with production build

**Commands:**

```bash
# Build with automatic media copy
npm run build

# Or manually copy media files
npm run copy-media

# Or using PowerShell
.\copy-media.ps1
```

## File Structure

```
admindesk/
├── backend/
│   └── media/
│       ├── profile_pictures/     ← Django stores uploads here
│       │   ├── user123.jpg
│       │   └── default-profile.png
│       └── logo/
│           └── ksv.png
├── dist/                          ← Production build
│   └── media/                     ← Copied during build
│       ├── profile_pictures/
│       └── logo/
└── public/
    └── profilepic/                ← Static fallback images
        └── default-profile.png
```

## How Profile Pictures Work

### Backend (Django)

1. User uploads profile picture via `/api/profile/` endpoint
2. Django saves to `backend/media/profile_pictures/username.ext`
3. Database stores path: `profile_pictures/username.ext`
4. API returns full URL: `/media/profile_pictures/username.ext`

### Frontend (React)

1. Component receives profile picture URL from API
2. URL format: `/media/profile_pictures/username.jpg`
3. In development: Vite proxies to Django backend
4. In production: Served from `dist/media/` folder

## Troubleshooting

### Issue: Profile pictures not showing in development

**Solution:**
1. Ensure Django backend is running on port 8000
2. Check Vite dev server is running on port 3000
3. Verify `vite.config.js` has `/media` proxy configured
4. Check browser console for 404 errors

### Issue: Profile pictures not showing in production build

**Solution:**
1. Run `npm run build` to rebuild with media files
2. Or manually run `npm run copy-media` or `.\copy-media.ps1`
3. Verify files exist in `dist/media/profile_pictures/`
4. Ensure Django backend is serving media files

### Issue: New uploads not appearing

**Development:**
- No action needed - Vite proxy automatically serves new files from Django

**Production:**
- Re-run `npm run copy-media` or rebuild
- Or configure web server (nginx/Apache) to serve Django media files directly

## Production Deployment Notes

For production deployment, you have two options:

### Option 1: Copy media files to dist (current setup)
- Media files are part of the static build
- Run `npm run build` whenever Django media changes
- Simple but requires rebuild when media changes

### Option 2: Serve Django media separately (recommended for production)
- Configure nginx/Apache to serve Django media directly
- Set `MEDIA_ROOT` and `MEDIA_URL` in Django settings
- Frontend continues to use `/media/` URLs
- No copying needed - files always current

Example nginx configuration:
```nginx
location /media/ {
    alias /path/to/backend/media/;
}
```

## Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| Dev | `npm run dev` | Start Vite dev server (proxies media) |
| Build | `npm run build` | Build + copy media files |
| Copy | `npm run copy-media` | Copy media files only |
| Copy (PS) | `.\copy-media.ps1` | PowerShell copy script |

## Files Modified

- ✓ `vite.config.js` - Added `/media` proxy for dev and preview servers
- ✓ `package.json` - Updated build script to copy media files
- ✓ `copy-media.js` - Node script to copy media files
- ✓ `copy-media.ps1` - PowerShell script to copy media files
