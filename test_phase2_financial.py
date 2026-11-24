import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(r".\Rooftop-Solar-Energy-Potential-Map-main"))

from backend.services.financial_advisor import (
    size_solar_system,
    compute_pm_surya_ghar_cfa,
    get_benchmark_capital_cost,
    simulate_tgspdcl_bill,
    simulate_net_metering_annual,
    compute_lifecycle_metrics
)
from starlette.testclient import TestClient
from backend.main import app

client = TestClient(app)

print("=== 1. TESTING SYSTEM SIZING CONSTRAINTS ===")

# Test 1A: Sizing capped by roof area
# Usable area = 25 m² -> can fit 2.5 kWp. Sanctioned load = 10 kW.
sizing_roof = size_solar_system(usable_area_m2=25.0, sanctioned_load_kw=10.0)
print("Roof-limited sizing:", sizing_roof)
assert sizing_roof["recommended_capacity_kw"] == 2.5
assert sizing_roof["binding_constraint"] == "PHYSICAL_ROOF_AREA"

# Test 1B: Sizing capped by sanctioned load
# Usable area = 150 m² -> can fit 15 kWp. Sanctioned load = 3.0 kW.
sizing_grid = size_solar_system(usable_area_m2=150.0, sanctioned_load_kw=3.0)
print("Grid-limited sizing:", sizing_grid)
assert sizing_grid["recommended_capacity_kw"] == 3.0
assert sizing_grid["binding_constraint"] == "GRID_SANCTIONED_LOAD"

# Test 1C: Zero-Overrun Rule (Floor rounding, never exceed sanctioned limit)
# Usable area = 24 m² (2.4 kWp). Sanctioned load = 2.4 kW.
# Must floor to 2.0 kW, NEVER round up to 2.5 kW!
sizing_overrun = size_solar_system(usable_area_m2=24.0, sanctioned_load_kw=2.4)
print("Zero-overrun sizing:", sizing_overrun)
assert sizing_overrun["recommended_capacity_kw"] == 2.0
assert sizing_overrun["recommended_capacity_kw"] <= 2.4
print(">> System Sizing Constraint Tests: PASSED")


print("\n=== 2. TESTING PM SURYA GHAR CFA SUBSIDY RULES ===")

# Test 2A: 1 kW in General State (Telangana) -> ₹30,000
sub_1kw = compute_pm_surya_ghar_cfa(1.0, "residential_individual", "TG")
assert sub_1kw["cfa_subsidy_amount"] == 30000.0

# Test 2B: 2 kW in General State -> ₹60,000
sub_2kw = compute_pm_surya_ghar_cfa(2.0, "residential_individual", "TG")
assert sub_2kw["cfa_subsidy_amount"] == 60000.0

# Test 2C: 3 kW in General State -> ₹78,000
sub_3kw = compute_pm_surya_ghar_cfa(3.0, "residential_individual", "TG")
assert sub_3kw["cfa_subsidy_amount"] == 78000.0

# Test 2D: 5 kW in General State -> Capped at ₹78,000
sub_5kw = compute_pm_surya_ghar_cfa(5.0, "residential_individual", "TG")
assert sub_5kw["cfa_subsidy_amount"] == 78000.0
assert sub_5kw["is_subsidy_eligible"] is True

# Test 2E: Commercial Category -> ₹0 CFA
sub_comm = compute_pm_surya_ghar_cfa(5.0, "commercial", "TG")
assert sub_comm["cfa_subsidy_amount"] == 0.0
assert sub_comm["is_subsidy_eligible"] is False

# Test 2F: Special Category State (Sikkim) 3 kW -> ₹85,800
sub_sk = compute_pm_surya_ghar_cfa(3.0, "residential_individual", "SK")
assert sub_sk["cfa_subsidy_amount"] == 85800.0
print(">> PM Surya Ghar Subsidy Boundary Tests: PASSED")


print("\n=== 3. TESTING TELANGANA (TGSPDCL) TARIFF SIMULATION ===")

# Test 3A: Group A (Low Consumption, <= 100 units)
# 40 units: 40 * 1.95 = 78.00 + 25.00 fixed + (40 * 0.06 duty = 2.40) = 105.40
bill_grp_a = simulate_tgspdcl_bill(40.0, sanctioned_load_kw=1.0)
print("Group A Bill (40 units):", bill_grp_a)
assert abs(bill_grp_a["total_bill"] - 105.40) < 0.01

# Test 3B: Group B(ii) (Telescopic Slabs, 350 units)
# 0-200 @ 5.10 = 1020.00
# 201-300 @ 7.70 = 770.00
# 301-350 @ 9.00 = 450.00
# Energy charge = 2240.00
# Fixed charge (3 kW * 10) = 30.00
# Duty (350 * 0.06) = 21.00
# Total Bill = 2291.00
bill_grp_b = simulate_tgspdcl_bill(350.0, sanctioned_load_kw=3.0)
print("Group B Bill (350 units):", bill_grp_b)
assert abs(bill_grp_b["total_bill"] - 2291.00) < 0.01
print(">> TGSPDCL Progressive Slab Billing Tests: PASSED")


print("\n=== 4. TESTING NET METERING ENERGY SETTLEMENT (TGERC 2025) ===")

