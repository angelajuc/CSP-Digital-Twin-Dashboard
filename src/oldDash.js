import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from "recharts";
import "./dashboard.css";
import { fetchJoinedReadings } from "./supaRest";

// Simple UI atoms to mimic your layout without shadcn
const Card = ({ children }) => <div className="card">{children}</div>;
const CardHeader = ({ children }) => <div className="card-header">{children}</div>;
const CardTitle = ({ children }) => <div className="card-title">{children}</div>;
const CardContent = ({ children }) => <div className="card-content">{children}</div>;
const Button = (props) => <button {...props} className={`btn ${props.className || ""}`} />;
const Input = (props) => <input {...props} className={`input ${props.className || ""}`} />;

function SidebarItem({ label, active }) {
  return (
    <button className={`side-item ${active ? "active" : ""}`}>
      <span>{label}</span>
    </button>
  );
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [range, setRange] = useState("7d"); // "7d" | "30d" | "90d"
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Fetch data from Supabase REST
  useEffect(() => {
    const hours = range === "7d" ? 24 * 7 : range === "30d" ? 24 * 30 : 24 * 90;
    setLoading(true);
    setErr(null);
    fetchJoinedReadings({ hours })
      .then((data) => setRows(data || []))
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [range]);

  // KPIs & derived series
  const speeds = useMemo(
    () => rows.map(r => r.speed).filter((v) => Number.isFinite(v)),
    [rows]
  );
  const confs = useMemo(
    () => rows.map(r => r.confidence).filter((v) => Number.isFinite(v)),
    [rows]
  );
  const kpi = useMemo(() => {
    const avg = speeds.length ? speeds.reduce((a,b)=>a+b,0)/speeds.length : 0;
    const min = speeds.length ? Math.min(...speeds) : 0;
    const max = speeds.length ? Math.max(...speeds) : 0;
    const avgConf = confs.length ? confs.reduce((a,b)=>a+b,0)/confs.length : 0;
    return { avg, min, max, avgConf };
  }, [speeds, confs]);

  // Histogram-like buckets (rough)
  const histogram = useMemo(() => {
    if (!speeds.length) return [];
    const min = Math.min(...speeds), max = Math.max(...speeds);
    const bins = 30;
    const width = (max - min) / (bins || 1) || 1;
    const counts = Array(bins).fill(0);
    for (const s of speeds) {
      const idx = Math.min(bins - 1, Math.floor((s - min) / width));
      counts[idx] += 1;
    }
    return Array.from({ length: bins }, (_, i) => ({
      bin: Math.round(min + i * width),
      count: counts[i],
    }));
  }, [speeds]);

  // Hour-of-day average
  const hourly = useMemo(() => {
    const acc = new Map(); // hour -> { sum, n }
    for (const r of rows) {
      if (!Number.isFinite(r.speed) || !r.measurement_tstamp) continue;
      const h = new Date(r.measurement_tstamp).getHours();
      const v = acc.get(h) || { sum: 0, n: 0 };
      v.sum += r.speed; v.n += 1; acc.set(h, v);
    }
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      speed: acc.get(h) ? acc.get(h).sum / acc.get(h).n : 0,
    }));
  }, [rows]);

  // Search + table paging
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.tmc_code && r.tmc_code.toLowerCase().includes(q)) ||
        (r.road && r.road.toLowerCase().includes(q)) ||
        (r.direction && r.direction.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  return (
    <div className="dash-root">
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <Button onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sidebar">☰</Button>
          <div className="brand">
            <div className="brand-dot" />
            <span className="brand-name">TMC Dashboard</span>
          </div>

          <div className="topbar-right">
            <div className="search-wrap">
              <Input
                placeholder="Search TMC / road / dir..."
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="grid">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? "" : "hidden-md"}`}>
          <nav className="nav">
            <SidebarItem label="Overview" active />
            <SidebarItem label="Analytics" />
            <SidebarItem label="Settings" />
          </nav>

          <div className="filters">
            <p className="filters-title">Filters</p>
            <div className="filters-rows">
              <select value={range} onChange={(e)=>{ setPage(1); setRange(e.target.value); }}>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
            {err && <div className="error">Error: {err}</div>}
            {loading && <div className="muted">Loading…</div>}
          </div>
        </aside>

        {/* Main */}
        <main className="main">
          {/* KPI Cards */}
          <section className="kpi-grid">
            {[
              { label: "Average speed", value: `${kpi.avg.toFixed(1)} mph`, sub: `Min ${kpi.min.toFixed(1)} / Max ${kpi.max.toFixed(1)}` },
              { label: "Avg confidence", value: kpi.avgConf.toFixed(2), sub: `Range ${range}` },
              { label: "Rows loaded", value: filtered.length.toLocaleString(), sub: "After filters" },
              { label: "Table page", value: `${page} / ${totalPages}`, sub: `${pageSize} per page` },
            ].map((k) => (
              <motion.div key={k.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                <Card>
                  <CardHeader><CardTitle>{k.label}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="kpi-value">{k.value}</div>
                    <div className="kpi-sub">{k.sub}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </section>

          {/* Charts */}
          <section className="charts">
            <Card className="chart-2w">
              <CardHeader><CardTitle>Avg Speed by Hour ({range})</CardTitle></CardHeader>
              <CardContent className="chart-h">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="speed" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Speed Distribution</CardTitle></CardHeader>
              <CardContent className="chart-h">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogram} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bin" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </section>

          {/* Table */}
          <section className="table-sec">
            <Card>
              <CardHeader className="table-head">
                <CardTitle>Recent Readings</CardTitle>
                <div className="table-search">
                  <Input
                    placeholder="Quick search"
                    value={search}
                    onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>TMC</th>
                        <th>Road</th>
                        <th>Dir</th>
                        <th>Timestamp</th>
                        <th className="right">Speed</th>
                        <th>Conf</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((o, i) => (
                        <tr key={`${o.tmc_code}-${i}`}>
                          <td className="bold">{o.tmc_code}</td>
                          <td>{o.road}</td>
                          <td>{o.direction}</td>
                          <td>{o.measurement_tstamp ? new Date(o.measurement_tstamp).toLocaleString() : ""}</td>
                          <td className="right">{Number.isFinite(o.speed) ? o.speed.toFixed(1) : "-"}</td>
                          <td>{Number.isFinite(o.confidence) ? o.confidence.toFixed(2) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="pager">
                  <p className="muted">
                    Showing <span className="bold">{(page - 1) * pageSize + 1}</span>–
                    <span className="bold">{Math.min(page * pageSize, filtered.length)}</span> of
                    <span className="bold"> {filtered.length}</span>
                  </p>
                  <div className="pager-ctrls">
                    <Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                    <div className="muted">Page <span className="bold">{page}</span> / {totalPages}</div>
                    <Button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}
