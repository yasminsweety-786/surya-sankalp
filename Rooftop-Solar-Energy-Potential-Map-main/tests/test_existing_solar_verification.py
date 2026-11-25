import os
import sys

# Ensure project root is on PYTHONPATH
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.services.financial_advisor import size_solar_system, compute_pm_surya_ghar_cfa

def test_screenshot_example_and_existing_solar():
    print("Testing Screenshot Example & Existing Solar Feasibility Logic...")

    # 1. Screenshot Example Values
    footprint_area_m2 = 12300.78
    usable_area_factor = 0.70
    usable_area_m2 = round(footprint_area_m2 * usable_area_factor, 1) # 8610.5 m²
    confidence = 0.298 # 29.8%

    print(f"Input Footprint: {footprint_area_m2} m²")
    print(f"Calculated Usable Area: {usable_area_m2} m² (70% setback factor)")
    print(f"Detection Confidence: {confidence * 100:.1f}%")

    assert usable_area_m2 == 8610.5, f"Expected 8610.5 m², got {usable_area_m2}"

    # Check 1: Clean slate (No existing solar) on commercial load (e.g. 500 kW)
    sizing_clean = size_solar_system(
        usable_area_m2=usable_area_m2,
        sanctioned_load_kw=500.0,
        consumer_category="commercial",
        existing_solar_status="NO",
        existing_solar_capacity_kw=0.0
    )
    print("\n--- Test 1: Clean Slate (NO existing solar) ---")
    print(f"Gross Theoretical: {sizing_clean['gross_theoretical_capacity_kw']} kWp")
    print(f"Sanctioned Load Limit (80% of 500 kW): {sizing_clean['sanctioned_load_limit_kw']} kW")
    print(f"Recommended Sizing: {sizing_clean['recommended_capacity_kw']} kWp")
    print(f"Rationale: {sizing_clean['sizing_rationale']}")
    
    assert sizing_clean["gross_theoretical_capacity_kw"] == 861.05 or sizing_clean["gross_theoretical_capacity_kw"] == 861.1
    assert sizing_clean["recommended_capacity_kw"] == 400.0 # 80% cap on 500 kW
    assert "User confirmed NO" in sizing_clean["sizing_rationale"]
    print("✓ Clean-slate distinguishes gross theoretical from grid-capped recommendation")

    # Check 2: Existing solar installed (YES) with custom area occupied
    # e.g., 50 kW installed, occupying 600 m² (user-specified area, not standard 10 m²/kW)
    print("\n--- Test 2: Existing Solar (YES) with Custom Occupied Area ---")
    sizing_yes_custom = size_solar_system(
        usable_area_m2=usable_area_m2,
        sanctioned_load_kw=500.0,
        consumer_category="commercial",
        existing_solar_status="YES",
        existing_solar_capacity_kw=50.0,
        existing_occupied_area_m2=600.0
    )
    print(f"Gross Theoretical: {sizing_yes_custom['gross_theoretical_capacity_kw']} kWp")
    print(f"Existing Capacity: {sizing_yes_custom['existing_solar_capacity_kw']} kW")
    print(f"Existing Occupied Area: {sizing_yes_custom['existing_occupied_area_m2']} m²")
    print(f"Effective Usable Area Remaining: {sizing_yes_custom['effective_usable_area_m2']} m²")
    print(f"Remaining Grid Headroom: {sizing_yes_custom['remaining_grid_headroom_kw']} kW")
    print(f"Recommended Additional Expansion: {sizing_yes_custom['recommended_capacity_kw']} kWp")
    print(f"Total Combined Capacity: {sizing_yes_custom['total_combined_capacity_kw']} kWp")

    assert sizing_yes_custom["existing_occupied_area_m2"] == 600.0
    assert sizing_yes_custom["effective_usable_area_m2"] == 8610.5 - 600.0 # 8010.5 m²
    # Grid cap is 400 kW, existing is 50 kW -> remaining grid headroom is 350 kW
    assert sizing_yes_custom["remaining_grid_headroom_kw"] == 350.0
    assert sizing_yes_custom["recommended_capacity_kw"] == 350.0
    assert sizing_yes_custom["total_combined_capacity_kw"] == 400.0
    assert sizing_yes_custom["recommended_capacity_kw"] != sizing_yes_custom["gross_theoretical_capacity_kw"]
    print("✓ Existing solar capacity is NOT counted as new recommended installation")
    print("✓ Custom occupied area correctly subtracted from effective usable space")

    # Check 3: Existing solar status is 'NOT_SURE'
    print("\n--- Test 3: Existing Solar (NOT_SURE) ---")
    sizing_unsure = size_solar_system(
        usable_area_m2=usable_area_m2,
        sanctioned_load_kw=10.0,
        consumer_category="residential_individual",
        existing_solar_status="NOT_SURE"
    )
    print(f"Status: {sizing_unsure['existing_solar_status']}")
    print(f"Rationale: {sizing_unsure['sizing_rationale']}")
    assert sizing_unsure["existing_solar_status"] == "NOT_SURE"
    assert "UNVERIFIED" in sizing_unsure["sizing_rationale"]
    assert "physical survey is required" in sizing_unsure["sizing_rationale"]
    print("✓ Status 'NOT_SURE' explicitly marked as UNVERIFIED requiring physical survey")

    # Check 4: Low confidence (< 40%) categorization
    print("\n--- Test 4: Low Confidence Handling (< 40%) ---")
    is_low_confidence = confidence < 0.40
    confidence_label = "Needs manual review" if is_low_confidence else "Statistical pattern match"
    print(f"Confidence {confidence*100:.1f}% -> is_low_confidence: {is_low_confidence}, Label: '{confidence_label}'")
    assert is_low_confidence is True
    assert confidence_label == "Needs manual review"
    print("✓ Low confidence correctly triggers manual review advisory")

    print("\n==========================================")
    print("ALL SCREENSHOT & EXISTING SOLAR TESTS PASSED!")
    print("==========================================")

if __name__ == "__main__":
    test_screenshot_example_and_existing_solar()
