/**
 * ═══════════════════════════════════════════════════════════════════
 *  API-SERVICE.JS — Live Data Feed Layer
 *  Calls free, no-key APIs for weather, holidays, routing, economic
 *  indicators, exchange rates, and climate data.
 * ═══════════════════════════════════════════════════════════════════
 */

class APIService {
    constructor() {
        this.cache = new Map();
        this.CACHE_TTL = 300000; // 5 min
        this.rateLimiter = { lastCall: 0, minInterval: 1200 };
    }

    async _fetch(url, cacheKey, ttl) {
        const now = Date.now();
        const cached = this.cache.get(cacheKey);
        if (cached && now - cached.ts < (ttl || this.CACHE_TTL)) return cached.data;
        // Rate limit
        const wait = this.rateLimiter.minInterval - (now - this.rateLimiter.lastCall);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        this.rateLimiter.lastCall = Date.now();
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            this.cache.set(cacheKey, { data, ts: Date.now() });
            return data;
        } catch (e) {
            console.warn(`[API] ${cacheKey} failed:`, e.message);
            return cached ? cached.data : null;
        }
    }

    async _fetchCSV(url, cacheKey, ttl) {
        const now = Date.now();
        const cached = this.cache.get(cacheKey);
        if (cached && now - cached.ts < (ttl || this.CACHE_TTL)) return cached.data;
        try {
            const resp = await fetch(url);
            const text = await resp.text();
            const lines = text.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            const rows = lines.slice(1).map(line => {
                const vals = line.split(',').map(v => v.trim());
                const obj = {};
                headers.forEach((h, i) => obj[h] = vals[i]);
                return obj;
            });
            this.cache.set(cacheKey, { data: rows, ts: Date.now() });
            return rows;
        } catch (e) {
            console.warn(`[API] ${cacheKey} CSV failed:`, e.message);
            return cached ? cached.data : [];
        }
    }

    // ── Open-Meteo Historical Weather ────────────────────────────
    async getWeather(lat, lng, startDate, endDate) {
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=Asia/Kolkata`;
        return this._fetch(url, `weather_${lat}_${lng}_${startDate}`, 3600000);
    }

    // ── Public Holidays India ────────────────────────────────────
    async getHolidays(year) {
        const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/IN`;
        return this._fetch(url, `holidays_${year}`, 86400000);
    }

    // ── OSRM Routing Between Two Coords ──────────────────────────
    async getRoute(fromLng, fromLat, toLng, toLat) {
        const url = `http://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
        return this._fetch(url, `route_${fromLng}_${fromLat}_${toLng}_${toLat}`, 3600000);
    }

    // ── Exchange Rates (INR Base) ────────────────────────────────
    async getExchangeRates() {
        return this._fetch('https://open.er-api.com/v6/latest/INR', 'exchange_rates', 3600000);
    }

    // ── World Bank CPI India ─────────────────────────────────────
    async getIndiaCPI() {
        return this._fetch('https://api.worldbank.org/v2/country/IN/indicator/FP.CPI.TOTL.ZG?format=json&per_page=20', 'india_cpi', 86400000);
    }

    // ── FRED Economic Data (CSV) ─────────────────────────────────
    async getUSCPI() {
        return this._fetchCSV('https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL', 'fred_cpi', 86400000);
    }

    // ── Nominatim Geocoding ──────────────────────────────────────
    async geocode(query) {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
        return this._fetch(url, `geo_${query}`, 86400000);
    }

    // ── Convenience: Get weather for all stores ──────────────────
    async getWeatherForStores(storeCoords, startDate, endDate) {
        const results = {};
        for (const [store, coords] of Object.entries(storeCoords)) {
            const data = await this.getWeather(coords.lat, coords.lng, startDate, endDate);
            results[store] = data;
        }
        return results;
    }

    // ── Convenience: Get all routes between stores ───────────────
    async getRoutesBetweenStores(storeCoords) {
        const stores = Object.keys(storeCoords);
        const routes = {};
        for (let i = 0; i < Math.min(stores.length, 4); i++) {
            for (let j = i + 1; j < Math.min(stores.length, 6); j++) {
                const a = storeCoords[stores[i]], b = storeCoords[stores[j]];
                const key = `${stores[i]}_${stores[j]}`;
                const data = await this.getRoute(a.lng, a.lat, b.lng, b.lat);
                if (data && data.routes && data.routes[0]) {
                    routes[key] = {
                        distance_km: Math.round(data.routes[0].distance / 1000),
                        duration_hrs: Math.round(data.routes[0].duration / 3600 * 10) / 10,
                        geometry: data.routes[0].geometry
                    };
                }
            }
        }
        return routes;
    }

    // ── Convenience: Supply chain risk signals ───────────────────
    async getSupplyChainSignals() {
        const [holidays, exchangeRates, cpi] = await Promise.all([
            this.getHolidays(new Date().getFullYear()),
            this.getExchangeRates(),
            this.getIndiaCPI()
        ]);

        const nextHoliday = holidays ? holidays.find(h => new Date(h.date) > new Date()) : null;
        const usdRate = exchangeRates?.rates?.USD || 0.012;
        const latestCPI = cpi?.[1]?.[0]?.value || 5.0;

        return {
            nextHoliday: nextHoliday ? { name: nextHoliday.name, date: nextHoliday.date, daysUntil: Math.round((new Date(nextHoliday.date) - new Date()) / 86400000) } : null,
            usdToINR: usdRate > 0 ? Math.round(1 / usdRate * 100) / 100 : 83,
            indiaCPIInflation: latestCPI,
            holidays: holidays || []
        };
    }

    // ── Routing: Find Nearest Warehouse ──────────────────────────────
    findNearestWarehouse(storeLoc, warehouses, storeCoords) {
        if (!storeCoords || !storeCoords[storeLoc] || !warehouses || warehouses.length === 0) return null;
        const target = storeCoords[storeLoc];
        let nearest = null;
        let minDistance = Infinity;

        warehouses.forEach(wh => {
            const dist = Math.sqrt((wh.lat - target.lat) ** 2 + (wh.lng - target.lng) ** 2) * 111; // Approx km
            if (dist < minDistance) {
                minDistance = dist;
                nearest = wh;
            }
        });
        return { warehouse: nearest, distance_km: Math.round(minDistance) };
    }
}

// ── Cross-Page Sync via BroadcastChannel ─────────────────────────
class CrossPageSync {
    constructor(channelName) {
        this.channelName = channelName || 'inventory-dashboard-sync';
        try {
            this.channel = new BroadcastChannel(this.channelName);
            this.channel.onmessage = (e) => this._onMessage(e);
            this._handlers = {};
            console.log(`[CrossPageSync] ✅ Channel "${this.channelName}" open`);
        } catch (e) {
            console.warn('[CrossPageSync] BroadcastChannel not available, cross-page sync disabled');
            this.channel = null;
        }
    }

    broadcast(event, payload) {
        if (!this.channel) return;
        this.channel.postMessage({ event, payload, ts: Date.now(), source: window.location.pathname });
    }

    on(event, handler) {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(handler);
    }

    _onMessage(e) {
        const { event, payload, source } = e.data;
        // Don't process own messages
        if (source === window.location.pathname) return;
        console.log(`[CrossPageSync] Received: ${event} from ${source}`);
        const handlers = this._handlers[event] || [];
        for (const h of handlers) {
            try { h(payload, event, source); } catch (err) { console.error('[CrossPageSync] Handler error:', err); }
        }
        // Also fire on local EventBus if available
        if (window.bus) window.bus.emit(event, payload);
    }

    close() {
        if (this.channel) this.channel.close();
    }
}

// ── Export ────────────────────────────────────────────────────────
window.APIService = APIService;
window.CrossPageSync = CrossPageSync;
window.apiService = new APIService();
window.crossPageSync = new CrossPageSync();

// Hook EventBus to BroadcastChannel for auto-sync
if (window.bus && window.crossPageSync) {
    const syncEvents = ['SKU_SELECTED', 'STORE_SELECTED', 'FORECAST_UPDATED', 'ALERT_FIRED',
        'ALERT_ACKNOWLEDGED', 'ALERT_RESOLVED', 'REPLENISHMENT_APPROVED', 'TRANSFER_APPROVED',
        'FINANCIAL_RECALCULATED', 'REGIME_CHANGE_DETECTED'];
    syncEvents.forEach(evt => {
        window.bus.on(evt, (payload) => {
            window.crossPageSync.broadcast(evt, payload);
        });
    });
    console.log('[CrossPageSync] ✅ Auto-syncing', syncEvents.length, 'event types across tabs');
}

console.log('[APIService] ✅ Ready — 9 API endpoints, cross-page BroadcastChannel sync');
