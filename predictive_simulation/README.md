# Marietta Traffic Prediction Engine

A Streamlit-based traffic prediction dashboard that simulates future traffic conditions in Marietta, GA based on historical traffic patterns. Users can select date, time, and day type to visualize predicted traffic speeds on an interactive map.

## Features

- **Historical Pattern Matching**: Predicts future traffic based on 9+ million historical traffic records from the month of October 2025 across 7 zipcodes that cover the area of Marietta (+ surroundings)
- **Multiple Day Types**:
  - Normal day (matches same day of week)
  - Holiday (uses weekend + Friday evening patterns)
  - Special event (50% normal + 50% holiday blend)
- **Interactive Visualization**: Color-coded road segments on Folium map
- **Confidence Metrics**: Optional display of prediction confidence and sample sizes
- **Fast Performance**: DuckDB-powered queries return results in <1 second
- **Real-time Dashboard**: Streamlit interface with intuitive controls

## Project Structure

```
.
├── marietta_traffic_data/          # CSV data files (not included in repo)
├── convert_to_duckdb.py            # One-time data conversion script
├── prediction_engine.py            # Core prediction logic (modular)
├── streamlit_app.py                # Streamlit dashboard UI
├── requirements.txt                # Python dependencies
├── marietta_traffic.db             # DuckDB database (generated)
└── README.md                       # This file
```

## Installation

### Prerequisites

- Python 3.13+ (tested on 3.13)
- pip package manager

### Setup Steps

1. **Clone or download this project**

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

   This installs:
   - `streamlit` - Web dashboard framework
   - `duckdb` - High-performance analytical database
   - `pandas` - Data manipulation
   - `folium` - Interactive maps
   - `streamlit-folium` - Streamlit-Folium integration

3. **Prepare your data**:
   - Place CSV files in `marietta_traffic_data/` folder:

4. **Convert data to DuckDB** (one-time setup):
   ```bash
   python convert_to_duckdb.py
   ```

   This will:
   - Discover all CSV files automatically
   - Load 9+ million traffic records
   - Extract time features (hour, day_of_week, date)
   - Create indexed database tables
   - Generate `marietta_traffic.db` file (~500MB)

   **Expected output**:
   ```
   Total records: 9,119,950
   Unique road segments: 261
   Date range: 2025-10-01 to 2025-11-02
   Query performance: 0.03s
   ```

## Usage

### Running the Dashboard

Start the Streamlit app:

```bash
streamlit run streamlit_app.py
```

The dashboard will open in your browser at `http://localhost:8501`

### Using the Dashboard

1. **Select Date**: Choose any future date to simulate
2. **Select Hour**: Use slider to pick time (0-23 hours)
3. **Choose Day Type**:
   - Normal Day: Standard weekday/weekend patterns
   - Holiday: Weekend-like traffic patterns
   - Special Event: Blended traffic patterns
4. **Toggle Confidence**: Show/hide prediction confidence intervals
5. **View Results**:
   - Interactive map with color-coded segments
   - Prediction metrics and statistics
   - Downloadable CSV export

### Color Coding

- **Green**: Fast traffic (> 40 mph)
- **Orange**: Moderate traffic (25-40 mph)
- **Red**: Slow traffic (< 25 mph)

### Using the Prediction Engine as a Module

You can also import and use the prediction engine in your own Python scripts:

```python
import duckdb
import prediction_engine as pe

# Connect to database
con = duckdb.connect('marietta_traffic.db', read_only=True)

# Get predictions for Tuesday at 3 PM
historical = pe.match_historical_data(
    day_of_week=1,  # 0=Monday, 1=Tuesday, etc.
    hour=15,
    day_type="normal",
    con=con
)

predictions = pe.calculate_predictions(historical, con)

# Generate map
traffic_map = pe.generate_folium_map(predictions, show_confidence=True)
traffic_map.save('my_prediction.html')

# Export as CSV or GeoJSON
csv_data = pe.export_predictions(predictions, format="csv")
geojson_data = pe.export_predictions(predictions, format="geojson")

con.close()
```

## Testing

Run the test suite to verify functionality:

```bash
python test_scenarios.py
```

This tests:
- Normal day predictions
- Holiday pattern matching
- Special event blending
- Edge cases (late night/early morning)
- Map generation
- Speed distribution analysis

**Sample test output**:
```
1. Normal Tuesday at 3 PM
   Historical records matched: 51,314
   Road segments predicted: 271
   Avg predicted speed: 32.4 mph
   Avg confidence: 0.97

[SUCCESS] ALL TESTS COMPLETED SUCCESSFULLY
```

## Architecture

### Data Layer (`convert_to_duckdb.py`)

