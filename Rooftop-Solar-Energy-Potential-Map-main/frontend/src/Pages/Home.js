import React, { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { GoogleMap, LoadScript, Polygon } from "@react-google-maps/api";
import p1 from "../assests/p1.png";
import solar from "../assests/solar.png";
import { FaLinkedin, FaInstagram, FaGithub } from "react-icons/fa";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' && window.location.origin.includes('localhost:3000') ? 'http://localhost:5000' : '');

const Home = () => {
  const navigate = useNavigate();
  const [map, setMap] = useState(null);
  const [polygon, setPolygon] = useState(null);
  const [coords, setCoords] = useState("22.5700,88.3600; 22.5750,88.3600; 22.5750,88.3650; 22.5700,88.3650");
  const [analyzing, setAnalyzing] = useState(false);
  const defaultCenter = { lat: 22.5726, lng: 88.3639 };

  const handleMapLoad = (mapInstance) => {
    setMap(mapInstance);
  };

  const handleCoordsChange = (e) => {
    setCoords(e.target.value);
  };

  const parseCoords = (coordsString) => {
    return coordsString.split(";").map((coord) => {
      const [lat, lng] = coord.split(",").map(Number);
      return { lat, lng };
    });
  };

  const validateCoordinates = (coordsArray) => {
    for (let i = 0; i < coordsArray.length - 1; i++) {
      const latDiff = Math.abs(coordsArray[i].lat - coordsArray[i + 1].lat);
      const lngDiff = Math.abs(coordsArray[i].lng - coordsArray[i + 1].lng);
      if (latDiff > 0.09 || lngDiff > 0.09) {
        return false;
      }
    }
    return true;
  };

  const createPolygon = () => {
    const coordsArray = parseCoords(coords);
    if (!validateCoordinates(coordsArray)) {
      alert(
        "The difference between consecutive latitude or longitude values should not be greater than 0.09."
      );
      return;
    }
    setPolygon(coordsArray);
    fitMapToPolygon(coordsArray);
  };

  const removePolygon = () => {
    setPolygon(null);
  };

  const fitMapToPolygon = (coordsArray) => {
    if (map) {
      const bounds = new window.google.maps.LatLngBounds();
      coordsArray.forEach((coord) =>
        bounds.extend(new window.google.maps.LatLng(coord.lat, coord.lng))
      );
      map.fitBounds(bounds);
    }
  };

  const searchCoordinates = () => {
    const coordsArray = parseCoords(coords);
    if (coordsArray.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      coordsArray.forEach((coord) =>
        bounds.extend(new window.google.maps.LatLng(coord.lat, coord.lng))
      );
      map.fitBounds(bounds);
    }
  };

  const saveImage = () => {
    const coordsArray = parseCoords(coords);
    console.log(coordsArray);
    if (coordsArray.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      coordsArray.forEach((coord) =>
        bounds.extend(new window.google.maps.LatLng(coord.lat, coord.lng))
      );
      const center = bounds.getCenter();
      console.log(center);
      const zoom = map.getZoom();
      const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat()},${center.lng()}&zoom=${zoom}&size=600x400&maptype=satellite&key=AIzaSyB4mze3dCYLlVzGEWO-cyHZYEiV01JD6iM`;
      console.log(staticMapUrl);
      const imgElement = document.createElement("img");
      imgElement.src = staticMapUrl;
      imgElement.alt = "Satellite Image";
      document.getElementById("mapImage").innerHTML = ""; // Clear previous image
      document.getElementById("mapImage").appendChild(imgElement);
    }
  };

  const analyzeSolarPotential = async () => {
    try {
      setAnalyzing(true);
      const coordsArray = parseCoords(coords);
      if (coordsArray.length === 0) {
        alert("Please enter valid coordinates or choose a city preset.");
        setAnalyzing(false);
        return;
      }

      const lats = coordsArray.map(c => c.lat);
      const lngs = coordsArray.map(c => c.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;

      const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat},${centerLng}&zoom=17&size=600x400&maptype=satellite&key=AIzaSyB4mze3dCYLlVzGEWO-cyHZYEiV01JD6iM`;

      // 1. Save polygon record
      const saveRes = await axios.post(`${API_BASE}/api/save_polygon`, {
        coordinates: coords,
        imageUrl: staticMapUrl,
        user_id: 1,
        bounds: { minLat, maxLat, minLng, maxLng }
      });

      const polygonId = saveRes.data.polygon_id;

      // 2. Trigger AI rooftop segmentation with validated threshold (>= 0.20)
      const predRes = await axios.post(`${API_BASE}/api/run_prediction`, {
        polygon_id: polygonId,
        confidence_threshold: 0.20
      });

      const predData = predRes.data;

      // 3. Navigate to Dashboard with real results
      navigate("/dashboard", {
        state: {
          polygonId: polygonId,
          lat1: centerLat,
          long1: centerLng,
          mapImageUrl: staticMapUrl,
          detectedAreaM2: predData.total_rooftop_area_m2,
          detectedCount: predData.detected_count,
          conversionMethod: predData.conversion_method,
          uncertaintyStatus: predData.uncertainty_status,
          detections: predData.detections
        }
      });
    } catch (error) {
      console.error("Error analyzing rooftop solar potential:", error);
      alert("Error analyzing rooftop solar potential: " + (error.response?.data?.detail || error.message));
    } finally {
      setAnalyzing(false);
    }
  };

  const savePolygon = async () => {
    await analyzeSolarPotential();
  };

  return (
    <>
      <div className="flex">
        <div>
          <img src={p1} width="700px" height="700px" className="p-20" />
          <div className="text-white text-3xl leading-10 border-l-8 space-x-5 font-mono ml-16 border-blue-600">
            <p className="space-x-5">ANY QUERIES?</p>
            <Link to="/contact" className="hover:text-blue-400 underline">
              Contact Surya Sankalp
            </Link>{" "}
            <br />
          </div>
          <div className="flex space-x-6 mt-2 ml-16">
            <a
              href="https://www.linkedin.com/in/yash-pandey"
              className="text-blue-500 hover:text-blue-700 text-2xl"
            >
              <FaLinkedin />
            </a>
            <a
              href="https://www.instagram.com/shibu___16"
              className="text-pink-500 hover:text-pink-700 text-2xl"
            >
              <FaInstagram />
            </a>
            <a
              href="https://github.com/Yash16p"
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              <FaGithub />
            </a>
          </div>
        </div>
        <div>
          <img
            src={solar}
            width="700px"
            height="700px"
            className="p-20 animate-horizontal-move"
          />
        </div>
      </div>

      <div className="h-screen flex flex-col items-center justify-center">
        <div className="w-full max-w-3xl p-4">
          <h1 className="font-bold text-3xl mb-2 text-center text-white font-mono">
            Select Area
          </h1>
          <h3 className="text-xl mb-3 text-center text-white font-mono">
            Select an Area on the map to estimate the solar energy potential for
            rooftops.
          </h3>
          <LoadScript googleMapsApiKey="AIzaSyB4mze3dCYLlVzGEWO-cyHZYEiV01JD6iM">
            <div className="flex justify-center p-6">
              <GoogleMap
                mapContainerStyle={{ height: "40vh", width: "100%" }}
                center={defaultCenter}
                zoom={10}
                onLoad={handleMapLoad}
              >
                {polygon && (
                  <Polygon
                    paths={polygon}
                    options={{
                      strokeColor: "#FF0000",
                      strokeOpacity: 0.8,
                      strokeWeight: 2,
                      fillColor: "#FF0000",
                      fillOpacity: 0.35,
                    }}
                  />
                )}
              </GoogleMap>
            </div>
          </LoadScript>
        </div>
        <div className="p-4 w-full mt-1">
          <div className="flex flex-col items-center space-y-4">
            <label htmlFor="coords" className="block text-gray-700">
              Enter coordinates (lat,lng; lat,lng; ...):
            </label>
            <input
              type="text"
              id="coords"
              value={coords}
              onChange={handleCoordsChange}
              className="p-2 border border-gray-300 rounded w-full"
            />
            {/* Quick Demo City Presets */}
            <div className="flex flex-wrap gap-2 justify-center mb-2">
              <span className="text-gray-400 text-sm py-1">Quick Demo Presets:</span>
              <button
                type="button"
                onClick={() => setCoords("22.5700,88.3600; 22.5750,88.3600; 22.5750,88.3650; 22.5700,88.3650")}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs text-yellow-300 rounded border border-gray-700"
              >
                Kolkata CBD
              </button>
              <button
                type="button"
                onClick={() => setCoords("23.0200,72.5700; 23.0250,72.5700; 23.0250,72.5750; 23.0200,72.5750")}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs text-blue-300 rounded border border-gray-700"
              >
                Ahmedabad Solar
              </button>
              <button
                type="button"
                onClick={() => setCoords("12.9700,77.5900; 12.9750,77.5900; 12.9750,77.5950; 12.9700,77.5950")}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs text-emerald-300 rounded border border-gray-700"
              >
                Bengaluru Hub
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={searchCoordinates}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
              >
                Search Bounds
              </button>
              <button
                onClick={createPolygon}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
              >
                Draw Polygon
              </button>
              <button
                onClick={removePolygon}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
              >
                Clear
              </button>
              <button
                onClick={saveImage}
                className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 text-sm font-medium"
              >
                Preview Image
              </button>
              <button
                onClick={analyzeSolarPotential}
                disabled={analyzing}
                className={`px-6 py-2 rounded text-sm font-bold shadow-lg transition ${
                  analyzing
                    ? "bg-purple-800 text-gray-300 cursor-wait"
                    : "bg-purple-600 hover:bg-purple-700 text-white"
                }`}
              >
                {analyzing ? "AI Segmenting & Analyzing..." : "⚡ Analyze Solar Potential"}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center mt-20">
            <div
              id="mapImage"
              className="p-4 mt-4 flex items-center jutify-center"
            ></div>
          </div>
        </div>
      </div>
      <style jsx="true">{`
        @keyframes moveHorizontally {
          0% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(70px);
          }
          100% {
            transform: translateX(100px);
          }
        }

        .animate-horizontal-move {
          animation: moveHorizontally 4s infinite alternate;
        }
      `}</style>
    </>
  );
};

export default Home;
