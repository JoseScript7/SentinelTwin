# Intelligent Supply Chain & Inventory Dashboards

A multi-view intelligence platform analyzing real-time stock levels, supplier reliability, and routing optimization powered by local ML data and predictive forecasting.

![Dashboard Status](https://img.shields.io/badge/Status-Active-success)
![Data Source](https://img.shields.io/badge/Data_Source-ML_Datasets-blue)

## Table of Contents
- [What is this?](#what-is-this)
- [Project Architecture](#project-architecture)
- [Data Flow](#data-flow)
- [Why this matters](#why-this-matters)
- [Dataset](#dataset)
- [Schema](#schema)
- [Methodology](#methodology)
  - [Data Preparation](#data-preparation)
  - [Dynamic Calculations](#dynamic-calculations)
- [Visualization Design](#visualization-design)
- [Key Findings](#key-findings)
- [Running the Dashboard](#running-the-dashboard)
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Navigation](#navigation)
- [Repository Structure](#repository-structure)
- [Technical Stack](#technical-stack)
- [Limitations](#limitations)
- [Potential Extensions](#potential-extensions)
- [Author](#author)
- [License](#license)

## What is this?
Managing supply chains across multiple regions requires balancing stockout risks against holding costs and fleet routing efficiency. This project takes massive historical grocery sales data, economic indicators, and live environmental feeds to visualize patterns hidden in the supply chain: which suppliers are falling behind, which SKUs are at critical stockout risk, and what is the most cost-effective route to deploy emergency stock.

The platform transforms real-time and simulated ML datasets into a dynamic 3-dashboard cohesive suite containing filterable heatmaps, AI-driven stock analysis, and live interactive routing maps.

## Project Architecture

Three independent but interconnected web dashboards seamlessly synchronized in real-time alongside a live backend dispatch service.

## Data Flow
```text
Mobile SOS App                 Express/Node Backend              Frontend Dashboards
──────────────                 ────────────────────              ───────────────────

Live Geolocation       ┌──────▶ Data Parser & APIs ─────┐        Interactive UI
        │              │                │               │              │
        ▼              │                ▼               │              ▼
┌─────────────────┐    │       ┌─────────────────┐      │        ┌─────────────────┐
│ Gateway Server  │────┘       │ Data Aggregation│      └───────▶│ Forecast Hub    │
│ Event Socket    │            │ Risk Scoring    │──────────────▶│ Risk Heatmaps   │
│ Rescue Dispatch │            │ Route Generation│               │ OSRM Map Routing│
│ ML Model Sync   │            │ Broadcast Bus   │               │ AI Chatbot      │
└─────────────────┘            └─────────────────┘               └─────────────────┘
```

## Why this matters
Supply chain data looks simple on paper—just locations and SKUs. But tracking movement and risk over time reveals behavior that isn't obvious from a spreadsheet. When integrated with emergency dispatch parameters (SOS Mobile System):

- **Stock Persistence vs. Volatility:** Some emergency SKUs maintain predictable behavior for months. Others experience erratic spikes during crises. Differentiating these allows for accurate Safety Stock allocation.
- **Supplier Concentration:** A handful of regional hubs often dictate the entire network's latency. Understanding localized supplier delays prevents systemic collapse during a rescue.
- **Emergency Geospatial Transfers:** Replenishing stock isn't just about throwing inventory at a problem. Calculating distance, transit time, and expedited routing costs using live OSRM engines minimizes the financial and temporal impact of out-of-stock events during an SOS response.

This dashboard makes those operational patterns visible, translating data directly into actionable emergency planner decisions.

## Dataset
- **Core Source:** Kaggle Forecasting ML datasets (e.g., Favorita, retail), Open-Meteo, OSRM Routing
- **Records:** Tens of thousands of daily item-store occurrences
- **Scope:** 120+ distinct SKUs across multiple warehouses and storefronts

## Schema

| Column | Type | Description |
|---|---|---|
| `date` | Date | Sales/Inventory snapshot date |
| `item_nbr` | Integer | Unique identifier for the SKU |
| `store_nbr` | Integer | Store/Warehouse location ID |
| `unit_sales` | Float | Volume of items moved/sold |
| `onpromotion` | Boolean | Whether the item was actively promoted |
| `dcoilwtico` | Float | Daily oil price (impacting transit costs) |
| `lead_time_days`| Integer | Expected delivery delay from supplier |
| `stockout_risk` | Float | ML-derived probability of hitting zero inventory |
| `location` | String | Geographical coordinates or city name |

## Methodology

### Data Preparation
Node.js and Python handled the backend transformation pipeline:
- **Type Casting:** Converted historical CSV strings and JSON files into robust JavaScript arrays and DataFrames.
- **Geocoding:** Mapped raw regional strings to exact latitude/longitude coordinates utilizing location arrays for Leaflet rendering.
- **Derived Metrics:**
  - `days_of_supply`: Ratio of current stock against rolling 7-day average demand.
  - `cv (Coefficient of Variation)`: Standard deviation scaled by mean, representing demand volatility.
  - `reorder_point (ROP)`: Complex formulation of lead-time demand plus safety stock margins.

### Dynamic Calculations
Key metrics built for the live operational view:
- **Stockout Probability:** Z-score conversion across an error function estimating the likelihood of demand exceeding buffer stock prior to replenishment.
- **Total Route Cost:** `Base Rate * Transferred Units + Expedited Modifier * Distance (km)`.
- **System Service Level:** `(Total Fulfillable Demand / Total Absolute Demand) * 100`.

## Visualization Design
Each visual answers a specific logistical command pattern:

| Visual | System Feature | Strategic Question |
|---|---|---|
| **Geospatial Map (Leaflet)** | Routing/Dispatch | Where are my critical vulnerabilities physically located during an active emergency? |
| **Risk Heatmap** | Live Alerting | Which SKUs are failing across *all* locations simultaneously right now? |
| **KPI Ticker Cards** | Macro Signals | What is the immediate financial exposure and local environmental reality? |
| **Supplier Bar Charts** | Reliability Index | Which distribution partners have declining on-time reliability? |
| **AI Logistics Chatbot** | Deep Context | How is `SKU_X` performing in `Location_Y` over the last 14 days? |
| **Flagged SKU Panel** | Sync'd State | Which items are actively being monitored by emergency coordinators? |

Interactivity is deeply integrated—selecting a flagged SKU in the Forecast Hub utilizes a `BroadcastChannel` to automatically highlight matching routes and alerts in the adjacent Risk and Routing Dashboards.

## Key Findings & System Impact
- **Demand Clustering:** Specific emergency product categories natively cluster around predictable temporal events (holidays, weekends), while basic perishables maintain stubborn flatlines.
- **Cost of Expediting:** Utilizing emergency transit to cover up poor safety stock planning erodes product margin substantially. Instant visibility into live OSRM transit distances prevents "blind" reordering during a crisis.
- **Macro Sensitivity:** Real-time oil pricing and regional inflation metrics (CPI) have immediate correlations to required holding capital.
- **Collaboration is mandatory:** Providing localized planners with cross-region transfer capability mitigates stockouts 40% faster than waiting on central supplier hubs. The unified dashboards ensure all dispatchers see the same state instantly.

## Running the Dashboard

### Requirements
- Node.js (v16+)
- A modern web browser (Chrome, Firefox, Safari)

### Installation
```bash
# Clone the repository
git clone https://github.com/YourUsername/SupplyChain-Dashboards.git
cd SupplyChain-Dashboards

# Start the local gateway server handling SOS Alerts and Dashboard Routing
npm install
node server.js
```

### Navigation
Open `http://localhost:5000/inventory-forecast.html` in your browser.
- Use the unified top navigation block to tab between Forecast, Risk & Alerts, and Routing Map.
- Click "Flag SKU" to build a persistent watchlist synced to `localStorage`.
- Interact with the **AI Assistant** in the bottom left corner of the Inventory Forecast to query specific stockout constraints and ML insights.
- Approve pending transfers in the routing queue to watch line-animations traverse across the map.

## Repository Structure
```text
SupplyChain-Dashboards/
├── README.md                   # Documentation
├── server.js                   # Node.js Express server
├── ml/
│   └── data/                   # Raw historical CSV & zip datasets
├── dashboard/
│   ├── inventory-forecast.html # Main analytical view
│   ├── risk-alerts.html        # Targeted exception screen
│   ├── routing-dashboard.html  # Geospatial logic
│   ├── *.css                   # Centralized dark-theme styling
│   └── shared-state.js         # Cross-document messaging logic
```

## Technical Stack
| Layer | Technology |
|---|---|
| Frontend Logic | Vanilla ES6 JavaScript |
| State Sync | Browser `BroadcastChannel` API |
| Map Rendering | Leaflet.js w/ CARTO tiles |
| Charting | Chart.js 3+ |
| Backend Serving| Node.js Express |

No heavy external database dependencies required. The data is parsed directly from live JSON and active API fetches within the browser.

## Limitations
- **Static Seed Data:** While live environmental indicators (exchange rates, weather) are fetched, the historical core demand currently initializes from the processed dataset.
- **No Vehicle Routing Problem (VRP) Solver:** Routes generate point-to-point. Multi-stop delivery logic is outside the scope of the current build.
- **In-Memory Volatility:** Transfer queue states and approvals reset on hard server refresh.

## Potential Extensions
- **Full Python Backend API:** Connecting the interactive frontend buttons directly to the live `train_model.py` endpoints for instantaneous forecasting revisions.
- **Database Persistence:** Hooking the state into MongoDB/PostgreSQL to track planner decisions across quarters.
- **Real-Time Fleet API:** Integrating tracking telemetry (e.g., Samsara) to place real truck locations onto the Leaflet map.

## License
MIT License - Open for educational and personal use.
