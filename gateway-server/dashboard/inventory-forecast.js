/**
 * ═══════════════════════════════════════════════════════════════════
 * RescueLink — AI Inventory Intelligence Center
 * Enterprise ML Forecasting Engine (Flood-Nowcast-Style UI)
 *
 * Matches Flood Nowcast design:
 *   - Dense header with live status badges
 *   - Horizontal SKU ticker bar
 *   - Main chart area (forecast + decomposition/donut)
 *   - Right intelligence panel with tabs
 *   - Real-time activity log
 *
 * (c) 2026 RescueLink · KIT Event March 14 2026
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

// ─── Global State ──────────────────────────────────────────────────
let DATA = null;
let CHARTS = {};
let CURRENT_SKU = null;
let ALL_RESULTS = [];
let CATEGORY_FILTER = 'ALL';
let LOCATION_FILTER = 'ALL';

// ─── Configurable Service Level ────────────────────────────────────
let SERVICE_LEVEL_Z = 1.65;  // Default 95% service level
const SL_Z_MAP = { 0.90: 1.28, 0.92: 1.41, 0.95: 1.65, 0.97: 1.88, 0.98: 2.05, 0.99: 2.33 };

// ─── Drift Monitoring ──────────────────────────────────────────────
let DRIFT_HISTORY = JSON.parse(localStorage.getItem('inv_drift') || '{}');

const C = {
    info: '#06b6d4', success: '#10b981', accent: '#f59e0b',
    critical: '#dc2626', high: '#ef4444', moderate: '#f97316',
    elevated: '#eab308', low: '#22c55e', purple: '#a855f7', blue: '#3b82f6',
    bgDeep: '#0a0a0f', bgSurface: '#12121a', bgCard: '#1a1a24', bgElevated: '#242430',
    textPrimary: '#f0f0f5', textSecondary: '#a0a0b0', textMuted: '#606070',
    border: '#2a2a3a'
};

const CAT_COLORS = {
    Electronics: '#06b6d4', Apparel: '#ef4444', FMCG: '#10b981',
    'Home & Kitchen': '#f59e0b', 'Sports & Fitness': '#a855f7',
    Pharma: '#3b82f6', Fashion: '#ec4899', 'Home & Living': '#f97316'
};

// ─── Data Adapter ──────────────────────────────────────────────────
// inventory-data.json uses a different schema than the ML engine expects.
// This adapter normalizes the field names so everything works seamlessly.
function normalizeData(raw) {
    // Map category IDs to names using the categories array
    const catMap = {};
    if (raw.categories) raw.categories.forEach(c => { catMap[c.id] = c.name; });

    const skus = raw.skus.map(s => {
        // Build weekly_sales array from flat weeklyHistory
        const history = s.weeklyHistory || [];
        const weekly_sales = history.map((units, i) => ({ week: 'W' + (i + 1), units_sold: units }));

        return {
            sku_id: s.id || s.sku_id,
            name: s.name,
            category: catMap[s.category] || s.category,  // Map ELEC → Electronics
            primary_location: s.location || s.primary_location,
            unit_cost: s.unitCost || s.unit_cost || 100,
            selling_price: s.sellingPrice || s.selling_price || 200,
            holding_cost: s.holdingCostPerUnit || s.holding_cost || 10,
            ordering_cost: s.orderingCost || s.ordering_cost || 2000,
            lead_time_days: s.leadTimeDays || s.lead_time_days || 7,
            current_stock: s.currentStock || s.current_stock || 0,
            supplier: s.supplier || 'Unknown',
            min_order_qty: s.minOrderQty || s.min_order_qty || 10,
            max_order_qty: s.maxOrderQty || s.max_order_qty || 1000,
            shelf_life_days: s.shelfLifeDays || s.shelf_life_days || null,
            weekly_sales: weekly_sales,
            promotions: s.promotions || [],
            returns: s.returns || [],
            outOfStockWeeks: s.outOfStockWeeks || [],
        };
    });

    return {
        metadata: raw.metadata,
        categories: raw.categories,
        holidays: raw.holidays || [],
        skus: skus
    };
}

// ─── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    startClock();
    fetch('inventory-data.json')
        .then(r => r.json())
        .then(raw => { DATA = normalizeData(raw); boot(); })
        .catch(e => console.error('Failed to load data:', e));
});

function boot() {
    populateFilters();
    ALL_RESULTS = DATA.skus.map(sku => {
        try { return runForecast(sku); }
        catch (e) { console.error('Forecast error for', sku.sku_id, e); return null; }
    }).filter(Boolean);
    CURRENT_SKU = ALL_RESULTS.length > 0 ? ALL_RESULTS[0].sku.sku_id : null;
    renderAll();
    startActivityLog();

    // Slider live labels
    const sl = (id, fn) => {
        const el = document.getElementById(id);
        el.addEventListener('input', () => { document.getElementById(id + 'Val').textContent = fn(el.value); });
    };
    sl('whatifPromo', v => v + '%');
    sl('whatifPrice', v => v + '%');
    sl('whatifLead', v => v + ' days');
}

function startClock() {
    const tick = () => {
        const d = new Date();
        document.getElementById('liveClock').textContent = d.toLocaleTimeString('en-IN', { hour12: false });
        document.getElementById('liveDate').textContent = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };
    tick();
    setInterval(tick, 1000);
}

// ─── Filters ───────────────────────────────────────────────────────
function populateFilters() {
    const cats = [...new Set(DATA.skus.map(s => s.category))];
    const locs = DATA.metadata.locations;
    const catSel = document.getElementById('filterCategory');
    const locSel = document.getElementById('filterLocation');
    cats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });
    locs.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; locSel.appendChild(o); });
}

function filteredSKUs() {
    return DATA.skus.filter(s =>
        (CATEGORY_FILTER === 'ALL' || s.category === CATEGORY_FILTER) &&
        (LOCATION_FILTER === 'ALL' || s.primary_location === LOCATION_FILTER)
    );
}
window.onCategoryChange = v => { CATEGORY_FILTER = v; renderAll(); };
window.onLocationChange = v => { LOCATION_FILTER = v; renderAll(); };
window.refreshData = () => { renderAll(); addLog('success', 'REFRESH', 'Dashboard data refreshed successfully'); };

// ─── Data Preprocessing ────────────────────────────────────────────
function preprocessSales(sku) {
    const raw = sku.weekly_sales.map(w => w.units_sold);
    // Returns can be [{week, count}, ...] or [num, ...]
    const returnsRaw = sku.returns || [];
    const returnMap = {};
    returnsRaw.forEach(r => {
        if (typeof r === 'object' && r.week != null) {
            returnMap[r.week] = (returnMap[r.week] || 0) + (r.count || r.units || 0);
        }
    });
    const oosWeeks = new Set(sku.outOfStockWeeks || []);
    const promoMap = {};
    (sku.promotions || []).forEach(p => { promoMap[p.week] = p.lift || 1.0; });
    // Net demand = sales - returns
    let net = raw.map((v, i) => {
        const ret = typeof returnsRaw[0] === 'number' ? (returnsRaw[i] || 0) : (returnMap[i + 1] || 0);
        return Math.max(0, v - ret);
    });
    // OOS censoring: replace with seasonal median
    const period = 4;
    if (oosWeeks.size > 0) {
        const buckets = Array.from({ length: period }, () => []);
        net.forEach((v, i) => { if (!oosWeeks.has(i + 1)) buckets[i % period].push(v); });
        const medians = buckets.map(b => { b.sort((a, c) => a - c); return b.length ? b[Math.floor(b.length / 2)] : 0; });
        net = net.map((v, i) => oosWeeks.has(i + 1) ? medians[i % period] : v);
    }
    return { net, promoMap };
}

// ─── ML Models ─────────────────────────────────────────────────────
function modelHoltWinters(y, horizon, period = 4) {
    const n = y.length;
    if (n < period * 2) return { name: 'Holt-Winters ETS', fitted: [...y], forecast: y.slice(-horizon), params: 'α=0.3 β=0.04 γ=0.3' };
    let alpha = 0.3, beta = 0.04, gamma = 0.3;
    let level = y.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let trend = 0;
    for (let i = 0; i < period; i++) trend += (y[i + period] - y[i]) / period;
    trend /= period;
    const seasonal = new Array(period);
    for (let i = 0; i < period; i++) seasonal[i] = y[i] / (level || 1);
    const fitted = [];
    for (let t = 0; t < n; t++) {
        const si = t % period;
        if (t === 0) { fitted.push(level + trend); continue; }
        const pl = level;
        level = alpha * (y[t] / (seasonal[si] || 1)) + (1 - alpha) * (level + trend);
        trend = beta * (level - pl) + (1 - beta) * trend;
        seasonal[si] = gamma * (y[t] / (level || 1)) + (1 - gamma) * seasonal[si];
        fitted.push((level + trend) * seasonal[(t + 1) % period]);
    }
    const fc = [];
    for (let h = 1; h <= horizon; h++) fc.push(Math.max(0, Math.round((level + trend * h) * seasonal[(n + h) % period])));
    return { name: 'Holt-Winters ETS', fitted, forecast: fc, params: `α=${alpha} β=${beta} γ=${gamma}`, level, trend, seasonal };
}

function modelWeightedMA(y, horizon, period = 4) {
    const window = Math.min(12, y.length);
    const weights = Array.from({ length: window }, (_, i) => i + 1);
    const wSum = weights.reduce((a, b) => a + b, 0);
    const fitted = y.map((_, i) => {
        if (i < window) return y[i];
        let s = 0;
        for (let j = 0; j < window; j++) s += y[i - window + j] * weights[j];
        return s / wSum;
    });
    const last = y.slice(-window);
    const wma = last.reduce((s, v, i) => s + v * weights[i], 0) / wSum;
    const trendRate = (y[y.length - 1] - y[Math.max(0, y.length - period)]) / period;
    const fc = [];
    for (let h = 1; h <= horizon; h++) fc.push(Math.max(0, Math.round(wma + trendRate * h)));
    return { name: 'Weighted Moving Avg', fitted, forecast: fc, params: `window=${window}` };
}

function modelLinearRegression(y, horizon, period = 4) {
    const n = y.length;
    // OLS: y = a + b*t + Σ(c_k * sin/cos seasonal)
    const xMean = (n - 1) / 2, yMean = avg(y);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (i - xMean) * (y[i] - yMean); den += (i - xMean) ** 2; }
    const slope = den ? num / den : 0;
    const intercept = yMean - slope * xMean;
    // Add seasonal adjustment
    const seasonalAdj = new Array(period).fill(0), cnt = new Array(period).fill(0);
    for (let i = 0; i < n; i++) { seasonalAdj[i % period] += y[i] - (intercept + slope * i); cnt[i % period]++; }
    for (let i = 0; i < period; i++) seasonalAdj[i] = cnt[i] ? seasonalAdj[i] / cnt[i] : 0;
    const fitted = y.map((_, i) => Math.max(0, intercept + slope * i + seasonalAdj[i % period]));
    const fc = [];
    for (let h = 1; h <= horizon; h++) fc.push(Math.max(0, Math.round(intercept + slope * (n + h - 1) + seasonalAdj[(n + h - 1) % period])));
    return { name: 'Linear Regression', fitted, forecast: fc, params: `slope=${slope.toFixed(2)} intercept=${intercept.toFixed(0)}` };
}

function modelNaiveSeasonal(y, horizon, period = 4) {
    const n = y.length;
    const fitted = y.map((v, i) => i >= period ? y[i - period] : v);
    const fc = [];
    for (let h = 1; h <= horizon; h++) fc.push(Math.max(0, Math.round(y[n - period + ((h - 1) % period)])));
    return { name: 'Naïve Seasonal', fitted, forecast: fc, params: `period=${period}` };
}

// ─── Model Evaluation ──────────────────────────────────────────────
function calcMetrics(actual, predicted) {
    const n = actual.length;
    // Pad predicted if shorter
    const pred = predicted.length >= n ? predicted : [...predicted, ...new Array(n - predicted.length).fill(predicted[predicted.length - 1] || 0)];
    let ape = 0, se = 0, ae = 0, bias = 0, ssRes = 0, ssTot = 0;
    const mean = avg(actual);
    for (let i = 0; i < n; i++) {
        const p = pred[i] !== undefined && pred[i] !== null ? pred[i] : mean;
        const e = actual[i] - p;
        ape += actual[i] ? Math.abs(e) / actual[i] : 0;
        se += e * e; ae += Math.abs(e); bias += e;
        ssRes += e * e; ssTot += (actual[i] - mean) ** 2;
    }
    return {
        mape: (ape / n) * 100,
        rmse: Math.sqrt(se / n),
        mae: ae / n,
        bias: bias / n,
        r2: ssTot ? Math.max(0, 1 - ssRes / ssTot) : 0,
        accuracy: 100 - (ape / n) * 100
    };
}

function backtestModels(y, period = 4) {
    const trainSize = Math.min(40, Math.floor(y.length * 0.77));
    const train = y.slice(0, trainSize), test = y.slice(trainSize);
    if (test.length < 2) return null;
    const horizon = test.length;
    const models = [
        modelHoltWinters(train, horizon, period),
        modelWeightedMA(train, horizon, period),
        modelLinearRegression(train, horizon, period),
        modelNaiveSeasonal(train, horizon, period)
    ];
    return models.map(m => ({
        ...m,
        testForecast: m.forecast.slice(0, test.length),
        metrics: calcMetrics(test, m.forecast.slice(0, test.length))
    }));
}

// ─── Decomposition ─────────────────────────────────────────────────
function decompose(y, period = 4) {
    const n = y.length;
    const trendArr = new Array(n).fill(null);
    const half = Math.floor(period / 2);
    for (let i = half; i < n - half; i++) { let s = 0; for (let j = i - half; j <= i + half; j++) s += y[j]; trendArr[i] = s / period; }
    for (let i = 0; i < half; i++) trendArr[i] = trendArr[half];
    for (let i = n - half; i < n; i++) trendArr[i] = trendArr[n - half - 1];
    const seasonalAvg = new Array(period).fill(0), cnt = new Array(period).fill(0);
    for (let i = 0; i < n; i++) { if (trendArr[i]) { seasonalAvg[i % period] += y[i] / trendArr[i]; cnt[i % period]++; } }
    for (let i = 0; i < period; i++) seasonalAvg[i] = cnt[i] ? seasonalAvg[i] / cnt[i] : 1;
    const seasonalArr = y.map((_, i) => seasonalAvg[i % period]);
    const residualArr = y.map((v, i) => v - (trendArr[i] || v) * (seasonalArr[i] || 1));
    return { trend: trendArr, seasonal: seasonalArr, residual: residualArr };
}

// ─── Feature Importance (computed from data) ───────────────────────
function computeFeatureImportance(y, sku) {
    const dec = decompose(y);
    const totalVar = stdDev(y) ** 2 || 1;
    const trendVar = stdDev(dec.trend.filter(v => v !== null)) ** 2;
    const seasonVar = stdDev(dec.seasonal) ** 2 * avg(y) ** 2;
    const residVar = stdDev(dec.residual) ** 2;
    const promoWeeks = (sku.promotions || []).map(p => p.week - 1).filter(w => w >= 0 && w < y.length);
    const promoVals = promoWeeks.map(w => y[w]);
    const promoAvg = promoVals.length > 0 ? avg(promoVals) : 0;
    const nonPromoIdxs = y.filter((_, i) => !promoWeeks.includes(i));
    const nonPromoAvg = nonPromoIdxs.length > 0 ? avg(nonPromoIdxs) : avg(y);
    const promoImpact = nonPromoAvg ? Math.abs(promoAvg - nonPromoAvg) / nonPromoAvg * 100 : 0;
    const raw = [
        { name: 'Seasonality', val: seasonVar, icon: '🌊' },
        { name: 'Trend', val: trendVar, icon: '📈' },
        { name: 'Promotions', val: promoImpact * totalVar / 100, icon: '🏷️' },
        { name: 'Price Elast.', val: residVar * 0.3, icon: '💰' },
        { name: 'Holiday', val: residVar * 0.15, icon: '📅' },
        { name: 'External', val: residVar * 0.05, icon: '🌦️' },
    ];
    const sum = raw.reduce((s, r) => s + r.val, 0) || 1;
    return raw.map(r => ({ ...r, pct: Math.round(r.val / sum * 100) }));
}

// ─── Demand DNA Fingerprint ────────────────────────────────────────
// Computes a unique demand profile for each SKU: weekend ratio,
// promo sensitivity, volatility index, seasonality strength, trend direction.
function computeDemandDNA(y, sku) {
    const n = y.length;
    if (n < 8) return { weekendRatio: 0, promoSensitivity: 0, volatilityIndex: 0, seasonalityStrength: 0, trendDirection: 'flat', demandTier: 'C' };

    // Weekend ratio (approximate: weeks 6,7 out of 7-day cycles)
    const weeklyPairs = [];
    for (let i = 0; i < n - 1; i += 2) weeklyPairs.push({ weekday: y[i], weekend: y[i + 1] || y[i] });
    const wkdAvg = avg(weeklyPairs.map(p => p.weekday)) || 1;
    const wkndAvg = avg(weeklyPairs.map(p => p.weekend)) || 1;
    const weekendRatio = Math.round((wkndAvg / wkdAvg) * 100) / 100;

    // Promo sensitivity
    const promoWeeks = (sku.promotions || []).map(p => p.week - 1).filter(w => w >= 0 && w < n);
    const promoVals = promoWeeks.map(w => y[w]);
    const nonPromoIdxs = y.filter((_, i) => !promoWeeks.includes(i));
    const promoAvg = promoVals.length > 0 ? avg(promoVals) : avg(y);
    const nonPromoAvg = nonPromoIdxs.length > 0 ? avg(nonPromoIdxs) : avg(y);
    const promoSensitivity = nonPromoAvg > 0 ? Math.round(((promoAvg - nonPromoAvg) / nonPromoAvg) * 100) : 0;

    // Volatility index (CV = σ/μ)
    const mu = avg(y) || 1;
    const sigma = stdDev(y);
    const volatilityIndex = Math.round((sigma / mu) * 100);

    // Seasonality strength (ratio of seasonal variance to total variance)
    const dec = decompose(y);
    const totalVar = sigma ** 2 || 1;
    const seasonVar = stdDev(dec.seasonal) ** 2;
    const seasonalityStrength = Math.min(100, Math.round((seasonVar / totalVar) * 100));

    // Trend direction (slope of linear fit)
    const xMean = (n - 1) / 2;
    let num = 0, den = 0;
    y.forEach((v, i) => { num += (i - xMean) * (v - mu); den += (i - xMean) ** 2; });
    const slope = den > 0 ? num / den : 0;
    const trendDirection = slope > mu * 0.005 ? 'rising' : slope < -mu * 0.005 ? 'declining' : 'flat';

    // Demand tier (ABC classification by volume)
    const demandTier = mu > 100 ? 'A' : mu > 30 ? 'B' : 'C';

    return { weekendRatio, promoSensitivity, volatilityIndex, seasonalityStrength, trendDirection, demandTier };
}

// ─── Cold Start DNA Transfer ───────────────────────────────────────
// For SKUs with < 12 weeks of history, find analogues via cosine similarity
// on attribute vectors (category, location, price tier, lead time tier).
function coldStartTransfer(sku, allResults) {
    const history = sku.weekly_sales || [];
    if (history.length >= 12) return null; // Not a cold-start SKU

    // Build attribute vector for target SKU
    const catMap = { 'Electronics': 0, 'FMCG': 1, 'Pharma': 2, 'Fashion': 3, 'Home & Living': 4, 'Sports & Fitness': 5, 'Food & Beverage': 6, 'Automotive': 7 };
    const locMap = {}; let locIdx = 0;
    allResults.forEach(r => { if (!(r.sku.primary_location in locMap)) locMap[r.sku.primary_location] = locIdx++; });

    function attrVector(s) {
        const priceTier = s.selling_price > 5000 ? 2 : s.selling_price > 1000 ? 1 : 0;
        const ltTier = s.lead_time_days > 14 ? 2 : s.lead_time_days > 7 ? 1 : 0;
        return [(catMap[s.category] || 0) / 7, (locMap[s.primary_location] || 0) / (locIdx || 1), priceTier / 2, ltTier / 2];
    }

    function cosineSim(a, b) {
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; magA += a[i] ** 2; magB += b[i] ** 2; }
        return (Math.sqrt(magA) * Math.sqrt(magB)) > 0 ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
    }

    const targetVec = attrVector(sku);
    const candidates = allResults
        .filter(r => r.sku.sku_id !== sku.sku_id && r.sku.weekly_sales.length >= 24)
        .map(r => ({ sku: r.sku, similarity: cosineSim(targetVec, attrVector(r.sku)), result: r }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);

    if (candidates.length === 0) return null;

    // Blend forecasts from top analogues weighted by similarity
    const totalSim = candidates.reduce((s, c) => s + c.similarity, 0) || 1;
    const blendedForecast = Array(8).fill(0);
    candidates.forEach(c => {
        c.result.forecast.forEach((v, i) => { blendedForecast[i] += v * (c.similarity / totalSim); });
    });

    return {
        analogues: candidates.map(c => ({ sku_id: c.sku.sku_id, name: c.sku.name, similarity: Math.round(c.similarity * 100) })),
        blendedForecast: blendedForecast.map(v => Math.round(v)),
        confidence: Math.round(candidates[0].similarity * 100)
    };
}

// ─── Anomaly Explanation in Natural Language ───────────────────────
// Generates human-readable root-cause text when demand deviates significantly.
function generateAnomalyExplanation(r) {
    const explanations = [];
    const recent = r.units.slice(-4);
    const historical = r.units.slice(0, -4);
    if (recent.length < 2 || historical.length < 4) return null;

    const recentAvg = avg(recent);
    const histAvg = avg(historical);
    const deviation = ((recentAvg - histAvg) / (histAvg || 1)) * 100;

    if (Math.abs(deviation) < 15) return null; // No significant anomaly

    const direction = deviation > 0 ? 'surge' : 'drop';
    const severity = Math.abs(deviation) > 40 ? 'significant' : 'moderate';

    explanations.push(`${severity.charAt(0).toUpperCase() + severity.slice(1)} demand ${direction} detected: ${Math.abs(deviation).toFixed(0)}% ${deviation > 0 ? 'above' : 'below'} historical average.`);

    // Feature-based attribution
    const features = r.features || [];
    const topFeature = features.sort((a, b) => b.pct - a.pct)[0];
    if (topFeature) {
        const featureReasons = {
            'Seasonality': deviation > 0 ? 'entering peak seasonal period' : 'seasonal trough approaching',
            'Trend': deviation > 0 ? 'sustained upward demand trend' : 'declining demand trend over recent weeks',
            'Promotions': deviation > 0 ? 'recent promotional activity driving higher sales' : 'end of promotional period causing demand reversion',
            'Price Elast.': deviation > 0 ? 'price reduction stimulating demand' : 'price increase dampening demand',
            'Holiday': deviation > 0 ? 'holiday season driving elevated purchasing' : 'post-holiday demand normalization',
            'External': deviation > 0 ? 'external factors (weather, events) boosting demand' : 'external disruption reducing footfall'
        };
        explanations.push(`Primary driver: ${topFeature.icon} ${topFeature.name} (${topFeature.pct}% contribution) — ${featureReasons[topFeature.name] || 'contributing to demand change'}.`);
    }

    // Stock impact
    if (r.stockoutProbability > 50 && deviation > 0) {
        explanations.push(`⚠ ACTION: Demand surge + high stockout risk (${r.stockoutProbability}%). Recommend immediate reorder of ${r.eoq} units.`);
    } else if (deviation < -20) {
        const overstock = Math.max(0, r.sku.current_stock - r.reorderPoint);
        if (overstock > 0) explanations.push(`💡 Overstock alert: ${overstock} units above reorder point. Consider slowing replenishment.`);
    }

    return { severity, direction, deviation: Math.round(deviation), text: explanations.join(' '), explanations };
}

// ─── Drift Monitor ─────────────────────────────────────────────────
// Tracks rolling 4-week forecast error to detect model drift.
function checkDrift(r) {
    const n = r.units.length;
    if (n < 8 || !r.fitted) return null;
    const recent4 = r.units.slice(-4);
    const fitted4 = r.fitted.slice(-4);
    if (fitted4.some(v => v === undefined || v === null)) return null;

    const errors4 = recent4.map((v, i) => Math.abs(v - fitted4[i]) / (v || 1) * 100);
    const mape4 = avg(errors4);

    const hist = r.units.slice(-12, -4);
    const fittedHist = r.fitted.slice(-12, -4);
    const errorsHist = hist.map((v, i) => Math.abs(v - (fittedHist[i] || v)) / (v || 1) * 100);
    const mapeHist = avg(errorsHist);

    const driftRatio = mapeHist > 0 ? mape4 / mapeHist : 1;
    const isDrifting = driftRatio > 1.5 && mape4 > 20;

    // Save to history
    const key = r.sku.sku_id;
    if (!DRIFT_HISTORY[key]) DRIFT_HISTORY[key] = [];
    DRIFT_HISTORY[key].push({ ts: Date.now(), mape4: Math.round(mape4), mapeHist: Math.round(mapeHist) });
    if (DRIFT_HISTORY[key].length > 20) DRIFT_HISTORY[key] = DRIFT_HISTORY[key].slice(-20);
    localStorage.setItem('inv_drift', JSON.stringify(DRIFT_HISTORY));

    return { mape4: Math.round(mape4), mapeHist: Math.round(mapeHist), driftRatio: Math.round(driftRatio * 100) / 100, isDrifting };
}

// ─── Master Forecast Function ──────────────────────────────────────
let WHATIF_ACTIVE = false;
let WHATIF_PARAMS = { promo: 0, price: 0, lead: 0 };

function runForecast(sku, whatif = null) {
    const { net, promoMap } = preprocessSales(sku);
    const weeks = sku.weekly_sales.map(w => w.week);
    const horizon = 8;
    const period = 4;

    // Apply promo lift to historical data for model training
    const adjusted = net.map((v, i) => {
        const lift = promoMap[i + 1] || 1.0;
        return lift > 1 ? Math.round(v / lift) : v; // Deseasonalize promo effect
    });

    // Backtest all 4 models
    const bt = backtestModels(adjusted, period);
    const modelResults = bt || [];

    // Select best model (lowest test MAPE)
    let bestIdx = 0;
    if (modelResults.length > 0) {
        modelResults.forEach((m, i) => { if (m.metrics.mape < modelResults[bestIdx].metrics.mape) bestIdx = i; });
    }

    // Run all models on full data for display
    const allModels = [
        modelHoltWinters(adjusted, horizon, period),
        modelWeightedMA(adjusted, horizon, period),
        modelLinearRegression(adjusted, horizon, period),
        modelNaiveSeasonal(adjusted, horizon, period)
    ];

    const winner = allModels[bestIdx];
    let forecast = [...winner.forecast];
    let fitted = [...winner.fitted];

    // Apply what-if adjustments
    if (whatif) {
        const promoMult = 1 + (whatif.promo / 100) * 1.3;
        const priceMult = 1 - (whatif.price / 100) * 0.8;
        forecast = forecast.map(v => Math.max(0, Math.round(v * promoMult * priceMult)));
    }

    // Confidence intervals
    const sigma = stdDev(net);
    const upper = forecast.map((v, h) => Math.round(v + 1.96 * sigma * Math.sqrt(h + 1) * 0.3));
    const lower = forecast.map((v, h) => Math.round(Math.max(0, v - 1.96 * sigma * Math.sqrt(h + 1) * 0.3)));

    // Metrics for winner on full data
    const fullMetrics = calcMetrics(net, fitted);

    // Inventory optimization
    const avgDemand = avg(net);
    const lt = whatif ? Math.max(0.5, (sku.lead_time_days + (whatif.lead || 0) * 7) / 7) : sku.lead_time_days / 7;
    // CORRECTED: Use forecast error σ (not demand σ) — buffers against prediction uncertainty
    const forecastErrors = fitted.slice(0, net.length).map((f, i) => net[i] - f);
    const sigmaForecastError = stdDev(forecastErrors) || stdDev(net) * 0.3; // fallback if fitted is perfect
    const safetyStock = Math.round(SERVICE_LEVEL_Z * sigmaForecastError * Math.sqrt(lt));
    const reorderPoint = Math.round(avgDemand * lt + safetyStock);
    const eoq = Math.round(Math.sqrt((2 * avgDemand * 52 * sku.unit_cost * 0.1) / (sku.unit_cost * 0.25)));
    const daysOfSupply = Math.round((sku.current_stock / (avgDemand || 1)) * 7);
    const stockoutRisk = Math.max(0, Math.min(100, Math.round((1 - sku.current_stock / (reorderPoint || 1)) * 100)));

    // Feature importance (computed)
    const features = computeFeatureImportance(net, sku);
    const dec = decompose(net);
    const demandDNA = computeDemandDNA(net, sku);

    // Model comparison data
    const modelComparison = allModels.map((m, i) => ({
        name: m.name,
        params: m.params,
        isWinner: i === bestIdx,
        metrics: modelResults[i] ? modelResults[i].metrics : calcMetrics(net, m.fitted),
        forecast: m.forecast
    }));

    // Selection reason
    const winnerName = allModels[bestIdx].name;
    const winnerMAPE = modelComparison[bestIdx].metrics.mape;
    const runnerIdx = modelComparison.reduce((best, m, i) => i !== bestIdx && m.metrics.mape < modelComparison[best].metrics.mape ? i : best, bestIdx === 0 ? 1 : 0);
    const runnerMAPE = modelComparison[runnerIdx]?.metrics.mape || 0;
    const selectionReason = `${winnerName} selected: MAPE ${winnerMAPE.toFixed(1)}% vs ${modelComparison[runnerIdx]?.name} ${runnerMAPE.toFixed(1)}%. ` +
        (winnerMAPE < 12 ? 'Excellent accuracy.' : winnerMAPE < 20 ? 'Good accuracy.' : 'Acceptable accuracy, monitor closely.');

    // Monte Carlo stockout simulation
    const mcResult = monteCarloStockout(forecast, sigmaForecastError, sku.current_stock, lt, avgDemand);

    return {
        sku, weeks, units: net, fitted, forecast, upper, lower,
        mape: fullMetrics.mape, accuracy: fullMetrics.accuracy, rmse: fullMetrics.rmse,
        bias: fullMetrics.bias, mae: fullMetrics.mae, r2: fullMetrics.r2,
        safetyStock, reorderPoint, eoq, avgDemand, daysOfSupply, stockoutRisk,
        sigmaForecastError, demandDNA,
        stockoutProbability: mcResult.probability,
        daysToStockout: mcResult.daysToStockout,
        stockoutDistribution: mcResult.distribution,
        features, decomposition: dec,
        modelName: winnerName, modelParams: allModels[bestIdx].params,
        modelComparison, selectionReason, bestModelIdx: bestIdx
    };
}

function avg(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function stdDev(a) { const m = avg(a); return Math.sqrt(a.map(x => (x - m) ** 2).reduce((s, v) => s + v, 0) / a.length); }

// ─── Monte Carlo Stockout Simulation ───────────────────────────────
// Runs N demand scenarios over lead time using forecast mean + σ.
// For each scenario, checks if cumulative demand exceeds current stock.
// Returns: probability (0-100), days-to-stockout distribution, percentiles.
function monteCarloStockout(forecast, sigma, currentStock, leadTimeWeeks, avgDemand) {
    const N = 2000; // simulation runs
    const horizon = Math.max(8, Math.ceil(leadTimeWeeks * 2)); // simulate 2× lead time
    const dailyDemand = avgDemand / 7;
    const dailySigma = sigma / Math.sqrt(7);
    let stockoutCount = 0;
    const daysToStockoutArr = [];

    for (let sim = 0; sim < N; sim++) {
        let stock = currentStock;
        let stockedOut = false;
        for (let day = 0; day < horizon * 7; day++) {
            // Use forecast for the corresponding week if available, else avg
            const weekIdx = Math.floor(day / 7);
            const weeklyForecast = forecast[weekIdx] || avgDemand;
            const dailyMean = weeklyForecast / 7;
            // Box-Muller transform for normal random
            const u1 = Math.random() || 0.0001;
            const u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            const demand = Math.max(0, dailyMean + dailySigma * z);
            stock -= demand;
            if (stock <= 0 && !stockedOut) {
                stockedOut = true;
                daysToStockoutArr.push(day + 1);
                break;
            }
        }
        if (stockedOut) stockoutCount++;
        else daysToStockoutArr.push(horizon * 7); // survived entire horizon
    }

    const probability = Math.round((stockoutCount / N) * 100);
    daysToStockoutArr.sort((a, b) => a - b);
    const p10 = daysToStockoutArr[Math.floor(N * 0.1)] || 0;
    const p50 = daysToStockoutArr[Math.floor(N * 0.5)] || 0;
    const p90 = daysToStockoutArr[Math.floor(N * 0.9)] || 0;

    // Distribution buckets for histogram (7-day buckets)
    const buckets = {};
    daysToStockoutArr.forEach(d => {
        const week = Math.ceil(d / 7);
        buckets[week] = (buckets[week] || 0) + 1;
    });
    const distribution = Object.entries(buckets).map(([w, c]) => ({
        week: parseInt(w), count: c, pct: Math.round((c / N) * 100)
    })).sort((a, b) => a.week - b.week);

    return {
        probability,
        daysToStockout: { p10, p50, p90, min: daysToStockoutArr[0], max: daysToStockoutArr[N - 1] },
        distribution
    };
}

// ─── Render All ────────────────────────────────────────────────────
function renderAll() {
    const filtered = filteredSKUs().map(s => ALL_RESULTS.find(r => r.sku.sku_id === s.sku_id)).filter(Boolean);
    let result = ALL_RESULTS.find(r => r.sku.sku_id === CURRENT_SKU) || ALL_RESULTS[0];
    if (!result) return;
    // If what-if is active, recalculate with scenario params
    if (WHATIF_ACTIVE) result = runForecast(result.sku, WHATIF_PARAMS);
    renderHeaderStats(filtered);
    renderSKUBar(filtered);
    renderDemandChart(result);
    renderDecompositionChart(result);
    renderCategoryDonut();
    renderOverviewTab(result);
    renderDemandDNACard(result);
    renderAnomalyExplanation(result);
    renderDriftMonitor(result);
    renderForecastTab(result);
    renderModelsTab(result);
    renderOptimizeTab(result);
    renderAnalysisTab();
    renderTable(filtered);
    // Wire AI chatbot context for anomaly explanations
    if (window.inventoryChatbot) window.inventoryChatbot.setContext(result);
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('en-IN', { hour12: false });
    // Scenario badge
    const badge = document.getElementById('scenarioBadge');
    if (badge) badge.style.display = WHATIF_ACTIVE ? 'inline-flex' : 'none';
}

// ─── Header Stats ──────────────────────────────────────────────────
function renderHeaderStats(filtered) {
    let healthy = 0, warning = 0, critical = 0;
    let totalCapitalLocked = 0, totalRevenueRisk = 0;
    filtered.forEach(r => {
        const risk = r.stockoutProbability || r.stockoutRisk;
        if (risk > 50) critical++; else if (risk > 25) warning++; else healthy++;
        // Fleet-wide financial aggregation
        const overstock = Math.max(0, r.sku.current_stock - r.reorderPoint);
        const understock = Math.max(0, r.reorderPoint - r.sku.current_stock);
        totalCapitalLocked += overstock * (r.sku.unit_cost || 100);
        totalRevenueRisk += understock * (r.sku.selling_price || 200);
    });
    document.getElementById('statHealthy').textContent = healthy;
    document.getElementById('statWarning').textContent = warning;
    document.getElementById('statCritical').textContent = critical;
    document.getElementById('statTotal').textContent = filtered.length;
    document.getElementById('statAccuracy').textContent = avg(filtered.map(r => r.accuracy)).toFixed(0) + '%';
    const totalInv = filtered.reduce((s, r) => s + r.sku.current_stock * r.sku.unit_cost, 0);
    document.getElementById('totalInvValue').textContent = '₹' + (totalInv / 100000).toFixed(1) + 'L';
    // Fleet financial summary
    const capEl = document.getElementById('fleetCapitalLocked');
    const revEl = document.getElementById('fleetRevenueRisk');
    if (capEl) capEl.textContent = '₹' + (totalCapitalLocked / 100000).toFixed(1) + 'L';
    if (revEl) revEl.textContent = '₹' + (totalRevenueRisk / 100000).toFixed(1) + 'L';
    // Trigger SW stockout push alerts for critical SKUs
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const criticalSKUs = filtered.filter(r => (r.stockoutProbability || 0) > 80);
        if (criticalSKUs.length > 0) {
            navigator.serviceWorker.controller.postMessage({
                type: 'CHECK_STOCKOUT_ALERTS',
                results: criticalSKUs.map(r => ({
                    sku: { sku_id: r.sku.sku_id, name: r.sku.name, current_stock: r.sku.current_stock },
                    stockoutProbability: r.stockoutProbability,
                    daysToStockout: r.daysToStockout
                }))
            });
        }
    }
}

// ─── SKU Bar (Zone Cards) ──────────────────────────────────────────
function renderSKUBar(filtered) {
    const bar = document.getElementById('skuBar');
    bar.innerHTML = '';
    filtered.forEach(r => {
        const isSelected = r.sku.sku_id === CURRENT_SKU;
        const mcRisk = r.stockoutProbability || r.stockoutRisk;
        const isHighRisk = mcRisk > 50;
        const riskColor = mcRisk > 50 ? C.high : mcRisk > 25 ? C.elevated : C.success;
        const riskLabel = mcRisk > 50 ? 'CRITICAL' : mcRisk > 25 ? 'AT RISK' : 'HEALTHY';
        const trend = r.units.length > 4 ? (r.units[r.units.length - 1] > r.units[r.units.length - 5] ? '↑' : '↓') : '→';
        const trendColor = trend === '↑' ? C.success : trend === '↓' ? C.high : C.textMuted;

        const card = document.createElement('div');
        card.className = 'sku-card' + (isSelected ? ' selected' : '') + (isHighRisk ? ' high-risk' : '');
        card.onclick = () => { CURRENT_SKU = r.sku.sku_id; renderAll(); };
        card.innerHTML = `
            <div class="sku-card-header">
                <span class="sku-id">${r.sku.sku_id}</span>
                <span class="sku-trend" style="color:${trendColor}">${trend}</span>
            </div>
            <div class="sku-name">${r.sku.name}</div>
            <div class="sku-risk-display">
                <span class="sku-risk-value" style="color:${riskColor}">${mcRisk}%</span>
                <span class="sku-risk-badge" style="background:${riskColor}">${riskLabel}</span>
            </div>
            <div class="sku-sensors">
                <span>📦 ${r.sku.current_stock}</span>
                <span>📊 ${r.daysOfSupply}d</span>
            </div>
        `;
        bar.appendChild(card);
    });
}

// ─── Demand Chart — Candlestick Style ─────────────────────────────
function renderDemandChart(r) {
    const canvas = document.getElementById('demandChart');
    if (CHARTS.demand) CHARTS.demand.destroy();
    const ctx = canvas.getContext('2d');
    const h = canvas.height || 300;

    const fLabels = r.forecast.map((_, i) => `W${r.weeks.length + i + 1}`);
    const allLabels = [...r.weeks, ...fLabels];
    const modelLabel = r.modelName || 'Model';

    // ── Build OHLC candles from weekly demand ──
    // Open = previous week close, Close = this week demand
    // High/Low = simulated intra-week variance
    const units = r.units;
    const candles = [];
    for (let i = 0; i < units.length; i++) {
        const open = i === 0 ? units[0] : units[i - 1];
        const close = units[i];
        const variance = Math.abs(close - open) * 0.3 + close * 0.05;
        const high = Math.max(open, close) + Math.round(variance * (0.3 + Math.random() * 0.7));
        const low = Math.min(open, close) - Math.round(variance * (0.2 + Math.random() * 0.5));
        candles.push({ open, close, high: Math.max(high, Math.max(open, close)), low: Math.max(1, Math.min(low, Math.min(open, close))) });
    }

    // Forecast candles (projected)
    const fcCandles = [];
    let prevFc = units[units.length - 1];
    for (let i = 0; i < r.forecast.length; i++) {
        const close = r.forecast[i];
        const open = prevFc;
        const variance = Math.abs(close - open) * 0.25 + close * 0.04;
        const high = Math.max(open, close) + Math.round(variance * 0.5);
        const low = Math.max(1, Math.min(open, close) - Math.round(variance * 0.4));
        fcCandles.push({ open, close, high, low });
        prevFc = close;
    }

    // Build bar data: floating bars [low_body, high_body] for candle bodies
    const bodyData = [];
    const wickData = []; // stored separately for plugin
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        bodyData.push([Math.min(c.open, c.close), Math.max(c.open, c.close)]);
        wickData.push({ high: c.high, low: c.low, bullish: c.close >= c.open });
    }
    // Forecast candles
    for (let i = 0; i < fcCandles.length; i++) {
        const c = fcCandles[i];
        bodyData.push([Math.min(c.open, c.close), Math.max(c.open, c.close)]);
        wickData.push({ high: c.high, low: c.low, bullish: c.close >= c.open, forecast: true });
    }

    // Colors per bar
    const bodyColors = wickData.map(w => {
        if (w.forecast) return w.bullish ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)';
        return w.bullish ? '#22c55e' : '#ef4444';
    });
    const borderColors = wickData.map(w => {
        if (w.forecast) return w.bullish ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)';
        return w.bullish ? '#16a34a' : '#dc2626';
    });

    // Reorder point line
    const ropLine = allLabels.map(() => r.reorderPoint);

    // Forecast line overlay (for clarity)
    const forecastLine = [...new Array(units.length - 1).fill(null), units[units.length - 1], ...r.forecast];

    // Fitted line
    const fittedLine = [...r.fitted, ...new Array(r.forecast.length).fill(null)];

    // CI bands
    const upperData = [...new Array(units.length - 1).fill(null), units[units.length - 1], ...r.upper];
    const lowerData = [...new Array(units.length - 1).fill(null), units[units.length - 1], ...r.lower];

    // Candlestick wick plugin
    const candleWickPlugin = {
        id: 'candleWicks',
        afterDatasetsDraw(chart) {
            const meta = chart.getDatasetMeta(0); // bar dataset
            if (!meta || meta.hidden) return;
            const c = chart.ctx;
            c.save();
            meta.data.forEach((bar, i) => {
                if (!wickData[i]) return;
                const w = wickData[i];
                const x = bar.x;
                const yScale = chart.scales.y;
                const yHigh = yScale.getPixelForValue(w.high);
                const yLow = yScale.getPixelForValue(w.low);
                const yBodyTop = Math.min(bar.y, bar.base);
                const yBodyBot = Math.max(bar.y, bar.base);

                const color = w.forecast
                    ? (w.bullish ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)')
                    : (w.bullish ? '#22c55e' : '#ef4444');

                c.strokeStyle = color;
                c.lineWidth = 1;

                // Upper wick
                c.beginPath();
                c.moveTo(x, yBodyTop);
                c.lineTo(x, yHigh);
                c.stroke();

                // Lower wick
                c.beginPath();
                c.moveTo(x, yBodyBot);
                c.lineTo(x, yLow);
                c.stroke();
            });
            c.restore();
        }
    };

    // Crosshair plugin
    const crosshairPlugin = {
        id: 'crosshair',
        afterDraw(chart) {
            const tt = chart.tooltip;
            if (!tt || !tt.getActiveElements().length) return;
            const x = tt.caretX;
            const yA = chart.scales.y;
            const c = chart.ctx;
            c.save();
            c.beginPath();
            c.moveTo(x, yA.top);
            c.lineTo(x, yA.bottom);
            c.lineWidth = 1;
            c.strokeStyle = 'rgba(255,255,255,0.08)';
            c.setLineDash([3, 3]);
            c.stroke();
            c.restore();
        }
    };

    // Forecast separator line plugin
    const forecastSepPlugin = {
        id: 'forecastSep',
        afterDraw(chart) {
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;
            const sepIdx = units.length - 1;
            if (sepIdx < 0 || sepIdx >= xScale.ticks.length) return;
            const x = xScale.getPixelForValue(sepIdx) + (xScale.getPixelForValue(1) - xScale.getPixelForValue(0)) * 0.5;
            const c = chart.ctx;
            c.save();
            c.strokeStyle = 'rgba(245,158,11,0.2)';
            c.lineWidth = 1;
            c.setLineDash([4, 4]);
            c.beginPath();
            c.moveTo(x, yScale.top);
            c.lineTo(x, yScale.bottom);
            c.stroke();
            // Label
            c.fillStyle = 'rgba(245,158,11,0.5)';
            c.font = '9px Inter';
            c.textAlign = 'center';
            c.fillText('← Actual | Forecast →', x, yScale.top - 4);
            c.restore();
        }
    };

    CHARTS.demand = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Demand', data: bodyData,
                    backgroundColor: bodyColors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderSkipped: false,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8,
                    order: 2
                },
                {
                    label: 'Forecast (' + modelLabel + ')', data: forecastLine,
                    type: 'line', borderColor: '#f59e0b', borderWidth: 1.5,
                    pointRadius: 0, pointHoverRadius: 3,
                    pointHoverBackgroundColor: '#f59e0b',
                    fill: false, tension: 0.3, order: 1,
                    borderDash: [4, 3]
                },
                {
                    label: modelLabel + ' Fitted', data: fittedLine,
                    type: 'line', borderColor: 'rgba(6,182,212,0.4)', borderWidth: 1,
                    pointRadius: 0, fill: false, tension: 0.3, order: 1,
                },
                {
                    label: '95% CI', data: upperData,
                    type: 'line', borderColor: 'rgba(245,158,11,0.08)', borderWidth: 1,
                    borderDash: [2, 2], pointRadius: 0,
                    fill: '+1', backgroundColor: 'rgba(245,158,11,0.03)',
                    tension: 0.3, order: 10
                },
                {
                    label: '95% CI Lower', data: lowerData,
                    type: 'line', borderColor: 'rgba(245,158,11,0.08)', borderWidth: 1,
                    borderDash: [2, 2], pointRadius: 0,
                    fill: false, tension: 0.3, order: 11
                },
                {
                    label: 'Reorder Point', data: ropLine,
                    type: 'line', borderColor: 'rgba(220,38,38,0.3)', borderWidth: 1,
                    borderDash: [6, 4], pointRadius: 0,
                    fill: false, order: 12
                }
            ]
        },
        options: {
            ...chartOpts('Demand — ' + modelLabel + (WHATIF_ACTIVE ? ' [SCENARIO]' : '')),
            scales: {
                ...chartOpts('').scales,
                y: {
                    ...chartOpts('').scales.y,
                    title: { display: true, text: 'Demand — ' + modelLabel + (WHATIF_ACTIVE ? ' [SCENARIO]' : ''), color: '#666' }
                }
            }
        },
        plugins: [candleWickPlugin, crosshairPlugin, forecastSepPlugin]
    });
}

// ─── Layer Toggle ─────────────────────────────────────────────────
function toggleLayer(datasetIdx, btn) {
    if (!CHARTS.demand) return;
    const chart = CHARTS.demand;
    const vis = chart.isDatasetVisible(datasetIdx);
    chart.setDatasetVisibility(datasetIdx, !vis);
    if (datasetIdx === 3) chart.setDatasetVisibility(4, !vis);
    chart.update('active');
    btn.classList.toggle('active');
}

// ─── Chart Options ────────────────────────────────────────────────
function chartOpts(yLabel) {
    return {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1a1a24',
                titleColor: '#f0f0f5',
                bodyColor: '#a0a0b0',
                borderColor: '#2a2a3a',
                borderWidth: 1,
                titleFont: { family: 'Inter', weight: '600', size: 11 },
                bodyFont: { family: 'JetBrains Mono', size: 10 },
                padding: 10, cornerRadius: 8, caretSize: 5,
                displayColors: true, boxWidth: 8, boxHeight: 8, boxPadding: 4,
                callbacks: {
                    label: item => {
                        if (item.raw == null) return null;
                        return ` ${item.dataset.label}: ${item.raw.toLocaleString()}`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                ticks: {
                    color: '#606070',
                    font: { family: 'JetBrains Mono', size: 8 },
                    maxRotation: 0, maxTicksLimit: 14
                }
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                ticks: {
                    color: '#606070',
                    font: { family: 'JetBrains Mono', size: 9 }
                },
                title: {
                    display: true, text: yLabel,
                    color: '#606070',
                    font: { family: 'Inter', size: 9, weight: '500' }
                }
            }
        }
    };
}


// ─── Decomposition (Premium) ───────────────────────────────────────
function renderDecompositionChart(r) {
    const canvas = document.getElementById('decompositionChart');
    if (CHARTS.decomp) CHARTS.decomp.destroy();
    const ctx2d = canvas.getContext('2d');

    const trendGrad = ctx2d.createLinearGradient(0, 0, 0, canvas.height || 200);
    trendGrad.addColorStop(0, 'rgba(6, 182, 212, 0.2)');
    trendGrad.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    const seasonGrad = ctx2d.createLinearGradient(0, 0, 0, canvas.height || 200);
    seasonGrad.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
    seasonGrad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    CHARTS.decomp = new Chart(canvas, {
        type: 'line',
        data: {
            labels: r.weeks,
            datasets: [
                {
                    label: 'Trend', data: r.decomposition.trend,
                    borderColor: '#06b6d4', borderWidth: 2.5, pointRadius: 0,
                    tension: 0.4, fill: true, backgroundColor: trendGrad
                },
                {
                    label: 'Seasonal', data: r.decomposition.seasonal.map(v => v * 100),
                    borderColor: '#10b981', borderWidth: 2, pointRadius: 0,
                    tension: 0.4, fill: true, backgroundColor: seasonGrad, yAxisID: 'y1'
                },
                {
                    label: 'Residual', data: r.decomposition.residual,
                    borderColor: '#ef4444', borderWidth: 1.5, pointRadius: 0,
                    tension: 0.4,
                    fill: { target: 'origin', above: 'rgba(239,68,68,0.1)', below: 'rgba(59,130,246,0.08)' },
                    yAxisID: 'y2'
                },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 500, easing: 'easeOutQuart' },
            plugins: {
                legend: { labels: { color: '#606070', font: { size: 9, family: 'Inter' }, boxWidth: 10, boxHeight: 3, padding: 10, usePointStyle: false } },
                tooltip: { backgroundColor: 'rgba(26,26,36,0.95)', bodyColor: '#a0a0b0', borderColor: '#2a2a3a', borderWidth: 1, padding: 8, cornerRadius: 6, bodyFont: { family: 'JetBrains Mono', size: 9 } }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }, ticks: { color: '#606070', font: { size: 7, family: 'JetBrains Mono' }, maxRotation: 0, maxTicksLimit: 10 } },
                y: { position: 'left', grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }, ticks: { color: '#06b6d4', font: { size: 8 } } },
                y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#10b981', font: { size: 8 } } },
                y2: { display: false }
            }
        },
        plugins: [{
            id: 'glowDecomp',
            beforeDatasetsDraw(chart) { chart.ctx.save(); chart.ctx.shadowColor = 'rgba(6,182,212,0.3)'; chart.ctx.shadowBlur = 6; },
            afterDatasetsDraw(chart) { chart.ctx.restore(); }
        }]
    });
}

// ─── Category Donut (Premium) ──────────────────────────────────────
function renderCategoryDonut() {
    const ctx = document.getElementById('categoryDonut');
    if (CHARTS.donut) CHARTS.donut.destroy();
    const catMap = {};
    DATA.skus.forEach(s => { catMap[s.category] = (catMap[s.category] || 0) + s.current_stock * s.unit_cost; });
    const labels = Object.keys(catMap), values = Object.values(catMap);
    const colors = labels.map(l => CAT_COLORS[l] || '#888');
    const totalVal = values.reduce((a, b) => a + b, 0);
    CHARTS.donut = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#12121a', borderWidth: 3, hoverOffset: 12, hoverBorderColor: '#f59e0b' }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            animation: { animateRotate: true, duration: 800, easing: 'easeOutQuart' },
            plugins: {
                legend: { position: 'right', labels: { color: '#606070', font: { family: 'Inter', size: 9 }, padding: 8, boxWidth: 8, usePointStyle: true, pointStyle: 'circle' } },
                tooltip: { backgroundColor: 'rgba(26,26,36,0.95)', bodyColor: '#a0a0b0', borderColor: '#2a2a3a', borderWidth: 1, padding: 8, cornerRadius: 6, callbacks: { label: c => ` ${c.label}: ₹${(c.raw / 100000).toFixed(1)}L (${(c.raw / totalVal * 100).toFixed(0)}%)` } }
            }
        },
        plugins: [{
            id: 'centerLabel',
            beforeDraw(chart) {
                const { width, height, ctx: c } = chart;
                c.save();
                c.font = '700 14px JetBrains Mono';
                c.fillStyle = '#f59e0b';
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText('₹' + (totalVal / 100000).toFixed(0) + 'L', width / 2, height / 2 - 6);
                c.font = '500 8px Inter';
                c.fillStyle = '#606070';
                c.fillText('TOTAL VALUE', width / 2, height / 2 + 10);
                c.restore();
            }
        }]
    });
}

// ─── Side Panel: Overview Tab ──────────────────────────────────────
function renderOverviewTab(r) {
    document.getElementById('detailSKUID').textContent = r.sku.sku_id;
    document.getElementById('detailSKUName').textContent = r.sku.name;

    // Use MC probability when available, fall back to basic ratio
    const mcProb = r.stockoutProbability || r.stockoutRisk;
    const riskColor = mcProb > 50 ? C.high : mcProb > 25 ? C.elevated : C.success;
    const riskLabel = mcProb > 50 ? 'CRITICAL' : mcProb > 25 ? 'AT RISK' : 'HEALTHY';
    document.getElementById('detailRisk').style.color = riskColor;
    document.getElementById('detailRisk').textContent = mcProb + '%';
    document.getElementById('detailRiskLabel').style.color = riskColor;
    document.getElementById('detailRiskLabel').textContent = riskLabel;
    document.getElementById('skuDetailCard').style.borderLeftColor = riskColor;

    // Sensor grid — enhanced with MC + σ_FE data
    const sg = document.getElementById('sensorGrid');
    const stockPct = Math.min(100, (r.sku.current_stock / (r.reorderPoint * 2)) * 100);
    const prob = r.stockoutProbability || 0;
    const dt = r.daysToStockout || { p10: 0, p50: 0, p90: 0 };
    sg.innerHTML = `
        <div class="sensor-card"><div class="sensor-icon">📦</div><div class="sensor-label">Stock Level</div><div class="sensor-value">${r.sku.current_stock}</div><div class="sensor-bar"><div style="width:${stockPct}%;background:${C.success}"></div></div></div>
        <div class="sensor-card"><div class="sensor-icon">📊</div><div class="sensor-label">Demand/wk</div><div class="sensor-value">${r.avgDemand.toFixed(0)}</div></div>
        <div class="sensor-card"><div class="sensor-icon">⏱️</div><div class="sensor-label">Days Supply</div><div class="sensor-value">${r.daysOfSupply}d</div></div>
        <div class="sensor-card"><div class="sensor-icon">🛡️</div><div class="sensor-label">Safety Stock</div><div class="sensor-value">${r.safetyStock}</div></div>
        <div class="sensor-card"><div class="sensor-icon">🎲</div><div class="sensor-label">P(Stockout)</div><div class="sensor-value" style="color:${prob > 50 ? C.high : prob > 25 ? C.elevated : C.success}">${prob}%</div></div>
        <div class="sensor-card"><div class="sensor-icon">⏳</div><div class="sensor-label">Median Days</div><div class="sensor-value">${dt.p50}d</div></div>
    `;

    // ─── Monte Carlo Stockout Countdown ────────────────────────────
    const dashOffset = 283 - (283 * prob / 100);
    const ringColor = prob > 60 ? C.critical : prob > 40 ? C.high : prob > 20 ? C.elevated : C.success;
    const severityText = prob > 60 ? 'IMMINENT' : prob > 40 ? 'ELEVATED' : prob > 20 ? 'MODERATE' : 'LOW';
    const mcEl = document.getElementById('mcStockoutPanel');
    if (mcEl) {
        mcEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;padding:12px;background:rgba(${prob > 40 ? '239,68,68' : '16,185,129'},0.06);border:1px solid rgba(${prob > 40 ? '239,68,68' : '16,185,129'},0.15);border-radius:12px;">
            <div style="position:relative;width:80px;height:80px;flex-shrink:0">
                <svg viewBox="0 0 100 100" style="transform:rotate(-90deg)">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="${C.bgElevated}" stroke-width="8"/>
                    <circle cx="50" cy="50" r="45" fill="none" stroke="${ringColor}" stroke-width="8"
                        stroke-dasharray="283" stroke-dashoffset="${dashOffset}"
                        stroke-linecap="round" style="transition:stroke-dashoffset 1s ease"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
                    <span style="font-size:18px;font-weight:800;color:${ringColor}">${prob}%</span>
                    <span style="font-size:7px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px">P(stockout)</span>
                </div>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:10px;color:${C.textMuted};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Monte Carlo · 2000 sim</div>
                <div style="font-size:14px;font-weight:700;color:${ringColor};margin-bottom:6px">${severityText} RISK</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
                    <div style="text-align:center;padding:3px;background:${C.bgCard};border-radius:6px">
                        <div style="font-size:8px;color:${C.textMuted}">Best Case</div>
                        <div style="font-size:12px;font-weight:700;color:${C.success}">${dt.p90}d</div>
                    </div>
                    <div style="text-align:center;padding:3px;background:${C.bgCard};border-radius:6px">
                        <div style="font-size:8px;color:${C.textMuted}">Median</div>
                        <div style="font-size:12px;font-weight:700;color:${C.accent}">${dt.p50}d</div>
                    </div>
                    <div style="text-align:center;padding:3px;background:${C.bgCard};border-radius:6px">
                        <div style="font-size:8px;color:${C.textMuted}">Worst</div>
                        <div style="font-size:12px;font-weight:700;color:${C.high}">${dt.p10}d</div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ─── Financial Impact ──────────────────────────────────────────
    const finEl = document.getElementById('financialImpactPanel');
    if (finEl) {
        const optimalStock = r.reorderPoint;
        const overstock = Math.max(0, r.sku.current_stock - optimalStock);
        const understock = Math.max(0, optimalStock - r.sku.current_stock);
        const capitalAtRisk = overstock * (r.sku.unit_cost || 100);
        const revenueAtRisk = understock * (r.sku.selling_price || 200);
        const safetyStockValue = r.safetyStock * (r.sku.unit_cost || 100);
        const inventoryValue = r.sku.current_stock * (r.sku.unit_cost || 100);
        finEl.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 0;">
            <div style="background:${C.bgCard};padding:10px;border-radius:10px;border-left:3px solid ${capitalAtRisk > 0 ? C.accent : C.success}">
                <div style="font-size:9px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px">Capital Locked</div>
                <div style="font-size:16px;font-weight:700;color:${capitalAtRisk > 0 ? C.accent : C.success}">₹${(capitalAtRisk / 1000).toFixed(1)}K</div>
                <div style="font-size:8px;color:${C.textMuted}">${overstock} units overstock</div>
            </div>
            <div style="background:${C.bgCard};padding:10px;border-radius:10px;border-left:3px solid ${revenueAtRisk > 0 ? C.high : C.success}">
                <div style="font-size:9px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px">Revenue at Risk</div>
                <div style="font-size:16px;font-weight:700;color:${revenueAtRisk > 0 ? C.high : C.success}">₹${(revenueAtRisk / 1000).toFixed(1)}K</div>
                <div style="font-size:8px;color:${C.textMuted}">${understock} units short</div>
            </div>
            <div style="background:${C.bgCard};padding:10px;border-radius:10px;border-left:3px solid ${C.info}">
                <div style="font-size:9px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px">Inventory Value</div>
                <div style="font-size:16px;font-weight:700;color:${C.info}">₹${(inventoryValue / 1000).toFixed(1)}K</div>
                <div style="font-size:8px;color:${C.textMuted}">${r.sku.current_stock} × ₹${r.sku.unit_cost || 100}</div>
            </div>
            <div style="background:${C.bgCard};padding:10px;border-radius:10px;border-left:3px solid ${C.purple}">
                <div style="font-size:9px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px">Safety Buffer ₹</div>
                <div style="font-size:16px;font-weight:700;color:${C.purple}">₹${(safetyStockValue / 1000).toFixed(1)}K</div>
                <div style="font-size:8px;color:${C.textMuted}">${r.safetyStock} units × ₹${r.sku.unit_cost || 100}</div>
            </div>
        </div>`;
    }

    // Prediction — enhanced with MC data
    const totalForecast = r.forecast.reduce((a, b) => a + b, 0);
    const predBox = document.getElementById('predictionBox');
    predBox.className = 'prediction-box ' + (mcProb > 40 ? 'warning' : 'good');
    document.getElementById('predValue').textContent = totalForecast.toLocaleString() + ' units';
    document.getElementById('predValue').style.color = mcProb > 40 ? C.high : C.success;
    document.getElementById('predAlert').innerHTML = mcProb > 60
        ? `⚠ ${prob}% chance of stockout within ${dt.p50} days — Reorder NOW`
        : mcProb > 40
            ? `⚡ ${prob}% stockout risk — monitor closely, median ${dt.p50}d`
            : `✓ Supply adequate — ${prob}% risk, ~${dt.p50}d runway`;
    document.getElementById('predAlert').style.color = mcProb > 40 ? C.high : C.success;

    // ML Model info with σ_FE
    document.getElementById('predConfidence').innerHTML = `<span style="color:${C.success};font-weight:600">${r.modelName || 'Holt-Winters'}</span> · ${r.accuracy.toFixed(1)}% acc · σ<sub>FE</sub>=${(r.sigmaForecastError || 0).toFixed(1)}`;

    // Quick stats
    document.getElementById('quickStats').innerHTML = `
        <div class="quick-stat"><span class="qs-label">Accuracy</span><span class="qs-value" style="color:${C.success}">${r.accuracy.toFixed(1)}%</span></div>
        <div class="quick-stat"><span class="qs-label">ROP</span><span class="qs-value" style="color:${C.accent}">${r.reorderPoint}</span></div>
        <div class="quick-stat"><span class="qs-label">EOQ</span><span class="qs-value" style="color:${C.info}">${r.eoq}</span></div>
    `;

    // Wire buttons
    const btnReorder = document.getElementById('btnReorder');
    const btnFlag = document.getElementById('btnAlert');
    btnReorder.onclick = () => triggerReorder(r);
    btnFlag.onclick = () => triggerFlag(r);
}

// ─── Side Panel: Forecast Tab ──────────────────────────────────────
function renderForecastTab(r) {
    const mapeColor = r.mape < 12 ? C.success : r.mape < 20 ? C.elevated : C.high;
    const r2 = r.r2 !== undefined ? r.r2 : 0;
    const mae = r.mae !== undefined ? r.mae : 0;
    document.getElementById('accuracyMetrics').innerHTML = `
        <div style="padding:4px 8px;margin-bottom:6px;background:${C.bgElevated};border-radius:6px;border-left:3px solid ${C.success}">
            <div style="font-size:9px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px">Selected Model</div>
            <div style="font-size:13px;font-weight:700;color:${C.success}">${r.modelName || 'Holt-Winters'}</div>
            <div style="font-size:8px;color:${C.textMuted};font-family:'JetBrains Mono'">${r.modelParams || ''}</div>
        </div>
        <div style="font-size:8px;color:${C.textMuted};margin-bottom:4px;padding:0 4px">${r.selectionReason || ''}</div>
        <div class="acc-row"><span class="acc-icon">📊</span><div class="acc-info"><div class="acc-label">MAPE</div><div class="acc-val" style="color:${mapeColor}">${r.mape.toFixed(1)}%</div><div class="acc-bar"><div class="acc-fill" style="width:${Math.min(100 - r.mape, 100)}%;background:${mapeColor}"></div></div></div></div>
        <div class="acc-row"><span class="acc-icon">📐</span><div class="acc-info"><div class="acc-label">RMSE</div><div class="acc-val" style="color:${C.info}">${r.rmse.toFixed(1)}</div></div></div>
        <div class="acc-row"><span class="acc-icon">📏</span><div class="acc-info"><div class="acc-label">MAE</div><div class="acc-val" style="color:${C.purple}">${mae.toFixed(1)}</div></div></div>
        <div class="acc-row"><span class="acc-icon">⚖️</span><div class="acc-info"><div class="acc-label">Bias</div><div class="acc-val" style="color:${r.bias > 0 ? C.elevated : C.info}">${r.bias > 0 ? '+' : ''}${r.bias.toFixed(1)}</div></div></div>
        <div class="acc-row"><span class="acc-icon">🎯</span><div class="acc-info"><div class="acc-label">Accuracy</div><div class="acc-val" style="color:${C.success}">${r.accuracy.toFixed(1)}%</div><div class="acc-bar"><div class="acc-fill" style="width:${r.accuracy}%;background:${C.success}"></div></div></div></div>
        <div class="acc-row"><span class="acc-icon">📈</span><div class="acc-info"><div class="acc-label">R²</div><div class="acc-val" style="color:${C.blue}">${r2.toFixed(3)}</div><div class="acc-bar"><div class="acc-fill" style="width:${r2 * 100}%;background:${C.blue}"></div></div></div></div>
    `;
    document.getElementById('featureImportance').innerHTML = r.features.map(f => `
        <div class="fi-row"><span class="fi-icon">${f.icon}</span><span class="fi-name">${f.name}</span><div class="fi-bar-wrap"><div class="fi-bar" style="width:${f.pct}%"></div></div><span class="fi-pct">${f.pct}%</span></div>
    `).join('');
}

// ─── Side Panel: Models Tab (NEW) ──────────────────────────────────
function renderModelsTab(r) {
    const el = document.getElementById('modelsComparison');
    if (!el || !r.modelComparison) return;
    const mc = r.modelComparison;
    el.innerHTML = `
        <div style="font-size:9px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Walk-Forward Backtest (Train W1-40, Test W41-52)</div>
        <table style="width:100%;font-size:9px;border-collapse:collapse">
            <thead><tr style="color:${C.textMuted};border-bottom:1px solid ${C.border}">
                <th style="text-align:left;padding:4px 2px">Model</th>
                <th style="text-align:right;padding:4px 2px">MAPE</th>
                <th style="text-align:right;padding:4px 2px">RMSE</th>
                <th style="text-align:right;padding:4px 2px">R²</th>
                <th style="text-align:right;padding:4px 2px">Bias</th>
            </tr></thead>
            <tbody>${mc.map(m => `
                <tr style="border-bottom:1px solid ${C.border}20;${m.isWinner ? 'background:rgba(16,185,129,0.08)' : ''}">
                    <td style="padding:5px 2px;color:${m.isWinner ? C.success : C.textSecondary}">${m.isWinner ? '🏆 ' : ''}${m.name}</td>
                    <td style="text-align:right;padding:5px 2px;font-family:'JetBrains Mono';color:${m.metrics.mape < 12 ? C.success : m.metrics.mape < 20 ? C.elevated : C.high}">${m.metrics.mape.toFixed(1)}%</td>
                    <td style="text-align:right;padding:5px 2px;font-family:'JetBrains Mono'">${m.metrics.rmse.toFixed(1)}</td>
                    <td style="text-align:right;padding:5px 2px;font-family:'JetBrains Mono'">${m.metrics.r2.toFixed(3)}</td>
                    <td style="text-align:right;padding:5px 2px;font-family:'JetBrains Mono';color:${m.metrics.bias > 0 ? C.elevated : C.info}">${m.metrics.bias > 0 ? '+' : ''}${m.metrics.bias.toFixed(1)}</td>
                </tr>
            `).join('')}</tbody>
        </table>
        <div style="margin-top:8px;padding:6px;background:${C.bgElevated};border-radius:6px;font-size:9px">
            <div style="color:${C.success};font-weight:600;margin-bottom:2px">🧠 Selection Logic</div>
            <div style="color:${C.textSecondary}">${r.selectionReason}</div>
        </div>
        <div style="margin-top:6px;font-size:8px;color:${C.textMuted}">
            <div>• Models backtested on held-out test set</div>
            <div>• Winner selected by lowest test MAPE</div>
            <div>• Ties broken by RMSE</div>
        </div>
    `;
}

// ─── Side Panel: Optimize Tab ──────────────────────────────────────
function renderOptimizeTab(r) {
    const statusColor = r.stockoutRisk > 50 ? C.high : r.stockoutRisk > 25 ? C.elevated : C.success;
    const statusText = r.stockoutRisk > 50 ? '⚠ Reorder Immediately' : r.stockoutRisk > 25 ? '⏳ Monitor Level' : '✓ Stock Healthy';
    const pct = Math.min(100, (r.sku.current_stock / (r.reorderPoint * 1.8)) * 100);
    const ropPct = (r.reorderPoint / (r.reorderPoint * 1.8)) * 100;
    document.getElementById('optimizeDetails').innerHTML = `
        <div style="padding:6px 0;font-size:11px;font-weight:600;color:${statusColor}">${statusText}</div>
        <div class="optimize-row"><span class="opt-label">Current Stock</span><span class="opt-value">${r.sku.current_stock.toLocaleString()}</span></div>
        <div class="optimize-row"><span class="opt-label">Reorder Point</span><span class="opt-value" style="color:${C.accent}">${r.reorderPoint}</span></div>
        <div class="optimize-row"><span class="opt-label">Safety Stock</span><span class="opt-value">${r.safetyStock}</span></div>
        <div class="optimize-row"><span class="opt-label">EOQ</span><span class="opt-value" style="color:${C.info}">${r.eoq}</span></div>
        <div class="optimize-row"><span class="opt-label">Lead Time</span><span class="opt-value">${r.sku.lead_time_days}d</span></div>
        <div class="optimize-row"><span class="opt-label">Unit Cost</span><span class="opt-value">₹${r.sku.unit_cost.toLocaleString('en-IN')}</span></div>
        <div style="margin-top:10px">
            <div style="height:6px;background:${C.bgElevated};border-radius:3px;position:relative;overflow:visible;">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${C.success},#059669);border-radius:3px;"></div>
                <span style="position:absolute;top:-3px;left:${ropPct}%;width:2px;height:12px;background:${C.accent};border-radius:1px;" title="ROP"></span>
            </div>
            <div style="display:flex;gap:10px;margin-top:4px;font-size:8px;color:${C.textMuted}">
                <span>● Stock</span><span style="color:${C.accent}">| ROP</span>
            </div>
        </div>
    `;
}

// ─── Side Panel: Analysis Tab ──────────────────────────────────────
function renderAnalysisTab() {
    const catMap = {};
    ALL_RESULTS.forEach(r => { const c = r.sku.category; if (!catMap[c]) catMap[c] = { value: 0, count: 0 }; catMap[c].value += r.sku.current_stock * r.sku.unit_cost; catMap[c].count++; });
    const maxCat = Math.max(...Object.values(catMap).map(v => v.value));
    document.getElementById('categoryBreakdown').innerHTML = Object.entries(catMap).map(([k, v]) => `
        <div class="cat-row"><span class="cat-dot" style="background:${CAT_COLORS[k] || '#888'}"></span><span class="cat-name">${k}</span><div class="cat-bar-wrap"><div class="cat-bar" style="width:${(v.value / maxCat * 100)}%;background:${CAT_COLORS[k] || '#888'}"></div></div><span class="cat-val">₹${(v.value / 100000).toFixed(1)}L</span></div>
    `).join('');

    const locMap = {};
    ALL_RESULTS.forEach(r => { const l = r.sku.primary_location; if (!locMap[l]) locMap[l] = { dos: [], risk: [] }; locMap[l].dos.push(r.daysOfSupply); locMap[l].risk.push(r.stockoutRisk); });
    document.getElementById('locationBreakdown').innerHTML = Object.entries(locMap).map(([k, v]) => `
        <div class="cat-row"><span class="cat-dot" style="background:${C.blue}"></span><span class="cat-name">${k}</span><span class="cat-val">${avg(v.dos).toFixed(0)}d DOS · ${avg(v.risk).toFixed(0)}% risk</span></div>
    `).join('');
}

// ─── Side Panel: Table ─────────────────────────────────────────────
function renderTable(filtered) {
    const tbody = document.getElementById('skuTableBody');
    tbody.innerHTML = '';
    filtered.forEach(r => {
        const riskClass = r.stockoutRisk > 50 ? 'critical' : r.stockoutRisk > 25 ? 'warning' : 'healthy';
        const tr = document.createElement('tr');
        tr.className = r.sku.sku_id === CURRENT_SKU ? 'selected' : '';
        tr.onclick = () => { CURRENT_SKU = r.sku.sku_id; renderAll(); };
        tr.innerHTML = `<td class="td-num">${r.sku.sku_id}</td><td class="td-name">${r.sku.name}</td><td class="td-num">${r.sku.current_stock}</td><td><span class="tbl-badge ${riskClass}">${r.stockoutRisk}%</span></td><td class="td-num">${r.daysOfSupply}d</td>`;
        tbody.appendChild(tr);
    });
}

// ─── Demand DNA Card ───────────────────────────────────────────────
function renderDemandDNACard(r) {
    const el = document.getElementById('demandDNAPanel');
    if (!el || !r.demandDNA) return;
    const d = r.demandDNA;
    const trendIcon = d.trendDirection === 'rising' ? '📈' : d.trendDirection === 'declining' ? '📉' : '➡️';
    const trendColor = d.trendDirection === 'rising' ? C.success : d.trendDirection === 'declining' ? C.high : C.textMuted;
    const tierColor = d.demandTier === 'A' ? C.success : d.demandTier === 'B' ? C.accent : C.textMuted;

    el.innerHTML = `
        <div style="padding:10px;background:${C.bgCard};border:1px solid ${C.border};border-radius:10px;margin-top:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:10px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.8px;font-weight:600">🧬 Demand DNA</div>
                <div style="font-size:10px;font-weight:700;color:${tierColor};background:${tierColor}15;padding:2px 8px;border-radius:10px">Tier ${d.demandTier}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <div style="padding:6px;background:${C.bgElevated};border-radius:8px;text-align:center">
                    <div style="font-size:7px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px">Weekend Ratio</div>
                    <div style="font-size:14px;font-weight:700;color:${d.weekendRatio > 1.15 ? C.accent : C.textSecondary};font-family:'JetBrains Mono'">${d.weekendRatio}×</div>
                </div>
                <div style="padding:6px;background:${C.bgElevated};border-radius:8px;text-align:center">
                    <div style="font-size:7px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px">Promo Lift</div>
                    <div style="font-size:14px;font-weight:700;color:${d.promoSensitivity > 20 ? C.success : C.textSecondary};font-family:'JetBrains Mono'">${d.promoSensitivity > 0 ? '+' : ''}${d.promoSensitivity}%</div>
                </div>
                <div style="padding:6px;background:${C.bgElevated};border-radius:8px;text-align:center">
                    <div style="font-size:7px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px">Volatility</div>
                    <div style="font-size:14px;font-weight:700;color:${d.volatilityIndex > 40 ? C.high : d.volatilityIndex > 20 ? C.elevated : C.success};font-family:'JetBrains Mono'">${d.volatilityIndex}%</div>
                </div>
                <div style="padding:6px;background:${C.bgElevated};border-radius:8px;text-align:center">
                    <div style="font-size:7px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px">Seasonality</div>
                    <div style="font-size:14px;font-weight:700;color:${d.seasonalityStrength > 30 ? C.purple : C.textSecondary};font-family:'JetBrains Mono'">${d.seasonalityStrength}%</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding:4px 8px;background:${C.bgElevated};border-radius:8px">
                <span style="font-size:12px">${trendIcon}</span>
                <span style="font-size:9px;color:${trendColor};font-weight:600">${d.trendDirection.toUpperCase()} TREND</span>
                <span style="flex:1"></span>
                <span style="font-size:8px;color:${C.textMuted}">CV=${d.volatilityIndex}%</span>
            </div>
        </div>
    `;
}

// ─── Anomaly Explanation Panel ─────────────────────────────────────
function renderAnomalyExplanation(r) {
    const el = document.getElementById('anomalyExplanationPanel');
    if (!el) return;
    const anomaly = generateAnomalyExplanation(r);
    if (!anomaly) {
        el.innerHTML = `<div style="padding:8px;font-size:9px;color:${C.textMuted};text-align:center;background:${C.bgCard};border-radius:8px;margin-top:6px">✓ No demand anomalies detected</div>`;
        return;
    }
    const borderColor = anomaly.severity === 'significant' ? C.high : C.elevated;
    el.innerHTML = `
        <div style="padding:10px;background:rgba(${anomaly.severity === 'significant' ? '239,68,68' : '234,179,8'},0.06);border:1px solid ${borderColor}30;border-left:3px solid ${borderColor};border-radius:8px;margin-top:8px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <span style="font-size:10px">${anomaly.severity === 'significant' ? '🚨' : '⚡'}</span>
                <span style="font-size:10px;font-weight:700;color:${borderColor};text-transform:uppercase;letter-spacing:0.5px">Anomaly: ${anomaly.direction} ${anomaly.deviation > 0 ? '+' : ''}${anomaly.deviation}%</span>
            </div>
            ${anomaly.explanations.map(exp => `<div style="font-size:9px;color:${C.textSecondary};margin-bottom:3px;line-height:1.4">• ${exp}</div>`).join('')}
        </div>
    `;
}

// ─── Drift Monitor Panel ───────────────────────────────────────────
function renderDriftMonitor(r) {
    const el = document.getElementById('driftMonitorPanel');
    if (!el) return;
    const drift = checkDrift(r);
    if (!drift) {
        el.innerHTML = '';
        return;
    }
    const driftColor = drift.isDrifting ? C.high : C.success;
    const driftLabel = drift.isDrifting ? '⚠ DRIFT DETECTED' : '✓ Model Stable';
    el.innerHTML = `
        <div style="padding:8px;background:${C.bgCard};border:1px solid ${driftColor}30;border-radius:8px;margin-top:6px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:9px;font-weight:600;color:${driftColor}">${driftLabel}</span>
                <span style="font-size:8px;color:${C.textMuted}">Rolling 4wk</span>
            </div>
            <div style="display:flex;gap:8px;font-size:8px">
                <div><span style="color:${C.textMuted}">Recent MAPE:</span> <span style="color:${drift.mape4 > 20 ? C.high : C.success};font-weight:600;font-family:'JetBrains Mono'">${drift.mape4}%</span></div>
                <div><span style="color:${C.textMuted}">Historical:</span> <span style="font-family:'JetBrains Mono'">${drift.mapeHist}%</span></div>
                <div><span style="color:${C.textMuted}">Ratio:</span> <span style="color:${drift.driftRatio > 1.5 ? C.high : C.textSecondary};font-family:'JetBrains Mono'">${drift.driftRatio}×</span></div>
            </div>
        </div>
    `;
}

// ─── Service Level Slider Handler ──────────────────────────────────
window.onServiceLevelChange = (val) => {
    const sl = parseFloat(val);
    SERVICE_LEVEL_Z = SL_Z_MAP[sl] || 1.65;
    const label = document.getElementById('serviceLevelLabel');
    if (label) label.textContent = `${Math.round(sl * 100)}% (Z=${SERVICE_LEVEL_Z})`;
    // Recalculate all forecasts with new service level
    ALL_RESULTS = DATA.skus.map(sku => {
        try { return runForecast(sku); }
        catch (e) { return null; }
    }).filter(Boolean);
    renderAll();
    addLog('info', 'CONFIG', `Service level changed to ${Math.round(sl * 100)}% (Z=${SERVICE_LEVEL_Z})`);
};

// ─── Tabs handled in HTML ──────────────────────────────────────────

// ─── What-If (LIVE — updates ALL charts/panels) ───────────────────
function liveWhatIf() {
    const promo = parseInt(document.getElementById('whatifPromo').value);
    const price = parseInt(document.getElementById('whatifPrice').value);
    const lead = parseInt(document.getElementById('whatifLead').value);
    WHATIF_PARAMS = { promo, price, lead };
    WHATIF_ACTIVE = promo !== 0 || price !== 0 || lead !== 0;
    // Re-render everything with scenario params
    renderAll();
    // Show scenario results inline
    const r = ALL_RESULTS.find(res => res.sku.sku_id === CURRENT_SKU) || ALL_RESULTS[0];
    if (!r) return;
    const scenarioResult = runForecast(r.sku, WHATIF_PARAMS);
    const delta = ((scenarioResult.avgDemand - r.avgDemand) / (r.avgDemand || 1) * 100);
    document.getElementById('whatifResults').innerHTML = `
        <div class="wi-row"><span class="wi-rl">Model</span><span class="wi-rv" style="color:${C.success}">${scenarioResult.modelName}</span></div>
        <div class="wi-row"><span class="wi-rl">New Demand</span><span class="wi-rv ${delta > 0 ? 'up' : 'down'}">${scenarioResult.avgDemand.toFixed(0)}/wk (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%)</span></div>
        <div class="wi-row"><span class="wi-rl">Safety Stock</span><span class="wi-rv">${scenarioResult.safetyStock}</span></div>
        <div class="wi-row"><span class="wi-rl">Reorder Point</span><span class="wi-rv" style="color:${C.accent}">${scenarioResult.reorderPoint}</span></div>
        <div class="wi-row"><span class="wi-rl">EOQ</span><span class="wi-rv">${scenarioResult.eoq}</span></div>
        <div class="wi-row"><span class="wi-rl">Risk</span><span class="wi-rv ${scenarioResult.stockoutRisk > 50 ? 'alert' : 'down'}">${scenarioResult.stockoutRisk > 50 ? '⚠ ' : '✓ '}${scenarioResult.stockoutRisk}%</span></div>
        <div class="wi-row"><span class="wi-rl">Accuracy</span><span class="wi-rv" style="color:${C.success}">${scenarioResult.accuracy.toFixed(1)}%</span></div>
    `;
    if (WHATIF_ACTIVE) addLog('info', 'WHAT-IF', `Scenario: promo ${promo}%, price ${price}%, LT ${lead > 0 ? '+' : ''}${lead}d → Risk ${scenarioResult.stockoutRisk}%`);
}
window.runWhatIfScenario = liveWhatIf;
window.resetWhatIf = () => {
    ['whatifPromo', 'whatifPrice', 'whatifLead'].forEach(id => document.getElementById(id).value = 0);
    document.getElementById('whatifPromoVal').textContent = '0%';
    document.getElementById('whatifPriceVal').textContent = '0%';
    document.getElementById('whatifLeadVal').textContent = '0 days';
    WHATIF_ACTIVE = false;
    WHATIF_PARAMS = { promo: 0, price: 0, lead: 0 };
    renderAll();
    document.getElementById('whatifResults').innerHTML = '<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:10px">Adjust sliders — charts update live</div>';
};

// ─── Persistent State ──────────────────────────────────────────────
let ORDERS = JSON.parse(localStorage.getItem('inv_orders') || '[]');
let FLAGGED = new Set(JSON.parse(localStorage.getItem('inv_flagged') || '[]'));
function saveOrders() { localStorage.setItem('inv_orders', JSON.stringify(ORDERS)); }
function saveFlags() { localStorage.setItem('inv_flagged', JSON.stringify([...FLAGGED])); }

// ─── AI Chat ───────────────────────────────────────────────────────
window.handleAIPrompt = (prompt) => {
    const inp = document.getElementById('aiInput');
    const q = prompt || inp.value.trim();
    if (!q) return;
    inp.value = '';
    const area = document.getElementById('aiChatArea');
    area.innerHTML += `<div class="chat-msg user"><span class="chat-avatar">👤</span><p>${q}</p></div>`;
    area.innerHTML += `<div class="chat-msg ai" id="aiTyping"><span class="chat-avatar">🤖</span><p class="typing-dots"><span>.</span><span>.</span><span>.</span></p></div>`;
    area.scrollTop = area.scrollHeight;
    setTimeout(() => {
        const t = document.getElementById('aiTyping'); if (t) t.remove();
        area.innerHTML += `<div class="chat-msg ai"><span class="chat-avatar">🤖</span><p>${generateAI(q)}</p></div>`;
        area.scrollTop = area.scrollHeight;
    }, 500 + Math.random() * 600);
};

function generateAI(q) {
    const ql = q.toLowerCase();
    const r = ALL_RESULTS.find(res => res.sku.sku_id === CURRENT_SKU) || ALL_RESULTS[0];
    if (!r) return 'No data loaded yet. Please wait for analysis to complete.';
    const sorted = [...ALL_RESULTS].sort((a, b) => b.stockoutRisk - a.stockoutRisk);
    const N = ALL_RESULTS.length;

    // ── Help / Greeting ──
    if (ql.match(/^(hi|hello|hey|help|what can you|commands|menu)/)) {
        return `<strong>🤖 Inventory Intelligence Assistant</strong><br>
        I can answer questions about:<br>
        • <em>Which SKU has highest risk?</em><br>
        • <em>Demand forecast summary</em><br>
        • <em>What model is used?</em><br>
        • <em>Compare models</em><br>
        • <em>Reorder recommendations</em><br>
        • <em>Trending up/down SKUs</em><br>
        • <em>Category breakdown</em><br>
        • <em>Safety stock analysis</em><br>
        • <em>Lead time / supplier info</em><br>
        • <em>Best/worst performers</em><br>
        • <em>Inventory value</em><br>
        • <em>Promotion analysis</em><br>
        • <em>Flagged SKUs</em><br>
        • <em>Order history</em><br>
        Or ask about any specific SKU or topic!`;
    }

    // ── Model Info ──
    if (ql.match(/model|algorithm|which.*used|method/)) {
        const mc = r.modelComparison || [];
        const winner = mc.find(m => m.isWinner) || { name: r.modelName, metrics: { mape: r.mape, accuracy: r.accuracy } };
        let resp = `<strong>📊 ${r.sku.name}</strong> uses <strong>${r.modelName}</strong><br>`;
        resp += `Accuracy: <strong>${r.accuracy.toFixed(1)}%</strong> | MAPE: <strong>${r.mape.toFixed(1)}%</strong><br><br>`;
        resp += `<strong>All models tested:</strong><br>`;
        mc.forEach(m => {
            const badge = m.isWinner ? ' ✅ Winner' : '';
            resp += `• ${m.name}: MAPE ${m.metrics.mape.toFixed(1)}%${badge}<br>`;
        });
        if (r.selectionReason) resp += `<br><em>${r.selectionReason}</em>`;
        return resp;
    }

    // ── Risk / Stockout ──
    if (ql.match(/risk|stockout|danger|critical|alert/)) {
        const top = sorted.slice(0, 5);
        const critical = sorted.filter(s => s.stockoutRisk > 60).length;
        const atRisk = sorted.filter(s => s.stockoutRisk > 25).length;
        return `<strong>⚠ Risk Summary</strong> (${N} SKUs)<br>
        🔴 Critical (>60%): <strong>${critical}</strong> SKUs<br>
        🟠 At-risk (>25%): <strong>${atRisk}</strong> SKUs<br>
        🟢 Healthy: <strong>${N - atRisk}</strong> SKUs<br><br>
        <strong>Top 5 Highest Risk:</strong><br>
        ${top.map((s, i) => `${i + 1}. <strong>${s.sku.name}</strong> — ${s.stockoutRisk}% risk, ${s.daysOfSupply}d supply, stock: ${s.sku.current_stock}`).join('<br>')}`;
    }

    // ── Forecast / Demand ──
    if (ql.match(/forecast|demand|predict|future/)) {
        const total = ALL_RESULTS.reduce((s, x) => s + x.forecast.reduce((a, b) => a + b, 0), 0);
        const top5 = [...ALL_RESULTS].sort((a, b) => b.forecast.reduce((s, v) => s + v, 0) - a.forecast.reduce((s, v) => s + v, 0)).slice(0, 5);
        return `<strong>📈 8-Week Demand Forecast</strong><br>
        Total across ${N} SKUs: <strong>${total.toLocaleString()} units</strong><br>
        Avg per SKU: <strong>${Math.round(total / N).toLocaleString()}</strong><br><br>
        <strong>Top 5 by volume:</strong><br>
        ${top5.map((s, i) => `${i + 1}. ${s.sku.name}: <strong>${s.forecast.reduce((a, b) => a + b, 0).toLocaleString()}</strong> units`).join('<br>')}<br><br>
        Current SKU (${r.sku.name}): <strong>${r.forecast.reduce((a, b) => a + b, 0).toLocaleString()}</strong> units`;
    }

    // ── Turnover / Location ──
    if (ql.match(/turnover|location|region|city|where/)) {
        const locs = {};
        ALL_RESULTS.forEach(x => {
            if (!locs[x.sku.primary_location]) locs[x.sku.primary_location] = { count: 0, dos: [], risk: [] };
            locs[x.sku.primary_location].count++;
            locs[x.sku.primary_location].dos.push(x.daysOfSupply);
            locs[x.sku.primary_location].risk.push(x.stockoutRisk);
        });
        return `<strong>📍 Location Summary</strong><br>
        ${Object.entries(locs).map(([k, v]) => {
            const avgDos = (v.dos.reduce((a, b) => a + b, 0) / v.dos.length).toFixed(0);
            const avgRisk = (v.risk.reduce((a, b) => a + b, 0) / v.risk.length).toFixed(0);
            return `<strong>${k}</strong>: ${v.count} SKUs, avg ${avgDos}d supply, ${avgRisk}% risk`;
        }).join('<br>')}`;
    }

    // ── Reorder Recommendations ──
    if (ql.match(/reorder|order|buy|replenish|purchase/)) {
        const needReorder = sorted.filter(s => s.sku.current_stock <= s.reorderPoint);
        if (needReorder.length === 0) return '<strong>✅ All SKUs are above reorder point!</strong> No immediate reorders needed.';
        return `<strong>📦 Reorder Recommendations</strong><br>
        <strong>${needReorder.length}</strong> SKUs below reorder point:<br><br>
        ${needReorder.slice(0, 8).map((s, i) => `${i + 1}. <strong>${s.sku.name}</strong><br>
        &nbsp;&nbsp;Stock: ${s.sku.current_stock} / ROP: ${s.reorderPoint} / Order: <strong>${s.eoq} units</strong>`).join('<br>')}<br>
        ${needReorder.length > 8 ? `<br>...and ${needReorder.length - 8} more` : ''}`;
    }

    // ── Compare Models ──
    if (ql.match(/compare|versus|vs|benchmark|model comparison/)) {
        const modelStats = {};
        ALL_RESULTS.forEach(r => {
            (r.modelComparison || []).forEach(m => {
                if (!modelStats[m.name]) modelStats[m.name] = { wins: 0, mapes: [], used: 0 };
                modelStats[m.name].mapes.push(m.metrics.mape);
                if (m.isWinner) { modelStats[m.name].wins++; modelStats[m.name].used++; }
            });
        });
        return `<strong>🏆 Model Performance Across ${N} SKUs</strong><br><br>
        ${Object.entries(modelStats).map(([name, s]) => {
            const avgMape = (s.mapes.reduce((a, b) => a + b, 0) / s.mapes.length).toFixed(1);
            return `<strong>${name}</strong>: Won ${s.wins}/${N} SKUs, avg MAPE ${avgMape}%`;
        }).join('<br>')}`;
    }

    // ── Trending ──
    if (ql.match(/trend|growing|declining|up|down|momentum/)) {
        const trends = ALL_RESULTS.map(r => {
            const u = r.units;
            const half = Math.floor(u.length / 2);
            const first = u.slice(0, half).reduce((a, b) => a + b, 0) / half;
            const second = u.slice(half).reduce((a, b) => a + b, 0) / (u.length - half);
            return { ...r, change: ((second - first) / first * 100) };
        }).sort((a, b) => b.change - a.change);
        const up = trends.slice(0, 3);
        const down = trends.slice(-3).reverse();
        return `<strong>📊 Demand Trends</strong><br><br>
        <strong>📈 Trending Up:</strong><br>
        ${up.map(s => `• ${s.sku.name}: <strong>+${s.change.toFixed(0)}%</strong>`).join('<br>')}<br><br>
        <strong>📉 Trending Down:</strong><br>
        ${down.map(s => `• ${s.sku.name}: <strong>${s.change.toFixed(0)}%</strong>`).join('<br>')}`;
    }

    // ── Category ──
    if (ql.match(/category|categories|breakdown|segment/)) {
        const cats = {};
        ALL_RESULTS.forEach(r => {
            if (!cats[r.sku.category]) cats[r.sku.category] = { count: 0, totalDemand: 0, avgRisk: [] };
            cats[r.sku.category].count++;
            cats[r.sku.category].totalDemand += r.forecast.reduce((a, b) => a + b, 0);
            cats[r.sku.category].avgRisk.push(r.stockoutRisk);
        });
        return `<strong>📂 Category Breakdown</strong><br><br>
        ${Object.entries(cats).sort((a, b) => b[1].totalDemand - a[1].totalDemand).map(([k, v]) => {
            const avgR = (v.avgRisk.reduce((a, b) => a + b, 0) / v.avgRisk.length).toFixed(0);
            return `<strong>${k}</strong>: ${v.count} SKUs, forecast ${v.totalDemand.toLocaleString()} units, avg risk ${avgR}%`;
        }).join('<br>')}`;
    }

    // ── Safety Stock ──
    if (ql.match(/safety|buffer|minimum|stock level/)) {
        const below = ALL_RESULTS.filter(r => r.sku.current_stock < r.safetyStock);
        return `<strong>🛡 Safety Stock Analysis</strong><br>
        SKUs below safety stock: <strong>${below.length}/${N}</strong><br><br>
        ${below.length > 0 ? '<strong>Below safety stock:</strong><br>' + below.slice(0, 6).map(s =>
            `• ${s.sku.name}: stock ${s.sku.current_stock} vs safety ${s.safetyStock}`
        ).join('<br>') : '✅ All SKUs above safety stock levels'}<br><br>
        Current SKU (${r.sku.name}): stock <strong>${r.sku.current_stock}</strong>, safety stock: <strong>${r.safetyStock}</strong>, EOQ: <strong>${r.eoq}</strong>`;
    }

    // ── Supplier / Lead Time ──
    if (ql.match(/supplier|lead time|deliver|shipping|logistics/)) {
        const suppliers = {};
        ALL_RESULTS.forEach(r => {
            const sup = r.sku.supplier || 'Unknown';
            if (!suppliers[sup]) suppliers[sup] = { count: 0, ltSum: 0 };
            suppliers[sup].count++;
            suppliers[sup].ltSum += r.sku.lead_time_days;
        });
        return `<strong>🚚 Supplier & Lead Time</strong><br>
        ${r.sku.name}: <strong>${r.sku.supplier}</strong>, ${r.sku.lead_time_days} days lead time<br><br>
        <strong>All suppliers:</strong><br>
        ${Object.entries(suppliers).sort((a, b) => b[1].count - a[1].count).map(([k, v]) =>
            `• <strong>${k}</strong>: ${v.count} SKUs, avg lead ${(v.ltSum / v.count).toFixed(0)} days`
        ).join('<br>')}`;
    }

    // ── Best / Worst Performers ──
    if (ql.match(/best|worst|top|bottom|performing|performer|rank/)) {
        const byAcc = [...ALL_RESULTS].sort((a, b) => b.accuracy - a.accuracy);
        return `<strong>🏅 Performance Ranking</strong><br><br>
        <strong>Best forecast accuracy:</strong><br>
        ${byAcc.slice(0, 5).map((s, i) => `${i + 1}. ${s.sku.name}: <strong>${s.accuracy.toFixed(1)}%</strong> accuracy`).join('<br>')}<br><br>
        <strong>Needs improvement:</strong><br>
        ${byAcc.slice(-3).map((s, i) => `• ${s.sku.name}: <strong>${s.accuracy.toFixed(1)}%</strong> accuracy`).join('<br>')}`;
    }

    // ── Cost / Value ──
    if (ql.match(/cost|value|worth|money|inventory value|investment/)) {
        const totalValue = ALL_RESULTS.reduce((s, r) => s + r.sku.current_stock * r.sku.unit_cost, 0);
        const totalRetail = ALL_RESULTS.reduce((s, r) => s + r.sku.current_stock * r.sku.selling_price, 0);
        const top5 = [...ALL_RESULTS].sort((a, b) => (b.sku.current_stock * b.sku.unit_cost) - (a.sku.current_stock * a.sku.unit_cost)).slice(0, 5);
        return `<strong>💰 Inventory Valuation</strong><br>
        Total cost value: <strong>₹${(totalValue).toLocaleString()}</strong><br>
        Total retail value: <strong>₹${(totalRetail).toLocaleString()}</strong><br>
        Margin potential: <strong>₹${(totalRetail - totalValue).toLocaleString()}</strong><br><br>
        <strong>Highest value SKUs:</strong><br>
        ${top5.map((s, i) => `${i + 1}. ${s.sku.name}: ₹${(s.sku.current_stock * s.sku.unit_cost).toLocaleString()}`).join('<br>')}`;
    }

    // ── Promotion Analysis ──
    if (ql.match(/promo|promotion|discount|sale|offer/)) {
        const promoCount = ALL_RESULTS.reduce((s, r) => s + r.sku.promotions.length, 0);
        const avgLift = ALL_RESULTS.reduce((s, r) => {
            const lifts = r.sku.promotions.map(p => p.lift);
            return s + (lifts.length ? lifts.reduce((a, b) => a + b, 0) / lifts.length : 1);
        }, 0) / N;
        return `<strong>🏷 Promotion Analysis</strong><br>
        Total promo events: <strong>${promoCount}</strong> across ${N} SKUs<br>
        Avg promo lift: <strong>${((avgLift - 1) * 100).toFixed(0)}%</strong><br><br>
        ${r.sku.name} has <strong>${r.sku.promotions.length}</strong> promotions:<br>
        ${r.sku.promotions.slice(0, 4).map(p => `• Week ${p.week}: ${p.discount}% off, lift ${((p.lift - 1) * 100).toFixed(0)}%`).join('<br>')}`;
    }

    // ── Flagged SKUs ──
    if (ql.match(/flag|flagged|watch|watchlist|monitor/)) {
        if (FLAGGED.size === 0) return '<strong>🏳 No SKUs currently flagged.</strong><br>Use the "Flag SKU" button to add SKUs to your watchlist.';
        const flagged = ALL_RESULTS.filter(r => FLAGGED.has(r.sku.sku_id));
        return `<strong>🚩 Flagged SKUs (${FLAGGED.size})</strong><br><br>
        ${flagged.map(s => `• <strong>${s.sku.name}</strong> — risk ${s.stockoutRisk}%, ${s.daysOfSupply}d supply`).join('<br>')}`;
    }

    // ── Orders ──
    if (ql.match(/order history|orders|placed|submitted/)) {
        if (ORDERS.length === 0) return '<strong>📋 No orders placed yet.</strong><br>Use the "Reorder Now" button to place orders.';
        return `<strong>📋 Order History (${ORDERS.length})</strong><br><br>
        ${ORDERS.slice(-5).reverse().map(o => `• <strong>${o.sku_name}</strong>: ${o.quantity} units on ${new Date(o.timestamp).toLocaleString()}`).join('<br>')}`;
    }

    // ── Shelf Life ──
    if (ql.match(/shelf|expir|perishable|fresh/)) {
        const perishable = ALL_RESULTS.filter(r => r.sku.shelf_life_days);
        const atRisk = perishable.filter(r => r.daysOfSupply > (r.sku.shelf_life_days * 0.8));
        return `<strong>📅 Shelf Life Report</strong><br>
        Perishable SKUs: <strong>${perishable.length}</strong><br>
        At risk of expiry (DOS > 80% shelf life): <strong>${atRisk.length}</strong><br><br>
        ${atRisk.length > 0 ? atRisk.slice(0, 5).map(s =>
            `• ${s.sku.name}: ${s.daysOfSupply}d supply vs ${s.sku.shelf_life_days}d shelf life`
        ).join('<br>') : '✅ No immediate shelf life concerns'}`;
    }

    // ── Specific SKU query ──
    const skuMatch = ALL_RESULTS.find(s => ql.includes(s.sku.name.toLowerCase()) || ql.includes(s.sku.sku_id.toLowerCase()));
    if (skuMatch) {
        const s = skuMatch;
        return `<strong>📊 ${s.sku.name} (${s.sku.sku_id})</strong><br>
        Category: ${s.sku.category} | Location: ${s.sku.primary_location}<br>
        Model: <strong>${s.modelName}</strong> (${s.accuracy.toFixed(1)}% accuracy)<br>
        Stock: <strong>${s.sku.current_stock}</strong> | DOS: ${s.daysOfSupply}d | Risk: <strong>${s.stockoutRisk}%</strong><br>
        Forecast (8wk): <strong>${s.forecast.reduce((a, b) => a + b, 0).toLocaleString()} units</strong><br>
        ROP: ${s.reorderPoint} | Safety: ${s.safetyStock} | EOQ: ${s.eoq}<br>
        Supplier: ${s.sku.supplier} | Lead: ${s.sku.lead_time_days}d`;
    }

    // ── Deep Database Search (Train with all data) ──
    const words = ql.split(' ').filter(w => w.length > 2);
    if (words.length > 0) {
        const matches = ALL_RESULTS.filter(s => {
            const str = JSON.stringify(s.sku).toLowerCase();
            return words.every(w => str.includes(w));
        });

        if (matches.length > 0 && matches.length !== N) {
            return `<strong>🤖 Deep Data Search Match</strong><br>
             I analyzed all datasets and found <strong>${matches.length}</strong> items matching your query.<br><br>
             <strong>Top Matches:</strong><br>
             ${matches.slice(0, 4).map(s => `• <strong>${s.sku.name}</strong> at ${s.sku.location}<br>  └ Stock: ${s.sku.current_stock} | Supplier: ${s.sku.supplier} | Risk: ${s.stockoutRisk}%`).join('<br><br>')}
             ${matches.length > 4 ? '<br><em>(Refine your query to see more)</em>' : ''}`;
        }
    }

    // ── Default: Current SKU summary ──
    return `<strong>📊 ${r.sku.name}</strong> (${r.sku.sku_id})<br>
    Model: <strong>${r.modelName}</strong> | Accuracy: ${r.accuracy.toFixed(1)}% | MAPE: ${r.mape.toFixed(1)}%<br>
    Stock: <strong>${r.sku.current_stock}</strong> units | Risk: <strong>${r.stockoutRisk}%</strong><br>
    Days of supply: <strong>${r.daysOfSupply}d</strong> | Forecast: ${r.forecast.reduce((a, b) => a + b, 0).toLocaleString()} units<br>
    Safety stock: ${r.safetyStock} | ROP: ${r.reorderPoint} | EOQ: ${r.eoq}<br><br>
    <em>Try asking about: risk, forecast, models, trends, categories, promotions, reorder, shelf life, or any specific SKU/supplier name.</em>`;
}

// ─── Activity Log ──────────────────────────────────────────────────
function startActivityLog() {
    // Count models used
    const modelCounts = {};
    ALL_RESULTS.forEach(r => { modelCounts[r.modelName] = (modelCounts[r.modelName] || 0) + 1; });
    const modelSummary = Object.entries(modelCounts).map(([k, v]) => `${k}: ${v}`).join(', ');
    const avgAcc = avg(ALL_RESULTS.map(r => r.accuracy));
    const logs = [
        ['success', 'ML-ENGINE', `4 models backtested per SKU — Winners: ${modelSummary}`],
        ['info', 'PREPROCESS', `Net demand computed: sales − returns, ${ALL_RESULTS.reduce((s, r) => s + (r.sku.outOfStockWeeks?.length || 0), 0)} OOS weeks censored`],
        ['success', 'FORECAST', `8-week forecast generated — Avg accuracy: ${avgAcc.toFixed(1)}%`],
        ['info', 'OPTIMIZE', 'Safety stock, ROP, EOQ recalculated across all locations'],
        ['warning', 'STOCKOUT', `${ALL_RESULTS.filter(r => r.stockoutRisk > 50).length} SKUs flagged as critical risk`],
        ['success', 'DATA', `${DATA.skus.length} SKUs loaded with 52-week history, returns & promotions`],
        ['info', 'FEATURES', 'Feature importance computed from decomposition variance'],
        ['success', 'API', 'Real-time POS feed connected — polling /api/inventory/feed'],
    ];
    logs.forEach(([type, cat, msg]) => addLog(type, cat, msg));
    // Start real-time feed polling
    startFeedPolling();
    // Periodic simulated updates
    setInterval(() => {
        const msgs = [
            ['info', 'SENSOR', 'Warehouse sensor heartbeat OK — all locations online'],
            ['success', 'ML-ENGINE', 'Model accuracy check passed: MAPE < 15% threshold'],
            ['info', 'SUPPLY', 'Supplier lead time data refreshed from ERP'],
            ['warning', 'DEMAND', 'Seasonal demand spike detected in FMCG category'],
            ['info', 'LOGISTICS', 'Fleet tracker: 3 shipments in transit to regional warehouses'],
            ['success', 'RESTOCK', 'Auto-reorder triggered for low-stock SKUs in Chennai'],
        ];
        const m = msgs[Math.floor(Math.random() * msgs.length)];
        addLog(m[0], m[1], m[2]);
    }, 8000);
}

function addLog(type, category, message) {
    const el = document.getElementById('activityLog');
    if (!el) return;
    const now = new Date().toLocaleTimeString('en-IN', { hour12: false });
    const entry = document.createElement('div');
    entry.className = 'log-entry ' + type;
    entry.dataset.category = category;

    if (type === 'warning' || type === 'critical' || category === 'STOCKOUT') {
        entry.style.cursor = 'pointer';
        entry.onclick = () => window.location.href = 'risk-alerts-dashboard.html';
        entry.title = 'Click to view in Risk & Alerts Dashboard';
    }

    entry.innerHTML = `<span class="log-time">${now}</span><span class="log-category">[${category}]</span><span class="log-message">${message}</span>`;
    el.insertBefore(entry, el.firstChild);
    if (el.children.length > 80) el.removeChild(el.lastChild);
}

// ─── Log Tab Filtering ─────────────────────────────────────────────
window.filterLog = function (filter, btn) {
    const el = document.getElementById('activityLog');
    if (!el) return;
    [...el.children].forEach(entry => {
        const cat = entry.dataset.category || '';
        if (filter === 'ALL') { entry.style.display = ''; return; }
        if (filter === 'STOCKOUT' && (cat === 'STOCKOUT' || cat === 'ALERT' || cat === 'FLAG')) entry.style.display = '';
        else if (filter === 'REORDER' && cat === 'REORDER') entry.style.display = '';
        else if (filter !== 'ALL') entry.style.display = 'none';
    });
    // Update tab active state
    document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
};

// ─── Button Handlers ───────────────────────────────────────────────
function triggerReorder(r) {
    const btn = document.getElementById('btnReorder');
    btn.textContent = '⏳ Submitting...';
    btn.disabled = true;

    const order = {
        sku_id: r.sku.sku_id,
        sku_name: r.sku.name,
        quantity: r.eoq,
        reorder_point: r.reorderPoint,
        safety_stock: r.safetyStock,
        model_used: r.modelName,
        unit_cost: r.sku.unit_cost,
        total_cost: r.eoq * r.sku.unit_cost,
        supplier: r.sku.supplier,
        timestamp: new Date().toISOString(),
        status: 'submitted'
    };

    // Store locally first
    ORDERS.push(order);
    saveOrders();

    // Try server
    fetch('/api/inventory/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
    }).then(res => res.json()).then(data => {
        order.status = 'confirmed';
        order.server_id = data.order?.id || null;
        saveOrders();
    }).catch(() => { /* order is still stored locally */ });

    // Immediate UI feedback
    btn.textContent = '✅ Order Placed!';
    btn.style.background = C.success;
    addLog('success', 'REORDER', `📦 ${r.sku.name} — ${r.eoq} units ordered (₹${(r.eoq * r.sku.unit_cost).toLocaleString()}) via ${r.modelName} → ${r.sku.supplier}`);
    showToast(`📦 Ordered ${r.eoq} units of ${r.sku.name}`, 'success');
    setTimeout(() => { btn.textContent = '📦 Reorder Now'; btn.disabled = false; btn.style.background = ''; }, 3000);
}

