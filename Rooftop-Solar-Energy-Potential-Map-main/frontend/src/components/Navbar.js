import React from 'react';
import { Link } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import logo from '../assests/logo.png'

export default function Navbar({ isLoggedIn, setIsLoggedIn }) {
  return (
    <div className='flex justify-between items-center p-4 text-white bg-gray-950/70 backdrop-blur-md border-b border-gray-800/60 sticky top-0 z-50'>
      {/* Logo Section */}
      <div className="flex items-center">
        <div className="h-10 mr-4">
          </div>
          <span>
            <img src={logo} width="120px" height="130px" alt="Surya Sankalp Logo" />
          </span>
        <span className="text-xl font-bold"></span>
      </div>

      <nav className='flex-grow font-sans'>
        <ul className='flex justify-center gap-6 text-sm font-medium'>
          <li>
            <Link
              to="/"
              className="text-gray-300 hover:text-yellow-400 transition pb-1 border-b-2 border-transparent hover:border-yellow-400"
            >
              Home
            </Link>
          </li>
          <li>
            <Link
              to="/dashboard"
              className="text-gray-300 hover:text-yellow-400 transition pb-1 border-b-2 border-transparent hover:border-yellow-400"
            >
              Solar Dashboard
            </Link>
          </li>
          <li>
            <Link
              to="/about"
              className="text-gray-300 hover:text-yellow-400 transition pb-1 border-b-2 border-transparent hover:border-yellow-400"
            >
              About
            </Link>
          </li>
          <li>
            <Link
              to="/contact"
              className="text-gray-300 hover:text-yellow-400 transition pb-1 border-b-2 border-transparent hover:border-yellow-400"
            >
              Contact
            </Link>
          </li>
        </ul>
      </nav>

      <div className='flex items-center gap-x-3 text-sm'>
        {!isLoggedIn && (
          <>
            <Link to="/login">
              <button className="px-3.5 py-1.5 text-gray-300 hover:text-white font-medium rounded-lg hover:bg-gray-800 transition border border-transparent">
                Login
              </button>
            </Link>
            <Link to="/signup">
              <button className="px-3.5 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg transition shadow">
                Sign Up
              </button>
            </Link>
          </>
        )}
        {isLoggedIn && (
          <>
            <button
              onClick={() => {
                setIsLoggedIn(false);
                toast.success("Logged out successfully");
              }}
              className="px-3.5 py-1.5 text-gray-300 hover:text-white font-medium rounded-lg hover:bg-gray-800 transition border border-gray-700"
            >
              Log Out
            </button>
            <Link to="/dashboard">
              <button className="px-3.5 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg transition shadow">
                Dashboard
              </button>
            </Link>
          </>
        )}
      </div>
      <ToastContainer />
    </div>
  );
}