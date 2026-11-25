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

def detect_existing_solar_panels_in_rooftop(
    np_img: np.ndarray,
    cand_mask: np.ndarray,
    pixel_area_m2: Optional[float] = None
) -> Dict[str, Any]:
    """
    Performs spectral and morphological computer vision scanning on the rooftop surface
    to detect visible existing photovoltaic (PV) solar panel arrays.
    Distinguishes between:
      1. SOLAR_PANELS_DETECTED
      2. NO_VISIBLE_PANELS_DETECTED
      3. UNABLE_TO_DETERMINE
    """
    roof_pixel_count = int(np.sum(cand_mask))
    if roof_pixel_count < 120:
        return {
            "existing_solar_detected": False,
            "existing_solar_status": "UNABLE_TO_DETERMINE",
            "panel_occupied_m2": 0.0,
            "panel_confidence": 0.35,
            "panel_polygons": [],
            "panel_detection_reason": "Rooftop contour too small for reliable panel resolution (< 120 px)"
        }

    # Analyze in HSV color space
    hsv = cv2.cvtColor(np_img, cv2.COLOR_RGB2HSV)

    # Solar PV panels exhibit low albedo (dark blue or deep charcoal) with high contrast against roof tiles
    blue_pv = cv2.inRange(hsv, np.array([95, 25, 20]), np.array([145, 255, 120]))
    mono_pv = cv2.inRange(hsv, np.array([0, 0, 15]), np.array([180, 80, 85]))
    combined_pv = cv2.bitwise_or(blue_pv, mono_pv)
    roof_pv = cv2.bitwise_and(combined_pv, combined_pv, mask=cand_mask)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    clean_pv = cv2.morphologyEx(roof_pv, cv2.MORPH_OPEN, kernel, iterations=1)
    clean_pv = cv2.morphologyEx(clean_pv, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(clean_pv, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    valid_panel_contours = []
    total_panel_pixels = 0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area >= 30 and area <= (0.75 * roof_pixel_count):
            rect = cv2.minAreaRect(cnt)
            box_area = rect[1][0] * rect[1][1]
            if box_area > 0:
                rectangularity = area / box_area
                if rectangularity >= 0.38:
                    pts = cnt.reshape(-1, 2)
                    valid_panel_contours.append([[round(float(p[0]), 1), round(float(p[1]), 1)] for p in pts])
                    total_panel_pixels += area

    panel_ratio = total_panel_pixels / float(roof_pixel_count) if roof_pixel_count > 0 else 0

    if len(valid_panel_contours) > 0 and 0.05 <= panel_ratio <= 0.75:
        scaled_panel_m2 = round(total_panel_pixels * pixel_area_m2, 1) if pixel_area_m2 else round(total_panel_pixels * 0.1, 1)
        conf = round(min(0.88, 0.65 + panel_ratio * 0.25), 2)
        return {
            "existing_solar_detected": True,
            "existing_solar_status": "SOLAR_PANELS_DETECTED",
            "panel_occupied_m2": scaled_panel_m2,
            "panel_confidence": conf,
            "panel_polygons": valid_panel_contours,
            "panel_detection_reason": f"AI visual scan: rectilinear dark PV panel array identified ({round(panel_ratio*100, 1)}% of roof space, {scaled_panel_m2} m²)"
        }
    else:
        gray = cv2.cvtColor(np_img, cv2.COLOR_RGB2GRAY)
        roof_mean_val = cv2.mean(gray, mask=cand_mask)[0]
        if roof_mean_val < 35:
            return {
                "existing_solar_detected": False,
                "existing_solar_status": "UNABLE_TO_DETERMINE",
                "panel_occupied_m2": 0.0,
                "panel_confidence": 0.40,
                "panel_polygons": [],
                "panel_detection_reason": "Rooftop is heavily shaded by adjacent structures; visual panel verification uncertain"
            }
        else:
            return {
                "existing_solar_detected": False,
                "existing_solar_status": "NO_VISIBLE_PANELS_DETECTED",
                "panel_occupied_m2": 0.0,
                "panel_confidence": 0.85,
                "panel_polygons": [],
                "panel_detection_reason": "AI visual scan: clear roof envelope with no dark PV panel modules detected"
            }

def run_rooftop_segmentation(
    image_path: str,
    bounds: Optional[Dict[str, float]] = None,
    confidence_threshold: float = 0.15
) -> Dict[str, Any]:
    """
    Runs YOLOv8 instance segmentation to detect building rooftop footprints.
    Performs polygon geometric validation, mask-level IoU deduplication,
    sequential segment numbering, and badge rendering matching the table IDs.
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Input image file does not exist: {image_path}")

    # Read and ensure RGB color format
    pil_img = Image.open(image_path)
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    np_img = np.array(pil_img)

    height, width = np_img.shape[:2]
    image_total_area = float(width * height)

    # Ground Sample Distance scale if bounds are available
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

    raw_candidates: List[Dict[str, Any]] = []
    rejected_detections: List[Dict[str, Any]] = []

    for r in results:
        # Check if masks exist for instance segmentation
        if r.masks is not None and len(r.masks.xy) > 0:
            for i, mask_points in enumerate(r.masks.xy):
                conf = float(r.boxes.conf[i]) if r.boxes is not None and i < len(r.boxes.conf) else 0.50

                if len(mask_points) < 3:
                    rejected_detections.append({
                        "temp_id": f"R-{len(rejected_detections)+1}",
                        "confidence": round(conf, 3),
                        "pixel_area": 0.0,
                        "real_area_m2": None,
                        "rejection_reason": "Degenerate polygon (fewer than 3 vertices)",
                        "is_rejected": True
                    })
                    continue

                contour = np.array(mask_points, dtype=np.float32)
                # Contour smoothing to eliminate self-intersections without altering boundary scale
                epsilon = 1.0
                smoothed = cv2.approxPolyDP(contour, epsilon, True)
                if len(smoothed) >= 3:
                    contour = smoothed.reshape(-1, 2)

                pixel_area = float(cv2.contourArea(contour))

                # Validation checks
                if pixel_area < 80.0:
                    rejected_detections.append({
                        "temp_id": f"R-{len(rejected_detections)+1}",
                        "confidence": round(conf, 3),
                        "pixel_area": round(pixel_area, 2),
                        "real_area_m2": round(pixel_area * pixel_area_m2, 2) if pixel_area_m2 else None,
                        "rejection_reason": "Area below minimum building threshold (< 80 px artifact)",
                        "is_rejected": True
                    })
                    continue

                if pixel_area > (0.40 * image_total_area):
                    rejected_detections.append({
                        "temp_id": f"R-{len(rejected_detections)+1}",
                        "confidence": round(conf, 3),
                        "pixel_area": round(pixel_area, 2),
                        "real_area_m2": round(pixel_area * pixel_area_m2, 2) if pixel_area_m2 else None,
                        "rejection_reason": f"Mask exceeds 40% of tile area ({round(pixel_area/image_total_area*100, 1)}% background envelope)",
                        "is_rejected": True
                    })
                    continue

                real_area = round(pixel_area * pixel_area_m2, 2) if pixel_area_m2 else None
                points = [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in contour]

                raw_candidates.append({
                    "confidence": round(conf, 3),
                    "polygon_points": points,
                    "pixel_area": round(pixel_area, 2),
                    "real_area_m2": real_area
                })
        elif r.boxes is not None and len(r.boxes) > 0:
            logger.info("Segmentation masks not returned, falling back to bounding boxes.")
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = float(box.conf[0])
                w_box = max(0.0, x2 - x1)
                h_box = max(0.0, y2 - y1)
                pixel_area = w_box * h_box
                if pixel_area < 80.0 or pixel_area > (0.40 * image_total_area):
                    continue
                real_area = round(pixel_area * pixel_area_m2, 2) if pixel_area_m2 else None
                points = [[round(x1, 2), round(y1, 2)], [round(x2, 2), round(y1, 2)],
                          [round(x2, 2), round(y2, 2)], [round(x1, 2), round(y2, 2)]]
                raw_candidates.append({
                    "confidence": round(conf, 3),
                    "polygon_points": points,
                    "pixel_area": round(pixel_area, 2),
                    "real_area_m2": real_area
                })

    # Sort candidates by confidence descending for Non-Maximum Suppression (IoU deduplication)
    raw_candidates.sort(key=lambda c: c["confidence"], reverse=True)

    accepted_detections: List[Dict[str, Any]] = []
    accepted_masks: List[np.ndarray] = []

    for cand in raw_candidates:
        pts = np.array(cand["polygon_points"], dtype=np.int32)
        cand_mask = np.zeros((height, width), dtype=np.uint8)
        cv2.fillPoly(cand_mask, [pts], 1)
        cand_mask_area = float(np.sum(cand_mask))
        if cand_mask_area <= 0:
            continue

        is_duplicate = False
        dup_reason = ""
        for prev_idx, prev_mask in enumerate(accepted_masks):
            intersection = float(np.sum(cand_mask & prev_mask))
            if intersection > 0:
                union = float(np.sum(cand_mask | prev_mask))
                iou = intersection / union if union > 0 else 0.0
                containment = intersection / cand_mask_area

                # Check for significant duplicate overlap
                if iou > 0.45:
                    is_duplicate = True
                    winner_id = accepted_detections[prev_idx]["segment_id"]
                    dup_reason = f"Duplicate mask: {round(iou * 100, 1)}% IoU overlap with Rooftop #{winner_id}"
                    break
                elif containment > 0.70:
                    is_duplicate = True
                    winner_id = accepted_detections[prev_idx]["segment_id"]
                    dup_reason = f"Sub-segment redundancy: {round(containment * 100, 1)}% contained inside Rooftop #{winner_id}"
                    break

        if is_duplicate:
            rejected_detections.append({
                "temp_id": f"R-{len(rejected_detections)+1}",
                "confidence": cand["confidence"],
                "pixel_area": cand["pixel_area"],
                "real_area_m2": cand["real_area_m2"],
                "rejection_reason": dup_reason,
                "is_rejected": True
            })
        else:
            # Assign persistent, sequential 1-based Segment ID
            seg_id = len(accepted_detections) + 1
            cand["segment_id"] = seg_id

            # Compute centroid for badge placement
            M = cv2.moments(pts)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
            else:
                cx = int(np.mean(pts[:, 0]))
                cy = int(np.mean(pts[:, 1]))
            # Clamp inside image
            cx = max(15, min(width - 15, cx))
            cy = max(15, min(height - 15, cy))
            cand["centroid"] = [cx, cy]

            cand["confidence_label"] = (
                "High statistical match (>= 70%)"
                if cand["confidence"] >= 0.70
                else "Moderate match (< 70%, on-site verification recommended)"
            )
            cand["is_rejected"] = False

            # Run automated visual existing solar panel detection on this rooftop
            panel_scan = detect_existing_solar_panels_in_rooftop(np_img, cand_mask, pixel_area_m2)
            cand.update(panel_scan)

            accepted_detections.append(cand)
            accepted_masks.append(cand_mask)

    # Sort final accepted detections by segment_id
    accepted_detections.sort(key=lambda d: d["segment_id"])

    total_pixels = sum(d["pixel_area"] for d in accepted_detections)
    total_area_m2 = round(sum(d["real_area_m2"] for d in accepted_detections), 2) if pixel_area_m2 is not None else None

    # Generate and save visual segmentation overlay image (View C) with numbered pills
    overlay_path = None
    processed_path = None
    try:
        base_name, _ = os.path.splitext(image_path)
        overlay_path = f"{base_name}_overlay.png"
        processed_path = f"{base_name}_processed.png"

        orig_bgr = cv2.cvtColor(np_img, cv2.COLOR_RGB2BGR)
        overlay_bgr = orig_bgr.copy()

        if len(accepted_detections) > 0:
            # 1. Translucent mask fill
            mask_canvas = np.zeros_like(orig_bgr)
            for d in accepted_detections:
                pts = np.array(d["polygon_points"], dtype=np.int32)
                if len(pts) >= 3:
                    cv2.fillPoly(mask_canvas, [pts], (0, 230, 80))

            cv2.addWeighted(mask_canvas, 0.25, overlay_bgr, 0.75, 0, overlay_bgr)

            # 2. Crisp, vibrant lime green outlines on top
            for d in accepted_detections:
                pts = np.array(d["polygon_points"], dtype=np.int32)
                if len(pts) >= 3:
                    cv2.polylines(overlay_bgr, [pts], isClosed=True, color=(0, 255, 0), thickness=2, lineType=cv2.LINE_AA)

            # 2b. Crisp cyan/azure outlines for detected existing solar panel modules
            for d in accepted_detections:
                if d.get("existing_solar_detected") and d.get("panel_polygons"):
                    for p_contour in d["panel_polygons"]:
                        p_pts = np.array(p_contour, dtype=np.int32)
                        if len(p_pts) >= 3:
                            cv2.polylines(overlay_bgr, [p_pts], isClosed=True, color=(255, 230, 0), thickness=2, lineType=cv2.LINE_AA)

            # 3. Render matching Segment ID badges directly at polygon centroids
            for d in accepted_detections:
                cx, cy = d["centroid"]
                num_text = f"{d['segment_id']}"
                (tw, th), _ = cv2.getTextSize(num_text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                radius = max(11, (tw // 2) + 5)
                # Dark circle background with lime border
                cv2.circle(overlay_bgr, (cx, cy), radius, (15, 23, 42), -1, lineType=cv2.LINE_AA)
                cv2.circle(overlay_bgr, (cx, cy), radius, (0, 255, 0), 1, lineType=cv2.LINE_AA)
                # Crisp white text
                cv2.putText(
                    overlay_bgr,
                    num_text,
                    (cx - (tw // 2), cy + (th // 2)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (255, 255, 255),
                    1,
                    cv2.LINE_AA
                )
        else:
            # Explicit watermark if 0 detections found so overlay is not identical
            cv2.putText(
                overlay_bgr,
                "No Rooftops Detected in Tile (Threshold >= 0.12)",
                (20, 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (0, 0, 255),
                2,
                cv2.LINE_AA
            )

        cv2.imwrite(overlay_path, overlay_bgr)

        # 4. View B: Processed structural edge and contrast detection view
        gray = cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        contrast_img = clahe.apply(gray)
        edges = cv2.Canny(contrast_img, 60, 160)
        processed_bgr = cv2.cvtColor(contrast_img, cv2.COLOR_GRAY2BGR)
        processed_bgr[edges > 0] = [0, 255, 255] # Yellow structural edge highlights
        cv2.imwrite(processed_path, processed_bgr)

    except Exception as overlay_err:
        logger.warning(f"Failed to generate visual overlay image: {overlay_err}")

    return {
        "detected_count": len(accepted_detections),
        "total_rooftop_area_m2": total_area_m2,
        "total_rooftop_pixels": round(total_pixels, 2),
        "conversion_method": conversion_method,
        "source_image_resolution": [width, height],
        "uncertainty_status": uncertainty_status,
        "detections": accepted_detections,
        "rejected_detections": rejected_detections,
        "overlay_image_path": overlay_path,
        "processed_image_path": processed_path
    }
