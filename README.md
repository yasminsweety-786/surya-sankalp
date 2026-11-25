<img width="655" height="341" alt="image" src="https://github.com/user-attachments/assets/55b5b9e0-2ebb-4254-b7f4-25eafec088f9" /># ☀️ Surya Sankalp
### Every Rooftop. A Brighter Tomorrow.

**AI-Powered Rooftop Solar Potential Assessment, Financial Feasibility & Urban Solar Planning Platform**

Surya Sankalp is an AI-powered platform designed to identify rooftop regions, estimate solar energy potential, and evaluate the financial feasibility of rooftop solar installations.

By combining computer vision, rooftop image analysis, solar radiation data, and financial calculations, Surya Sankalp helps individuals and urban planners explore the solar energy potential of available rooftop spaces.

---

## 🌍 1. The Problem

Many buildings have unused rooftop spaces that could potentially generate clean solar energy. However, estimating rooftop suitability, installation capacity, expected generation, installation costs, and financial benefits can be difficult.

Users often lack an accessible way to understand whether their rooftops are suitable for solar installations and what benefits they could receive.

## 💡 2. Our Solution

Surya Sankalp provides an integrated platform for rooftop analysis and solar financial assessment.

Users can select a geographical location, analyse rooftop imagery, inspect individual detected rooftops, estimate solar installation capacity, and explore potential financial benefits.

**Our Vision: Turn unused rooftop spaces into informed solar energy opportunities.**

---

## 🤖 3. AI-Based Rooftop Detection – YOLOv8

Surya Sankalp uses a YOLOv8-based computer vision model to identify rooftop regions from aerial or satellite imagery.

The model analyses the input image and generates segmentation masks representing detected rooftop boundaries. These regions can then be inspected individually for further solar potential assessment.

### Original Rooftop Image

The original aerial or satellite image used as input for rooftop analysis.

![Original Rooftop Image](images/original-rooftop.png)

### YOLOv8 Rooftop Segmentation

The computer vision model identifies rooftop regions and displays their detected boundaries using segmentation overlays.

![YOLOv8 Rooftop Segmentation](images/yolo-rooftop-detection.png)

### Before and After Comparison

A visual comparison of the original image and the AI-generated rooftop segmentation result.

![Rooftop Detection Comparison](images/rooftop-comparison.png)

### What the AI Model Provides

- Rooftop region detection.
- Segmentation masks representing rooftop boundaries.
- Individual rooftop regions for inspection.
- Confidence scores associated with detections.

*Detection accuracy depends on image quality, resolution, and model performance. Results are estimates and may require validation.*

---

## 🛰️ 4. Location-Based Rooftop Assessment

- Select a geographical location for analysis.
- Display the corresponding rooftop imagery.
- Identify individual rooftop regions.
- Inspect selected rooftops and their assessment details.
- Connect rooftop analysis with location-specific solar information.

---

## ☀️ 5. Solar Potential Estimation

After rooftop detection, the platform evaluates the available rooftop space to estimate its solar potential.

- Estimates rooftop footprint area.
- Calculates usable rooftop area.
- Considers available space for solar panels.
- Estimates potential solar installation capacity.
- Uses solar radiation information to estimate energy generation.

---

## 💰 6. Financial Feasibility Analysis

Surya Sankalp helps users understand the potential financial benefits of rooftop solar installations.

- Estimated installation cost.
- Applicable government subsidy calculations.
- Estimated electricity bill savings.
- Export settlement considerations where applicable.
- Estimated payback period.
- Monthly and long-term financial projections.

Financial estimates depend on location, consumer category, applicable regulations, and actual installation conditions.

---

## 📊 7. Interactive Solar Dashboard

The dashboard brings important assessment results together in one place.

It presents:

- Selected location information.
- Rooftop detection and inspection results.
- Rooftop area and usable area.
- Estimated solar installation capacity.
- Expected energy generation.
- Estimated installation cost and subsidy.
- Electricity bill savings and payback period.
- Monthly and long-term projections.

---

## 🔄 8. How It Works

```text
       USER SELECTS LOCATION
                |
                v
        ROOFTOP IMAGERY
                |
                v
       YOLOv8 AI DETECTION
                |
                v
       ROOFTOP SEGMENTATION
                |
                v
       INDIVIDUAL ROOFTOP
             INSPECTION
                |
                v
       USABLE AREA ESTIMATION
                |
                v
       SOLAR CAPACITY AND
       GENERATION ESTIMATION
                |
                v
       FINANCIAL FEASIBILITY
                |
                v
       INTERACTIVE DASHBOARD
```

---

## 🏗️ 9. System Architecture

```text
             REACT FRONTEND
                   |
                   v
             FASTAPI BACKEND
                   |
         +---------+---------+
         |                   |
         v                   v
   IMAGE PROCESSING     SOLAR DATA
         |                   |
         v                   v
     YOLOv8 MODEL       NASA POWER API
         |                   |
         +---------+---------+
                   |
                   v
          SOLAR POTENTIAL
             ENGINE
                   |
                   v
          FINANCIAL ENGINE
                   |
                   v
          RESULTS DASHBOARD
```

---

## 🛠️ 10. Technology Stack

| Component | Technology |
|---|---|
| Frontend | React |
| Backend | Python, FastAPI |
| AI / Computer Vision | YOLOv8 |
| Image Processing | OpenCV |
| Solar Radiation Data | NASA POWER API |
| Programming Languages | Python, JavaScript |
| Development Tools | Git, GitHub, VS Code |

---

## 🚀 11. Project Setup

### Prerequisites

- Node.js and npm
- Python 3.10+
- Git

### Clone the Repository

```bash
git clone https://github.com/yasminsweety-786/surya-sankalp.git
cd surya-sankalp
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Backend Setup

Open another terminal:

```bash
cd backend
python -m venv venv
```

Activate the virtual environment.

**Windows:**

```bash
venv\Scripts\activate
```

**Linux / macOS:**

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the backend:

```bash
uvicorn main:app --reload
```

*Note: Update folder names and startup commands according to the actual repository structure.*

---

## 🔮 12. Future Scope

- Improved rooftop detection using diverse aerial and satellite imagery.
- Dedicated AI-based solar-panel detection for existing installations.
- More detailed building-level solar assessments.
- Expanded geographical coverage.
- Integration with additional renewable energy datasets.
- Improved urban-level rooftop solar potential mapping.

---

## 🎯 13. Intended Users

- Homeowners interested in rooftop solar.
- Residential communities and housing societies.
- Commercial building owners.
- Solar energy consultants.
- Urban planners and renewable energy stakeholders.

---

## 🌱 14. Our Vision

We envision a future where every suitable rooftop can be evaluated as a potential source of clean energy.

Surya Sankalp aims to make rooftop solar assessment more accessible, understandable, and data-driven.

---

## ⚠️ 15. Disclaimer

Surya Sankalp is a decision-support and estimation platform. Its results are not certified engineering measurements, guaranteed financial returns, or official government approvals. Actual installation decisions should be based on verified site measurements, current regulations, and approvals from the relevant authorities.

---

### ☀️ Surya Sankalp
**Every Rooftop. A Brighter Tomorrow.**

**GitHub Repository:** https://github.com/yasminsweety-786/surya-sankalp

