import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { addMonitor, deleteMonitor, getChecks, listMonitors } from "./api";

function clsx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function StatusPip({ ok }) {
  return (
    <span
      className={clsx(
        "inline-block h-2.5 w-2.5 rounded-full",
        ok ? "bg-emerald-500" : "bg-rose-500"
      )}
      title={ok ? "Up" : "Down"}
    />
  );
}

function HistoryDots({ checks }) {
  const dots = (checks || []).slice(0, 30);
  return (
    <div className="flex flex-wrap gap-1">
      {dots.map((c) => (
        <span
          key={c.id}
          className={clsx(
            "h-2.5 w-2.5 rounded-sm",
            c.ok ? "bg-emerald-500/80" : "bg-rose-500/80"
          )}
          title={`${c.ts} • ${c.ok ? "UP" : "DOWN"}${c.status_code ? ` • ${c.status_code}` : ""}${c.latency_ms != null ? ` • ${c.latency_ms}ms` : ""}`}
        />
      ))}
      {!dots.length ? <span className="text-xs text-neutral-500">No checks yet</span> : null}
    </div>
  );
}

function LatencyChart({ checks, height = 84 }) {
  // checks come newest-first; we want oldest->newest for a left-to-right chart
  const pts = (checks || [])
    .slice(0, 60)
    .filter((c) => c.latency_ms != null)
    .slice()
    .reverse();

  const width = 560;
  const pad = 8;

  const values = pts.map((c) => Number(c.latency_ms || 0));
  const max = Math.max(50, ...values);
  const min = 0;

  const toX = (i) => {
    if (pts.length <= 1) return pad;
    return pad + (i * (width - pad * 2)) / (pts.length - 1);
  };
  const toY = (v) => {
    const t = (v - min) / (max - min);
    return pad + (1 - t) * (height - pad * 2);
  };

  const d = pts
    .map((c, i) => {
      const x = toX(i);
      const y = toY(Number(c.latency_ms || 0));
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const last = pts[pts.length - 1];
  const lastMs = last?.latency_ms;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs font-medium text-neutral-200">Response time</div>
          <div className="text-[11px] text-neutral-500">Last {Math.min(pts.length, 60)} samples</div>
        </div>
        <div className="text-xs text-neutral-400">{lastMs != null ? `${lastMs}ms` : "—"}</div>
      </div>

      {pts.length < 2 ? (
        <div className="mt-3 text-xs text-neutral-500">Not enough data yet.</div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="block h-[84px] min-w-[560px]"
            role="img"
            aria-label="Response time line chart"
          >
            <defs>
              <linearGradient id="latencyStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* baseline */}
            <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#262626" strokeWidth="1" />
            <path d={d} fill="none" stroke="url(#latencyStroke)" strokeWidth="2" />
          </svg>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
        <span>0ms</span>
        <span>{max}ms</span>
      </div>
    </div>
  );
}

export default function App() {
  const [monitors, setMonitors] = useState([]);
  const [selected, setSelected] = useState(null);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [interval, setIntervalSec] = useState(60);

  async function refresh() {
    setLoading(true);
    setErr("");
    try {
      const data = await listMonitors();
      setMonitors(data.monitors || []);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    getChecks(selected.id, 90)
      .then((d) => setChecks(d.checks || []))
      .catch(() => setChecks([]));
  }, [selected]);

  const selectedMonitor = useMemo(() => {
    if (!selected) return null;
    return monitors.find((m) => m.id === selected.id) || null;
  }, [selected, monitors]);

  async function onAdd(e) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      await addMonitor({ name, url, intervalSec: Number(interval) });
      setName("");
      setUrl("");
      setIntervalSec(60);
      await refresh();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id) {
    const ok = window.confirm("Delete this monitor?");
    if (!ok) return;
    setLoading(true);
    setErr("");
    try {
      await deleteMonitor(id);
      if (selected?.id === id) {
        setSelected(null);
        setChecks([]);
      }
      await refresh();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs text-neutral-400">uptime-monitor</div>
            <h1 className="text-2xl font-semibold tracking-tight">Monitors</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Minimal: 60s checks, green/red history, add via API.
            </p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </header>

        <main className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[360px_1fr]">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="text-sm font-medium">Add monitor</div>
            <form className="mt-3 space-y-3" onSubmit={onAdd}>
              <div className="grid gap-2">
                <label className="text-xs text-neutral-400">Name</label>
                <input
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-600"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Bookmark Backend"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs text-neutral-400">URL</label>
                <input
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-600"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://192.168.31.176:8787/health"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs text-neutral-400">Interval (sec)</label>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-600"
                  value={interval}
                  onChange={(e) => setIntervalSec(e.target.value)}
                />
              </div>
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-60"
                disabled={loading}
              >
                <Plus size={16} />
                Add
              </button>
            </form>

            {err ? (
              <div className="mt-3 rounded-lg border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                {err}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Monitors</div>
              <div className="text-xs text-neutral-500">{monitors.length} total</div>
            </div>

            <div className="mt-3 grid gap-2">
              {monitors.map((m) => {
                const ok = m.lastCheck ? m.lastCheck.ok === 1 : null;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className={clsx(
                      "w-full rounded-xl border px-3 py-3 text-left transition",
                      selected?.id === m.id
                        ? "border-neutral-600 bg-neutral-950"
                        : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {ok === null ? (
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-neutral-600" title="Pending" />
                          ) : (
                            <StatusPip ok={ok} />
                          )}
                          <div className="truncate text-sm font-medium">{m.name}</div>
                        </div>
                        <div className="mt-1 truncate text-xs text-neutral-500">{m.url}</div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                          <span>{m.interval_sec}s</span>
                          {m.lastCheck?.latency_ms != null ? (
                            <span>{m.lastCheck.latency_ms}ms</span>
                          ) : null}
                          {m.lastCheck?.status_code != null ? (
                            <span>HTTP {m.lastCheck.status_code}</span>
                          ) : null}
                        </div>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDelete(m.id);
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-neutral-400 hover:border-rose-900/40 hover:bg-rose-950/30 hover:text-rose-300"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </div>
                    </div>
                  </button>
                );
              })}

              {!monitors.length ? (
                <div className="rounded-xl border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500">
                  No monitors yet.
                </div>
              ) : null}
            </div>

            {selectedMonitor ? (
              <div className="mt-4 space-y-3">
                <LatencyChart checks={checks} />

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{selectedMonitor.name}</div>
                      <div className="text-xs text-neutral-500">Recent checks</div>
                    </div>
                    <div className="text-xs text-neutral-500">Last 30</div>
                  </div>
                  <div className="mt-3">
                    <HistoryDots checks={checks} />
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </main>

        <footer className="mt-6 text-xs text-neutral-600">
          API: GET /api/monitors, POST /api/monitors, DELETE /api/monitors/:id
        </footer>
      </div>
    </div>
  );
}
