import subprocess
import time
import sys
import os
import requests
import re

print("=====================================================================")
print(" STARTING SELF-CONTAINED LIVE SERVER & BROWSER CLIENT SIMULATION")
print("=====================================================================")

proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "5000"],
    cwd=os.path.abspath(r".\Rooftop-Solar-Energy-Potential-Map-main"),
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

BASE_URL = "http://127.0.0.1:5000"

try:
    # 1. Wait for server readiness
    for _ in range(15):
        time.sleep(1)
        try:
            r = requests.get(f"{BASE_URL}/api/health", timeout=2)
            if r.status_code == 200:
                print("✓ Server online! Health check response:", r.json())
                break
        except Exception:
            continue
    else:
        out, err = proc.communicate(timeout=3)
        raise RuntimeError(f"Server failed to start. Stdout: {out}, Stderr: {err}")

    session = requests.Session()

    # 2. Fetch Landing Page HTML
    r_home = session.get(f"{BASE_URL}/")
    assert r_home.status_code == 200
    html_content = r_home.text
    print(f"✓ Home Page HTML retrieved: 200 OK (size: {len(html_content):,} bytes)")

    # Extract JS & CSS asset paths from HTML
    js_matches = re.findall(r'src="(/static/js/[^"]+)"', html_content)
    css_matches = re.findall(r'href="(/static/css/[^"]+)"', html_content)
    assert len(js_matches) > 0, "No JS bundle linked in index.html"
    assert len(css_matches) > 0, "No CSS bundle linked in index.html"

    # 3. Fetch Compiled Production Assets
    r_js = session.get(f"{BASE_URL}{js_matches[0]}")
    assert r_js.status_code == 200
    print(f"✓ React JS Production Bundle ({js_matches[0]}): 200 OK (size: {len(r_js.content):,} bytes)")

    r_css = session.get(f"{BASE_URL}{css_matches[0]}")
    assert r_css.status_code == 200
    print(f"✓ React CSS Production Bundle ({css_matches[0]}): 200 OK (size: {len(r_css.content):,} bytes)")

    # 4. Trigger Analysis Flow from Home (Hyderabad Presets)
    r_poly = session.post(f"{BASE_URL}/api/save_polygon", json={
        "coordinates": "17.3850,78.4860; 17.3860,78.4860; 17.3860,78.4870; 17.3850,78.4870",
        "imageUrl": "https://maps.googleapis.com/maps/api/staticmap?center=17.3855,78.4865&zoom=17&size=600x400",
        "user_id": 1,
        "bounds": {"minLat": 17.3850, "maxLat": 17.3860, "minLng": 78.4860, "maxLng": 78.4870}
    })
    assert r_poly.status_code == 200
    poly_id = r_poly.json()["polygon_id"]
    print(f"✓ Save Polygon: 200 OK (polygon_id = {poly_id})")

    r_pred = session.post(f"{BASE_URL}/api/run_prediction", json={
        "polygon_id": poly_id,
        "confidence_threshold": 0.20
    })
    assert r_pred.status_code == 200
    pred_data = r_pred.json()
    print(f"✓ AI Rooftop Detection: 200 OK (detected: {pred_data['detected_count']}, area: {pred_data['total_rooftop_area_m2']:.2f} m²)")

    r_est = session.post(f"{BASE_URL}/api/estimate", json={
        "polygon_id": poly_id,
        "latitude": 17.3855,
        "longitude": 78.4865,
        "efficiency": 0.18,
        "usable_area_factor": 0.70
    })
    assert r_est.status_code == 200
    est_data = r_est.json()
    estimation_id = est_data["estimation_id"]
    print(f"✓ Solar Potential Engine: 200 OK (estimation_id: {estimation_id}, usable area: {est_data['usable_area_m2']} m², annual yield: {est_data['annual_energy_potential_kwh']} kWh)")

    # 5. Fetch Tariffs and Verify FY 2026-27 Schedule & ₹2.57 APPC Export Rate
    r_tariffs = session.get(f"{BASE_URL}/api/tariffs")
    assert r_tariffs.status_code == 200
    tariffs_data = r_tariffs.json()
    discom = tariffs_data["jurisdictions"][0]["discoms"][0]
    print(f"✓ Verified Tariff Schedule: {discom['tariff_order']} (FY: {discom['tariff_financial_year']}, Export: ₹{discom['export_settlement_rate']}/kWh)")
    assert "FY 2026-27" in discom["tariff_order"]
    assert discom["export_settlement_rate"] == 2.57

    # 6. Financial Assessment for Residential (350 kWh/mo, 3 kW load)
    r_fin = session.post(f"{BASE_URL}/api/financial_assessment", json={
        "estimation_id": estimation_id,
        "state_code": "TG",
        "discom_code": "TGSPDCL",
        "consumer_category": "residential_individual",
        "sanctioned_load_kw": 3.0,
        "monthly_consumption_kwh": 350.0,
        "self_consumption_scenario": "MODERATE"
    })
    assert r_fin.status_code == 200
    fin_data = r_fin.json()
    print("\n--- Audited Residential Financial Assessment Results ---")
    print("Sized Capacity:       ", fin_data["system_sizing"]["recommended_capacity_kw"], "kWp (Grid Cap:", fin_data["system_sizing"]["category_grid_limit_pct"], "%)")
    print("Gross System Cost:    ₹", fin_data["capex_and_subsidy"]["gross_system_cost"])
    print("PM Surya Ghar Subsidy:₹", fin_data["capex_and_subsidy"]["cfa_subsidy_amount"])
    print("Net Consumer Capex:   ₹", fin_data["capex_and_subsidy"]["net_consumer_investment"])
    print("Monthly Bill Before:  ₹", fin_data["bill_simulation"]["monthly_bill_before_solar"])
    print("Monthly Bill After:   ₹", fin_data["bill_simulation"]["monthly_bill_after_solar"])
    print("Average Monthly Savings:₹", fin_data["bill_simulation"]["monthly_savings"])
    print("Annual Reconciled:    ₹", fin_data["bill_simulation"]["annual_electricity_savings"])
    print("12-Month Breakdown:   ", len(fin_data["bill_simulation"]["monthly_breakdown"]), "months modeled")
    print("Simple Payback:       ", fin_data["metrics"]["simple_payback_years"], "years (Status:", fin_data["metrics"]["payback_status"], ")")
    print("25-Yr Net Savings:    ₹", fin_data["metrics"]["twenty_five_year_net_savings"], "(Net of initial capex)")
    print("25-Yr Gross Savings:  ₹", fin_data["metrics"]["twenty_five_year_gross_savings"])
    print("Accounting Definition:", fin_data["metrics"]["accounting_definition"])

    # Assertions
    assert fin_data["system_sizing"]["recommended_capacity_kw"] <= 3.0
    assert fin_data["system_sizing"]["category_grid_limit_pct"] == 100.0
    assert fin_data["capex_and_subsidy"]["cfa_subsidy_amount"] == 69000.0
    assert fin_data["capex_and_subsidy"]["net_consumer_investment"] == 68500.0
    assert len(fin_data["bill_simulation"]["monthly_breakdown"]) == 12

    # 7. Commercial 80% Grid Cap and ₹0 Subsidy Verification
    r_comm = session.post(f"{BASE_URL}/api/financial_assessment", json={
        "estimation_id": estimation_id,
        "state_code": "TG",
        "discom_code": "TGSPDCL",
        "consumer_category": "commercial",
        "sanctioned_load_kw": 10.0,
        "monthly_consumption_kwh": 1200.0,
        "self_consumption_scenario": "HIGH"
    })
    assert r_comm.status_code == 200
    fin_comm = r_comm.json()
    print("\n--- Commercial 80% Grid Cap & Subsidy Exclusion ---")
    print("Commercial Sanctioned Load: 10.0 kW -> Allowed Grid Cap:", fin_comm["system_sizing"]["category_grid_limit_pct"], "%")
    print("Commercial Recommended:    ", fin_comm["system_sizing"]["recommended_capacity_kw"], "kWp (<= 8.0 kW)")
    assert fin_comm["system_sizing"]["category_grid_limit_pct"] == 80.0
    assert fin_comm["system_sizing"]["recommended_capacity_kw"] <= 8.0
    assert fin_comm["capex_and_subsidy"]["cfa_subsidy_amount"] == 0.0

    print("\n=====================================================================")
    print(" ALL LIVE APPLICATION CLIENT WORKFLOWS VERIFIED WITH 100% SUCCESS!")
    print("=====================================================================")

finally:
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except Exception:
        proc.kill()
    print("Live server subprocess cleanly terminated.")
