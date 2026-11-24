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
  const [jurisdictions, setJurisdictions] = useState([]);
  const [selectedState, setSelectedState] = useState('TG');
  const [selectedDiscom, setSelectedDiscom] = useState('TGSPDCL');
  const [consumerCategory, setConsumerCategory] = useState('residential_individual');
  const [sanctionedLoad, setSanctionedLoad] = useState(4.0);
  const [monthlyConsumption, setMonthlyConsumption] = useState(350);
  const [selfConsumptionScenario, setSelfConsumptionScenario] = useState('MODERATE');
  const [financialData, setFinancialData] = useState(null);
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [financialError, setFinancialError] = useState(null);

  // 1. Fetch available DISCOM tariffs on mount
  useEffect(() => {
    const fetchTariffs = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/tariffs');
        if (res.data && res.data.jurisdictions) {
          setJurisdictions(res.data.jurisdictions);
          if (res.data.jurisdictions.length > 0) {
            const first = res.data.jurisdictions[0];
            setSelectedState(first.state_code);
            if (first.discoms && first.discoms.length > 0) {
              setSelectedDiscom(first.discoms[0].discom_code);
            }
          }
        }
      } catch (err) {
        console.warn('Could not load dynamic tariffs list:', err);
      }
    };
    fetchTariffs();
  }, []);

  // 2. Fetch Solar Estimate (Phase 1)
  const fetchEstimate = useCallback(async () => {
    setLoadingEstimate(true);
    setEstimateError(null);
    try {
      const response = await axios.post('http://localhost:5000/api/estimate', {
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

  // 3. Fetch Financial Assessment (Phase 2 - Area Integrity Rule)
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

      const res = await axios.post('http://localhost:5000/api/financial_assessment', payload);
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

      {/* Provenance & Uncertainty Banner */}
      {estimateData && (
        <div
          className={`mb-6 p-4 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center ${
            estimateData.is_fallback
              ? 'bg-amber-950/40 border-amber-600/60 text-amber-200'
              : 'bg-emerald-950/40 border-emerald-600/60 text-emerald-200'
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
            Multi-constraint feasible sizing
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
              Official TGERC Tariff Schedule FY 2024-25 • TGERC Rooftop Regulation No. 1 of 2025 • MNRE PM Surya Ghar CFA
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
              <option value="TGSPDCL">Telangana - TGSPDCL (TGERC FY24-25)</option>
            </select>
            <span className="text-[11px] text-gray-500">Reg: TGERC Order FY 2024-25</span>
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
              <option value="residential_individual">Residential Individual (LT-I)</option>
              <option value="residential_rwa_ghs">Residential RWA / Group Housing</option>
              <option value="commercial">Commercial / Non-Domestic (LT-II)</option>
            </select>
            <span className="text-[11px] text-gray-500">
              {consumerCategory === 'commercial' ? '⚠️ Not eligible for PM Surya Ghar' : '✓ PM Surya Ghar eligible'}
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
            <span className="text-[11px] text-gray-500">Legal grid limit: 100% of sanctioned load</span>
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
            <span className="text-[11px] text-gray-500">~₹{Math.round(monthlyConsumption * 7.5)}/mo current estimate</span>
          </div>
        </div>

        {/* Self-Consumption Scenario Selector */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-gray-950/40 rounded-xl border border-gray-800 mb-6">
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-gray-200">
              Daytime Solar Self-Consumption Scenario
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Determines proportion of solar power consumed on-site (avoiding high retail tariff slabs) vs exported to the grid at APPC rate (₹2.65/kWh).
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
            {/* Card 1: System Sizing & Physical Constraints */}
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
                    <span className="text-gray-400">Sanctioned Load Cap:</span>
                    <span className="font-semibold text-gray-300">{sizing?.sanctioned_load_limit_kw} kW</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-800 bg-gray-900/40 px-2 rounded">
                    <span className="text-yellow-400 font-bold">Recommended Capacity:</span>
                    <span className="text-xl font-bold text-yellow-400">
                      {sizing?.recommended_capacity_kw} kWp
                    </span>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-gray-900/70 rounded-lg text-xs text-gray-300 border border-gray-800">
                  <p className="font-semibold text-gray-200 mb-1">Sizing Engineering Rationale:</p>
                  <p>{sizing?.sizing_rationale}</p>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 mt-3">
                Zero-Overrun Rule: Never rounds capacity above sanctioned grid interconnection limit.
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
                  <p>{capex?.cfa_breakdown_description}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
                <span>Status: <strong className="text-amber-400">INDICATIVE VERIFICATION</strong></span>
                <span>Portal: pmsuryaghar.gov.in</span>
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
                    <span className="text-gray-400">Monthly Bill Before Solar:</span>
                    <span className="font-semibold text-rose-400">
                      ₹{Number(billSim?.monthly_bill_before_solar).toLocaleString()} / mo
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Monthly Bill After Solar:</span>
                    <span className="font-semibold text-emerald-400">
                      ₹{Number(billSim?.monthly_bill_after_solar).toLocaleString()} / mo
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-900">
                    <span className="text-gray-400">Monthly Savings:</span>
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
                    <span className="text-white font-bold">25-Year Cumulative Savings:</span>
                    <span className="text-lg font-bold text-blue-400">
                      ₹{Number(metrics?.twenty_five_year_net_savings).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-gray-900/70 rounded-lg text-xs text-gray-300 border border-gray-800 space-y-1">
                  <p>
                    • <strong>Grid Export Settlement:</strong>{' '}
                    {billSim?.annual_export_revenue > 0
                      ? `₹${Number(billSim.annual_export_revenue).toLocaleString()} @ APPC ₹2.65/kWh`
                      : 'Zero surplus (100% absorbed in-house)'}
                  </p>
                  <p>
                    • <strong>Levelized Cost (LCOE):</strong> ₹{metrics?.lcoe_per_kwh} / kWh (Grid: ~₹7.50+)
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 mt-3">
                Lifecycle incorporates 0.7%/yr degradation & yr-12 inverter replacement reserve.
              </p>
            </div>
          </div>
        )}

        {/* Regulatory Disclosures & Citations Footer */}
        <div className="p-4 bg-gray-950/80 rounded-xl border border-gray-800 text-xs text-gray-400 space-y-1.5">
          <p className="font-bold text-gray-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span>⚖</span> Official Regulatory Sources & Methodological Disclosures:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px]">
            <p>
              • <strong>Tariff Schedule:</strong> TGERC Retail Supply Tariff Order FY 2024-25 (O.P. Nos. 104 & 105 of 2024)
            </p>
            <p>
              • <strong>Metering Regulation:</strong> TGERC Rooftop Solar Regulation No. 1 of 2025 (APPC settlement @ ₹2.65/kWh)
            </p>
            <p>
              • <strong>Subsidy Scheme:</strong> MNRE PM Surya Ghar: Muft Bijli Yojana (Operational Guidelines Feb 2024)
            </p>
          </div>
          <p className="text-[10px] text-gray-500 pt-1 border-t border-gray-900">
            Disclaimer: Estimates are algorithmic simulations for technical and financial planning. Actual generation depends on shading, panel orientation, and weather. Net metering and subsidy approvals are subject to DISCOM technical feasibility and MNRE portal validation.
          </p>
        </div>
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
