"""
FastAPI Backend for Marietta Traffic Prediction Engine
Exposes prediction_engine.py functions via REST API
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import duckdb
import prediction_engine as pe
from typing import Literal, Optional
import os
from pathlib import Path
from datetime import datetime, timedelta

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


# ============================================================================
# ANALYTICS ENDPOINTS
# ============================================================================

@app.get("/api/analytics/readings")
async def get_analytics_readings(
    zipcode: str = Query(..., description="ZIP code (e.g., '30068')"),
    start: Optional[str] = Query(None, description="Start timestamp (ISO format)"),
    end: Optional[str] = Query(None, description="End timestamp (ISO format)"),
    hours: Optional[int] = Query(None, description="Hours back from now (if start/end not provided)"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(2000, ge=1, le=5000, description="Page size"),
    order: str = Query("desc", description="Sort order: 'asc' or 'desc'")
):
    """
    Fetch paginated traffic readings with location data for analytics dashboard

    Parameters:
    - zipcode: ZIP code to filter by
    - start/end: ISO timestamp range (e.g., "2025-10-01T00:00:00")
    - hours: Alternative to start/end - hours back from now
    - offset/limit: Pagination
    - order: Sort order for timestamp

    Returns:
    - rows: List of readings with location data
    - total_count: Total matching records
    - page_info: Pagination metadata
    """
    try:
        con = get_db_connection()

        # Build time filter
        time_filter = ""
        params = {"zipcode": zipcode}

        if start and end:
            time_filter = "AND t.measurement_tstamp >= $start AND t.measurement_tstamp < $end"
            params["start"] = start
            params["end"] = end
        elif hours:
            # Calculate time range
            end_time = datetime.now()
            start_time = end_time - timedelta(hours=hours)
            time_filter = "AND t.measurement_tstamp >= $start AND t.measurement_tstamp < $end"
            params["start"] = start_time.isoformat()
            params["end"] = end_time.isoformat()

        # Sort order
        order_clause = "DESC" if order.lower() == "desc" else "ASC"

        # Get total count (without pagination)
        count_query = f"""
            SELECT COUNT(*)
            FROM traffic t
            WHERE t.zipcode = $zipcode
            {time_filter}
        """
        total_count = con.execute(count_query, params).fetchone()[0]

        # Get paginated data with JOIN
        data_query = f"""
            SELECT
                t.tmc_code,
                t.measurement_tstamp,
                t.speed,
                t.confidence,
                tmc.road,
                tmc.direction,
                tmc.start_latitude,
                tmc.start_longitude
            FROM traffic t
            LEFT JOIN tmc_locations tmc ON t.tmc_code = tmc.tmc
            WHERE t.zipcode = $zipcode
            {time_filter}
            ORDER BY t.measurement_tstamp {order_clause}
            LIMIT $limit OFFSET $offset
        """
        params["limit"] = limit
        params["offset"] = offset

        result = con.execute(data_query, params).fetchall()
        columns = ["tmc_code", "measurement_tstamp", "speed", "confidence",
                   "road", "direction", "start_latitude", "start_longitude"]

        # Convert to list of dicts
        rows = []
        for row in result:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # Convert timestamp to ISO string
                if col == "measurement_tstamp" and value:
                    row_dict[col] = value.isoformat() if hasattr(value, 'isoformat') else str(value)
                else:
                    row_dict[col] = value
            rows.append(row_dict)

        con.close()

        return {
            "rows": rows,
            "total_count": total_count,
            "page_info": {
                "offset": offset,
                "limit": limit,
                "has_more": (offset + limit) < total_count
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics readings error: {str(e)}")


@app.get("/api/analytics/stats")
async def get_analytics_stats(
    zipcode: str = Query(..., description="ZIP code (e.g., '30068')"),
    start: Optional[str] = Query(None, description="Start timestamp (ISO format)"),
    end: Optional[str] = Query(None, description="End timestamp (ISO format)"),
    hours: Optional[int] = Query(None, description="Hours back from now")
):
    """
    Get aggregated statistics for KPI cards

    Parameters:
    - zipcode: ZIP code to filter by
    - start/end: ISO timestamp range
    - hours: Alternative to start/end

    Returns:
    - avg_speed: Average speed
    - min_speed: Minimum speed
    - max_speed: Maximum speed
    - avg_confidence: Average confidence score
    - record_count: Number of records
    """
    try:
        con = get_db_connection()

        # Build time filter
        time_filter = ""
        params = {"zipcode": zipcode}

        if start and end:
            time_filter = "AND measurement_tstamp >= $start AND measurement_tstamp < $end"
            params["start"] = start
            params["end"] = end
        elif hours:
            end_time = datetime.now()
            start_time = end_time - timedelta(hours=hours)
            time_filter = "AND measurement_tstamp >= $start AND measurement_tstamp < $end"
            params["start"] = start_time.isoformat()
            params["end"] = end_time.isoformat()

        query = f"""
            SELECT
                ROUND(AVG(speed), 2) as avg_speed,
                ROUND(MIN(speed), 2) as min_speed,
                ROUND(MAX(speed), 2) as max_speed,
                ROUND(AVG(confidence), 4) as avg_confidence,
                COUNT(*) as record_count
            FROM traffic
            WHERE zipcode = $zipcode
            {time_filter}
        """

        result = con.execute(query, params).fetchone()
        con.close()

        return {
            "avg_speed": result[0] or 0,
            "min_speed": result[1] or 0,
            "max_speed": result[2] or 0,
            "avg_confidence": result[3] or 0,
            "record_count": result[4] or 0
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics stats error: {str(e)}")


@app.get("/api/analytics/hourly")
async def get_analytics_hourly(
    zipcode: str = Query(..., description="ZIP code (e.g., '30068')"),
    start: Optional[str] = Query(None, description="Start timestamp (ISO format)"),
    end: Optional[str] = Query(None, description="End timestamp (ISO format)"),
    hours: Optional[int] = Query(None, description="Hours back from now")
):
    """
    Get hourly aggregated data for line chart

    Parameters:
    - zipcode: ZIP code to filter by
    - start/end: ISO timestamp range
    - hours: Alternative to start/end

    Returns:
    - hourly: List of {hour, avg_speed, count} for each hour 0-23
    """
    try:
        con = get_db_connection()

        # Build time filter
        time_filter = ""
        params = {"zipcode": zipcode}

        if start and end:
            time_filter = "AND measurement_tstamp >= $start AND measurement_tstamp < $end"
            params["start"] = start
            params["end"] = end
        elif hours:
            end_time = datetime.now()
            start_time = end_time - timedelta(hours=hours)
            time_filter = "AND measurement_tstamp >= $start AND measurement_tstamp < $end"
            params["start"] = start_time.isoformat()
            params["end"] = end_time.isoformat()

        query = f"""
            SELECT
                hour,
                ROUND(AVG(speed), 2) as avg_speed,
                COUNT(*) as count
            FROM traffic
            WHERE zipcode = $zipcode
            {time_filter}
            GROUP BY hour
            ORDER BY hour
        """

        result = con.execute(query, params).fetchall()
        con.close()

        # Create a map of hour -> data
        hour_data = {row[0]: {"hour": row[0], "avg_speed": row[1], "count": row[2]} for row in result}

        # Fill in missing hours with 0
        hourly = []
        for h in range(24):
            if h in hour_data:
                hourly.append(hour_data[h])
            else:
                hourly.append({"hour": h, "avg_speed": 0, "count": 0})

        return {"hourly": hourly}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics hourly error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
