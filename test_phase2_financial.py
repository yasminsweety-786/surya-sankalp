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

print("=== 1. TESTING SYSTEM SIZING & TGERC REG 1 OF 2025 CATEGORY CAPS ===")

# Test 1A: Residential Category (100% of Sanctioned Load)
# Usable area = 150 m² -> can fit 15 kWp. Sanctioned load = 5.0 kW.
sizing_res = size_solar_system(usable_area_m2=150.0, sanctioned_load_kw=5.0, consumer_category="residential_individual")
print("Residential Sizing (100% cap):", sizing_res)
assert sizing_res["recommended_capacity_kw"] == 5.0
assert sizing_res["category_grid_limit_pct"] == 100.0
assert sizing_res["binding_constraint"] == "GRID_SANCTIONED_LOAD"

# Test 1B: Government Category (100% of Sanctioned Load)
sizing_govt = size_solar_system(usable_area_m2=200.0, sanctioned_load_kw=10.0, consumer_category="government")
print("Government Sizing (100% cap):", sizing_govt)
assert sizing_govt["recommended_capacity_kw"] == 10.0
assert sizing_govt["category_grid_limit_pct"] == 100.0

# Test 1C: Commercial Category (80% of Sanctioned Load under TGERC Reg 1 of 2025)
# Usable area = 150 m² -> can fit 15 kWp. Sanctioned load = 5.0 kW -> 80% = 4.0 kW.
sizing_comm = size_solar_system(usable_area_m2=150.0, sanctioned_load_kw=5.0, consumer_category="commercial")
print("Commercial Sizing (80% cap):", sizing_comm)
assert sizing_comm["recommended_capacity_kw"] == 4.0
assert sizing_comm["category_grid_limit_pct"] == 80.0
assert sizing_comm["sanctioned_load_limit_kw"] == 4.0

# Test 1D: Industrial Category (80% of Sanctioned Load)
# Sanctioned load = 10.0 kW -> 80% = 8.0 kW.
sizing_ind = size_solar_system(usable_area_m2=200.0, sanctioned_load_kw=10.0, consumer_category="industrial")
print("Industrial Sizing (80% cap):", sizing_ind)
assert sizing_ind["recommended_capacity_kw"] == 8.0
assert sizing_ind["category_grid_limit_pct"] == 80.0

# Test 1E: Commercial Boundary Zero-Overrun Rule
# Usable area = 100 m². Sanctioned load = 3.0 kW -> 80% = 2.4 kW.
# Must floor to 2.0 kW, NEVER exceed 2.4 kW!
sizing_comm_bound = size_solar_system(usable_area_m2=100.0, sanctioned_load_kw=3.0, consumer_category="commercial")
print("Commercial Boundary Sizing (3 kW load -> 2.4 kW limit -> 2.0 kW stepped):", sizing_comm_bound)
assert sizing_comm_bound["recommended_capacity_kw"] == 2.0
assert sizing_comm_bound["recommended_capacity_kw"] <= 2.4
print(">> System Sizing & Category Cap Tests: PASSED")


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


print("\n=== 3. TESTING TGSPDCL FY 2026-27 TARIFF SLABS & FIXED CHARGE AUDIT ===")

# Test 3A: Group A (Low Consumption, <= 100 units)
# 40 units: 40 * 1.95 = 78.00 + 25.00 fixed + (40 * 0.06 duty = 2.40) = 105.40
bill_grp_a = simulate_tgspdcl_bill(40.0, sanctioned_load_kw=1.0)
print("Group A Bill (40 units):", bill_grp_a)
assert abs(bill_grp_a["total_bill"] - 105.40) < 0.01

# Test 3B: Group B(ii) 350 Units Audit (Contracted Load 3 kW)
# 0-200 @ 5.10 = 1020.00
# 201-300 @ 7.70 = 770.00
# 301-350 @ 9.00 = 450.00
# Energy charge = 2240.00
# Fixed charge (3 kW * 10) = 30.00 (NOT calculated from solar capacity!)
# Duty (350 * 0.06) = 21.00
# Total Bill = 2291.00
bill_350 = simulate_tgspdcl_bill(350.0, sanctioned_load_kw=3.0)
print("Audited 350 Units Bill:", bill_350)
assert abs(bill_350["energy_charge"] - 2240.00) < 0.01
assert abs(bill_350["fixed_charge"] - 30.00) < 0.01
assert abs(bill_350["electricity_duty"] - 21.00) < 0.01
assert abs(bill_350["total_bill"] - 2291.00) < 0.01