- **Auto-discovery**: Scans for CSV files automatically
- **Schema detection**: Handles different date formats and column names
- **Efficient loading**: Uses DuckDB's native CSV reader (optimized for large files)
- **Time features**: Extracts hour, day_of_week, date from timestamps
- **Indexing**: Creates indexes on commonly queried columns for fast performance

### Prediction Engine (`prediction_engine.py`)

Four modular functions:

1. **`match_historical_data()`**:
   - Queries relevant historical data based on day/hour/type
   - Normal: Matches same day of week
   - Holiday: Queries Friday evenings + weekends
   - Special event: Blends normal + holiday with 50/50 weighting

2. **`calculate_predictions()`**:
   - Groups by road segment (tmc_code)
   - Calculates confidence-weighted average speeds
   - Joins with location data for coordinates
   - Returns predictions with confidence metrics

3. **`generate_folium_map()`**:
   - Creates interactive map centered on Marietta
   - Draws polylines for each road segment
   - Color-codes by predicted speed
   - Adds popups with details

4. **`export_predictions()`**:
   - Supports multiple output formats
   - DataFrame, CSV, or GeoJSON
   - For integration with other tools

### Dashboard (`streamlit_app.py`)

- **Caching**: Predictions cached by parameters for instant re-display
- **Responsive layout**: Sidebar controls + full-width map
- **Metrics display**: Summary statistics at a glance
- **Data exploration**: Expandable tables with detailed predictions
- **Export capability**: Download predictions as CSV

## Performance

- **Database size**: ~500MB (9.1 million records)
- **Query time**: <1 second for typical prediction query
- **Prediction calculation**: <2 seconds for 270+ road segments
- **Map rendering**: <3 seconds in browser
- **Total end-to-end**: <5 seconds from parameter change to display

## Database Schema

### `traffic` table
```sql
tmc_code VARCHAR          -- Road segment identifier
measurement_tstamp TIMESTAMP  -- When measurement was taken
speed DOUBLE              -- Measured speed (mph)
reference_speed DOUBLE    -- Typical speed for this segment
travel_time_seconds DOUBLE -- Travel time
confidence DOUBLE         -- Confidence score (0-1)
hour INTEGER              -- Hour of day (0-23)
day_of_week INTEGER       -- Day (0=Mon, 6=Sun)
date DATE                 -- Calendar date
zipcode VARCHAR           -- Source zipcode
```

**Indexes**: hour, day_of_week, tmc_code, measurement_tstamp

### `tmc_locations` table
```sql
tmc VARCHAR               -- Matches traffic.tmc_code
road VARCHAR              -- Road name
direction VARCHAR         -- Travel direction
start_latitude DOUBLE     -- Segment start coordinate
start_longitude DOUBLE
end_latitude DOUBLE       -- Segment end coordinate
end_longitude DOUBLE
miles DOUBLE              -- Segment length
zip VARCHAR               -- Zipcode
```

**Index**: tmc

## Data Sources

Historical traffic data from:
- **Location**: Marietta, GA (Cobb County)
- **Zipcodes**: 30008, 30060, 30062, 30064, 30066, 30067, 30068
- **Date Range**: October-November 2025
- **Update Frequency**: Minute-by-minute measurements
- **Coverage**: 261 unique road segments across 62 roads

## Troubleshooting

### "Database file not found"
- Run `python convert_to_duckdb.py` to generate the database

### "No predictions available"
- Some time/day combinations may have limited data
- Try different hours or day types
- Check that database was created successfully

### Slow performance
- Ensure DuckDB version is 1.0.0+
- Check that indexes were created during conversion
- Close other database connections

### Import errors
- Verify all dependencies are installed: `pip install -r requirements.txt`
- Check Python version is 3.13+

## Future Enhancements

Potential improvements:
- Real-time traffic data integration
- Multi-year historical comparisons
- Route planning with predicted speeds
- Weather impact analysis
- Traffic incident detection
- Mobile-responsive design
- API endpoint for predictions
- Historical accuracy metrics

## Technical Details

**DuckDB Advantages**:
- Column-oriented storage (efficient for analytics)
- Native CSV reading (no pandas intermediary)
- Zero-configuration embedded database
- SQL interface for complex queries
- Excellent performance on aggregations

**Prediction Methodology**:
- Confidence-weighted averaging prevents outliers from skewing results
- Sample size tracking enables data quality assessment
- Flexible day-type system accommodates various scenarios
- Spatial joins link predictions to map coordinates

## License

This project is for educational and demonstration purposes.

## Contact

For questions or issues, please contact the development team.

---

**Built with**: Python • Streamlit • DuckDB • Folium • Pandas