# Test 4A: Net Import Case (Consumption 350 kWh, Gen 250 kWh, 60% self-consumption)
net_import_sim = simulate_net_metering_annual(
    monthly_consumption_kwh=350.0,
    annual_solar_gen_kwh=3000.0,  # 250 kWh/mo
    self_consumption_factor=0.60,
    sanctioned_load_kw=3.0
)
print("Net Metering (Import Case):", net_import_sim["monthly_bill_before_solar"], "->", net_import_sim["monthly_bill_after_solar"])
assert net_import_sim["monthly_bill_after_solar"] < net_import_sim["monthly_bill_before_solar"]
assert net_import_sim["annual_electricity_savings"] > 0

# Test 4B: Net Export Settlement Case (Generation > Consumption)
net_export_sim = simulate_net_metering_annual(
    monthly_consumption_kwh=100.0,
    annual_solar_gen_kwh=3600.0,  # 300 kWh/mo
    self_consumption_factor=0.30,  # 90 kWh self, 210 export, 10 import -> 200 surplus
    sanctioned_load_kw=3.0
)
print("Net Metering (Export Case, Banked Surplus):", net_export_sim["surplus_banked_units"])
assert net_export_sim["surplus_banked_units"] > 0
# Unadjusted surplus is reconciled at APPC rate (₹2.65/kWh)
assert net_export_sim["annual_export_revenue"] > 0
assert net_export_sim["export_settlement_rate"] == 2.65
print(">> Net Metering Settlement Tests: PASSED")


print("\n=== 5. TESTING LIFECYCLE & PAYBACK SAFEGUARDS ===")

# Test 5A: Viable Payback
lc_viable = compute_lifecycle_metrics(gross_system_cost=165000.0, cfa_subsidy=78000.0, annual_electricity_savings=25000.0, annual_solar_gen_kwh=4500.0)
print("Viable Payback:", lc_viable["simple_payback_years"], "years (Status:", lc_viable["payback_status"], ")")
assert lc_viable["payback_status"] == "VIABLE"
assert lc_viable["simple_payback_years"] == round(87000.0 / 25000.0, 2)

# Test 5B: Division by Zero / Non-Amortizable Safeguard
lc_zero = compute_lifecycle_metrics(gross_system_cost=165000.0, cfa_subsidy=78000.0, annual_electricity_savings=0.0, annual_solar_gen_kwh=4500.0)
print("Zero Savings Safeguard:", lc_zero["simple_payback_years"], "(Status:", lc_zero["payback_status"], ")")
assert lc_zero["simple_payback_years"] is None
assert lc_zero["payback_status"] == "NOT_AMORTIZABLE"
print(">> Payback Safeguard Tests: PASSED")


print("\n=== 6. TESTING FASTAPI PHASE 2 ENDPOINTS ===")

# Test 6A: GET /api/tariffs
r_tariffs = client.get("/api/tariffs")
print("Tariffs Status:", r_tariffs.status_code)
tariffs_data = r_tariffs.json()
assert r_tariffs.status_code == 200
assert len(tariffs_data["jurisdictions"]) > 0
assert tariffs_data["jurisdictions"][0]["state_code"] == "TG"
print("Jurisdiction loaded:", tariffs_data["jurisdictions"][0]["state_name"])

# Test 6B: POST /api/financial_assessment with Area Integrity Rule
# Query latest SolarEstimation to use its ID
r_fin = client.post("/api/financial_assessment", json={
    "estimation_id": 1,
    "state_code": "TG",
    "discom_code": "TGSPDCL",
    "consumer_category": "residential_individual",
    "sanctioned_load_kw": 4.0,
    "monthly_consumption_kwh": 350.0,
    "self_consumption_scenario": "MODERATE"
})
print("Financial Assessment Status:", r_fin.status_code)
fin_data = r_fin.json()
print("Sized Capacity:", fin_data["system_sizing"]["recommended_capacity_kw"], "kW")
print("Binding Constraint:", fin_data["system_sizing"]["binding_constraint"])
print("Gross Cost: ₹", fin_data["capex_and_subsidy"]["gross_system_cost"])
print("CFA Subsidy: ₹", fin_data["capex_and_subsidy"]["cfa_subsidy_amount"])
print("Net Investment: ₹", fin_data["capex_and_subsidy"]["net_consumer_investment"])
print("Monthly Bill Before: ₹", fin_data["bill_simulation"]["monthly_bill_before_solar"])
print("Monthly Bill After:  ₹", fin_data["bill_simulation"]["monthly_bill_after_solar"])
print("Simple Payback:", fin_data["metrics"]["simple_payback_years"], "years")
assert r_fin.status_code == 200
# Sized capacity is 2.5 kW -> Subsidy is ₹60,000 + (0.5 * ₹18,000) = ₹69,000.0
assert fin_data["capex_and_subsidy"]["cfa_subsidy_amount"] == 69000.0
assert fin_data["metrics"]["payback_status"] == "VIABLE"
print(">> Phase 2 Financial API Tests: PASSED")

print("\n=======================================================")
print(" ALL PHASE 2 FINANCIAL ENGINE TESTS PASSED WITH 100% SUCCESS!")
print("=======================================================")
