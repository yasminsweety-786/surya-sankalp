import math
import logging
from typing import Dict, Any, Optional, List, Tuple

logger = logging.getLogger("surya_sankalp.financial_advisor")

# Special category states under PM Surya Ghar (higher CFA rates)
SPECIAL_CATEGORY_STATES = {
    "SK", "UK", "HP", "JK", "LA", "AR", "AS", "MN", "ML", "MZ", "NL", "TR", "AN", "LD"
}

def size_solar_system(
    usable_area_m2: float,
    sanctioned_load_kw: float,
    annual_consumption_kwh: Optional[float] = None
) -> Dict[str, Any]:
    """
    Sizes the rooftop solar system using a multi-constraint bounding hierarchy.
    Applies the Zero-Overrun Rule: Never rounds above the grid sanctioned load.
    """
    # 1. Physical rooftop constraint (10.0 m² / kWp for crystalline Mono-PERC)
    specific_area_m2_per_kw = 10.0
    p_physical_exact = max(0.0, usable_area_m2 / specific_area_m2_per_kw)
    # Floor to standard 0.5 kW intervals
    p_physical_stepped = math.floor(p_physical_exact * 2.0) / 2.0

    # 2. Grid regulatory constraint (100% of sanctioned connected load in Telangana)
    p_grid_exact = max(0.5, float(sanctioned_load_kw))
    p_grid_stepped = math.floor(p_grid_exact * 2.0) / 2.0

    # 3. Consumption matching constraint (if consumption is supplied)
    p_consumption_stepped = None
    if annual_consumption_kwh and annual_consumption_kwh > 0:
        # Standard Indian solar CUF ~ 19% (1 kWp produces ~1500 kWh/year)
        cuf_kwh_per_kw_year = 1500.0
        p_cons_exact = annual_consumption_kwh / cuf_kwh_per_kw_year
        p_consumption_stepped = math.floor(p_cons_exact * 2.0) / 2.0

    # Determine feasible capacity by taking the minimum of all active constraints
    feasible = min(p_physical_stepped, p_grid_stepped)
    if p_consumption_stepped is not None:
        feasible = min(feasible, p_consumption_stepped)

    # Minimum practical rooftop installation is 1.0 kWp (or 0.5 kWp if micro-roof)
    recommended_kw = max(1.0 if p_physical_stepped >= 1.0 else 0.5, feasible)
    # Ensure zero overrun against sanctioned load
    recommended_kw = min(recommended_kw, p_grid_stepped)

    # Determine binding constraint
    if recommended_kw == p_grid_stepped and p_grid_stepped < p_physical_stepped:
        binding_constraint = "GRID_SANCTIONED_LOAD"
        sizing_rationale = (
            f"System capacity is capped at {recommended_kw:.1f} kW by your DISCOM sanctioned load "
            f"({sanctioned_load_kw:.1f} kW). Rooftop space could physically accommodate {p_physical_stepped:.1f} kW."
        )
    elif recommended_kw == p_physical_stepped and p_physical_stepped < p_grid_stepped:
        binding_constraint = "PHYSICAL_ROOF_AREA"
        sizing_rationale = (
            f"System capacity is sized to {recommended_kw:.1f} kW based on {usable_area_m2:.1f} m² of usable rooftop area. "
            f"DISCOM sanctioned load permits up to {p_grid_stepped:.1f} kW."
        )
    else:
        binding_constraint = "COINCIDENT_ROOF_AND_GRID"
        sizing_rationale = (
            f"System capacity is optimized at {recommended_kw:.1f} kW where usable rooftop area and grid sanctioned load align."
        )

    return {
        "usable_area_m2": round(usable_area_m2, 2),
        "physical_max_kw": round(p_physical_stepped, 2),
        "sanctioned_load_limit_kw": round(p_grid_stepped, 2),
        "recommended_capacity_kw": round(recommended_kw, 2),
        "binding_constraint": binding_constraint,
        "sizing_rationale": sizing_rationale
    }

