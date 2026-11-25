import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assests/logo.png';
import { FaLinkedin, FaInstagram, FaGithub } from 'react-icons/fa';

function Footer() {
  return (
    <div>
      <div className='border-t-2 border-gray-800 p-5 mb-12 flex justify-around items-center mt-6 flex-wrap gap-6'>
        <div>
          <img src={logo} width="200px" height="200px" alt="Surya Sankalp Logo" />
        </div>

        <div>
          <h2 className='text-white font-bold text-2xl mb-2'>Platform</h2>
          <ul className='text-gray-300 leading-10'>
            <li><Link to="/" className="hover:text-blue-400">Rooftop Selection</Link></li>
            <li><Link to="/dashboard" className="hover:text-blue-400">Solar Feasibility Dashboard</Link></li>
            <li><Link to="/about" className="hover:text-blue-400">Architecture & Vision</Link></li>
          </ul>
        </div>

        <div>
          <h2 className='text-white font-bold text-2xl mb-2'>Policy & Tariff</h2>
          <ul className='text-gray-300 leading-10'>
            <li>PM Surya Ghar CFA</li>
            <li>TGSPDCL FY 2026-27 Slabs</li>
            <li>TGERC Solar Net Metering</li>
          </ul>
        </div>

        <div>
          <h2 className='text-white font-bold text-2xl mb-2'>Contact</h2>
          <ul className='text-gray-300 leading-10'>
            <li><Link to="/contact" className="hover:text-blue-400">Contact Team</Link></li>
            <li><Link to="/about" className="hover:text-blue-400">FAQ & Documentation</Link></li>
          </ul>
        </div>
      </div>

      <div className='flex flex-col items-center p-8'>
        <h2 className='text-white text-2xl mb-4'>Follow Us</h2>
        <div className="flex space-x-4 mt-2">
          <a
            href="https://www.linkedin.com/in/yash-pandey"
            className="text-blue-500 hover:text-blue-700 text-2xl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaLinkedin />
          </a>
          <a
            href="https://www.instagram.com/shibu___16"
            className="text-pink-500 hover:text-pink-700 text-2xl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaInstagram />
          </a>
          <a
            href="https://github.com/Yash16p"
            className="text-gray-500 hover:text-gray-700 text-2xl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaGithub />
          </a>
        </div>
      </div>

      <div className='flex justify-center mt-4'>
        <p className='font-mono text-gray-400 mb-5'>© 2026 Surya Sankalp. All Rights Reserved.</p>
      </div>
    </div>
  );
}

export default Footer;
