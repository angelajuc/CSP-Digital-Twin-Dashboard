import duckdb
import pandas as pd
import folium
from typing import Literal

def match_historical_data(
    day_of_week: int,
    hour: int,
    day_type: Literal["normal", "holiday", "special_event"],
    # this brings the database
    con: duckdb.DuckDBPyConnection
) -> pd.DataFrame:
    if day_type == "normal":
        # Query all records matching day_of_week and hour
        query = """
            SELECT
                tmc_code,
                measurement_tstamp,
                speed,
                reference_speed,
                confidence,
                hour,
                day_of_week
            FROM traffic
            WHERE day_of_week = ? AND hour = ?
        """
        params = [day_of_week, hour]

    elif day_type == "holiday":
        # Query Friday evening + weekends at matching hour
        query = """
            SELECT
                tmc_code,
                measurement_tstamp,
                speed,
                reference_speed,
                confidence,
                hour,
                day_of_week
            FROM traffic
            WHERE (
                (day_of_week = 4 AND hour >= 17)  -- Friday evening
                OR day_of_week IN (5, 6)           -- Weekend
            ) AND hour = ?
        """
        params = [hour]

    else:  # special_event
        # Blend 50% normal day + 50% holiday data
        query = """
            WITH normal_data AS (
                SELECT
                    tmc_code,
                    measurement_tstamp,
                    speed,
                    reference_speed,
                    confidence * 0.5 as confidence,  -- Weight by 50%
                    hour,
                    day_of_week
                FROM traffic
                WHERE day_of_week = ? AND hour = ?
            ),
            holiday_data AS (
                SELECT
                    tmc_code,
                    measurement_tstamp,
                    speed,
                    reference_speed,
                    confidence * 0.5 as confidence,  -- Weight by 50%
                    hour,
                    day_of_week
                FROM traffic
                WHERE (
                    (day_of_week = 4 AND hour >= 17)
                    OR day_of_week IN (5, 6)
                ) AND hour = ?
            )
            SELECT * FROM normal_data
            UNION ALL
            SELECT * FROM holiday_data
        """
        params = [day_of_week, hour, hour]

    # Execute query and return as DataFrame
    df = con.execute(query, params).df()

    return df


def calculate_predictions(
    historical_data: pd.DataFrame,  # the specific sets of data that matches our parameters
    con: duckdb.DuckDBPyConnection
) -> pd.DataFrame:
    """
    Returns:
        DataFrame with predictions including:
        - tmc_code, road, direction
        - predicted_speed, reference_speed
        - confidence_mean, confidence_std, sample_size
        - start_latitude, start_longitude, end_latitude, end_longitude
    """

    # handles errors
    if historical_data.empty:
        # Return empty DataFrame with correct schema
        return pd.DataFrame(columns=[
            'tmc_code', 'road', 'direction', 'predicted_speed', 'reference_speed',
            'confidence_mean', 'confidence_std', 'sample_size',
            'start_latitude', 'start_longitude', 'end_latitude', 'end_longitude'
        ])

    # Register DataFrame as temporary table in DuckDB
    con.register('temp_historical', historical_data)

    # Calculate weighted predictions and join with location data
    query = """
        WITH aggregated AS (
            SELECT
                tmc_code,
                SUM(speed * confidence) / NULLIF(SUM(confidence), 0) as predicted_speed,
                AVG(reference_speed) as reference_speed,
                AVG(confidence) as confidence_mean,
                STDDEV(confidence) as confidence_std,
                COUNT(*) as sample_size
            FROM temp_historical
            GROUP BY tmc_code
        )
        SELECT
            a.tmc_code,
            l.road,
            l.direction,
            ROUND(a.predicted_speed, 2) as predicted_speed,
            ROUND(a.reference_speed, 2) as reference_speed,
            ROUND(a.confidence_mean, 3) as confidence_mean,
            ROUND(COALESCE(a.confidence_std, 0), 3) as confidence_std,
            a.sample_size,
            l.start_latitude,
            l.start_longitude,
            l.end_latitude,
            l.end_longitude
        FROM aggregated a
        LEFT JOIN tmc_locations l ON a.tmc_code = l.tmc
        WHERE l.start_latitude IS NOT NULL
          AND l.start_longitude IS NOT NULL
          AND l.end_latitude IS NOT NULL
          AND l.end_longitude IS NOT NULL
        ORDER BY a.predicted_speed ASC
    """

    predictions = con.execute(query).df()

    # Unregister temporary table
    con.unregister('temp_historical')

    return predictions


