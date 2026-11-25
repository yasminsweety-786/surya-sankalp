import React from 'react';

export default function About() {
  return (
    <div className="container mx-auto p-6 max-w-4xl text-white font-sans">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold font-mono text-yellow-400 mb-4">
          Surya Sankalp: Architecture & Vision
        </h1>
        <p className="text-gray-300 text-lg leading-relaxed mb-6">
          <strong>Surya Sankalp</strong> ("Every Rooftop. A Brighter Tomorrow") is an AI-driven geospatial platform 
          designed to accelerate rooftop solar adoption across India in support of the national 
          <strong> PM Surya Ghar: Muft Bijli Yojana</strong>.
        </p>

        <h2 className="text-2xl font-semibold text-blue-400 mb-3">Core Technical Capabilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h3 className="font-bold text-lg text-white mb-1">1. Computer Vision Segmentation</h3>
            <p className="text-gray-400 text-sm">
              Custom-trained YOLOv8 instance segmentation model delineates real building rooftop contours from aerial and satellite imagery without relying on coarse bounding rectangles.
            </p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h3 className="font-bold text-lg text-white mb-1">2. Geodesic Scale Engine</h3>
            <p className="text-gray-400 text-sm">
              Converts pixel mask area to real-world square meters ($m^2$) using Haversine geodesic boundary scaling while transparently reporting optical scale uncertainty.
            </p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h3 className="font-bold text-lg text-white mb-1">3. Transparent Solar Potential</h3>
            <p className="text-gray-400 text-sm">
              Connects measured rooftop space with NASA POWER meteorological daily insolation ($kWh/m^2/day$) and transparent photovoltaic conversion efficiency formulas.
            </p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h3 className="font-bold text-lg text-white mb-1">4. Zero-Friction Unified Backend</h3>
            <p className="text-gray-400 text-sm">
              Powered by an asynchronous FastAPI backend with zero-setup local SQLite persistence and PostgreSQL enterprise support via environment variables.
            </p>
          </div>
        </div>

        <h2 id="methodology" className="text-2xl font-semibold text-yellow-400 mb-3">
          Methodology & Disclosures
        </h2>
        <div className="bg-yellow-950/60 border border-yellow-700/60 text-yellow-200 p-4 rounded-lg text-sm mb-6 leading-relaxed">
          <strong>Methodological Transparency:</strong> Uncalibrated optical satellite tiles lack 3D LiDAR/elevation data. 
          Rooftop usable space is calculated using an adjustable setback factor (default 70%) to account for parapet shadows, 
          water storage tanks, HVAC units, and maintenance pathways. All solar estimations query live NASA POWER 
          meteorological irradiance data with verified regional baselines.
        </div>

        <h2 className="text-2xl font-semibold text-emerald-400 mb-3">Regulatory & Tariff Reference Framework</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700 text-xs space-y-1">
            <h3 className="font-bold text-white text-sm">PM Surya Ghar: Muft Bijli Yojana</h3>
            <p className="text-gray-300">Central Financial Assistance (CFA) subsidy structure:</p>
            <p className="text-gray-400">₹33,000 for 1 kW, ₹66,000 for 2 kW, and ₹78,000 for systems ≥ 3 kW for eligible residential consumers.</p>
          </div>
          <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700 text-xs space-y-1">
            <h3 className="font-bold text-white text-sm">TGERC Regulation No. 1 of 2025</h3>
            <p className="text-gray-300">Statutory Net Metering Grid Capacities:</p>
            <p className="text-gray-400">Residential & Government: Up to 100% of sanctioned load. Commercial & Industrial: Capped at 80% of sanctioned load / contracted demand.</p>
          </div>
          <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700 text-xs space-y-1">
            <h3 className="font-bold text-white text-sm">TGERC Proceeding (29-12-2025)</h3>
            <p className="text-gray-300">Solar Export Settlement Rate:</p>
            <p className="text-gray-400">Approved APPC solar export credit rate of ₹2.57/kWh for net surplus energy exported to the distribution grid.</p>
          </div>
          <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700 text-xs space-y-1">
            <h3 className="font-bold text-white text-sm">TGSPDCL Tariff Order FY 2026-27</h3>
            <p className="text-gray-300">Official Retail Supply Slabs (01-04-2026 to 31-03-2027):</p>
            <p className="text-gray-400">Verified LT-I Domestic telescopic slabs and statutory fixed charges applied for precise bill simulation.</p>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-4 text-gray-500 text-sm text-center">
          Surya Sankalp • AI-Powered Rooftop Solar Potential & Clean Energy Planning in India
        </div>
      </div>
    </div>
  );
}
