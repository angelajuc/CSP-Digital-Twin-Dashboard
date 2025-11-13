import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { fetchPredictions } from "./predictionApi";
import MapView from "./Map";

// Reuse Card components from Dashboard
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
const Button = (props) => <button {...props} className={`btn ${props.className || ""}`} />;

export default function PredictionView() {
  // Form state
  const [selectedDate, setSelectedDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [selectedHour, setSelectedHour] = useState(8);
  const [dayType, setDayType] = useState("normal");

  // Data state
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Calculate day of week from selected date
  const dayOfWeek = useMemo(() => {
    const date = new Date(selectedDate + "T00:00:00");
    // JavaScript: 0=Sunday, 6=Saturday
    // API expects: 0=Monday, 6=Sunday
    const jsDay = date.getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  }, [selectedDate]);

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Format hour for display
  const formatHour = (h) => {
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? "AM" : "PM";
    return `${hour12}:00 ${ampm}`;
  };

  // Handle prediction request
  const handlePredict = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchPredictions({
        dayOfWeek,
        hour: selectedHour,
        dayType,
      });
      setPredictions(data);
    } catch (err) {
      setError(err.message);
      setPredictions(null);
    } finally {
      setLoading(false);
    }
  };

  // Transform GeoJSON to rows format for Map component
  const mapRows = useMemo(() => {
    if (!predictions || !predictions.features) return [];

    return predictions.features.map((feature) => {
      const props = feature.properties;
      const coords = feature.geometry.coordinates;

      return {
        tmc_code: props.tmc_code,
        road: props.road,
        direction: props.direction,
        speed: props.predicted_speed,
        confidence: props.confidence_mean,
        start_latitude: coords[0][1],
        start_longitude: coords[0][0],
        measurement_tstamp: null, // Not applicable for predictions
      };
    });
  }, [predictions]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!predictions || !predictions.features) {
      return { avg: 0, min: 0, max: 0, count: 0, confidence: 0 };
    }

    const speeds = predictions.features.map((f) => f.properties.predicted_speed);
    const confidences = predictions.features.map((f) => f.properties.confidence_mean);

    return {
      avg: speeds.reduce((a, b) => a + b, 0) / speeds.length,
      min: Math.min(...speeds),
      max: Math.max(...speeds),
      count: speeds.length,
      confidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
    };
  }, [predictions]);

  // Speed distribution for table
  const speedDistribution = useMemo(() => {
    if (!predictions || !predictions.features) {
      return { fast: 0, moderate: 0, slow: 0 };
    }

    const speeds = predictions.features.map((f) => f.properties.predicted_speed);
    return {
      fast: speeds.filter((s) => s > 40).length,
      moderate: speeds.filter((s) => s >= 25 && s <= 40).length,
      slow: speeds.filter((s) => s < 25).length,
    };
  }, [predictions]);

  return (
    <div style={{ padding: "1rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.8rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
          Traffic Prediction Simulator
        </h2>
        <p style={{ color: "#666" }}>
          Predict future traffic conditions based on historical patterns
        </p>
      </div>

      {/* Control Panel */}
      <Card style={{ marginBottom: "1.5rem" }}>
        <CardHeader>
          <CardTitle>Prediction Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
            {/* Date Picker */}
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
                Select Date
              </label>
              <input
                type="date"
                className="input"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" }}>
                Day: <strong>{dayNames[dayOfWeek]}</strong>
              </div>
            </div>

            {/* Hour Slider */}
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
                Select Hour: <strong>{formatHour(selectedHour)}</strong>
              </label>
              <input
                type="range"
                min="0"
                max="23"
                value={selectedHour}
                onChange={(e) => setSelectedHour(parseInt(e.target.value))}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#666" }}>
                <span>12 AM</span>
                <span>12 PM</span>
                <span>11 PM</span>
              </div>
            </div>

            {/* Day Type */}
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
                Day Type
              </label>
              <select
                className="input"
                value={dayType}
                onChange={(e) => setDayType(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="normal">Normal Day</option>
                <option value="holiday">Holiday</option>
                <option value="special_event">Special Event</option>
              </select>
              <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.25rem" }}>
                {dayType === "normal" && "Uses same day-of-week patterns"}
                {dayType === "holiday" && "Uses weekend traffic patterns"}
                {dayType === "special_event" && "Blends normal + holiday (50/50)"}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div style={{ marginTop: "1rem" }}>
            <Button
              onClick={handlePredict}
              disabled={loading}
              style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
            >
              {loading ? "Generating Predictions..." : "Generate Prediction"}
            </Button>
          </div>

          {/* Error Display */}
          {error && (
            <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fee", border: "1px solid #fcc", borderRadius: "4px", color: "#c00" }}>
              <strong>Error:</strong> {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Section */}
      {predictions && (
        <>
          {/* KPI Cards */}
          <section className="kpi-grid" style={{ marginBottom: "1.5rem" }}>
            {[
              {
                label: "Avg Predicted Speed",
                value: `${stats.avg.toFixed(1)} mph`,
                sub: `${dayNames[dayOfWeek]} at ${formatHour(selectedHour)}`,
              },
              {
                label: "Speed Range",
                value: `${stats.min.toFixed(0)} - ${stats.max.toFixed(0)} mph`,
                sub: "Min to Max",
              },
              {
                label: "Road Segments",
                value: stats.count,
                sub: "Predicted",
              },
              {
                label: "Data Quality",
                value: stats.confidence.toFixed(2),
                sub: "Confidence Score",
              },
              {
                label: "Historical Records",
                value: predictions.metadata?.historical_records_used?.toLocaleString() || "N/A",
                sub: "Matched",
              },
              {
                label: "Traffic Conditions",
                value: `${speedDistribution.fast}/${speedDistribution.moderate}/${speedDistribution.slow}`,
                sub: "🟢 Fast / 🟠 Moderate / 🔴 Slow",
              },
            ].map((k) => (
              <motion.div
                key={k.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>{k.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="kpi-value">{k.value}</div>
                    <div className="kpi-sub">{k.sub}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </section>

          {/* Map */}
          <Card style={{ marginBottom: "1.5rem" }}>
            <CardHeader>
              <CardTitle>
                Predicted Traffic Map - {dayNames[dayOfWeek]} at {formatHour(selectedHour)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: "600px" }}>
                <MapView rows={mapRows} />
              </div>
              <div style={{ marginTop: "1rem", fontSize: "0.9rem", color: "#666" }}>
                <strong>Color Legend:</strong>{" "}
                <span style={{ color: "#16a34a" }}>● Green (≥45 mph)</span> |{" "}
                <span style={{ color: "#f39c12" }}>● Orange (30-45 mph)</span> |{" "}
                <span style={{ color: "#e74c3c" }}>● Red (&lt;30 mph)</span>
              </div>
            </CardContent>
          </Card>

          {/* Data Table */}
          <Card>
            <CardHeader>
              <CardTitle>Prediction Details ({predictions.features?.length || 0} segments)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Road</th>
                      <th>Direction</th>
                      <th className="right">Predicted Speed</th>
                      <th className="right">Reference Speed</th>
                      <th className="right">Confidence</th>
                      <th className="right">Sample Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.features?.slice(0, 20).map((feature, i) => {
                      const props = feature.properties;
                      return (
                        <tr key={i}>
                          <td className="bold">{props.road}</td>
                          <td>{props.direction}</td>
                          <td className="right">{props.predicted_speed?.toFixed(1)} mph</td>
                          <td className="right">{props.reference_speed?.toFixed(1)} mph</td>
                          <td className="right">{props.confidence_mean?.toFixed(2)}</td>
                          <td className="right">{props.sample_size?.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {predictions.features?.length > 20 && (
                <div style={{ marginTop: "1rem", color: "#666", fontSize: "0.9rem" }}>
                  Showing 20 of {predictions.features.length} segments
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty State */}
      {!predictions && !loading && (
        <Card>
          <CardContent style={{ textAlign: "center", padding: "3rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🚦</div>
            <h3 style={{ marginBottom: "0.5rem" }}>Ready to Generate Predictions</h3>
            <p style={{ color: "#666" }}>
              Select a date, time, and day type above, then click "Generate Prediction" to see predicted traffic conditions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
