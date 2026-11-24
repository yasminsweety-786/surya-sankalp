import os
import sys
import json
import logging
import hashlib
from datetime import datetime
from io import BytesIO
from typing import Optional, List, Dict, Any
import requests
from PIL import Image

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

# Setup local imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from backend.database import init_db, get_db
from backend.schemas import (
    UserSignupRequest, UserLoginRequest, UserResponse,
    SavePolygonRequest, SavePolygonResponse,
    RunPredictionRequest, PredictionResponse, RooftopDetectionItem,
    SolarEstimateRequest, SolarEstimateResponse,
    FinancialAssessmentRequest, FinancialAssessmentResponse, TariffListResponse
)
from backend.services.nasa_power import fetch_solar_data
from backend.services.financial_advisor import (
    size_solar_system,
    compute_pm_surya_ghar_cfa,
    get_benchmark_capital_cost,
    simulate_net_metering_annual,
    compute_lifecycle_metrics
)
from ML.src.pipelines.predict_pipeline import run_rooftop_segmentation

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("surya_sankalp.api")

# Initialize database schema on startup
init_db()

# Directory configurations
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR, exist_ok=True)

FRONTEND_BUILD_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "build"))

def hash_password(password: str) -> str:
    salt = "surya_sankalp_salt_2026"
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()

app = FastAPI(
    title="Surya Sankalp API",
    description="AI-Powered Rooftop Solar Potential, Financial Feasibility & Geospatial Intelligence Platform for India",
    version="1.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploads directory for static inspection
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Surya Sankalp API",
        "database": "sqlite3",
        "timestamp": datetime.now().isoformat()
    }

# ----------------- AUTHENTICATION ENDPOINTS -----------------
@app.post("/api/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(data: UserSignupRequest, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ?", (data.email,))
    if cursor.fetchone():
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    pwd_hash = hash_password(data.password)
    cursor.execute(
        "INSERT INTO users (firstname, lastname, email, password_hash, auth_provider) VALUES (?, ?, ?, ?, 'local')",
        (data.firstname, data.lastname, data.email, pwd_hash)
    )
    db.commit()
    new_id = cursor.lastrowid
    return {"message": "User created successfully", "user_id": new_id, "email": data.email}

