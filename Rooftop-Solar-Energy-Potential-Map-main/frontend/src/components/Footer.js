import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '../assests/logo.png';

function Footer() {
  const location = useLocation();

  const handleScrollTo = (id) => {
    if (location.pathname === '/' && id === 'analyze') {
      const el = document.getElementById('analyze');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    } else if (location.pathname === '/about' && id === 'methodology') {
      const el = document.getElementById('methodology');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <footer className="bg-[#070b14]/90 backdrop-blur-md border-t border-slate-800/80 text-slate-400 font-sans mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12">
          {/* Brand Area */}
          <div className="md:col-span-5 space-y-3">
            <Link to="/" className="inline-block">
              <img
                src={logo}
                alt="Surya Sankalp Logo"
                className="h-10 w-auto object-contain"
              />
            </Link>
            <p className="text-sm font-semibold text-slate-200">
              Smarter Rooftop Solar Decisions.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              Explore rooftop solar potential and understand your solar investment.
            </p>
          </div>

          {/* Quick Navigation */}
          <div className="md:col-span-3 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
              Quick Navigation
            </h3>
            <ul className="space-y-2.5 text-xs">
              <li>
                <Link
                  to="/"
                  className="text-slate-300 hover:text-yellow-400 transition-colors duration-150"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/#analyze"
                  onClick={() => handleScrollTo('analyze')}
                  className="text-slate-300 hover:text-yellow-400 transition-colors duration-150"
                >
                  Analyze Rooftop
                </Link>
              </li>
              <li>
                <Link
                  to="/dashboard"
                  className="text-slate-300 hover:text-yellow-400 transition-colors duration-150"
                >
                  Solar Dashboard
                </Link>
              </li>
              <li>
                <Link
                  to="/about"
                  className="text-slate-300 hover:text-yellow-400 transition-colors duration-150"
                >
                  About the Project
                </Link>
              </li>
            </ul>
          </div>

          {/* Information & Contact */}
          <div className="md:col-span-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
              Information & Contact
            </h3>
            <ul className="space-y-2.5 text-xs">
              <li>
                <Link
                  to="/about#methodology"
                  onClick={() => handleScrollTo('methodology')}
                  className="text-slate-300 hover:text-yellow-400 transition-colors duration-150"
                >
                  Methodology & Disclosures
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-slate-300 hover:text-yellow-400 transition-colors duration-150"
                >
                  Contact
                </Link>
              </li>
              <li>
                <a
                  href="https://pmsuryaghar.gov.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-slate-300 hover:text-yellow-400 transition-colors duration-150"
                >
                  <span>Official PM Surya Ghar Portal</span>
                  <span className="text-[11px] text-slate-500">↗</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Copyright Line */}
        <div className="border-t border-slate-800/80 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-400">
          <p>© 2026 Surya Sankalp. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