# Test 3C: Group B(ii) Upper Slabs in FY 2026-27 (401-800 @ ₹9.50/kWh, >800 @ ₹10.00/kWh)
# 500 units on 4 kW load:
# 0-200 @ 5.10 = 1020.00
# 201-300 @ 7.70 = 770.00
# 301-400 @ 9.00 = 900.00
# 401-500 @ 9.50 = 950.00 (FY 2026-27 updated rate!)
# Energy charge = 3640.00
# Fixed charge = 4 kW * 10 = 40.00
# Duty = 500 * 0.06 = 30.00
# Total Bill = 3710.00
bill_500 = simulate_tgspdcl_bill(500.0, sanctioned_load_kw=4.0)
print("FY 2026-27 Upper Slab Bill (500 units):", bill_500)
assert abs(bill_500["energy_charge"] - 3640.00) < 0.01
assert abs(bill_500["total_bill"] - 3710.00) < 0.01

# 900 units on 5 kW load (>800 units slab @ ₹10.00/kWh):
# 0-200 @ 5.10 = 1020.00
# 201-300 @ 7.70 = 770.00
# 301-400 @ 9.00 = 900.00
# 401-800 @ 9.50 = 3800.00
# 801-900 @ 10.00 = 1000.00 (FY 2026-27 updated rate!)
# Energy charge = 7490.00
# Fixed charge = 5 kW * 10 = 50.00
# Duty = 900 * 0.06 = 54.00
# Total Bill = 7594.00
bill_900 = simulate_tgspdcl_bill(900.0, sanctioned_load_kw=5.0)
print("FY 2026-27 >800 Slab Bill (900 units):", bill_900)
assert abs(bill_900["energy_charge"] - 7490.00) < 0.01
assert abs(bill_900["total_bill"] - 7594.00) < 0.01

# Test 3D: Fixed Charge Audit on 0 Net Units (Solar Generates 100% of Consumption)
# For a 3 kW Group B(ii) connection, when net consumption = 0:
# Fixed charge MUST remain ₹30.00 (3 kW * ₹10/kW), NEVER downgraded to Group A ₹25.00!
bill_zero_net = simulate_tgspdcl_bill(0.0, sanctioned_load_kw=3.0, baseline_units_kwh=350.0)
print("Zero Net Units Bill (3 kW load):", bill_zero_net)
assert bill_zero_net["fixed_charge"] == 30.00
assert bill_zero_net["total_bill"] == 30.00
print(">> TGSPDCL FY 2026-27 Slabs & Fixed Charge Audit: PASSED")


print("\n=== 4. TESTING NET METERING SETTLEMENT (APPC ₹2.57/kWh & 12-MONTH RECONCILIATION) ===")

net_sim = simulate_net_metering_annual(
    monthly_consumption_kwh=350.0,
    annual_solar_gen_kwh=3750.0,  # 2.5 kWp system
    self_consumption_factor=0.60,
    sanctioned_load_kw=3.0,
    consumer_category="residential_individual"
)
print("Export settlement rate:", net_sim["export_settlement_rate"], "(Expected: 2.57)")
assert net_sim["export_settlement_rate"] == 2.57
assert "TGERC Proceeding dated 29-12-2025" in net_sim["settlement_proceeding_ref"]

# Check monthly breakdown reconciliation
breakdown = net_sim["monthly_breakdown"]
assert len(breakdown) == 12, "Monthly breakdown must contain exactly 12 months!"
sum_monthly_savings = sum(m["savings"] for m in breakdown)
expected_annual_savings = round(sum_monthly_savings + net_sim["annual_export_revenue"], 2)
assert abs(net_sim["annual_electricity_savings"] - expected_annual_savings) < 0.05
print(f"Annual Savings Reconciled: ₹{net_sim['annual_electricity_savings']:,.2f} = Sum of 12 months (₹{sum_monthly_savings:,.2f}) + Export Surplus (₹{net_sim['annual_export_revenue']:,.2f})")
print(">> Net Metering Settlement & 12-Month Reconciliation: PASSED")


