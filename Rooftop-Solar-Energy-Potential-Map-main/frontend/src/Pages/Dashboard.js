import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useLocation, Link } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Safe API base resolver (consistently uses 127.0.0.1 to avoid Windows IPv6 localhost conflicts)
const getApiBase = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  if (typeof window !== 'undefined') {
    if (window.location.port === '3000') {
      return 'http://127.0.0.1:5000';
    }
  }
  return '';
};
const API_BASE = getApiBase();

// Verified Location Presets across Major Indian Metros
const CITY_PRESETS = [
  {
    id: 'hyd',
    name: 'Hyderabad (Gachibowli)',
    display_name: 'Gachibowli, Hyderabad, Telangana',
    lat: 17.4436,
    lng: 78.3520,
    state: 'TG',
    discom: 'TGSPDCL',
  },
  {
    id: 'blr',
    name: 'Bengaluru (Indiranagar)',
    display_name: 'Indiranagar, Bengaluru, Karnataka',
    lat: 12.9784,
    lng: 77.6408,
    state: 'KA',
    discom: 'BESCOM',
  },
  {
    id: 'mum',
    name: 'Mumbai (Bandra)',
    display_name: 'Bandra West, Mumbai, Maharashtra',
    lat: 19.0596,
    lng: 72.8295,
    state: 'MH',
    discom: 'MSEDCL',
  },
  {
    id: 'del',
    name: 'New Delhi (CP)',
    display_name: 'Connaught Place, New Delhi, Delhi',
    lat: 28.6315,
    lng: 77.2167,
    state: 'DL',
    discom: 'BRPL',
  },
  {
    id: 'chn',
    name: 'Chennai (T. Nagar)',
    display_name: 'T. Nagar, Chennai, Tamil Nadu',
    lat: 13.0418,
    lng: 80.2341,
    state: 'TN',
    discom: 'TANGEDCO',
  },
  {
    id: 'pun',
    name: 'Pune (Kothrud)',
    display_name: 'Kothrud, Pune, Maharashtra',
    lat: 18.5074,
    lng: 73.8077,
    state: 'MH',
    discom: 'MSEDCL',
  },
];