@app.post("/api/login", response_model=UserResponse)
def login(data: UserLoginRequest, db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (data.email,))
    user = cursor.fetchone()
    if not user or user["password_hash"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    return {"message": "Login successful", "user_id": user["id"], "email": user["email"]}

# ----------------- POLYGON & IMAGE SAVE ENDPOINT -----------------
@app.post("/api/save_polygon", response_model=SavePolygonResponse)
def save_polygon(data: SavePolygonRequest, db=Depends(get_db)):
    try:
        user_identifier = data.firebase_uid or str(data.user_id or "guest")
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{user_identifier}_{timestamp_str}_polygon_image.png"
        saved_image_path = os.path.join(UPLOAD_DIR, filename)

        # Download remote satellite image or fall back to local sample
        downloaded = False
        if data.imageUrl and (data.imageUrl.startswith("http://") or data.imageUrl.startswith("https://")):
            try:
                resp = requests.get(data.imageUrl, timeout=6)
                if resp.status_code == 200:
                    image = Image.open(BytesIO(resp.content))
                    if image.mode != "RGB":
                        image = image.convert("RGB")
                    image.save(saved_image_path, "PNG")
                    downloaded = True
                else:
                    logger.warning(f"Remote satellite image fetch returned status {resp.status_code}, using local fallback.")
            except Exception as net_err:
                logger.warning(f"Remote satellite image fetch failed ({net_err}), using local sample.")

        if not downloaded:
            sample_src = os.path.join(UPLOAD_DIR, "1_polygon_image.png")
            if os.path.exists(sample_src):
                img = Image.open(sample_src).convert("RGB")
                img.save(saved_image_path, "PNG")
            else:
                blank = Image.new("RGB", (600, 400), color=(120, 120, 120))
                blank.save(saved_image_path, "PNG")

        bounds_json = json.dumps(data.bounds.dict()) if data.bounds else None
        
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO polygons (user_id, firebase_uid, session_id, coordinates, image_path, image_url, source_bounds)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (data.user_id, data.firebase_uid, data.session_id, data.coordinates, saved_image_path, data.imageUrl, bounds_json))
        db.commit()
        polygon_id = cursor.lastrowid

        return {
            "message": "Polygon and image saved successfully",
            "polygon_id": polygon_id,
            "imagePath": saved_image_path
        }
    except Exception as e:
        logger.error(f"Error saving polygon: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- RUN PREDICTION (YOLO SEGMENTATION) -----------------
@app.post("/api/run_prediction", response_model=PredictionResponse)
def api_run_prediction(data: RunPredictionRequest, db=Depends(get_db)):
    try:
        cursor = db.cursor()
        if data.polygon_id:
            cursor.execute("SELECT * FROM polygons WHERE id = ?", (data.polygon_id,))
        else:
            cursor.execute("SELECT * FROM polygons ORDER BY created_at DESC LIMIT 1")
            
        polygon = cursor.fetchone()
        image_path = None
        bounds = None

        if polygon:
            if polygon["image_path"] and os.path.exists(polygon["image_path"]):
                image_path = polygon["image_path"]
            if polygon["source_bounds"]:
                try:
                    bounds = json.loads(polygon["source_bounds"])
                except Exception:
                    bounds = None
        elif data.image_path and os.path.exists(data.image_path):
            image_path = data.image_path

        if not image_path:
            sample_path = os.path.join(UPLOAD_DIR, "1_polygon_image.png")
            if os.path.exists(sample_path):
                image_path = sample_path
            else:
                raise HTTPException(status_code=404, detail="No satellite image found to run prediction on")

        # Run YOLO instance segmentation
        seg_result = run_rooftop_segmentation(
            image_path=image_path,
            bounds=bounds,
            confidence_threshold=data.confidence_threshold or 0.15
        )

        detection_items: list[RooftopDetectionItem] = []
        if polygon:
            # Delete any prior detections for this polygon
            cursor.execute("DELETE FROM rooftop_detections WHERE polygon_id = ?", (polygon["id"],))
            for d in seg_result["detections"]:
                cursor.execute("""
                    INSERT INTO rooftop_detections (polygon_id, confidence, polygon_points, pixel_area, real_area_m2, conversion_method, uncertainty_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    polygon["id"],
                    d["confidence"],
                    json.dumps(d["polygon_points"]),
                    d["pixel_area"],
                    d["real_area_m2"],
                    seg_result["conversion_method"],
                    seg_result["uncertainty_status"]
                ))
                detection_items.append(RooftopDetectionItem(
                    id=cursor.lastrowid,
                    confidence=d["confidence"],
                    polygon_points=d["polygon_points"],
                    pixel_area=d["pixel_area"],
                    real_area_m2=d["real_area_m2"]
                ))
            db.commit()
        else:
            for d in seg_result["detections"]:
                detection_items.append(RooftopDetectionItem(
                    confidence=d["confidence"],
                    polygon_points=d["polygon_points"],
                    pixel_area=d["pixel_area"],
                    real_area_m2=d["real_area_m2"]
                ))

        return {
            "message": "Prediction completed successfully",
            "polygon_id": polygon["id"] if polygon else None,
            "detected_count": seg_result["detected_count"],
            "total_rooftop_area_m2": seg_result["total_rooftop_area_m2"],
            "total_rooftop_pixels": seg_result["total_rooftop_pixels"],
            "conversion_method": seg_result["conversion_method"],
            "source_image_resolution": seg_result["source_image_resolution"],
            "uncertainty_status": seg_result["uncertainty_status"],
            "detections": detection_items
        }
    except Exception as e:
        logger.error(f"Error running prediction: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- SOLAR ENERGY ESTIMATION -----------------
@app.post("/api/estimate", response_model=SolarEstimateResponse)
def estimate(data: SolarEstimateRequest, db=Depends(get_db)):
    try:
        cursor = db.cursor()
        
        # 1. Resolve Rooftop Area: Either from detected polygon or explicit request
        detected_area = None
        if data.polygon_id:
            cursor.execute("SELECT real_area_m2 FROM rooftop_detections WHERE polygon_id = ?", (data.polygon_id,))
            rows = cursor.fetchall()
            real_areas = [r["real_area_m2"] for r in rows if r["real_area_m2"] is not None]
            if real_areas:
                detected_area = sum(real_areas)

        if data.rooftop_area_m2 and data.rooftop_area_m2 > 0:
            rooftop_area = data.rooftop_area_m2
        elif detected_area and detected_area > 0:
            rooftop_area = detected_area
        else:
            rooftop_area = 150.0  # Indian average residential terrace baseline
            logger.info("Using baseline residential rooftop area of 150.0 m²")

        # 2. Configurable usable area factor (Condition 8)
        usable_factor = data.usable_area_factor if data.usable_area_factor is not None else 0.70
        usable_area_m2 = round(rooftop_area * usable_factor, 2)

        # 3. Fetch solar data (Condition 4)
        solar_resp = fetch_solar_data(
            latitude=data.latitude,
            longitude=data.longitude,
            start_date=data.startDate,
            end_date=data.endDate
        )
        solar_data = solar_resp["solar_data"]

        # 4. PV generation calculations
        PR = 0.75  # Standard performance ratio
        monthly_totals: dict[str, float] = {}
        monthly_counts: dict[str, int] = {}
        total_energy_wh = 0.0

        for date_str, insolation_kwh in solar_data.items():
            month_key = date_str[:6]
            monthly_totals[month_key] = monthly_totals.get(month_key, 0.0) + insolation_kwh
            monthly_counts[month_key] = monthly_counts.get(month_key, 0) + 1
            daily_wh = insolation_kwh * 1000.0 * usable_area_m2 * float(data.efficiency or 0.18) * PR
            total_energy_wh += daily_wh

        monthly_averages = {
            m: round(monthly_totals[m] / monthly_counts[m], 2)
            for m in monthly_totals
        }

        annual_energy_wh = round(total_energy_wh, 2)
        annual_energy_kwh = round(total_energy_wh / 1000.0, 2)

        # 5. Persist estimation
        cursor.execute("""
            INSERT INTO solar_estimations (
                user_id, firebase_uid, polygon_id, latitude, longitude,
                start_date, end_date, efficiency, rooftop_area_m2,
                usable_area_factor, usable_area_m2, annual_energy_potential,
                data_origin, is_fallback, fallback_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.user_id,
            data.firebase_uid,
            data.polygon_id,
            data.latitude,
            data.longitude,
            data.startDate or "20230101",
            data.endDate or "20231231",
            data.efficiency or 0.18,
            rooftop_area,
            usable_factor,
            usable_area_m2,
            annual_energy_wh,
            solar_resp["data_origin"],
            1 if solar_resp["is_fallback"] else 0,
            solar_resp["fallback_reason"]
        ))
        db.commit()
        estimation_id = cursor.lastrowid

        return {
            "message": "Solar estimation computed successfully",
            "estimation_id": estimation_id,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "efficiency": data.efficiency or 0.18,
            "rooftop_area_m2": rooftop_area,
            "usable_area_factor": usable_factor,
            "usable_area_m2": usable_area_m2,
            "solar_data": solar_data,
            "monthly_average_irradiance": monthly_averages,
            "annual_energy_potential": annual_energy_wh,
            "annual_energy_potential_kwh": annual_energy_kwh,
            "data_origin": solar_resp["data_origin"],
            "is_fallback": solar_resp["is_fallback"],
            "fallback_reason": solar_resp["fallback_reason"],
            "source_attribution": solar_resp["source_attribution"]
        }
    except Exception as e:
        logger.error(f"Error computing solar estimate: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- PHASE 2: TARIFFS & FINANCIAL ASSESSMENT -----------------
@app.get("/api/tariffs", response_model=TariffListResponse)
def get_tariffs(db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("""
        SELECT state_code, state_name, discom_code, discom_name,
               tariff_order_ref, source_url, GROUP_CONCAT(DISTINCT consumer_category) as categories
        FROM discom_tariffs
        GROUP BY discom_code
    """)
    rows = cursor.fetchall()
    
    jurisdictions_dict = {}
    for r in rows:
        st_code = r["state_code"]
        if st_code not in jurisdictions_dict:
            jurisdictions_dict[st_code] = {
                "state_code": st_code,
                "state_name": r["state_name"],
                "discoms": []
            }
        cats = [c.strip() for c in r["categories"].split(",") if c.strip()]
        jurisdictions_dict[st_code]["discoms"].append({
            "discom_code": r["discom_code"],
            "discom_name": r["discom_name"],
            "tariff_order": r["tariff_order_ref"],
            "metering_regulation": "TGERC Rooftop Solar Regulation No. 1 of 2025 & Proceeding 29-12-2025 (₹2.57/kWh)" if st_code == "TG" else "SERC Rooftop Solar Regulation",
            "source_url": r["source_url"],
            "export_settlement_rate": 2.57 if st_code == "TG" else 2.50,
            "tariff_financial_year": "FY 2026-27",
            "supported_categories": cats
        })
        
    return {"jurisdictions": list(jurisdictions_dict.values())}

@app.post("/api/financial_assessment", response_model=FinancialAssessmentResponse)
def post_financial_assessment(data: FinancialAssessmentRequest, db=Depends(get_db)):
    try:
        cursor = db.cursor()
        
        # Area Integrity Rule: Retrieve trusted rooftop area from saved SolarEstimation record
        trusted_rooftop_area = None
        trusted_usable_area = None
        annual_solar_gen_kwh = None

        if data.estimation_id:
            cursor.execute("SELECT * FROM solar_estimations WHERE id = ?", (data.estimation_id,))
            est = cursor.fetchone()
            if est:
                trusted_rooftop_area = est["rooftop_area_m2"]
                trusted_usable_area = est["usable_area_m2"]
                annual_solar_gen_kwh = est["annual_energy_potential"] / 1000.0  # Wh to kWh

        if not trusted_rooftop_area:
            if data.rooftop_area_m2 and data.rooftop_area_m2 > 0:
                trusted_rooftop_area = data.rooftop_area_m2
                trusted_usable_area = data.rooftop_area_m2 * 0.70
            else:
                trusted_rooftop_area = 150.0
                trusted_usable_area = 105.0

        # 1. Multi-Constraint System Sizing (TGERC Reg 1 of 2025 category grid caps)
        sanctioned_load = data.sanctioned_load_kw or 3.0
        monthly_consumption = data.monthly_consumption_kwh or 300.0
        consumer_category = data.consumer_category or "residential_individual"
        state_code = data.state_code or "TG"

        sizing = size_solar_system(
            usable_area_m2=trusted_usable_area,
            sanctioned_load_kw=sanctioned_load,
            annual_consumption_kwh=monthly_consumption * 12.0,
            consumer_category=consumer_category
        )
        recommended_capacity = sizing["recommended_capacity_kw"]

        # Recalculate annual solar generation for the sized capacity if needed
        # Standard Indian generation benchmark: ~1500 kWh / kWp / year
        annual_gen_for_system = recommended_capacity * 1500.0
        if annual_solar_gen_kwh and annual_solar_gen_kwh > 0 and trusted_usable_area > 0:
            gen_scale = recommended_capacity / max(0.1, (trusted_usable_area / 10.0))
            annual_gen_for_system = round(annual_solar_gen_kwh * gen_scale, 2)

        # 2. PM Surya Ghar Subsidy
        subsidy_info = compute_pm_surya_ghar_cfa(
            capacity_kw=recommended_capacity,
            consumer_category=consumer_category,
            state_code=state_code
        )
        cfa_subsidy = subsidy_info["cfa_subsidy_amount"]

        # 3. Capital Cost
        cost_per_kw, gross_cost, cost_source = get_benchmark_capital_cost(
            capacity_kw=recommended_capacity,
            custom_cost_per_kw=data.custom_cost_per_kw
        )

        # 4. Self-Consumption Scenario
        scenario = (data.self_consumption_scenario or "MODERATE").upper()
        if scenario == "LOW":
            f_self = 0.35
        elif scenario == "HIGH":
            f_self = 0.85
        elif scenario == "CUSTOM" and data.custom_self_consumption_factor:
            f_self = max(0.20, min(0.95, float(data.custom_self_consumption_factor)))
        else:
            f_self = 0.60  # MODERATE default

        # 5. Net Metering Bill Simulation (TGERC 2025 & Proceeding 29-12-2025 @ ₹2.57/kWh)
        bill_sim = simulate_net_metering_annual(
            monthly_consumption_kwh=monthly_consumption,
            annual_solar_gen_kwh=annual_gen_for_system,
            self_consumption_factor=f_self,
            sanctioned_load_kw=sanctioned_load,
            consumer_category=consumer_category
        )

        # 6. Lifecycle Financial Metrics (0.7% degradation, Y12 inverter reserve, gross & net)
        lifecycle = compute_lifecycle_metrics(
            gross_system_cost=gross_cost,
            cfa_subsidy=cfa_subsidy,
            annual_electricity_savings=bill_sim["annual_electricity_savings"],
            annual_solar_gen_kwh=annual_gen_for_system
        )

        # 7. Persist Assessment
        cursor.execute("""
            INSERT INTO financial_assessments (
                estimation_id, polygon_id, state_code, discom_code, consumer_category,
                sanctioned_load_kw, recommended_capacity_kw, binding_constraint,
                gross_system_cost, cfa_subsidy_amount, net_consumer_investment,
                self_consumption_scenario, self_consumption_factor,
                monthly_bill_before_solar, monthly_bill_after_solar,
                annual_electricity_savings, simple_payback_years,
                twenty_five_year_net_savings, rules_version_used, calculation_trace_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.estimation_id or 0,
            data.polygon_id,
            state_code,
            data.discom_code or "TGSPDCL",
            consumer_category,
            sanctioned_load,
            recommended_capacity,
            sizing["binding_constraint"],
            gross_cost,
            cfa_subsidy,
            lifecycle["net_consumer_investment"],
            scenario,
            f_self,
            bill_sim["monthly_bill_before_solar"],
            bill_sim["monthly_bill_after_solar"],
            bill_sim["annual_electricity_savings"],
            lifecycle["simple_payback_years"],
            lifecycle["twenty_five_year_net_savings"],
            "TGERC_FY2026-27_V1",
            json.dumps({"sizing": sizing, "subsidy": subsidy_info, "bill": bill_sim, "lifecycle": lifecycle})
        ))
        db.commit()

        disclaimers = [
            "Financial simulation based on official TGERC Retail Supply Tariff Order FY 2026-27 (effective 01-04-2026 to 31-03-2027) and TGERC Regulation No. 1 of 2025.",
            "Surplus export settlement rate is ₹2.57/kWh per TGERC Proceeding dated 29-12-2025.",
            "Subsidies are indicative Central Financial Assistance (CFA) under PM Surya Ghar and subject to National Portal verification, technical feasibility and DCR module certification.",
            "Bill savings are model projections based on selected self-consumption scenario; actual bills depend on meter readings and DISCOM fuel surcharge adjustments."
        ]

        return {
            "message": "Financial feasibility assessment computed successfully",
            "system_sizing": {
                "trusted_rooftop_area_m2": trusted_rooftop_area,
                "usable_area_m2": trusted_usable_area,
                "physical_max_kw": sizing["physical_max_kw"],
                "sanctioned_load_limit_kw": sizing["sanctioned_load_limit_kw"],
                "category_grid_limit_pct": sizing["category_grid_limit_pct"],
                "recommended_capacity_kw": recommended_capacity,
                "binding_constraint": sizing["binding_constraint"],
                "sizing_rationale": sizing["sizing_rationale"]
            },
            "capex_and_subsidy": {
                "cost_per_kw": cost_per_kw,
                "cost_benchmark_source": cost_source,
                "gross_system_cost": gross_cost,
                "cfa_subsidy_amount": cfa_subsidy,
                "is_subsidy_eligible": subsidy_info["is_subsidy_eligible"],
                "subsidy_tier_breakdown": subsidy_info["subsidy_tier_breakdown"],
                "net_consumer_investment": lifecycle["net_consumer_investment"],
                "subsidy_status": subsidy_info["subsidy_status"]
            },
            "bill_simulation": bill_sim,
            "metrics": lifecycle,
            "disclaimers": disclaimers
        }
    except Exception as e:
        logger.error(f"Error computing financial assessment: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- SERVE STATIC FRONTEND BUILD -----------------
if os.path.exists(FRONTEND_BUILD_DIR):
    static_assets = os.path.join(FRONTEND_BUILD_DIR, "static")
    if os.path.exists(static_assets):
        app.mount("/static", StaticFiles(directory=static_assets), name="frontend_static")

    @app.get("/{full_path:path}")
    def serve_react_app(full_path: str):
        file_path = os.path.join(FRONTEND_BUILD_DIR, full_path)
        if full_path != "" and os.path.exists(file_path):
            return FileResponse(file_path)
        index_file = os.path.join(FRONTEND_BUILD_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Surya Sankalp API is running. Frontend build not present."}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 5000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port)
