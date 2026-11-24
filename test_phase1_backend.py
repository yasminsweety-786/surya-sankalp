import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(r".\Rooftop-Solar-Energy-Potential-Map-main"))

from backend.database import init_db, get_connection
from ML.src.pipelines.predict_pipeline import run_rooftop_segmentation
from backend.services.nasa_power import fetch_solar_data

print("--- 1. Testing SQLite Database Initialization ---")
init_db()
conn = get_connection()
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row["name"] for row in cursor.fetchall()]
print(f"Tables created: {tables}")
assert "users" in tables
assert "polygons" in tables
assert "rooftop_detections" in tables
assert "solar_estimations" in tables
conn.close()
print(">> DB Initialization Test PASSED")

print("\n--- 2. Testing ML Rooftop Segmentation ---")
img_path = os.path.abspath(r".\Rooftop-Solar-Energy-Potential-Map-main\backend\uploads\1_polygon_image.png")
bounds = {"minLat": 22.570, "maxLat": 22.575, "minLng": 88.360, "maxLng": 88.365}
seg = run_rooftop_segmentation(img_path, bounds=bounds, confidence_threshold=0.08)
print(f"Detections count: {seg['detected_count']}")
print(f"Total rooftop area: {seg['total_rooftop_area_m2']} m²")
print(f"Total rooftop pixels: {seg['total_rooftop_pixels']}")
print(f"Conversion method: {seg['conversion_method']}")
print(f"Uncertainty status: {seg['uncertainty_status'][:70]}...")
if seg['detections']:
    d0 = seg['detections'][0]
    print(f"First rooftop: confidence={d0['confidence']}, polygon vertices count={len(d0['polygon_points'])}, area={d0['real_area_m2']} m²")
assert seg['detected_count'] > 0
assert seg['total_rooftop_area_m2'] is not None
print(">> ML Segmentation Test PASSED")

print("\n--- 3. Testing NASA POWER Service ---")
solar = fetch_solar_data(22.57, 88.36, "20230101", "20230110")
print(f"Data origin: {solar['data_origin']}")
print(f"Is fallback: {solar['is_fallback']}")
print(f"Days returned: {len(solar['solar_data'])}")
print(f"Source attribution: {solar['source_attribution']}")
assert len(solar['solar_data']) == 10
print(">> NASA POWER Test PASSED")

print("\n--- ALL COMPONENT VERIFICATION TESTS COMPLETED SUCCESSFULLY! ---")
