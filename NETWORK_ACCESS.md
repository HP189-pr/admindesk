# Access AdminDesk from Other PCs

## Your Network Setup

**Your PC IP Address:** `160.160.109.147`

## Quick Start

### Option 1: Use the Batch File (Easiest)
Double-click: `start_network.bat`

### Option 2: Manual Start

1. **Start Django Backend:**
   ```bash
   cd backend
   python manage.py runserver 0.0.0.0:8000
   ```

2. **Start Vite Frontend:**
   ```bash
   npm run dev
   ```

## Access URLs

### From Your PC (Host):
- Frontend: http://localhost:3000 OR http://160.160.109.147:3000
- Backend: http://localhost:8000 OR http://160.160.109.147:8000

### From Other PCs (Same Network):
- Frontend: http://160.160.109.147:3000
- Backend API: http://160.160.109.147:8000

## Important Notes

### ✅ What's Configured:
1. Django `ALLOWED_HOSTS` includes your IP
2. Django server listens on `0.0.0.0:8000` (all interfaces)
3. Vite listens on `0.0.0.0:3000` (all interfaces)

### 🔒 Firewall (May Need to Allow):
Windows may ask to allow Python and Node through firewall - click **Allow**.

If other PCs can't connect:
```powershell
# Allow ports through Windows Firewall
netsh advfirewall firewall add rule name="AdminDesk Frontend" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="AdminDesk Backend" dir=in action=allow protocol=TCP localport=8000
```

### 📱 Dynamic IP (DHCP):
Your IP `160.160.109.147` is assigned by DHCP and **may change** after:
- Router restart
- Network reconnection
- DHCP lease expiration

**If IP changes:**
1. Run: `ipconfig | Select-String "IPv4"`
2. Update `backend/backend/settings.py` ALLOWED_HOSTS with new IP
3. Update this file with new IP
4. Restart servers

### 🔄 To Make IP Static (Optional):
**Network Settings → Adapter Properties → IPv4 Properties → Use the following IP address:**
- IP: 160.160.109.147
- Subnet: 255.255.255.0 (usually)
- Gateway: (your router IP, usually 160.160.109.1)
- DNS: 8.8.8.8, 8.8.4.4

## Testing Connection

### From Other PC:
1. **Ping test:**
   ```bash
   ping 160.160.109.147
   ```
   
2. **Access frontend:**
   Open browser: http://160.160.109.147:3000

3. **If can't access:**
   - Check firewall
   - Verify both PCs on same network
   - Check IP hasn't changed

## Stopping Servers

Close the command windows or press `Ctrl+C` in each terminal.

## Production Deployment (Future)

For permanent deployment, consider:
- Static IP or domain name
- Nginx/Apache reverse proxy
- SSL certificate (HTTPS)
- Production WSGI server (Gunicorn/uWSGI)
- Remove DEBUG=True in settings.py
