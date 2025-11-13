"""
Marietta Traffic Prediction Engine - Streamlit Dashboard
Simulate future traffic conditions based on historical patterns.
"""

import streamlit as st
import duckdb
import pandas as pd
from datetime import datetime, date, timedelta
from streamlit_folium import st_folium
import prediction_engine as pe

# Page configuration
st.set_page_config(
    page_title="Marietta Traffic Prediction",
    page_icon="🚦",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        color: #1f77b4;
        margin-bottom: 0.5rem;
    }
    .sub-header {
        font-size: 1.2rem;
        color: #666;
        margin-bottom: 2rem;
    }
    .metric-container {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        margin: 0.5rem 0;
    }
</style>
""", unsafe_allow_html=True)

# Initialize database connection (cached)
@st.cache_resource
def get_database_connection():
    """Create and cache database connection"""
    return duckdb.connect('marietta_traffic.db', read_only=True)

# Cache predictions for same input parameters
@st.cache_data
def get_predictions(_con, day_of_week: int, hour: int, day_type: str):
    """
    Get traffic predictions (cached by parameters).

    Note: _con parameter starts with underscore to prevent Streamlit from hashing it
    """
    with st.spinner('Matching historical traffic patterns...'):
        historical = pe.match_historical_data(day_of_week, hour, day_type, _con)

    with st.spinner('Calculating predictions...'):
        predictions = pe.calculate_predictions(historical, _con)

    return predictions, len(historical)

# Main app
def main():
    # Header
    st.markdown('<div class="main-header">🚦 Marietta Traffic Prediction Engine</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-header">Simulate future traffic based on historical patterns</div>', unsafe_allow_html=True)

    # Get database connection
    try:
        con = get_database_connection()
    except Exception as e:
        st.error(f"Error connecting to database: {e}")
        st.info("Make sure 'marietta_traffic.db' exists. Run 'python convert_to_duckdb.py' first.")
        st.stop()

    # Sidebar controls
    st.sidebar.header("⚙️ Prediction Controls")

    # Date picker
    selected_date = st.sidebar.date_input(
        "Select Date",
        value=date.today() + timedelta(days=1),
        min_value=date.today(),
        help="Choose any future date to simulate traffic conditions"
    )

    # Extract day of week (0=Monday, 6=Sunday)
    day_of_week = selected_date.weekday()
    day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    st.sidebar.info(f"📅 Selected: **{day_names[day_of_week]}**")

    # Time slider
    selected_hour = st.sidebar.slider(
        "Select Hour",
        min_value=0,
        max_value=23,
        value=8,
        format="%d:00",
        help="Choose the hour of day (24-hour format)"
    )

    # Display time in 12-hour format
    hour_12 = selected_hour % 12
    if hour_12 == 0:
        hour_12 = 12
    am_pm = "AM" if selected_hour < 12 else "PM"
    st.sidebar.info(f"🕐 Time: **{hour_12}:00 {am_pm}**")

    # Day type selector
    st.sidebar.markdown("---")
    day_type = st.sidebar.radio(
        "Day Type",
        options=["normal", "holiday", "special_event"],
        format_func=lambda x: {
            "normal": "🗓️ Normal Day",
            "holiday": "🎉 Holiday",
            "special_event": "⭐ Special Event"
        }[x],
        help="""
        - **Normal Day**: Uses historical data from the same day of week
        - **Holiday**: Uses weekend and Friday evening patterns
        - **Special Event**: Blends normal and holiday patterns (50/50)
        """
    )

    # Confidence toggle
    show_confidence = st.sidebar.checkbox(
        "Show Confidence Intervals",
        value=False,
        help="Display confidence metrics in map popups"
    )

    st.sidebar.markdown("---")
    st.sidebar.markdown("### 📊 About the Data")
    st.sidebar.markdown("""
    Historical traffic data from Marietta, GA covering multiple weeks with 9+ million data points.

    **Color coding:**
    - 🟢 Green: > 40 mph (Fast)
    - 🟠 Orange: 25-40 mph (Moderate)
    - 🔴 Red: < 25 mph (Slow)
    """)

    # Main content area
    # Get predictions
    try:
        predictions, historical_count = get_predictions(con, day_of_week, selected_hour, day_type)
    except Exception as e:
        st.error(f"Error generating predictions: {e}")
        st.stop()

    # Display metrics
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        if not predictions.empty:
            avg_speed = predictions['predicted_speed'].mean()
            st.metric(
                "Average Predicted Speed",
                f"{avg_speed:.1f} mph",
                help="Average predicted speed across all road segments"
            )
        else:
            st.metric("Average Predicted Speed", "N/A")

    with col2:
        st.metric(
            "Road Segments Analyzed",
            f"{len(predictions)}",
            help="Number of road segments with predictions"
        )

    with col3:
        st.metric(
            "Historical Records Used",
            f"{historical_count:,}",
            help="Number of historical data points matched"
        )

    with col4:
        if not predictions.empty:
            avg_confidence = predictions['confidence_mean'].mean()
            st.metric(
                "Data Quality",
                f"{avg_confidence:.2f}",
                help="Average confidence score (0-1, higher is better)"
            )
        else:
            st.metric("Data Quality", "N/A")

    # Display map
    st.markdown("---")
    st.subheader(f"🗺️ Traffic Prediction Map - {day_names[day_of_week]} at {hour_12}:00 {am_pm}")

    if predictions.empty:
        st.warning(f"""
        No traffic predictions available for the selected parameters.

        **Selected:** {day_names[day_of_week]} at {hour_12}:00 {am_pm} ({day_type})

        Try selecting a different time or day type. Some combinations may have limited historical data.
        """)
    else:
        # Generate map
        with st.spinner('Generating interactive map...'):
            traffic_map = pe.generate_folium_map(predictions, show_confidence=show_confidence)

        # Display map
        st_folium(traffic_map, width=None, height=600)

        # Expandable section with detailed data
        with st.expander(f"📋 View Detailed Predictions ({len(predictions)} segments)"):
            # Format data for display
            display_df = predictions[[
                'road', 'direction', 'predicted_speed', 'reference_speed',
                'confidence_mean', 'sample_size'
            ]].copy()

            display_df.columns = [
                'Road', 'Direction', 'Predicted Speed (mph)',
                'Reference Speed (mph)', 'Confidence', 'Sample Size'
            ]

            # Add color indicator
            def speed_color(speed):
                if speed > 40:
                    return '🟢'
                elif speed > 25:
                    return '🟠'
                else:
                    return '🔴'

            display_df.insert(0, 'Status', display_df['Predicted Speed (mph)'].apply(speed_color))

            st.dataframe(
                display_df,
                use_container_width=True,
                hide_index=True
            )

            # Download button for CSV
            csv = predictions.to_csv(index=False)
            st.download_button(
                label="📥 Download Predictions as CSV",
                data=csv,
                file_name=f"marietta_traffic_{selected_date}_{selected_hour:02d}00.csv",
                mime="text/csv"
            )

        # Statistics section
        with st.expander("📈 Statistical Summary"):
            col1, col2 = st.columns(2)

            with col1:
                st.markdown("#### Speed Distribution")
                speed_stats = predictions['predicted_speed'].describe()
                st.dataframe(
                    speed_stats.to_frame(name='Speed (mph)'),
                    use_container_width=True
                )

            with col2:
                st.markdown("#### Traffic Conditions")
                fast_count = len(predictions[predictions['predicted_speed'] > 40])
                moderate_count = len(predictions[(predictions['predicted_speed'] > 25) &
                                                 (predictions['predicted_speed'] <= 40)])
                slow_count = len(predictions[predictions['predicted_speed'] <= 25])

                condition_df = pd.DataFrame({
                    'Condition': ['🟢 Fast (>40 mph)', '🟠 Moderate (25-40 mph)', '🔴 Slow (<25 mph)'],
                    'Count': [fast_count, moderate_count, slow_count],
                    'Percentage': [
                        f"{fast_count/len(predictions)*100:.1f}%",
                        f"{moderate_count/len(predictions)*100:.1f}%",
                        f"{slow_count/len(predictions)*100:.1f}%"
                    ]
                })

                st.dataframe(condition_df, use_container_width=True, hide_index=True)

    # Footer
    st.markdown("---")
    st.markdown("""
    <div style='text-align: center; color: #666; padding: 1rem;'>
        <p>Marietta Traffic Prediction Engine | Built with Streamlit, DuckDB, and Folium</p>
        <p style='font-size: 0.9rem;'>Data is based on historical patterns and may not reflect real-time conditions</p>
    </div>
    """, unsafe_allow_html=True)


if __name__ == "__main__":
    main()
