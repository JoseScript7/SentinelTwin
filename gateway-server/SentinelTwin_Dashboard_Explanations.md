# SentinelTwin: Dashboard Logic & Field Explanations for the Pitch

This document explains the "Why" and "How" behind every key chart, field, and metric across the SentinelTwin application to help you explain them perfectly to the judges.

---

## 1. Inventory Forecast Dashboard (`inventory-forecast.html`)
This is the "Brain" of the supply chain planning. 

**Why a Candlestick Chart for Inventory?**
Traditionally, inventory is shown as a boring single line. But demand is volatile, especially during crises (like floods).
*   **The Logic:** We adapted financial Candlestick charts to represent *Demand Volatility*.
*   **Green Candle (Bullish):** Demand was higher than expected and stock is flowing out fast. (Open represents expected demand, Close represents actual higher demand).
*   **Red Candle (Bearish):** Demand was lower than expected, meaning we are overstocking and losing money on holding costs.
*   **The Wicks (Top/Bottom lines):** Show the *absolute extremes* of demand spikes or drops during that specific week.
*   **The "Reorder Point" Line (Red dashed line):** This is calculated by the ML engine. If the bottom of a candle pierces this line, it means stock fell below safety levels, triggering an auto-reorder.

**Other Key Fields in Inventory:**
*   **Confidence Bands (Upper/Lower CI):** The shaded area behind the candles. This is the AI's "margin of error." The narrower the band, the more confident the AI is. The wider the band, the more chaotic the real-world situation is (e.g., during a flood).
*   **Monte Carlo Simulation (Right Panel):** Instead of one guess, the AI ran 2,000 statistical simulations (randomized scenarios) to output the "Stockout Risk %". If it says 92%, it means in 92% of the simulated futures, we run out of this product.
*   **Demand DNA:** Breaks down *why* people are buying. Is it a "Trend" (people slowly buying more over months), "Seasonality" (buying umbrellas because it's monsoon season), or "Noise" (random panic buying due to news)?

---

## 2. Global Twin Command Center (`global-twin.html`)
This is the "Executive Summary" for the CEO or Disaster Manager.

*   **Active Disruption Cascade:** This is the core logic engine. It visualizes how one real-world event ripples through the whole company. 
    *   *Logic:* A geopolitical event (Red Sea Blockade) → impacts ships (Port Restriction) → means trucks wait longer (Fleet Delay +4.2 days) → causes people to panic buy (Demand +22%) → results in an Inventory Crisis (3 SKUs at Risk).
*   **The 3 Twin Modules:** 
    *   *Infrastructure Twin:* Connects to physical reality (ports, roads, floods).
    *   *Supply Chain Twin:* Connects to moving assets (trucks, ships).
    *   *Economic Twin:* Connects to the stock market (Brent Crude oil prices). 
    *   *Logic:* SentinelTwin proves that you cannot manage inventory without monitoring the physical and economic world simultaneously.

---

## 3. Flood & Infrastructure Nowcast (`flood-nowcast.html`)
The physical world constraints acting on the supply chain.

*   **Nowcast Rainfall Map:** "Nowcasting" means predicting the very immediate future (next 2-6 hours), unlike forecasting (next week). 
*   **Risk Scoring Logic (Green/Yellow/Red zones):** The AI doesn't just look at rainfall. It calculates `(Rainfall Intensity) + (River Water Level) + (Historical Drainage capability)`. A zone might get heavy rain but remain Green if the AI knows that area drains water quickly.
*   **Infrastructure Risk:** It identifies specific bridges or highways inside the red zones. If NH-45 is in a Red Zone, the system automatically tells the Routing Dashboard to stop sending trucks there.

---

## 4. Routing & Logistics (`routing-dashboard.html`)
How we actually move the items when disaster strikes.

*   **GeoFuel AI Rerouting:** The map shows current delivery trucks. 
    *   *Logic:* Standard Google Maps just finds the shortest path. *Our* AI uses OSRM (Open Source Routing Machine) combined with the Flood Dashboard data. It actively recalculates paths to *avoid* the red flood zones, even if it means driving 50km further, because a delayed truck is better than a drowning truck.
*   **Cost Impact Chart:** Rerouting costs money. This chart mathematically proves to the judges that paying an extra ₹4.2L for a longer route is mathematically cheaper than a total stockout costing ₹25L in lost revenue.

---

## 5. Mobile Companion Apps (PWAs)
Why do we need mobile apps if we have a command center?

*   **Logic:** The Global Twin is for the *General* sitting in the base. The Mobile Apps are for the *Soldiers* on the front lines.
*   **Inventory App (For Warehouse Managers):** They don't need complex charts. They just need to know exactly which 3 SKUs to reorder *right now* while holding a clipboard in the warehouse.
*   **RescueLink App (For Field Responders):** Complete tactical focus. When a flood hits, they hit the massive SOS button. The AI then calculates their exact GPS location, finds the nearest available response team on the map, and alerts the command center.

---

## 6. AI Engine Accuracy (`ai-accuracy.html`)
The "Trust Layer." 

*   **Aggregated System Health (e.g., 94.2%):** Judges always ask "How do you know the AI isn't hallucinating?" This dashboard is the answer. It constantly measures the AI's past predictions against what *actually* happened in reality to score its own accuracy.
*   **Error Drift:** If the accuracy starts dropping (drifting) over time, it means the world is changing faster than the model. The system flags this so data scientists can retrain the model.
