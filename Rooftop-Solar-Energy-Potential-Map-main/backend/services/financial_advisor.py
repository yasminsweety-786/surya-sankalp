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
    annual_consumption_kwh: Optional[float] = None,
    consumer_category: str = "residential_individual",
    existing_solar_capacity_kw: float = 0.0,
    existing_solar_status: str = "NO",
    existing_occupied_area_m2: Optional[float] = None
) -> Dict[str, Any]:
    """
    Sizes the rooftop solar system using a multi-constraint bounding hierarchy.
    Implements TGERC Regulation No. 1 of 2025:
      - Residential and Government: maximum 100% of sanctioned load.
      - Industrial, Commercial and Other: maximum 80% of sanctioned load / contracted demand.
    Applies the Zero-Overrun Rule: Never rounds above the grid statutory limit.
    Correctly accounts for user-reported existing solar installations without double-counting.
    """
    category_lower = consumer_category.lower()
    is_residential_or_govt = (
        "residential" in category_lower or "individual" in category_lower or
        "rwa" in category_lower or "ghs" in category_lower or "govt" in category_lower or "government" in category_lower
    )
    grid_limit_factor = 1.0 if is_residential_or_govt else 0.80
    allowed_grid_kw = sanctioned_load_kw * grid_limit_factor
    specific_area_m2_per_kw = 10.0
    gross_theoretical_kw = round(max(0.0, usable_area_m2 / specific_area_m2_per_kw), 2)

    # Handle existing installation
    existing_kw = float(existing_solar_capacity_kw or 0.0)
    status_upper = (existing_solar_status or "").upper()
    is_existing_flagged = status_upper in ["YES", "SOLAR_PANELS_DETECTED"]

    # If solar panels were visually detected or user confirmed existing, auto-infer capacity from occupied area if kw not given
    if is_existing_flagged and existing_kw <= 0.0 and existing_occupied_area_m2 and float(existing_occupied_area_m2) > 0.0:
        existing_kw = round(float(existing_occupied_area_m2) / specific_area_m2_per_kw, 2)

    has_existing = is_existing_flagged and (existing_kw > 0.0 or (existing_occupied_area_m2 and float(existing_occupied_area_m2) > 0.0))

    if has_existing:
        # Subtract area already physically occupied by existing panels
        if existing_occupied_area_m2 is not None and float(existing_occupied_area_m2) > 0.0:
            existing_occupied_area = float(existing_occupied_area_m2)
        else:
            existing_occupied_area = existing_kw * specific_area_m2_per_kw

        effective_usable_area = max(0.0, usable_area_m2 - existing_occupied_area)

        # Physical headroom for additional expansion
        p_physical_exact = max(0.0, effective_usable_area / specific_area_m2_per_kw)
        p_physical_stepped = math.floor(p_physical_exact * 2.0) / 2.0

        # Grid headroom for additional solar under DISCOM statutory load cap
        remaining_grid_cap = max(0.0, allowed_grid_kw - existing_kw)
        p_grid_stepped = math.floor(remaining_grid_cap * 2.0) / 2.0

        # Consumption matching headroom
        p_consumption_stepped = None
        if annual_consumption_kwh and annual_consumption_kwh > 0:
            existing_annual_gen = existing_kw * 1500.0
            remaining_cons = max(0.0, annual_consumption_kwh - existing_annual_gen)
            p_consumption_stepped = math.floor((remaining_cons / 1500.0) * 2.0) / 2.0

        feasible = min(p_physical_stepped, p_grid_stepped)
        if p_consumption_stepped is not None:
            feasible = min(feasible, p_consumption_stepped)

        recommended_additional_kw = max(0.0, feasible)

        if recommended_additional_kw == 0.0:
            if remaining_grid_cap <= 0.0:
                binding_constraint = "EXISTING_GRID_CAP_EXHAUSTED"
                sizing_rationale = (
                    f"No additional solar capacity recommended: Existing {existing_kw:.1f} kW installation already utilizes "
                    f"100% of your {allowed_grid_kw:.1f} kW statutory grid limit under TGERC 2025."
                )
            else:
                binding_constraint = "EXISTING_ROOFTOP_AREA_EXHAUSTED"
                sizing_rationale = (
                    f"No additional solar capacity recommended: Usable roof space ({usable_area_m2:.1f} m²) is already fully "
                    f"occupied by the existing {existing_kw:.1f} kW system (approx. {existing_occupied_area:.1f} m²)."
                )
        else:
            binding_constraint = "ADDITIONAL_CAPACITY_EXPANSION"
            sizing_rationale = (
                f"Recommended additional expansion of {recommended_additional_kw:.1f} kWp (Total combined: {existing_kw + recommended_additional_kw:.1f} kWp). "
                f"Remaining usable roof: {effective_usable_area:.1f} m², remaining grid headroom: {remaining_grid_cap:.1f} kW."
            )

        return {
            "usable_area_m2": round(usable_area_m2, 2),
            "effective_usable_area_m2": round(effective_usable_area, 2),
            "gross_theoretical_capacity_kw": gross_theoretical_kw,
            "existing_occupied_area_m2": round(existing_occupied_area, 2),
            "existing_solar_capacity_kw": round(existing_kw, 2),
            "existing_solar_status": "YES",
            "physical_max_kw": round(p_physical_stepped, 2),
            "sanctioned_load_limit_kw": round(allowed_grid_kw, 2),
            "remaining_grid_headroom_kw": round(remaining_grid_cap, 2),
            "category_grid_limit_pct": round(grid_limit_factor * 100.0, 1),
            "recommended_capacity_kw": round(recommended_additional_kw, 2),
            "total_combined_capacity_kw": round(existing_kw + recommended_additional_kw, 2),
            "binding_constraint": binding_constraint,
            "sizing_rationale": sizing_rationale
        }

    # Standard clean-slate sizing (No existing solar or unverified)
    p_physical_exact = max(0.0, usable_area_m2 / specific_area_m2_per_kw)
    p_physical_stepped = math.floor(p_physical_exact * 2.0) / 2.0

    p_grid_stepped = math.floor(allowed_grid_kw * 2.0) / 2.0

    p_consumption_stepped = None
    if annual_consumption_kwh and annual_consumption_kwh > 0:
        cuf_kwh_per_kw_year = 1500.0
        p_cons_exact = annual_consumption_kwh / cuf_kwh_per_kw_year
        p_consumption_stepped = math.floor(p_cons_exact * 2.0) / 2.0

    feasible = min(p_physical_stepped, p_grid_stepped)
    if p_consumption_stepped is not None:
        feasible = min(feasible, p_consumption_stepped)

    recommended_kw = max(1.0 if p_physical_stepped >= 1.0 and p_grid_stepped >= 1.0 else 0.5, feasible)
    recommended_kw = min(recommended_kw, p_grid_stepped)

    if recommended_kw == p_grid_stepped and p_grid_stepped < p_physical_stepped:
        binding_constraint = "GRID_SANCTIONED_LOAD"
        cat_desc = "Residential/Govt (100% cap)" if is_residential_or_govt else "Commercial/Industrial (80% cap under TGERC Reg 1 of 2025)"
        sizing_rationale = (
            f"System capacity is capped at {recommended_kw:.1f} kW by statutory grid limits for {cat_desc} "
            f"(Sanctioned load: {sanctioned_load_kw:.1f} kW, allowed capacity: {allowed_grid_kw:.2f} kW). "
            f"Rooftop space could physically accommodate {p_physical_stepped:.1f} kW."
        )
    elif recommended_kw == p_physical_stepped and p_physical_stepped < p_grid_stepped:
        binding_constraint = "PHYSICAL_ROOF_AREA"
        sizing_rationale = (
            f"System capacity is sized to {recommended_kw:.1f} kW based on {usable_area_m2:.1f} m² of usable rooftop area. "
            f"DISCOM statutory grid limit permits up to {p_grid_stepped:.1f} kW."
        )
    else:
        binding_constraint = "COINCIDENT_ROOF_AND_GRID"
        sizing_rationale = (
            f"System capacity is optimized at {recommended_kw:.1f} kW where usable rooftop area and grid statutory limit align."
        )

    if existing_solar_status.upper() == "NOT_SURE":
        sizing_rationale = (
            f"Preliminary potential sized at {recommended_kw:.1f} kWp (UNVERIFIED). "
            f"Existing installation status marked as UNVERIFIED. Full rooftop capacity is not confirmed as new available space; "
            f"an on-site physical survey is required to verify whether solar panels are present."
        )
    elif existing_solar_status.upper() == "NO":
        sizing_rationale += " [Existing installation status: User confirmed NO existing solar panels (User-reported)]."

    return {
        "usable_area_m2": round(usable_area_m2, 2),
        "effective_usable_area_m2": round(usable_area_m2, 2),
        "gross_theoretical_capacity_kw": gross_theoretical_kw,
        "existing_occupied_area_m2": 0.0,
        "existing_solar_capacity_kw": 0.0,
        "existing_solar_status": existing_solar_status.upper(),
        "physical_max_kw": round(p_physical_stepped, 2),
        "sanctioned_load_limit_kw": round(p_grid_stepped, 2),
        "category_grid_limit_pct": round(grid_limit_factor * 100.0, 1),
        "recommended_capacity_kw": round(recommended_kw, 2),
        "total_combined_capacity_kw": round(recommended_kw, 2),
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
    consumer_category: str = "residential_individual",
    baseline_units_kwh: Optional[float] = None
) -> Dict[str, float]:
    """
    Calculates monthly electricity bill based on official TGERC Retail Supply Tariff Order
    for TGSPDCL (FY 2026-27, Effective 01-04-2026 to 31-03-2027).

    Fixed charges are strictly calculated from the consumer's sanctioned connected load
    under their contracted tariff classification, NEVER dynamically downgraded or
    calculated from installed solar capacity.
    """
    units = max(0.0, float(units_kwh))
    load_kw = max(1.0, float(sanctioned_load_kw))
    category_lower = consumer_category.lower()

    if "commercial" in category_lower or "industrial" in category_lower:
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

    # Domestic LT-I (FY 2026-27 Schedule)
    # Determine contracted classification from sanctioned load or baseline consumption
    ref_units = baseline_units_kwh if baseline_units_kwh is not None else units
    is_group_b2 = (load_kw > 2.0) or (ref_units > 200.0)
    is_group_b1 = (not is_group_b2) and ((load_kw > 1.0) or (ref_units > 100.0))

    if is_group_b2:
        # Group B(ii): Slabs (Telescopic)
        # 0-200 @ 5.10, 201-300 @ 7.70, 301-400 @ 9.00, 401-800 @ 9.50, >800 @ 10.00
        tier1 = min(units, 200.0) * 5.10
        rem1 = max(0.0, units - 200.0)
        tier2 = min(rem1, 100.0) * 7.70
        rem2 = max(0.0, rem1 - 100.0)
        tier3 = min(rem2, 100.0) * 9.00
        rem3 = max(0.0, rem2 - 100.0)
        tier4 = min(rem3, 400.0) * 9.50   # FY 2026-27: ₹9.50/kWh
        rem4 = max(0.0, rem3 - 400.0)
        tier5 = rem4 * 10.00              # FY 2026-27: ₹10.00/kWh
        energy_charge = tier1 + tier2 + tier3 + tier4 + tier5
        # Fixed charge: ₹10.00 per kW of sanctioned load per month
        fixed_charge = load_kw * 10.0
    elif is_group_b1:
        # Group B(i): 101 to 200 units
        tier1 = min(units, 100.0) * 3.40
        rem1 = max(0.0, units - 100.0)
        tier2 = rem1 * 4.80
        energy_charge = tier1 + tier2
        fixed_charge = 50.0
    else:
        # Group A: Consumption <= 100 units
        tier1 = min(units, 50.0) * 1.95
        rem1 = max(0.0, units - 50.0)
        tier2 = rem1 * 3.10
        energy_charge = tier1 + tier2
        fixed_charge = 25.0 if units <= 50.0 else 30.0

    duty = units * 0.06  # State electricity duty (6 paise per unit)
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
    Simulates annual net metering energy settlement under TGERC Regulation No. 1 of 2025
    and TGERC Proceeding dated 29-12-2025 (Export settlement rate: ₹2.57/kWh).
    Provides seasonal 12-month reconciliation breakdown.
    """
    appc_rate = 2.57  # Approved APPC export settlement rate per TGERC Proceeding 29-12-2025

    # Seasonal variation factors across 12 months for Telangana (normalized sum = 12.0)
    seasonal_factors = [
        ("January", 0.95), ("February", 1.05), ("March", 1.15),
        ("April", 1.20), ("May", 1.18), ("June", 0.90),
        ("July", 0.75), ("August", 0.75), ("September", 0.88),
        ("October", 1.02), ("November", 1.08), ("December", 1.09)
    ]
    weight_sum = sum(w for _, w in seasonal_factors)
    seasonal_weights = [(m, (w / weight_sum) * 12.0) for m, w in seasonal_factors]

    base_monthly_gen = annual_solar_gen_kwh / 12.0

    monthly_breakdown = []
    total_savings_months = 0.0
    total_surplus_units_year = 0.0
    total_bill_before_year = 0.0
    total_bill_after_year = 0.0

    for month_name, weight in seasonal_weights:
        m_gen = base_monthly_gen * weight
        m_self = m_gen * self_consumption_factor
        m_export = m_gen - m_self
        m_import = max(0.0, monthly_consumption_kwh - m_self)

        if m_import >= m_export:
            net_units = m_import - m_export
            surplus_units = 0.0
            bill_after = simulate_tgspdcl_bill(
                units_kwh=net_units,
                sanctioned_load_kw=sanctioned_load_kw,
                consumer_category=consumer_category,
                baseline_units_kwh=monthly_consumption_kwh
            )["total_bill"]
        else:
            net_units = 0.0
            surplus_units = m_export - m_import
            bill_after = simulate_tgspdcl_bill(
                units_kwh=0.0,
                sanctioned_load_kw=sanctioned_load_kw,
                consumer_category=consumer_category,
                baseline_units_kwh=monthly_consumption_kwh
            )["total_bill"]

        bill_before = simulate_tgspdcl_bill(
            units_kwh=monthly_consumption_kwh,
            sanctioned_load_kw=sanctioned_load_kw,
            consumer_category=consumer_category,
            baseline_units_kwh=monthly_consumption_kwh
        )["total_bill"]

        m_savings = max(0.0, bill_before - bill_after)
        total_savings_months += m_savings
        total_surplus_units_year += surplus_units
        total_bill_before_year += bill_before
        total_bill_after_year += bill_after

        monthly_breakdown.append({
            "month": month_name,
            "solar_gen_kwh": round(m_gen, 1),
            "consumption_kwh": round(monthly_consumption_kwh, 1),
            "self_consumed_kwh": round(m_self, 1),
            "grid_export_kwh": round(m_export, 1),
            "grid_import_kwh": round(m_import, 1),
            "net_billed_units": round(net_units, 1),
            "surplus_banked_units": round(surplus_units, 1),
            "bill_before_solar": round(bill_before, 2),
            "bill_after_solar": round(bill_after, 2),
            "savings": round(m_savings, 2)
        })

    annual_surplus_revenue = round(total_surplus_units_year * appc_rate, 2)
    annual_electricity_savings = round(total_savings_months + annual_surplus_revenue, 2)
    avg_monthly_bill_before = round(total_bill_before_year / 12.0, 2)
    avg_monthly_bill_after = round(total_bill_after_year / 12.0, 2)
    avg_monthly_savings = round(annual_electricity_savings / 12.0, 2)

    return {
        "monthly_consumption_kwh": round(monthly_consumption_kwh, 2),
        "monthly_generation_kwh": round(base_monthly_gen, 2),
        "self_consumption_factor": round(self_consumption_factor, 2),
        "monthly_bill_before_solar": avg_monthly_bill_before,
        "monthly_bill_after_solar": avg_monthly_bill_after,
        "monthly_savings": avg_monthly_savings,
        "annual_export_revenue": annual_surplus_revenue,
        "annual_electricity_savings": annual_electricity_savings,
        "export_settlement_rate": appc_rate,
        "settlement_proceeding_ref": "TGERC Proceeding dated 29-12-2025 (APPC ₹2.57/kWh)",
        "tariff_schedule_ref": "TGERC Retail Supply Tariff Order FY 2026-27",
        "regulation_reference": "TGERC (Rooftop Solar PV Grid Interactive Systems) Regulation No. 1 of 2025",
        "monthly_breakdown": monthly_breakdown
    }

def compute_lifecycle_metrics(
    gross_system_cost: float,
    cfa_subsidy: float,
    annual_electricity_savings: float,
    annual_solar_gen_kwh: float
) -> Dict[str, Any]:
    """
    Computes 25-year lifecycle financial metrics.
    Includes simple payback period, NPV, LCOE, and accounting for PV module degradation (0.7%/yr),
    O&M escalating at 4.0%/yr, and inverter replacement reserve at Year 12 (18% of initial capex).
    Returns both gross savings and savings net of initial consumer investment.
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
    # Assumptions: 0.7% annual degradation after year 1, 1.2% initial capex O&M escalating at 4%,
    # Inverter replacement reserve at Year 12 (18% of capex), 3.5% tariff escalation, 8.5% discount rate
    discount_rate = 0.085
    tariff_escalation = 0.035
    inverter_reserve = gross_system_cost * 0.18
    annual_om_base = gross_system_cost * 0.012

    cumulative_savings_gross = 0.0
    cumulative_net_cashflow = 0.0
    npv_savings = -net_investment
    cumulative_generation_25yr = 0.0

    current_gen = annual_solar_gen_kwh * 0.985  # Year 1 post-stabilization
    current_savings = annual_electricity_savings

    for year in range(1, 26):
        if year > 1:
            current_gen *= (1.0 - 0.007)
            current_savings *= (1.0 + tariff_escalation) * (1.0 - 0.007)

        om_cost = annual_om_base * ((1.0 + 0.04) ** (year - 1))
        inverter_cost = inverter_reserve if year == 12 else 0.0
        net_cashflow_year = current_savings - om_cost - inverter_cost

        cumulative_savings_gross += current_savings
        cumulative_net_cashflow += net_cashflow_year
        npv_savings += net_cashflow_year / ((1.0 + discount_rate) ** year)
        cumulative_generation_25yr += current_gen

    # Twenty-five year net savings = total net cashflow minus initial net investment
    twenty_five_year_net_savings = round(cumulative_net_cashflow - net_investment, 2)

    # Levelized Cost of Electricity (LCOE)
    # LCOE = (Total Lifecycle Cost) / (Total Lifecycle Generation)
    lifecycle_cost = net_investment + (annual_om_base * 25 * 1.5) + inverter_reserve
    lcoe_per_kwh = round(lifecycle_cost / max(1.0, cumulative_generation_25yr), 2)

    return {
        "net_consumer_investment": round(net_investment, 2),
        "simple_payback_years": simple_payback_years,
        "payback_status": payback_status,
        "twenty_five_year_net_savings": twenty_five_year_net_savings,
        "twenty_five_year_gross_savings": round(cumulative_savings_gross, 2),
        "twenty_five_year_net_cashflow_before_capex": round(cumulative_net_cashflow, 2),
        "accounting_definition": "twenty_five_year_net_savings is NET of initial consumer investment, accounting for 0.7%/yr degradation, 1.2%/yr O&M, and yr-12 inverter replacement",
        "npv_savings": round(npv_savings, 2),
        "lcoe_per_kwh": lcoe_per_kwh,
        "cumulative_generation_25yr_kwh": round(cumulative_generation_25yr, 2)
    }
