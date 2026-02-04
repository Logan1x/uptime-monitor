function apiBase() {
  // Prefer explicit config (prod), fallback to dev localhost/host-port.
  const envBase = (import.meta?.env?.VITE_API_BASE || "").trim();
  if (envBase) return envBase.replace(/\/$/, "");

  const mode = String(import.meta?.env?.MODE || "").toLowerCase();
  if (mode === "production") {
    // In prod we default to same-host backend on port 4070.
    // (This avoids needing a reverse proxy in simple self-host setups.)
    try {
      return `http://${window.location.hostname}:4070`;
    } catch {
      return "http://127.0.0.1:4070";
    }
  }

  try {
    return `http://${window.location.hostname}:4070`;
  } catch {
    return "http://127.0.0.1:4070";
  }
}

const API = apiBase();

async function http(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();

  let data = null;
  if (text) {
    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(text);
      } catch {
        // fall through; we'll throw a better error below
      }
    }
  }

  if (!res.ok) {
    const detail = data?.error ? JSON.stringify(data.error) : (text ? text.slice(0, 200) : `HTTP ${res.status}`);
    throw new Error(detail);
  }

  // If server returned HTML (common misconfig), surface a clear error.
  if (text && !data && contentType.includes('text/html')) {
    throw new Error(
      'API misconfigured: got HTML instead of JSON. Set VITE_API_BASE to your backend (e.g. https://api.yourdomain.com) or proxy /api to the backend.'
    );
  }

  return data;
}

export function listMonitors() {
  return http('/api/monitors');
}

export function addMonitor({ name, url, intervalSec, pm2Name }) {
  return http('/api/monitors', { method: 'POST', body: { name, url, intervalSec, pm2Name } });
}

export function patchMonitor(id, patch) {
  return http(`/api/monitors/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}

export function getPm2Logs(name, lines = 200) {
  return http(`/api/pm2/apps/${encodeURIComponent(name)}/logs?lines=${encodeURIComponent(lines)}`);
}

export function getCapabilities() {
  return http('/api/capabilities');
}

export function deleteMonitor(id) {
  return http(`/api/monitors/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getChecks(id, limit = 60) {
  return http(`/api/monitors/${encodeURIComponent(id)}/checks?limit=${encodeURIComponent(limit)}`);
}
