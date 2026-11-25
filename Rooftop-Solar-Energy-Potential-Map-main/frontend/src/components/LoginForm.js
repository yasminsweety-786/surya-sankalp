import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';

export default function LoginForm({ setIsLoggedIn }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  function changeHandler(event) {
    setFormData((prevData) => ({
      ...prevData,
      [event.target.name]: event.target.value,
    }));
  }

  async function submitHandler(event) {
    event.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      setIsLoggedIn(true);
      toast.success("Logged in successfully");
      navigate("/dashboard");
    } catch (error) {
      console.error("Login error:", error);
      toast.error(`Login failed: ${error.message}`);
    }
  }

  async function handleGoogleSignIn() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setIsLoggedIn(true);
      toast.success("Logged in with Google");
      navigate("/dashboard");
    } catch (error) {
      toast.error("Google Sign-In failed: " + error.message);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 sm:p-8 shadow-2xl text-white">
      {/* Informational Transparency Card */}
      <div className="bg-gray-800/90 border border-yellow-500/30 rounded-lg p-4 mb-6 text-xs text-gray-300 space-y-2">
        <div className="flex items-center gap-2 text-yellow-400 font-bold text-sm">
          <span>ℹ️</span> Authentication Purpose & Privacy Notice
        </div>
        <p>
          <strong className="text-white">Guest Analysis is 100% Supported:</strong> You do NOT need an account to search locations, preview satellite imagery, or estimate rooftop solar potential and savings.
        </p>
        <p>
          <strong className="text-white">Why Sign In?</strong> An account lets you save rooftop estimations, bookmark project reports, and manage multi-site feasibility studies.
        </p>
        <p className="text-gray-400">
          🔒 <strong className="text-gray-300">Privacy Notice:</strong> Logging in never accesses, records, or shares your browser GPS location. Location is only queried if you explicitly choose "Use My Current Location".
        </p>
      </div>

      <h2 className="text-2xl font-bold font-mono text-white mb-6 text-center">
        Sign in to Surya Sankalp
      </h2>

      <form onSubmit={submitHandler} className="space-y-4">
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-1">
            Email Address <span className="text-yellow-400">*</span>
          </label>
          <input
            required
            type="email"
            onChange={changeHandler}
            placeholder="Enter your email"
            value={formData.email}
            name="email"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 text-sm"
          />
        </div>

        <div>
          <label className="block text-gray-300 text-sm font-medium mb-1">
            Password <span className="text-yellow-400">*</span>
          </label>
          <div className="relative">
            <input
              required
              type={showPassword ? "text" : "password"}
              onChange={changeHandler}
              placeholder="Enter your password"
              value={formData.password}
              name="password"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
            >
              {showPassword ? <AiOutlineEyeInvisible size={18} /> : <AiOutlineEye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold py-2.5 rounded-lg transition text-sm mt-2"
        >
          Sign In
        </button>

        <div className="flex items-center my-4">
          <div className="flex-grow border-t border-gray-700"></div>
          <span className="px-3 text-xs text-gray-400 font-medium">OR</span>
          <div className="flex-grow border-t border-gray-700"></div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2.5 rounded-lg border border-gray-700 transition text-sm flex items-center justify-center gap-2"
        >
          <span>Continue with Google</span>
        </button>

        <div className="pt-4 text-center">
          <Link
            to="/"
            className="text-xs text-yellow-400 hover:underline font-medium inline-block"
          >
            ← Skip Login & Analyze as Guest
          </Link>
        </div>
      </form>
      <ToastContainer />
    </div>
  );
}
