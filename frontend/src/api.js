function apiBase() {
  // Prefer explicit config (prod), fallback to dev localhost/host-port.
  const envBase = (import.meta?.env?.VITE_API_BASE || "").trim();
  if (envBase) return envBase.replace(/\/$/, "");

  const mode = String(import.meta?.env?.MODE || "").toLowerCase();
  if (mode === "production") return "";

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
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ? JSON.stringify(data.error) : `HTTP ${res.status}`);
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