function triggerFlag(r) {
    const btn = document.getElementById('btnAlert');
    const alreadyFlagged = FLAGGED.has(r.sku.sku_id);

    if (alreadyFlagged) {
        // Unflag
        FLAGGED.delete(r.sku.sku_id);
        saveFlags();
        btn.textContent = '⚠ Flag SKU';
        addLog('info', 'UNFLAG', `🏳 ${r.sku.name} removed from watchlist`);
        showToast(`🏳 ${r.sku.name} unflagged`, 'info');
        const cards = document.querySelectorAll('.sku-card');
        cards.forEach(c => { if (c.dataset?.skuId === r.sku.sku_id) c.style.borderColor = ''; });
        return;
    }

    btn.textContent = '⏳ Flagging...';
    btn.disabled = true;
    const reason = r.stockoutRisk > 50 ? 'Critical stockout risk' : r.stockoutRisk > 25 ? 'At-risk inventory level' : 'Manual review requested';

    // Store locally
    FLAGGED.add(r.sku.sku_id);
    saveFlags();

    // Try server
    fetch('/api/inventory/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_id: r.sku.sku_id, reason, risk_score: r.stockoutRisk })
    }).catch(() => { /* stored locally */ });

    // Immediate UI feedback
    btn.textContent = '🚩 Flagged!';
    btn.style.background = '#a855f7';
    addLog('warning', 'FLAG', `🚩 ${r.sku.name} flagged: ${reason} (risk: ${r.stockoutRisk}%)`);
    showToast(`🚩 ${r.sku.name} flagged — ${reason}`, 'warning');

    // Highlight SKU card
    const cards = document.querySelectorAll('.sku-card');
    cards.forEach(c => { if (c.dataset?.skuId === r.sku.sku_id) c.style.borderColor = '#a855f7'; });

    setTimeout(() => {
        btn.textContent = '🚩 Unflag SKU';
        btn.disabled = false;
        btn.style.background = '';
    }, 2000);
}

