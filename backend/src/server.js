const path = require('node:path');
const fs = require('node:fs');
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const Database = require('better-sqlite3');
const pm2 = require('pm2');
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
      pm2_name TEXT,
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

  // lightweight migration for older DBs
  try {
    db.exec('ALTER TABLE monitors ADD COLUMN pm2_name TEXT');
  } catch {
    // ignore if it already exists
  }

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
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  });

  const db = ensureDb();

  const listMonitors = db.prepare('SELECT * FROM monitors ORDER BY created_at DESC');
  const getMonitor = db.prepare('SELECT * FROM monitors WHERE id = ?');
  const insertMonitor = db.prepare('INSERT INTO monitors(name,url,interval_sec,enabled,pm2_name,created_at) VALUES(?,?,?,?,?,?)');
  const updatePm2Name = db.prepare('UPDATE monitors SET pm2_name = ? WHERE id = ?');
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
      intervalSec: z.number().int().min(10).max(3600).optional(),
      pm2Name: z.string().min(1).optional()
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { name, url, intervalSec, pm2Name } = parsed.data;
    const info = insertMonitor.run(name, url, intervalSec || 60, 1, pm2Name || null, nowIso());
    return reply.code(201).send({ id: info.lastInsertRowid });
  });

  app.patch('/api/monitors/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const m = getMonitor.get(id);
    if (!m) return reply.code(404).send({ error: 'not found' });

    const Body = z.object({
      pm2Name: z.string().min(1).nullable().optional()
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { pm2Name } = parsed.data;
    updatePm2Name.run(pm2Name ?? null, id);
    return { ok: true };
  });

  function pm2Connect() {
    return new Promise((resolve, reject) => {
      pm2.connect((err) => (err ? reject(err) : resolve()));
    });
  }

  function pm2Disconnect() {
    try {
      pm2.disconnect();
    } catch {
      // ignore
    }
  }

  function pm2List() {
    return new Promise((resolve, reject) => {
      pm2.list((err, list) => (err ? reject(err) : resolve(list || [])));
    });
  }

  function pm2Describe(name) {
    return new Promise((resolve, reject) => {
      pm2.describe(name, (err, desc) => (err ? reject(err) : resolve(desc || [])));
    });
  }

  function tailFileLines(filePath, lines = 200) {
    try {
      if (!filePath) return [];
      if (!fs.existsSync(filePath)) return [];
      const txt = fs.readFileSync(filePath, 'utf8');
      const xs = txt.split(/\r?\n/).filter(Boolean);
      return xs.slice(-lines);
    } catch {
      return [];
    }
  }

  app.get('/api/pm2/apps', async (req, reply) => {
    try {
      await pm2Connect();
      const list = await pm2List();
      return {
        apps: list.map((p) => ({
          name: p?.name,
          pid: p?.pid,
          status: p?.pm2_env?.status,
          restartTime: p?.pm2_env?.restart_time,
          cpu: p?.monit?.cpu,
          mem: p?.monit?.memory
        }))
      };
    } catch (e) {
      return reply.code(500).send({ error: e?.message || String(e) });
    } finally {
      pm2Disconnect();
    }
  });

  app.get('/api/pm2/apps/:name/logs', async (req, reply) => {
    const name = String(req.params.name);
    const lines = Math.min(Number(req.query.lines || 200), 2000);

    try {
      await pm2Connect();
      const desc = await pm2Describe(name);
      const env = desc?.[0]?.pm2_env;
      const outPath = env?.pm_out_log_path;
      const errPath = env?.pm_err_log_path;
      return {
        name,
        out: tailFileLines(outPath, lines),
        err: tailFileLines(errPath, lines)
      };
    } catch (e) {
      return reply.code(500).send({ error: e?.message || String(e) });
    } finally {
      pm2Disconnect();
    }
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
