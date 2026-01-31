const path = require('node:path');
const fs = require('node:fs');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const Database = require('better-sqlite3');
const { z } = require('zod');

const PORT = 4070;
const DB_PATH = path.join(process.cwd(), 'data', 'uptime.db');

function ensureDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      interval_sec INTEGER NOT NULL DEFAULT 60,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL,
      ts TEXT NOT NULL,
      ok INTEGER NOT NULL,
      status_code INTEGER,
      latency_ms INTEGER,
      error TEXT,
      FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_checks_monitor_ts ON checks(monitor_id, ts);
  `);
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

async function checkUrl(url) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(t);

    const latency = Date.now() - start;
    const ok = res.status >= 200 && res.status < 400;
    return {
      ok,
      status_code: res.status,
      latency_ms: latency,
      error: null
    };
  } catch (e) {
    const latency = Date.now() - start;
    return {
      ok: false,
      status_code: null,
      latency_ms: latency,
      error: (e && e.message) ? e.message : String(e)
    };
  }
}

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  });

  const db = ensureDb();

  const listMonitors = db.prepare('SELECT * FROM monitors ORDER BY created_at DESC');
  const getMonitor = db.prepare('SELECT * FROM monitors WHERE id = ?');
  const insertMonitor = db.prepare('INSERT INTO monitors(name,url,interval_sec,enabled,created_at) VALUES(?,?,?,?,?)');
  const deleteMonitor = db.prepare('DELETE FROM monitors WHERE id = ?');

  const insertCheck = db.prepare('INSERT INTO checks(monitor_id,ts,ok,status_code,latency_ms,error) VALUES(?,?,?,?,?,?)');
  const recentChecks = db.prepare(
    'SELECT * FROM checks WHERE monitor_id = ? ORDER BY ts DESC LIMIT ?'
  );
  const lastCheck = db.prepare(
    'SELECT * FROM checks WHERE monitor_id = ? ORDER BY ts DESC LIMIT 1'
  );

  // Basic scheduler (single interval tick)
  let lastRunById = new Map();

  async function schedulerTick() {
    const rows = listMonitors.all().filter((m) => m.enabled === 1);
    const now = Date.now();
    for (const m of rows) {
      const intervalMs = Math.max(10, (m.interval_sec || 60) * 1000);
      const last = lastRunById.get(m.id) || 0;
      if (now - last < intervalMs) continue;
      lastRunById.set(m.id, now);

      const result = await checkUrl(m.url);
      insertCheck.run(m.id, nowIso(), result.ok ? 1 : 0, result.status_code, result.latency_ms, result.error);
    }
  }

  setInterval(() => {
    schedulerTick().catch((e) => app.log.error(e));
  }, 1000);

  app.get('/health', async () => ({ ok: true }));

  app.get('/api/monitors', async () => {
    const mons = listMonitors.all();
    return {
      monitors: mons.map((m) => {
        const lc = lastCheck.get(m.id);
        return {
          ...m,
          lastCheck: lc || null
        };
      })
    };
  });

  app.get('/api/monitors/:id/checks', async (req, reply) => {
    const id = Number(req.params.id);
    const m = getMonitor.get(id);
    if (!m) return reply.code(404).send({ error: 'not found' });

    const limit = Math.min(Number(req.query.limit || 60), 500);
    return {
      monitor: m,
      checks: recentChecks.all(id, limit)
    };
  });

  app.post('/api/monitors', async (req, reply) => {
    const Body = z.object({
      name: z.string().min(1),
      url: z.string().url(),
      intervalSec: z.number().int().min(10).max(3600).optional()
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { name, url, intervalSec } = parsed.data;
    const info = insertMonitor.run(name, url, intervalSec || 60, 1, nowIso());
    return reply.code(201).send({ id: info.lastInsertRowid });
  });

  app.delete('/api/monitors/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const info = deleteMonitor.run(id);
    if (info.changes === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
