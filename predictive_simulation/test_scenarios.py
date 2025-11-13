import duckdb
import prediction_engine as pe

# Connect to database
con = duckdb.connect('marietta_traffic.db', read_only=True)

# Test Scenario 1: Normal Tuesday at 3 PM
historical = pe.match_historical_data(day_of_week=1, hour=15, day_type="normal", con=con)
predictions = pe.calculate_predictions(historical, con)
print(f"   Historical records matched: {len(historical):,}")
print(f"   Road segments predicted: {len(predictions)}")
if not predictions.empty:
    print(f"   Avg predicted speed: {predictions['predicted_speed'].mean():.1f} mph")
    print(f"   Avg confidence: {predictions['confidence_mean'].mean():.2f}")

# Test Scenario 2: Holiday (Thanksgiving) at 5 PM
historical = pe.match_historical_data(day_of_week=3, hour=17, day_type="holiday", con=con)
predictions = pe.calculate_predictions(historical, con)
print(f"   Historical records matched: {len(historical):,}")
print(f"   Road segments predicted: {len(predictions)}")
if not predictions.empty:
    print(f"   Avg predicted speed: {predictions['predicted_speed'].mean():.1f} mph")
    print(f"   Avg confidence: {predictions['confidence_mean'].mean():.2f}")

# Test Scenario 3: Special event Saturday at 10 AM
historical = pe.match_historical_data(day_of_week=5, hour=10, day_type="special_event", con=con)
predictions = pe.calculate_predictions(historical, con)
print(f"   Historical records matched: {len(historical):,}")
print(f"   Road segments predicted: {len(predictions)}")
if not predictions.empty:
    print(f"   Avg predicted speed: {predictions['predicted_speed'].mean():.1f} mph")
    print(f"   Avg confidence: {predictions['confidence_mean'].mean():.2f}")

# Test Scenario 4: Edge case - 2 AM Monday (low data availability)
print("\n4. Edge Case: 2 AM Monday (low traffic hour)")
print("-" * 70)
historical = pe.match_historical_data(day_of_week=0, hour=2, day_type="normal", con=con)
predictions = pe.calculate_predictions(historical, con)
print(f"   Historical records matched: {len(historical):,}")
print(f"   Road segments predicted: {len(predictions)}")
if not predictions.empty:
    print(f"   Avg predicted speed: {predictions['predicted_speed'].mean():.1f} mph")
    print(f"   Avg confidence: {predictions['confidence_mean'].mean():.2f}")
else:
    print(f"   [WARNING] No predictions available (insufficient data)")

# Test Scenario 5: Map generation test
print("\n5. Map Generation Test")
print("-" * 70)
historical = pe.match_historical_data(day_of_week=4, hour=17, day_type="normal", con=con)
predictions = pe.calculate_predictions(historical, con)
if not predictions.empty:
    traffic_map = pe.generate_folium_map(predictions, show_confidence=True)
    traffic_map.save('test_friday_evening_map.html')
    print(f"   [OK] Map generated successfully: test_friday_evening_map.html")
    print(f"   Road segments on map: {len(predictions)}")

    # Test speed distribution
    fast = len(predictions[predictions['predicted_speed'] > 40])
    moderate = len(predictions[(predictions['predicted_speed'] > 25) & (predictions['predicted_speed'] <= 40)])
    slow = len(predictions[predictions['predicted_speed'] <= 25])
    print(f"   Speed distribution:")
    print(f"      [GREEN] Fast (>40 mph): {fast} segments ({fast/len(predictions)*100:.1f}%)")
    print(f"      [ORANGE] Moderate (25-40 mph): {moderate} segments ({moderate/len(predictions)*100:.1f}%)")
    print(f"      [RED] Slow (<25 mph): {slow} segments ({slow/len(predictions)*100:.1f}%)")

print("\n" + "="*70)
print("[SUCCESS] ALL TESTS COMPLETED SUCCESSFULLY")
print("="*70)

con.close()
