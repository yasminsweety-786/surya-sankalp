from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Authentication Schemas
class UserSignupRequest(BaseModel):
    firstname: str
    lastname: str
    email: str
    password: str

class UserLoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    message: str
    user_id: Optional[int] = None
    email: Optional[str] = None

# Polygon Schemas
class GeographicBounds(BaseModel):
    minLat: float
    maxLat: float
    minLng: float
    maxLng: float

class SavePolygonRequest(BaseModel):
    user_id: Optional[int] = 1
    firebase_uid: Optional[str] = None
    session_id: Optional[str] = None
    coordinates: str
    imageUrl: Optional[str] = None
    location_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    bounds: Optional[GeographicBounds] = None

class SavePolygonResponse(BaseModel):
    message: str
    polygon_id: int
    polygonId: Optional[int] = None
    imagePath: str
    imageUrl: Optional[str] = None
    location_name: Optional[str] = None

# Detection Schemas
class RooftopDetectionItem(BaseModel):
    id: Optional[int] = None
    segment_id: Optional[int] = None
    temp_id: Optional[str] = None
    confidence: float
    confidence_label: Optional[str] = None
    polygon_points: List[List[float]] = []  # List of [x, y] coordinates forming the mask contour
    pixel_area: float  # Area in pixels
    real_area_m2: Optional[float] = None  # Scaled area in square meters
    centroid: Optional[List[float]] = None
    is_rejected: Optional[bool] = False
    rejection_reason: Optional[str] = None
    # Automated Existing Solar Panel Detection Fields
    existing_solar_detected: Optional[bool] = False
    existing_solar_status: Optional[str] = "NO_VISIBLE_PANELS_DETECTED"  # SOLAR_PANELS_DETECTED | NO_VISIBLE_PANELS_DETECTED | UNABLE_TO_DETERMINE
    panel_occupied_m2: Optional[float] = 0.0
    panel_confidence: Optional[float] = None
    panel_polygons: Optional[List[List[List[float]]]] = []
    panel_detection_reason: Optional[str] = None

class RunPredictionRequest(BaseModel):
    polygon_id: Optional[int] = None
    confidence_threshold: Optional[float] = 0.15
    image_path: Optional[str] = None

class PredictionResponse(BaseModel):
    message: str
    polygon_id: Optional[int] = None
    detected_count: int
    total_rooftop_area_m2: Optional[float] = None
    total_rooftop_pixels: float
    conversion_method: str
    source_image_resolution: List[int]
    uncertainty_status: str
    detections: List[RooftopDetectionItem]
    rejected_detections: Optional[List[RooftopDetectionItem]] = []
    original_image_url: Optional[str] = None
    overlay_image_url: Optional[str] = None
    processed_image_url: Optional[str] = None

# Solar Estimation Schemas
class SolarEstimateRequest(BaseModel):
    user_id: Optional[int] = 1
    firebase_uid: Optional[str] = None
    polygon_id: Optional[int] = None
    latitude: float
    longitude: float
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    efficiency: Optional[float] = 0.18
    rooftop_area_m2: Optional[float] = None  # If omitted and polygon_id supplied, uses detected area
    usable_area_factor: Optional[float] = 0.70  # Configurable assumption (default 70%)

class SolarEstimateResponse(BaseModel):
    message: str
    estimation_id: Optional[int] = None
    latitude: float
    longitude: float
    efficiency: float
    rooftop_area_m2: float
    usable_area_factor: float
    usable_area_m2: float
    solar_data: Dict[str, float]
    monthly_average_irradiance: Dict[str, float]
    annual_energy_potential: float  # in Wh
    annual_energy_potential_kwh: float
    data_origin: str  # "LIVE_API" | "CACHED" | "REGIONAL_FALLBACK_ESTIMATE"
    is_fallback: bool
    fallback_reason: Optional[str] = None
    source_attribution: str

# Phase 2: Financial Assessment Schemas
class FinancialAssessmentRequest(BaseModel):
    estimation_id: Optional[int] = None  # Area Integrity Rule: Retrieves trusted area from saved SolarEstimation
    polygon_id: Optional[int] = None
    rooftop_area_m2: Optional[float] = None
    state_code: Optional[str] = "TG"
    discom_code: Optional[str] = "TGSPDCL"
    consumer_category: Optional[str] = "residential_individual"
    sanctioned_load_kw: Optional[float] = 3.0
    monthly_consumption_kwh: Optional[float] = 300.0
    self_consumption_scenario: Optional[str] = "MODERATE"  # LOW (35%), MODERATE (60%), HIGH (85%), CUSTOM
    custom_self_consumption_factor: Optional[float] = None
    custom_cost_per_kw: Optional[float] = None
    existing_solar_status: Optional[str] = "NO"  # "NO" | "YES" | "NOT_SURE"
    existing_solar_capacity_kw: Optional[float] = 0.0
    existing_occupied_area_m2: Optional[float] = None
    selected_segment_id: Optional[int] = None

class FinancialAssessmentResponse(BaseModel):
    message: str
    system_sizing: Dict[str, Any]
    capex_and_subsidy: Dict[str, Any]
    bill_simulation: Dict[str, Any]
    metrics: Dict[str, Any]
    disclaimers: List[str]

class DiscomInfo(BaseModel):
    discom_code: str
    discom_name: str
    tariff_order: str
    metering_regulation: str
    source_url: str
    export_settlement_rate: Optional[float] = 2.57
    tariff_financial_year: Optional[str] = "FY 2026-27"
    supported_categories: List[str]

class StateJurisdiction(BaseModel):
    state_code: str
    state_name: str
    discoms: List[DiscomInfo]

class TariffListResponse(BaseModel):
    jurisdictions: List[StateJurisdiction]
