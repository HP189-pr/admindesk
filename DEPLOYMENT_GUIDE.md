# Professional Deployment Guide

## Architecture Overview

### Development
```
Browser → Vite Dev Server (3000) → Proxy → Django (8000)
                                   ↓
                           /media/ requests
```

### Production (Recommended)
```
Browser → Nginx/Apache → Frontend (dist/)
                      → Django API (/api/)
                      → Django Media (/media/)
```

## Deployment Options

### Option 1: Separate Services (RECOMMENDED - Most Professional)

**Best for:** Production environments, scalable applications

**Architecture:**
- Frontend: Static files served by nginx/Apache or CDN
- Backend: Django runs separately (same or different server)
- Media: Served directly by nginx or CDN

**Benefits:**
- ✅ Media files always up-to-date (no rebuild needed for uploads)
- ✅ Better performance (nginx serves static files faster)
- ✅ Can scale independently
- ✅ Can use CDN for media files
- ✅ No file duplication

**Setup:**

1. **Build frontend (without media copy):**
   ```bash
   npm run build
   ```

2. **Nginx configuration:**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       # Frontend static files
       location / {
           root /var/www/admindesk/dist;
           try_files $uri $uri/ /index.html;
       }

       # Django API
       location /api/ {
           proxy_pass http://localhost:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # Django Media files - served directly by nginx
       location /media/ {
           alias /var/www/admindesk/backend/media/;
           expires 30d;
           add_header Cache-Control "public, immutable";
       }

       # Django Static files (admin, etc.)
       location /static/ {
           alias /var/www/admindesk/backend/static/;
           expires 30d;
       }
   }
   ```

3. **Environment variables (.env.production):**
   ```bash
   VITE_API_BASE_URL=https://yourdomain.com
   VITE_MEDIA_BASE_URL=https://yourdomain.com
   ```

4. **Django settings (production):**
   ```python
   ALLOWED_HOSTS = ['yourdomain.com', 'www.yourdomain.com']
   MEDIA_URL = '/media/'
   MEDIA_ROOT = '/var/www/admindesk/backend/media/'
   ```

---

### Option 2: Static Hosting with Bundled Media

**Best for:** Simple deployments, static hosting (Netlify, Vercel, GitHub Pages)

**Architecture:**
- Frontend + Media: All bundled in dist/
- Backend: Separate server for API only

**Benefits:**
- ✅ Simple deployment (single folder)
- ✅ Works with static hosting services
- ✅ Good for CDN distribution

**Drawbacks:**
- ❌ Need to rebuild when media changes
- ❌ Duplicates media files
- ❌ Not suitable for frequently updated media

**Setup:**

1. **Build with media copy:**
   ```bash
   npm run build:static
   ```

2. **Deploy dist/ folder** to your static host

3. **API must run separately** and allow CORS

---

### Option 3: CDN for Media Files (Most Scalable)

**Best for:** High-traffic applications, global audience

**Architecture:**
- Frontend: Static hosting or nginx
- Backend: Django API server
- Media: AWS S3, Cloudinary, or similar CDN

**Setup:**

1. **Install django-storages:**
   ```bash
   pip install django-storages boto3
   ```

2. **Django settings:**
   ```python
   # settings.py
   INSTALLED_APPS += ['storages']
   
   # AWS S3 Configuration
   AWS_ACCESS_KEY_ID = 'your-access-key'
   AWS_SECRET_ACCESS_KEY = 'your-secret-key'
   AWS_STORAGE_BUCKET_NAME = 'your-bucket-name'
   AWS_S3_REGION_NAME = 'us-east-1'
   
   # Media files to S3
   DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
   MEDIA_URL = f'https://{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com/'
   ```

3. **Frontend env:**
   ```bash
   VITE_MEDIA_BASE_URL=https://your-bucket.s3.amazonaws.com
   ```

---

## Comparison Table

| Feature | Option 1: Separate | Option 2: Bundled | Option 3: CDN |
|---------|-------------------|-------------------|---------------|
| Setup Complexity | Medium | Simple | Complex |
| Performance | Excellent | Good | Excellent |
| Media Sync | Auto | Manual | Auto |
| Scalability | High | Low | Very High |
| Cost | Low | Very Low | Medium |
| Rebuild on Upload | No | Yes | No |
| Best For | Production | Small/Static | Enterprise |

---

## Current Project Recommendation

**For your admindesk project, I recommend Option 1 (Separate Services):**

### Why?
1. ✅ Users upload profile pictures frequently
2. ✅ You need media to update without rebuilding
3. ✅ Running on local server (easy nginx setup)
4. ✅ Better separation of concerns
5. ✅ More professional architecture

### Implementation Steps:

1. **Use regular build** (not build:static):
   ```bash
   npm run build
   ```

2. **Update frontend code** to use config:
   ```javascript
   import config from '@/config/env';
   
   // Instead of: src="/media/profile_pictures/user.jpg"
   // Use: src={config.getMediaUrl('media/profile_pictures/user.jpg')}
   ```

   **If frontend and backend are on different ports/hosts** (e.g., frontend :8081, backend :8000), make sure `/media/` requests go to the backend. Options:
   - Serve `/media/` from the same origin as the frontend (nginx alias), or
   - Use absolute media URLs that point to the backend host.

3. **Deploy with nginx** (see nginx config above)

4. **No media copying needed** - nginx serves directly from Django

---

## Migration Path

### Phase 1: Development (Current - Working)
- ✅ Vite proxy handles everything
- ✅ No changes needed

### Phase 2: Testing/Staging
- Use Option 1 setup
- Test nginx configuration
- Verify media serving

### Phase 3: Production
- Deploy with nginx
- Set production environment variables
- Monitor performance

---

## Quick Commands Reference

```bash
# Development
npm run dev                  # Dev server with proxy

# Production Build
npm run build               # Standard build (no media copy)
npm run build:static        # Build + copy media (for static hosting)

# Media Management
npm run copy-media          # Manual media copy (if needed)
.\copy-media.ps1           # PowerShell alternative

# Preview Production Build
npm run serve              # Test build locally
```

---

## Environment Variables

Create these files:

**.env** (development - already created):
```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_MEDIA_BASE_URL=http://localhost:8000
```

**.env.production** (for production builds):
```bash
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_MEDIA_BASE_URL=https://media.yourdomain.com
```

**.env.staging** (for testing):
```bash
VITE_API_BASE_URL=https://staging-api.yourdomain.com
VITE_MEDIA_BASE_URL=https://staging-api.yourdomain.com
```

---

## Summary

✅ **Current setup works** but copying media to dist is not ideal for production

✅ **Professional approach**: Serve media separately via nginx (Option 1)

✅ **For static hosting**: Use `npm run build:static` (Option 2)

✅ **For enterprise**: Use CDN like S3 (Option 3)

✅ **Recommended for you**: Option 1 - Best balance of performance, maintainability, and professionalism
