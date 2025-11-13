import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from "recharts";
import "./dashboard.css";
import { fetchJoinedReadings, fetchSpeedStats } from "./supaRest";
import { fetchJoinedReadingsAll } from "./supaRest";
import cityLogo from "./assets/cityLogo.png";
import MapView from "./Map";
import PredictionView from "./PredictionView";

// Simple UI atoms to mimic your layout without shadcn
/*
const Card = ({ children }) => <div className="card">{children}</div>;
const CardHeader = ({ children }) => <div className="card-header">{children}</div>;
const CardTitle = ({ children }) => <div className="card-title">{children}</div>;
const CardContent = ({ children }) => <div className="card-content">{children}</div>;
*/
const Button = (props) => <button {...props} className={`btn ${props.className || ""}`} />;
const Input = (props) => <input {...props} className={`input ${props.className || ""}`} />;


const Card = ({ children, className = "", ...props }) => (
  <div className={`card ${className}`} {...props}>{children}</div>
);
const CardHeader = ({ children, className = "", ...props }) => (
  <div className={`card-header ${className}`} {...props}>{children}</div>
);
const CardTitle = ({ children, className = "", ...props }) => (
  <div className={`card-title ${className}`} {...props}>{children}</div>
);
const CardContent = ({ children, className = "", ...props }) => (
  <div className={`card-content ${className}`} {...props}>{children}</div>
);

