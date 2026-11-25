import os
import cv2
import json
import math
import logging
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from PIL import Image

logger = logging.getLogger("surya_sankalp.prediction")

# Lazy-load YOLO model to conserve memory and speed up app boot
_MODEL = None

def get_model():
    global _MODEL
    if _MODEL is None:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        # Resolve path to ML/models/best.pt
        model_path = os.path.abspath(os.path.join(base_dir, "..", "..", "models", "best.pt"))
        if not os.path.exists(model_path):
            # Fallback check
            alt_path = os.path.abspath(os.path.join(base_dir, "..", "models", "best.pt"))
            if os.path.exists(alt_path):
                model_path = alt_path
            else:
                raise FileNotFoundError(f"YOLO segmentation model weights not found at {model_path}")
        
        logger.info(f"Loading YOLOv8 segmentation model from: {model_path}")
        from ultralytics import YOLO
        _MODEL = YOLO(model_path)
    return _MODEL

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS coordinates in meters."""
    R = 6371008.8  # Earth mean radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0)**2
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

def compute_geodesic_scale(
    bounds: Dict[str, float],
    image_width: int,
    image_height: int
) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """
    Computes meters per pixel (GSD) from geographic bounding box and pixel resolution.
    Returns (gsd_x, gsd_y, pixel_area_m2) or (None, None, None) if bounds are invalid.
    """
    try:
        min_lat = float(bounds["minLat"])
        max_lat = float(bounds["maxLat"])
        min_lng = float(bounds["minLng"])
        max_lng = float(bounds["maxLng"])
        
        if max_lat <= min_lat or max_lng <= min_lng or image_width <= 0 or image_height <= 0:
            return None, None, None
            
        mid_lat = (min_lat + max_lat) / 2.0
        mid_lng = (min_lng + max_lng) / 2.0
        
        # Real-world horizontal width across center latitude
        dx_meters = haversine_distance_meters(mid_lat, min_lng, mid_lat, max_lng)
        # Real-world vertical height across center longitude
        dy_meters = haversine_distance_meters(min_lat, mid_lng, max_lat, mid_lng)
        
        gsd_x = dx_meters / float(image_width)
        gsd_y = dy_meters / float(image_height)
        pixel_area_m2 = gsd_x * gsd_y
        return gsd_x, gsd_y, pixel_area_m2
    except Exception as e:
        logger.warning(f"Could not compute geodesic scale from bounds: {e}")
        return None, None, None

def run_rooftop_segmentation(
    image_path: str,
    bounds: Optional[Dict[str, float]] = None,
    confidence_threshold: float = 0.15
) -> Dict[str, Any]:
    """
    Runs YOLOv8 instance segmentation to detect building rooftop footprints.
    Extracts true polygon contours (from result.masks) and computes physical area.
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Input image file does not exist: {image_path}")
        
    # Read and ensure RGB color format
    pil_img = Image.open(image_path)
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    np_img = np.array(pil_img)
    
    height, width = np_img.shape[:2]
    
    # Calculate Ground Sample Distance scale if bounds are available
    gsd_x, gsd_y, pixel_area_m2 = (None, None, None)
    if bounds:
        gsd_x, gsd_y, pixel_area_m2 = compute_geodesic_scale(bounds, width, height)
        
    if pixel_area_m2 is not None:
        conversion_method = "geodesic_bounding_box_scale"
        uncertainty_status = (
            "APPROXIMATE_OPTICAL_SCALE: Real-world area computed from boundary geodesic distances. "
            "Tile perspective distortion and rooftop pitch introduce unquantified variance."
        )
    else:
        conversion_method = "uncalibrated_pixel_only"
        uncertainty_status = (
            "UNCALIBRATED: No geographic coordinate bounds provided. Physical area in m² cannot be computed."
        )
        
    model = get_model()
    # Run inference with confidence threshold
    results = model.predict(np_img, conf=confidence_threshold)
    
    detections: List[Dict[str, Any]] = []
    total_pixels = 0.0
    total_area_m2 = 0.0 if pixel_area_m2 is not None else None
    
    for r in results:
        # Check if masks exist for instance segmentation
        if r.masks is not None and len(r.masks.xy) > 0:
            for i, mask_points in enumerate(r.masks.xy):
                if len(mask_points) < 3:
                    continue
                contour = np.array(mask_points, dtype=np.float32)
                # Shoelace / Green's theorem area in pixels
                pixel_area = float(cv2.contourArea(contour))
                if pixel_area <= 0:
                    continue
                    
                total_pixels += pixel_area
                real_area = round(pixel_area * pixel_area_m2, 2) if pixel_area_m2 else None
                if real_area is not None:
                    total_area_m2 += real_area
                    
                conf = float(r.boxes.conf[i]) if r.boxes is not None and i < len(r.boxes.conf) else 0.50
                # Extract polygon points as list of [x, y]
                points = [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in mask_points]
                
                detections.append({
                    "confidence": round(conf, 3),
                    "polygon_points": points,
                    "pixel_area": round(pixel_area, 2),
                    "real_area_m2": real_area
                })
        elif r.boxes is not None and len(r.boxes) > 0:
            # Fallback if model only predicted bounding boxes
            logger.info("Segmentation masks not returned, falling back to bounding boxes with explicit notation.")
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = float(box.conf[0])
                w_box = max(0.0, x2 - x1)
                h_box = max(0.0, y2 - y1)
                pixel_area = w_box * h_box
                total_pixels += pixel_area
                real_area = round(pixel_area * pixel_area_m2, 2) if pixel_area_m2 else None
                if real_area is not None:
                    total_area_m2 += real_area
                
                points = [[round(x1, 2), round(y1, 2)], [round(x2, 2), round(y1, 2)],
                          [round(x2, 2), round(y2, 2)], [round(x1, 2), round(y2, 2)]]
                detections.append({
                    "confidence": round(conf, 3),
                    "polygon_points": points,
                    "pixel_area": round(pixel_area, 2),
                    "real_area_m2": real_area
                })
                
    if total_area_m2 is not None:
        total_area_m2 = round(total_area_m2, 2)
        
    # Generate and save visual segmentation overlay image
    overlay_path = None
    try:
        base_name, _ = os.path.splitext(image_path)
        overlay_path = f"{base_name}_overlay.png"
        overlay_bgr = cv2.cvtColor(np_img, cv2.COLOR_RGB2BGR)
        mask_canvas = overlay_bgr.copy()
        
        for idx, d in enumerate(detections):
            pts = np.array(d["polygon_points"], dtype=np.int32)
            if len(pts) >= 3:
                color_fill = (0, 165, 255) if idx % 2 == 0 else (255, 180, 0)
                cv2.fillPoly(mask_canvas, [pts], color_fill)
                cv2.polylines(overlay_bgr, [pts], isClosed=True, color=(0, 255, 0), thickness=2)
                cx = int(np.mean(pts[:, 0]))
                cy = int(np.mean(pts[:, 1]))
                area_txt = f"#{idx+1}: {d['real_area_m2']} m2" if d.get("real_area_m2") else f"#{idx+1}"
                cv2.putText(overlay_bgr, area_txt, (max(10, cx - 35), max(20, cy)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                
        cv2.addWeighted(mask_canvas, 0.40, overlay_bgr, 0.60, 0, overlay_bgr)
        cv2.imwrite(overlay_path, overlay_bgr)
    except Exception as overlay_err:
        logger.warning(f"Failed to generate visual overlay image: {overlay_err}")

    return {
        "detected_count": len(detections),
        "total_rooftop_area_m2": total_area_m2,
        "total_rooftop_pixels": round(total_pixels, 2),
        "conversion_method": conversion_method,
        "source_image_resolution": [width, height],
        "uncertainty_status": uncertainty_status,
        "detections": detections,
        "overlay_image_path": overlay_path
    }
