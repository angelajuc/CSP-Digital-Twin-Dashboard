"""
FastAPI Backend for Marietta Traffic Prediction Engine
Exposes prediction_engine.py functions via REST API
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import duckdb
import prediction_engine as pe
from typing import Literal
import os
from pathlib import Path

app = FastAPI(
    title="Marietta Traffic Prediction API",
    description="API for predicting traffic conditions based on historical patterns",
    version="1.0.0"
)

# Configure CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Database path configuration
DB_PATH = os.environ.get("DB_PATH", "marietta_traffic.db")

def get_db_connection():
    """Create a read-only database connection"""
    db_file = Path(DB_PATH)
    if not db_file.exists():
        raise FileNotFoundError(f"Database file not found: {DB_PATH}")
    return duckdb.connect(str(db_file), read_only=True)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Marietta Traffic Prediction API",
        "version": "1.0.0",
        "endpoints": {
            "/api/predict": "Get traffic predictions",
            "/api/health": "Health check",
            "/api/stats": "Database statistics"
        }
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    try:
        con = get_db_connection()
        # Quick query to verify database is accessible
        result = con.execute("SELECT COUNT(*) FROM traffic").fetchone()
        con.close()
        return {
            "status": "healthy",
            "database": "connected",
            "total_records": result[0]
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@app.get("/api/stats")
async def get_statistics():
    """Get database statistics"""
    try:
        con = get_db_connection()

        # Get traffic statistics
        stats = con.execute("""
            SELECT
                COUNT(*) as total_records,
                COUNT(DISTINCT tmc_code) as unique_segments,
                COUNT(DISTINCT date) as unique_dates,
                MIN(date) as earliest_date,
                MAX(date) as latest_date,
                ROUND(AVG(speed), 2) as avg_speed,
                ROUND(AVG(confidence), 2) as avg_confidence
            FROM traffic
        """).fetchone()

        # Get road segment count
        tmc_stats = con.execute("""
            SELECT
                COUNT(*) as total_segments,
                COUNT(DISTINCT zip) as unique_zipcodes,
                COUNT(DISTINCT road) as unique_roads
            FROM tmc_locations
        """).fetchone()

        con.close()

        return {
            "traffic_data": {
                "total_records": stats[0],
                "unique_segments": stats[1],
                "unique_dates": stats[2],
                "date_range": {
                    "start": str(stats[3]),
                    "end": str(stats[4])
                },
                "avg_speed": stats[5],
                "avg_confidence": stats[6]
            },
            "location_data": {
                "total_segments": tmc_stats[0],
                "unique_zipcodes": tmc_stats[1],
                "unique_roads": tmc_stats[2]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/predict")
async def predict_traffic(
    day_of_week: int = Query(..., ge=0, le=6, description="Day of week (0=Monday, 6=Sunday)"),
    hour: int = Query(..., ge=0, le=23, description="Hour of day (0-23)"),
    day_type: Literal["normal", "holiday", "special_event"] = Query("normal", description="Type of day")
):
    """
    Generate traffic predictions for specified day, hour, and day type

    Parameters:
    - day_of_week: 0-6 (0=Monday, 6=Sunday)
    - hour: 0-23 (24-hour format)
    - day_type: normal, holiday, or special_event

    Returns:
    - GeoJSON FeatureCollection with predicted traffic for each road segment
    """
    try:
        # Connect to database
        con = get_db_connection()

        # Get historical data matching the parameters
        historical = pe.match_historical_data(day_of_week, hour, day_type, con)

        # Calculate predictions
        predictions = pe.calculate_predictions(historical, con)

        # Export as GeoJSON
        geojson = pe.export_predictions(predictions, format="geojson")

        # Add metadata
        response = {
            **geojson,
            "metadata": {
                "day_of_week": day_of_week,
                "hour": hour,
                "day_type": day_type,
                "segments_count": len(predictions),
                "historical_records_used": len(historical)
            }
        }

        con.close()

        return response

    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=f"Database not found: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
