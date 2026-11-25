import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import axios from "axios";
import solar from "../assests/solar.png";

// Fix Leaflet marker icons in React/Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const API_BASE =
  process.env.REACT_APP_API_URL ||
  (typeof window !== "undefined" && window.location.origin.includes("localhost:3000")
    ? "http://localhost:5000"
    : "");

// Helper subcomponent to handle clicks on the Leaflet map
function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Helper subcomponent to smoothly pan map on coordinate update
function MapViewUpdater({ center }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (center && map) {
      map.setView([center.lat, center.lng], 17);
    }
  }, [center, map]);
  return null;
}

const Home = () => {
  const navigate = useNavigate();

  // State Management
  const [selectedLocation, setSelectedLocation] = useState({
    name: "Gachibowli, Hyderabad, Telangana",
    lat: 17.4436,
    lng: 78.3520,
    source: "PRESET",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [geoStatus, setGeoStatus] = useState("");
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  // Derive static satellite preview image URL (Esri World Imagery Export API)
  const delta = 0.0012;
  const minLat = selectedLocation.lat - delta;
  const maxLat = selectedLocation.lat + delta;
  const minLng = selectedLocation.lng - delta;
  const maxLng = selectedLocation.lng + delta;
  const satellitePreviewUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${minLng},${minLat},${maxLng},${maxLat}&bboxSR=4326&imageSR=4326&size=640,640&format=png&f=image`;

  // Search location handler
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchError("Please enter a city, address, or landmark to search.");
      return;
    }

    setSearching(true);
    setSearchError("");
    setGeoStatus("");
    try {
      const res = await axios.get(`${API_BASE}/api/geocode?query=${encodeURIComponent(searchQuery.trim())}`);
      const data = res.data;
      setSelectedLocation({
        name: data.display_name,
        lat: data.lat,
        lng: data.lng,
        source: data.source,
      });
      setPreviewLoaded(false);
      setPreviewError(false);
    } catch (err) {
      console.error("Geocoding failed:", err);
      setSearchError(err.response?.data?.detail || "Could not resolve address. Try a preset or click on the map.");
    } finally {
      setSearching(false);
    }
  };

  // Preset selection handler
  const handleSelectPreset = (preset) => {
    setSelectedLocation({
      name: preset.display_name,
      lat: preset.lat,
      lng: preset.lng,
      source: "PRESET",
    });
    setSearchQuery(preset.name);
    setSearchError("");
    setGeoStatus("");
    setPreviewLoaded(false);
    setPreviewError(false);
  };

  // Map Click handler (Reverse geocodes coordinates)
  const handleMapClick = async (lat, lng) => {
    setPreviewLoaded(false);
    setPreviewError(false);
    setSelectedLocation((prev) => ({
      ...prev,
      lat,
      lng,
      name: `Rooftop at ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`,
      source: "MAP_PIN",
    }));

    try {
      const res = await axios.get(`${API_BASE}/api/reverse_geocode?lat=${lat}&lng=${lng}`);
      if (res.data?.display_name) {
        setSelectedLocation((prev) => ({
          ...prev,
          name: res.data.display_name,
        }));
      }
    } catch (err) {
      // Keep coordinate label if reverse geocode fails
    }
  };

  // Explicit browser geolocation handler
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("Geolocation is not supported by your browser.");
      return;
    }

    setGeoStatus("Requesting browser location permission...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGeoStatus(`Location acquired (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`);
        await handleMapClick(lat, lng);
      },
      (err) => {
        console.warn("Geolocation denied or unavailable:", err);
        setGeoStatus(
          err.code === 1
            ? "Location permission was denied. You can still search any address or click on the map."
            : "Could not retrieve GPS location. Please select an address manually."
        );
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Execute AI Rooftop Analysis
  const analyzeSolarPotential = async () => {
    try {
      setAnalyzing(true);
      setSearchError("");

      const coordsStr = `${minLat},${minLng}; ${maxLat},${minLng}; ${maxLat},${maxLng}; ${minLat},${maxLng}`;

      // 1. Save polygon and download satellite image
      const saveRes = await axios.post(`${API_BASE}/api/save_polygon`, {
        coordinates: coordsStr,
        imageUrl: satellitePreviewUrl,
        location_name: selectedLocation.name,
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        user_id: 1, // Guest user supported
        bounds: { minLat, maxLat, minLng, maxLng },
      });

      const polygonId = saveRes.data.polygon_id;

      // 2. Run YOLOv8 instance segmentation model
      const predRes = await axios.post(`${API_BASE}/api/run_prediction`, {
        polygon_id: polygonId,
        confidence_threshold: 0.20,
      });

      const predData = predRes.data;

      // 3. Navigate to Dashboard with verified analysis results
      navigate("/dashboard", {
        state: {
          polygonId: polygonId,
          locationName: selectedLocation.name,
          lat1: selectedLocation.lat,
          long1: selectedLocation.lng,
          mapImageUrl: predData.original_image_url || saveRes.data.imageUrl || satellitePreviewUrl,
          overlayImageUrl: predData.overlay_image_url,
          detectedAreaM2: predData.total_rooftop_area_m2,
          detectedCount: predData.detected_count,
          conversionMethod: predData.conversion_method,
          uncertaintyStatus: predData.uncertainty_status,
          detections: predData.detections,
        },
      });
    } catch (error) {
      console.error("Error analyzing rooftop solar potential:", error);
      setSearchError(
        "Analysis error: " + (error.response?.data?.detail || error.message || "Failed to process satellite imagery.")
      );
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      {/* 1. Hero Section */}
      <section className="border-b border-gray-800 bg-gradient-to-b from-gray-900 to-gray-950 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 mb-4">
              <span>☀️</span> PM Surya Ghar: Muft Bijli Yojana & TGERC Compliant
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white font-mono leading-tight mb-4">
              SURYA SANKALP
            </h1>
            <p className="text-xl text-yellow-400 font-medium mb-3">
              Every Rooftop. A Brighter Tomorrow.
            </p>
            <p className="text-gray-300 text-base leading-relaxed mb-6">
              AI-driven rooftop solar potential analysis, precise building segmentation, DISCOM tariff simulation (TGSPDCL FY 2026-27), and PM Surya Ghar subsidy assessment across India.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 bg-gray-900/80 p-3 rounded-lg border border-gray-800">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 100% Guest Access
              </span>
              <span>•</span>
              <span>No mandatory account or login</span>
              <span>•</span>
              <span>Explicit GPS permission only</span>
            </div>
          </div>
          <div className="w-full max-w-sm flex justify-center">
            <img
              src={solar}
              alt="Solar energy generation"
              className="w-72 h-auto drop-shadow-2xl animate-horizontal-move"
            />
          </div>
        </div>
      </section>

      {/* 2. Main Workflow: Location Selection & Preview */}
      <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold font-mono text-white mb-2">
            1. Select Your Rooftop Location
          </h2>
          <p className="text-gray-400 text-sm">
            Search any Indian address, choose a major solar preset, or click directly on the interactive satellite map below.
          </p>
        </div>

        {/* Search Controls & Presets */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Indian city, address, or landmark (e.g. Gachibowli, Hyderabad or Indiranagar, Bengaluru)..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 text-sm"
            />
            <button
              type="submit"
              disabled={searching}
              className="bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold px-6 py-3 rounded-lg transition duration-150 text-sm flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {searching ? "Resolving..." : "🔍 Search Location"}
            </button>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="bg-gray-800 hover:bg-gray-700 text-white font-medium px-4 py-3 rounded-lg border border-gray-700 transition duration-150 text-sm flex items-center justify-center gap-2 whitespace-nowrap"
            >
              📍 Use My Current Location
            </button>
          </form>

          {/* Feedback messages */}
          {geoStatus && (
            <p className="text-xs text-blue-400 bg-blue-950/40 border border-blue-800/60 p-2.5 rounded">
              {geoStatus}
            </p>
          )}
          {searchError && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/60 p-2.5 rounded">
              {searchError}
            </p>
          )}

          {/* Quick Demo City Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-800 text-xs">
            <span className="text-gray-400 font-medium">Quick Solar Presets:</span>
            {[
              { name: "Hyderabad (TGSPDCL)", lat: 17.4436, lng: 78.3520, display_name: "Gachibowli, Hyderabad, Telangana" },
              { name: "Bengaluru (BESCOM)", lat: 12.9784, lng: 77.6408, display_name: "Indiranagar, Bengaluru, Karnataka" },
              { name: "Ahmedabad (UGVCL)", lat: 23.0365, lng: 72.5256, display_name: "Vastrapur, Ahmedabad, Gujarat" },
              { name: "New Delhi (BSES)", lat: 28.6315, lng: 77.2167, display_name: "Connaught Place, New Delhi, Delhi" },
              { name: "Mumbai (MSEDCL)", lat: 19.0657, lng: 72.8687, display_name: "Bandra Kurla Complex, Mumbai, Maharashtra" },
              { name: "Kolkata (CESC)", lat: 22.5800, lng: 88.4300, display_name: "Salt Lake Sector V, Kolkata, West Bengal" },
            ].map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-yellow-300 rounded border border-gray-700 transition"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Interactive Satellite Map & Rooftop Preview Side-by-Side */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Interactive Map */}
          <div className="lg:col-span-7 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>🗺️</span> Interactive Satellite Map
                </h3>
                <p className="text-xs text-gray-400">
                  Click directly on any building to center the satellite target pin.
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                Esri World Imagery
              </span>
            </div>

            <div style={{ height: "420px", width: "100%" }}>
              <MapContainer
                center={[selectedLocation.lat, selectedLocation.lng]}
                zoom={17}
                scrollWheelZoom={true}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Earthstar Geographics'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
                <Marker position={[selectedLocation.lat, selectedLocation.lng]} />
                <MapClickHandler onLocationSelect={handleMapClick} />
                <MapViewUpdater center={selectedLocation} />
              </MapContainer>
            </div>
            <div className="p-3 bg-gray-900/90 text-xs text-gray-400 border-t border-gray-800 text-center">
              💡 Tip: Zoom in to your building and click on the rooftop to update coordinates.
            </div>
          </div>

          {/* Location & Rooftop Image Preview Card */}
          <div className="lg:col-span-5 bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-2xl flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>📸</span> Rooftop Preview
                </h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                  Pre-Analysis Verification
                </span>
              </div>

              {/* Resolved Location Metadata */}
              <div className="bg-gray-800/80 rounded-lg p-3.5 mb-4 border border-gray-700/80 space-y-1.5">
                <p className="text-xs text-gray-400 font-medium">Selected Location:</p>
                <p className="text-sm font-semibold text-white leading-snug">
                  {selectedLocation.name}
                </p>
                <div className="flex items-center gap-4 text-xs font-mono text-gray-300 pt-1 border-t border-gray-700">
                  <span>Lat: {selectedLocation.lat.toFixed(5)}° N</span>
                  <span>Long: {selectedLocation.lng.toFixed(5)}° E</span>
                </div>
              </div>

              {/* Live Satellite Image Preview with Target Indicator */}
              <div className="relative aspect-square w-full rounded-lg overflow-hidden border-2 border-gray-700 bg-gray-950 flex items-center justify-center">
                <img
                  src={satellitePreviewUrl}
                  alt="Satellite rooftop preview"
                  onLoad={() => setPreviewLoaded(true)}
                  onError={() => setPreviewError(true)}
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    previewLoaded ? "opacity-100" : "opacity-40"
                  }`}
                />

                {/* Target Crosshair on Center */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative flex items-center justify-center">
                    <div className="w-12 h-12 border-2 border-yellow-400 rounded-full animate-ping opacity-30"></div>
                    <div className="absolute w-8 h-8 border-2 border-yellow-400 rounded-full"></div>
                    <div className="absolute w-2 h-2 bg-yellow-400 rounded-full"></div>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur text-xs px-2 py-1 rounded border border-gray-700 text-gray-300">
                  🛰️ Aerial Imagery
                </div>
                <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur text-xs px-2 py-1 rounded border border-gray-700 text-yellow-400">
                  Target Rooftop Center
                </div>

                {previewError && (
                  <div className="absolute inset-0 bg-gray-900/90 flex flex-col items-center justify-center p-4 text-center">
                    <p className="text-yellow-400 text-sm font-semibold mb-1">Satellite tile loading fallback</p>
                    <p className="text-gray-400 text-xs">
                      Live remote tile is fetching. You can still proceed with analysis.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Analyze Action Button */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={analyzeSolarPotential}
                disabled={analyzing}
                className={`w-full py-4 rounded-xl font-bold text-base shadow-xl transition flex items-center justify-center gap-2 ${
                  analyzing
                    ? "bg-yellow-600/50 text-gray-300 cursor-wait"
                    : "bg-yellow-500 hover:bg-yellow-400 text-gray-950 hover:shadow-yellow-500/20"
                }`}
              >
                {analyzing ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-gray-950" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Running YOLOv8 Segmentation & Sizing...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Analyze Rooftop Solar Potential</span>
                  </>
                )}
              </button>
              <p className="text-center text-xs text-gray-400">
                Applies YOLOv8 polygon instance segmentation, NASA POWER solar insolation, and TGSPDCL FY 2026-27 tariffs.
              </p>
            </div>
          </div>
        </div>
      </main>

      <style jsx="true">{`
        @keyframes moveHorizontally {
          0% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(30px);
          }
          100% {
            transform: translateX(50px);
          }
        }
        .animate-horizontal-move {
          animation: moveHorizontally 4s infinite alternate ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default Home;