def compute_pm_surya_ghar_cfa(
    capacity_kw: float,
    consumer_category: str = "residential_individual",
    state_code: str = "TG"
) -> Dict[str, Any]:
    """
    Calculates Central Financial Assistance (CFA) under PM Surya Ghar: Muft Bijli Yojana (Feb 2024).
    Distinguishes General vs Special States, Individual Residential vs Group Housing, and Commercial exclusion.
    """
    category_lower = consumer_category.lower()

    # Commercial & Industrial: ₹0 Subsidy
    if "commercial" in category_lower or "industrial" in category_lower or "institution" in category_lower:
        return {
            "cfa_subsidy_amount": 0.0,
            "is_subsidy_eligible": False,
            "scheme_name": "PM Surya Ghar: Muft Bijli Yojana",
            "subsidy_tier_breakdown": (
                "Commercial, Industrial and Non-Domestic consumers are NOT eligible for Central Financial Assistance (CFA). "
                "Eligible for Accelerated Depreciation (40% under Section 32 of Income Tax Act) and GST input credit."
            ),
            "subsidy_status": "NOT_ELIGIBLE_CATEGORY",
            "disclaimer": "Commercial rooftop solar does not qualify for PM Surya Ghar capital subsidy."
        }

    # Group Housing Society / RWA Common Facilities
    if "rwa" in category_lower or "ghs" in category_lower:
        rate_per_kw = 18000.0
        max_cap = 500.0 * rate_per_kw  # Capped at 500 kW total
        eligible_capacity = min(capacity_kw, 500.0)
        subsidy_amount = eligible_capacity * rate_per_kw
        return {
            "cfa_subsidy_amount": round(subsidy_amount, 2),
            "is_subsidy_eligible": True,
            "scheme_name": "PM Surya Ghar: Muft Bijli Yojana (RWA/GHS)",
            "subsidy_tier_breakdown": (
                f"RWA/GHS Common Facilities: ₹18,000/kWp for {eligible_capacity:.1f} kWp = ₹{int(subsidy_amount):,} "
                f"(Scheme limit: max 500 kWp at 3 kWp per household ceiling)."
            ),
            "subsidy_status": "INDICATIVE_SUBJECT_TO_VERIFICATION",
            "disclaimer": "Subject to DISCOM technical feasibility and common meter inspection."
        }

    # Individual Residential Household
    is_special = state_code.upper() in SPECIAL_CATEGORY_STATES
    tier1_rate = 33000.0 if is_special else 30000.0
    tier2_rate = 19800.0 if is_special else 18000.0
    max_cfa_cap = 85800.0 if is_special else 78000.0

    tier1_cap = min(capacity_kw, 2.0)
    tier1_amount = tier1_cap * tier1_rate

    tier2_cap = max(0.0, min(capacity_kw, 3.0) - 2.0)
    tier2_amount = tier2_cap * tier2_rate

    total_subsidy = min(tier1_amount + tier2_amount, max_cfa_cap)

    state_type_str = "Special Category State" if is_special else "General Category State"
    breakdown = (
        f"{state_type_str}: Tier 1 (up to 2 kWp @ ₹{int(tier1_rate):,}/kW): ₹{int(tier1_amount):,}"
    )
    if tier2_cap > 0:
        breakdown += f" + Tier 2 (2-3 kWp @ ₹{int(tier2_rate):,}/kW): ₹{int(tier2_amount):,}"
    if capacity_kw > 3.0:
        breakdown += f" (Capacity > 3 kWp capped at statutory limit of ₹{int(max_cfa_cap):,})"

    return {
        "cfa_subsidy_amount": round(total_subsidy, 2),
        "is_subsidy_eligible": True,
        "scheme_name": "PM Surya Ghar: Muft Bijli Yojana",
        "subsidy_tier_breakdown": breakdown,
        "subsidy_status": "INDICATIVE_SUBJECT_TO_VERIFICATION",
        "disclaimer": (
            "Indicative estimate based on MNRE guidelines. Final subsidy is credited directly via DBT "
            "after commissioning, DISCOM net-meter inspection, and installation of DCR-certified modules."
        )
    }

def get_benchmark_capital_cost(
    capacity_kw: float,
    custom_cost_per_kw: Optional[float] = None
) -> Tuple[float, float, str]:
    """
    Returns (cost_per_kw, gross_system_cost, benchmark_source).
    Uses MNRE/Empaneled vendor market benchmarks FY 2024-25.
    """
    if custom_cost_per_kw and custom_cost_per_kw > 10000.0:
        cost_per_kw = float(custom_cost_per_kw)
        source = "Custom User / Vendor Quotation"
    else:
        if capacity_kw <= 2.0:
            cost_per_kw = 62000.0
        elif capacity_kw <= 3.0:
            cost_per_kw = 55000.0
        elif capacity_kw <= 5.0:
            cost_per_kw = 51000.0
        elif capacity_kw <= 10.0:
            cost_per_kw = 47000.0
        else:
            cost_per_kw = 43000.0
        source = "MNRE Empaneled Benchmark & Market Price Range FY 2024-25"

    gross_cost = round(capacity_kw * cost_per_kw, 2)
    return cost_per_kw, gross_cost, source

