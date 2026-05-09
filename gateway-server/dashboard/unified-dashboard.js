/**
 * ═══════════════════════════════════════════════════════════════════
 *  UNIFIED DASHBOARD JS — Forecast Spine + Routing Map + Action Panel
 *  All zones update synchronously via EventBus.
 * ═══════════════════════════════════════════════════════════════════
 */

/* ── Globals ────────────────────────────────────────────────────── */
let DATA = null;
let forecastChart = null;
let financialChart = null;
let routingMap = null;
let storeMarkers = {};
let routingLines = [];
let transferLines = [];

/* ── Store Network (Indian cities with coords) ──────────────────── */
const STORE_COORDS = {
    'Chennai': { lat: 13.0827, lng: 80.2707 },
    'Mumbai': { lat: 19.0760, lng: 72.8777 },
    'Delhi': { lat: 28.7041, lng: 77.1025 },
    'Bangalore': { lat: 12.9716, lng: 77.5946 },
    'Hyderabad': { lat: 17.3850, lng: 78.4867 },
    'Kolkata': { lat: 22.5726, lng: 88.3639 },
    'Pune': { lat: 18.5204, lng: 73.8567 },
    'Ahmedabad': { lat: 23.0225, lng: 72.5714 }
};

const WAREHOUSE_COORDS = {
    'WH-Chennai': { lat: 13.15, lng: 80.20, name: 'Chennai Central Warehouse', capacity: 50000 },
    'WH-Mumbai': { lat: 19.15, lng: 72.95, name: 'Mumbai Distribution Center', capacity: 80000 },
    'WH-Delhi': { lat: 28.55, lng: 77.20, name: 'Delhi NCR Warehouse', capacity: 70000 },
    'WH-Bangalore': { lat: 13.05, lng: 77.50, name: 'Bangalore Logistics Hub', capacity: 45000 }
};

const SUPPLIER_COORDS = {
    'SUP-A': { lat: 11.00, lng: 77.00, name: 'TamilNadu Manufacturers', families: ['FMCG', 'FOOD'], fillRate: 0.94, leadTimeMean: 3, leadTimeStd: 1.2 },
    'SUP-B': { lat: 21.17, lng: 72.83, name: 'Gujarat Industrial Corp', families: ['HOME', 'AUTO'], fillRate: 0.97, leadTimeMean: 5, leadTimeStd: 0.8 },
    'SUP-C': { lat: 28.60, lng: 77.40, name: 'NCR Electronics Ltd', families: ['ELEC', 'SPORTS'], fillRate: 0.91, leadTimeMean: 4, leadTimeStd: 1.5 },
    'SUP-D': { lat: 18.60, lng: 73.90, name: 'Pune Pharma & Fashion', families: ['PHARMA', 'FASHION'], fillRate: 0.96, leadTimeMean: 6, leadTimeStd: 0.6 }
};

// Inter-store transfer cost matrix (approx INR per unit based on distance)
const TRANSFER_COSTS = {};
Object.keys(STORE_COORDS).forEach(a => {
    TRANSFER_COSTS[a] = {};
    Object.keys(STORE_COORDS).forEach(b => {
        if (a === b) { TRANSFER_COSTS[a][b] = 0; return; }
        const d = haversine(STORE_COORDS[a].lat, STORE_COORDS[a].lng, STORE_COORDS[b].lat, STORE_COORDS[b].lng);
        TRANSFER_COSTS[a][b] = Math.round(d * 0.05 + 10); // ₹ per unit
    });
});

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Boot ────────────────────────────────────────────────────────── */
async function boot() {
    console.log('[UnifiedDashboard] Booting...');
    try {
        const resp = await fetch('inventory-data.json');
        DATA = await resp.json();
    } catch (e) {
        console.error('Failed to load inventory data:', e);
        return;
    }

    populateSelectors();
    initMap();
    initEventSubscriptions();

    // Select first SKU and store
    const firstSKU = DATA.skus[0];
    const firstStore = DATA.metadata.locations[0];
    selectSKU(firstSKU.id);
    selectStore(firstStore);

    // Generate initial alerts
    generateInitialAlerts();

    // Render everything
    renderAll();
    renderRiskHeatmap();
    renderAlertFeed();
    renderAlertAnalytics();
    renderFinancialView();

    console.log('[UnifiedDashboard] ✅ Ready — ' + DATA.skus.length + ' SKUs, ' + DATA.metadata.locations.length + ' stores');
}

/* ── Selectors ───────────────────────────────────────────────────── */
function populateSelectors() {
    const skuSel = document.getElementById('skuSelector');
    const storeSel = document.getElementById('storeSelector');

    skuSel.innerHTML = DATA.skus.map(s =>
        `<option value="${s.id}">${s.id} — ${s.name}</option>`
    ).join('');

    storeSel.innerHTML = DATA.metadata.locations.map(l =>
        `<option value="${l}">${l}</option>`
    ).join('');
}

function onSKUChange(skuId) {
    selectSKU(skuId);
    renderAll();
}
function onStoreChange(storeId) {
    selectStore(storeId);
    renderAll();
    highlightStoreOnMap(storeId);
}

