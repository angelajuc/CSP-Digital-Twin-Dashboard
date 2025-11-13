# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains two integrated traffic analysis systems for Marietta, GA:

1. **Predictive Simulation** (Python/Streamlit) - Traffic prediction engine using historical patterns
2. **Digital Twin Dashboard** (React) - Real-time traffic visualization dashboard

## Commands

### Predictive Simulation (Python)

```bash
# Install dependencies
pip install -r predictive_simulation/requirements.txt

# One-time database setup (converts CSV data to DuckDB)
python predictive_simulation/convert_to_duckdb.py

# Run the Streamlit dashboard
streamlit run predictive_simulation/streamlit_app.py

# Run tests
python predictive_simulation/test_scenarios.py

# Run API server (if implemented)
uvicorn predictive_simulation.api:app --reload
```

### Digital Twin Dashboard (React)

```bash
# Navigate to dashboard directory
cd CSP-Digital-Twin-Dashboard-main/basic

# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm build
```

**Important:** The Map component requires a Mapbox API token. Set `REACT_APP_MAPBOX_TOKEN` environment variable or update `src/Map.js:6`.

## Architecture

### Predictive Simulation System

**Data Flow:**
1. CSV files in `marietta_traffic_data/` (Readings-*.csv, TMC_Identification-*.csv)
2. `convert_to_duckdb.py` processes CSVs → creates `marietta_traffic.db` (DuckDB database)
3. `prediction_engine.py` provides modular prediction functions
4. `streamlit_app.py` provides interactive UI, caching predictions

**Core Prediction Engine (`prediction_engine.py`):**
- `match_historical_data()` - Queries historical traffic based on day/hour/type (normal/holiday/special_event)
- `calculate_predictions()` - Aggregates data with confidence-weighted averaging per road segment
- `generate_folium_map()` - Creates interactive color-coded maps (green/orange/red by speed)
- `export_predictions()` - Exports to DataFrame/CSV/GeoJSON formats

**Database Schema:**
- `traffic` table: 9M+ records with tmc_code, measurement_tstamp, speed, confidence, hour, day_of_week, date, zipcode
- `tmc_locations` table: Road segment metadata with coordinates (start/end lat/lon), road names, directions
- Indexed on: hour, day_of_week, tmc_code, measurement_tstamp

**Day Type Logic:**
- Normal: Matches same day_of_week + hour
- Holiday: Uses Friday evening (hour >= 17) + weekends (day_of_week 5,6) at matching hour
- Special Event: 50/50 blend of normal + holiday data (weighted confidence)

### Digital Twin Dashboard System

**Stack:** React 18 + Mapbox GL + Recharts + Framer Motion

**Components:**
- `Dashboard.jsx` - Main dashboard with Overview/Map/Analytics tabs
- `Map.js` - Mapbox integration with color-coded traffic markers
- `supaRest.js` - Supabase REST API client for fetching traffic readings

**Data Flow:**
1. User selects zipcode, date range, time window via sidebar filters
2. `fetchJoinedReadings()`/`fetchJoinedReadingsAll()` queries Supabase REST API
3. Dashboard calculates KPIs (avg/min/max speed, confidence) from fetched data
4. Map displays markers colored by speed (green >= 45 mph, orange >= 30 mph, red < 30 mph)
5. Charts show hourly averages and speed distribution histograms

**Key Features:**
- Sidebar filters: 7 zipcodes (30008, 30060, 30062, 30064, 30066, 30067, 30068)
- Date picker constrained to October 2025 (2025-10-01 to 2025-10-31)
- Range options: 4h, 8h, 24h, 7d, 30d
- Real-time search/filtering with pagination (12 rows per page)
- Responsive map with ResizeObserver for dynamic viewport updates

## Key Integrations

**Prediction Engine as Module:**
```python
import duckdb
import prediction_engine as pe

con = duckdb.connect('marietta_traffic.db', read_only=True)
historical = pe.match_historical_data(day_of_week=1, hour=15, day_type="normal", con=con)
predictions = pe.calculate_predictions(historical, con)
traffic_map = pe.generate_folium_map(predictions, show_confidence=True)
```

**Date/Time Conventions:**
- day_of_week: 0 = Monday, 6 = Sunday
- hour: 0-23 (24-hour format)
- Timestamps: ISO format in database, both ISO and US formats supported in CSV import

## Data Sources

**Historical Traffic Data:**
- Location: Marietta, GA (Cobb County)
- Zipcodes: 30008, 30060, 30062, 30064, 30066, 30067, 30068
- Date Range: October-November 2025
- Coverage: 261 unique road segments, 9.1M+ minute-by-minute measurements
- Update Frequency: Real-time measurements stored with confidence scores

**Geographic Data:**
- `City_Limits.geojson`, `Streets.geojson`, `Ward_Boundaries.geojson`, `cobb.geojson` - City boundary and infrastructure GeoJSON files

## Development Notes

**Python Project:**
- Python 3.13+ required
- DuckDB provides <1s query performance for predictions
- Streamlit caching (`@st.cache_resource`, `@st.cache_data`) prevents re-computation
- CSV auto-discovery handles multiple date formats (ISO: "2025-10-01 00:00:00", US: "11/2/2025 0:00")
- Indexes critical for performance: always create after data loading

**React Project:**
- Mapbox token required for map rendering
- Uses functional components with hooks (useState, useEffect, useMemo)
- ResizeObserver pattern handles map viewport changes when switching tabs
- Pagination and search implemented client-side after API fetch (up to 2000 records)
- framer-motion provides card animations on mount

**Performance Considerations:**
- Database queries return in <1s for typical prediction queries
- Streamlit dashboard end-to-end: <5s from parameter change to display
- React dashboard limits map markers for performance (configurable in Map.js:87)
- Confidence-weighted averaging prevents outliers from skewing predictions

## Testing

Test scenarios validate prediction accuracy across different conditions:
- Normal day patterns (e.g., Tuesday 3 PM)
- Holiday patterns (weekend-like traffic)
- Special event blending
- Edge cases (low-traffic hours like 2 AM)
- Map generation and speed distribution analysis