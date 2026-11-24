import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(r".\Rooftop-Solar-Energy-Potential-Map-main"))

from starlette.testclient import TestClient
from backend.main import app

client = TestClient(app)

print("--- 1. Testing GET /api/health ---")
r = client.get("/api/health")
print("Response:", r.status_code, r.json())
assert r.status_code == 200
assert r.json()["status"] == "healthy"
print(">> /api/health PASSED")

print("\n--- 2. Testing POST /api/signup & /api/login ---")
signup_payload = {
    "firstname": "Surya",
    "lastname": "Tester",
    "email": "tester@suryasankalp.org",
    "password": "SecurePassword123!"
}
r_signup = client.post("/api/signup", json=signup_payload)
print("Signup response:", r_signup.status_code, r_signup.json())
assert r_signup.status_code in [201, 400]  # 400 if user already created in previous run

login_payload = {
    "email": "tester@suryasankalp.org",
    "password": "SecurePassword123!"
}
r_login = client.post("/api/login", json=login_payload)
print("Login response:", r_login.status_code, r_login.json())
assert r_login.status_code == 200
user_id = r_login.json()["user_id"]
print(">> Auth endpoints PASSED")

print("\n--- 3. Testing POST /api/save_polygon ---")
save_poly_payload = {
    "user_id": user_id,
    "coordinates": "22.570,88.360; 22.575,88.365",
    "imageUrl": "local_sample_test",
    "bounds": {
        "minLat": 22.570,
        "maxLat": 22.575,
        "minLng": 88.360,
        "maxLng": 88.365
    }
}
r_poly = client.post("/api/save_polygon", json=save_poly_payload)
print("Save polygon response:", r_poly.status_code, r_poly.json())
assert r_poly.status_code == 200
polygon_id = r_poly.json()["polygon_id"]
print(">> /api/save_polygon PASSED, polygon_id =", polygon_id)

print("\n--- 4. Testing POST /api/run_prediction ---")
r_pred = client.post("/api/run_prediction", json={"polygon_id": polygon_id, "confidence_threshold": 0.08})
print("Prediction status:", r_pred.status_code)
pred_data = r_pred.json()
print("Detections count:", pred_data["detected_count"])
print("Total rooftop area m²:", pred_data["total_rooftop_area_m2"])
print("Conversion method:", pred_data["conversion_method"])
assert r_pred.status_code == 200
assert pred_data["detected_count"] > 0
detected_area_m2 = pred_data["total_rooftop_area_m2"]
print(">> /api/run_prediction PASSED")

print("\n--- 5. Testing POST /api/estimate (Consuming Real Detected Rooftop Area) ---")
# Call estimate passing polygon_id, WITHOUT passing rooftop_area_m2, to verify it retrieves the detected area!
r_est = client.post("/api/estimate", json={
    "user_id": user_id,
    "polygon_id": polygon_id,
    "latitude": 22.5726,
    "longitude": 88.3639,
    "efficiency": 0.18,
    "usable_area_factor": 0.70
})
print("Estimation status:", r_est.status_code)
est_data = r_est.json()
print("Rooftop area used in estimation (m²):", est_data["rooftop_area_m2"])
print("Usable area (70% assumption):", est_data["usable_area_m2"])
print("Annual solar potential (kWh):", est_data["annual_energy_potential_kwh"])
print("Data origin flag:", est_data["data_origin"])
print("Is fallback flag:", est_data["is_fallback"])
assert r_est.status_code == 200

# VERIFY THAT THE AREA RETURNED BY PREDICTION IS THE EXACT AREA CONSUMED BY ESTIMATION!
print("\n--- CRITICAL CHECK: Area Continuity Verification ---")
print(f"Area from Prediction: {detected_area_m2} m²")
print(f"Area in Estimation:   {est_data['rooftop_area_m2']} m²")
assert abs(detected_area_m2 - est_data["rooftop_area_m2"]) < 0.01
print(">> VERIFIED: Rooftop area from prediction is EXACTLY consumed by solar estimation! (No hardcoding!)")

print("\n=== ALL FASTAPI END-TO-END TESTS PASSED SUCCESSFULLY! ===")
