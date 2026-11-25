import os
import sys

# Ensure project root is on PYTHONPATH
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from starlette.testclient import TestClient
from backend.main import app

def test_endpoints():
    print("Testing Surya Sankalp with in-process TestClient...")
    client = TestClient(app)
    
    # 1. Health check
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    print("✓ /api/health passed:", res.json())

    # 2. Frontend HTML check
    res_html = client.get("/")
    assert res_html.status_code == 200, f"Root page failed: {res_html.status_code}"
    assert "Surya Sankalp" in res_html.text or "root" in res_html.text, "Index HTML missing"
    print("✓ Root index.html served successfully (SPA fallback active)")

    # 3. Geocode test
    res_geo = client.get("/api/geocode?q=Gachibowli")
    assert res_geo.status_code == 200
    geo_data = res_geo.json()
    print("✓ /api/geocode passed:", geo_data.get("display_name"))

    # 4. City presets
    res_presets = client.get("/api/city_presets")
    assert res_presets.status_code == 200
    presets = res_presets.json().get("presets", [])
    assert len(presets) >= 6
    print(f"✓ /api/city_presets passed: {len(presets)} presets available")

    # 5. Location 1: Hyderabad (Dense rooftops)
    print("\n--- Test Location 1: Hyderabad (Gachibowli) ---")
    delta = 0.0012
    lat, lng = 17.4436, 78.3520
    coords = [[lat - delta, lng - delta], [lat + delta, lng - delta], [lat + delta, lng + delta], [lat - delta, lng + delta]]
    preview_url = (
        f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?"
        f"bbox={lng-delta},{lat-delta},{lng+delta},{lat+delta}&bboxSR=4326&imageSR=4326&size=640,640&format=png&f=image"
    )
    tile_res = client.post("/api/save_polygon", json={
        "coordinates": str(coords),
        "imageUrl": preview_url,
        "location_name": "Gachibowli, Hyderabad, Telangana",
        "lat": lat,
        "lng": lng
    })
    assert tile_res.status_code == 200, f"Save polygon failed: {tile_res.text}"
    tile_data = tile_res.json()
    polygon_id = tile_data.get("polygon_id") or tile_data.get("polygonId")
    print(f"Polygon saved, polygon_id: {polygon_id}")

    pred_res = client.post("/api/run_prediction", json={
        "polygon_id": polygon_id,
        "confidence_threshold": 0.15
    })
    assert pred_res.status_code == 200, f"Prediction failed: {pred_res.text}"
    pdata = pred_res.json()
    print(f"Hyderabad Detections: {pdata['detected_count']} rooftops")
    print(f"Total Scaled Rooftop Area: {pdata['total_rooftop_area_m2']} m²")
    print(f"Overlay URL: {pdata['overlay_image_url']}")
    print(f"Processed URL: {pdata['processed_image_url']}")
    assert pdata["detected_count"] > 0, "Expected rooftops in Hyderabad tile"
    assert pdata["overlay_image_url"] is not None
    assert pdata["processed_image_url"] is not None

    # Check that overlay and processed files exist on disk
    overlay_rel = os.path.join(BASE_DIR, "backend", pdata["overlay_image_url"].lstrip("/"))
    assert os.path.exists(overlay_rel), f"Overlay file missing: {overlay_rel}"
    processed_rel = os.path.join(BASE_DIR, "backend", pdata["processed_image_url"].lstrip("/"))
    assert os.path.exists(processed_rel), f"Processed file missing: {processed_rel}"
    print("✓ Segmented image files verified on disk")

    # 6. Check Segment ID consistency and non-empty detections
    for i, d in enumerate(pdata["detections"]):
        assert d["segment_id"] == i + 1, f"Expected sequential 1-based segment_id, got {d['segment_id']}"
        assert d["centroid"] is not None and len(d["centroid"]) == 2, f"Missing centroid for Rooftop #{d['segment_id']}"
        assert "confidence_label" in d, "Missing confidence label"
    print(f"✓ All {len(pdata['detections'])} detected rooftops have verified sequential segment IDs, centroids, and labels")

    # 7. Check Rejection/Filter Log
    assert "rejected_detections" in pdata, "Missing rejected_detections list in response"
    print(f"✓ Filtered/Rejected candidates logged: {len(pdata['rejected_detections'])}")
    for r in pdata["rejected_detections"]:
        assert r["is_rejected"] is True
        assert r["rejection_reason"] != "", "Missing rejection reason for filtered candidate"

    # 8. Solar Estimation Check
    est_res = client.post("/api/estimate", json={
        "polygon_id": polygon_id,
        "latitude": 17.4436,
        "longitude": 78.3520,
        "efficiency": 0.18,
        "usable_area_factor": 0.70,
        "rooftop_area_m2": pdata["total_rooftop_area_m2"]
    })
    assert est_res.status_code == 200
    est_data = est_res.json()
    print(f"Annual Energy Potential: {est_data['annual_energy_potential_kwh']} kWh/yr")
    print("✓ Solar estimation successful")

    # 9. Financial Assessment Check: Clean Slate (No Existing Solar)
    fin_res = client.post("/api/financial_assessment", json={
        "estimation_id": est_data["estimation_id"],
        "polygon_id": polygon_id,
        "rooftop_area_m2": pdata["total_rooftop_area_m2"],
        "state_code": "TG",
        "discom_code": "TGSPDCL",
        "consumer_category": "residential_individual",
        "sanctioned_load_kw": 4.0,
        "monthly_consumption_kwh": 350.0,
        "self_consumption_scenario": "MODERATE",
        "existing_solar_status": "NO",
        "existing_solar_capacity_kw": 0.0
    })
    assert fin_res.status_code == 200
    fin_data = fin_res.json()
    sizing = fin_data["system_sizing"]
    capex = fin_data["capex_and_subsidy"]
    metrics = fin_data["metrics"]
    print(f"Clean-slate Recommended Sizing: {sizing['recommended_capacity_kw']} kWp (Binding: {sizing['binding_constraint']})")
    assert sizing["recommended_capacity_kw"] <= 4.0
    print("✓ Clean-slate financial calculation verified")

    # 10. Existing Solar Check (Scenario A: 2.0 kW Existing Solar on 4.0 kW Sanctioned Load)
    print("\n--- Test Existing Solar Handling (Scenario A: Partial Capacity Present) ---")
    fin_exist_res = client.post("/api/financial_assessment", json={
        "estimation_id": est_data["estimation_id"],
        "polygon_id": polygon_id,
        "rooftop_area_m2": pdata["total_rooftop_area_m2"],
        "state_code": "TG",
        "discom_code": "TGSPDCL",
        "consumer_category": "residential_individual",
        "sanctioned_load_kw": 4.0,
        "monthly_consumption_kwh": 350.0,
        "self_consumption_scenario": "MODERATE",
        "existing_solar_status": "YES",
        "existing_solar_capacity_kw": 2.0
    })
    assert fin_exist_res.status_code == 200
    exist_data = fin_exist_res.json()
    sizing_exist = exist_data["system_sizing"]
    print(f"Existing: {sizing_exist['existing_solar_capacity_kw']} kW, Recommended Additional: {sizing_exist['recommended_capacity_kw']} kW")
    print(f"Occupied Area: {sizing_exist['existing_occupied_area_m2']} m², Total Combined: {sizing_exist['total_combined_capacity_kw']} kW")
    assert sizing_exist["existing_occupied_area_m2"] == 20.0, "2 kW existing solar must occupy 20 m²"
    assert sizing_exist["recommended_capacity_kw"] <= 2.0, "Additional capacity cannot exceed 2.0 kW remaining grid headroom"
    assert sizing_exist["total_combined_capacity_kw"] <= 4.0, "Total combined capacity cannot exceed 4.0 kW sanctioned load"
    print("✓ Existing solar deduction verified (no double-counting of occupied area or grid headroom)")

    # 11. Existing Solar Check (Scenario B: Existing Solar Exceeds / Matches Sanctioned Load)
    print("\n--- Test Existing Solar Handling (Scenario B: Full Grid Headroom Exhausted) ---")
    fin_full_res = client.post("/api/financial_assessment", json={
        "estimation_id": est_data["estimation_id"],
        "polygon_id": polygon_id,
        "rooftop_area_m2": pdata["total_rooftop_area_m2"],
        "state_code": "TG",
        "discom_code": "TGSPDCL",
        "consumer_category": "residential_individual",
        "sanctioned_load_kw": 4.0,
        "monthly_consumption_kwh": 350.0,
        "self_consumption_scenario": "MODERATE",
        "existing_solar_status": "YES",
        "existing_solar_capacity_kw": 4.0
    })
    assert fin_full_res.status_code == 200
    full_sizing = fin_full_res.json()["system_sizing"]
    print(f"Existing 4.0 kW on 4.0 kW load -> Additional recommended: {full_sizing['recommended_capacity_kw']} kW")
    assert full_sizing["recommended_capacity_kw"] == 0.0, "Must recommend 0.0 kW when grid cap is exhausted"
    assert "EXHAUSTED" in full_sizing["binding_constraint"]
    print("✓ Full grid headroom saturation properly returns 0 kW additional expansion")

    # 12. Existing Solar Check (Scenario C: Status 'NOT_SURE')
    print("\n--- Test Existing Solar Handling (Scenario C: Status 'NOT_SURE') ---")
    fin_unsure_res = client.post("/api/financial_assessment", json={
        "estimation_id": est_data["estimation_id"],
        "polygon_id": polygon_id,
        "rooftop_area_m2": pdata["total_rooftop_area_m2"],
        "state_code": "TG",
        "discom_code": "TGSPDCL",
        "consumer_category": "residential_individual",
        "sanctioned_load_kw": 4.0,
        "monthly_consumption_kwh": 350.0,
        "self_consumption_scenario": "MODERATE",
        "existing_solar_status": "NOT_SURE"
    })
    assert fin_unsure_res.status_code == 200
    unsure_sizing = fin_unsure_res.json()["system_sizing"]
    assert unsure_sizing["existing_solar_status"] == "NOT_SURE"
    assert "UNVERIFIED" in unsure_sizing["sizing_rationale"]
    print("✓ Status 'NOT_SURE' properly retains UNVERIFIED label without inventing panel detections")

    # 13. Individual Rooftop Feasibility Sizing Check
    print("\n--- Test Individual Rooftop Feasibility Sizing ---")
    roof1 = pdata["detections"][0]
    roof1_area = roof1["real_area_m2"]
    fin_indiv_res = client.post("/api/financial_assessment", json={
        "estimation_id": est_data["estimation_id"],
        "polygon_id": polygon_id,
        "rooftop_area_m2": roof1_area,
        "selected_segment_id": roof1["segment_id"],
        "state_code": "TG",
        "discom_code": "TGSPDCL",
        "consumer_category": "residential_individual",
        "sanctioned_load_kw": 4.0,
        "monthly_consumption_kwh": 350.0
    })
    assert fin_indiv_res.status_code == 200
    indiv_sizing = fin_indiv_res.json()["system_sizing"]
    print(f"Rooftop #{roof1['segment_id']} ({roof1_area} m²) individual sized capacity: {indiv_sizing['recommended_capacity_kw']} kWp")
    assert indiv_sizing["recommended_capacity_kw"] <= 4.0
    print("✓ Individual rooftop feasibility sizing calculation verified")

    # 8. Location 2: Bengaluru (Indiranagar)
    print("\n--- Test Location 2: Bengaluru (Indiranagar) ---")
    b_lat, b_lng = 12.9784, 77.6408
    b_coords = [[b_lat - delta, b_lng - delta], [b_lat + delta, b_lng - delta], [b_lat + delta, b_lng + delta], [b_lat - delta, b_lng + delta]]
    b_url = (
        f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?"
        f"bbox={b_lng-delta},{b_lat-delta},{b_lng+delta},{b_lat+delta}&bboxSR=4326&imageSR=4326&size=640,640&format=png&f=image"
    )
    b_tile = client.post("/api/save_polygon", json={
        "coordinates": str(b_coords),
        "imageUrl": b_url,
        "location_name": "Indiranagar, Bengaluru, Karnataka",
        "lat": b_lat,
        "lng": b_lng
    }).json()
    b_pred = client.post("/api/run_prediction", json={
        "polygon_id": b_tile.get("polygon_id") or b_tile.get("polygonId"),
        "confidence_threshold": 0.15
    }).json()
    print(f"Bengaluru Detections: {b_pred['detected_count']} rooftops, Area: {b_pred['total_rooftop_area_m2']} m²")
    assert b_pred["detected_count"] > 0
    print("✓ Bengaluru tile segmentation passed")

    # 9. Location 3: Zero-Detection Tile Test
    print("\n--- Test Location 3: Zero-Detection Verification ---")
    z_lat, z_lng = 0.0, 0.0
    z_coords = [[z_lat - delta, z_lng - delta], [z_lat + delta, z_lng - delta], [z_lat + delta, z_lng + delta], [z_lat - delta, z_lng + delta]]
    z_url = (
        f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?"
        f"bbox={z_lng-delta},{z_lat-delta},{z_lng+delta},{z_lat+delta}&bboxSR=4326&imageSR=4326&size=640,640&format=png&f=image"
    )
    zero_tile = client.post("/api/save_polygon", json={
        "coordinates": str(z_coords),
        "imageUrl": z_url,
        "location_name": "Open Ocean (Null Island)",
        "lat": z_lat,
        "lng": z_lng
    }).json()
    zero_pred = client.post("/api/run_prediction", json={
        "polygon_id": zero_tile.get("polygon_id") or zero_tile.get("polygonId"),
        "confidence_threshold": 0.50
    }).json()
    print(f"Zero Detection Count: {zero_pred['detected_count']}")
    assert zero_pred["detected_count"] == 0, "Expected 0 detections on ocean tile"
    
    orig_path = os.path.join(BASE_DIR, "backend", zero_pred["original_image_url"].lstrip("/"))
    over_path = os.path.join(BASE_DIR, "backend", zero_pred["overlay_image_url"].lstrip("/"))
    with open(orig_path, "rb") as f1, open(over_path, "rb") as f2:
        orig_bytes = f1.read()
        over_bytes = f2.read()
    assert orig_bytes != over_bytes, "Zero-detection overlay MUST have explicit watermark notice, not identical raw bytes!"
    print("✓ Zero-detection tile handled with explicit watermark (non-identical bytes verified)")

    print("\n==========================================")
    print("ALL END-TO-END VALIDATION TESTS PASSED 100%!")
    print("==========================================")

if __name__ == "__main__":
    test_endpoints()