/* ── View Switching ──────────────────────────────────────────────── */
function switchView(view) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.nav-tab[data-view="${view}"]`).classList.add('active');

    document.getElementById('unifiedView').classList.toggle('active', view === 'unified');
    document.getElementById('riskView').classList.toggle('active', view === 'risk');
    document.getElementById('financialView').classList.toggle('active', view === 'financial');

    if (view === 'unified' && routingMap) setTimeout(() => routingMap.invalidateSize(), 100);
    if (view === 'financial') renderFinancialView();
}
window.switchView = switchView;

/* ── Event Subscriptions ─────────────────────────────────────────── */
function initEventSubscriptions() {
    bus.on(EVT.FORECAST_UPDATED, () => {
        renderForecastSpine();
        updateAlertBadge();
    });
    bus.on(EVT.ALERT_FIRED, () => {
        updateAlertBadge();
        renderAlertFeed();
    });
    bus.on(EVT.ALERT_ACKNOWLEDGED, (alert) => {
        renderAlertFeed();
        // Auto-highlight affected store on map
        if (alert.store) highlightStoreOnMap(alert.store);
        // Generate routing recommendation
        generateRoutingRecommendation(alert);
    });
    bus.on(EVT.REPLENISHMENT_APPROVED, () => {
        renderDecisionLog();
        renderFinancialView();
        updateMapRoutes();
    });
    bus.on(EVT.TRANSFER_APPROVED, (decision) => {
        renderDecisionLog();
        renderFinancialView();
        drawTransferArrow(decision.fromStore, decision.toStore);
        // Auto-resolve related alert
        const relatedAlert = SystemState.activeAlerts.find(a =>
            a.skuId === decision.skuId && a.store === decision.toStore && a.type === 'stockout_imminent'
        );
        if (relatedAlert) resolveAlert(relatedAlert.id, 'Transfer approved — stockout prevented', 'System');
    });
    bus.on(EVT.FINANCIAL_RECALCULATED, () => renderFinancialView());
    bus.on(EVT.REGIME_CHANGE_DETECTED, (data) => {
        console.log('[REGIME CHANGE]', data);
        // Widen forecast bands, flag affected SKUs
    });
}

/* ══════════════════════════════════════════════════════════════════
   ZONE 1: FORECAST SPINE
   ══════════════════════════════════════════════════════════════════ */
function renderForecastSpine() {
    const sku = DATA.skus.find(s => s.id === SystemState.selectedSKU);
    if (!sku) return;

    const hist = sku.weeklyHistory || [];
    const last8 = hist.slice(-8);

    // Generate 16-day forecast from weekly data
    const avgD = hist.reduce((a, b) => a + b, 0) / hist.length;
    const stdD = Math.sqrt(hist.map(v => (v - avgD) ** 2).reduce((a, b) => a + b, 0) / hist.length);

    // Build daily series
    const forecastDays = 16;
    const p50 = [], p10 = [], p90 = [];
    for (let d = 0; d < forecastDays; d++) {
        const weekIdx = Math.floor(d / 7);
        const seasonal = 1 + 0.1 * Math.sin((d + new Date().getDay()) * Math.PI / 3.5);
        const base = (avgD / 7) * seasonal;
        const noise = stdD / 7;
        p50.push(Math.round(base * 100) / 100);
        p10.push(Math.round((base - 1.28 * noise) * 100) / 100);
        p90.push(Math.round((base + 1.28 * noise) * 100) / 100);
    }

    // Generate history labels & forecast labels
    const histLabels = last8.map((_, i) => `W-${8 - i}`);
    const todayLabel = ['Today'];
    const forecastLabels = Array.from({ length: forecastDays }, (_, i) => `D+${i + 1}`);
    const allLabels = [...histLabels, ...todayLabel, ...forecastLabels];

    // Combine data
    const histDaily = last8.map(w => Math.round(w / 7 * 100) / 100);
    const todayVal = histDaily[histDaily.length - 1] || avgD / 7;

    // Datasets
    const histData = [...histDaily, todayVal, ...Array(forecastDays).fill(null)];
    const p50Data = [...Array(histDaily.length).fill(null), todayVal, ...p50];
    const p10Data = [...Array(histDaily.length).fill(null), null, ...p10];
    const p90Data = [...Array(histDaily.length).fill(null), null, ...p90];

    const ctx = document.getElementById('forecastSpineChart').getContext('2d');
    if (forecastChart) forecastChart.destroy();

    forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Actual Demand',
                    data: histData,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,0.1)',
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: '#22c55e',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Forecast P50',
                    data: p50Data,
                    borderColor: '#3b82f6',
                    borderWidth: 2.5,
                    borderDash: [5, 3],
                    pointRadius: 2,
                    pointBackgroundColor: '#3b82f6',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'P90 (Upper)',
                    data: p90Data,
                    borderColor: 'rgba(59,130,246,0.3)',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: '+1',
                    tension: 0.3
                },
                {
                    label: 'P10 (Lower)',
                    data: p10Data,
                    borderColor: 'rgba(59,130,246,0.3)',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { color: '#94a3b8', font: { size: 10, family: 'Inter' }, boxWidth: 12 } },
                tooltip: {
                    backgroundColor: '#1a1f35',
                    borderColor: '#2a3050',
                    borderWidth: 1,
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    titleFont: { family: 'Inter', size: 12 },
                    bodyFont: { family: 'Inter', size: 11 }
                },
                annotation: {
                    annotations: {
                        todayLine: {
                            type: 'line',
                            xMin: histLabels.length,
                            xMax: histLabels.length,
                            borderColor: '#f97316',
                            borderWidth: 2,
                            borderDash: [4, 4],
                            label: { display: true, content: 'TODAY', color: '#f97316', font: { size: 9 } }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(42,48,80,0.3)' },
                    ticks: { color: '#64748b', font: { size: 10, family: 'Inter' } }
                },
                y: {
                    grid: { color: 'rgba(42,48,80,0.3)' },
                    ticks: { color: '#64748b', font: { size: 10, family: 'Inter' } },
                    title: { display: true, text: 'Daily Units', color: '#64748b', font: { size: 10 } }
                }
            }
        }
    });

    // Update KPIs
    const pos = getInventoryPosition(sku, SystemState.selectedStore);
    if (pos) {
        setKPI('kpiStockout', pos.stockoutProb + '%', pos.stockoutProb > 75 ? 'danger' : pos.stockoutProb > 40 ? 'warning' : 'success');
        setKPI('kpiDaysSupply', pos.daysOfSupply + 'd', pos.daysOfSupply < 7 ? 'danger' : pos.daysOfSupply < 14 ? 'warning' : 'success');
        setKPI('kpiSafetyStock', pos.safetyStock + ' units', 'info');

        // Demand DNA
        const tier = pos.avgDemand > 200 ? 'A-Fast' : pos.avgDemand > 80 ? 'B-Medium' : 'C-Slow';
        setKPI('kpiDemandDNA', tier, 'success');
    }

    // Store forecast in SystemState
    SystemState.currentForecast = { P10: p10, P50: p50, P90: p90, dates: forecastLabels, history: histDaily };
}

function setKPI(id, value, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelector('.value').textContent = value;
    el.className = 'kpi-card ' + (cls || '');
}

/* ══════════════════════════════════════════════════════════════════
   ZONE 2: ROUTING MAP
   ══════════════════════════════════════════════════════════════════ */
function initMap() {
    routingMap = L.map('routingMap', {
        center: [20.5, 78.9],
        zoom: 5,
        zoomControl: true,
        attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18
    }).addTo(routingMap);

    // Add store markers
    DATA.metadata.locations.forEach(store => {
        const coords = STORE_COORDS[store];
        if (!coords) return;

        const status = getStoreStatus(store);
        const color = status === 'critical' ? '#ef4444' : status === 'warning' ? '#eab308' : '#22c55e';

        const marker = L.circleMarker([coords.lat, coords.lng], {
            radius: 10,
            fillColor: color,
            color: '#fff',
            weight: 2,
            fillOpacity: 0.9,
            className: 'store-marker'
        }).addTo(routingMap);

        marker.bindPopup(createStorePopup(store, status));
        marker.on('click', () => {
            SystemState.selectedStore = store;
            document.getElementById('storeSelector').value = store;
            renderAll();
            highlightStoreOnMap(store);
        });

        storeMarkers[store] = marker;
    });

    // Add warehouse markers
    Object.entries(WAREHOUSE_COORDS).forEach(([id, wh]) => {
        L.circleMarker([wh.lat, wh.lng], {
            radius: 8,
            fillColor: '#3b82f6',
            color: '#fff',
            weight: 2,
            fillOpacity: 0.8
        }).addTo(routingMap)
            .bindPopup(`<strong>🏭 ${wh.name}</strong><br>Capacity: ${wh.capacity.toLocaleString()} units`);
    });

    // Add supplier markers
    Object.entries(SUPPLIER_COORDS).forEach(([id, sup]) => {
        const color = sup.fillRate < 0.9 ? '#eab308' : '#a855f7';
        L.circleMarker([sup.lat, sup.lng], {
            radius: 7,
            fillColor: color,
            color: '#fff',
            weight: 2,
            fillOpacity: 0.8
        }).addTo(routingMap)
            .bindPopup(`<strong>💎 ${sup.name}</strong><br>Fill Rate: ${Math.round(sup.fillRate * 100)}%<br>Lead Time: ${sup.leadTimeMean}±${sup.leadTimeStd}d<br>Families: ${sup.families.join(', ')}`);

        // Store in SystemState
        SystemState.supplierStatus[id] = { ...sup, id };
    });

    // Draw initial replenishment routes
    drawReplenishmentRoutes();
}

function getStoreStatus(store) {
    // Aggregate risk across SKUs for this store
    let critCount = 0, warnCount = 0;
    for (const sku of DATA.skus.slice(0, 30)) {
        const pos = getInventoryPosition(sku, store);
        if (pos.stockoutProb > 75) critCount++;
        else if (pos.stockoutProb > 40) warnCount++;
    }
    if (critCount >= 3) return 'critical';
    if (critCount >= 1 || warnCount >= 5) return 'warning';
    return 'healthy';
}

function createStorePopup(store, status) {
    const statusLabel = { critical: '🔴 Critical', warning: '🟡 Warning', healthy: '🟢 Healthy' }[status];
    let critSKUs = 0, totalStock = 0;
    for (const sku of DATA.skus.slice(0, 30)) {
        const pos = getInventoryPosition(sku, store);
        totalStock += pos.currentStock;
        if (pos.stockoutProb > 75) critSKUs++;
    }
    return `<strong>🏪 Store: ${store}</strong><br>Status: ${statusLabel}<br>Critical SKUs: ${critSKUs}<br>Total Stock: ${totalStock.toLocaleString()} units`;
}

function highlightStoreOnMap(store) {
    Object.entries(storeMarkers).forEach(([s, m]) => {
        const status = getStoreStatus(s);
        const color = status === 'critical' ? '#ef4444' : status === 'warning' ? '#eab308' : '#22c55e';
        m.setStyle({ radius: s === store ? 14 : 10, fillColor: color, weight: s === store ? 3 : 2 });
    });
}

function drawReplenishmentRoutes() {
    // Draw arrows from nearest warehouse to each store
    DATA.metadata.locations.forEach(store => {
        const sc = STORE_COORDS[store];
        if (!sc) return;
        // Find nearest warehouse
        let nearestWH = null, minDist = Infinity;
        Object.entries(WAREHOUSE_COORDS).forEach(([id, wh]) => {
            const d = haversine(sc.lat, sc.lng, wh.lat, wh.lng);
            if (d < minDist) { minDist = d; nearestWH = wh; }
        });
        if (nearestWH) {
            const line = L.polyline([[nearestWH.lat, nearestWH.lng], [sc.lat, sc.lng]], {
                color: '#3b82f680',
                weight: 1.5,
                dashArray: '8 4'
            }).addTo(routingMap);
            routingLines.push(line);
        }
    });
}

function drawTransferArrow(fromStore, toStore) {
    const from = STORE_COORDS[fromStore];
    const to = STORE_COORDS[toStore];
    if (!from || !to) return;

    const line = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
        color: '#f97316',
        weight: 3,
        dashArray: '10 6'
    }).addTo(routingMap);
    transferLines.push(line);

    // Animate pulse effect on destination marker
    const destMarker = storeMarkers[toStore];
    if (destMarker) {
        destMarker.setStyle({ radius: 16, weight: 3, color: '#f97316' });
        setTimeout(() => destMarker.setStyle({ radius: 12, weight: 2, color: '#fff' }), 3000);
    }
}

function updateMapRoutes() {
    // Refresh map marker colors based on current positions
    Object.entries(storeMarkers).forEach(([store, marker]) => {
        const status = getStoreStatus(store);
        const color = status === 'critical' ? '#ef4444' : status === 'warning' ? '#eab308' : '#22c55e';
        marker.setStyle({ fillColor: color });
    });
}

/* ══════════════════════════════════════════════════════════════════
   ZONE 3: ACTION PANEL
   ══════════════════════════════════════════════════════════════════ */
function renderActionPanel() {
    const sku = DATA.skus.find(s => s.id === SystemState.selectedSKU);
    const store = SystemState.selectedStore;
    if (!sku || !store) return;

    const pos = getInventoryPosition(sku, store);

    // Find supplier for this SKU
    const supplier = Object.values(SUPPLIER_COORDS).find(s => s.families.includes(sku.category));
    const supplierId = supplier ? Object.keys(SUPPLIER_COORDS).find(k => SUPPLIER_COORDS[k] === supplier) : 'SUP-A';

    // Find nearest warehouse
    const sc = STORE_COORDS[store];
    let nearestWH = null, nearestWHId = null;
    Object.entries(WAREHOUSE_COORDS).forEach(([id, wh]) => {
        const d = haversine(sc.lat, sc.lng, wh.lat, wh.lng);
        if (!nearestWH || d < haversine(sc.lat, sc.lng, nearestWH.lat, nearestWH.lng)) {
            nearestWH = wh; nearestWHId = id;
        }
    });

    // REPLENISHMENT SECTION
    const deliveryDays = supplier ? supplier.leadTimeMean : 5;
    const orderQty = pos.eoq;
    const expectedFillRate = supplier ? Math.round(supplier.fillRate * 100) : 95;
    const orderCost = Math.round(orderQty * (sku.unitCost || 100));

    document.getElementById('replenishmentBody').innerHTML = `
        <div style="margin-bottom:8px">
            <strong>${sku.name}</strong> at <strong>${store}</strong>
        </div>
        <div class="financial-row"><span class="label">Source Warehouse</span><span class="value">${nearestWH?.name || 'N/A'}</span></div>
        <div class="financial-row"><span class="label">Supplier</span><span class="value">${supplier?.name || 'N/A'}</span></div>
        <div class="financial-row"><span class="label">Expected Delivery</span><span class="value">${deliveryDays} days</span></div>
        <div class="financial-row"><span class="label">Order Quantity</span><span class="value">${orderQty} units</span></div>
        <div class="financial-row"><span class="label">Expected Fill Rate</span><span class="value" style="color:${expectedFillRate > 92 ? '#22c55e' : '#eab308'}">${expectedFillRate}%</span></div>
        <div class="financial-row"><span class="label">Order Cost</span><span class="value">${formatCurrency(orderCost)}</span></div>

        <div style="margin-top:12px;font-size:11px;color:var(--text-muted)">Alternative Routes:</div>
        <div class="route-option recommended">
            <div class="route-label">✅ Route A — ${nearestWH?.name || 'Primary Warehouse'}</div>
            <div class="route-detail">${deliveryDays} days • ${formatCurrency(orderCost)} • Fill rate ${expectedFillRate}%</div>
        </div>
        <div class="route-option">
            <div class="route-label">🔄 Route B — Direct from Supplier</div>
            <div class="route-detail">${deliveryDays + 2} days • ${formatCurrency(Math.round(orderCost * 1.15))} • Emergency</div>
        </div>

        <button class="btn-approve" onclick="handleApproveReplenishment('${sku.id}','${store}',${orderQty},'${nearestWHId}',${orderCost})">
            ✅ Approve Replenishment — ${orderQty} units
        </button>
    `;

    // CONTINGENCY SECTION
    const gapDays = pos.daysOfSupply < deliveryDays ? deliveryDays - pos.daysOfSupply : 0;
    if (gapDays > 0 && pos.stockoutProb > 40) {
        // Find stores with excess stock of this SKU
        const transferOptions = findTransferCandidates(sku, store);
        const lostRevenue = Math.round(gapDays * (pos.avgDemand / 7) * (sku.unitCost || 100) * 1.5);

        document.getElementById('contingencyBody').innerHTML = `
            <div style="color:var(--accent-red);font-weight:600;margin-bottom:8px">
                ⚠️ ${gapDays}-day stockout gap detected
            </div>
            <div class="financial-row"><span class="label">Stock runs out in</span><span class="value negative">${pos.daysOfSupply} days</span></div>
            <div class="financial-row"><span class="label">Replenishment arrives in</span><span class="value">${deliveryDays} days</span></div>
            <div class="financial-row"><span class="label">Gap Duration</span><span class="value negative">${gapDays} days</span></div>
            <div class="financial-row"><span class="label">Revenue at Risk</span><span class="value negative">${formatCurrency(lostRevenue)}</span></div>

            ${transferOptions.length > 0 ? `
                <div style="margin-top:10px;font-size:11px;color:var(--text-muted)">Transfer Options:</div>
                ${transferOptions.map((t, i) => `
                    <div class="route-option ${i === 0 ? 'recommended' : ''}">
                        <div class="route-label">${i === 0 ? '✅' : '🔄'} Transfer from ${t.fromStore}</div>
                        <div class="route-detail">${t.availableUnits} units available • ${t.transferDays}d transit • ${formatCurrency(t.cost)} cost</div>
                        <div class="route-detail">Adds ${t.daysOfSupplyGained} days of supply</div>
                    </div>
                `).join('')}
                <button class="btn-approve transfer" onclick="handleApproveTransfer('${sku.id}','${transferOptions[0]?.fromStore}','${store}',${transferOptions[0]?.transferQty},${transferOptions[0]?.cost})">
                    🔄 Approve Transfer — ${transferOptions[0]?.transferQty} units from ${transferOptions[0]?.fromStore}
                </button>
            ` : '<p style="color:var(--text-muted)">No suitable transfer candidates found</p>'}
        `;
    } else {
        document.getElementById('contingencyBody').innerHTML = `
            <div style="color:var(--accent-green)">✅ No stockout gap — replenishment arrives before depletion</div>
            <div class="financial-row"><span class="label">Stock covers</span><span class="value positive">${pos.daysOfSupply} days</span></div>
            <div class="financial-row"><span class="label">Next delivery in</span><span class="value">${deliveryDays} days</span></div>
        `;
    }

    // FINANCIAL SECTION
    const invValue = pos.inventoryValue;
    const optimalValue = pos.optimalStock * (sku.unitCost || 100);
    const capitalAtRisk = Math.max(0, invValue - optimalValue);
    const revenueAtRisk = pos.stockoutProb > 40 ? Math.round(pos.avgDemand * 2 * (sku.unitCost || 100) * 1.5 * (pos.stockoutProb / 100)) : 0;
    const netImpact = revenueAtRisk - orderCost;

    document.getElementById('financialBody').innerHTML = `
        <div class="financial-row"><span class="label">Current Inventory Value</span><span class="value">${formatCurrency(invValue)}</span></div>
        <div class="financial-row"><span class="label">Optimal Inventory Value</span><span class="value">${formatCurrency(optimalValue)}</span></div>
        <div class="financial-row"><span class="label">Capital at Risk (overstock)</span><span class="value ${capitalAtRisk > 0 ? 'negative' : 'positive'}">${formatCurrency(capitalAtRisk)}</span></div>
        <div class="financial-row"><span class="label">Revenue at Risk (stockout)</span><span class="value ${revenueAtRisk > 0 ? 'negative' : 'positive'}">${formatCurrency(revenueAtRisk)}</span></div>
        <hr style="border-color:var(--border);margin:8px 0">
        <div class="financial-row"><span class="label">Replenishment Cost</span><span class="value">${formatCurrency(orderCost)}</span></div>
        <div class="financial-row"><span class="label"><strong>Net Impact of Action</strong></span><span class="value ${netImpact > 0 ? 'positive' : 'negative'}"><strong>${formatCurrency(Math.abs(netImpact))} ${netImpact > 0 ? 'saved' : 'cost'}</strong></span></div>
    `;
}

function findTransferCandidates(sku, targetStore) {
    const candidates = [];
    for (const store of DATA.metadata.locations) {
        if (store === targetStore) continue;
        const pos = getInventoryPosition(sku, store);
        if (pos.stockRatio > 1.3 && pos.daysOfSupply > 21) {
            const excess = pos.excessUnits;
            const transferQty = Math.min(excess, Math.round(pos.avgDemand));
            const distance = haversine(
                STORE_COORDS[store]?.lat || 13, STORE_COORDS[store]?.lng || 80,
                STORE_COORDS[targetStore]?.lat || 13, STORE_COORDS[targetStore]?.lng || 80
            );
            const transferDays = Math.max(1, Math.round(distance / 500));
            const costPerUnit = TRANSFER_COSTS[store]?.[targetStore] || 50;
            const targetPos = getInventoryPosition(sku, targetStore);
            const dailyDemand = targetPos.avgDemand / 7;

            candidates.push({
                fromStore: store,
                availableUnits: excess,
                transferQty,
                transferDays,
                cost: transferQty * costPerUnit,
                daysOfSupplyGained: dailyDemand > 0 ? Math.round(transferQty / dailyDemand) : 0
            });
        }
    }
    return candidates.sort((a, b) => a.transferDays - b.transferDays).slice(0, 3);
}

/* ── Action Handlers ─────────────────────────────────────────────── */
window.handleApproveReplenishment = function (skuId, store, qty, whId, cost) {
    approveReplenishment({
        skuId, store, quantity: qty, warehouseId: whId, cost,
        planner: 'Planner',
        description: `Replenishment: ${qty} units of ${skuId} to ${store} from ${whId}`
    });
    showToast(`✅ Replenishment approved: ${qty} units → ${store}`);
    renderAll();
};

window.handleApproveTransfer = function (skuId, fromStore, toStore, qty, cost) {
    approveTransfer({
        skuId, fromStore, toStore, quantity: qty, cost,
        planner: 'Planner',
        description: `Transfer: ${qty} units of ${skuId} from ${fromStore} to ${toStore}`
    });
    showToast(`🔄 Transfer approved: ${qty} units ${fromStore} → ${toStore}`);
    renderAll();
};

function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:70px;right:24px;background:#1a1f35;border:1px solid #22c55e;color:#22c55e;padding:12px 20px;border-radius:8px;font-size:13px;font-family:Inter;z-index:9999;animation:fadeIn 0.3s;box-shadow:0 8px 32px rgba(0,0,0,0.5)';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

/* ══════════════════════════════════════════════════════════════════
   ZONE 4: DECISION LOG
   ══════════════════════════════════════════════════════════════════ */
function renderDecisionLog() {
    const container = document.getElementById('decisionLog');
    const actions = SystemState.plannerActions.slice(0, 10);

    if (actions.length === 0) {
        container.innerHTML = '<div class="decision-entry" style="opacity:0.5"><span class="de-desc">No decisions yet</span></div>';
        return;
    }

    const iconMap = {
        replenishment_approved: '📦',
        transfer_approved: '🔄',
        alert_acknowledged: '🔔',
        override_submitted: '⚙️',
        scenario_changed: '🎯'
    };

    container.innerHTML = actions.map(a => `
        <div class="decision-entry">
            <div class="de-header">
                <span class="de-icon">${iconMap[a.actionType] || '📋'}</span>
                <span class="de-time">${formatTime(a.timestamp)}</span>
            </div>
            <div class="de-desc">${a.description || a.actionType.replace(/_/g, ' ')}</div>
            <div class="de-outcome ${a.outcome ? 'success' : 'pending'}">${a.outcome || '⏳ Pending'}</div>
        </div>
    `).join('');
}

/* ══════════════════════════════════════════════════════════════════
   RISK & ALERTS DASHBOARD
   ══════════════════════════════════════════════════════════════════ */
function generateInitialAlerts() {
    const topSKUs = DATA.skus.slice(0, 40);
    for (const sku of topSKUs) {
        for (const store of DATA.metadata.locations) {
            const pos = getInventoryPosition(sku, store);

            if (pos.stockoutProb > 75) {
                fireAlert({
                    type: 'stockout_imminent', severity: pos.stockoutProb > 90 ? 'critical' : 'high',
                    skuId: sku.id, skuName: sku.name, store,
                    triggerValue: pos.stockoutProb, triggerUnit: '% stockout probability',
                    daysOfSupply: pos.daysOfSupply,
                    recommendation: `Place emergency replenishment order for ${pos.eoq} units today`,
                    icon: '🚨'
                });
            } else if (pos.stockRatio > 1.5 && pos.daysOfSupply > 42) {
                fireAlert({
                    type: 'overstock', severity: 'medium',
                    skuId: sku.id, skuName: sku.name, store,
                    triggerValue: Math.round(pos.stockRatio * 100), triggerUnit: '% of optimal',
                    recommendation: `Consider markdown or transfer of ${pos.excessUnits} units`,
                    icon: '📦'
                });
            }
        }
    }

    // Supplier alerts
    Object.entries(SUPPLIER_COORDS).forEach(([id, sup]) => {
        if (sup.fillRate < 0.93) {
            fireAlert({
                type: 'supplier_reliability', severity: 'high',
                supplierId: id, skuId: 'ALL', store: 'ALL',
                skuName: sup.name,
                triggerValue: Math.round(sup.fillRate * 100), triggerUnit: '% fill rate',
                recommendation: `Increase safety stock for all ${sup.families.join(', ')} SKUs from this supplier`,
                icon: '💎'
            });
        }
    });

    updateAlertBadge();
}

function renderRiskHeatmap() {
    const container = document.getElementById('riskHeatmap');
    const stores = DATA.metadata.locations;
    const skus = DATA.skus.slice(0, 20); // Top 20 for visibility

    container.style.setProperty('--store-count', stores.length);

    let html = '<div class="heatmap-cell heatmap-header">SKU</div>';
    stores.forEach(s => { html += `<div class="heatmap-cell heatmap-header">${s.slice(0, 6)}</div>`; });

    skus.forEach(sku => {
        html += `<div class="heatmap-cell heatmap-sku-label" title="${sku.name}">${sku.id.slice(0, 8)}</div>`;
        stores.forEach(store => {
            const pos = getInventoryPosition(sku, store);
            const risk = pos.stockoutProb;
            const color = risk > 80 ? '#ef4444' : risk > 60 ? '#f97316' : risk > 40 ? '#eab308' : risk > 20 ? '#22c55e80' : '#22c55e40';
            html += `<div class="heatmap-cell" style="background:${color}" title="${sku.name} @ ${store}: ${risk}% risk"
                      onclick="onSKUChange('${sku.id}');onStoreChange('${store}')">${risk}</div>`;
        });
    });

    container.innerHTML = html;
}

function renderAlertFeed() {
    const container = document.getElementById('alertFeed');
    const alerts = SystemState.activeAlerts.slice(0, 20);

    document.getElementById('alertCount').textContent = `${SystemState.activeAlerts.length} active`;

    if (alerts.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">✅ All clear — no active alerts</p>';
        return;
    }

    container.innerHTML = alerts.map(a => `
        <div class="alert-card ${a.severity}">
            <div class="alert-top">
                <span class="alert-type">${a.icon || '⚠️'} ${a.type.replace(/_/g, ' ').toUpperCase()}</span>
                <span class="alert-sev" style="background:${severityColor(a.severity)}20;color:${severityColor(a.severity)}">${a.severity}</span>
            </div>
            <div class="alert-body">
                <strong>${a.skuName || a.skuId}</strong> @ ${a.store}<br>
                Trigger: ${a.triggerValue}${a.triggerUnit}<br>
                ${a.daysOfSupply !== undefined ? `Days of supply: ${a.daysOfSupply}<br>` : ''}
                💡 ${a.recommendation}
            </div>
            <div class="alert-actions">
                <button class="alert-btn primary" onclick="handleAcknowledgeAlert('${a.id}')">Acknowledge</button>
                <button class="alert-btn" onclick="handleResolveAlert('${a.id}')">Resolve</button>
                <button class="alert-btn" onclick="onSKUChange('${a.skuId}');onStoreChange('${a.store}');switchView('unified')">View →</button>
            </div>
        </div>
    `).join('');
}

window.handleAcknowledgeAlert = function (alertId) {
    acknowledgeAlert(alertId, 'Planner');
    showToast('🔔 Alert acknowledged');
    renderAlertFeed();
};

window.handleResolveAlert = function (alertId) {
    resolveAlert(alertId, 'Manually resolved by planner', 'Planner');
    showToast('✅ Alert resolved');
    renderAlertFeed();
    updateAlertBadge();
};

function updateAlertBadge() {
    const badge = document.getElementById('alertBadge');
    const critCount = SystemState.activeAlerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;
    badge.textContent = critCount;
    badge.classList.toggle('show', critCount > 0);
}

function renderAlertAnalytics() {
    const container = document.getElementById('alertAnalytics');
    const all = [...SystemState.activeAlerts, ...SystemState.alertHistory];

    const byType = {};
    all.forEach(a => { byType[a.type] = (byType[a.type] || 0) + 1; });

    const resolved = SystemState.alertHistory.length;
    const active = SystemState.activeAlerts.length;
    const criticalCount = SystemState.activeAlerts.filter(a => a.severity === 'critical').length;

    container.innerHTML = `
        <div class="analytics-stat">
            <span class="as-label">Total Active Alerts</span>
            <span class="as-value" style="color:var(--accent-red)">${active}</span>
        </div>
        <div class="analytics-stat">
            <span class="as-label">Critical Alerts</span>
            <span class="as-value" style="color:var(--accent-orange)">${criticalCount}</span>
        </div>
        <div class="analytics-stat">
            <span class="as-label">Resolved (session)</span>
            <span class="as-value" style="color:var(--accent-green)">${resolved}</span>
        </div>
        <div class="analytics-stat">
            <span class="as-label">Resolution Rate</span>
            <span class="as-value" style="color:var(--accent-cyan)">${all.length > 0 ? Math.round(resolved / all.length * 100) : 0}%</span>
        </div>
        <div style="margin-top:12px;font-size:12px;font-weight:600">Alert Breakdown</div>
        ${Object.entries(byType).map(([type, count]) => `
            <div class="analytics-stat" style="padding:8px">
                <span class="as-label" style="font-size:10px">${type.replace(/_/g, ' ')}</span>
                <span class="as-value" style="font-size:16px">${count}</span>
            </div>
        `).join('')}
    `;
}

function generateRoutingRecommendation(alert) {
    if (alert.type !== 'stockout_imminent') return;
    const sku = DATA.skus.find(s => s.id === alert.skuId);
    if (!sku) return;
    // Routing panel auto-updates via renderAll
    renderActionPanel();
}

/* ══════════════════════════════════════════════════════════════════
   FINANCIAL DASHBOARD
   ══════════════════════════════════════════════════════════════════ */
function renderFinancialView() {
    let totalInv = 0, capitalAtRisk = 0, revenueAtRisk = 0, wcFreed = 0;

    const topSKUs = DATA.skus.slice(0, 40);
    for (const sku of topSKUs) {
        for (const store of DATA.metadata.locations) {
            const pos = getInventoryPosition(sku, store);
            totalInv += pos.inventoryValue;
            const optVal = pos.optimalStock * (sku.unitCost || 100);
            if (pos.inventoryValue > optVal) capitalAtRisk += pos.inventoryValue - optVal;
            if (pos.stockoutProb > 40) {
                revenueAtRisk += Math.round(pos.avgDemand * (sku.unitCost || 100) * 1.5 * (pos.stockoutProb / 100));
            }
        }
    }
    wcFreed = capitalAtRisk * 0.35; // Potential savings from optimization

    const routingROI = SystemState.routingDecisions.reduce((sum, d) => {
        return sum + (d.type === 'transfer' ? d.cost * -1 : 0) + (d.type === 'replenishment' ? d.cost * -0.5 : 0);
    }, 0);
    const netROI = Math.abs(revenueAtRisk * 0.6) - Math.abs(routingROI);

    document.getElementById('fkTotalInv').textContent = formatCurrency(totalInv);
    document.getElementById('fkCapRisk').textContent = formatCurrency(capitalAtRisk);
    document.getElementById('fkRevRisk').textContent = formatCurrency(revenueAtRisk);
    document.getElementById('fkWCFreed').textContent = formatCurrency(wcFreed);
    document.getElementById('fkNetROI').textContent = (netROI > 0 ? '+' : '') + formatCurrency(Math.abs(netROI));

    SystemState.financialSnapshot = { capitalAtRisk, revenueAtRisk, workingCapitalFreed: wcFreed, totalInventoryValue: totalInv };

    // Render routing recommendations ranked by ROI
    renderRoutingByROI();
    renderDecisionEconomics();
    renderFinancialChart();
}

function renderRoutingByROI() {
    const container = document.getElementById('finRoutingRank');
    const pending = SystemState.activeAlerts.filter(a => a.type === 'stockout_imminent' && a.status === 'active').slice(0, 8);

    if (pending.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:12px">No pending routing decisions</p>';
        return;
    }

    const ranked = pending.map(a => {
        const sku = DATA.skus.find(s => s.id === a.skuId);
        const pos = sku ? getInventoryPosition(sku, a.store) : null;
        const revAtRisk = pos ? Math.round(pos.avgDemand * (sku.unitCost || 100) * 1.5 * (pos.stockoutProb / 100)) : 0;
        const actionCost = pos ? Math.round(pos.eoq * (sku.unitCost || 100)) : 0;
        const roi = actionCost > 0 ? Math.round((revAtRisk / actionCost) * 100) / 100 : 0;
        return { ...a, revAtRisk, actionCost, roi, skuName: sku?.name || a.skuId };
    }).sort((a, b) => b.roi - a.roi);

    container.innerHTML = `
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">Ranked by ROI (Revenue Saved / Action Cost)</div>
        ${ranked.map((r, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--bg-card);border-radius:6px;margin-bottom:4px;font-size:11px;border:1px solid var(--border)">
                <span style="color:${i < 3 ? 'var(--accent-green)' : 'var(--text-secondary)'}">#${i + 1} ${r.skuName.slice(0, 20)} @ ${r.store}</span>
                <span style="font-weight:700;color:var(--accent-cyan)">${r.roi}x ROI</span>
            </div>
        `).join('')}
    `;
}

function renderDecisionEconomics() {
    const container = document.getElementById('decisionEconomics');
    const decisions = SystemState.routingDecisions.slice(0, 8);

    if (decisions.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:12px">Approve actions on the unified view to see decision economics here</p>';
        return;
    }

    container.innerHTML = decisions.map(d => `
        <div style="padding:8px;background:var(--bg-card);border-radius:8px;margin-bottom:6px;font-size:11px;border:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-weight:600">${d.type === 'transfer' ? '🔄' : '📦'} ${d.description?.slice(0, 40) || d.type}</span>
                <span style="color:var(--text-muted)">${formatTime(d.approvedAt)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:var(--text-secondary)">
                <span>Cost: ${formatCurrency(d.cost || 0)}</span>
                <span style="color:var(--accent-green)">Status: ${d.status}</span>
            </div>
        </div>
    `).join('');
}

function renderFinancialChart() {
    const ctx = document.getElementById('financialChart');
    if (!ctx) return;

    if (financialChart) financialChart.destroy();

    const categories = [...new Set(DATA.skus.slice(0, 40).map(s => s.category))];
    const catData = categories.map(cat => {
        let rev = 0, cap = 0;
        DATA.skus.filter(s => s.category === cat).forEach(sku => {
            DATA.metadata.locations.forEach(store => {
                const pos = getInventoryPosition(sku, store);
                if (pos.stockoutProb > 40) rev += pos.avgDemand * (sku.unitCost || 100) * 0.5;
                if (pos.stockRatio > 1.3) cap += pos.excessUnits * (sku.unitCost || 100);
            });
        });
        return { cat, rev: Math.round(rev), cap: Math.round(cap) };
    });

    financialChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: catData.map(c => c.cat),
            datasets: [
                {
                    label: 'Revenue at Risk',
                    data: catData.map(c => c.rev),
                    backgroundColor: 'rgba(239,68,68,0.6)',
                    borderColor: '#ef4444',
                    borderWidth: 1
                },
                {
                    label: 'Capital at Risk',
                    data: catData.map(c => c.cap),
                    backgroundColor: 'rgba(249,115,22,0.6)',
                    borderColor: '#f97316',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 10, family: 'Inter' } } }
            },
            scales: {
                x: { grid: { color: 'rgba(42,48,80,0.3)' }, ticks: { color: '#64748b', font: { size: 10 } } },
                y: { grid: { color: 'rgba(42,48,80,0.3)' }, ticks: { color: '#64748b', font: { size: 10 } } }
            }
        }
    });
}