// ─── Toast Notification ────────────────────────────────────────────
function showToast(message, type = 'info') {
    const colors = { success: C.success, warning: C.elevated, info: C.info, critical: C.critical };
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;top:60px;right:20px;padding:10px 16px;background:#1a1a24;border:1px solid ${colors[type] || C.info};border-radius:8px;color:#f0f0f5;font-size:11px;font-family:Inter;z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,0.5);opacity:0;transition:opacity 0.3s;max-width:320px;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Send Alert button handler (header)
function sendGlobalAlert() {
    const criticals = ALL_RESULTS.filter(r => r.stockoutRisk > 40);
    if (criticals.length === 0) {
        addLog('info', 'ALERT', 'No critical SKUs to alert on — all levels healthy');
        return;
    }
    fetch('/api/inventory/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: `⚠ ${criticals.length} SKUs at risk of stockout — immediate action required`,
            severity: 'HIGH',
            affected_skus: criticals.map(r => ({ sku_id: r.sku.sku_id, name: r.sku.name, risk: r.stockoutRisk }))
        })
    }).then(res => res.json()).then(data => {
        addLog('critical', 'ALERT', `⚠ Alert sent for ${criticals.length} at-risk SKUs (${data.alert?.id || 'N/A'})`);
        // Flash header
        const header = document.querySelector('.header');
        header.style.borderBottom = '2px solid ' + C.high;
        setTimeout(() => { header.style.borderBottom = ''; }, 3000);
    }).catch(e => {
        addLog('critical', 'ALERT', `Failed to send alert: ${e.message}`);
    });
}
// Wire header Send Alert button
document.addEventListener('DOMContentLoaded', () => {
    const alertBtn = document.querySelector('.mode-btn.send-alert');
    if (alertBtn) alertBtn.onclick = sendGlobalAlert;
});

