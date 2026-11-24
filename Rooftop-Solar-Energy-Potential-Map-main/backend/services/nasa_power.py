import logging
import math
from datetime import datetime, timedelta
from typing import Dict, Any, Tuple
import requests

logger = logging.getLogger("surya_sankalp.nasa_power")

# In-memory cache for solar data to avoid redundant slow requests: key -> (timestamp, data)
_CACHE: Dict[str, Tuple[datetime, Dict[str, float]]] = {}
CACHE_TTL_HOURS = 24

def _get_cache_key(lat: float, lng: float, start: str, end: str) -> str:
    # Round to 2 decimal places (~1.1 km precision) for caching
    return f"{round(lat, 2)}:{round(lng, 2)}:{start}:{end}"

def _generate_regional_fallback(lat: float, lng: float, start_date: str, end_date: str) -> Dict[str, float]:
    """
    Generates a realistic seasonal solar insolation profile (in kWh/m²/day)
    based on Indian meteorological and MNRE baselines.
    Accounts for latitude and monsoon dips (July-August).
    """
    # India latitude typically 8°N to 36°N. Baseline average daily insolation ~5.0 kWh/m²/day.
    base_insolation = 5.2 if lat < 25.0 else 4.8  # Slightly higher in central/western India
    
    # Parse date range or default to 1 year
    try:
        dt_start = datetime.strptime(start_date, "%Y%m%d")
        dt_end = datetime.strptime(end_date, "%Y%m%d")
    except Exception:
        dt_start = datetime(2023, 1, 1)
        dt_end = datetime(2023, 12, 31)
    
    current = dt_start
    fallback_data: Dict[str, float] = {}
    
    while current <= dt_end:
        day_of_year = current.timetuple().tm_yday
        month = current.month
        
        # Seasonal modulation: Peak in March-May (summer), dip in July-August (monsoon)
        if month in [7, 8]:
            season_factor = 0.72  # Monsoon cloud cover
        elif month in [3, 4, 5]:
            season_factor = 1.18  # Peak summer clear skies
        elif month in [11, 12, 1]:
            season_factor = 0.88  # Winter shorter days / haze
        else:
            season_factor = 1.02
        
        # Slight day-to-day fluctuation
        variation = 0.95 + 0.10 * math.sin(day_of_year * 0.1)
        daily_kwh_m2 = round(base_insolation * season_factor * variation, 2)
        
        key = current.strftime("%Y%m%d")
        fallback_data[key] = daily_kwh_m2
        current += timedelta(days=1)
        
    return fallback_data

def fetch_solar_data(
    latitude: float,
    longitude: float,
    start_date: str = None,
    end_date: str = None,
    timeout_seconds: int = 7
) -> Dict[str, Any]:
    """
    Fetches solar irradiance data from NASA POWER API.
    Explicitly flags whether returned values are LIVE_API, CACHED, or REGIONAL_FALLBACK_ESTIMATE.
    """
    # Standardize dates: Use complete validated meteorological year (2023) if none or invalid provided
    if not start_date or len(start_date) != 8 or not start_date.isdigit():
        start_date = "20230101"
    if not end_date or len(end_date) != 8 or not end_date.isdigit():
        end_date = "20231231"
        
    cache_key = _get_cache_key(latitude, longitude, start_date, end_date)
    
    # 1. Check cache
    if cache_key in _CACHE:
        cached_time, cached_data = _CACHE[cache_key]
        if datetime.now() - cached_time < timedelta(hours=CACHE_TTL_HOURS):
            logger.info(f"Serving NASA POWER solar data from CACHE for {cache_key}")
            return {
                "solar_data": cached_data,
                "data_origin": "CACHED",
                "is_fallback": False,
                "fallback_reason": None,
                "source_attribution": "NASA Langley Research Center POWER Project (Locally Cached)"
            }

    # 2. Query Live NASA POWER API
    url = "https://power.larc.nasa.gov/api/temporal/daily/point"
    params = {
        "parameters": "ALLSKY_SFC_SW_DWN",
        "community": "RE",
        "longitude": longitude,
        "latitude": latitude,
        "start": start_date,
        "end": end_date,
        "format": "json",
    }
    
    try:
        logger.info(f"Querying live NASA POWER API for lat={latitude}, lng={longitude}...")
        resp = requests.get(url, params=params, timeout=timeout_seconds)
        
        if resp.status_code == 200:
            resp_json = resp.json()
            solar_data = resp_json.get("properties", {}).get("parameter", {}).get("ALLSKY_SFC_SW_DWN", {})
            if solar_data:
                # Cache successful response
                _CACHE[cache_key] = (datetime.now(), solar_data)
                logger.info(f"Successfully received LIVE NASA POWER data with {len(solar_data)} days.")
                return {
                    "solar_data": solar_data,
                    "data_origin": "LIVE_API",
                    "is_fallback": False,
                    "fallback_reason": None,
                    "source_attribution": "NASA Langley Research Center POWER Project - Direct Live API"
                }
            else:
                fallback_reason = "NASA POWER API response contained empty ALLSKY_SFC_SW_DWN property"
        else:
            fallback_reason = f"NASA POWER API returned HTTP error {resp.status_code}: {resp.text[:120]}"
            
    except requests.exceptions.Timeout:
        fallback_reason = f"NASA POWER API request timed out after {timeout_seconds}s"
    except Exception as e:
        fallback_reason = f"NASA POWER API network connection error: {str(e)}"

    # 3. Transparent Regional Fallback
    logger.warning(f"Using transparent fallback estimate. Reason: {fallback_reason}")
    fallback_data = _generate_regional_fallback(latitude, longitude, start_date, end_date)
    return {
        "solar_data": fallback_data,
        "data_origin": "REGIONAL_FALLBACK_ESTIMATE",
        "is_fallback": True,
        "fallback_reason": fallback_reason,
        "source_attribution": "MNRE / National Solar Radiation Database Indian Regional Insolation Baseline (Fallback Estimate)"
    }