/* ── Financial Handlers ──────────────────────────────────────────── */
window.onWCBudgetChange = function (val) {
    SystemState.financialSnapshot.workingCapitalBudget = parseInt(val);
    document.getElementById('wcBudgetVal').textContent = formatCurrency(parseInt(val));
    recalculateFinancials({ workingCapitalBudget: parseInt(val) });
};

window.onSLTargetChange = function (val) {
    const slMap = { 88: 1.18, 89: 1.23, 90: 1.28, 91: 1.34, 92: 1.41, 93: 1.48, 94: 1.55, 95: 1.65, 96: 1.75, 97: 1.88, 98: 2.05, 99: 2.33 };
    SystemState.serviceLevel = { target: parseInt(val), zScore: slMap[parseInt(val)] || 1.65 };
    document.getElementById('slTargetVal').textContent = val + '%';
    // Clear cached positions to force recalculation
    SystemState.inventoryPositions = {};
    renderAll();
    renderFinancialView();
    renderRiskHeatmap();
};

/* ══════════════════════════════════════════════════════════════════
   RENDER ALL
   ══════════════════════════════════════════════════════════════════ */
function renderAll() {
    renderForecastSpine();
    renderActionPanel();
    renderDecisionLog();
    updateMapRoutes();
}

/* ══════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', boot);