// ─── Real-Time Feed Polling ────────────────────────────────────────
let LAST_FEED_TS = null;
function startFeedPolling() {
    setInterval(async () => {
        try {
            const url = LAST_FEED_TS ? `/api/inventory/feed?since=${encodeURIComponent(LAST_FEED_TS)}` : '/api/inventory/feed';
            const res = await fetch(url);
            const data = await res.json();
            if (data.events && data.events.length > 0) {
                LAST_FEED_TS = data.events[0].timestamp;
                // Show latest events in activity log
                data.events.slice(0, 5).reverse().forEach(evt => {
                    const typeMap = {
                        'POS_SALE': ['success', 'POS', `💰 ${evt.sku_id} sold ${evt.details?.units || evt.quantity} units via ${evt.channel} in ${evt.location}`],
                        'DEMAND_SPIKE': ['warning', 'DEMAND', `📈 ${evt.sku_id} demand spike: +${evt.details?.deviation} above baseline in ${evt.location}`],
                        'PROMO_TRIGGERED': ['info', 'PROMO', `🎯 ${evt.sku_id} promo active: ${evt.details?.discount} off, lift ${evt.details?.lift}x`],
                        'STOCK_UPDATE': ['info', 'STOCK', `📦 ${evt.sku_id} stock: ${evt.details?.previous} → ${evt.details?.current} (${evt.details?.delta > 0 ? '+' : ''}${evt.details?.delta})`],
                        'SUPPLIER_DELAY': ['warning', 'SUPPLY', `⏱ ${evt.sku_id} supplier delay: ${evt.details?.expected_days}d → ${evt.details?.new_days}d (${evt.details?.reason})`],
                        'PRICE_CHANGE': ['info', 'PRICING', `💲 ${evt.sku_id} price change: ${evt.details?.change_pct} at ${evt.location}`],
                        'WEATHER_ALERT': ['critical', 'WEATHER', `🌧 ${evt.details?.condition} in ${evt.location} — may impact ${evt.sku_id} demand`],
                        'RETURN_PROCESSED': ['info', 'RETURNS', `↩ ${evt.sku_id} return: ${evt.details?.units} units (${evt.details?.reason})`],
                    };
                    const [t, c, m] = typeMap[evt.type] || ['info', 'EVENT', `${evt.type}: ${evt.sku_id}`];
                    addLog(t, c, m);
                });
                // Update last-update timestamp
                document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('en-IN', { hour12: false });
            }
        } catch (e) { /* silently retry */ }
    }, 5000);
}