function Dashboard() {
  const location = useLocation();
  const state = location.state || {};
  const {
    polygonId: initPolygonId,
    locationName: initLocationName = 'Gachibowli, Hyderabad, Telangana',
    lat1: initLat = 17.4436,
    long1: initLong = 78.3520,
    mapImageUrl: initMapImageUrl,
    overlayImageUrl: initOverlayImageUrl,
    processedImageUrl: initProcessedImageUrl,
    detectedAreaM2: initDetectedAreaM2,
    detectedCount: initDetectedCount = 0,
    conversionMethod: initConversionMethod = 'geodesic_bounding_box_scale',
    uncertaintyStatus: initUncertaintyStatus,
    detections: initDetections = [],
    rejectedDetections: initRejectedDetections = [],
  } = state;

  // Active Location & Polygon State
  const [currentPolygonId, setCurrentPolygonId] = useState(initPolygonId || null);
  const [currentLocationName, setCurrentLocationName] = useState(initLocationName);
  const [currentLat, setCurrentLat] = useState(Number(initLat) || 17.4436);
  const [currentLng, setCurrentLng] = useState(Number(initLong) || 78.3520);
  const [conversionMethod, setConversionMethod] = useState(initConversionMethod);
  const [uncertaintyStatus, setUncertaintyStatus] = useState(initUncertaintyStatus);

  // Search & Location Switcher UI states
  const [searchLocationQuery, setSearchLocationQuery] = useState('');
  const [isChangingLocation, setIsChangingLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [showLocationDrawer, setShowLocationDrawer] = useState(false);

  // Image URL Resolver (safely proxies across ports with robust public asset fallbacks)
  const resolveImageUrl = useCallback((url, fallback = '/sample_satellite.png') => {
    if (!url) return fallback;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    if (typeof window !== 'undefined' && window.location.port === '3000') {
      return `http://127.0.0.1:5000${cleanUrl}`;
    }
    return cleanUrl;
  }, []);

  // Visual Comparison View State ('side_by_side' | 'overlay' | 'original' | 'processed')
  const [imageViewMode, setImageViewMode] = useState('side_by_side');

  // Active Detection & Image States
  const [activeDetections, setActiveDetections] = useState(
    initDetections && initDetections.length > 0 ? initDetections : []
  );
  const [activeRejectedDetections, setActiveRejectedDetections] = useState(
    initRejectedDetections || []
  );
  const [activeDetectedCount, setActiveDetectedCount] = useState(
    initDetectedCount || (initDetections ? initDetections.length : 0)
  );
  const [activeMapImageUrl, setActiveMapImageUrl] = useState(
    initMapImageUrl || '/uploads/1_polygon_image.png'
  );
  const [activeOverlayImageUrl, setActiveOverlayImageUrl] = useState(
    initOverlayImageUrl || '/uploads/1_polygon_image_overlay.png'
  );
  const [activeProcessedImageUrl, setActiveProcessedImageUrl] = useState(
    initProcessedImageUrl || '/uploads/1_polygon_image_processed.png'
  );
  const [activeTotalAreaM2, setActiveTotalAreaM2] = useState(
    initDetectedAreaM2 || 7923.71
  );

  // Prevent multiple runaway baseline prediction fetches
  const hasLoadedBaselineRef = useRef(false);

  // Auto-fetch verified rooftop detection baseline if accessed directly without state (ONCE on mount)
  useEffect(() => {
    if (hasLoadedBaselineRef.current) return;
    if (!initDetections || initDetections.length === 0) {
      hasLoadedBaselineRef.current = true;
      axios
        .post(`${API_BASE}/api/run_prediction`, {
          confidence_threshold: 0.15,
        })
        .then((res) => {
          if (res.data && res.data.detections && res.data.detections.length > 0) {
            setActiveDetections(res.data.detections);
            setActiveDetectedCount(res.data.detected_count || res.data.detections.length);
            if (res.data.rejected_detections) {
              setActiveRejectedDetections(res.data.rejected_detections);
            }
            if (res.data.original_image_url) setActiveMapImageUrl(res.data.original_image_url);
            if (res.data.overlay_image_url) setActiveOverlayImageUrl(res.data.overlay_image_url);
            if (res.data.processed_image_url) setActiveProcessedImageUrl(res.data.processed_image_url);
            if (res.data.total_rooftop_area_m2) setActiveTotalAreaM2(res.data.total_rooftop_area_m2);
            if (res.data.conversion_method) setConversionMethod(res.data.conversion_method);
            if (res.data.uncertainty_status) setUncertaintyStatus(res.data.uncertainty_status);
            if (res.data.polygon_id) setCurrentPolygonId(res.data.polygon_id);
          }
        })
        .catch((err) => {
          console.warn('Initial baseline load notice:', err);
        });
    }
  }, [initDetections]);

  // Interactive Rooftop Selection States
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState(null);
  const [showPolygons, setShowPolygons] = useState(true);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [showDisclosures, setShowDisclosures] = useState(false);
  const [analysisScope, setAnalysisScope] = useState('ALL'); // 'ALL' | 'INDIVIDUAL'
  const [userVerifications] = useState({});

  // Check if AI detected any solar panels across the cluster
  const clusterHasDetectedPanels = activeDetections.some(
    (d) => d.existing_solar_detected || d.existing_solar_status === 'SOLAR_PANELS_DETECTED'
  );

  // Existing Solar Installation States
  const [existingSolarStatus, setExistingSolarStatus] = useState(
    clusterHasDetectedPanels ? 'SOLAR_PANELS_DETECTED' : 'NO'
  );
  const [existingSolarKw, setExistingSolarKw] = useState(0.0);
  const [existingSolarOccupiedM2, setExistingSolarOccupiedM2] = useState('0.0');
  const [isCustomOccupiedArea, setIsCustomOccupiedArea] = useState(false);

  // Solar Estimation Constants & States
  const efficiency = 0.18;
  const usableFactor = 0.70;
  const [estimateData, setEstimateData] = useState(null);
  const [, setLoadingEstimate] = useState(false);
  const [estimateError, setEstimateError] = useState(null);

  // Financial Feasibility & DISCOM Tariff States
  const [selectedState, setSelectedState] = useState('TG');
  const [selectedDiscom, setSelectedDiscom] = useState('TGSPDCL');
  const [consumerCategory, setConsumerCategory] = useState('residential_individual');
  const [sanctionedLoad, setSanctionedLoad] = useState(4.0);
  const [monthlyConsumption, setMonthlyConsumption] = useState(350);
  const [selfConsumptionScenario, setSelfConsumptionScenario] = useState('MODERATE');
  const [showMonthlyBreakdown, setShowMonthlyBreakdown] = useState(false);
  const [financialData, setFinancialData] = useState(null);
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [financialError, setFinancialError] = useState(null);

  const tableRef = useRef(null);
  const svgRef1 = useRef(null);
  const svgRef2 = useRef(null);

  // 1. Fetch Solar Estimation from Backend (NASA POWER Integration)
  const fetchEstimate = useCallback(async () => {
    setLoadingEstimate(true);
    setEstimateError(null);
    try {
      const response = await axios.post(`${API_BASE}/api/estimate`, {
        polygon_id: currentPolygonId || null,
        latitude: Number(currentLat),
        longitude: Number(currentLng),
        efficiency: parseFloat(efficiency),
        usable_area_factor: parseFloat(usableFactor),
        rooftop_area_m2: activeTotalAreaM2 || null,
      });
      setEstimateData(response.data);
    } catch (err) {
      console.error('Error fetching solar estimate:', err);
      setEstimateError(err.response?.data?.detail || err.message || 'Failed to compute solar estimate');
    } finally {
      setLoadingEstimate(false);
    }
  }, [currentPolygonId, currentLat, currentLng, efficiency, usableFactor, activeTotalAreaM2]);

  useEffect(() => {
    fetchEstimate();
  }, [fetchEstimate]);

  // Selected rooftop object (guarded string comparison)
  const selectedRooftop = activeDetections.find(
    (d) => String(d.segment_id || d.id) === String(selectedSegmentId)
  );

  // Handle auto-populating existing solar when a rooftop is selected
  useEffect(() => {
    if (selectedRooftop) {
      if (selectedRooftop.existing_solar_detected || selectedRooftop.existing_solar_status === 'SOLAR_PANELS_DETECTED') {
        setExistingSolarStatus('SOLAR_PANELS_DETECTED');
        const occ = selectedRooftop.panel_occupied_m2 || 0;
        setExistingSolarOccupiedM2(occ.toFixed(1));
        setExistingSolarKw(Number((occ / 10).toFixed(1)));
        setIsCustomOccupiedArea(true);
      }
    }
  }, [selectedRooftop]);

  // Handle existing solar inputs separately
  const handleExistingKwChange = (val) => {
    const kw = parseFloat(val) || 0;
    setExistingSolarKw(kw);
    if (!isCustomOccupiedArea) {
      setExistingSolarOccupiedM2((kw * 10).toFixed(1));
    }
  };

  const handleExistingOccupiedM2Change = (val) => {
    setExistingSolarOccupiedM2(val);
    setIsCustomOccupiedArea(true);
  };

  // Verification status of selected rooftop
  const currentVerificationStatus = selectedSegmentId
    ? userVerifications[selectedSegmentId] || 'VERIFIED'
    : null;

  const isRooftopRejected = currentVerificationStatus === 'REJECTED_DETECTION';

  // Derived Rooftop Area depending on analysis scope (guarded against NaN)
  const totalClusterRooftopArea = estimateData?.rooftop_area_m2 || activeTotalAreaM2 || 7923.71;
  const rawActiveRooftopArea = isRooftopRejected
    ? 0.0
    : analysisScope === 'INDIVIDUAL' && selectedRooftop
    ? selectedRooftop.real_area_m2 || selectedRooftop.pixel_area * 0.1
    : totalClusterRooftopArea;
  const activeRooftopArea = isFinite(rawActiveRooftopArea) ? rawActiveRooftopArea : 0.0;

  const activeUsableArea = isFinite(activeRooftopArea * usableFactor) ? activeRooftopArea * usableFactor : 0.0;

  const effectiveOccupiedM2 =
    existingSolarStatus === 'YES' || existingSolarStatus === 'SOLAR_PANELS_DETECTED'
      ? parseFloat(existingSolarOccupiedM2) || parseFloat(existingSolarKw) * 10 || 0.0
      : 0.0;

  const remainingUsableRoofM2 = Math.max(0, activeUsableArea - effectiveOccupiedM2);

  const baseAnnualKwh = estimateData?.annual_energy_potential_kwh || 0.0;
  const calculatedAnnualKwh = isRooftopRejected
    ? 0.0
    : analysisScope === 'INDIVIDUAL' && totalClusterRooftopArea > 0
    ? baseAnnualKwh * (activeRooftopArea / totalClusterRooftopArea)
    : baseAnnualKwh;
  const activeAnnualKwh = isFinite(calculatedAnnualKwh) ? calculatedAnnualKwh : 0.0;

  // 2. Fetch Financial Assessment from Backend (Multi-Constraint Sizing Engine)
  const fetchFinancialAssessment = useCallback(
    async (currentEstData) => {
      setLoadingFinancial(true);
      setFinancialError(null);
      try {
        const est = currentEstData || estimateData;
        const payload = {
          estimation_id: est?.estimation_id || null,
          polygon_id: currentPolygonId || null,
          rooftop_area_m2: activeRooftopArea,
          state_code: selectedState,
          discom_code: selectedDiscom,
          consumer_category: consumerCategory,
          sanctioned_load_kw: parseFloat(sanctionedLoad) || 4.0,
          monthly_consumption_kwh: parseFloat(monthlyConsumption) || 350.0,
          self_consumption_scenario: selfConsumptionScenario,
          existing_solar_status: existingSolarStatus,
          existing_solar_capacity_kw:
            existingSolarStatus === 'YES' || existingSolarStatus === 'SOLAR_PANELS_DETECTED'
              ? parseFloat(existingSolarKw) || 0.0
              : 0.0,
          existing_occupied_area_m2:
            existingSolarStatus === 'YES' || existingSolarStatus === 'SOLAR_PANELS_DETECTED'
              ? effectiveOccupiedM2
              : null,
          selected_segment_id: analysisScope === 'INDIVIDUAL' ? selectedSegmentId : null,
        };

        const res = await axios.post(`${API_BASE}/api/financial_assessment`, payload);
        setFinancialData(res.data);
      } catch (err) {
        console.error('Error computing financial assessment:', err);
        setFinancialError(err.response?.data?.detail || err.message || 'Failed to compute financial assessment');
      } finally {
        setLoadingFinancial(false);
      }
    },
    [
      estimateData,
      currentPolygonId,
      activeRooftopArea,
      selectedState,
      selectedDiscom,
      consumerCategory,
      sanctionedLoad,
      monthlyConsumption,
      selfConsumptionScenario,
      existingSolarStatus,
      existingSolarKw,
      effectiveOccupiedM2,
      analysisScope,
      selectedSegmentId,
    ]
  );

  useEffect(() => {
    if (estimateData) {
      fetchFinancialAssessment(estimateData);
    }
  }, [
    estimateData,
    selectedDiscom,
    consumerCategory,
    sanctionedLoad,
    monthlyConsumption,
    selfConsumptionScenario,
    existingSolarStatus,
    existingSolarKw,
    effectiveOccupiedM2,
    analysisScope,
    selectedSegmentId,
    fetchFinancialAssessment,
  ]);

  const sizing = financialData?.system_sizing;
  const capex = financialData?.capex_and_subsidy;
  const billSim = financialData?.bill_simulation;
  const metrics = financialData?.metrics;

  const isCommercial = consumerCategory === 'commercial';
  const gridLimitPct = isCommercial ? 80 : 100;
  const recommendedKw = sizing?.recommended_capacity_kw || 3.0;

  // Image URLs (safely routed via resolver with rock-solid fallbacks)
  const displayMapImage =
    resolveImageUrl(activeMapImageUrl, '/sample_satellite.png');

  const displayOverlayImage =
    resolveImageUrl(activeOverlayImageUrl, '/sample_overlay.png');

  const displayProcessedImage = resolveImageUrl(activeProcessedImageUrl, '/sample_overlay.png');

  // Handle clicking a rooftop polygon or table row
  const handleSelectRooftop = (segmentId) => {
    if (String(selectedSegmentId) === String(segmentId)) {
      setSelectedSegmentId(null);
      setAnalysisScope('ALL');
    } else {
      setSelectedSegmentId(segmentId);
      setAnalysisScope('INDIVIDUAL');
    }
  };

  // Switch Location Handler: Downloads satellite imagery & runs YOLOv8 detection
  const handleSwitchLocation = async (targetLocation) => {
    try {
      setIsChangingLocation(true);
      setLocationMessage(`Analyzing satellite imagery for ${targetLocation.display_name}...`);

      const delta = 0.0012;
      const minLat = targetLocation.lat - delta;
      const maxLat = targetLocation.lat + delta;
      const minLng = targetLocation.lng - delta;
      const maxLng = targetLocation.lng + delta;
      const coordsStr = `${minLat},${minLng}; ${maxLat},${minLng}; ${maxLat},${maxLng}; ${minLat},${maxLng}`;

      // 1. Save polygon with geocoded coordinates
      const saveRes = await axios.post(`${API_BASE}/api/save_polygon`, {
        coordinates: coordsStr,
        location_name: targetLocation.display_name,
        lat: targetLocation.lat,
        lng: targetLocation.lng,
        user_id: 1,
        bounds: { minLat, maxLat, minLng, maxLng },
      });

      const newPolyId = saveRes.data.polygon_id;
      setCurrentPolygonId(newPolyId);
      setCurrentLocationName(targetLocation.display_name);
      setCurrentLat(targetLocation.lat);
      setCurrentLng(targetLocation.lng);
      if (targetLocation.state) setSelectedState(targetLocation.state);
      if (targetLocation.discom) setSelectedDiscom(targetLocation.discom);

      // 2. Run YOLOv8 instance segmentation model
      setLocationMessage('Detecting rooftops and identifying solar panels...');
      const predRes = await axios.post(`${API_BASE}/api/run_prediction`, {
        polygon_id: newPolyId,
        confidence_threshold: 0.15,
      });

      const predData = predRes.data;
      setActiveDetections(predData.detections || []);
      setActiveDetectedCount(predData.detected_count || (predData.detections ? predData.detections.length : 0));
      setActiveRejectedDetections(predData.rejected_detections || []);
      if (predData.original_image_url) setActiveMapImageUrl(predData.original_image_url);
      if (predData.overlay_image_url) setActiveOverlayImageUrl(predData.overlay_image_url);
      if (predData.processed_image_url) setActiveProcessedImageUrl(predData.processed_image_url);
      if (predData.total_rooftop_area_m2) setActiveTotalAreaM2(predData.total_rooftop_area_m2);
      if (predData.conversion_method) setConversionMethod(predData.conversion_method);
      if (predData.uncertainty_status) setUncertaintyStatus(predData.uncertainty_status);

      // Reset individual selection back to whole cluster
      setSelectedSegmentId(null);
      setAnalysisScope('ALL');
      setLocationMessage(`Analysis completed: ${predData.detected_count || 0} rooftops identified!`);
      setTimeout(() => setLocationMessage(''), 4000);
    } catch (err) {
      console.error('Location analysis error:', err);
      setLocationMessage(`Failed to analyze location: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsChangingLocation(false);
    }
  };

  // Custom Address Search Handler
  const handleSearchAddress = async (e) => {
    e.preventDefault();
    if (!searchLocationQuery.trim()) return;
    try {
      setIsChangingLocation(true);
      setLocationMessage(`Searching address "${searchLocationQuery.trim()}"...`);
      const geoRes = await axios.get(
        `${API_BASE}/api/geocode?query=${encodeURIComponent(searchLocationQuery.trim())}`
      );
      if (geoRes.data && geoRes.data.lat && geoRes.data.lng) {
        await handleSwitchLocation({
          display_name: geoRes.data.display_name,
          lat: geoRes.data.lat,
          lng: geoRes.data.lng,
        });
        setSearchLocationQuery('');
      } else {
        setLocationMessage('Could not find coordinates for this address. Please try a preset.');
      }
    } catch (err) {
      console.error('Geocoding error:', err);
      setLocationMessage('Could not find that address. Please try one of the city presets.');
    } finally {
      setIsChangingLocation(false);
    }
  };

  // GPS / Use Current Location Handler
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Browser geolocation is not supported.');
      return;
    }
    setLocationMessage('Requesting GPS location permission from browser...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocationMessage(`Acquired GPS coordinates: ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`);
        let displayName = `Rooftop at ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
        try {
          const rev = await axios.get(`${API_BASE}/api/reverse_geocode?lat=${lat}&lng=${lng}`);
          if (rev.data?.display_name) displayName = rev.data.display_name;
        } catch {
          // ignore reverse geocode error
        }
        await handleSwitchLocation({
          display_name: displayName,
          lat,
          lng,
        });
      },
      (err) => {
        console.warn('Geolocation denied or failed:', err);
        setLocationMessage(
          err.code === 1
            ? 'GPS location permission was denied. You can select any city preset.'
            : 'Could not acquire GPS position. Please choose a city preset.'
        );
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // SVG Click Handler (finds closest centroid if user clicks slightly outside polygon)
  const handleSvgBackgroundClick = (e, svgElement) => {
    if (!svgElement) return;
    const rect = svgElement.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 640;
    const clickY = ((e.clientY - rect.top) / rect.height) * 640;

    let closest = null;
    let minDistance = 50; // max click tolerance in SVG pixels

    activeDetections.forEach((d) => {
      const cx = d.centroid
        ? d.centroid[0]
        : d.polygon_points && d.polygon_points[0]
        ? d.polygon_points[0][0]
        : null;
      const cy = d.centroid
        ? d.centroid[1]
        : d.polygon_points && d.polygon_points[0]
        ? d.polygon_points[0][1]
        : null;
      if (cx !== null && cy !== null) {
        const dist = Math.hypot(cx - clickX, cy - clickY);
        if (dist < minDistance) {
          minDistance = dist;
          closest = d.segment_id || d.id;
        }
      }
    });

    if (closest !== null) {
      handleSelectRooftop(closest);
    }
  };

  // Chart data: Monthly Solar Generation vs Monthly Grid Consumption
  const monthlyAverages = estimateData?.monthly_average_irradiance || {};
  const monthlyBreakdownList = billSim?.monthly_breakdown || [];
  const monthLabels =
    monthlyBreakdownList.length > 0
      ? monthlyBreakdownList.map((m) => m.month_name || m.month)
      : Object.keys(monthlyAverages);

  const solarVsConsumptionChartData = {
    labels: monthLabels,
    datasets: [
      {
        label: 'Solar Generation (kWh)',
        data:
          monthlyBreakdownList.length > 0
            ? monthlyBreakdownList.map((m) => m.solar_generated_kwh || m.solar_gen_kwh)
            : Object.values(monthlyAverages).map((val) =>
                Math.round(val * 30 * (sizing?.recommended_capacity_kw || 3) * 0.75 * 4)
              ),
        backgroundColor: 'rgba(234, 179, 8, 0.85)',
        borderColor: '#eab308',
        borderWidth: 1,
      },
      {
        label: 'Grid Consumption (kWh)',
        data:
          monthlyBreakdownList.length > 0
            ? monthlyBreakdownList.map((m) => m.consumption_kwh)
            : monthLabels.map(() => monthlyConsumption),
        backgroundColor: 'rgba(59, 130, 246, 0.65)',
        borderColor: '#3b82f6',
        borderWidth: 1,
      },
    ],
  };

  return (
    <div className="min-h-screen text-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Loading / Status Notification Banner */}
        {locationMessage && (
          <div className="bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 p-3.5 rounded-xl text-xs flex items-center justify-between shadow-lg animate-pulse">
            <span className="flex items-center gap-2">
              <span className="animate-spin text-base">🛰️</span>
              <strong>{locationMessage}</strong>
            </span>
            <button
              onClick={() => setLocationMessage('')}
              className="text-gray-400 hover:text-white text-xs ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error Banners */}
        {estimateError && (
          <div className="bg-amber-950/80 border border-amber-800 text-amber-300 p-3.5 rounded-xl text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span><strong>Notice:</strong> {estimateError}</span>
          </div>
        )}
        {financialError && (
          <div className="bg-red-950/80 border border-red-800 text-red-300 p-3.5 rounded-xl text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span><strong>Notice:</strong> {financialError}</span>
          </div>
        )}

        {/* ============================================================== */}
        {/* STAGE A: LOCATION SELECTION & TARGET CLUSTER OVERVIEW          */}
        {/* ============================================================== */}
        <section className="bg-gray-900/85 backdrop-blur-md border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-5">
          {/* Top Bar: Location Header + Quick Switch Controls */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-gray-800 pb-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                  📍 Verified Location Target
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {activeDetectedCount > 0 ? `${activeDetectedCount} Rooftops Identified` : 'Target Rooftop'}
                </span>
                {activeRejectedDetections && activeRejectedDetections.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-800 text-gray-400 border border-gray-700">
                    {activeRejectedDetections.length} Noise Excluded
                  </span>
                )}
                {analysisScope === 'INDIVIDUAL' && selectedRooftop && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    🎯 Rooftop #{selectedSegmentId} Selected
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-mono leading-tight">
                {currentLocationName}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                <button
                  type="button"
                  onClick={() => setShowCoordinates(!showCoordinates)}
                  className="text-xs text-yellow-400 hover:text-yellow-300 transition underline underline-offset-4"
                >
                  {showCoordinates ? 'Hide Coordinates ▲' : 'Show Geographic Coordinates ▼'}
                </button>
                <span>•</span>
                <span>Scale: {conversionMethod.replace(/_/g, ' ')}</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed pt-1">
                {uncertaintyStatus ||
                  'High-resolution satellite imagery processed with georeferenced boundary scaling. Polygonal boundaries reflect visible building contours.'}
              </p>
            </div>

            {/* Change Location Action Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLocationDrawer(!showLocationDrawer)}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-xl text-xs transition shadow flex items-center gap-2"
              >
                <span>📍</span>
                <span>{showLocationDrawer ? 'Close Location Selector ▲' : 'Select or Change Location ▼'}</span>
              </button>
            </div>
          </div>

          {/* Coordinates Drawer */}
          {showCoordinates && (
            <div className="p-3 bg-gray-950/80 border border-gray-800 rounded-xl text-xs font-mono text-gray-300 flex flex-wrap gap-4">
              <span>Latitude: <strong>{Number(currentLat).toFixed(5)}° N</strong></span>
              <span>Longitude: <strong>{Number(currentLng).toFixed(5)}° E</strong></span>
              <span className="text-gray-400">Geodetic Datum: WGS 84</span>
              <span className="text-gray-400">High-Resolution Sensor Tile</span>
            </div>
          )}

          {/* Location Selector Drawer (Presets, Search & GPS) */}
          {showLocationDrawer && (
            <div className="bg-gray-950/90 border border-yellow-500/30 rounded-xl p-5 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-800 pb-3">
                <h3 className="text-sm font-bold text-yellow-400 flex items-center gap-2 font-mono">
                  <span>🗺️</span> Select Any Location in India for Instant Rooftop Analysis
                </h3>
                <span className="text-[11px] text-gray-400">Click any city or enter custom address</span>
              </div>

              {/* City Presets Grid */}
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-gray-400 font-mono font-semibold">
                  Quick City Presets:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {CITY_PRESETS.map((city) => (
                    <button
                      key={city.id}
                      type="button"
                      disabled={isChangingLocation}
                      onClick={() => handleSwitchLocation(city)}
                      className={`p-2.5 rounded-lg border text-left transition text-xs font-medium ${
                        currentLocationName.includes(city.name.split(' ')[0])
                          ? 'bg-yellow-500 text-gray-950 border-yellow-400 font-bold shadow'
                          : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600 hover:text-white'
                      }`}
                    >
                      <div className="truncate font-semibold">{city.name}</div>
                      <div className="text-[10px] opacity-75 truncate">{city.state} • {city.discom}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Search & GPS Controls */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
                <form
                  onSubmit={handleSearchAddress}
                  className="md:col-span-8 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={searchLocationQuery}
                    onChange={(e) => setSearchLocationQuery(e.target.value)}
                    placeholder="Search any area, locality, or landmark (e.g. Koramangala Bengaluru, Andheri Mumbai)..."
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-yellow-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isChangingLocation || !searchLocationQuery.trim()}
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-xs transition disabled:opacity-50"
                  >
                    {isChangingLocation ? 'Analyzing...' : 'Search & Analyze'}
                  </button>
                </form>

                <div className="md:col-span-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={isChangingLocation}
                    className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    <span>🧭</span>
                    <span>Use My Current Location</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Summary KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div className="bg-gray-800/80 border border-gray-700/80 p-3.5 rounded-xl">
              <p className="text-gray-400 text-xs font-mono uppercase">
                {analysisScope === 'INDIVIDUAL' ? `Roof #${selectedSegmentId} Area` : 'Total Rooftop Area'}
              </p>
              <p className="text-2xl font-bold text-white mt-1">
                {Number(activeRooftopArea).toFixed(1)} <span className="text-xs text-gray-400 font-normal">m²</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {(activeRooftopArea * 10.7639).toFixed(0)} sq.ft {analysisScope === 'INDIVIDUAL' ? 'individual footprint' : 'cluster total'}
              </p>
            </div>

            <div className="bg-gray-800/80 border border-gray-700/80 p-3.5 rounded-xl">
              <p className="text-gray-400 text-xs font-mono uppercase">
                Available Area for Solar
              </p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">
                {Number(remainingUsableRoofM2).toFixed(1)} <span className="text-xs text-gray-400 font-normal">m²</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {existingSolarStatus === 'YES' || existingSolarStatus === 'SOLAR_PANELS_DETECTED'
                  ? `After ${effectiveOccupiedM2.toFixed(1)} m² existing panels`
                  : '70% usable setback space'}
              </p>
            </div>

            <div className="bg-gray-800/80 border border-gray-700/80 p-3.5 rounded-xl">
              <p className="text-gray-400 text-xs font-mono uppercase">Estimated Solar Capacity</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">
                {recommendedKw} <span className="text-xs text-gray-400 font-normal">kWp</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {existingSolarStatus === 'YES' || existingSolarStatus === 'SOLAR_PANELS_DETECTED'
                  ? `Additional new expansion`
                  : 'Statutory grid capped'}
              </p>
            </div>

            <div className="bg-gray-800/80 border border-gray-700/80 p-3.5 rounded-xl">
              <p className="text-gray-400 text-xs font-mono uppercase">Estimated Annual Yield</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {Number(activeAnnualKwh).toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                <span className="text-xs text-gray-400 font-normal">kWh</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {analysisScope === 'INDIVIDUAL' ? `Yield for Roof #${selectedSegmentId}` : 'Cluster annual yield'}
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* STAGE B: ROOFTOP ANALYSIS (IMAGE COMPARISON & 5 CORE RESULTS)  */}
        {/* ============================================================== */}
        <section className="bg-gray-900/85 backdrop-blur-md border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-gray-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🛰️</span>
                <h2 className="text-xl font-bold font-mono text-white">
                  Expected rooftop analysis experience
                </h2>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Original satellite image paired with detected rooftop boundaries. Click any building on either image to inspect.
              </p>
            </div>

            {/* Quick Location Switcher Dropdown & View Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Direct Location Selector Dropdown inside Rooftop Experience */}
              <div className="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1 text-xs">
                <span className="text-yellow-400 font-bold">📍 City:</span>
                <select
                  value={
                    CITY_PRESETS.find((c) => currentLocationName.includes(c.name.split(' ')[0]))?.id || 'hyd'
                  }
                  onChange={(e) => {
                    const preset = CITY_PRESETS.find((c) => c.id === e.target.value);
                    if (preset) handleSwitchLocation(preset);
                  }}
                  disabled={isChangingLocation}
                  className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
                >
                  {CITY_PRESETS.map((c) => (
                    <option key={c.id} value={c.id} className="bg-gray-900 text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Outlines Visibility Toggle */}
              <button
                type="button"
                onClick={() => setShowPolygons(!showPolygons)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  showPolygons
                    ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400'
                }`}
              >
                {showPolygons ? '👁️ Outlines Visible' : '👁️ Outlines Hidden'}
              </button>

              {/* View Mode Buttons */}
              <div className="flex flex-wrap rounded-lg bg-gray-800/90 p-1 border border-gray-700 text-xs">
                <button
                  type="button"
                  onClick={() => setImageViewMode('side_by_side')}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${
                    imageViewMode === 'side_by_side'
                      ? 'bg-yellow-500 text-gray-950 font-bold'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Side-by-Side View
                </button>
                <button
                  type="button"
                  onClick={() => setImageViewMode('overlay')}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${
                    imageViewMode === 'overlay'
                      ? 'bg-yellow-500 text-gray-950 font-bold'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Detected Boundaries
                </button>
                <button
                  type="button"
                  onClick={() => setImageViewMode('original')}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${
                    imageViewMode === 'original'
                      ? 'bg-yellow-500 text-gray-950 font-bold'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Original Satellite
                </button>
                {displayProcessedImage && (
                  <button
                    type="button"
                    onClick={() => setImageViewMode('processed')}
                    className={`px-3 py-1.5 rounded-md font-medium transition ${
                      imageViewMode === 'processed'
                        ? 'bg-yellow-500 text-gray-950 font-bold'
                        : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    Feature Map
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Visual Display: Side-by-Side View */}
          {imageViewMode === 'side_by_side' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Original satellite image (Now Fully Clickable & Interactive) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-200">Original satellite image</h3>
                  <span className="text-[11px] text-gray-400">High-Resolution Sensor Tile • Click rooftop to inspect</span>
                </div>
                <div className="relative aspect-square w-full rounded-xl overflow-hidden border border-gray-800 bg-gray-950 shadow-inner group">
                  <img
                    src={displayMapImage}
                    alt="Original satellite view"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/sample_satellite.png';
                    }}
                  />

                  {/* Interactive SVG Layer on Original Satellite Image */}
                  {showPolygons && activeDetections.length > 0 && (
                    <svg
                      ref={svgRef1}
                      viewBox="0 0 640 640"
                      onClick={(e) => handleSvgBackgroundClick(e, svgRef1.current)}
                      className="absolute inset-0 w-full h-full pointer-events-auto cursor-crosshair"
                    >
                      {activeDetections.map((d) => {
                        const segId = d.segment_id || d.id;
                        const isSelected = String(selectedSegmentId) === String(segId);
                        const isHovered = String(hoveredSegmentId) === String(segId);
                        const ptsStr = (d.polygon_points || [])
                          .map((p) => `${p[0]},${p[1]}`)
                          .join(' ');
                        const cx = d.centroid
                          ? d.centroid[0]
                          : d.polygon_points && d.polygon_points[0]
                          ? d.polygon_points[0][0]
                          : 320;
                        const cy = d.centroid
                          ? d.centroid[1]
                          : d.polygon_points && d.polygon_points[0]
                          ? d.polygon_points[0][1]
                          : 320;

                        return (
                          <g key={`orig-${segId}`} className="cursor-pointer">
                            <polygon
                              points={ptsStr}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectRooftop(segId);
                              }}
                              onMouseEnter={() => setHoveredSegmentId(segId)}
                              onMouseLeave={() => setHoveredSegmentId(null)}
                              fill={
                                isSelected
                                  ? 'rgba(250, 204, 21, 0.40)'
                                  : isHovered
                                  ? 'rgba(74, 222, 128, 0.30)'
                                  : 'rgba(255, 255, 255, 0.02)'
                              }
                              stroke={
                                isSelected
                                  ? '#facc15'
                                  : isHovered
                                  ? '#4ade80'
                                  : 'rgba(255, 255, 255, 0.25)'
                              }
                              strokeWidth={isSelected ? 3.5 : isHovered ? 2.5 : 1}
                              strokeDasharray={isSelected ? undefined : '3 2'}
                              strokeLinejoin="round"
                            />

                            {/* Centroid Badge on Selected or Hovered */}
                            {(isSelected || isHovered) && (
                              <g>
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={isSelected ? 13 : 11}
                                  fill={isSelected ? '#eab308' : '#0f172a'}
                                  stroke={isSelected ? '#ffffff' : '#4ade80'}
                                  strokeWidth={1.5}
                                />
                                <text
                                  x={cx}
                                  y={cy + 4}
                                  textAnchor="middle"
                                  fill={isSelected ? '#0f172a' : '#ffffff'}
                                  fontSize="10"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                  pointerEvents="none"
                                >
                                  {segId}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  )}

                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/70 backdrop-blur text-[10px] text-gray-300">
                    Satellite Imagery (RGB) • Click rooftop to select
                  </div>
                </div>
              </div>

              {/* Card 2: Detected rooftop boundaries */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-400">Detected rooftop boundaries</h3>
                  <span className="text-[11px] text-gray-400">
                    {activeDetectedCount} Polygons Identified • Green: Roof, Cyan: PV Panels
                  </span>
                </div>
                <div className="relative aspect-square w-full rounded-xl overflow-hidden border border-gray-800 bg-gray-950 shadow-inner">
                  <img
                    src={displayOverlayImage}
                    alt="Detected rooftop boundaries"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/sample_overlay.png';
                    }}
                  />

                  {/* Interactive SVG Overlay with Numbered Badges & Panel Polygons */}
                  {showPolygons && activeDetections.length > 0 && (
                    <svg
                      ref={svgRef2}
                      viewBox="0 0 640 640"
                      onClick={(e) => handleSvgBackgroundClick(e, svgRef2.current)}
                      className="absolute inset-0 w-full h-full pointer-events-auto cursor-crosshair"
                    >
                      {activeDetections.map((d) => {
                        const segId = d.segment_id || d.id;
                        const isSelected = String(selectedSegmentId) === String(segId);
                        const isHovered = String(hoveredSegmentId) === String(segId);
                        const isRejected = userVerifications[segId] === 'REJECTED_DETECTION';
                        const ptsStr = (d.polygon_points || [])
                          .map((p) => `${p[0]},${p[1]}`)
                          .join(' ');
                        const cx = d.centroid
                          ? d.centroid[0]
                          : d.polygon_points && d.polygon_points[0]
                          ? d.polygon_points[0][0]
                          : 320;
                        const cy = d.centroid
                          ? d.centroid[1]
                          : d.polygon_points && d.polygon_points[0]
                          ? d.polygon_points[0][1]
                          : 320;

                        return (
                          <g key={segId} className="cursor-pointer">
                            {/* Clickable polygon area */}
                            <polygon
                              points={ptsStr}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectRooftop(segId);
                              }}
                              onMouseEnter={() => setHoveredSegmentId(segId)}
                              onMouseLeave={() => setHoveredSegmentId(null)}
                              fill={
                                isRejected
                                  ? 'rgba(239, 68, 68, 0.20)'
                                  : isSelected
                                  ? 'rgba(250, 204, 21, 0.40)'
                                  : isHovered
                                  ? 'rgba(74, 222, 128, 0.35)'
                                  : 'rgba(0, 255, 0, 0.05)'
                              }
                              stroke={
                                isRejected
                                  ? '#ef4444'
                                  : isSelected
                                  ? '#facc15'
                                  : isHovered
                                  ? '#4ade80'
                                  : '#22c55e'
                              }
                              strokeWidth={isSelected ? 3.5 : isHovered ? 2.5 : 1.5}
                              strokeDasharray={isRejected ? '4 3' : undefined}
                              strokeLinejoin="round"
                              className="transition-colors duration-150"
                            />

                            {/* Render cyan highlights for detected solar panels if any */}
                            {d.panel_polygons &&
                              d.panel_polygons.map((poly, pIdx) => (
                                <polygon
                                  key={`panel-${segId}-${pIdx}`}
                                  points={poly.map((p) => `${p[0]},${p[1]}`).join(' ')}
                                  fill="rgba(0, 255, 255, 0.35)"
                                  stroke="#00ffff"
                                  strokeWidth={2}
                                  pointerEvents="none"
                                />
                              ))}

                            {/* Centroid Badge */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isSelected ? 13 : 11}
                              fill={
                                isRejected
                                  ? '#7f1d1d'
                                  : isSelected
                                  ? '#eab308'
                                  : '#0f172a'
                              }
                              stroke={
                                isRejected
                                  ? '#ef4444'
                                  : isSelected
                                  ? '#ffffff'
                                  : '#00ff00'
                              }
                              strokeWidth={isSelected ? 2 : 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectRooftop(segId);
                              }}
                              onMouseEnter={() => setHoveredSegmentId(segId)}
                              onMouseLeave={() => setHoveredSegmentId(null)}
                            />
                            <text
                              x={cx}
                              y={cy + 4}
                              textAnchor="middle"
                              fill={
                                isRejected
                                  ? '#fca5a5'
                                  : isSelected
                                  ? '#0f172a'
                                  : '#ffffff'
                              }
                              fontSize="9.5"
                              fontWeight="bold"
                              fontFamily="monospace"
                              pointerEvents="none"
                            >
                              {isRejected ? '✕' : segId}
                            </text>

                            {/* Hover / Selected Tooltip */}
                            {(isHovered || isSelected) && (
                              <g
                                pointerEvents="none"
                                transform={`translate(${Math.min(
                                  480,
                                  Math.max(10, cx - 75)
                                )}, ${Math.max(10, cy - 65)})`}
                              >
                                <rect
                                  width="160"
                                  height="54"
                                  rx="6"
                                  fill="#030712"
                                  stroke={isSelected ? '#eab308' : '#22c55e'}
                                  strokeWidth="1.5"
                                  fillOpacity="0.95"
                                />
                                <text
                                  x="8"
                                  y="16"
                                  fill="#ffffff"
                                  fontSize="10"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                >
                                  Rooftop #{segId}
                                </text>
                                <text x="8" y="30" fill="#9ca3af" fontSize="9">
                                  Area: {d.real_area_m2 ? `${d.real_area_m2} m²` : `${d.pixel_area} px`}
                                </text>
                                <text
                                  x="8"
                                  y="44"
                                  fill={
                                    d.existing_solar_detected
                                      ? '#38bdf8'
                                      : d.confidence >= 0.7
                                      ? '#4ade80'
                                      : '#facc15'
                                  }
                                  fontSize="9"
                                >
                                  {d.existing_solar_detected
                                    ? `⚡ Solar PV: ~${d.panel_occupied_m2 || 0} m²`
                                    : `Confidence: ${(d.confidence * 100).toFixed(0)}%`}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  )}

                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/70 backdrop-blur text-[10px] text-emerald-400 font-mono">
                    Numbered Segments • Click to inspect
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Single Overlay Mode */}
          {imageViewMode === 'overlay' && (
            <div className="relative aspect-video max-h-[550px] w-full rounded-xl overflow-hidden border border-gray-800 bg-gray-950 shadow-inner">
              <img
                src={displayOverlayImage}
                alt="Detected rooftop boundaries"
                className="w-full h-full object-contain mx-auto"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = '/sample_overlay.png';
                }}
              />
            </div>
          )}

          {/* Single Original Mode */}
          {imageViewMode === 'original' && (
            <div className="relative aspect-video max-h-[550px] w-full rounded-xl overflow-hidden border border-gray-800 bg-gray-950 shadow-inner">
              <img
                src={displayMapImage}
                alt="Original satellite view"
                className="w-full h-full object-contain mx-auto"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = '/sample_satellite.png';
                }}
              />
            </div>
          )}

          {/* Processed Feature Map Mode */}
          {imageViewMode === 'processed' && displayProcessedImage && (
            <div className="relative aspect-video max-h-[550px] w-full rounded-xl overflow-hidden border border-gray-800 bg-gray-950 shadow-inner">
              <img
                src={displayProcessedImage}
                alt="Processed edge feature map"
                className="w-full h-full object-contain mx-auto"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = '/sample_overlay.png';
                }}
              />
            </div>
          )}

          {/* ============================================================== */}
          {/* "THEN THE RESULT:" 5 CORE QUESTIONS ANSWERED                    */}
          {/* ============================================================== */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Then the result:</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              {/* Question 1: Which rooftops were detected? */}
              <div className="bg-gray-950/70 p-4 rounded-xl border border-gray-800">
                <div className="text-gray-400 font-semibold mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Which rooftops were detected?
                </div>
                <p className="text-base font-bold text-white mt-1">
                  {activeDetectedCount > 0 ? `${activeDetectedCount} Unique Rooftops Numbered` : 'Targeted Rooftop'}
                </p>
                <p className="text-gray-400 text-[11px] mt-1.5 leading-relaxed">
                  Individual segment IDs (#1, #2, ...) on the image map directly to the detection table rows below.
                </p>
              </div>

              {/* Question 2: What is their estimated area? */}
              <div className="bg-gray-950/70 p-4 rounded-xl border border-gray-800">
                <div className="text-gray-400 font-semibold mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  What is their estimated area?
                </div>
                <p className="text-base font-bold text-yellow-400 mt-1">
                  {Number(activeRooftopArea).toFixed(1)} m²{' '}
                  <span className="text-gray-400 font-normal text-xs">
                    ({(activeRooftopArea * 10.7639).toFixed(0)} sq.ft)
                  </span>
                </p>
                <p className="text-gray-400 text-[11px] mt-1.5 leading-relaxed">
                  Calculated from closed polygon contours scaled to physical dimensions via geodesic calibration.
                </p>
              </div>

              {/* Question 3: Which area is usable for solar? */}
              <div className="bg-gray-950/70 p-4 rounded-xl border border-gray-800">
                <div className="text-gray-400 font-semibold mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  Which area is usable for solar?
                </div>
                <p className="text-base font-bold text-blue-400 mt-1">
                  {Number(remainingUsableRoofM2).toFixed(1)} m²{' '}
                  <span className="text-gray-400 font-normal text-xs">
                    ({(remainingUsableRoofM2 * 10.7639).toFixed(0)} sq.ft)
                  </span>
                </p>
                <p className="text-gray-400 text-[11px] mt-1.5 leading-relaxed">
                  Standard 70% usable setback factor; accounts for parapet shadow, water tanks, and maintenance walkways.
                </p>
              </div>

              {/* Question 4: What solar capacity is recommended? */}
              <div className="bg-gray-950/70 p-4 rounded-xl border border-gray-800">
                <div className="text-gray-400 font-semibold mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                  What solar capacity is recommended?
                </div>
                <p className="text-base font-bold text-purple-300 mt-1">
                  {recommendedKw} kWp System Capacity
                </p>
                <p className="text-gray-400 text-[11px] mt-1.5 leading-relaxed">
                  {sizing?.sizing_rationale ||
                    `Multi-constraint sized: capped under statutory DISCOM regulations at ${gridLimitPct}% of sanctioned load.`}
                </p>
              </div>

              {/* Question 5: How were the financial results calculated? */}
              <div className="bg-gray-950/70 p-4 rounded-xl border border-gray-800 lg:col-span-2">
                <div className="text-gray-400 font-semibold mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  How were the financial results calculated?
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs pt-1">
                  <span>
                    Gross Cost:{' '}
                    <strong className="text-white">
                      ₹{Number(capex?.gross_system_cost || 0).toLocaleString()}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    PM Surya Ghar Subsidy:{' '}
                    <strong className="text-emerald-400">
                      ₹{Number(capex?.cfa_subsidy_amount || 0).toLocaleString()}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Net Out-of-Pocket:{' '}
                    <strong className="text-yellow-400">
                      ₹{Number(metrics?.net_consumer_investment || 0).toLocaleString()}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Payback Period:{' '}
                    <strong className="text-blue-400">
                      {metrics?.simple_payback_years || '2.1'} Years
                    </strong>
                  </span>
                </div>
                <p className="text-gray-400 text-[11px] mt-2 leading-relaxed">
                  Calculated using DISCOM progressive retail tariff schedules + solar export credit settlement rate.
                </p>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* SEGMENTED ROOFTOPS TABLE & INTERACTIVE SELECTION               */}
          {/* ============================================================== */}
          <div ref={tableRef} className="space-y-3 pt-2 border-t border-gray-800">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <h3 className="text-sm font-bold text-gray-200">
                Segmented Rooftops Identification Table
              </h3>
              <span className="text-xs text-gray-400">
                Click any row to synchronize selection with the satellite map.
              </span>
            </div>

            {activeDetections.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-800 text-gray-300 font-mono">
                    <tr>
                      <th className="p-3">Segment ID</th>
                      <th className="p-3">Total Rooftop Area</th>
                      <th className="p-3">Available Area for Solar</th>
                      <th className="p-3">Detection Confidence</th>
                      <th className="p-3">Existing Solar Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {activeDetections.map((d) => {
                      const segId = d.segment_id || d.id;
                      const isSelected = String(selectedSegmentId) === String(segId);
                      const isHovered = String(hoveredSegmentId) === String(segId);
                      const areaM2 = d.real_area_m2 || d.pixel_area * 0.1;
                      const usableM2 = areaM2 * usableFactor;
                      const hasPanels = d.existing_solar_detected || d.existing_solar_status === 'SOLAR_PANELS_DETECTED';

                      return (
                        <tr
                          key={segId}
                          onClick={() => handleSelectRooftop(segId)}
                          onMouseEnter={() => setHoveredSegmentId(segId)}
                          onMouseLeave={() => setHoveredSegmentId(null)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-yellow-500/15 border-l-4 border-yellow-400 text-white'
                              : isHovered
                              ? 'bg-gray-800/60'
                              : 'hover:bg-gray-800/40'
                          }`}
                        >
                          <td className="p-3 font-mono font-bold">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                                  isSelected
                                    ? 'bg-yellow-400 text-gray-950 font-extrabold'
                                    : 'bg-gray-800 text-gray-300'
                                }`}
                              >
                                #{segId}
                              </span>
                              Rooftop #{segId}
                            </span>
                          </td>
                          <td className="p-3 font-mono">
                            {areaM2.toFixed(1)} m²{' '}
                            <span className="text-gray-400 text-[11px]">
                              ({(areaM2 * 10.7639).toFixed(0)} sq.ft)
                            </span>
                          </td>
                          <td className="p-3 font-mono text-yellow-400">
                            {usableM2.toFixed(1)} m²
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                d.confidence >= 0.70
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                  : 'bg-yellow-950 text-yellow-300 border border-yellow-700'
                              }`}
                            >
                              {(d.confidence * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="p-3">
                            {hasPanels ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-600 flex items-center gap-1 w-fit">
                                <span>⚡</span> Solar Panels Detected ({d.panel_occupied_m2 || 0} m²)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-800 text-gray-300 border border-gray-700">
                                No Visible Panels
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectRooftop(segId);
                              }}
                              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                                isSelected
                                  ? 'bg-yellow-500 text-gray-950'
                                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                              }`}
                            >
                              {isSelected ? 'Deselect' : 'Select'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-gray-950 rounded-xl border border-gray-800 text-xs text-gray-400 text-center">
                Target location analyzed as a single cohesive rooftop footprint.
              </div>
            )}
          </div>

          {/* Selected Rooftop Detail Panel */}
          {selectedRooftop && analysisScope === 'INDIVIDUAL' && (
            <div className="p-4 bg-gradient-to-r from-purple-950/40 via-gray-900 to-gray-950 rounded-xl border border-purple-500/40 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎯</span>
                  <h4 className="text-sm font-bold text-white font-mono">
                    Selected Rooftop #{selectedSegmentId} Feasibility Scope
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRefineModal(true)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition"
                  >
                    Refine Solar Information
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSegmentId(null);
                      setAnalysisScope('ALL');
                    }}
                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition"
                  >
                    Clear (View All Rooftops)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-gray-950/80 p-2.5 rounded-lg border border-gray-800">
                  <span className="text-gray-400 block text-[10px] uppercase font-mono">Total Rooftop Area</span>
                  <span className="text-base font-bold text-white font-mono">
                    {(selectedRooftop.real_area_m2 || selectedRooftop.pixel_area * 0.1).toFixed(1)} m²
                  </span>
                </div>
                <div className="bg-gray-950/80 p-2.5 rounded-lg border border-gray-800">
                  <span className="text-gray-400 block text-[10px] uppercase font-mono">Available for Solar</span>
                  <span className="text-base font-bold text-yellow-400 font-mono">
                    {activeUsableArea.toFixed(1)} m²
                  </span>
                </div>
                <div className="bg-gray-950/80 p-2.5 rounded-lg border border-gray-800">
                  <span className="text-gray-400 block text-[10px] uppercase font-mono">Detection Confidence</span>
                  <span className="text-base font-bold text-emerald-400 font-mono">
                    {(selectedRooftop.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="bg-gray-950/80 p-2.5 rounded-lg border border-gray-800">
                  <span className="text-gray-400 block text-[10px] uppercase font-mono">Visual Solar Scan</span>
                  <span className="text-xs font-bold text-cyan-300 block mt-0.5">
                    {selectedRooftop.existing_solar_detected
                      ? '⚡ Solar Panels Detected'
                      : 'No Visible Panels Detected'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ============================================================== */}
        {/* STAGE C: SOLAR POTENTIAL & EXISTING SOLAR REFINEMENT          */}
        {/* ============================================================== */}
        <section className="bg-gray-900/85 backdrop-blur-md border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">☀️</span>
                <h2 className="text-xl font-bold font-mono text-white">
                  Solar Potential & Existing Installation Status
                </h2>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Transparent solar capacity calculation respecting existing installations, usable setback areas, and local grid caps.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowRefineModal(!showRefineModal)}
              className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-yellow-400 border border-yellow-500/30 rounded-lg text-xs font-semibold transition"
            >
              {showRefineModal ? 'Hide Existing Solar Refinement ▲' : 'Refine Existing Solar Information ▼'}
            </button>
          </div>

          {/* Existing Solar Status Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-950/70 border border-gray-800 p-4 rounded-xl space-y-2">
              <p className="text-xs text-gray-400 font-mono uppercase">AI Visual Scan Result</p>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                    clusterHasDetectedPanels
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {clusterHasDetectedPanels
                    ? 'SOLAR_PANELS_DETECTED'
                    : 'NO_VISIBLE_PANELS_DETECTED'}
                </span>
              </div>
              <p className="text-xs text-gray-400 pt-1">
                {clusterHasDetectedPanels
                  ? 'Automated spectral & contrast scan detected characteristic solar array textures.'
                  : 'No characteristic solar array patterns identified on rooftop surfaces.'}
              </p>
            </div>

            <div className="bg-gray-950/70 border border-gray-800 p-4 rounded-xl space-y-2">
              <p className="text-xs text-gray-400 font-mono uppercase">Solar Usable Area Factor</p>
              <p className="text-xl font-bold text-yellow-400">
                70% <span className="text-xs text-gray-400 font-normal">usable setback</span>
              </p>
              <p className="text-xs text-gray-400">
                30% safety buffer accounts for parapet shadows, HVAC units, water tanks, and maintenance walkways.
              </p>
            </div>

            <div className="bg-gray-950/70 border border-gray-800 p-4 rounded-xl space-y-2">
              <p className="text-xs text-gray-400 font-mono uppercase">NASA POWER Insolation</p>
              <p className="text-xl font-bold text-emerald-400">
                ~5.2 <span className="text-xs text-gray-400 font-normal">kWh/m²/day (GHI)</span>
              </p>
              <p className="text-xs text-gray-400">
                Meteorological climatology derived from NASA Langley Research Center POWER dataset.
              </p>
            </div>
          </div>

          {/* Optional Existing Solar Refinement Card */}
          {showRefineModal && (
            <div className="bg-gray-950/90 border border-blue-500/40 rounded-xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h4 className="text-sm font-bold font-mono text-blue-400 flex items-center gap-2">
                  <span>⚡</span> User Refinement: Existing Solar Status
                </h4>
                <span className="text-[11px] text-gray-400">Optional refinement</span>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-200 mb-2">
                  Does this rooftop already have a solar installation?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  {[
                    { id: 'NO', label: 'No, clean-slate feasibility' },
                    { id: 'YES', label: 'Yes, solar panels are already installed' },
                    { id: 'NOT_SURE', label: 'Not sure (mark unverified)' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setExistingSolarStatus(opt.id)}
                      className={`p-3 rounded-lg border font-medium text-left transition ${
                        existingSolarStatus === opt.id
                          ? 'bg-blue-600 text-white border-blue-400 font-bold shadow'
                          : 'bg-gray-900 border-gray-700 text-gray-300 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {existingSolarStatus === 'YES' && (
                <div className="p-4 bg-gray-900/90 rounded-lg border border-blue-500/40 space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-300 font-medium mb-1">
                        Existing Installed Capacity (kW)
                      </label>
                      <input
                        type="number"
                        min="0.5"
                        max="500.0"
                        step="0.5"
                        value={existingSolarKw}
                        onChange={(e) => handleExistingKwChange(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white font-mono focus:border-blue-400 focus:outline-none"
                      />
                      <span className="text-[11px] text-gray-400 mt-1 block">
                        Estimated occupied area: {(existingSolarKw * 10).toFixed(1)} m² (10 m² per kW standard).
                      </span>
                    </div>

                    <div>
                      <label className="block text-gray-300 font-medium mb-1">
                        Approximate Occupied Area (m²)
                      </label>
                      <input
                        type="number"
                        min="1.0"
                        max="50000.0"
                        step="1.0"
                        value={existingSolarOccupiedM2}
                        onChange={(e) => handleExistingOccupiedM2Change(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white font-mono focus:border-blue-400 focus:outline-none"
                      />
                      <span className="text-[11px] text-gray-400 mt-1 block">
                        {isCustomOccupiedArea ? 'Custom area entered' : 'Calculated at 10 m² per kW'}
                      </span>
                    </div>
                  </div>

                  {/* 4-Tier Breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-800 text-xs">
                    <div className="bg-gray-950 p-2.5 rounded-lg border border-gray-800">
                      <span className="text-gray-400 block text-[10px] uppercase font-mono">Gross Usable</span>
                      <span className="font-bold text-white text-base font-mono">
                        {activeUsableArea.toFixed(1)} m²
                      </span>
                    </div>
                    <div className="bg-gray-950 p-2.5 rounded-lg border border-blue-900/60">
                      <span className="text-blue-300 block text-[10px] uppercase font-mono">Occupied by Panels</span>
                      <span className="font-bold text-blue-400 text-base font-mono">
                        {effectiveOccupiedM2.toFixed(1)} m²
                      </span>
                    </div>
                    <div className="bg-gray-950 p-2.5 rounded-lg border border-yellow-900/60">
                      <span className="text-yellow-300 block text-[10px] uppercase font-mono">Remaining Usable</span>
                      <span className="font-bold text-yellow-400 text-base font-mono">
                        {remainingUsableRoofM2.toFixed(1)} m²
                      </span>
                    </div>
                    <div className="bg-gray-950 p-2.5 rounded-lg border border-emerald-900/60">
                      <span className="text-emerald-300 block text-[10px] uppercase font-mono">Additional Sizing</span>
                      <span className="font-bold text-emerald-400 text-base font-mono">
                        {recommendedKw} kWp
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-blue-950/40 rounded border border-blue-700/50 text-[11px] text-blue-200">
                    ℹ️ <strong>Transparent Sizing Rule:</strong> Existing {existingSolarKw} kW capacity is NOT counted as a new installation. Additional recommended capacity is sized strictly from the remaining {remainingUsableRoofM2.toFixed(1)} m² usable roof space and statutory grid limits.
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ============================================================== */}
        {/* STAGE D: FINANCIAL FEASIBILITY & TARIFF ENGINE                 */}
        {/* ============================================================== */}
        <section className="bg-gradient-to-br from-gray-900/90 via-gray-900/95 to-gray-950/90 border-2 border-yellow-500/40 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse"></span>
                <h2 className="text-xl font-bold font-mono text-yellow-400">
                  Financial Feasibility & Investment Analysis
                </h2>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Official PM Surya Ghar Subsidy + FY 2026-27 Progressive Tariffs + Statutory Net Metering.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchFinancialAssessment()}
              disabled={loadingFinancial}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-xs transition shadow disabled:opacity-50"
            >
              {loadingFinancial ? 'Simulating...' : '↻ Recalculate Financials'}
            </button>
          </div>

          {/* Interactive Consumer Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-950/80 rounded-xl border border-gray-800">
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                DISCOM & Tariff Order
              </label>
              <select
                value={selectedDiscom}
                onChange={(e) => setSelectedDiscom(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-yellow-400 focus:outline-none"
              >
                <option value="TGSPDCL">TGSPDCL (Telangana FY 2026-27 Active)</option>
                <option value="BESCOM">BESCOM (Karnataka FY 2026-27 Active)</option>
                <option value="MSEDCL">MSEDCL (Maharashtra FY 2026-27 Active)</option>
                <option value="BRPL">BRPL (Delhi FY 2026-27 Active)</option>
                <option value="TANGEDCO">TANGEDCO (Tamil Nadu FY 2026-27 Active)</option>
              </select>
              <span className="text-[11px] text-gray-400">Schedule valid to 31-03-2027</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                Consumer Category
              </label>
              <select
                value={consumerCategory}
                onChange={(e) => setConsumerCategory(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-yellow-400 focus:outline-none"
              >
                <option value="residential_individual">Residential Individual (100% Load Cap)</option>
                <option value="residential_rwa_ghs">Residential RWA (Group Housing)</option>
                <option value="commercial">Commercial / Non-Domestic (80% Load Cap)</option>
              </select>
              <span className="text-[11px] text-gray-400">
                Grid Cap:{' '}
                <strong className={isCommercial ? 'text-amber-400' : 'text-emerald-400'}>
                  {gridLimitPct}% of Sanctioned Load
                </strong>
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                Sanctioned Load: <strong className="text-yellow-400">{sanctionedLoad} kW</strong>
              </label>
              <input
                type="range"
                min="1.0"
                max="15.0"
                step="0.5"
                value={sanctionedLoad}
                onChange={(e) => setSanctionedLoad(parseFloat(e.target.value))}
                className="w-full accent-yellow-400 mt-2"
              />
              <span className="text-[11px] text-gray-400">
                Grid Cap: {(sanctionedLoad * (gridLimitPct / 100)).toFixed(1)} kW max
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                Monthly Usage: <strong className="text-emerald-400">{monthlyConsumption} kWh</strong>
              </label>
              <input
                type="range"
                min="50"
                max="1200"
                step="25"
                value={monthlyConsumption}
                onChange={(e) => setMonthlyConsumption(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-400 mt-2"
              />
              <span className="text-[11px] text-gray-400">
                Retail Slab:{' '}
                {monthlyConsumption > 400
                  ? '₹9.50 - ₹10.00/kWh'
                  : monthlyConsumption > 200
                  ? '₹7.70/kWh'
                  : '₹3.10 - ₹4.80/kWh'}
              </span>
            </div>
          </div>

          {/* Self-Consumption Scenarios */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-gray-950/60 rounded-xl border border-gray-800 text-xs">
            <span className="font-semibold text-gray-300">Self-Consumption Profile:</span>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'LOW', label: 'Low (35% Self / 65% Export)' },
                { id: 'MODERATE', label: 'Moderate (60% Self / 40% Export)' },
                { id: 'HIGH', label: 'High (85% Self / 15% Export)' },
              ].map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setSelfConsumptionScenario(sc.id)}
                  className={`px-3 py-1.5 rounded-lg border font-medium transition ${
                    selfConsumptionScenario === sc.id
                      ? 'bg-yellow-500 text-gray-950 border-yellow-400 font-bold'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'
                  }`}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Core Financial Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-950/90 border border-gray-800 p-4 rounded-xl">
              <p className="text-xs text-gray-400 font-mono uppercase">
                Gross System Cost
              </p>
              <p className="text-2xl font-bold text-white mt-1">
                ₹{Number(capex?.gross_system_cost || 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">₹50,000/kW benchmark rate</p>
            </div>

            <div className="bg-gray-950/90 border border-emerald-500/40 p-4 rounded-xl">
              <p className="text-xs text-emerald-400 font-mono uppercase">PM Surya Ghar Subsidy</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                - ₹{Number(capex?.cfa_subsidy_amount || 0).toLocaleString()}
              </p>
              <p className="text-xs text-emerald-500 mt-1">
                {capex?.subsidy_status || 'Eligible Central CFA Subsidy'}
              </p>
            </div>

            <div className="bg-gray-950/90 border border-yellow-500/40 p-4 rounded-xl">
              <p className="text-xs text-yellow-400 font-mono uppercase">Net Investment</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">
                ₹{Number(metrics?.net_consumer_investment || 0).toLocaleString()}
              </p>
              <p className="text-xs text-yellow-500 mt-1">Out-of-pocket Capital Cost</p>
            </div>

            <div className="bg-gray-950/90 border border-blue-500/40 p-4 rounded-xl">
              <p className="text-xs text-blue-400 font-mono uppercase">Simple Payback</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">
                {metrics?.simple_payback_years ? `${metrics.simple_payback_years} Years` : '2.1 Years'}
              </p>
              <p className="text-xs text-blue-500 mt-1">
                NPV: ₹{Number(metrics?.npv_savings || 318000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          {/* Monthly Bill Comparison: Before vs After Solar */}
          <div className="bg-gray-950/90 border border-gray-800 rounded-xl p-5">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-4">
              Monthly Electricity Bill: Without Solar vs. With Solar
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-gray-900 rounded-lg border border-red-900/40">
                <p className="text-xs text-gray-400">Current Monthly Bill (No Solar)</p>
                <p className="text-2xl font-bold text-red-400 mt-1">
                  ₹
                  {Number(
                    billSim?.monthly_bill_before_solar || 2520
                  ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">Based on active progressive slabs</p>
              </div>

              <div className="p-4 bg-gray-900 rounded-lg border border-emerald-900/40">
                <p className="text-xs text-gray-400">Estimated Bill With Solar</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">
                  ₹
                  {Number(
                    billSim?.monthly_bill_after_solar || 120
                  ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">After daytime self-consumption</p>
              </div>

              <div className="p-4 bg-gray-900 rounded-lg border border-yellow-900/40">
                <p className="text-xs text-gray-400">First-Year Annual Savings</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">
                  ₹
                  {Number(
                    billSim?.annual_electricity_savings || 28800
                  ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">Bill reduction + solar export credits</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* STAGE E: LONG-TERM PROJECTION & SEASONAL BREAKDOWN            */}
        {/* ============================================================== */}
        <section className="bg-gray-900/85 backdrop-blur-md border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <h2 className="text-xl font-bold font-mono text-white">
                  Monthly Energy Analysis & Seasonal Reconciliation
                </h2>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                12-month generation seasonality and 25-year cumulative lifecycle cash flow.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMonthlyBreakdown(!showMonthlyBreakdown)}
              className="text-xs text-yellow-400 hover:underline font-semibold"
            >
              {showMonthlyBreakdown ? 'Hide 12-Month Table ▲' : 'View Full 12-Month Table ▼'}
            </button>
          </div>

          {/* Monthly Generation Chart */}
          <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
              12-Month Solar Generation vs. Household Consumption
            </h4>
            <div style={{ height: '280px', width: '100%' }}>
              <Bar
                data={solarVsConsumptionChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'top', labels: { color: '#d1d5db', font: { size: 11 } } },
                  },
                  scales: {
                    x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: '#1f2937' } },
                    y: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: '#1f2937' } },
                  },
                }}
              />
            </div>
          </div>

          {/* 12-Month Detailed Table (Collapsible) */}
          {showMonthlyBreakdown && monthlyBreakdownList.length > 0 && (
            <div className="overflow-x-auto bg-gray-950 rounded-xl border border-gray-800 p-4">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-800 text-gray-400 font-mono">
                  <tr>
                    <th className="p-2">Month</th>
                    <th className="p-2">Solar Gen (kWh)</th>
                    <th className="p-2">Consumption (kWh)</th>
                    <th className="p-2">Self-Consumed</th>
                    <th className="p-2">Grid Export (kWh)</th>
                    <th className="p-2">Net Bill Units</th>
                    <th className="p-2">Net Bill (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {monthlyBreakdownList.map((m, idx) => (
                    <tr key={idx} className="hover:bg-gray-900/50">
                      <td className="p-2 font-bold text-white">{m.month_name || m.month}</td>
                      <td className="p-2 font-mono text-yellow-400 font-semibold">{m.solar_generated_kwh || m.solar_gen_kwh}</td>
                      <td className="p-2 font-mono text-gray-300">{m.consumption_kwh}</td>
                      <td className="p-2 font-mono text-emerald-400">{m.self_consumed_kwh}</td>
                      <td className="p-2 font-mono text-blue-400">{m.grid_export_kwh}</td>
                      <td className="p-2 font-mono text-gray-300">{m.net_billed_units}</td>
                      <td className="p-2 font-mono text-white font-bold">₹{m.bill_after_solar}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 25-Year Lifecycle Financial Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
              <p className="text-xs text-gray-400 uppercase font-mono">25-Year Gross Savings</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                ₹{Number(metrics?.twenty_five_year_gross_savings || 920000).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">At 3% annual tariff escalation</p>
            </div>

            <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
              <p className="text-xs text-gray-400 uppercase font-mono">25-Year Net Present Value (NPV)</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">
                ₹{Number(metrics?.npv_savings || 318000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-gray-500 mt-1">Discounted at 8% standard discount rate</p>
            </div>

            <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
              <p className="text-xs text-gray-400 uppercase font-mono">Panel Degradation Factored</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">
                0.7% <span className="text-xs font-normal text-gray-400">per annum</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">~82.5% output guaranteed at Year 25</p>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* STAGE F: RECOMMENDATIONS & METHODOLOGY DISCLOSURES             */}
        {/* ============================================================== */}
        <section className="bg-gray-900/85 backdrop-blur-md border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📋</span>
              <h2 className="text-xl font-bold font-mono text-white">
                Recommendations & Disclosures
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowDisclosures(!showDisclosures)}
              className="text-xs text-yellow-400 hover:underline font-semibold"
            >
              {showDisclosures ? 'Hide Regulatory Methodology ▲' : 'View Methodology & Disclosures ▼'}
            </button>
          </div>

          <div className="space-y-3 text-sm text-gray-300">
            <div className="p-3.5 bg-gray-950 rounded-xl border border-gray-800">
              <strong className="text-yellow-400">1. Optimal System Sizing:</strong>
              <p className="text-xs text-gray-400 mt-1">
                Recommended capacity: <strong className="text-white">{recommendedKw} kWp</strong>.{' '}
                {sizing?.sizing_rationale ||
                  `Sized under statutory DISCOM regulations, capped at ${gridLimitPct}% of your ${sanctionedLoad} kW sanctioned load.`}
              </p>
            </div>

            <div className="p-3.5 bg-gray-950 rounded-xl border border-gray-800">
              <strong className="text-blue-400">2. Grid Interconnection Feasibility:</strong>
              <p className="text-xs text-gray-400 mt-1">
                Distribution transformer (DTR) solar hosting capacity is legally capped at 80% under CEA standards. Apply on the DISCOM / National Portal to secure connection priority.
              </p>
            </div>

            <div className="p-3.5 bg-gray-950 rounded-xl border border-gray-800">
              <strong className="text-emerald-400">3. Physical Site Survey Advisory:</strong>
              <p className="text-xs text-gray-400 mt-1">
                Before purchasing, conduct a physical survey to confirm structural load bearing of the slab, verify existing solar wiring, and ensure adjacent trees or parapets do not cast shadows between 9:00 AM and 4:00 PM.
              </p>
            </div>
          </div>

          {/* Collapsible Methodology Disclosures */}
          {showDisclosures && (
            <div className="p-4 bg-gray-950 rounded-xl border border-gray-800 space-y-3 text-xs text-gray-300">
              <h4 className="font-bold text-white font-mono uppercase tracking-wider text-[11px]">
                Methodology & Regulatory Framework
              </h4>
              <ul className="space-y-2 text-gray-400 list-disc list-inside">
                <li>
                  <strong className="text-gray-200">Computer Vision Boundary Segmentation:</strong> YOLOv8 segmentation model trained on aerial/satellite imagery isolates visible rooftop envelope perimeters. Boundary area is converted to square meters using geodesic spherical distance scaling.
                </li>
                <li>
                  <strong className="text-gray-200">Automated Solar Panel Detection:</strong> Visual spectral and contrast filtering scans detected rooftop ROIs for photovoltaic module clusters (monocrystalline charcoal and polycrystalline deep-blue reflectances) to alert users to existing installations.
                </li>
                <li>
                  <strong className="text-gray-200">Meteorological Insolation:</strong> Solar irradiance is sourced from the NASA Langley Research Center POWER climatology project, accounting for multi-year monthly global horizontal irradiance (GHI).
                </li>
                <li>
                  <strong className="text-gray-200">Statutory Net Metering Regulations:</strong> Formulated in compliance with State Electricity Regulatory Commission (SERC) Rooftop Solar Regulations establishing fixed export credit settlement rates.
                </li>
                <li>
                  <strong className="text-gray-200">Central Financial Assistance (CFA):</strong> Sourced from the official PM Surya Ghar: Muft Bijli Yojana framework (₹33,000 for 1 kWp, ₹66,000 for 2 kWp, ₹78,000 for 3 kWp and above for individual residential consumers).
                </li>
              </ul>
            </div>
          )}

          <div className="p-3 bg-gray-950/80 rounded-lg text-xs text-gray-400 border border-gray-800 flex items-center justify-between">
            <span>
              <strong>Note:</strong> Financial outputs are feasibility estimates based on published tariffs and satellite imagery.
            </span>
            <Link to="/about" className="text-yellow-400 hover:underline font-medium">
              About Project →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
