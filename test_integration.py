"""
Quick integration test for the prediction API
Run this after starting the API server with: uvicorn predictive_simulation.api:app --reload
"""

import requests
import sys

API_BASE = "http://localhost:8000"

def test_health():
    """Test health endpoint"""
    print("Testing /api/health...")
    try:
        response = requests.get(f"{API_BASE}/api/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Health check passed: {data['status']}")
            print(f"  Database has {data.get('total_records', 'N/A'):,} records")
            return True
        else:
            print(f"  ✗ Health check failed with status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"  ✗ Cannot connect to {API_BASE}")
        print(f"  Make sure the API server is running:")
        print(f"  uvicorn predictive_simulation.api:app --reload --port 8000")
        return False
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

def test_stats():
    """Test stats endpoint"""
    print("\nTesting /api/stats...")
    try:
        response = requests.get(f"{API_BASE}/api/stats", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Stats endpoint working")
            print(f"  Unique segments: {data['traffic_data']['unique_segments']}")
            print(f"  Date range: {data['traffic_data']['date_range']['start']} to {data['traffic_data']['date_range']['end']}")
            return True
        else:
            print(f"  ✗ Stats failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

def test_prediction():
    """Test prediction endpoint"""
    print("\nTesting /api/predict...")
    try:
        # Test with Tuesday at 3 PM, normal day
        params = {
            "day_of_week": 1,  # Tuesday
            "hour": 15,        # 3 PM
            "day_type": "normal"
        }
        response = requests.get(f"{API_BASE}/api/predict", params=params, timeout=10)

        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Prediction endpoint working")
            print(f"  Received {len(data.get('features', []))} road segment predictions")
            print(f"  Used {data['metadata']['historical_records_used']:,} historical records")

            # Sample first prediction
            if data.get('features'):
                first = data['features'][0]
                props = first['properties']
                print(f"  Sample: {props['road']} ({props['direction']})")
                print(f"    Predicted speed: {props['predicted_speed']:.1f} mph")
                print(f"    Confidence: {props['confidence_mean']:.2f}")

            return True
        else:
            print(f"  ✗ Prediction failed with status {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

def main():
    print("=" * 70)
    print("Testing Marietta Traffic Prediction API Integration")
    print("=" * 70)

    results = []
    results.append(("Health Check", test_health()))
    results.append(("Stats Endpoint", test_stats()))
    results.append(("Prediction Endpoint", test_prediction()))

    print("\n" + "=" * 70)
    print("Test Summary:")
    print("=" * 70)

    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {status}: {name}")

    all_passed = all(result[1] for result in results)

    if all_passed:
        print("\n✓ All tests passed! Integration is working correctly.")
        print("\nNext steps:")
        print("1. Keep the API server running in one terminal")
        print("2. Start React app in another terminal:")
        print("   cd CSP-Digital-Twin-Dashboard-main/basic && npm start")
        print("3. Open http://localhost:3000 and click 'Prediction' tab")
        return 0
    else:
        print("\n✗ Some tests failed. Please check the errors above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
