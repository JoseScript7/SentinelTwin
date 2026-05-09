# SentinelTwin Project: Comprehensive Solution Document

**Date:** March 13, 2026
**Event:** KIT Hackathon 2026
**Problem Statement:** TNI26086 - Inventory Forecasting and Supply Chain Optimisation (Mac)

## Executive Summary
SentinelTwin is a fully interconnected, real-time AI Command Center comprising dual digital twins (Infrastructure and Supply Chain) alongside mobile companion apps. It is designed to autonomously anticipate demand, identify high-risk inventory stockouts in advance, and reroute logistics vehicles around active conflict zones or natural disasters. The solution provides a unified "Global Command Center" experience bridging four disparate data layers (Economic, Logistic, Geopolitical, and Infrastructure) into one automated AI monitoring engine.

---

## 1. Unified Global Command Center (`global-twin.html`)
The unified entry point that ties all intelligence layers together, providing a bird's-eye view for executives.
*   **Active Disruption Cascade:** A visual causal chain engine that dynamically tracks how an initial trigger (e.g., Red Sea Maritime Blockade) flows through connecting nodes: Port Restriction → Fleet Delay → Panic Buy Surge → Market Impact → Inventory Crisis.
*   **Twin Modules:** Clickable entry points into the specific regional sub-systems (Infrastructure Twin, Supply Chain Twin, Economic Twin).
*   **Crisis Ticker & Live Feed:** A real-time marquee scrolling live geopolitical anomalies and a live feed of critical system interventions on the right panel.
*   **Mobile Companions Panel:** Highly prominent QR download cards allowing direct installation of the associated Progressive Web Apps (PWAs).

## 2. Inventory Forecast & Optimisation Engine (`inventory-forecast.html`)
The brain of the operation, predicting stockouts before they happen and allowing users to simulate crisis outcomes.
*   **ML Candlestick Chart:** The core visualizer charting actual historical demand vs. the AI's 8-week predictive horizon, complete with confidence intervals (Upper/Lower CI bands) and safety stock trigger lines.
*   **What-If Simulation Engine:** Planners can use sliders (Promo Lift, Price Change, Lead Time Delay) and click 'Simulate' to dynamically recalculate the ML models in real-time, instantly adjusting the charts and SKU risk scores.
*   **SKU Intelligence:** A scrolling bottom ticker and a sortable table detailing all 120 tracked SKUs, their stockout risk percentages, anomaly explanations ("Demand DNA"), and supplier reliability scores.
*   **AI Assistant (Sentinel AI):** An interactive chatbot located in a dedicated tab capable of answering natural-language queries regarding stock shortages, lead times, and required PO interventions.

## 3. Logistics & Geopolitical Routing Center (`routing-dashboard.html`)
Ensures that inventory physically makes it to the warehouses despite macro-level constraints.
*   **Geopolitically-Aware Routing:** An embedded AI engine that detects conflict zones (e.g., blockades, active strikes) and visually re-plots logistics vehicle routes across the map using the OSRM transit system.
*   **Live OpenStreetMap/Leaflet integration:** Displays all active delivery trucks, color-coded by delay severity.
*   **Economic Impact Panel:** Models the financial cost of delays against Brent crude prices.

## 4. Infrastructure Risk / Flood Nowcast (`flood-nowcast.html`)
Monitors the physical world constraints impacting regional supply chains.
*   **Real-time Precipitation & Flood Mapping:** Geospatial overlap mapping vulnerable zones and correlating them to critical supply chain bottlenecks (warehouses, highways).
*   **Predictive Escalation:** Automatically predicts when a "Warning" state will evolve into a full "Critical" state necessitating logistics shutdown or immediate inventory relocation.

## 5. AI Engine Accuracy Dashboard (`ai-accuracy.html`)
Transparency layer required for institutional trust in AI solutions.
*   **Aggregated System Health:** Displays the overall combined accuracy percentage (e.g., 94.2%) across multiple ML microservices.
*   **Error Drift Monitoring:** Real-time line charting of model certainty over time.
*   **Model Matrix:** Breaks down the specific algorithms in use (Holt-Winters, NLP Engines, OSRM Pathfinding, Monte Carlo Simulations) alongside processing latency and deployment states.

## 6. Mobile Companion Apps (PWAs)
Two dedicated, installable field apps designed strictly for "on-the-go" usage, synchronized directly to the Global Twin via `localStorage`. Both are fully PWA-compliant (Progressive Web Apps) allowing users to "Add to Home Screen" for a native app feel.

*   **Inventory Manager App (`mobile-inventory-app.html`)**
    *   **Audience:** Warehouse Managers and Supply Chain Planners.
    *   **Features:** Displays the exact SKUs flagged as 'Critical Risk' by the desktop AI. Features a "Smart Replenishment" CTA allowing users to issue 1-click PO requests to preferred suppliers directly from their phone. Includes a mobile-optimized version of the ML Candlestick chart and the Sentinel AI chatbot.
*   **RescueLink Field App (`mobile-rescue-app.html`)**
    *   **Audience:** Field Operators and Emergency Responders addressing disruptions.
    *   **Features:** Huge SOS trigger button connected to the central server. Real-time tactical map detailing their precise location against moving flood zones or incidents. Synchronised inventory view allowing them to pull emergency supplies (diesel, medical kits) with auto-replenishment tracking updating the desktop command center instantly.

---

## Technical Stack
*   **Frontend UI:** Pure vanilla HTML5, CSS3 (Glassmorphism design, CSS Grid/Flexbox), Javascript (ES6+). No heavy frameworks, ensuring 0ms load times and maximum compatibility.
*   **Visualisations & Maps:** Chart.js (Candlestick, Line, Bar, Monte Carlo distributions), Leaflet.js / OpenStreetMaps (Tactical routing and flood radius mapping).
*   **Backend/Integration:** Express REST API (Node), WebSocket architecture for cross-dashboard synchronization, local browser data persistence (`localStorage`) for real-time state mirroring between desktop and mobile interfaces without complex auth overhead for the demo.
*   **Delivery:** Configured with Localtunnel (`npx localtunnel`) to proxy localhost securely onto the public internet for instant remote mobile installation and judges' viewing.
