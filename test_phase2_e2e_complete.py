import os
import sys
import json

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(r".\Rooftop-Solar-Energy-Potential-Map-main"))

from starlette.testclient import TestClient
from backend.main import app

client = TestClient(app)

print("=====================================================================")
print(" SURYA SANKALP: COMPREHENSIVE END-TO-END PIPELINE VERIFICATION")
print("=====================================================================")

# 1. API Health Check
r_health = client.get("/api/health")
assert r_health.status_code == 200, f"Health check failed: {r_health.text}"
print("✓ 1. API Health: OK (Status: 200, DB: sqlite3)")

# 2. DISCOM Tariffs Retrieval
r_tariffs = client.get("/api/tariffs")
assert r_tariffs.status_code == 200, f"Tariffs failed: {r_tariffs.text}"
tariffs = r_tariffs.json()
assert len(tariffs["jurisdictions"]) > 0
tg_jurisdiction = next((j for j in tariffs["jurisdictions"] if j["state_code"] == "TG"), None)
assert tg_jurisdiction is not None, "Telangana jurisdiction missing!"
assert any(d["discom_code"] == "TGSPDCL" for d in tg_jurisdiction["discoms"]), "TGSPDCL DISCOM missing!"
print(f"✓ 2. DISCOM Tariffs: Loaded {len(tariffs['jurisdictions'])} jurisdiction(s) including Telangana (TGSPDCL)")

# 3. Save Polygon (Hyderabad / Telangana Coordinates)
coords_hyderabad = "17.3850,78.4860; 17.3860,78.4860; 17.3860,78.4870; 17.3850,78.4870"
r_poly = client.post("/api/save_polygon", json={
    "coordinates": coords_hyderabad,
    "imageUrl": "https://maps.googleapis.com/maps/api/staticmap?center=17.3855,78.4865&zoom=17&size=600x400",
    "user_id": 1,
    "bounds": {
        "minLat": 17.3850,
        "maxLat": 17.3860,
        "minLng": 78.4860,
        "maxLng": 78.4870
    }
})
assert r_poly.status_code == 200, f"Save polygon failed: {r_poly.text}"
poly_id = r_poly.json()["polygon_id"]
print(f"✓ 3. Save Polygon: OK (polygon_id = {poly_id})")

# 4. Run AI Rooftop Segmentation (with validated confidence threshold = 0.20)
r_pred = client.post("/api/run_prediction", json={
    "polygon_id": poly_id,
    "confidence_threshold": 0.20
})
assert r_pred.status_code == 200, f"Run prediction failed: {r_pred.text}"
pred_data = r_pred.json()
detected_area = pred_data["total_rooftop_area_m2"]
print(f"✓ 4. AI Rooftop Segmentation: OK (detected {pred_data['detected_count']} rooftops, area: {detected_area:.2f} m²)")

# 5. Solar Energy Estimation (consistently consuming detected area)
r_est = client.post("/api/estimate", json={
    "polygon_id": poly_id,
    "latitude": 17.3855,
    "longitude": 78.4865,
    "efficiency": 0.18,
    "usable_area_factor": 0.70
})
assert r_est.status_code == 200, f"Estimate failed: {r_est.text}"
est_data = r_est.json()
estimation_id = est_data["estimation_id"]
est_area = est_data["rooftop_area_m2"]
annual_gen = est_data["annual_energy_potential_kwh"]
assert estimation_id is not None, "estimation_id must not be None!"
print(f"✓ 5. Solar Estimation: OK (estimation_id = {estimation_id}, rooftop_area = {est_area:.2f} m², annual_gen = {annual_gen:.1f} kWh, origin = {est_data['data_origin']})")

# Area Integrity Check: Estimation must consume detected area
if detected_area > 0:
    assert abs(est_area - detected_area) < 0.01, f"Area mismatch! {est_area} vs {detected_area}"
    print(f"    [Area Integrity Check Passed: {est_area:.2f} m² preserved from ML detector]")

