// src/predictionApi.js
// API client for Marietta Traffic Prediction Engine

const API_BASE_URL = process.env.REACT_APP_PREDICTION_API_URL || "http://localhost:8000";

/**
 * Fetch traffic predictions from the prediction engine
 * @param {Object} params - Prediction parameters
 * @param {number} params.dayOfWeek - Day of week (0=Monday, 6=Sunday)
 * @param {number} params.hour - Hour of day (0-23)
 * @param {string} params.dayType - Day type: "normal", "holiday", or "special_event"
 * @returns {Promise<Object>} GeoJSON FeatureCollection with predictions
 */
export async function fetchPredictions({ dayOfWeek, hour, dayType = "normal" }) {
  if (dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error("dayOfWeek must be between 0 and 6");
  }
  if (hour < 0 || hour > 23) {
    throw new Error("hour must be between 0 and 23");
  }
  if (!["normal", "holiday", "special_event"].includes(dayType)) {
    throw new Error("dayType must be 'normal', 'holiday', or 'special_event'");
  }

  const url = new URL(`${API_BASE_URL}/api/predict`);
  url.searchParams.set("day_of_week", dayOfWeek);
  url.searchParams.set("hour", hour);
  url.searchParams.set("day_type", dayType);

  try {
    const res = await fetch(url.toString());

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Prediction API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data;
  } catch (error) {
    if (error.message.includes("fetch")) {
      throw new Error(
        "Cannot connect to prediction API. Make sure the backend is running at " + API_BASE_URL
      );
    }
    throw error;
  }
}

/**
 * Check health status of the prediction API
 * @returns {Promise<Object>} Health status
 */
export async function checkHealth() {
  const url = `${API_BASE_URL}/api/health`;

  try {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Health check failed: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
    };
  }
}

/**
 * Get database statistics
 * @returns {Promise<Object>} Database statistics
 */
export async function fetchStats() {
  const url = `${API_BASE_URL}/api/stats`;

  try {
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Stats API error ${res.status}: ${text}`);
    }

    return await res.json();
  } catch (error) {
    if (error.message.includes("fetch")) {
      throw new Error(
        "Cannot connect to prediction API. Make sure the backend is running."
      );
    }
    throw error;
  }
}
