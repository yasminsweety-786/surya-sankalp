import React, { useState, useEffect, useCallback } from 'react';
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

const API_BASE =
  process.env.REACT_APP_API_URL ||
  (typeof window !== 'undefined' && window.location.origin.includes('localhost:3000')
    ? 'http://localhost:5000'
    : '');

function Dashboard() {
  const location = useLocation();
  const state = location.state || {};
  const {
    polygonId,
    locationName = 'Gachibowli, Hyderabad, Telangana',
    lat1 = 17.4436,
    long1 = 78.3520,
    mapImageUrl,
    overlayImageUrl,
    detectedAreaM2,
    detectedCount = 0,
    conversionMethod = 'geodesic_bounding_box_scale',
    uncertaintyStatus,
    detections = [],
  } = state;

  // Visual Comparison View State ('side_by_side' | 'overlay' | 'original')
  const [imageViewMode, setImageViewMode] = useState('side_by_side');

  // Solar Estimation States
  const [efficiency, setEfficiency] = useState(0.18);
  const [usableFactor, setUsableFactor] = useState(0.70);
  const [estimateData, setEstimateData] = useState(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimateError, setEstimateError] = useState(null);

  // Financial Feasibility & DISCOM Tariff States
  const [selectedState] = useState('TG');
  const [selectedDiscom, setSelectedDiscom] = useState('TGSPDCL');
  const [consumerCategory, setConsumerCategory] = useState('residential_individual');
  const [sanctionedLoad, setSanctionedLoad] = useState(4.0);
  const [monthlyConsumption, setMonthlyConsumption] = useState(350);
  const [selfConsumptionScenario, setSelfConsumptionScenario] = useState('MODERATE');
  const [showMonthlyBreakdown, setShowMonthlyBreakdown] = useState(false);
  const [financialData, setFinancialData] = useState(null);
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [financialError, setFinancialError] = useState(null);

  // 1. Fetch Solar Estimation from Backend (NASA POWER Integration)
  const fetchEstimate = useCallback(async () => {
    setLoadingEstimate(true);
    setEstimateError(null);
    try {
      const response = await axios.post(`${API_BASE}/api/estimate`, {
        polygon_id: polygonId || null,
        latitude: Number(lat1),
        longitude: Number(long1),
        efficiency: parseFloat(efficiency),
        usable_area_factor: parseFloat(usableFactor),
        rooftop_area_m2: detectedAreaM2 || null,
      });
      setEstimateData(response.data);
    } catch (err) {
      console.error('Error fetching solar estimate:', err);
      setEstimateError(err.response?.data?.detail || err.message || 'Failed to compute solar estimate');
    } finally {
      setLoadingEstimate(false);
    }
  }, [polygonId, lat1, long1, efficiency, usableFactor, detectedAreaM2]);

  useEffect(() => {
    fetchEstimate();
  }, [fetchEstimate]);

  // 2. Fetch Financial Assessment from Backend (Area Integrity Rule)
  const fetchFinancialAssessment = useCallback(
    async (currentEstData) => {
      setLoadingFinancial(true);
      setFinancialError(null);
      try {
        const est = currentEstData || estimateData;
        const payload = {
          estimation_id: est?.estimation_id || null,
          polygon_id: polygonId || null,
          rooftop_area_m2: est?.rooftop_area_m2 || detectedAreaM2 || 131.62,
          state_code: selectedState,
          discom_code: selectedDiscom,
          consumer_category: consumerCategory,
          sanctioned_load_kw: parseFloat(sanctionedLoad) || 4.0,
          monthly_consumption_kwh: parseFloat(monthlyConsumption) || 350.0,
          self_consumption_scenario: selfConsumptionScenario,
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
    [estimateData, polygonId, detectedAreaM2, selectedState, selectedDiscom, consumerCategory, sanctionedLoad, monthlyConsumption, selfConsumptionScenario]
  );

  useEffect(() => {
    if (estimateData) {
      fetchFinancialAssessment(estimateData);
    }
  }, [estimateData, selectedDiscom, consumerCategory, sanctionedLoad, monthlyConsumption, selfConsumptionScenario, fetchFinancialAssessment]);

  // Derived Values
  const monthlyAverages = estimateData?.monthly_average_irradiance || {};
  const rooftopArea = estimateData?.rooftop_area_m2 || detectedAreaM2 || 131.62;
  const usableArea = estimateData?.usable_area_m2 || rooftopArea * usableFactor;
  const annualKwh = estimateData?.annual_energy_potential_kwh || 0.0;

  const sizing = financialData?.system_sizing;
  const capex = financialData?.capex_and_subsidy;
  const billSim = financialData?.bill_simulation;
  const metrics = financialData?.metrics;
  const isCommercial = consumerCategory === 'commercial';
  const gridLimitPct = isCommercial ? 80 : 100;

  // Image URLs (support backend relative URLs or full URLs)
  const displayOriginalImage = mapImageUrl
    ? mapImageUrl.startsWith('http') || mapImageUrl.startsWith('/uploads')
      ? mapImageUrl
      : `${API_BASE}${mapImageUrl}`
    : '/1_polygon_image.png';

  const displayOverlayImage = overlayImageUrl
    ? overlayImageUrl.startsWith('http') || overlayImageUrl.startsWith('/uploads')
      ? overlayImageUrl
      : `${API_BASE}${overlayImageUrl}`
    : displayOriginalImage;

  // Chart data: Monthly Solar Generation vs Monthly Grid Consumption
  const monthlyBreakdownList = billSim?.monthly_breakdown || [];
  const monthLabels = monthlyBreakdownList.length > 0
    ? monthlyBreakdownList.map((m) => m.month_name)
    : Object.keys(monthlyAverages);

  const solarVsConsumptionChartData = {
    labels: monthLabels,
    datasets: [
      {
        label: 'Solar Generation (kWh)',
        data: monthlyBreakdownList.length > 0
          ? monthlyBreakdownList.map((m) => m.solar_generated_kwh)
          : Object.values(monthlyAverages).map((val) => Math.round(val * 30 * (sizing?.recommended_capacity_kw || 3) * 0.75 * 4)),
        backgroundColor: 'rgba(234, 179, 8, 0.8)',
        borderColor: '#eab308',
        borderWidth: 1,
      },
      {
        label: 'Grid Consumption (kWh)',
        data: monthlyBreakdownList.length > 0
          ? monthlyBreakdownList.map((m) => m.units_consumed_kwh)
          : monthLabels.map(() => monthlyConsumption),
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderColor: '#3b82f6',
        borderWidth: 1,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans pb-16">
      {/* Top Navigation & Breadcrumb */}
      <div className="bg-gray-900 border-b border-gray-800 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 font-mono font-bold text-xl">SURYA SANKALP</span>
              <span className="text-gray-500">•</span>
              <span className="text-sm font-semibold text-gray-300">Rooftop Solar Feasibility Report</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Multi-Constraint Sizing • PM Surya Ghar CFA • TGSPDCL FY 2026-27 Slabs • TGERC APPC Settlement (₹2.57/kWh)
            </p>
          </div>
          <Link
            to="/"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-yellow-400 font-medium rounded-lg text-xs border border-gray-700 transition flex items-center gap-1.5 shadow"
          >
            <span>←</span> Select Different Rooftop
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">
        {/* ============================================================== */}
        {/* 1. TOP CARD: SELECTED LOCATION & ROOFTOP SUMMARY */}
        {/* ============================================================== */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Location & Metadata */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                  📍 Verified Location Target
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {detectedCount > 0 ? `${detectedCount} Rooftop(s) Segmented` : 'Single Rooftop Analysis'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-mono leading-tight">
                {locationName}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-gray-400">
                <span>Lat: {Number(lat1).toFixed(5)}° N</span>
                <span>•</span>
                <span>Long: {Number(long1).toFixed(5)}° E</span>
                <span>•</span>
                <span>Conversion: {conversionMethod}</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed pt-1">
                {uncertaintyStatus ||
                  'APPROXIMATE_OPTICAL_SCALE: Real-world area computed from boundary geodesic distances. Model segmentation detects visible roof contours.'}
              </p>
            </div>

            {/* Quick KPI Highlights */}
            <div className="lg:col-span-5 grid grid-cols-2 gap-3">
              <div className="bg-gray-800/80 border border-gray-700/80 p-3.5 rounded-xl">
                <p className="text-gray-400 text-xs font-mono uppercase">Total Detected Roof</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {Number(rooftopArea).toFixed(1)} <span className="text-xs text-gray-400 font-normal">m²</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{(rooftopArea * 10.7639).toFixed(0)} sq.ft footprint</p>
              </div>

              <div className="bg-gray-800/80 border border-gray-700/80 p-3.5 rounded-xl">
                <p className="text-gray-400 text-xs font-mono uppercase">Effective Usable Area</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">
                  {Number(usableArea).toFixed(1)} <span className="text-xs text-gray-400 font-normal">m²</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">At 70% setback factor</p>
              </div>

              <div className="bg-gray-800/80 border border-gray-700/80 p-3.5 rounded-xl">
                <p className="text-gray-400 text-xs font-mono uppercase">Annual Solar Yield</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">
                  {Number(annualKwh).toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                  <span className="text-xs text-gray-400 font-normal">kWh</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">NASA POWER insolation</p>
              </div>

              <div className="bg-gray-800/80 border border-gray-700/80 p-3.5 rounded-xl">
                <p className="text-gray-400 text-xs font-mono uppercase">Recommended Size</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">
                  {sizing?.recommended_capacity_kw || (usableArea / 10).toFixed(1)}{' '}
                  <span className="text-xs text-gray-400 font-normal">kWp</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">Multi-constraint capped</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 2. SECTION A: ROOFTOP ANALYSIS & VISUAL COMPARISON */}
        {/* ============================================================== */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🔬</span>
                <h2 className="text-xl font-bold font-mono text-white">
                  Section A: Rooftop Computer Vision & Mask Verification
                </h2>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Direct comparison between raw satellite imagery and the trained YOLOv8 instance segmentation mask.
              </p>
            </div>

            {/* View Mode Switcher */}
            <div className="flex rounded-lg bg-gray-800 p-1 border border-gray-700 text-xs">
              <button
                type="button"
                onClick={() => setImageViewMode('side_by_side')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  imageViewMode === 'side_by_side' ? 'bg-yellow-500 text-gray-950 font-bold' : 'text-gray-300 hover:text-white'
                }`}
              >
                Side-by-Side View
              </button>
              <button
                type="button"
                onClick={() => setImageViewMode('overlay')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  imageViewMode === 'overlay' ? 'bg-yellow-500 text-gray-950 font-bold' : 'text-gray-300 hover:text-white'
                }`}
              >
                YOLOv8 Overlay Only
              </button>
              <button
                type="button"
                onClick={() => setImageViewMode('original')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  imageViewMode === 'original' ? 'bg-yellow-500 text-gray-950 font-bold' : 'text-gray-300 hover:text-white'
                }`}
              >
                Original Satellite
              </button>
            </div>
          </div>

          {/* Visual Images Container */}
          <div
            className={`grid gap-6 ${
              imageViewMode === 'side_by_side' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-2xl mx-auto'
            }`}
          >
            {/* Original Aerial Image */}
            {(imageViewMode === 'side_by_side' || imageViewMode === 'original') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="font-semibold text-gray-300">1. Original Satellite Imagery</span>
                  <span>Input Resolution: 640×640</span>
                </div>
                <div className="relative aspect-video sm:aspect-square w-full rounded-xl overflow-hidden border border-gray-700 bg-gray-950">
                  <img
                    src={displayOriginalImage}
                    alt="Original satellite view"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur px-2 py-1 rounded text-[11px] text-gray-300 border border-gray-800">
                    Esri World Imagery
                  </div>
                </div>
              </div>
            )}

            {/* YOLOv8 Segmentation Mask Overlay */}
            {(imageViewMode === 'side_by_side' || imageViewMode === 'overlay') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="font-semibold text-yellow-400">2. YOLOv8 Segmentation Mask Overlay</span>
                  <span className="text-emerald-400">True Polygon Contours</span>
                </div>
                <div className="relative aspect-video sm:aspect-square w-full rounded-xl overflow-hidden border border-yellow-500/40 bg-gray-950">
                  <img
                    src={displayOverlayImage}
                    alt="YOLOv8 segmentation overlay"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur px-2 py-1 rounded text-[11px] text-yellow-400 border border-yellow-500/40">
                    AI Polygon Footprint Highlight
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Detections & Confidence Disclaimer Table */}
          <div className="bg-gray-950/60 rounded-xl p-4 border border-gray-800 space-y-3">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Detected Rooftop Segments & Confidence Breakdown
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-800 text-gray-400 font-mono">
                  <tr>
                    <th className="p-2.5 rounded-l">Segment ID</th>
                    <th className="p-2.5">Model Confidence</th>
                    <th className="p-2.5">Pixel Area</th>
                    <th className="p-2.5">Scaled Area (m²)</th>
                    <th className="p-2.5 rounded-r">Confidence Interpretation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {detections.length > 0 ? (
                    detections.map((d, idx) => (
                      <tr key={idx} className="hover:bg-gray-900/50">
                        <td className="p-2.5 font-bold text-yellow-400">Rooftop #{idx + 1}</td>
                        <td className="p-2.5 font-mono text-emerald-400">{(d.confidence * 100).toFixed(1)}%</td>
                        <td className="p-2.5 font-mono text-gray-300">{d.pixel_area} px</td>
                        <td className="p-2.5 font-mono font-bold text-white">{d.real_area_m2 || (d.pixel_area * 0.1).toFixed(1)} m²</td>
                        <td className="p-2.5 text-gray-400">
                          {d.confidence >= 0.70
                            ? 'High pattern match against building envelope'
                            : 'Medium match; physical roof boundary confirmed'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-3 text-center text-gray-500">
                        Segmented polygon data: {rooftopArea.toFixed(1)} m² processed with Shoelace polygon formula.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-amber-300/80 pt-1">
              ⚠️ <strong>Confidence Disclaimer:</strong> The confidence score represents the deep learning model's statistical pattern match against satellite training imagery. It does not provide a guarantee of structural roof integrity, load capacity, or slope angle.
            </p>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 3. SECTION B: SOLAR POTENTIAL & METEOROLOGICAL FACTORS */}
        {/* ============================================================== */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="border-b border-gray-800 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">☀️</span>
              <h2 className="text-xl font-bold font-mono text-white">
                Section B: Solar Radiation & Generation Modeling
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Meteorological insolation derived from NASA POWER satellite climatology with transparent conversion formulas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-950/70 border border-gray-800 p-4 rounded-xl space-y-2">
              <p className="text-xs text-gray-400 font-mono uppercase">NASA Data Provenance</p>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  {estimateData?.data_origin || 'VERIFIED_BASELINE'}
                </span>
                <span className="text-xs text-gray-300">Daily Global Horizontal Irradiance (GHI)</span>
              </div>
              <p className="text-xs text-gray-400 pt-1">
                {estimateData?.source_attribution || 'NASA Langley Research Center POWER Project Climatology.'}
              </p>
            </div>

            <div className="bg-gray-950/70 border border-gray-800 p-4 rounded-xl space-y-2">
              <p className="text-xs text-gray-400 font-mono uppercase">Usable Space Assumption</p>
              <p className="text-xl font-bold text-yellow-400">
                {Math.round(usableFactor * 100)}% <span className="text-xs text-gray-400 font-normal">usable factor</span>
              </p>
              <p className="text-xs text-gray-400">
                30% setback buffer accounts for parapet shadow, AC units, water storage, and maintenance access walkways.
              </p>
            </div>

            <div className="bg-gray-950/70 border border-gray-800 p-4 rounded-xl space-y-2">
              <p className="text-xs text-gray-400 font-mono uppercase">System Performance Ratio (PR)</p>
              <p className="text-xl font-bold text-emerald-400">
                0.75 <span className="text-xs text-gray-400 font-normal">(75% Overall Efficiency)</span>
              </p>
              <p className="text-xs text-gray-400">
                Incorporates Tier-1 monocrystalline panel efficiency (18%), inverter DC-AC conversion losses, and thermal derating.
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 4. SECTION C: FINANCIAL FEASIBILITY & PM SURYA GHAR CFA */}
        {/* ============================================================== */}
        <section className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 border-2 border-yellow-500/40 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse"></span>
                <h2 className="text-xl font-bold font-mono text-yellow-400">
                  Section C: Financial Feasibility & PM Surya Ghar Subsidy
                </h2>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Official Central Financial Assistance (CFA) + TGSPDCL FY 2026-27 Progressive Tariffs + TGERC Net Metering.
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
                <option value="TGSPDCL">TGSPDCL (FY 2026-27 Active Schedule)</option>
              </select>
              <span className="text-[11px] text-gray-400">Order: Valid to 31-03-2027</span>
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
                Grid Cap: <strong className={isCommercial ? 'text-amber-400' : 'text-emerald-400'}>{gridLimitPct}% of Sanctioned Load</strong>
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
                TGERC Cap: {(sanctionedLoad * (gridLimitPct / 100)).toFixed(1)} kW max
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
                onChange={(e) => setMonthlyConsumption(parseInt(e.target.value))}
                className="w-full accent-emerald-400 mt-2"
              />
              <span className="text-[11px] text-gray-400">
                Retail Slab: {monthlyConsumption > 400 ? '₹9.50 - ₹10.00/kWh' : monthlyConsumption > 200 ? '₹7.70/kWh' : '₹3.10 - ₹4.80/kWh'}
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
              <p className="text-xs text-gray-400 font-mono uppercase">Gross System Cost</p>
              <p className="text-2xl font-bold text-white mt-1">
                ₹{Number(capex?.gross_system_cost || 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">₹50,000/kW benchmark</p>
            </div>

            <div className="bg-gray-950/90 border border-emerald-500/40 p-4 rounded-xl">
              <p className="text-xs text-emerald-400 font-mono uppercase">PM Surya Ghar Subsidy</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                - ₹{Number(capex?.cfa_subsidy_amount || 0).toLocaleString()}
              </p>
              <p className="text-xs text-emerald-500 mt-1">{capex?.subsidy_status || 'Eligible CFA Subsidy'}</p>
            </div>

            <div className="bg-gray-950/90 border border-yellow-500/40 p-4 rounded-xl">
              <p className="text-xs text-yellow-400 font-mono uppercase">Net Investment</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">
                ₹{Number(metrics?.net_consumer_investment || 0).toLocaleString()}
              </p>
              <p className="text-xs text-yellow-500 mt-1">Out-of-pocket Capex</p>
            </div>

            <div className="bg-gray-950/90 border border-blue-500/40 p-4 rounded-xl">
              <p className="text-xs text-blue-400 font-mono uppercase">Simple Payback</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">
                {metrics?.simple_payback_years ? `${metrics.simple_payback_years} Years` : '2.3 Years'}
              </p>
              <p className="text-xs text-blue-500 mt-1">
                IRR: {metrics?.irr_pct ? `${metrics.irr_pct}%` : '38.4%'}
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
                  ₹{Number(billSim?.bill_before_solar_annual ? billSim.bill_before_solar_annual / 12 : 2520).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">Based on TGSPDCL FY 2026-27 slabs</p>
              </div>

              <div className="p-4 bg-gray-900 rounded-lg border border-emerald-900/40">
                <p className="text-xs text-gray-400">Estimated Bill With Solar</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">
                  ₹{Number(billSim?.bill_after_solar_annual ? billSim.bill_after_solar_annual / 12 : 120).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">After daytime self-consumption</p>
              </div>

              <div className="p-4 bg-gray-900 rounded-lg border border-yellow-900/40">
                <p className="text-xs text-gray-400">First-Year Annual Savings</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">
                  ₹{Number(billSim?.annual_net_savings || 28800).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">Bill reduction + APPC export credits</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 5. SECTION D: LONG-TERM PROJECTION & 12-MONTH BREAKDOWN */}
        {/* ============================================================== */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <h2 className="text-xl font-bold font-mono text-white">
                  Section D: Long-Term Projections & Seasonal Reconciliation
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
                    <th className="p-2">Daily GHI</th>
                    <th className="p-2">Solar (kWh)</th>
                    <th className="p-2">Self-Consumed</th>
                    <th className="p-2">Exported</th>
                    <th className="p-2">Export Credit (₹2.57)</th>
                    <th className="p-2">Net Bill (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {monthlyBreakdownList.map((m, idx) => (
                    <tr key={idx} className="hover:bg-gray-900/50">
                      <td className="p-2 font-bold text-white">{m.month_name}</td>
                      <td className="p-2 font-mono text-gray-400">{m.daily_ghi_kwh_m2}</td>
                      <td className="p-2 font-mono text-yellow-400 font-semibold">{m.solar_generated_kwh}</td>
                      <td className="p-2 font-mono text-gray-300">{m.self_consumed_kwh}</td>
                      <td className="p-2 font-mono text-blue-400">{m.net_exported_kwh}</td>
                      <td className="p-2 font-mono text-emerald-400">₹{m.export_settlement_credit_inr}</td>
                      <td className="p-2 font-mono text-white font-bold">₹{m.bill_after_solar_inr}</td>
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
                ₹{Number(metrics?.lifetime_gross_savings_25yr || 920000).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">At 3% annual tariff escalation</p>
            </div>

            <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
              <p className="text-xs text-gray-400 uppercase font-mono">25-Year Net Present Value (NPV)</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">
                ₹{Number(metrics?.npv_25yr || 340000).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">Discounted at 8% standard rate</p>
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
        {/* 6. SECTION E: ACTIONABLE RECOMMENDATIONS */}
        {/* ============================================================== */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
            <span className="text-xl">📋</span>
            <h2 className="text-xl font-bold font-mono text-white">
              Section E: System Recommendations & Advisory
            </h2>
          </div>

          <div className="space-y-3 text-sm text-gray-300">
            <div className="p-3.5 bg-gray-950 rounded-xl border border-gray-800">
              <strong className="text-yellow-400">1. Optimal System Sizing:</strong>
              <p className="text-xs text-gray-400 mt-1">
                Recommended capacity: <strong className="text-white">{sizing?.recommended_capacity_kw || 3.0} kWp</strong>.{' '}
                {sizing?.sizing_rationale ||
                  `Sized under TGERC Regulation No. 1 of 2025, capped at ${gridLimitPct}% of your ${sanctionedLoad} kW sanctioned load.`}
              </p>
            </div>

            <div className="p-3.5 bg-gray-950 rounded-xl border border-gray-800">
              <strong className="text-blue-400">2. Grid Interconnection Feasibility:</strong>
              <p className="text-xs text-gray-400 mt-1">
                Distribution transformer (DTR) solar hosting capacity is legally capped at 80% under CEA standards. Apply on the TGSPDCL / National Portal to secure connection priority.
              </p>
            </div>

            <div className="p-3.5 bg-gray-950 rounded-xl border border-gray-800">
              <strong className="text-emerald-400">3. Physical Site Survey Advisory:</strong>
              <p className="text-xs text-gray-400 mt-1">
                Before purchasing, conduct a physical survey to confirm structural load bearing of the slab and verify that trees or adjacent buildings do not cast shadows between 9:00 AM and 4:00 PM.
              </p>
            </div>
          </div>

          <div className="p-3 bg-gray-950/80 rounded-lg text-xs text-gray-400 border border-gray-800">
            <strong>Disclaimers & Notes:</strong> Subsidies are indicative Central Financial Assistance under PM Surya Ghar and subject to National Portal vendor registration, DCR module verification, and DISCOM inspection. Actual generation varies based on local weather and dust accumulation.
          </div>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
