# Self-hosting uptime-monitor (enables PM2 logs)

Hosted/public deployments should disable PM2 log access.
If you want the **Terminal / PM2 logs** feature, self-host on a machine where you run your services under **PM2**.

## Architecture
- **Backend** (Fastify + SQLite): runs checks and stores history
- **Frontend** (Vite): UI

## Local / self-host (dev)
### Backend
```bash
cd backend
npm install
# dev mode: PM2 logs enabled
APP_ENV=dev PORT=4070 node src/server.js
```

### Frontend
```bash
cd frontend
npm install
VITE_API_BASE=http://127.0.0.1:4070 npm run dev -- --host 0.0.0.0 --port 4071
```

## Production / hosted mode (PM2 logs disabled)
In production, PM2 log endpoints are disabled and the UI hides the Terminal icon.

### Backend
```bash
cd backend
npm install
APP_ENV=prod PORT=4070 node src/server.js
```

If you serve the frontend from a different origin, configure CORS:
```bash
APP_ENV=prod CORS_ORIGIN=https://your-frontend-domain.com PORT=4070 node src/server.js
```

### Frontend
Set API base explicitly in prod:
```bash
cd frontend
npm install
# same-origin example
VITE_API_BASE= npm run build

# OR explicit api host example
VITE_API_BASE=https://api.yourdomain.com npm run build
```

## PM2 logs feature
The logs viewer works by reading PM2 log files via the backend.
This is intentionally blocked in hosted mode for security.

To use it:
- Run your monitored services using PM2 on the same host
- Create monitors with `pm2_name` (dev/self-host only)

