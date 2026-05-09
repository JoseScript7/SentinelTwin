"""
Favorita — Forecast API Server
================================
FastAPI server that serves pre-computed forecasts from train_model.py
for dashboard consumption.

Usage:
    pip install fastapi uvicorn
    python forecast_api.py --forecast-file ./forecasts/forecast_output.json --port 8001

Endpoints:
    GET  /api/forecast           → All forecasts (paginated)
    GET  /api/forecast/{store}/{item} → Single store-item forecast
    GET  /api/forecast/summary   → Fleet-wide summary metrics
    GET  /api/health             → Health check
"""

import argparse
import json
from pathlib import Path

try:
    from fastapi import FastAPI, HTTPException, Query
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False
    print("⚠ FastAPI not installed. Install with: pip install fastapi uvicorn")

# ─── App Setup ───────────────────────────────────────────────────────
if HAS_FASTAPI:
    app = FastAPI(
        title="Inventory Forecast API",
        description="Serves LightGBM forecasts from Favorita data for dashboard consumption",
        version="1.0.0"
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"]
    )

# ─── Global State ────────────────────────────────────────────────────
FORECAST_DATA = None


def load_forecasts(filepath: str):
    """Load pre-computed forecasts from JSON."""
    global FORECAST_DATA
    with open(filepath, 'r') as f:
        FORECAST_DATA = json.load(f)
    n = len(FORECAST_DATA.get('forecasts', []))
    print(f"  ✓ Loaded {n} forecasts from {filepath}")


# ─── Endpoints ───────────────────────────────────────────────────────
if HAS_FASTAPI:

    @app.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "model": FORECAST_DATA.get('meta', {}).get('model', 'unknown') if FORECAST_DATA else "not loaded",
            "forecast_count": len(FORECAST_DATA.get('forecasts', [])) if FORECAST_DATA else 0
        }

    @app.get("/api/forecast")
    async def get_forecasts(
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=100),
        family: str = Query(None)
    ):
        if not FORECAST_DATA:
            raise HTTPException(status_code=503, detail="Forecasts not loaded")

        forecasts = FORECAST_DATA['forecasts']

        # Filter by family
        if family:
            forecasts = [f for f in forecasts if f.get('family', '').lower() == family.lower()]

        total = len(forecasts)
        start = (page - 1) * page_size
        end = start + page_size

        return {
            "meta": FORECAST_DATA.get('meta', {}),
            "validation": FORECAST_DATA.get('validation', {}),
            "total": total,
            "page": page,
            "page_size": page_size,
            "forecasts": forecasts[start:end]
        }

    @app.get("/api/forecast/{store_nbr}/{item_nbr}")
    async def get_single_forecast(store_nbr: int, item_nbr: int):
        if not FORECAST_DATA:
            raise HTTPException(status_code=503, detail="Forecasts not loaded")

        for fc in FORECAST_DATA['forecasts']:
            if fc['store_nbr'] == store_nbr and fc['item_nbr'] == item_nbr:
                return {
                    "meta": FORECAST_DATA.get('meta', {}),
                    "feature_importance": FORECAST_DATA.get('feature_importance', {}),
                    "forecast": fc
                }

        raise HTTPException(status_code=404, detail=f"Forecast not found for store {store_nbr}, item {item_nbr}")

    @app.get("/api/forecast/summary")
    async def get_summary():
        if not FORECAST_DATA:
            raise HTTPException(status_code=503, detail="Forecasts not loaded")

        forecasts = FORECAST_DATA['forecasts']

        # Aggregate metrics
        total_demand = sum(
            sum(w['p50'] for w in fc['forecasts'])
            for fc in forecasts
        )
        avg_weekly = total_demand / (len(forecasts) * 8) if forecasts else 0

        families = {}
        for fc in forecasts:
            fam = fc.get('family', 'Unknown')
            if fam not in families:
                families[fam] = {'count': 0, 'total_demand': 0}
            families[fam]['count'] += 1
            families[fam]['total_demand'] += sum(w['p50'] for w in fc['forecasts'])

        return {
            "total_skus": len(forecasts),
            "total_8week_demand": round(total_demand, 0),
            "avg_weekly_demand": round(avg_weekly, 1),
            "families": families,
            "validation": FORECAST_DATA.get('validation', {}),
            "feature_importance": FORECAST_DATA.get('feature_importance', {})
        }


def main():
    parser = argparse.ArgumentParser(description='Forecast API Server')
    parser.add_argument('--forecast-file', type=str,
                        default='./forecasts/forecast_output.json')
    parser.add_argument('--port', type=int, default=8001)
    parser.add_argument('--host', type=str, default='0.0.0.0')
    args = parser.parse_args()

    if not HAS_FASTAPI:
        print("❌ FastAPI required. Install with: pip install fastapi uvicorn")
        return

    if Path(args.forecast_file).exists():
        load_forecasts(args.forecast_file)
    else:
        print(f"⚠ Forecast file not found: {args.forecast_file}")
        print("  Run train_model.py first to generate forecasts.")

    print(f"\n🚀 Starting Forecast API on http://{args.host}:{args.port}")
    print(f"   Docs: http://localhost:{args.port}/docs")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == '__main__':
    main()
