function apiBase() {
  try {
    return `http://${window.location.hostname}:4070`;
  } catch {
    return 'http://127.0.0.1:4070';
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

export function addMonitor({ name, url, intervalSec }) {
  return http('/api/monitors', { method: 'POST', body: { name, url, intervalSec } });
}

export function deleteMonitor(id) {
  return http(`/api/monitors/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getChecks(id, limit = 60) {
  return http(`/api/monitors/${encodeURIComponent(id)}/checks?limit=${encodeURIComponent(limit)}`);
}