print("\n=== 5. TESTING LIFECYCLE METRICS (GROSS VS NET DISCLOSURES) ===")

lc = compute_lifecycle_metrics(
    gross_system_cost=137500.0,
    cfa_subsidy=69000.0,
    annual_electricity_savings=net_sim["annual_electricity_savings"],
    annual_solar_gen_kwh=3750.0
)
print("Net Consumer Investment: ₹", lc["net_consumer_investment"])
print("Simple Payback: ", lc["simple_payback_years"], "years (Status:", lc["payback_status"], ")")
print("25-Yr Gross Savings: ₹", lc["twenty_five_year_gross_savings"])
print("25-Yr Net Savings (Net of Initial Capex): ₹", lc["twenty_five_year_net_savings"])
assert lc["net_consumer_investment"] == 68500.0
assert lc["simple_payback_years"] is not None and lc["simple_payback_years"] < 5.0
assert lc["twenty_five_year_gross_savings"] > lc["twenty_five_year_net_savings"]
assert "NET of initial consumer investment" in lc["accounting_definition"]
print(">> Lifecycle Gross vs Net Metrics Tests: PASSED")


print("\n=== 6. TESTING FASTAPI PHASE 2 ENDPOINTS WITH REGULATORY VALUES ===")

# Test 6A: GET /api/tariffs (Verify FY 2026-27 & ₹2.57/kWh rate)
r_tariffs = client.get("/api/tariffs")
assert r_tariffs.status_code == 200
tariffs_data = r_tariffs.json()
tg = tariffs_data["jurisdictions"][0]["discoms"][0]
print("Tariff Order in DB:", tg["tariff_order"])
print("Tariff FY:", tg["tariff_financial_year"])
print("Export Rate in DB:", tg["export_settlement_rate"])
assert "FY 2026-27" in tg["tariff_order"]
assert tg["export_settlement_rate"] == 2.57

# Test 6B: POST /api/financial_assessment for Residential
r_fin_res = client.post("/api/financial_assessment", json={
    "rooftop_area_m2": 150.0,
    "state_code": "TG",
    "discom_code": "TGSPDCL",
    "consumer_category": "residential_individual",
    "sanctioned_load_kw": 3.0,
    "monthly_consumption_kwh": 350.0,
    "self_consumption_scenario": "MODERATE"
})
assert r_fin_res.status_code == 200
fin_res = r_fin_res.json()
assert fin_res["system_sizing"]["category_grid_limit_pct"] == 100.0
assert fin_res["system_sizing"]["recommended_capacity_kw"] <= 3.0
assert fin_res["capex_and_subsidy"]["cfa_subsidy_amount"] == 69000.0  # 2.5 kW -> ₹69k
assert len(fin_res["bill_simulation"]["monthly_breakdown"]) == 12

# Test 6C: POST /api/financial_assessment for Commercial (80% grid cap & ₹0 subsidy)
r_fin_comm = client.post("/api/financial_assessment", json={
    "rooftop_area_m2": 150.0,
    "state_code": "TG",
    "discom_code": "TGSPDCL",
    "consumer_category": "commercial",
    "sanctioned_load_kw": 5.0,
    "monthly_consumption_kwh": 600.0,
    "self_consumption_scenario": "HIGH"
})
assert r_fin_comm.status_code == 200
fin_comm = r_fin_comm.json()
# Commercial 5 kW -> 80% = 4.0 kW limit!
assert fin_comm["system_sizing"]["category_grid_limit_pct"] == 80.0
assert fin_comm["system_sizing"]["recommended_capacity_kw"] <= 4.0
assert fin_comm["capex_and_subsidy"]["cfa_subsidy_amount"] == 0.0
assert fin_comm["capex_and_subsidy"]["is_subsidy_eligible"] is False
print(">> Phase 2 API Verification: PASSED")

print("\n=====================================================================")
print(" ALL AUDITED PHASE 2 REGULATORY & FINANCIAL TESTS PASSED WITH 100% SUCCESS!")
print("=====================================================================")
