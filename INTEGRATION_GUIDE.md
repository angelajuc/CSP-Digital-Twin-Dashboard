# Prediction Integration Guide

This guide explains how to run the integrated traffic prediction system in the CSP Digital Twin Dashboard.

## Overview

The integration adds a new "Prediction" tab to the dashboard that allows users to predict future traffic conditions based on historical patterns.

## Architecture

```
React Dashboard (Port 3000)     FastAPI Backend (Port 8000)     DuckDB Database
     └─ PredictionView.jsx ───→ api.py ───→ prediction_engine.py ───→ marietta_traffic.db
```

## Quick Start

### 1. Start the FastAPI Backend

Open a terminal and run:

```bash
cd predictive_simulation
uvicorn api:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

**Keep this terminal running!**

### 2. Test the API (Optional)

In a new terminal, run the integration test:

```bash
python test_integration.py
```

This will verify that:
- The API server is running
- The database is accessible
- Prediction endpoints are working correctly

### 3. Start the React Dashboard

Open another terminal and run:

```bash
cd CSP-Digital-Twin-Dashboard-main/basic
npm start
```

The dashboard will open automatically at http://localhost:3000

### 4. Use the Prediction Tab

1. Click the **"Prediction"** tab in the sidebar (between Analytics and Settings)
2. Select a date, time, and day type
3. Click **"Generate Prediction"**
4. View the predicted traffic on the map and in the statistics

## Features

### Prediction Parameters

- **Date Picker**: Select any future date
- **Hour Slider**: Choose time of day (0-23 hours)
- **Day Type**:
  - **Normal Day**: Uses historical data from same day of week
  - **Holiday**: Uses weekend and Friday evening patterns
  - **Special Event**: 50/50 blend of normal and holiday patterns

### Visualizations

- **Interactive Map**: Color-coded road segments showing predicted speeds
  - 🟢 Green: Fast traffic (≥45 mph)
  - 🟠 Orange: Moderate traffic (30-45 mph)
  - 🔴 Red: Slow traffic (<30 mph)
- **KPI Cards**: Average speed, speed range, confidence scores
- **Data Table**: Detailed predictions for each road segment

## Troubleshooting

### "Cannot connect to prediction API"

**Problem**: React app cannot reach the FastAPI backend

**Solutions**:
1. Make sure the FastAPI server is running on port 8000
2. Check terminal for error messages
3. Verify database exists: `predictive_simulation/marietta_traffic.db`
4. Test manually: Open http://localhost:8000/api/health in browser

### "Database file not found"

**Problem**: DuckDB database doesn't exist

**Solution**: Run the data conversion script:
```bash
cd predictive_simulation
python convert_to_duckdb.py
```

This will create `marietta_traffic.db` from CSV files in `marietta_traffic_data/`

### Port Already in Use

**Problem**: Port 3000 or 8000 is already occupied

**Solutions**:
- For FastAPI: Use a different port: `uvicorn api:app --reload --port 8001`
  - Update `predictionApi.js` line 3 to use the new port
- For React: The app will prompt you to use port 3001 automatically

### CORS Errors

**Problem**: Browser blocks API requests

**Solution**: The API is already configured with CORS for localhost:3000 and localhost:3001. If you use a different port, add it to `api.py` line 22.

## Files Modified/Created

### New Files (3)
1. `predictive_simulation/api.py` - FastAPI backend server
2. `CSP-Digital-Twin-Dashboard-main/basic/src/predictionApi.js` - API client
3. `CSP-Digital-Twin-Dashboard-main/basic/src/PredictionView.jsx` - Prediction UI component

### Modified Files (1)
1. `CSP-Digital-Twin-Dashboard-main/basic/src/Dashboard.jsx` - Added Prediction tab
   - Added import for PredictionView (line 12)
   - Added "Prediction" sidebar item (lines 359-363)
   - Added conditional render for prediction tab (lines 599-602)

### Supporting Files
- `test_integration.py` - Integration test script
- `INTEGRATION_GUIDE.md` - This file

## API Endpoints

### GET /api/health
Returns server and database health status

**Example**:
```bash
curl http://localhost:8000/api/health
```

### GET /api/stats
Returns database statistics

**Example**:
```bash
curl http://localhost:8000/api/stats
```

### GET /api/predict
Generates traffic predictions

**Parameters**:
- `day_of_week`: 0-6 (0=Monday, 6=Sunday)
- `hour`: 0-23
- `day_type`: "normal", "holiday", or "special_event"

**Example**:
```bash
curl "http://localhost:8000/api/predict?day_of_week=1&hour=15&day_type=normal"
```

## Development Tips

### Hot Reload

Both servers support hot reload:
- FastAPI: Changes to Python files reload automatically
- React: Changes to JSX/JS files reload automatically

### Debugging

**Backend logs**: Watch the terminal running uvicorn
**Frontend logs**: Open browser DevTools (F12) → Console tab

### Making Changes

- **Modify prediction logic**: Edit `predictive_simulation/prediction_engine.py`
- **Modify API endpoints**: Edit `predictive_simulation/api.py`
- **Modify UI**: Edit `CSP-Digital-Twin-Dashboard-main/basic/src/PredictionView.jsx`

### Testing Predictions

Good test cases:
- **Rush hour**: Tuesday at 17:00 (5 PM), Normal day
- **Late night**: Wednesday at 2:00 (2 AM), Normal day
- **Weekend**: Saturday at 10:00, Normal day
- **Holiday**: Thursday at 17:00, Holiday type

## Environment Variables (Optional)

### Backend (.env in predictive_simulation/)
```
DB_PATH=marietta_traffic.db
```

### Frontend (.env in CSP-Digital-Twin-Dashboard-main/basic/)
```
REACT_APP_PREDICTION_API_URL=http://localhost:8000
```

## Performance

Expected performance:
- API response time: <2 seconds for predictions
- Historical records matched: 10K-100K depending on parameters
- Road segments predicted: ~260-270
- Map rendering: <1 second

## Next Steps

Potential enhancements:
1. Add caching for frequently requested predictions
2. Compare predicted vs actual traffic (if real-time data available)
3. Export predictions to CSV/PDF
4. Batch predictions for entire week
5. Route planning with predicted travel times
6. Mobile-responsive design for prediction tab

## Support

For issues:
1. Check the troubleshooting section above
2. Review console logs in both terminals
3. Run `python test_integration.py` to diagnose API issues
4. Verify database with: `python -c "import duckdb; print(duckdb.connect('predictive_simulation/marietta_traffic.db').execute('SELECT COUNT(*) FROM traffic').fetchone())"`
