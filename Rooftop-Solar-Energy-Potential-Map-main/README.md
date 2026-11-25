# Surya Sankalp
### *Every Rooftop. A Brighter Tomorrow.*

Surya Sankalp is an AI-powered rooftop solar feasibility and financial assessment platform. By combining computer vision segmentation of high-resolution satellite imagery, meteorological climatology, and state electricity regulatory frameworks, Surya Sankalp enables residential, commercial, and institutional property owners to accurately evaluate rooftop solar potential and financial returns.

---

## ⚡ Key Capabilities

1. **Satellite Rooftop Segmentation**: Employs an optimized YOLOv8 instance segmentation model to isolate building contours and compute physical rooftop areas ($m^2$ and sq.ft) with geodesic coordinate calibration.
2. **Automated Visual Solar Panel Detection**: Scans detected rooftop surfaces using spectral reflectance and geometric filtering to detect existing photovoltaic installations (`SOLAR_PANELS_DETECTED`, `NO_VISIBLE_PANELS_DETECTED`, `UNABLE_TO_DETERMINE`), rendered in vibrant cyan on overlay images.
3. **Sequential Rooftop Numbering & Interactive Synchronization**: Assigns persistent, 1-based segment IDs (`#1`, `#2`, `#3`, ...) matching satellite visual badges and data tables synchronously.
4. **Transparent Multi-Constraint Sizing Engine**: Strictly enforces solar potential hierarchy:
   $$\text{Total Rooftop Area} \to \text{Setback Safety Buffer (30\%)} \to \text{Deduction of Existing Panels} \to \text{Remaining Usable Area} \to \text{DISCOM Grid Cap} \to \text{Consumption Matching}$$
   *Zero Double-Counting Rule*: Existing capacity is never counted as new recommended installation; $0\text{ m}^2$ remaining usable space strictly yields $0\text{ kWp}$ new expansion.
5. **Meteorological Solar Estimation**: Connects to the NASA Langley Research Center POWER climatology project to obtain multi-year monthly Global Horizontal Irradiance (GHI) for any global latitude/longitude.
6. **Regulatory Financial Engine**: Integrates Central Financial Assistance (CFA) under PM Surya Ghar: Muft Bijli Yojana, DISCOM retail tariff schedules (TGSPDCL FY 2026-27), and net metering export settlement rates (TGERC Regulation No. 1 of 2025 @ ₹2.57/kWh).

---

## 🏗️ Architecture & Technology Stack

```
Surya Sankalp Platform
├── Frontend (React 18 SPA)
│   ├── Interactive Satellite Map & ROI Boundary Selection (Leaflet / ESRI ArcGIS World Imagery)
│   ├── Side-by-Side Satellite View & Detected Rooftop Boundaries (SVG Overlay Layer)
│   ├── Segmented Rooftops Identification Table & Selected Rooftop Feasibility Panel
│   ├── Consumer Load, Tariff, and Financial Simulation Controls
│   ├── 12-Month Generation vs. Consumption Chart (Chart.js)
│   └── 25-Year Lifecycle Cash Flow & Methodology Disclosures
│
├── Backend (FastAPI / Python 3.13)
│   ├── Geocoding & City Preset Service (Nominatim OSM + Pre-calibrated GeoJSON)
│   ├── Satellite Tile Export & Geodesic Scaling (WGS-84 Haversine / Equirectangular Projection)
│   ├── SQLite Storage (`backend/solar.db`) with pre-seeded DISCOM tariff orders
│   └── Financial Advisor & Sizing Service (`backend/services/financial_advisor.py`)
│
└── Machine Learning & Computer Vision (`ML/`)
    ├── YOLOv8 Instance Segmentation (`ML/models/best.pt`)
    ├── Polygon Contour Smoothing & Area Calculation via Green's Theorem
    ├── Non-Maximum Suppression (IoU deduplication)
    └── Automated Visual PV Array Texture & Reflectance Scanner
```

---

## 📊 Computer Vision Pipeline & Scope Transparency

* **Model Training Scope**: The primary segmentation model (`ML/models/best.pt`) is a single-class instance segmentation model trained on aerial/satellite imagery to detect building envelopes (`names: {0: 'Building'}`).
* **Automated Solar Panel Detection**: Because the baseline model predicts building boundaries, Surya Sankalp executes a secondary computer vision pipeline on each detected rooftop ROI:
  - Mask boundary extraction and perspective normalization
  - HSV color-space thresholding isolating monocrystalline charcoal and polycrystalline deep-blue silicon reflectances
  - Morphological closing and contour rectangularity filtering
  - Transparent user refinement toggle to adjust or override panel status without blocking the analysis flow.

---

## 🚀 Quickstart & Installation

### Prerequisites
- Python 3.10+ (tested on Python 3.12 and 3.13)
- Node.js 18+ and npm
- Git

### 1. Backend Setup

```bash
# Clone the repository
git clone https://github.com/your-username/surya-sankalp.git
cd surya-sankalp

# Create and activate a virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn backend.main:app --host 127.0.0.1 --port 5000 --reload
```

The backend API will be available at `http://127.0.0.1:5000`. API documentation is available at `http://127.0.0.1:5000/docs`.

### 2. Frontend Setup

```bash
cd frontend

# Install npm packages
npm install

# Option A: Run development server
npm start

# Option B: Build optimized production bundle
npm run build
```

When built, FastAPI automatically serves the optimized production React build from `frontend/build` at `http://127.0.0.1:5000/`.

---

## 🧪 Automated Testing

Surya Sankalp includes comprehensive automated regression suites verifying rooftop segmentation, existing solar deductions, and financial calculations:

```bash
# Run all test suites
python -m pytest tests/test_existing_solar_verification.py tests/test_ui_and_segmentation.py -v
```

---

## 📡 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Health check and database connection status |
| `/api/geocode?q={query}` | `GET` | Nominatim forward geocoding with bounding box |
| `/api/city_presets` | `GET` | Pre-calibrated urban rooftop locations |
| `/api/save_polygon` | `POST` | Saves satellite polygon ROI and prepares geocoded image |
| `/api/run_prediction` | `POST` | Executes YOLOv8 segmentation and automated PV panel detection |
| `/api/estimate` | `POST` | Fetches NASA POWER insolation and computes energy yield |
| `/api/tariffs` | `GET` | Retrieves DISCOM tariff schedules and statutory regulations |
| `/api/financial_assessment` | `POST` | Executes multi-constraint sizing, subsidy calculation, and net metering bill simulation |

---

## 📜 Regulatory References & Disclosures

* **PM Surya Ghar: Muft Bijli Yojana**: Central Financial Assistance (CFA) under Ministry of New and Renewable Energy (MNRE) guidelines:
  - Up to 2 kWp: ₹33,000 per kWp (₹66,000 max)
  - 3 kWp and above: ₹78,000 fixed
* **TGERC Rooftop Solar Regulation No. 1 of 2025**:
  - Residential/Govt: Up to 100% of sanctioned load
  - Commercial/Industrial: Up to 80% of sanctioned load
  - Export settlement credit: ₹2.57/kWh (Proceeding dated 29-12-2025)
* **NASA POWER Climatology**: Global Horizontal Irradiance (GHI) multi-year daily averages.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