def simulate_tgspdcl_bill(
    units_kwh: float,
    sanctioned_load_kw: float = 3.0,
    consumer_category: str = "residential_individual"
) -> Dict[str, float]:
    """
    Calculates monthly electricity bill based on official TGERC Retail Supply Tariff Order
    for TGSPDCL (Telangana Southern Power Distribution Company).
    """
    units = max(0.0, float(units_kwh))
    load_kw = max(1.0, float(sanctioned_load_kw))
    category_lower = consumer_category.lower()

    if "commercial" in category_lower:
        # Commercial LT-II Non-Domestic
        # Slabs: 0-50 @ ₹7.00, 51+ @ ₹11.50
        fixed_charge = load_kw * 75.0
        if units <= 50.0:
            energy_charge = units * 7.00
        else:
            energy_charge = (50.0 * 7.00) + ((units - 50.0) * 11.50)
        duty = units * 0.06
        total = energy_charge + fixed_charge + duty
        return {
            "energy_charge": round(energy_charge, 2),
            "fixed_charge": round(fixed_charge, 2),
            "electricity_duty": round(duty, 2),
            "total_bill": round(total, 2)
        }

    # Domestic LT-I
    # Group A: Consumption <= 100 units
    if units <= 100.0:
        if units <= 50.0:
            energy_charge = units * 1.95
        else:
            energy_charge = (50.0 * 1.95) + ((units - 50.0) * 3.10)
        fixed_charge = 25.0  # Customer charge
    # Group B(i): 101 to 200 units
    elif units <= 200.0:
        energy_charge = (100.0 * 3.40) + ((units - 100.0) * 4.80)
        fixed_charge = 50.0
    # Group B(ii): Above 200 units (Telescopic Slabs)
    else:
        tier1 = 200.0 * 5.10
        rem1 = units - 200.0
        tier2 = min(rem1, 100.0) * 7.70
        rem2 = max(0.0, rem1 - 100.0)
        tier3 = min(rem2, 100.0) * 9.00
        rem3 = max(0.0, rem2 - 100.0)
        tier4 = min(rem3, 400.0) * 10.00
        rem4 = max(0.0, rem3 - 400.0)
        tier5 = rem4 * 11.00
        energy_charge = tier1 + tier2 + tier3 + tier4 + tier5
        fixed_charge = load_kw * 10.0  # ₹10 / kW / month for LT-I(B)(ii)

    duty = units * 0.06  # 6 paise per unit
    total = energy_charge + fixed_charge + duty
    return {
        "energy_charge": round(energy_charge, 2),
        "fixed_charge": round(fixed_charge, 2),
        "electricity_duty": round(duty, 2),
        "total_bill": round(total, 2)
    }