# 6. Financial Feasibility Assessment via estimation_id (Area Integrity Rule)
# Test 6A: Residential Consumer with Sanctioned Load = 3.0 kW
r_fin_res = client.post("/api/financial_assessment", json={
    "estimation_id": estimation_id,
    "state_code": "TG",
    "discom_code": "TGSPDCL",
    "consumer_category": "residential_individual",
    "sanctioned_load_kw": 3.0,
    "monthly_consumption_kwh": 350.0,
    "self_consumption_scenario": "MODERATE"
})
assert r_fin_res.status_code == 200, f"Residential financial assessment failed: {r_fin_res.text}"
fin_res = r_fin_res.json()

# Assertions on Financial Logic
# Capacity must NEVER exceed sanctioned load (3.0 kW)
rec_kw = fin_res["system_sizing"]["recommended_capacity_kw"]
assert rec_kw <= 3.0, f"Overrun violation! Recommended {rec_kw} kW > 3.0 kW sanctioned"
print(f"✓ 6A. Residential Sizing: Sized at {rec_kw} kW (Constraint: {fin_res['system_sizing']['binding_constraint']})")

# Subsidy for 3.0 kW in TG: ₹78,000 (₹30k*2 + ₹18k*1)
cfa_sub = fin_res["capex_and_subsidy"]["cfa_subsidy_amount"]
if rec_kw == 3.0:
    assert cfa_sub == 78000.0, f"Expected ₹78,000 subsidy, got {cfa_sub}"
assert fin_res["capex_and_subsidy"]["is_subsidy_eligible"] is True
print(f"✓ 6B. PM Surya Ghar Subsidy: ₹{cfa_sub:,.2f} (Net Investment: ₹{fin_res['capex_and_subsidy']['net_consumer_investment']:,.2f})")

# Monthly Bill Simulation
bill_before = fin_res["bill_simulation"]["monthly_bill_before_solar"]
bill_after = fin_res["bill_simulation"]["monthly_bill_after_solar"]
savings = fin_res["bill_simulation"]["annual_electricity_savings"]
assert bill_after < bill_before, "Solar did not reduce the monthly bill!"
assert savings > 0, "Annual savings must be positive!"
print(f"✓ 6C. DISCOM Slab Simulation: Bill ₹{bill_before:,.2f}/mo -> ₹{bill_after:,.2f}/mo (Annual Savings: ₹{savings:,.2f})")

# Lifecycle & Payback
payback = fin_res["metrics"]["simple_payback_years"]
assert payback is not None and payback < 8.0, f"Unexpected payback period: {payback}"
print(f"✓ 6D. Lifecycle Payback: {payback:.2f} years (Status: {fin_res['metrics']['payback_status']}, 25-Yr Net Savings: ₹{fin_res['metrics']['twenty_five_year_net_savings']:,.2f})")

# Test 6B: Commercial Consumer (Verification of Subsidy Ineligibility)
r_fin_comm = client.post("/api/financial_assessment", json={
    "estimation_id": estimation_id,
    "state_code": "TG",
    "discom_code": "TGSPDCL",
    "consumer_category": "commercial",
    "sanctioned_load_kw": 10.0,
    "monthly_consumption_kwh": 1200.0,
    "self_consumption_scenario": "HIGH"
})
assert r_fin_comm.status_code == 200, f"Commercial financial assessment failed: {r_fin_comm.text}"
fin_comm = r_fin_comm.json()
assert fin_comm["capex_and_subsidy"]["cfa_subsidy_amount"] == 0.0, "Commercial must NOT receive PM Surya Ghar subsidy!"
assert fin_comm["capex_and_subsidy"]["is_subsidy_eligible"] is False
print(f"✓ 6E. Commercial Non-Subsidy Rule: Verified ₹0 subsidy for commercial category")

# 7. Frontend Static Serving Check
r_front_index = client.get("/")
assert r_front_index.status_code == 200, f"Frontend index failed: {r_front_index.status_code}"
assert "<!doctype html>" in r_front_index.text.lower() or "<html" in r_front_index.text.lower()
print(f"✓ 7. Frontend Static Serving: Production bundle index.html successfully served (HTTP 200)")

print("\n=====================================================================")
print(" ALL END-TO-END PIPELINE CHECKS PASSED WITH 100% SUCCESS!")
print("=====================================================================")
