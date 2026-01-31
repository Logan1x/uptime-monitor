# uptime-monitor

A very small uptime monitor (Uptime Kuma–like, but extremely minimal):
- interval-based HTTP checks (default 60s)
- add monitors via API + UI
- show pass/fail history (green/red dots)

## Run

### Backend
```bash
cd backend
npm install
npm run dev
```
Backend: http://localhost:4070

### Frontend
```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 4071
```
Frontend: http://localhost:4071

## API
- `GET /api/monitors`
- `POST /api/monitors` `{ name, url, intervalSec }`
- `DELETE /api/monitors/:id`
- `GET /api/monitors/:id/checks?limit=90`
