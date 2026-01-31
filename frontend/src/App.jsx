import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, Trash2, Terminal, X } from "lucide-react";
import { addMonitor, deleteMonitor, getChecks, getPm2Logs, listMonitors } from "./api";

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

function LatencyChart({ checks, height = 128 }) {
  // checks come newest-first; we want oldest->newest for a left-to-right chart
  const pts = (checks || [])
    .slice(0, 120)
    .filter((c) => c.latency_ms != null)
    .slice()
    .reverse();

  const width = 560;
  const pad = 12;

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

  const baseY = height - pad;

  const segments = [];
  for (let i = 0; i < pts.length; i++) {
    const ok = pts[i].ok === 1;
    const last = segments[segments.length - 1];
    if (!last || last.ok !== ok) segments.push({ ok, start: i, end: i });
    else last.end = i;
  }

  function linePathForRange(a, b) {
    // Include one-point overlap with previous segment so the line looks continuous.
    const start = Math.max(0, a - 1);
    return pts
      .slice(start, b + 1)
      .map((c, idx) => {
        const i = start + idx;
        const x = toX(i);
        const y = toY(Number(c.latency_ms || 0));
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }

  function areaPathForRange(a, b) {
    const start = Math.max(0, a - 1);
    const slice = pts.slice(start, b + 1);
    if (!slice.length) return "";

    const top = slice
      .map((c, idx) => {
        const i = start + idx;
        const x = toX(i);
        const y = toY(Number(c.latency_ms || 0));
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    const endX = toX(start + slice.length - 1);
    const startX = toX(start);
    return `${top} L ${endX.toFixed(2)} ${baseY.toFixed(2)} L ${startX.toFixed(2)} ${baseY.toFixed(2)} Z`;
  }

  const fmtTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const firstLabel = pts.length ? fmtTime(pts[0].ts) : "";
  const midLabel = pts.length ? fmtTime(pts[Math.floor((pts.length - 1) / 2)].ts) : "";
  const lastLabel = pts.length ? fmtTime(pts[pts.length - 1].ts) : "";

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-neutral-200">Response time</div>
        <div className="text-[11px] text-neutral-500">Recent</div>
      </div>

      {pts.length < 2 ? (
        <div className="mt-3 text-xs text-neutral-500">Not enough data yet.</div>
      ) : (
        <div className="mt-2 flex gap-3">
          {/* Y-axis labels (outside SVG so they don't stretch) */}
          <div className="flex w-14 flex-col items-center justify-between text-[10px] text-neutral-500">
            <div className="tabular-nums">{max}ms</div>
            <div
              className="text-neutral-600"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              Resp. Time (ms)
            </div>
            <div className="tabular-nums">0ms</div>
          </div>

          <div className="min-w-0 flex-1">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="block h-[140px] w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label="Response time chart"
            >
              {/* subtle grid */}
              <line x1={pad} y1={baseY} x2={width - pad} y2={baseY} stroke="#262626" strokeWidth="1" />
              <line x1={pad} y1={pad} x2={width - pad} y2={pad} stroke="#1f1f1f" strokeWidth="1" />

              {/* area + line segments */}
              {segments.map((s) => (
                <g key={`${s.ok ? "up" : "down"}-${s.start}-${s.end}`}> 
                  <path
                    d={areaPathForRange(s.start, s.end)}
                    fill={s.ok ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"}
                    stroke="none"
                  />
                  <path
                    d={linePathForRange(s.start, s.end)}
                    fill="none"
                    stroke={s.ok ? "#22c55e" : "#ef4444"}
                    strokeWidth="2"
                  />
                </g>
              ))}
            </svg>
          </div>
        </div>
      )}

      {pts.length >= 2 ? (
        <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-600">
          <span>{firstLabel}</span>
          <span>{midLabel}</span>
          <span>{lastLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

function StatRow({ label, sublabel, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-neutral-200">{label}</div>
        {sublabel ? <div className="text-xs text-neutral-500">{sublabel}</div> : null}
      </div>
      <div className="shrink-0 text-sm font-semibold text-neutral-100 tabular-nums">{value}</div>
    </div>
  );
}

function MonitorStats({ checks }) {
  const stats = useMemo(() => {
    const rows = checks || [];
    const last = rows[0] || null;
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();

    function inWindow(ms) {
      return rows.filter((c) => {
        const t = new Date(c.ts).getTime();
        return Number.isFinite(t) && now - t <= ms;
      });
    }

    function avgLatency(list) {
      const xs = list.filter((c) => c.latency_ms != null).map((c) => Number(c.latency_ms));
      if (!xs.length) return null;
      return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    }

    function uptimePct(list) {
      if (!list.length) return null;
      const ok = list.filter((c) => c.ok === 1).length;
      return (ok / list.length) * 100;
    }

    const w24 = inWindow(24 * 60 * 60 * 1000);
    const w30d = inWindow(30 * 24 * 60 * 60 * 1000);

    return {
      currentMs: last?.latency_ms != null ? Number(last.latency_ms) : null,
      avg24: avgLatency(w24),
      up24: uptimePct(w24),
      up30: uptimePct(w30d)
    };
  }, [checks]);

  const fmtPct = (v) => (v == null ? "—" : `${v.toFixed(1)}%`);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="grid gap-4">
        <StatRow label="Response" sublabel="(Current)" value={stats.currentMs != null ? `${stats.currentMs} ms` : "—"} />
        <StatRow label="Avg. Response" sublabel="(24-hour)" value={stats.avg24 != null ? `${stats.avg24} ms` : "—"} />
        <StatRow label="Uptime" sublabel="(24-hour)" value={fmtPct(stats.up24)} />
        <StatRow label="Uptime" sublabel="(30-day)" value={fmtPct(stats.up30)} />
      </div>
    </div>
  );
}

function LogsModal({ open, onClose, pm2Name }) {
  const [tab, setTab] = useState("out");
  const [lines, setLines] = useState(200);
  const [auto, setAuto] = useState(true);
  const [data, setData] = useState({ out: [], err: [] });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [expandedKey, setExpandedKey] = useState("");
  const scrollRef = useRef(null);

  function parseMaybeJson(line) {
    try {
      const s = String(line || "").trim();
      if (!s) return null;
      if (s[0] !== "{" && s[0] !== "[") return null;
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function fmtTs(msOrIso) {
    try {
      // fastify logger uses epoch ms in "time"
      const d = typeof msOrIso === "number" ? new Date(msOrIso) : new Date(msOrIso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  }

  function statusTone(code) {
    if (code == null) return "bg-neutral-800/50 text-neutral-300 border-neutral-700";
    if (code >= 200 && code < 400) return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
    if (code >= 400 && code < 500) return "bg-amber-500/15 text-amber-200 border-amber-500/30";
    return "bg-rose-500/15 text-rose-200 border-rose-500/30";
  }

  function jsonSyntaxHighlight(json) {
    const esc = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return esc.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"\s*:)|("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/g,
      (m, key, _a, str, _b, boolNull) => {
        if (key) return `<span class="text-amber-200">${m}</span>`;
        if (str) return `<span class="text-emerald-200">${m}</span>`;
        if (boolNull) return `<span class="text-fuchsia-200">${m}</span>`;
        return `<span class="text-sky-200">${m}</span>`;
      }
    );
  }

  async function refresh() {
    if (!pm2Name) return;
    setLoading(true);
    setErr("");
    try {
      const d = await getPm2Logs(pm2Name, lines);
      setData({ out: d.out || [], err: d.err || [] });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setExpandedKey("");
    refresh();
    if (!auto) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pm2Name, lines, auto]);

  const active = tab === "out" ? data.out : data.err;

  const rows = useMemo(() => {
    const linesArr = Array.isArray(active) ? active : [];

    // Merge fastify "incoming request" + "request completed" by reqId
    const byReqId = new Map();
    const order = [];

    function ensure(id) {
      if (!byReqId.has(id)) {
        byReqId.set(id, { reqId: id, firstIndex: Infinity });
        order.push(id);
      }
      return byReqId.get(id);
    }

    const out = [];

    for (let i = 0; i < linesArr.length; i++) {
      const raw = linesArr[i];
      const obj = parseMaybeJson(raw);
      const rid = obj?.reqId;

      if (!obj || !rid) {
        out.push({ kind: "raw", key: `${tab}:raw:${i}`, raw: String(raw) });
        continue;
      }

      const row = ensure(rid);
      row.firstIndex = Math.min(row.firstIndex, i);

      if (obj.req) {
        row.inTime = obj.time ?? row.inTime;
        row.method = obj.req.method ?? row.method;
        row.url = obj.req.url ?? row.url;
      }

      if (obj.res || obj.responseTime != null) {
        row.doneTime = obj.time ?? row.doneTime;
        row.status = obj.res?.statusCode ?? row.status;
        row.responseTime = obj.responseTime ?? row.responseTime;
      }

      // keep latest messages (optional)
      row.msg = obj.msg ?? row.msg;
    }

    // Build display rows in original-ish order, but one line per reqId
    const merged = [];
    const seen = new Set();
    for (const id of order) {
      if (seen.has(id)) continue;
      seen.add(id);
      const r = byReqId.get(id);
      if (!r) continue;
      merged.push({ kind: "req", key: `${tab}:req:${id}`, req: r });
    }

    // Prefer merged rows; if there are lots of non-json lines, include them too.
    return merged.length ? merged : out;
  }, [active, tab]);

  useEffect(() => {
    if (!open) return;
    if (!auto) return;
    const el = scrollRef.current;
    if (!el) return;
    // next tick so the DOM has rendered
    const t = setTimeout(() => {
      try {
        el.scrollTop = el.scrollHeight;
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(t);
  }, [open, auto, tab, rows.length]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-100">Logs</div>
            <div className="truncate text-xs text-neutral-500">pm2: {pm2Name}</div>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-1 text-xs">
              <button
                className={clsx(
                  "rounded-md px-3 py-1",
                  tab === "out" ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"
                )}
                onClick={() => setTab("out")}
              >
                stdout
              </button>
              <button
                className={clsx(
                  "rounded-md px-3 py-1",
                  tab === "err" ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"
                )}
                onClick={() => setTab("err")}
              >
                stderr
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs text-neutral-400">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                Auto
              </label>
              <label className="flex items-center gap-2">
                Lines
                <input
                  type="number"
                  min={50}
                  max={2000}
                  value={lines}
                  onChange={(e) => setLines(Number(e.target.value || 200))}
                  className="w-24 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                />
              </label>
              <button
                className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                onClick={refresh}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
          </div>

          {err ? (
            <div className="rounded-lg border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              {err}
            </div>
          ) : null}

          <div ref={scrollRef} className="h-[420px] overflow-auto rounded-xl border border-neutral-800 bg-black/30 p-2 text-[12px] leading-5 text-neutral-200">
            {rows?.length ? (
              <div className="grid gap-1">
                {rows.map((row) => {
                  if (row.kind === "raw") {
                    return (
                      <div key={row.key} className="rounded-lg px-2 py-1 font-mono text-neutral-200">
                        <span className="text-neutral-500">•</span> {row.raw}
                      </div>
                    );
                  }

                  const r = row.req;
                  const ts = r.inTime ?? r.doneTime;
                  const endpoint = r.method && r.url ? `${r.method} ${r.url}` : (r.url || "request");
                  const status = r.status;
                  const rt = r.responseTime;
                  const rtMs = typeof rt === "number" ? `${Math.round(rt)}ms` : (rt != null ? `${rt}ms` : "—");

                  const expanded = expandedKey === row.key;

                  // Minimal one-liner: time + method/url + rt + status
                  return (
                    <div key={row.key} className="rounded-xl border border-neutral-900/60 bg-neutral-950/20">
                      <button
                        className="w-full rounded-xl px-3 py-2 text-left"
                        onClick={() => setExpandedKey(expanded ? "" : row.key)}
                        title="Click to toggle raw JSON"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-neutral-500 tabular-nums">{fmtTs(ts) || ""}</span>
                              <span className="truncate font-mono text-[12px] text-neutral-100">{endpoint}</span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span
                                className={clsx(
                                  "rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums",
                                  statusTone(status)
                                )}
                              >
                                {status ?? "—"}
                              </span>
                              <span className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300 tabular-nums">
                                {rtMs}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>

                      {expanded ? (
                        <div className="border-t border-neutral-900/60 px-3 py-2">
                          <pre
                            className="overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[12px] leading-5 text-neutral-200"
                            dangerouslySetInnerHTML={{
                              __html: jsonSyntaxHighlight(JSON.stringify(r, null, 2))
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-2 py-3 text-neutral-500">No logs.</div>
            )}
          </div>

          <div className="text-[11px] text-neutral-600">Tip: add pm2Name to a monitor to enable this button.</div>
        </div>
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

  const [logsOpen, setLogsOpen] = useState(false);
  const [logsPm2Name, setLogsPm2Name] = useState("");

  const [addOpen, setAddOpen] = useState(false);
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
  }, []);

  useEffect(() => {
    if (!selected) return;
    // pull more so we can compute 24h + 30d stats
    getChecks(selected.id, 500)
      .then((d) => setChecks(d.checks || []))
      .catch(() => setChecks([]));
  }, [selected]);

  const selectedMonitor = useMemo(() => {
    if (!selected) return null;
    return monitors.find((m) => m.id === selected.id) || null;
  }, [selected, monitors]);

  async function createMonitor() {
    setLoading(true);
    setErr("");
    try {
      await addMonitor({ name, url, intervalSec: Number(interval) });
      setName("");
      setUrl("");
      setIntervalSec(60);
      setAddOpen(false);
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
      <LogsModal open={logsOpen} onClose={() => setLogsOpen(false)} pm2Name={logsPm2Name} />

      {/* Add Monitor Modal */}
      {addOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={() => setAddOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">Add monitor</div>
                <div className="text-xs text-neutral-500">Create a new HTTP monitor</div>
              </div>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                onClick={() => setAddOpen(false)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <form
              className="grid gap-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                createMonitor();
              }}
            >
              <div className="grid gap-2">
                <label className="text-xs text-neutral-400">Name</label>
                <input
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-600"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Bookmarks Backend"
                  required
                  autoFocus
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

              {err ? (
                <div className="rounded-lg border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                  {err}
                </div>
              ) : null}

              <div className="mt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:opacity-60"
                  disabled={loading}
                  type="submit"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs text-neutral-400">uptime-monitor</div>
            <h1 className="text-2xl font-semibold tracking-tight">Monitors</h1>
            <p className="mt-1 text-sm text-neutral-400">Minimal: checks, charts, pm2 logs.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800"
              onClick={() => setAddOpen(true)}
              disabled={loading}
              title="Add monitor"
            >
              <Plus size={16} />
              Add
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </header>

        <main className="mt-6">
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
                      <div className="flex items-center gap-1">
                        {m.pm2_name ? (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setLogsPm2Name(m.pm2_name);
                              setLogsOpen(true);
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
                            title="Logs (pm2)"
                          >
                            <Terminal size={16} />
                          </div>
                        ) : null}

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
                <MonitorStats checks={checks} />
                <LatencyChart checks={checks} />

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
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
