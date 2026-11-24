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

const API_BASE = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' && window.location.origin.includes('localhost:3000') ? 'http://localhost:5000' : '');

function Dashboard() {
  const location = useLocation();
  const state = location.state || {};
  const {
    polygonId,
    lat1 = 22.5726,
    long1 = 88.3639,
    mapImageUrl,
    detectedAreaM2,
    detectedCount = 0,
    conversionMethod = 'geodesic_bounding_box_scale',
    uncertaintyStatus,
  } = state;

  // Phase 1 Solar Estimation States
  const [efficiency, setEfficiency] = useState(0.18);
  const [usableFactor, setUsableFactor] = useState(0.70);
  const [estimateData, setEstimateData] = useState(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimateError, setEstimateError] = useState(null);

  // Phase 2 Financial Feasibility & DISCOM Tariff States
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

  // 1. Fetch Solar Estimate (Phase 1)
  const fetchEstimate = useCallback(async () => {
    setLoadingEstimate(true);
    setEstimateError(null);
    try {
      const response = await axios.post(`${API_BASE}/api/estimate`, {
        polygon_id: polygonId || null,
        latitude: lat1,
        longitude: long1,
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

  // 2. Fetch Financial Assessment (Phase 2 - Area Integrity Rule)
  const fetchFinancialAssessment = useCallback(async (currentEstData) => {
    setLoadingFinancial(true);
    setFinancialError(null);
    try {
      const est = currentEstData || estimateData;
      const payload = {
        estimation_id: est?.estimation_id || null,
        polygon_id: polygonId || null,
        rooftop_area_m2: est?.rooftop_area_m2 || detectedAreaM2 || 150.0,
        state_code: selectedState,
        discom_code: selectedDiscom,
        consumer_category: consumerCategory,
        sanctioned_load_kw: parseFloat(sanctionedLoad) || 3.0,
        monthly_consumption_kwh: parseFloat(monthlyConsumption) || 300.0,
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
  }, [estimateData, polygonId, detectedAreaM2, selectedState, selectedDiscom, consumerCategory, sanctionedLoad, monthlyConsumption, selfConsumptionScenario]);

  // Re-run financial assessment when estimateData arrives or parameters change
  useEffect(() => {
    if (estimateData) {
      fetchFinancialAssessment(estimateData);
    }
  }, [estimateData, selectedState, selectedDiscom, consumerCategory, sanctionedLoad, monthlyConsumption, selfConsumptionScenario, fetchFinancialAssessment]);

  const monthlyAverages = estimateData?.monthly_average_irradiance || {};
  const rooftopArea = estimateData?.rooftop_area_m2 || detectedAreaM2 || 150.0;
  const usableArea = estimateData?.usable_area_m2 || (rooftopArea * usableFactor);
  const annualKwh = estimateData?.annual_energy_potential_kwh || 0.0;

  // Chart data: Irradiance
  const radianceChartData = {
    labels: Object.keys(monthlyAverages),
    datasets: [
      {
        label: 'Monthly Average Daily Irradiance (kWh/m²/day)',
        data: Object.values(monthlyAverages),
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderColor: '#2563eb',
        borderWidth: 1,
      },
    ],
  };

  // Chart data: Solar Generation
  const energyChartData = {
    labels: Object.keys(monthlyAverages),
    datasets: [
      {
        label: 'Estimated Generation (kWh/month)',
        data: Object.values(monthlyAverages).map(
          (val) => val * 30 * usableArea * efficiency * 0.75
        ),
        backgroundColor: 'rgba(245, 158, 11, 0.7)',
        borderColor: '#d97706',
        borderWidth: 1,
      },
    ],
  };

  // Financial Helpers
  const sizing = financialData?.system_sizing;
  const capex = financialData?.capex_and_subsidy;
  const billSim = financialData?.bill_simulation;
  const metrics = financialData?.metrics;
  const isCommercial = consumerCategory === 'commercial';
  const gridLimitPct = isCommercial ? 80 : 100;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl font-sans text-white">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold font-mono text-yellow-400 tracking-tight">
              Surya Sankalp
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-900/60 border border-blue-500/50 text-blue-300">
              Solar Feasibility & DISCOM Tariff Engine
            </span>
          </div>
          <p className="text-gray-400 text-sm mt-1">
            Target Coordinates: {Number(lat1).toFixed(4)}°N, {Number(long1).toFixed(4)}°E | Geospatial Area Continuity Engine
          </p>
        </div>
        <Link
          to="/"
          className="mt-4 md:mt-0 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition shadow"
        >
          ← Select Another Rooftop
        </Link>
      </div>

      {/* Mandatory Non-Guaranteed Disclaimer Banner */}
      <div className="mb-4 p-3 bg-amber-950/40 border border-amber-600/60 rounded-xl text-xs text-amber-200 flex items-center justify-between">
        <div>
          <span className="font-bold text-amber-300 uppercase tracking-wide mr-2">Notice:</span>
          <span>
            All generation potential, bill savings, and payback figures are <strong>techno-economic feasibility estimates</strong> for planning purposes and do <strong>NOT</strong> constitute guaranteed financial returns.
          </span>
        </div>
        <span className="text-[11px] text-amber-400/80 hidden md:block">Subject to DISCOM Interconnection Feasibility</span>
      </div>

      {/* Provenance & Uncertainty Banner */}
      {estimateData && (
        <div
          className={`mb-6 p-4 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center ${
            estimateData.is_fallback
              ? 'bg-amber-950/30 border-amber-700/50 text-amber-200'
              : 'bg-emerald-950/30 border-emerald-700/50 text-emerald-200'
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase ${
                  estimateData.is_fallback ? 'bg-amber-500 text-black' : 'bg-emerald-500 text-black'
                }`}
              >
                {estimateData.data_origin}
              </span>
              <span className="font-semibold text-sm">
                {estimateData.source_attribution}
              </span>
            </div>
            {estimateData.fallback_reason && (
              <p className="text-xs text-amber-300 mt-1">
                Notice: {estimateData.fallback_reason}
              </p>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-2 md:mt-0 text-right">
            <span>PR: 0.75 | System Losses: 25%</span>
            {estimateData.estimation_id && (
              <p className="text-emerald-400 font-mono">DB Estimation Record #{estimateData.estimation_id}</p>
            )}
          </div>
        </div>
      )}

      {/* Primary Physical KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/90 border border-gray-800 p-4 rounded-xl shadow">
          <p className="text-gray-400 text-xs font-mono uppercase tracking-wider">
            Total Rooftop Area
          </p>
          <p className="text-2xl font-bold text-white mt-1">
            {Number(rooftopArea).toFixed(1)} <span className="text-sm font-normal text-gray-400">m²</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {detectedCount > 0 ? `${detectedCount} polygon(s) segmented` : 'Baseline estimation'}
          </p>
        </div>

        <div className="bg-gray-900/90 border border-gray-800 p-4 rounded-xl shadow">
          <p className="text-gray-400 text-xs font-mono uppercase tracking-wider">
            Effective Usable Area
          </p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            {Number(usableArea).toFixed(1)} <span className="text-sm font-normal text-gray-400">m²</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            At {Math.round(usableFactor * 100)}% usable factor assumption
          </p>
        </div>

        <div className="bg-gray-900/90 border border-gray-800 p-4 rounded-xl shadow">
          <p className="text-gray-400 text-xs font-mono uppercase tracking-wider">
            Annual Solar Yield
          </p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {Number(annualKwh).toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
            <span className="text-sm font-normal text-gray-400">kWh/yr</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {(annualKwh / 1000).toFixed(2)} MWh/year potential
          </p>
        </div>

        <div className="bg-gray-900/90 border border-gray-800 p-4 rounded-xl shadow">
          <p className="text-gray-400 text-xs font-mono uppercase tracking-wider">
            Recommended Capacity
          </p>
          <p className="text-2xl font-bold text-blue-400 mt-1">
            {sizing?.recommended_capacity_kw || (usableArea / 10).toFixed(1)}{' '}
            <span className="text-sm font-normal text-gray-400">kWp</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Feasible multi-constraint sizing
          </p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SECTION: PHASE 2 FINANCIAL FEASIBILITY & DISCOM TARIFF ENGINE */}
      {/* ============================================================== */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 border-2 border-yellow-500/40 rounded-2xl p-6 mb-8 shadow-2xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 mb-6 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse"></span>
              <h2 className="text-xl md:text-2xl font-bold text-yellow-400 font-mono tracking-wide">
                DISCOM Tariff & Financial Feasibility Engine
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Official TGSPDCL Tariff Order FY 2026-27 (01-04-2026 to 31-03-2027) • TGERC Rooftop Regulation No. 1 of 2025 • Proceeding dated 29-12-2025 (APPC ₹2.57/kWh) • MNRE PM Surya Ghar CFA
            </p>
          </div>
          <button
            onClick={() => fetchFinancialAssessment()}
            disabled={loadingFinancial}
            className="mt-3 md:mt-0 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg text-sm transition shadow disabled:opacity-50"
          >
            {loadingFinancial ? 'Simulating...' : '↻ Recalculate Financials'}
          </button>
        </div>

        {/* Interactive Parameter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-950/60 rounded-xl border border-gray-800 mb-6">
          {/* 1. DISCOM / State */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
              State & DISCOM
            </label>
            <select
              value={selectedDiscom}
              onChange={(e) => setSelectedDiscom(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-yellow-400 focus:outline-none"
            >
              <option value="TGSPDCL">Telangana - TGSPDCL (FY 2026-27 Active)</option>
            </select>
            <span className="text-[11px] text-gray-500">
              Schedule: <a href="https://tgsouthernpower.org/resources/PDF/Tariffs/69tarifffile.pdf" target="_blank" rel="noreferrer" className="text-yellow-400 underline">FY 2026-27 (Valid to 31-03-2027)</a>
            </span>
          </div>

          {/* 2. Consumer Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
              Consumer Category
            </label>
            <select
              value={consumerCategory}
              onChange={(e) => setConsumerCategory(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-yellow-400 focus:outline-none"
            >
              <option value="residential_individual">Residential Individual (LT-I: 100% load cap)</option>
              <option value="residential_rwa_ghs">Residential RWA / Group Housing (LT-I: 100% cap)</option>
              <option value="commercial">Commercial / Non-Domestic (LT-II: 80% load cap)</option>
            </select>
            <span className="text-[11px] text-gray-400">
              Cap: <strong className={isCommercial ? "text-amber-400" : "text-emerald-400"}>{gridLimitPct}% of Sanctioned Load</strong>
            </span>
          </div>

          {/* 3. Sanctioned Load */}
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
            <span className="text-[11px] text-gray-500">
              Statutory Grid Cap: {Number(sanctionedLoad * (gridLimitPct / 100)).toFixed(1)} kW max
            </span>
          </div>

          {/* 4. Monthly Consumption */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
              Monthly Consumption: <strong className="text-emerald-400">{monthlyConsumption} kWh</strong>
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
            <span className="text-[11px] text-gray-500">
              Baseline Tariff Slab: {monthlyConsumption > 200 ? 'Group B(ii) Telescopic' : monthlyConsumption > 100 ? 'Group B(i)' : 'Group A'}
            </span>
          </div>
        </div>

        {/* Self-Consumption Scenario Selector */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-gray-950/40 rounded-xl border border-gray-800 mb-6">
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-gray-200">
              Daytime Solar Self-Consumption Scenario
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Determines on-site solar consumption (offsetting retail slabs up to ₹10.00/kWh in FY26-27) vs exported units settled at the Commission-approved APPC rate (₹2.57/kWh).
            </p>
          </div>
          <div className="flex gap-2">
            {[
              { id: 'LOW', label: 'Low (35% Self / 65% Export)', desc: 'Occupied mainly at night' },
              { id: 'MODERATE', label: 'Moderate (60% Self / 40% Export)', desc: 'Standard residential (Recommended)' },
              { id: 'HIGH', label: 'High (85% Self / 15% Export)', desc: 'Daytime occupancy / WFH' },
            ].map((sc) => (
              <button
                key={sc.id}
                onClick={() => setSelfConsumptionScenario(sc.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  selfConsumptionScenario === sc.id
                    ? 'bg-yellow-500 text-black border-yellow-400 shadow'
                    : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                }`}
              >
                {sc.label.split(' ')[0]} {sc.id === 'MODERATE' && '★'}
              </button>
            ))}
          </div>
        </div>

        {/* Financial Feasibility Detail Cards */}
        {financialData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Card 1: System Sizing & Statutory Limits */}
            <div className="bg-gray-950 border border-gray-800 p-5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300">
                    System Sizing & Constraints
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase ${
                      sizing?.binding_constraint === 'GRID_SANCTIONED_LOAD'
                        ? 'bg-amber-900/60 text-amber-300 border border-amber-500/40'
                        : 'bg-blue-900/60 text-blue-300 border border-blue-500/40'
                    }`}
                  >
                    {sizing?.binding_constraint?.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Usable Roof Footprint:</span>
                    <span className="font-semibold text-white">{sizing?.usable_area_m2} m²</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Physical Maximum Fit:</span>
                    <span className="font-semibold text-gray-300">{sizing?.physical_max_kw} kWp</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Category Statutory Limit:</span>
                    <span className="font-semibold text-gray-300">
                      {sizing?.category_grid_limit_pct}% of load ({sizing?.sanctioned_load_limit_kw} kW)
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-800 bg-gray-900/40 px-2 rounded">
                    <span className="text-yellow-400 font-bold">Recommended Capacity:</span>
                    <span className="text-xl font-bold text-yellow-400">
                      {sizing?.recommended_capacity_kw} kWp
                    </span>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-gray-900/70 rounded-lg text-xs text-gray-300 border border-gray-800">
                  <p className="font-semibold text-gray-200 mb-1">Regulatory Sizing Rationale:</p>
                  <p>{sizing?.sizing_rationale}</p>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 mt-3">
                Zero-Overrun Rule: Strict floor rounding ensures capacity never exceeds {gridLimitPct}% grid limit.
              </p>
            </div>

            {/* Card 2: CAPEX & PM Surya Ghar CFA Subsidy */}
            <div className="bg-gray-950 border border-gray-800 p-5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300">
                    CAPEX & PM Surya Ghar Subsidy
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                      capex?.is_subsidy_eligible
                        ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-900/60 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    {capex?.is_subsidy_eligible ? 'CFA Eligible' : 'Ineligible Category'}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Benchmark Capital Cost:</span>
                    <span className="font-semibold text-white">
                      ₹{Number(capex?.gross_system_cost).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Per-kWp Cost Tier:</span>
                    <span className="font-semibold text-gray-300">
                      ₹{Number(capex?.cost_per_kw).toLocaleString()} / kWp
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-900 text-emerald-400">
                    <span className="font-medium">PM Surya Ghar CFA Subsidy:</span>
                    <span className="font-bold">
                      - ₹{Number(capex?.cfa_subsidy_amount).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-800 bg-emerald-950/30 px-2 rounded border border-emerald-900/40">
                    <span className="text-white font-bold">Net Consumer Investment:</span>
                    <span className="text-xl font-bold text-emerald-400">
                      ₹{Number(capex?.net_consumer_investment).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-gray-900/70 rounded-lg text-xs text-gray-300 border border-gray-800">
                  <p className="font-semibold text-gray-200 mb-1">CFA Subsidy Calculation:</p>
                  <p>{capex?.subsidy_tier_breakdown || capex?.cfa_breakdown_description}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
                <span>Status: <strong className="text-amber-400">INDICATIVE ESTIMATE</strong></span>
                <span>DBT: pmsuryaghar.gov.in</span>
              </div>
            </div>

            {/* Card 3: Monthly Bill Simulation & Lifecycle Payback */}
            <div className="bg-gray-950 border border-gray-800 p-5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300">
                    Monthly Bill & Payback
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                      metrics?.payback_status === 'VIABLE'
                        ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-900/60 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    PAYBACK: {metrics?.simple_payback_years ? `${metrics.simple_payback_years} YRS` : 'N/A'}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Avg Bill Before Solar:</span>
                    <span className="font-semibold text-rose-400">
                      ₹{Number(billSim?.monthly_bill_before_solar).toLocaleString()} / mo
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Avg Bill After Solar:</span>
                    <span className="font-semibold text-emerald-400">
                      ₹{Number(billSim?.monthly_bill_after_solar).toLocaleString()} / mo
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Average Monthly Savings:</span>
                    <span className="font-bold text-yellow-400">
                      ₹{Number(billSim?.monthly_savings).toLocaleString()} / mo
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Annual Electricity Savings:</span>
                    <span className="font-bold text-emerald-400">
                      ₹{Number(billSim?.annual_electricity_savings).toLocaleString()} / yr
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-800 bg-blue-950/30 px-2 rounded border border-blue-900/40">
                    <span className="text-white font-bold">25-Yr Net Savings (Net of Capex):</span>
                    <span className="text-lg font-bold text-blue-400">
                      ₹{Number(metrics?.twenty_five_year_net_savings).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-gray-900/70 rounded-lg text-xs text-gray-300 border border-gray-800 space-y-1">
                  <p>
                    • <strong>Grid Export Settlement:</strong>{' '}
                    {billSim?.annual_export_revenue > 0
                      ? `₹${Number(billSim.annual_export_revenue).toLocaleString()} @ APPC ₹2.57/kWh`
                      : 'Zero surplus (100% absorbed in-house)'}
                  </p>
                  <p>
                    • <strong>Levelized Cost (LCOE):</strong> ₹{metrics?.lcoe_per_kwh} / kWh (Grid: ~₹5.10–₹10.00)
                  </p>
                  <p>
                    • <strong>25-Yr Gross Cashflow:</strong> ₹{Number(metrics?.twenty_five_year_gross_savings).toLocaleString()}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 mt-3">
                Lifecycle incorporates 0.7%/yr degradation & yr-12 inverter replacement reserve.
              </p>
            </div>
          </div>
        )}

        {/* Seasonal Month-by-Month Reconciliation Breakdown (Requirement 4) */}
        {billSim?.monthly_breakdown && (
          <div className="mt-4 p-4 bg-gray-950/90 rounded-xl border border-gray-800">
            <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowMonthlyBreakdown(!showMonthlyBreakdown)}>
              <div>
                <h3 className="text-sm font-bold text-yellow-400 flex items-center gap-2">
                  <span>📅</span> Seasonal Month-by-Month Generation & Bill Reconciliation
                </h3>
                <p className="text-xs text-gray-400">
                  Reconciles monthly tariff impacts against seasonal solar generation in Telangana (Summer vs Monsoon).
                </p>
              </div>
              <button className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded text-gray-300">
                {showMonthlyBreakdown ? '▲ Hide Breakdown' : '▼ View 12-Month Table'}
              </button>
            </div>

            {showMonthlyBreakdown && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300 border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 font-mono uppercase text-[10px]">
                      <th className="py-2 px-3">Month</th>
                      <th className="py-2 px-3">Solar Gen (kWh)</th>
                      <th className="py-2 px-3">Consumption</th>
                      <th className="py-2 px-3">Self-Consumed</th>
                      <th className="py-2 px-3">Export</th>
                      <th className="py-2 px-3">Import</th>
                      <th className="py-2 px-3">Net Billed</th>
                      <th className="py-2 px-3">Bill Before</th>
                      <th className="py-2 px-3">Bill After</th>
                      <th className="py-2 px-3 text-emerald-400">Savings (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billSim.monthly_breakdown.map((row) => (
                      <tr key={row.month} className="border-b border-gray-900 hover:bg-gray-900/50">
                        <td className="py-2 px-3 font-semibold text-white">{row.month}</td>
                        <td className="py-2 px-3 text-yellow-300">{row.solar_gen_kwh}</td>
                        <td className="py-2 px-3">{row.consumption_kwh}</td>
                        <td className="py-2 px-3 text-gray-400">{row.self_consumed_kwh}</td>
                        <td className="py-2 px-3 text-blue-300">{row.grid_export_kwh}</td>
                        <td className="py-2 px-3 text-gray-400">{row.grid_import_kwh}</td>
                        <td className="py-2 px-3 font-mono">{row.net_billed_units}</td>
                        <td className="py-2 px-3 text-rose-300">₹{row.bill_before_solar}</td>
                        <td className="py-2 px-3 text-emerald-300">₹{row.bill_after_solar}</td>
                        <td className="py-2 px-3 font-bold text-emerald-400">₹{row.savings}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-700 bg-gray-900 font-bold text-white text-xs">
                      <td className="py-2 px-3">Annual Total</td>
                      <td className="py-2 px-3 text-yellow-300">
                        {billSim.monthly_breakdown.reduce((sum, r) => sum + r.solar_gen_kwh, 0).toFixed(1)} kWh
                      </td>
                      <td className="py-2 px-3">
                        {billSim.monthly_breakdown.reduce((sum, r) => sum + r.consumption_kwh, 0).toFixed(1)} kWh
                      </td>
                      <td className="py-2 px-3" colSpan="4">
                        Annual Reconciled Settlement
                      </td>
                      <td className="py-2 px-3 text-rose-300">
                        ₹{billSim.monthly_breakdown.reduce((sum, r) => sum + r.bill_before_solar, 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-emerald-300">
                        ₹{billSim.monthly_breakdown.reduce((sum, r) => sum + r.bill_after_solar, 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-emerald-400 text-sm">
                        ₹{billSim.annual_electricity_savings.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Regulatory Disclosures & Citations Section (Requirement 5) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {/* Box A: Official Regulatory Values & Sources */}
          <div className="p-4 bg-gray-950/80 rounded-xl border border-gray-800 text-xs text-gray-300 space-y-2">
            <h4 className="font-bold text-yellow-400 uppercase tracking-wider text-xs flex items-center gap-1.5">
              <span>🏛</span> Official Regulatory Framework & Sourced Values
            </h4>
            <ul className="space-y-1.5 text-[11px] text-gray-300">
              <li>
                • <strong>Tariff Financial Year:</strong> <span className="text-white">FY 2026-27</span> (Effective 01-04-2026 to 31-03-2027)
                <br /><span className="text-gray-500">Source: <a href="https://tgsouthernpower.org/resources/PDF/Tariffs/69tarifffile.pdf" target="_blank" rel="noreferrer" className="text-yellow-400 underline">TGSPDCL Tariff Order</a> (401–800 units @ ₹9.50/kWh, &gt;800 units @ ₹10.00/kWh)</span>
              </li>
              <li>
                • <strong>Export Settlement Rate:</strong> <span className="text-white">₹2.57 / kWh</span> (APPC rate)
                <br /><span className="text-gray-500">Source: <a href="https://www.tgerc.telangana.gov.in/file_upload/uploads/Regulations/Final/tserc/2025/Proceeding%20Solar.pdf" target="_blank" rel="noreferrer" className="text-yellow-400 underline">TGERC Proceeding dated 29-12-2025</a></span>
              </li>
              <li>
                • <strong>Statutory Grid Capacity Limit:</strong> <span className="text-white">100% for Residential/Govt</span>, <span className="text-white">80% for Commercial/Industrial</span>
                <br /><span className="text-gray-500">Source: <a href="https://www.tgerc.telangana.gov.in/file_upload/uploads/Regulations/Final/tserc/2025/Final%20Solar%20Roof%20top%20Regulation%201%20of%202025%2015112025.pdf" target="_blank" rel="noreferrer" className="text-yellow-400 underline">TGERC Rooftop Solar Regulation No. 1 of 2025</a></span>
              </li>
              <li>
                • <strong>PM Surya Ghar CFA:</strong> Max ₹78,000 for residential (₹30k/kW for first 2 kW + ₹18k for 3rd kW; commercial ₹0)
                <br /><span className="text-gray-500">Source: MNRE Operational Guidelines Feb 2024</span>
              </li>
            </ul>
          </div>

          {/* Box B: Techno-Economic Modeling Assumptions */}
          <div className="p-4 bg-gray-950/80 rounded-xl border border-gray-800 text-xs text-gray-300 space-y-2">
            <h4 className="font-bold text-blue-400 uppercase tracking-wider text-xs flex items-center gap-1.5">
              <span>⚙</span> Techno-Economic Modeling Assumptions
            </h4>
            <ul className="space-y-1.5 text-[11px] text-gray-300">
              <li>
                • <strong>Rooftop Specific Layout Area:</strong> 10.0 m² per 1 kWp panel array (Mono-PERC / TOPCon modules).
              </li>
              <li>
                • <strong>Daytime Self-Consumption Scenario:</strong> {selfConsumptionScenario} ({selfConsumptionScenario === 'LOW' ? '35%' : selfConsumptionScenario === 'HIGH' ? '85%' : '60%'} on-site utilization).
              </li>
              <li>
                • <strong>Module Degradation:</strong> 0.7% annual linear degradation after Year 1 (standard 25-yr performance warranty).
              </li>
              <li>
                • <strong>Grid Tariff Escalation:</strong> 3.5% per annum projected electricity rate inflation.
              </li>
              <li>
                • <strong>Operation & Maintenance (O&M):</strong> 1.2% of initial capex per year, escalating at 4.0% per annum.
              </li>
              <li>
                • <strong>Inverter Replacement Reserve:</strong> 18% of initial capex allocated at Year 12.
              </li>
            </ul>
          </div>
        </div>

        {/* Legal Disclaimer Footer */}
        <p className="text-[11px] text-gray-500 mt-4 pt-3 border-t border-gray-900 text-center">
          Surya Sankalp is an AI-powered technical and financial feasibility simulator. Results are model projections and do not constitute legal contracts, guaranteed power generation, or financial guarantees. Interconnection approvals, net metering agreements, and subsidy disbursements are subject to DISCOM inspection and National Portal validation.
        </p>
      </div>

      {/* Interactive Controls & Methodological Transparency (Phase 1) */}
      <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Photovoltaic Performance Assumptions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Usable Rooftop Area Assumption Factor: <strong className="text-yellow-400">{Math.round(usableFactor * 100)}%</strong>
            </label>
            <input
              type="range"
              min="0.40"
              max="0.90"
              step="0.05"
              value={usableFactor}
              onChange={(e) => setUsableFactor(parseFloat(e.target.value))}
              className="w-full accent-yellow-400"
            />
            <p className="text-xs text-gray-500 mt-1">
              Configurable discount factor for parapet walls, water tanks, shadow setbacks, and maintenance pathways.
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              PV Panel Conversion Efficiency: <strong className="text-blue-400">{Math.round(efficiency * 100)}%</strong>
            </label>
            <select
              value={efficiency}
              onChange={(e) => setEfficiency(parseFloat(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
            >
              <option value="0.16">16% - Standard Polycrystalline Panels</option>
              <option value="0.18">18% - Monocrystalline PERC (Standard Market)</option>
              <option value="0.21">21% - High-Efficiency TOPCon / Heterojunction (HJT)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Reflects solar cell efficiency under standard testing conditions (STC).
            </p>
          </div>
        </div>

        {uncertaintyStatus && (
          <div className="mt-4 pt-4 border-t border-gray-800 text-xs text-gray-400">
            <strong>Geospatial Scale Status:</strong> {uncertaintyStatus}
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl shadow">
          <h3 className="text-md font-semibold text-gray-200 mb-3 text-center">
            Monthly Solar Irradiance Profile (kWh/m²/day)
          </h3>
          <Bar data={radianceChartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </div>

        <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl shadow">
          <h3 className="text-md font-semibold text-gray-200 mb-3 text-center">
            Estimated Monthly Electricity Generation (kWh)
          </h3>
          <Bar data={energyChartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </div>
      </div>

      {/* Satellite Image Preview */}
      {mapImageUrl && (
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-gray-200 mb-3">Analyzed Satellite Imagery</h3>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <img
              src={mapImageUrl}
              alt="Analyzed Satellite"
              className="rounded-lg border border-gray-700 shadow max-w-sm"
            />
            <div className="text-sm text-gray-400 space-y-2">
              <p>• <strong>Method:</strong> {conversionMethod}</p>
              <p>• <strong>Target Region:</strong> Lat {lat1}, Long {long1}</p>
              <p>• <strong>Measured Rooftop Footprint:</strong> {Number(rooftopArea).toFixed(1)} m²</p>
              <p className="text-xs text-gray-500">
                Verified against PM Surya Ghar rooftop estimation framework.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
