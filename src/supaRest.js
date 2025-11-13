// src/supaRest.js
const baseUrl = process.env.REACT_APP_SUPABASE_URL;    
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;  

function headers() {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };
}

function tableForZip(zip) {
  const z = String(zip || "").replace(/\D/g, "").slice(0, 5);
  if (z.length !== 5) throw new Error("Invalid ZIP");
  return `readings_${z}_joined`;
}

// Fetch from the PostgREST API (Supabase API Gateway)
export async function fetchJoinedReadings({
  zip, 
  hours,                // number (optional) – fallback if start/end not given
  start,                // ISO string "YYYY-MM-DDTHH:mm:ssZ"
  end,                  // ISO string "YYYY-MM-DDTHH:mm:ssZ" (exclusive)
  offset = 0,
  pageSize = 2000,
  order = "measurement_tstamp.desc",
} = {}) {
  // Build time window
  /*
  let sinceIso = null;
  if (!start || !end) {
    const h = Number.isFinite(hours) ? hours : 24;     // sensible default
    sinceIso = new Date(Date.now() - h * 3600 * 1000).toISOString();
  }
  */
  
  const table = tableForZip(zip);
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  //const url = new URL(`${baseUrl}/rest/v1/readings_30068_joined`);

  // Columns
  url.searchParams.set(
    "select",
    "tmc_code,measurement_tstamp,speed,confidence,road,direction,start_latitude,start_longitude"
  );

  // Time filters
  if (start && end) {
    // PostgREST supports multiple filters on same column; use append for the second one
    url.searchParams.append("measurement_tstamp", `gte.${start}`);
    url.searchParams.append("measurement_tstamp", `lt.${end}`);
  } else if (hours) {
    const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    url.searchParams.set("measurement_tstamp", `gte.${sinceIso}`);
  }

  url.searchParams.set("order", order);

  const res = await fetch(url.toString(), { 
    headers: { ...headers(), Range: `${offset}-${offset + pageSize - 1}`, Prefer: "count=exact" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase REST error ${res.status}: ${text}`);
  }

  const rows = await res.json();
  return { rows };
}

// All pages
export async function fetchJoinedReadingsAll({
  zip,
  start,
  end,
  hours,
  pageSize = 2000, // your Supabase row cap
  signal,
}) {
  // --- build table name or filter ---
  const z = String(zip || "").match(/\d{5}/)?.[0];
  if (!z) throw new Error("Invalid ZIP");
  const table = `readings_${z}_joined`;

  // --- build URL ---
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  url.searchParams.set(
    "select",
    "tmc_code,measurement_tstamp,speed,confidence,road,direction,start_latitude,start_longitude"
  );

  if (start && end) {
    url.searchParams.append("measurement_tstamp", `gte.${start}`);
    url.searchParams.append("measurement_tstamp", `lt.${end}`);
  } else if (hours) {
    const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    url.searchParams.set("measurement_tstamp", `gte.${sinceIso}`);
  }

  url.searchParams.set("order", "measurement_tstamp.asc");

  // --- paginate until all rows fetched ---
  const out = [];
  let offset = 0;

  while (true) {
    const res = await fetch(url.toString(), {
      headers: {
        ...headers(),
        Range: `${offset}-${offset + pageSize - 1}`,
        Prefer: "count=exact",
      },
      signal,
    });

    if (!res.ok) throw new Error(`Supabase REST error ${res.status}: ${await res.text()}`);

    const rows = await res.json();
    if (!rows.length) break;

    out.push(...rows);

    // stop when fewer rows than a full page
    if (rows.length < pageSize) break;

    offset += rows.length;
  }

  return out;
}

// quick grab for kpi cards
export async function fetchSpeedStats({ zip, start, end }) {
  const url = `${baseUrl}/rest/v1/rpc/get_speed_stats_by_zip`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...headers(),
      "Content-Type": "application/json" },
      body: JSON.stringify({ p_zip: String(zip), start_ts: start, end_ts: end }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase RPC error ${res.status}: ${text}`);
  }

  return res.json(); //just 1 row of data usually with stats 
}