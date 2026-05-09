/**
 * ═══════════════════════════════════════════════════════════════════
 *  RISK-ALERTS-DASHBOARD.JS — Standalone Risk & Alerts Intelligence
 * ═══════════════════════════════════════════════════════════════════
 */

(async function () {
    'use strict';

    const state = window.SYS || {};
    let dataset = null;
    let alerts = [];
    let alertIdCounter = 0;
    let trendChart = null;
    const STORE_COORDS = {
        'Chennai': { lat: 13.08, lng: 80.27 }, 'Mumbai': { lat: 19.07, lng: 72.87 },
        'Delhi': { lat: 28.70, lng: 77.10 }, 'Bangalore': { lat: 12.97, lng: 77.59 },
        'Hyderabad': { lat: 17.38, lng: 78.48 }, 'Kolkata': { lat: 22.57, lng: 88.36 },
        'Pune': { lat: 18.52, lng: 73.85 }, 'Ahmedabad': { lat: 23.02, lng: 72.57 }
    };

    // ─── LOAD DATA ───────────────────────────────────────────────
    async function loadData() {
        try {
            const resp = await fetch('/inventory-data.json');
            dataset = await resp.json();
            console.log(`[RiskDash] ✅ Loaded ${dataset.skus.length} SKUs`);
        } catch (e) {
            console.error('[RiskDash] Failed to load data:', e);
            dataset = { skus: [], categories: [], supplierPerformance: {}, warehouses: [], oilPrices: [], transferCosts: {} };
        }
    }

    // ─── GENERATE ALERTS ─────────────────────────────────────────
    function generateAlerts() {
        alerts = [];
        if (!dataset || !dataset.skus) return;

        dataset.skus.forEach(sku => {
            const avgD = sku.weeklyHistory.reduce((s, v) => s + v, 0) / sku.weeklyHistory.length;
            const dailyD = avgD / 7;
            const daysOfSupply = dailyD > 0 ? sku.currentStock / dailyD : 99;
            const demandStd = Math.sqrt(sku.weeklyHistory.reduce((s, v) => s + (v - avgD) ** 2, 0) / sku.weeklyHistory.length);
            const cv = demandStd / (avgD || 1);
            const ltWeeks = sku.leadTimeDays / 7;
            const ltDemand = avgD * ltWeeks;
            const safetyStock = 1.65 * demandStd * Math.sqrt(ltWeeks);
            const rop = ltDemand + safetyStock;
            const z = ltDemand > 0 ? (sku.currentStock - ltDemand) / (demandStd * Math.sqrt(ltWeeks) || 1) : 5;
            const stockoutProb = Math.max(0, Math.min(1, 0.5 * (1 - erf(z / Math.sqrt(2)))));

            sku._riskMeta = { avgD, dailyD, daysOfSupply, cv, rop, safetyStock, stockoutProb };

            // Stockout alert
            if (stockoutProb > 0.3) {
                alerts.push({
                    id: ++alertIdCounter, type: 'STOCKOUT_RISK', severity: stockoutProb > 0.6 ? 'critical' : stockoutProb > 0.45 ? 'high' : 'medium',
                    sku: sku.id, skuName: sku.name, store: sku.location, supplier: sku.supplier,
                    message: `${sku.name} at ${sku.location} — ${(stockoutProb * 100).toFixed(0)}% stockout probability. ${daysOfSupply.toFixed(0)} days of supply, need ${Math.round(rop - sku.currentStock)} units.`,
                    metric: stockoutProb, ts: Date.now(), status: 'active', thread: []
                });
            }

            // Demand volatility
            if (cv > 0.45) {
                alerts.push({
                    id: ++alertIdCounter, type: 'DEMAND_VOLATILITY', severity: cv > 0.7 ? 'high' : 'medium',
                    sku: sku.id, skuName: sku.name, store: sku.location, supplier: sku.supplier,
                    message: `${sku.name} at ${sku.location} — CV ${(cv * 100).toFixed(0)}% indicates erratic demand. Safety stock needs ${Math.round(safetyStock)} units.`,
                    metric: cv, ts: Date.now(), status: 'active', thread: []
                });
            }

            // Excess inventory
            if (daysOfSupply > 45) {
                alerts.push({
                    id: ++alertIdCounter, type: 'EXCESS_INVENTORY', severity: daysOfSupply > 90 ? 'medium' : 'low',
                    sku: sku.id, skuName: sku.name, store: sku.location, supplier: sku.supplier,
                    message: `${sku.name} at ${sku.location} — ${daysOfSupply.toFixed(0)} days of supply. ₹${(sku.currentStock * sku.holdingCostPerUnit).toLocaleString()} holding cost/week overhang.`,
                    metric: daysOfSupply, ts: Date.now(), status: 'active', thread: []
                });
            }
        });

        alerts.sort((a, b) => {
            const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            return (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3);
        });
    }

    function erf(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);
        const t = 1 / (1 + p * x);
        const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return sign * y;
    }

    // ─── RENDER HEATMAP ──────────────────────────────────────────
    function renderHeatmap() {
        const container = document.getElementById('riskHeatmap');
        if (!container || !dataset) return;

        const stores = [...new Set(dataset.skus.map(s => s.location))];
        // Pick top 20 riskiest SKUs
        const skuRisks = dataset.skus.map(s => ({ sku: s, prob: s._riskMeta?.stockoutProb || 0 }))
            .sort((a, b) => b.prob - a.prob).slice(0, 20);

        const cols = stores.length + 1;
        container.style.gridTemplateColumns = `140px repeat(${stores.length}, 1fr)`;

        let html = '<div class="hm-cell hm-header">SKU</div>';
        stores.forEach(s => html += `<div class="hm-cell hm-header">${s.slice(0, 4)}</div>`);

        skuRisks.forEach(({ sku }) => {
            html += `<div class="hm-cell hm-sku" title="${sku.name}">${sku.id}</div>`;
            stores.forEach(store => {
                const match = dataset.skus.find(s => s.id === sku.id && s.location === store);
                if (match && match._riskMeta) {
                    const p = match._riskMeta.stockoutProb;
                    const bg = p > 0.6 ? 'rgba(239,68,68,.7)' : p > 0.4 ? 'rgba(249,115,22,.6)' : p > 0.2 ? 'rgba(234,179,8,.4)' : p > 0.05 ? 'rgba(34,197,94,.25)' : 'rgba(34,197,94,.1)';
                    html += `<div class="hm-cell" style="background:${bg}" title="${sku.name} @ ${store}: ${(p * 100).toFixed(0)}%" onclick="selectSKU('${sku.id}','${store}')">${(p * 100).toFixed(0)}%</div>`;
                } else {
                    html += `<div class="hm-cell" style="background:rgba(100,116,139,.1)">—</div>`;
                }
            });
        });

        container.innerHTML = html;
    }

    // ─── RENDER ALERT FEED ───────────────────────────────────────
    function renderAlertFeed() {
        const container = document.getElementById('alertFeed');
        const countEl = document.getElementById('alertFeedCount');
        const activeAlerts = alerts.filter(a => a.status === 'active');
        if (countEl) countEl.textContent = `${activeAlerts.length} active`;

        const liveCount = document.getElementById('liveAlertCount');
        if (liveCount) liveCount.textContent = activeAlerts.length;

        let html = '';
        activeAlerts.slice(0, 40).forEach(a => {
            const sevColors = { critical: 'var(--red)', high: 'var(--orange)', medium: 'var(--yellow)', low: 'var(--green)' };
            const typeIcons = { STOCKOUT_RISK: '🚨', DEMAND_VOLATILITY: '📊', EXCESS_INVENTORY: '📦' };
            html += `
            <div class="a-card ${a.severity}" data-id="${a.id}" onclick="toggleAlert(${a.id})">
                <div class="a-top">
                    <div class="a-type">${typeIcons[a.type] || '⚠️'} ${a.type.replace(/_/g, ' ')}</div>
                    <span class="a-sev" style="background:${sevColors[a.severity]};color:#000">${a.severity}</span>
                </div>
                <div class="a-body">${a.message}</div>
                <div class="a-meta">
                    <span>📍 ${a.store}</span>
                    <span>📦 ${a.sku}</span>
                    <span>🏭 ${a.supplier}</span>
                    <span>🕐 ${new Date(a.ts).toLocaleTimeString()}</span>
                </div>
                <div class="a-actions">
                    <button class="a-btn primary" onclick="event.stopPropagation();acknowledgeAlert(${a.id})">Acknowledge</button>
                    <button class="a-btn success" onclick="event.stopPropagation();resolveAlert(${a.id})">Resolve</button>
                    <button class="a-btn" onclick="event.stopPropagation();escalateAlert(${a.id})">Escalate ↑</button>
                </div>
                <div class="a-thread">
                    ${a.thread.map(t => `<div class="thread-item"><strong>${t.user}:</strong> ${t.text} <span style="color:var(--t3);font-size:10px;">${new Date(t.ts).toLocaleTimeString()}</span></div>`).join('')}
                    <textarea class="thread-input" placeholder="Add follow-up note..." rows="1" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();addToThread(${a.id},this)}"></textarea>
                </div>
            </div>`;
        });
        container.innerHTML = html || '<div style="color:var(--t3);text-align:center;padding:40px">✅ No active alerts</div>';
    }

    // ─── ALERT ACTIONS ───────────────────────────────────────────
    window.toggleAlert = function (id) {
        const card = document.querySelector(`.a-card[data-id="${id}"]`);
        if (card) card.classList.toggle('expanded');
    };

    window.acknowledgeAlert = function (id) {
        const a = alerts.find(x => x.id === id);
        if (a) {
            a.thread.push({ user: 'Planner', text: 'Acknowledged — reviewing options', ts: Date.now() });
            renderAlertFeed();
            if (window.crossPageSync) window.crossPageSync.broadcast('ALERT_ACKNOWLEDGED', { alertId: id, sku: a.sku, store: a.store });
        }
    };

    window.resolveAlert = function (id) {
        const a = alerts.find(x => x.id === id);
        if (a) {
            a.status = 'resolved';
            a.resolvedAt = Date.now();
            a.thread.push({ user: 'System', text: 'Alert resolved', ts: Date.now() });
            renderAlertFeed();
            updateKPIs();
            if (window.crossPageSync) window.crossPageSync.broadcast('ALERT_RESOLVED', { alertId: id, sku: a.sku, store: a.store });
        }
    };

    window.escalateAlert = function (id) {
        const a = alerts.find(x => x.id === id);
        if (a) {
            const prev = a.severity;
            const escalation = { low: 'medium', medium: 'high', high: 'critical' };
            a.severity = escalation[a.severity] || 'critical';
            a.thread.push({ user: 'System', text: `Escalated: ${prev} → ${a.severity}`, ts: Date.now() });
            alerts.sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 }[a.severity] || 3) - ({ critical: 0, high: 1, medium: 2, low: 3 }[b.severity] || 3));
            renderAlertFeed();
        }
    };

    window.addToThread = function (id, textarea) {
        const a = alerts.find(x => x.id === id);
        if (a && textarea.value.trim()) {
            a.thread.push({ user: 'Planner', text: textarea.value.trim(), ts: Date.now() });
            textarea.value = '';
            renderAlertFeed();
        }
    };

    window.selectSKU = function (skuId, store) {
        if (window.crossPageSync) window.crossPageSync.broadcast('SKU_SELECTED', { skuId, store });
        // Highlight matching alerts
        const feed = document.getElementById('alertFeed');
        if (feed) {
            feed.querySelectorAll('.a-card').forEach(c => c.style.outline = 'none');
            feed.querySelectorAll(`.a-card`).forEach(c => {
                const id = parseInt(c.dataset.id);
                const a = alerts.find(x => x.id === id);
                if (a && a.sku === skuId) c.style.outline = '2px solid var(--cyan)';
            });
        }
    };

    // ─── RENDER SUPPLIER CARDS ───────────────────────────────────
    function renderSupplierCards() {
        const container = document.getElementById('supplierCards');
        if (!container || !dataset || !dataset.supplierPerformance) return;

        let html = '';
        Object.entries(dataset.supplierPerformance).forEach(([name, sup]) => {
            const trendColors = { improving: 'var(--green)', stable: 'var(--blue)', declining: 'var(--red)' };
            const trendSymbols = { improving: '↑', stable: '→', declining: '↓' };
            html += `
            <div class="sup-card">
                <div class="sup-header">
                    <span class="sup-name">${name}</span>
                    <span class="sup-badge" style="background:${trendColors[sup.reliabilityTrend]};color:#000">${trendSymbols[sup.reliabilityTrend]} ${sup.reliabilityTrend}</span>
                </div>
                <div class="sup-metrics">
                    <div class="sup-metric"><div class="sm-val" style="color:${sup.fillRate >= 0.95 ? 'var(--green)' : sup.fillRate >= 0.90 ? 'var(--yellow)' : 'var(--red)'}">${(sup.fillRate * 100).toFixed(0)}%</div><div class="sm-label">Fill Rate</div></div>
                    <div class="sup-metric"><div class="sm-val">${sup.leadTimeMean}d</div><div class="sm-label">Avg Lead Time</div></div>
                </div>
                <div class="sup-history">
                    ${(sup.deliveryHistory || []).map(d => `<div class="sup-bar" style="height:${d.onTime ? 100 : 40}%;background:${d.onTime ? 'var(--green)' : 'var(--red)'}" title="Week -${d.weekAgo}: ${d.onTime ? 'On-Time' : 'Late'} (${d.actualLeadTime}d)"></div>`).join('')}
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    // ─── RENDER FLAGGED SKUs ─────────────────────────────────────
    function renderFlaggedSKUs() {
        const container = document.getElementById('flaggedSkusPanel');
        if (!container || !dataset || !dataset.skus) return;

        const flaggedIds = JSON.parse(localStorage.getItem('inv_flagged') || '[]');
        if (flaggedIds.length === 0) {
            container.innerHTML = '<div style="padding:10px;text-align:center;background:var(--bg-card);border:1px dashed var(--border);border-radius:8px">No flagged SKUs</div>';
            return;
        }

        const flaggedSkus = dataset.skus.filter(s => flaggedIds.includes(s.id));
        let html = '';
        flaggedSkus.forEach(sku => {
            const avgD = sku.weeklyHistory.reduce((a, b) => a + b, 0) / sku.weeklyHistory.length;
            const daysSupply = sku.currentStock / (avgD / 7 || 1);
            html += `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-left:3px solid var(--purple);padding:10px;border-radius:8px;margin-bottom:8px;cursor:pointer" onclick="selectSKU('${sku.id}','${sku.location}')">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <strong style="color:var(--text-primary);font-size:11px">${sku.name}</strong>
                    <span style="font-size:9px;color:var(--text-muted);font-family:'JetBrains Mono'">${sku.id}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-secondary);font-family:'JetBrains Mono'">
                    <span>📍 ${sku.location}</span>
                    <span style="color:${daysSupply < 14 ? 'var(--red)' : daysSupply < 30 ? 'var(--orange)' : 'var(--green)'}">${daysSupply.toFixed(0)}d supply</span>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    // ─── UPDATE KPIs ─────────────────────────────────────────────
    function updateKPIs() {
        const active = alerts.filter(a => a.status === 'active');
        const critical = active.filter(a => a.severity === 'critical');
        const resolved = alerts.filter(a => a.status === 'resolved');
        const avgRes = resolved.length > 0 ? resolved.reduce((s, a) => s + (a.resolvedAt - a.ts), 0) / resolved.length / 1000 : 0;

        const elCritical = document.getElementById('statCriticalAlerts');
        if (elCritical) elCritical.textContent = active.length; // The UI says "Active Alerts"


        // Supplier issues
        const supIssues = dataset?.supplierPerformance ? Object.values(dataset.supplierPerformance).filter(s => s.fillRate < 0.93).length : 0;
        const elSup = document.getElementById('statSupplierIssues');
        if (elSup) elSup.textContent = supIssues;

        // Alert analytics
        const analyticsContainer = document.getElementById('alertAnalytics');
        if (analyticsContainer) {
            const types = {};
            alerts.forEach(a => types[a.type] = (types[a.type] || 0) + 1);
            let html = '';
            html += `<div class="analytics-card"><div class="an-label">Resolution Rate</div><div class="an-val" style="color:var(--green)">${alerts.length > 0 ? ((resolved.length / alerts.length) * 100).toFixed(0) : 0}%</div></div>`;
            Object.entries(types).forEach(([type, count]) => {
                html += `<div class="analytics-card"><div class="an-label">${type.replace(/_/g, ' ')}</div><div class="an-val">${count}</div></div>`;
            });
            analyticsContainer.innerHTML = html;
        }
    }

    // ─── ALERT TREND CHART ───────────────────────────────────────
    function renderTrendChart() {
        const ctx = document.getElementById('alertTrendChart')?.getContext('2d');
        if (!ctx) return;

        if (trendChart) trendChart.destroy();

        // Simulate hourly alert counts for the past 24 hours
        const hours = 24;
        const labels = Array.from({ length: hours }, (_, i) => `${(new Date().getHours() - hours + i + 24) % 24}:00`);
        const criticalData = Array.from({ length: hours }, () => Math.floor(Math.random() * 8 + 2));
        const highData = Array.from({ length: hours }, () => Math.floor(Math.random() * 12 + 3));
        const mediumData = Array.from({ length: hours }, () => Math.floor(Math.random() * 15 + 5));

        trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Critical', data: criticalData, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.15)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
                    { label: 'High', data: highData, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
                    { label: 'Medium', data: mediumData, borderColor: '#eab308', backgroundColor: 'rgba(234,179,8,.08)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: { size: 10 } } },
                    title: { display: true, text: 'Alert Trend (24h)', color: '#f1f5f9', font: { size: 12 } }
                },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(42,48,80,.4)' } },
                    y: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(42,48,80,.4)' } }
                }
            }
        });
    }

    // ─── LIVE API DATA ───────────────────────────────────────────
    async function fetchLiveSignals() {
        const api = window.apiService;
        if (!api) {
            console.warn('[RiskDash] API Service not found. Live signals disabled.');
            document.getElementById('signalBoard').innerHTML = '<div class="signal-item"><span>API Service Offline</span></div>';
            return;
        }

        try {
            const signals = await api.getSupplyChainSignals();

            // Signal board
            const board = document.getElementById('signalBoard');
            if (board) {
                let chipHtml = '';
                chipHtml += `<div class="signal-item"><span>🏦 USD/INR</span><span class="signal-val">₹${signals.usdToINR}</span></div>`;
                chipHtml += `<div class="signal-item"><span>📈 India CPI</span><span class="signal-val">${signals.indiaCPIInflation?.toFixed(1) || '—'}%</span></div>`;
                if (signals.nextHoliday) {
                    const color = signals.nextHoliday.daysUntil < 7 ? 'var(--critical)' : 'var(--elevated)';
                    chipHtml += `<div class="signal-item"><span>📅 ${signals.nextHoliday.name}</span><span class="signal-val" style="color:${color}">${signals.nextHoliday.daysUntil}d</span></div>`;
                }
                chipHtml += `<div class="signal-item"><span>🌐 External Feeds</span><span class="signal-val" style="color:var(--success)">Connected</span></div>`;
                board.innerHTML = chipHtml;
            }
        } catch (e) {
            console.warn('[RiskDash] Live signals error:', e);
            const board = document.getElementById('signalBoard');
            if (board) board.innerHTML = '<div class="signal-item"><span>Feed Error</span></div>';
        }

        // Weather for Chennai
        try {
            const today = new Date();
            const start = new Date(today - 5 * 86400000).toISOString().split('T')[0];
            const end = today.toISOString().split('T')[0];
            const weather = await api.getWeather(13.08, 80.27, start, end);
            const strip = document.getElementById('weatherStrip');

            if (weather && weather.daily && strip) {
                let wxHtml = '';
                weather.daily.time.slice(-5).forEach((date, i) => {
                    const tMax = weather.daily.temperature_2m_max[weather.daily.time.indexOf(date)] || '—';
                    const rain = weather.daily.precipitation_sum[weather.daily.time.indexOf(date)] || 0;
                    wxHtml += `
                    <div class="signal-item">
                        <span style="color:var(--text-secondary)">${new Date(date).toLocaleDateString('en', { weekday: 'short' })}</span>
                        <span style="font-weight:600">${Math.round(tMax)}°C</span>
                        <span style="color:${rain > 0 ? 'var(--info)' : 'var(--text-muted)'}">${rain > 0 ? `🌧 ${rain.toFixed(1)}mm` : '☀️ 0mm'}</span>
                    </div>`;
                });
                strip.innerHTML = wxHtml;
            } else if (strip) {
                strip.innerHTML = '<div class="signal-item"><span>Weather Unavailable</span></div>';
            }
        } catch (e) {
            console.warn('[RiskDash] Weather error:', e);
            const strip = document.getElementById('weatherStrip');
            if (strip) strip.innerHTML = '<div class="signal-item"><span>Weather API Error</span></div>';
        }
    }

    // ─── CROSS-PAGE SYNC HANDLERS ────────────────────────────────
    if (window.crossPageSync) {
        window.crossPageSync.on('SKU_SELECTED', (payload) => {
            if (payload.skuId) window.selectSKU(payload.skuId, payload.store);
        });
        window.crossPageSync.on('ALERT_RESOLVED', (payload) => {
            if (payload.alertId) window.resolveAlert(payload.alertId);
        });
        window.crossPageSync.on('REPLENISHMENT_APPROVED', (payload) => {
            // Auto-resolve related stockout alerts
            alerts.filter(a => a.sku === payload.sku && a.type === 'STOCKOUT_RISK' && a.status === 'active').forEach(a => {
                a.status = 'resolved';
                a.resolvedAt = Date.now();
                a.thread.push({ user: 'System', text: `Auto-resolved: replenishment approved (${payload.qty} units)`, ts: Date.now() });
            });
            renderAlertFeed();
            updateKPIs();
        });
    }

    // ─── INIT ────────────────────────────────────────────────────
    await loadData();
    generateAlerts();
    renderHeatmap();
    renderAlertFeed();
    renderSupplierCards();
    renderFlaggedSKUs();
    updateKPIs();
    renderTrendChart();
    fetchLiveSignals();

    // Auto-refresh signals every 5 minutes
    setInterval(fetchLiveSignals, 300000);

    // Watch for localStorage changes from Inventory Forecast tab
    window.addEventListener('storage', (e) => {
        if (e.key === 'inv_flagged') renderFlaggedSKUs();
    });

    console.log('[RiskDash] ✅ Risk & Alerts Dashboard ready');
})();
