import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assests/logo.png';

function Footer() {
  return (
    <footer className="bg-gray-950 border-t border-gray-800 text-gray-400 font-sans mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <img src={logo} width="160px" height="160px" alt="Surya Sankalp Logo" className="mb-3" />
          <p className="text-xs text-gray-400 leading-relaxed">
            Surya Sankalp: AI-Powered Rooftop Solar Potential, Financial Feasibility & Urban Solar Planning Platform for India.
          </p>
        </div>

        <div>
          <h3 className="text-white font-bold text-sm mb-3 font-mono">Platform</h3>
          <ul className="space-y-2 text-xs">
            <li><Link to="/" className="hover:text-yellow-400 transition">Rooftop Selection & Map</Link></li>
            <li><Link to="/dashboard" className="hover:text-yellow-400 transition">Solar Feasibility Dashboard</Link></li>
            <li><Link to="/about" className="hover:text-yellow-400 transition">Architecture & Vision</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-bold text-sm mb-3 font-mono">Policy & Tariffs</h3>
          <ul className="space-y-2 text-xs">
            <li className="text-gray-300">PM Surya Ghar: Muft Bijli Yojana CFA</li>
            <li className="text-gray-300">TGSPDCL FY 2026-27 Domestic Slabs</li>
            <li className="text-gray-300">TGERC Rooftop Regulation No. 1 of 2025</li>
            <li className="text-gray-300">APPC Export Settlement at ₹2.57/kWh</li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-bold text-sm mb-3 font-mono">Contact & Queries</h3>
          <ul className="space-y-2 text-xs">
            <li><Link to="/contact" className="hover:text-yellow-400 transition">Contact Project Team</Link></li>
            <li><Link to="/about" className="hover:text-yellow-400 transition">Methodology & Disclosures</Link></li>
            <li className="text-gray-400 pt-2">
              National Portal: <a href="https://pmsuryaghar.gov.in" target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline">pmsuryaghar.gov.in</a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-gray-900 py-4 text-center text-xs text-gray-400">
        <p>© 2026 Surya Sankalp. All Rights Reserved. Built for Clean Renewable Energy Adoption in India.</p>
      </div>
    </footer>
  );
}

export default Footer;
