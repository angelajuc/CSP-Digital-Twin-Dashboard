import duckdb
import glob
import os
import re
from pathlib import Path
from datetime import datetime

def extract_zipcode(filename):
    # Extract zipcode from filename (e.g., 'Readings-30060.csv' -> '30060')
    match = re.search(r'[-.](\d{5})', filename)
    return match.group(1) if match else None

def discover_csv_files(data_dir='marietta_traffic_data'):
    base_path = Path(data_dir)

    readings_files = list(base_path.glob('Readings*.csv'))
    tmc_files = list(base_path.glob('TMC*Identification*.csv'))

    return readings_files, tmc_files

def create_traffic_table(con, readings_files):
    # Create table with explicit schema
    con.execute("""
        CREATE TABLE IF NOT EXISTS traffic (
            tmc_code VARCHAR,
            measurement_tstamp TIMESTAMP,
            speed DOUBLE,
            reference_speed DOUBLE,
            travel_time_seconds DOUBLE,
            confidence DOUBLE,
            hour INTEGER,
            day_of_week INTEGER,
            date DATE,
            zipcode VARCHAR
        )
    """)

    # Load each readings file
    for i, file_path in enumerate(readings_files, 1):
        zipcode = extract_zipcode(file_path.name)
        try:
            # Use read_csv_auto to let DuckDB handle detection, but force timestamp as string
            file_path_str = str(file_path).replace(chr(92), '/')

            # First peek at the file to check columns and date format
            sample = con.execute(f"""
                SELECT * FROM read_csv_auto('{file_path_str}', sample_size=1)
            """).fetchall()

            if not sample or len(sample) == 0:
                print(f"    Skipped (no data)")
                continue

            # column info
            desc = con.execute(f"""
                SELECT * FROM read_csv_auto('{file_path_str}', sample_size=1)
            """).description
            column_names = [d[0] for d in desc]

            # Determine correct confidence column name
            confidence_col = 'confidence_score' if 'confidence_score' in column_names else 'confidence'

            # Check the actual timestamp value to determine format
            sample_timestamp = str(sample[0][1]) if len(sample[0]) > 1 else ""

            # Detect date format
            if '-' in sample_timestamp and sample_timestamp.count('-') >= 2:
                # ISO format: "2025-10-01 00:00:00"
                timestamp_expr = "CAST(measurement_tstamp AS TIMESTAMP)"
            else:
                # US format: "11/2/2025 0:00" - needs parsing
                timestamp_expr = "strptime(CAST(measurement_tstamp AS VARCHAR), '%m/%d/%Y %H:%M')"

            # Load the data
            con.execute(f"""
                INSERT INTO traffic
                SELECT
                    tmc_code,
                    {timestamp_expr} as measurement_tstamp,
                    speed,
                    reference_speed,
                    travel_time_seconds,
                    {confidence_col} as confidence,
                    EXTRACT(HOUR FROM {timestamp_expr}) as hour,
                    EXTRACT(DOW FROM {timestamp_expr}) as day_of_week,
                    CAST({timestamp_expr} AS DATE) as date,
                    '{zipcode}' as zipcode
                FROM read_csv_auto('{file_path_str}', ignore_errors=true)
            """)

            row_count = con.execute("SELECT COUNT(*) FROM traffic WHERE zipcode = ?", [zipcode]).fetchone()[0]
            print(f"    Loaded {row_count:,} rows")

        except Exception as e:
            print(f"    Error loading {file_path.name}: {e}")

    # Create indexes for fast querying
    con.execute("CREATE INDEX IF NOT EXISTS idx_traffic_hour ON traffic(hour)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_traffic_dow ON traffic(day_of_week)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_traffic_tmc ON traffic(tmc_code)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_traffic_tstamp ON traffic(measurement_tstamp)")

    total_rows = con.execute("SELECT COUNT(*) FROM traffic").fetchone()[0]
    print(f"\n Total rows in traffic table: {total_rows:,}")

def create_tmc_locations_table(con, tmc_files):
    # Create table with explicit schema
    con.execute("""
        CREATE TABLE IF NOT EXISTS tmc_locations (
            tmc VARCHAR,
            road VARCHAR,
            direction VARCHAR,
            intersection VARCHAR,
            state VARCHAR,
            county VARCHAR,
            zip VARCHAR,
            start_latitude DOUBLE,
            start_longitude DOUBLE,
            end_latitude DOUBLE,
            end_longitude DOUBLE,
            miles DOUBLE,
            road_order DOUBLE,
            timezone_name VARCHAR,
            type VARCHAR,
            country VARCHAR
        )
    """)

    # Load each TMC file
    for i, file_path in enumerate(tmc_files, 1):
        zipcode = extract_zipcode(file_path.name)
        print(f"  [{i}/{len(tmc_files)}] Loading {file_path.name} (zipcode: {zipcode})...")

        try:
            con.execute(f"""
                INSERT INTO tmc_locations
                SELECT
                    tmc,
                    road,
                    direction,
                    intersection,
                    state,
                    county,
                    zip,
                    start_latitude,
                    start_longitude,
                    end_latitude,
                    end_longitude,
                    miles,
                    road_order,
                    timezone_name,
                    type,
                    country
                FROM read_csv('{str(file_path).replace(chr(92), '/')}',
                             delim=',',
                             header=true,
                             ignore_errors=true)
            """)

            row_count = con.execute("SELECT COUNT(*) FROM tmc_locations WHERE zip = ?", [zipcode]).fetchone()[0]
            print(f"    Loaded {row_count:,} road segments")

        except Exception as e:
            print(f"    Error loading {file_path.name}: {e}")

    # Create index
    con.execute("CREATE INDEX IF NOT EXISTS idx_tmc_locations_tmc ON tmc_locations(tmc)")

    total_rows = con.execute("SELECT COUNT(*) FROM tmc_locations").fetchone()[0]
    print(f"\nTotal road segments in tmc_locations table: {total_rows:,}")

def print_summary_statistics(con):
    # Traffic data stats
    print("\nTraffic Data:")
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

    print(f"  Total records: {stats[0]:,}")
    print(f"  Unique road segments: {stats[1]:,}")
    print(f"  Date range: {stats[3]} to {stats[4]} ({stats[2]} days)")
    print(f"  Average speed: {stats[5]} mph")
    print(f"  Average confidence: {stats[6]}")

    # TMC locations stats
    tmc_stats = con.execute("""
        SELECT
            COUNT(*) as total_segments,
            COUNT(DISTINCT zip) as unique_zipcodes,
            COUNT(DISTINCT road) as unique_roads
        FROM tmc_locations
    """).fetchone()

    print(f"  Total segments: {tmc_stats[0]:,}")
    print(f"  Unique zipcodes: {tmc_stats[1]}")
    print(f"  Unique roads: {tmc_stats[2]:,}")

def main():
    # Discover CSV files
    readings_files, tmc_files = discover_csv_files()

    if not readings_files or not tmc_files:
        return "No CSV files found in the specified directory."

    # Create database connection
    db_path = 'marietta_traffic.db'
    if os.path.exists(db_path):
        print(f"\nRemoving existing database: {db_path}")
        os.remove(db_path)

    print(f"\nCreating new database: {db_path}")
    con = duckdb.connect(db_path)

    try:
        # Create tables
        create_traffic_table(con, readings_files)
        create_tmc_locations_table(con, tmc_files)

        # Print summary
        print_summary_statistics(con)

    except Exception as e:
        print(f"\n{e}")
        raise

    finally:
        con.close()

if __name__ == '__main__':
    main()