def generate_folium_map(
    predictions: pd.DataFrame,
    show_confidence: bool = False
) -> folium.Map:

    # Create map centered on Marietta
    m = folium.Map(
        location=[33.95, -84.55],
        zoom_start=12,
        tiles='OpenStreetMap'
    )

    if predictions.empty:
        # Add a marker indicating no data
        folium.Marker(
            location=[33.95, -84.55],
            popup="No traffic data available for selected parameters",
            icon=folium.Icon(color='gray', icon='info-sign')
        ).add_to(m)
        return m

    # Add road segments to map
    for _, row in predictions.iterrows():
        # Determine color based on predicted speed
        if row['predicted_speed'] > 40:
            color = 'green'
        elif row['predicted_speed'] > 25:
            color = 'orange'
        else:
            color = 'red'

        # Create popup content
        popup_html = f"""
        <div style="font-family: Arial; font-size: 12px; width: 200px;">
            <b>{row['road']}</b><br>
            Direction: {row['direction']}<br>
            <hr style="margin: 5px 0;">
            <b>Predicted Speed:</b> {row['predicted_speed']:.1f} mph<br>
            <b>Reference Speed:</b> {row['reference_speed']:.1f} mph<br>
        """

        if show_confidence:
            popup_html += f"""
            <hr style="margin: 5px 0;">
            <b>Confidence:</b> {row['confidence_mean']:.2f} ± {row['confidence_std']:.2f}<br>
            <b>Sample Size:</b> {row['sample_size']:,} records<br>
            """

        popup_html += "</div>"

        # Draw polyline from start to end coordinates
        folium.PolyLine(
            locations=[
                [row['start_latitude'], row['start_longitude']],
                [row['end_latitude'], row['end_longitude']]
            ],
            color=color,
            weight=5,
            opacity=0.7,
            popup=folium.Popup(popup_html, max_width=250)
        ).add_to(m)

    # Add legend
    legend_html = """
    <div style="position: fixed;
                bottom: 50px; right: 50px; width: 180px; height: 120px;
                background-color: white; border:2px solid grey; z-index:9999;
                font-size:14px; padding: 10px;">
        <p style="margin: 5px 0;"><b>Traffic Speed Legend</b></p>
        <p style="margin: 5px 0;">
            <span style="color: green; font-size: 20px;">━━</span> > 40 mph (Fast)
        </p>
        <p style="margin: 5px 0;">
            <span style="color: orange; font-size: 20px;">━━</span> 25-40 mph (Moderate)
        </p>
        <p style="margin: 5px 0;">
            <span style="color: red; font-size: 20px;">━━</span> < 25 mph (Slow)
        </p>
    </div>
    """
    m.get_root().html.add_child(folium.Element(legend_html))

    return m


def export_predictions(
    predictions: pd.DataFrame,
    format: Literal["dataframe", "geojson", "csv"] = "dataframe"
):

    if format == "dataframe":
        return predictions

    elif format == "csv":
        return predictions.to_csv(index=False)

    elif format == "geojson":
        # Convert to GeoJSON format
        features = []

        for _, row in predictions.iterrows():
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [row['start_longitude'], row['start_latitude']],
                        [row['end_longitude'], row['end_latitude']]
                    ]
                },
                "properties": {
                    "tmc_code": row['tmc_code'],
                    "road": row['road'],
                    "direction": row['direction'],
                    "predicted_speed": float(row['predicted_speed']),
                    "reference_speed": float(row['reference_speed']),
                    "confidence_mean": float(row['confidence_mean']),
                    "confidence_std": float(row['confidence_std']),
                    "sample_size": int(row['sample_size'])
                }
            }
            features.append(feature)

        geojson = {
            "type": "FeatureCollection",
            "features": features
        }

        return geojson

    else:
        raise ValueError(f"Unsupported format: {format}")


# Example usage
if __name__ == "__main__":
    # Connect to database
    con = duckdb.connect('marietta_traffic.db', read_only=True)

    # Example: Predict traffic for Tuesday at 8 AM (normal day)

    historical = match_historical_data(
        day_of_week=1,  # Tuesday
        hour=8,
        day_type="normal",
        con=con
    )

    predictions = calculate_predictions(historical, con)

    print("\nTop 5 slowest segments:")
    print(predictions[['road', 'direction', 'predicted_speed', 'sample_size']].head())

    # Generate map
    traffic_map = generate_folium_map(predictions, show_confidence=True)
    traffic_map.save('example_prediction_map.html')
    print("\nMap saved to: example_prediction_map.html")

    con.close()
