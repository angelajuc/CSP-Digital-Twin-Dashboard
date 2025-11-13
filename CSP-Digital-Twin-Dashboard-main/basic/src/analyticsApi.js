// src/analyticsApi.js
// API client for Analytics Dashboard (DuckDB backend)

const API_BASE_URL = process.env.REACT_APP_ANALYTICS_API_URL || "http://localhost:8000";

/**
 * Fetch paginated traffic readings with location data
 * @param {Object} params - Query parameters
 * @param {string} params.zipcode - ZIP code (required)
 * @param {string} params.start - Start timestamp (ISO format, optional)
 * @param {string} params.end - End timestamp (ISO format, optional)
 * @param {number} params.hours - Hours back from now (optional)
 * @param {number} params.offset - Pagination offset (default: 0)
 * @param {number} params.limit - Page size (default: 2000)
 * @param {string} params.order - Sort order: "asc" or "desc" (default: "desc")
 * @param {AbortSignal} params.signal - Abort signal for cancellation
 * @returns {Promise<Object>} Response with rows, total_count, and page_info
 */
export async function fetchAnalyticsReadings({
  zipcode,
  start = null,
  end = null,
  hours = null,
  offset = 0,
  limit = 2000,
  order = "desc",
  signal = null,
}) {
  if (!zipcode) {
    throw new Error("zipcode is required");
  }

  const url = new URL(`${API_BASE_URL}/api/analytics/readings`);
  url.searchParams.set("zipcode", zipcode);

  if (start && end) {
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
  } else if (hours) {
    url.searchParams.set("hours", hours);
  }

  url.searchParams.set("offset", offset);
  url.searchParams.set("limit", limit);
  url.searchParams.set("order", order);

  try {
    const res = await fetch(url.toString(), { signal });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Analytics API error ${res.status}: ${text}`);
    }

    return await res.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error; // Re-throw abort errors
    }
    if (error.message.includes("fetch")) {
      throw new Error(
        "Cannot connect to analytics API. Make sure the backend is running at " + API_BASE_URL
      );
    }
    throw error;
  }
}

/**
 * Fetch all traffic readings across multiple pages
 * @param {Object} params - Query parameters
 * @param {string} params.zipcode - ZIP code (required)
 * @param {string} params.start - Start timestamp (optional)
 * @param {string} params.end - End timestamp (optional)
 * @param {number} params.hours - Hours back from now (optional)
 * @param {number} params.pageSize - Page size (default: 2000)
 * @param {AbortSignal} params.signal - Abort signal for cancellation
 * @returns {Promise<Array>} Array of all traffic readings
 */
export async function fetchAnalyticsReadingsAll({
  zipcode,
  start = null,
  end = null,
  hours = null,
  pageSize = 2000,
  signal = null,
}) {
  const allRows = [];
  let offset = 0;

  while (true) {
    const response = await fetchAnalyticsReadings({
      zipcode,
      start,
      end,
      hours,
      offset,
      limit: pageSize,
      order: "asc", // Ascending order for consistency
      signal,
    });

    if (!response.rows || response.rows.length === 0) {
      break;
    }

    allRows.push(...response.rows);

    // Stop if we've fetched all data
    if (!response.page_info.has_more) {
      break;
    }

    offset += response.rows.length;
  }

  return allRows;
}

/**
 * Fetch aggregated statistics for KPI cards
 * @param {Object} params - Query parameters
 * @param {string} params.zipcode - ZIP code (required)
 * @param {string} params.start - Start timestamp (optional)
 * @param {string} params.end - End timestamp (optional)
 * @param {number} params.hours - Hours back from now (optional)
 * @returns {Promise<Object>} Statistics object with avg_speed, min_speed, max_speed, avg_confidence, record_count
 */
export async function fetchAnalyticsStats({ zipcode, start = null, end = null, hours = null }) {
  if (!zipcode) {
    throw new Error("zipcode is required");
  }

  const url = new URL(`${API_BASE_URL}/api/analytics/stats`);
  url.searchParams.set("zipcode", zipcode);

  if (start && end) {
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
  } else if (hours) {
    url.searchParams.set("hours", hours);
  }

  try {
    const res = await fetch(url.toString());

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Analytics stats error ${res.status}: ${text}`);
    }

    return await res.json();
  } catch (error) {
    if (error.message.includes("fetch")) {
      throw new Error(
        "Cannot connect to analytics API. Make sure the backend is running."
      );
    }
    throw error;
  }
}

/**
 * Fetch hourly aggregated data for charts
 * @param {Object} params - Query parameters
 * @param {string} params.zipcode - ZIP code (required)
 * @param {string} params.start - Start timestamp (optional)
 * @param {string} params.end - End timestamp (optional)
 * @param {number} params.hours - Hours back from now (optional)
 * @returns {Promise<Object>} Response with hourly array [{hour, avg_speed, count}]
 */
export async function fetchAnalyticsHourly({ zipcode, start = null, end = null, hours = null }) {
  if (!zipcode) {
    throw new Error("zipcode is required");
  }

  const url = new URL(`${API_BASE_URL}/api/analytics/hourly`);
  url.searchParams.set("zipcode", zipcode);

  if (start && end) {
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
  } else if (hours) {
    url.searchParams.set("hours", hours);
  }

  try {
    const res = await fetch(url.toString());

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Analytics hourly error ${res.status}: ${text}`);
    }

    return await res.json();
  } catch (error) {
    if (error.message.includes("fetch")) {
      throw new Error(
        "Cannot connect to analytics API. Make sure the backend is running."
      );
    }
    throw error;
  }
}