def simulate_net_metering_annual(
    monthly_consumption_kwh: float,
    annual_solar_gen_kwh: float,
    self_consumption_factor: float,
    sanctioned_load_kw: float,
    consumer_category: str = "residential_individual"
) -> Dict[str, Any]:
    """
    Simulates annual net metering energy settlement under TGERC Rooftop Solar Regulation No. 1 of 2025.
    Accounts for self-consumption timing, monthly netting, banking credit, and unadjusted APPC export settlement.
    """
    monthly_gen = annual_solar_gen_kwh / 12.0
    self_consumed = monthly_gen * self_consumption_factor
    grid_export = monthly_gen - self_consumed
    grid_import = max(0.0, monthly_consumption_kwh - self_consumed)

    # Netting:
    if grid_import >= grid_export:
        net_billed_units = grid_import - grid_export
        surplus_banked_units = 0.0
        bill_after_dict = simulate_tgspdcl_bill(net_billed_units, sanctioned_load_kw, consumer_category)
        monthly_bill_after = bill_after_dict["total_bill"]
    else:
        net_billed_units = 0.0
        surplus_banked_units = grid_export - grid_import
        # Minimum monthly charges maintain connected customer charges
        bill_after_dict = simulate_tgspdcl_bill(0.0, sanctioned_load_kw, consumer_category)
        monthly_bill_after = bill_after_dict["total_bill"]

    bill_before_dict = simulate_tgspdcl_bill(monthly_consumption_kwh, sanctioned_load_kw, consumer_category)
    monthly_bill_before = bill_before_dict["total_bill"]

    # Annual unadjusted export settlement at approved APPC rate (₹2.65/kWh under TGERC 2025)
    appc_rate = 2.65
    annual_surplus_revenue = (surplus_banked_units * 12.0) * appc_rate

    monthly_savings = max(0.0, monthly_bill_before - monthly_bill_after)
    annual_electricity_savings = round((monthly_savings * 12.0) + annual_surplus_revenue, 2)

    return {
        "monthly_consumption_kwh": round(monthly_consumption_kwh, 2),
        "monthly_generation_kwh": round(monthly_gen, 2),
        "self_consumption_factor": round(self_consumption_factor, 2),
        "self_consumed_kwh": round(self_consumed, 2),
        "grid_exported_kwh": round(grid_export, 2),
        "grid_imported_kwh": round(grid_import, 2),
        "net_billed_units": round(net_billed_units, 2),
        "surplus_banked_units": round(surplus_banked_units, 2),
        "monthly_bill_before_solar": monthly_bill_before,
        "monthly_bill_after_solar": monthly_bill_after,
        "monthly_savings": monthly_savings,
        "annual_export_revenue": round(annual_surplus_revenue, 2),
        "annual_electricity_savings": annual_electricity_savings,
        "export_settlement_rate": appc_rate,
        "regulation_reference": "TGERC (Rooftop Solar PV Grid Interactive Systems) Regulation No. 1 of 2025"
    }

def compute_lifecycle_metrics(
    gross_system_cost: float,
    cfa_subsidy: float,
    annual_electricity_savings: float,
    annual_solar_gen_kwh: float
) -> Dict[str, Any]:
    """
    Computes 25-year lifecycle financial metrics including simple payback period,
    NPV, LCOE, and accounting for PV module degradation and maintenance reserves.
    Protects against division-by-zero or negative payback periods.
    """
    net_investment = max(0.0, gross_system_cost - cfa_subsidy)

    # Simple Payback Period Safeguard
    if annual_electricity_savings <= 0.0:
        simple_payback_years = None
        payback_status = "NOT_AMORTIZABLE"
    else:
        simple_payback_years = round(net_investment / annual_electricity_savings, 2)
        payback_status = "VIABLE"

    # 25-Year Lifecycle Cashflow Projection
    # Assumptions: 0.6% annual degradation after year 1, 1.2% initial capex O&M escalating at 4%,
    # Inverter replacement reserve at Year 12 (18% of capex), 3.5% tariff escalation, 8.5% discount rate
    discount_rate = 0.085
    tariff_escalation = 0.035
    inverter_reserve = gross_system_cost * 0.18
    annual_om_base = gross_system_cost * 0.012

    cumulative_savings_25yr = 0.0
    npv_savings = -net_investment
    cumulative_generation_25yr = 0.0

    current_gen = annual_solar_gen_kwh * 0.985  # Year 1 post-stabilization
    current_savings = annual_electricity_savings

    for year in range(1, 26):
        if year > 1:
            current_gen *= (1.0 - 0.006)
            current_savings *= (1.0 + tariff_escalation) * (1.0 - 0.006)

        om_cost = annual_om_base * ((1.0 + 0.04) ** (year - 1))
        inverter_cost = inverter_reserve if year == 12 else 0.0
        net_cashflow_year = current_savings - om_cost - inverter_cost

        cumulative_savings_25yr += net_cashflow_year
        npv_savings += net_cashflow_year / ((1.0 + discount_rate) ** year)
        cumulative_generation_25yr += current_gen

    # Levelized Cost of Electricity (LCOE)
    # LCOE = (Total Lifecycle Cost) / (Total Lifecycle Generation)
    lifecycle_cost = net_investment + (annual_om_base * 25 * 1.5) + inverter_reserve
    lcoe_per_kwh = round(lifecycle_cost / max(1.0, cumulative_generation_25yr), 2)

    return {
        "net_consumer_investment": round(net_investment, 2),
        "simple_payback_years": simple_payback_years,
        "payback_status": payback_status,
        "twenty_five_year_net_savings": round(cumulative_savings_25yr, 2),
        "npv_savings": round(npv_savings, 2),
        "lcoe_per_kwh": lcoe_per_kwh,
        "cumulative_generation_25yr_kwh": round(cumulative_generation_25yr, 2)
    }