function SidebarItem({ label, active, onClick}) {
  return (
    <button
      className={`side-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
    </button>
  );
}

function minMax(arr) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return { min: 0, max: 0 };
  return { min, max };
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [range, setRange] = useState(""); // "7d" | "30d" | "90d"
  const [selectedDate, setSelectedDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [kpi, setKpi] = useState({ avg: 0, min: 0, max: 0, avgConf: 0, });
  const [zip, setZip] = useState("30068"); // default zip
  const pageSize = 12;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);


  const RANGE_OPTIONS = [
    { value: "4h",  label: "4 hours" },
    { value: "8h",  label: "8 hours" },
    { value: "24h", label: "24 hours" },
    { value: "7d",  label: "1 week" },
    { value: "30d", label: "1 month" },
  ];

  const rangeMap = {
    "4h": 4,
    "8h": 8,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };

  const ZIPCODES = [
    { value: "30068", label: "30068" },
    { value: "30067", label: "30067" },
    { value: "30066", label: "30066" },
    { value: "30064", label: "30064" },
    { value: "30062", label: "30062" },
    { value: "30060", label: "30060" },
    { value: "30008", label: "30008" }
  ];

  // Fetch data from Supabase REST
  useEffect(() => {
    //const hours = range === "7d" ? 24 * 7 : range === "30d" ? 24 * 30 : 24 * 90;
    //const hours = rangeMap[range] ?? 24 * 30;

    const hours = rangeMap[range] ?? 24 * 30;
    setLoading(true);
    setErr(null);
    // setRows([]);

    const ctrl = new AbortController();

    (async () => {
    try {
      let data = [];

      let kpiData = { avg: 0, min: 0, max: 0, avgConf: 0 };

      if (selectedDate) {
        const [y, m, d] = selectedDate.split("-").map(Number);

        const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
        const end   = new Date(start);

        switch (range) {
          case "4h":
            end.setUTCHours(end.getUTCHours() + 4);
            break;
          case "8h":
            end.setUTCHours(end.getUTCHours() + 8);
            break;
          case "24h":
            end.setUTCDate(end.getUTCDate() + 1);
            break;
          case "7d":
            end.setUTCDate(end.getUTCDate() + 7);
            break;
          case "30d":
            end.setUTCDate(end.getUTCDate() + 30);
            break;
          default:
            end.setUTCDate(end.getUTCDate() + 1);
        }

        const stats = await fetchSpeedStats({
            zip,
            start: start.toISOString(),
            end: end.toISOString(),
        });

        if (stats && stats.length > 0) {
            const s = stats[0];
              kpiData = {
                avg: Number(s.avg_speed ?? 0),
                min: Number(s.min_speed ?? 0),
                max: Number(s.max_speed ?? 0),
                avgConf: Number(s.avg_confidence ?? 0),
              };
        }

        // Preferred: server-side filtering
        data = await fetchJoinedReadingsAll({
          zip,
          start: start.toISOString(),
          end: end.toISOString(),
          pageSize: 2000, // match your cap
          signal: ctrl.signal,
        });
      } else {
        // no date chosen - fallback just use "last X hours"
        data = await fetchJoinedReadings({ hours: rangeMap[range] ?? 24, });
      }

      setKpi(kpiData);
      setRows(data || []);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  })();

    return () => ctrl.abort();
}, [zip, range, selectedDate]); 
    
/*
    fetchJoinedReadings({ hours })
      .then((data) => setRows(data || []))
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [range]);

*/
   /*
   (async () => {
      try {
        const pageSize = 2000;
        let offset = 0;
        while (true) {
          const batch = await fetchJoinedReadingsPage({ hours, limit: pageSize, offset });
          if (batch.length === 0) break;
          setRows(prev => [...prev, ...batch]);
          if (batch.length < pageSize) break;
          offset += pageSize;
        }
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [range]);
  */

  // KPIs & derived series
  const speeds = useMemo(
    () => rows.map(r => r.speed).filter((v) => Number.isFinite(v)),
    [rows]
  );
  const confs = useMemo(
    () => rows.map(r => r.confidence).filter((v) => Number.isFinite(v)),
    [rows]
  );
  /*
  const kpi = useMemo(() => {
    const avg = speeds.length ? speeds.reduce((a,b)=>a+b,0)/speeds.length : 0;
    const min = speeds.length ? Math.min(...speeds) : 0;
    const max = speeds.length ? Math.max(...speeds) : 0;
    const avgConf = confs.length ? confs.reduce((a,b)=>a+b,0)/confs.length : 0;
    return { avg, min, max, avgConf };
  }, [speeds, confs]);
  */
  /*
  const kpi = useMemo(() => {
   const avg = speeds.length ? speeds.reduce((a,b)=>a+b,0)/speeds.length : 0;
   const { min, max } = minMax(speeds);
   const avgConf = confs.length ? confs.reduce((a,b)=>a+b,0)/confs.length : 0;
   return { avg, min, max, avgConf };
  }, [speeds, confs]);
  */

  // Histogram-like buckets (rough)
  //const histogram = useMemo(() => {
    //if (!speeds.length) return [];
    //const min = Math.min(...speeds), max = Math.max(...speeds);
  const histogram = useMemo(() => {
    if (!speeds.length) return [];
    const { min, max } = minMax(speeds);
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

  const formatHour = (h) => {
  const hr = Number(h) % 24;
  const suffix = hr < 12 ? "am" : "pm";
  const hour12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${hour12}${suffix}`;
};

const tooltipHour = (h) => {
  const hr = Number(h) % 24;
  const suffix = hr < 12 ? "AM" : "PM";
  const hour12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${hour12}:00 ${suffix}`;
};

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
          <div className="brand" onClick={() => window.location.reload()} style={{ cursor: "pointer" }}>
            <img
                src={cityLogo}
                alt="City of Marietta Logo"
                className="brand-logo"
            />
            <span className="brand-name">Digital Twin Dashboard</span>
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
        <aside className={"sidebar"}> 
          <nav className="nav">
            <SidebarItem
                label="Overview"
                active={activeTab === "overview"}
                onClick={() => setActiveTab("overview")}
            />
            <SidebarItem
                label="Map"
                active={activeTab === "map"}
                onClick={() => setActiveTab("map")}

            />
            <SidebarItem
                label="Analytics"
                active={activeTab === "analytics"}
                onClick={() => setActiveTab("analytics")}
            />
            <SidebarItem
                label="Prediction"
                active={activeTab === "prediction"}
                onClick={() => setActiveTab("prediction")}
            />
            <SidebarItem
                label="Settings"
                active={activeTab === "settings"}
                onClick={() => setActiveTab("settings")}
            />
          </nav>
          

          <div className="filters">
            <p className="filters-title">Filter by zipcode, start date, and range</p>
            <div className="filters-rows">
              {/* ZIP */}
              <select
                value={zip}
                onChange={(e) => { setPage(1); setZip(e.target.value); }}
                aria-label="Select ZIP"
                >
                {ZIPCODES.map(z => (
                    <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </select>
              <select value={range} onChange={(e)=>{ setRange(e.target.value); if (!selectedDate) setSelectedDate(new Date().toISOString().slice(0,10)); // no date given will select given date right now
              }}>
                <option value="4h">4 hours</option>
                <option value="8h">8 hours</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
              </select>

              {/* Calendar input for October */}
                <input
                    className="date-picker"
                    type="date"
                    placeholder="Select a day in October"
                    value={selectedDate}
                    min="2025-10-01"
                    max="2025-10-31"
                    onChange={(e) => { setPage(1); setSelectedDate(e.target.value)}}
                />
            </div>
            {err && <div className="error">Error: {err}</div>}
            {loading && <div className="muted">Loading…</div>}
          </div>
        </aside>

        {/* Main */}
          <main className="main">
          {/* MAP VIEW */}
            {activeTab === "map" && (
                <div className="map-wrap">
                    <MapView rows={rows} />
                </div>
            )}
          
          {/* OVERVIEW VIEW */}
            {activeTab === "overview" && (
                <>

                    {/* KPI Cards */}
                    <section className="kpi-grid">
                        {[
                            { label: "Average speed", value: `${kpi.avg.toFixed(1)} mph`, sub: `Range ${range || "—"}` },
                            { label: "Avg confidence", value: kpi.avgConf.toFixed(2), sub: `Range ${range}` },
                            { label: "Min Speed", value: `${kpi.min.toFixed(1)} mph`, sub: "Selected window"},
                            { label: "Max Speed", value: `${kpi.max.toFixed(1)} mph`, sub: "Selected window"},
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
                                    <LineChart data={hourly} margin={{ top: 10, right: 10, left: 30, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="hour"
                                            domain={[0, 23]}
                                            type="number"
                                            tickFormatter={formatHour}
                                            ticks={[0,3,6,9,12,15,18,21]}
                                            label={{ value: "Time of day", position: "insideBottom", offset: -15 }}
                                        />
                                        <YAxis 
                                            domain={[0, 75]}
                                            tickFormatter={(v)=>`${v} mph`}
                                            label={{ value: "Speed", angle: -90, position: "insideLeft", dx: -25, dy: 25}}
                                        />
                                        <Tooltip 
                                            labelFormatter={tooltipHour}
                                            formatter={(value, name) =>
                                                name === "speed" ? [`${Number(value).toFixed(1)} mph`, "Avg speed"] : [value, name]
                                            }
                                        />
                                        <Line type="monotone" dataKey="speed" dot={false} strokeWidth={2} name="speed"/>
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader><CardTitle>Speed Distribution</CardTitle></CardHeader>
                            <CardContent className="chart-h">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={histogram} margin={{ top: 5, right: 10, left: 15, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis 
                                            dataKey="bin" 
                                            tickFormatter={(v)=>`${v}`}
                                            label={{ value: "Speed (MPH)", position: "insideBottom", offset: -10 }}
                                        />
                                        <YAxis 
                                            label={{ value: "Count", angle: -90, position: "insideLeft", dx: -10, dy: 25}}
                                        />
                                        <Tooltip 
                                            formatter={(val, name) => (name === "count" ? [val, "Count"] : [val, name])}
                                            labelFormatter={(v) => `${v} mph`}
                                        />
                                        <Bar dataKey="count" name="count" />
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
          </>
        )}

  {/* ANALYTICS VIEW */}
  {activeTab === "analytics" && (
    <section className="charts">
      {/* reuse your charts, or put analytics-only charts here */}
      <Card className="chart-2w">
        <CardHeader><CardTitle>Speed Distribution (Histogram)</CardTitle></CardHeader>
        <CardContent className="chart-h">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bin" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Avg Speed by Hour</CardTitle></CardHeader>
        <CardContent className="chart-h">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourly} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="speed" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </section>
  )}

  {/* PREDICTION VIEW */}
  {activeTab === "prediction" && (
    <PredictionView />
  )}

        </main>
      </div>
    </div>
  );
}
