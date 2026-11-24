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

        <h2 className="text-2xl font-semibold text-yellow-400 mb-3">Measurement Disclosure & Uncertainty</h2>
        <div className="bg-yellow-950 border border-yellow-700 text-yellow-200 p-4 rounded-lg text-sm mb-6">
          <strong>Methodological Transparency:</strong> Uncalibrated optical satellite tiles lack 3D elevation tags. 
          Rooftop usable space is calculated with an adjustable assumption factor (default 70%) to account for parapets, 
          water tanks, and shadow setbacks. All estimations distinguish live NASA API feeds from verified regional insolation baselines.
        </div>

        <div className="border-t border-gray-800 pt-4 text-gray-500 text-sm text-center">
          Surya Sankalp • Built for Hackathon Competition & Clean Energy Planning in India
        </div>
      </div>
    </div>
  );
}
