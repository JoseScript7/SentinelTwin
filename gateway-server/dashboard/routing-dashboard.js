/**
 * ═══════════════════════════════════════════════════════════════════
 *  ROUTING-DASHBOARD.JS — Stock Routing & Warehouse Management
 *  OSRM-powered route optimization, warehouse capacity, transfers
 * ═══════════════════════════════════════════════════════════════════
 */

(async function () {
    'use strict';

    let dataset = null;
    let map = null;
    let routeLayers = [];
    let osrmRoutes = {};
    let transfers = [];
    let transferIdCounter = 0;

    const STORE_COORDS = {
        'Chennai': { lat: 13.08, lng: 80.27 }, 'Mumbai': { lat: 19.07, lng: 72.87 },
        'Delhi': { lat: 28.70, lng: 77.10 }, 'Bangalore': { lat: 12.97, lng: 77.59 },
        'Hyderabad': { lat: 17.38, lng: 78.48 }, 'Kolkata': { lat: 22.57, lng: 88.36 },
        'Pune': { lat: 18.52, lng: 73.85 }, 'Ahmedabad': { lat: 23.02, lng: 72.57 }
    };

    // ─── LOAD DATA ───────────────────────────────────────────────
    async function loadData() {
        try {
            const resp = await fetch('inventory-data.json');
            dataset = await resp.json();
            console.log(`[RoutingDash] ✅ Loaded ${dataset.skus.length} SKUs, ${dataset.warehouses?.length || 0} warehouses`);
        } catch (e) {
            console.error('[RoutingDash] Data load failed:', e);
            dataset = { skus: [], warehouses: [], oilPrices: [], transferCosts: {}, supplierPerformance: {} };
        }
    }

    // ─── INIT MAP ────────────────────────────────────────────────
    function initMap() {
        map = L.map('routingMap', { zoomControl: false }).setView([20.5, 78.9], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '©OpenStreetMap ©CARTO', subdomains: 'abcd', maxZoom: 19
        }).addTo(map);
        L.control.zoom({ position: 'topright' }).addTo(map);
    }

    // ─── POPULATE MAP WITH STORES + WAREHOUSES ───────────────────
    function populateMap() {
        if (!dataset || !map) return;

        // Store risk calculation
        const storeRisks = {};
        const stores = {};
        dataset.skus.forEach(sku => {
            if (!stores[sku.location]) stores[sku.location] = [];
            stores[sku.location].push(sku);
        });

        Object.entries(stores).forEach(([loc, skus]) => {
            const criticalCount = skus.filter(s => {
                const avgD = s.weeklyHistory.reduce((a, b) => a + b, 0) / s.weeklyHistory.length;
                return s.currentStock / (avgD / 7 || 1) < 7;
            }).length;
            storeRisks[loc] = criticalCount / skus.length;
        });

        // Add store markers
        Object.entries(STORE_COORDS).forEach(([name, coords]) => {
            const risk = storeRisks[name] || 0;
            const color = risk > 0.3 ? '#ef4444' : risk > 0.15 ? '#eab308' : '#22c55e';
            const skuCount = stores[name]?.length || 0;
            const critical = stores[name]?.filter(s => {
                const avgD = s.weeklyHistory.reduce((a, b) => a + b, 0) / s.weeklyHistory.length;
                return s.currentStock / (avgD / 7 || 1) < 7;
            }).length || 0;

            const marker = L.circleMarker([coords.lat, coords.lng], {
                radius: 10 + Math.min(critical * 2, 8), color, fillColor: color,
                fillOpacity: 0.7, weight: 2
            }).addTo(map);

            marker.bindPopup(`
                <div style="font-family:Inter;line-height:1.6">
                    <strong style="font-size:14px">${name}</strong><br>
                    <span>📦 ${skuCount} SKUs</span><br>
                    <span style="color:${color}">⚠️ ${critical} critical</span><br>
                    <span>Risk: ${(risk * 100).toFixed(0)}%</span>
                </div>
            `);

            marker.bindTooltip(name, { permanent: true, direction: 'top', className: 'store-label', offset: [0, -12] });
        });

        // Add warehouse markers
        (dataset.warehouses || []).forEach(wh => {
            const util = wh.utilization || 0.75;
            const color = util > 0.85 ? '#ef4444' : util > 0.70 ? '#eab308' : '#06b6d4';
            const marker = L.marker([wh.lat, wh.lng], {
                icon: L.divIcon({
                    className: '', iconSize: [20, 20],
                    html: `<div style="width:20px;height:20px;background:${color};border:2px solid #fff;border-radius:3px;opacity:.85"></div>`
                })
            }).addTo(map);

            marker.bindPopup(`
                <div style="font-family:Inter;line-height:1.6">
                    <strong>${wh.name}</strong><br>
                    Capacity: ${wh.capacity.toLocaleString()} units<br>
                    Utilization: ${(util * 100).toFixed(0)}%<br>
                    Serves: ${wh.servesStores.join(', ')}
                </div>
            `);
        });
    }

    // ─── FETCH OSRM ROUTES ───────────────────────────────────────
    async function fetchOSRMRoutes() {
        const api = window.apiService;
        if (!api) return;

        try {
            osrmRoutes = await api.getRoutesBetweenStores(STORE_COORDS);
            console.log(`[RoutingDash] ✅ ${Object.keys(osrmRoutes).length} OSRM routes loaded`);
        } catch (e) {
            console.warn('[RoutingDash] OSRM route fetch failed:', e);
        }

        // Draw routes on map
        Object.entries(osrmRoutes).forEach(([key, route]) => {
            if (route.geometry && route.geometry.coordinates) {
                const latlngs = route.geometry.coordinates.map(c => [c[1], c[0]]);
                const line = L.polyline(latlngs, {
                    color: '#22c55e', weight: 2.5, opacity: 0.6, dashArray: '8 4'
                }).addTo(map);
                line.bindTooltip(`${key.replace('_', ' → ')}: ${route.distance_km} km / ${route.duration_hrs}h`, {
                    sticky: true, className: 'route-tooltip'
                });
                routeLayers.push(line);
            }
        });

        // Update route list overlay
        const routeList = document.getElementById('routeList');
        if (routeList) {
            let html = '';
            Object.entries(osrmRoutes).sort((a, b) => a[1].distance_km - b[1].distance_km)
                .forEach(([key, rt]) => {
                    html += `<div class="route-item">
                        <span class="ri-route">${key.replace('_', ' → ')}</span>
                        <span class="ri-dist">${rt.distance_km} km</span>
                        <span class="ri-time">${rt.duration_hrs}h</span>
                    </div>`;
                });
            routeList.innerHTML = html || '<div style="color:var(--t3);font-size:11px">No routes available</div>';
        }

        updateKPIs();
    }

    // ─── GENERATE TRANSFERS ──────────────────────────────────────
    function generateTransfers() {
        transfers = [];
        if (!dataset) return;

        // Find stores with excess that can supply stores with shortage
        const storeInventory = {};
        dataset.skus.forEach(sku => {
            if (!storeInventory[sku.location]) storeInventory[sku.location] = { excess: [], shortage: [] };
            const avgD = sku.weeklyHistory.reduce((s, v) => s + v, 0) / sku.weeklyHistory.length;
            const daysSupply = sku.currentStock / (avgD / 7 || 1);
            if (daysSupply > 40) storeInventory[sku.location].excess.push({ ...sku, daysSupply, surplus: Math.round(sku.currentStock - avgD * 3) });
            if (daysSupply < 7) storeInventory[sku.location].shortage.push({ ...sku, daysSupply, deficit: Math.round(avgD * 2 - sku.currentStock) });
        });

        // Match excess to shortages (same category, different store)
        Object.entries(storeInventory).forEach(([fromStore, { excess }]) => {
            excess.forEach(exSku => {
                Object.entries(storeInventory).forEach(([toStore, { shortage }]) => {
                    if (fromStore === toStore) return;
                    shortage.forEach(shSku => {
                        if (shSku.category === exSku.category && Math.random() < 0.4) {
                            const cost = dataset.transferCosts?.[fromStore]?.[toStore] || 50;
                            const routeKey = `${fromStore}_${toStore}`;
                            const osrm = osrmRoutes[routeKey] || osrmRoutes[`${toStore}_${fromStore}`];
                            transfers.push({
                                id: ++transferIdCounter,
                                from: fromStore, to: toStore,
                                sku: exSku.id, skuName: exSku.name, category: exSku.category,
                                qty: Math.min(exSku.surplus, shSku.deficit, 200),
                                cost, distance: osrm?.distance_km || cost * 2,
                                duration: osrm?.duration_hrs || Math.round(cost / 5),
                                status: 'pending', routeGeometry: osrm?.geometry
                            });
                        }
                    });
                });
            });
        });

        // Sort by cost efficiency
        transfers.sort((a, b) => (a.cost / (a.qty || 1)) - (b.cost / (b.qty || 1)));
        transfers = transfers.slice(0, 20); // Top 20 transfers
    }

    // ─── RENDER WAREHOUSE CARDS ──────────────────────────────────
    function renderWarehouseCards() {
        const container = document.getElementById('warehouseCards');
        if (!container || !dataset) return;

        let html = '';
        (dataset.warehouses || []).forEach(wh => {
            const util = wh.utilization || 0.75;
            const barColor = util > 0.85 ? 'var(--red)' : util > 0.70 ? 'var(--yellow)' : 'var(--green)';
            const usedUnits = Math.round(wh.capacity * util);
            const freeUnits = wh.capacity - usedUnits;
            html += `
            <div class="wh-card">
                <div class="wh-header">
                    <div>
                        <div class="wh-name">${wh.name}</div>
                        <div class="wh-id">${wh.id}</div>
                    </div>
                    <span style="font-size:20px;font-weight:800;color:${barColor}">${(util * 100).toFixed(0)}%</span>
                </div>
                <div class="wh-bar"><div class="wh-bar-fill" style="width:${util * 100}%;background:${barColor}"></div></div>
                <div class="wh-details">
                    <div class="wh-detail"><div class="wd-val">${usedUnits.toLocaleString()}</div><div class="wd-lbl">Occupied</div></div>
                    <div class="wh-detail"><div class="wd-val" style="color:var(--green)">${freeUnits.toLocaleString()}</div><div class="wd-lbl">Free Capacity</div></div>
                </div>
                <div class="wh-stores" style="margin-bottom:8px">${wh.servesStores.map(s => `<span class="wh-store-chip">${s}</span>`).join('')}</div>
                <div style="text-align:right">
                    <button class="tf-btn primary" onclick="reorderFromSupplier('${wh.id}')" style="width:100%">📦 Reorder from Supplier</button>
                </div>
            </div>`;
        });
        container.innerHTML = html || '<div style="color:var(--t3);padding:20px;text-align:center">No warehouse data</div>';
    }

    // ─── RENDER TRANSFER QUEUE ───────────────────────────────────
    function renderTransferQueue() {
        const container = document.getElementById('transferQueue');
        if (!container) return;

        const pending = transfers.filter(t => t.status === 'pending');
        document.getElementById('kpiPending').textContent = pending.length;

        let html = '';
        pending.forEach(t => {
            html += `
            <div class="transfer-card" data-id="${t.id}">
                <div class="tf-header">
                    <div class="tf-route">${t.from} → ${t.to}</div>
                    <div class="tf-cost">₹${t.cost}/unit</div>
                </div>
                <div class="tf-body">
                    <strong>${t.skuName}</strong> (${t.sku}) • ${t.qty} units • ${t.distance} km • ~${t.duration}h
                </div>
                <div class="tf-actions">
                    <button class="tf-btn primary" onclick="approveTransfer(${t.id})">✓ Approve</button>
                    <button class="tf-btn" onclick="rejectTransfer(${t.id})">✕ Reject</button>
                    <button class="tf-btn" onclick="showRouteOnMap(${t.id})">📍 Show Route</button>
                </div>
            </div>`;
        });
        container.innerHTML = html || '<div style="color:var(--t3);padding:20px;text-align:center">No pending transfers</div>';
    }

    // ─── TRANSFER ACTIONS ────────────────────────────────────────
    window.approveTransfer = function (id) {
        const t = transfers.find(x => x.id === id);
        if (!t) return;
        t.status = 'approved';

        // Draw route on map
        if (t.routeGeometry && t.routeGeometry.coordinates) {
            const latlngs = t.routeGeometry.coordinates.map(c => [c[1], c[0]]);
            const line = L.polyline(latlngs, {
                color: '#22c55e', weight: 4, opacity: 0.9
            }).addTo(map);
            routeLayers.push(line);

            // Animated pulse effect
            let opacity = 0.9;
            const anim = setInterval(() => {
                opacity = opacity > 0.5 ? 0.3 : 0.9;
                line.setStyle({ opacity });
            }, 600);
            setTimeout(() => { clearInterval(anim); line.setStyle({ opacity: 0.7 }); }, 5000);
        } else {
            // Fallback: draw straight line
            const from = STORE_COORDS[t.from], to = STORE_COORDS[t.to];
            if (from && to) {
                const line = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
                    color: '#22c55e', weight: 3, opacity: 0.8, dashArray: '4 4'
                }).addTo(map);
                routeLayers.push(line);
            }
        }

        renderTransferQueue();
        updateKPIs();

        // Broadcast to other dashboards
        if (window.crossPageSync) {
            window.crossPageSync.broadcast('TRANSFER_APPROVED', { from: t.from, to: t.to, sku: t.sku, qty: t.qty });
            window.crossPageSync.broadcast('REPLENISHMENT_APPROVED', { sku: t.sku, store: t.to, qty: t.qty, source: t.from });
        }
    };

    window.rejectTransfer = function (id) {
        const t = transfers.find(x => x.id === id);
        if (t) { t.status = 'rejected'; renderTransferQueue(); updateKPIs(); }
    };

    window.showRouteOnMap = function (id) {
        const t = transfers.find(x => x.id === id);
        if (!t) return;
        const from = STORE_COORDS[t.from] || { lat: 20, lng: 78 };
        const to = STORE_COORDS[t.to] || { lat: t.from.includes('Supplier') ? 22 : 20, lng: 80 };
        if (from && to) {
            // Fly to midpoint
            const midLat = (from.lat + to.lat) / 2, midLng = (from.lng + to.lng) / 2;
            map.flyTo([midLat, midLng], 6, { duration: 1 });
        }
    };

    window.reorderFromSupplier = function (whId) {
        const wh = dataset.warehouses.find(w => w.id === whId);
        if (!wh) return;

        // Find a random supplier from the dataset
        const suppliers = [...new Set(dataset.skus.map(s => s.supplier).filter(Boolean))];
        const supplier = suppliers[Math.floor(Math.random() * suppliers.length)] || 'Supplier Hub A';

        // Generate a synthetic critical SKU shortage for this warehouse's stores
        const store = wh.servesStores[0] || 'Chennai';
        const shortSku = dataset.skus.find(s => s.location === store && s.currentStock < 100) || dataset.skus[0];

        // Mock distance calculation based on OSRM scale
        const distance = Math.floor(Math.random() * 800) + 150;
        const duration = Math.round(distance / 45); // Roughly 45km/h avg speed for trucks

        // Cost strategies
        const standardCost = Math.round(distance * 0.12);
        const expeditedCost = Math.round(distance * 0.25);

        // Create an incoming transfer request
        transfers.push({
            id: ++transferIdCounter,
            from: supplier, to: store,
            sku: shortSku.id, skuName: shortSku.name, category: shortSku.category,
            qty: 500, // standard bulk reorder
            cost: standardCost, distance: distance,
            duration: duration,
            status: 'pending',
            routeGeometry: null // Will just draw a straight line if approved
        });

        renderTransferQueue();

        // Show an in-UI notification or broadcast
        if (window.crossPageSync) {
            window.crossPageSync.broadcast('ALERT_FIRED', {
                title: 'Supplier Reorder Queued',
                message: `500 units of ${shortSku.name} from ${supplier} to ${store}. Distance: ${distance}km, Cost: ₹${standardCost}/unit.`
            });
        }
    };

    // ─── UPDATE KPIs ─────────────────────────────────────────────
    function updateKPIs() {
        const routeCount = Object.keys(osrmRoutes).length;
        const totalDist = Object.values(osrmRoutes).reduce((s, r) => s + r.distance_km, 0);
        const avgTime = routeCount > 0 ? (Object.values(osrmRoutes).reduce((s, r) => s + r.duration_hrs, 0) / routeCount) : 0;
        const avgUtil = dataset?.warehouses?.length > 0 ?
            dataset.warehouses.reduce((s, w) => s + (w.utilization || 0.75), 0) / dataset.warehouses.length : 0.75;

        document.getElementById('kpiRoutes').textContent = routeCount;
        document.getElementById('kpiDist').textContent = `${totalDist.toLocaleString()} km`;
        document.getElementById('kpiTime').textContent = `${avgTime.toFixed(1)}h`;
        document.getElementById('kpiWhUtil').textContent = `${(avgUtil * 100).toFixed(0)}% `;

        // Oil price from dataset
        const lastOil = dataset?.oilPrices?.length > 0 ? dataset.oilPrices[dataset.oilPrices.length - 1].priceUSD : '—';
        document.getElementById('kpiOil').textContent = `$${lastOil} `;
    }

    // ─── CHARTS ──────────────────────────────────────────────────
    function renderCharts() {
        // Oil Price Trend
        const oilCtx = document.getElementById('oilChart')?.getContext('2d');
        if (oilCtx && dataset?.oilPrices) {
            new Chart(oilCtx, {
                type: 'line',
                data: {
                    labels: dataset.oilPrices.map(p => `W${p.week} `),
                    datasets: [{
                        label: 'Brent Crude (USD)',
                        data: dataset.oilPrices.map(p => p.priceUSD),
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239,68,68,.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } },
                    scales: {
                        x: { ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 12 }, grid: { color: 'rgba(42,48,80,.3)' } },
                        y: { ticks: { color: '#64748b', font: { size: 9 }, callback: v => `$${v} ` }, grid: { color: 'rgba(42,48,80,.3)' } }
                    }
                }
            });
        }

        // Route Cost Economics
        const costCtx = document.getElementById('routeCostChart')?.getContext('2d');
        if (costCtx) {
            const topRoutes = Object.entries(osrmRoutes).sort((a, b) => a[1].distance_km - b[1].distance_km).slice(0, 8);
            new Chart(costCtx, {
                type: 'bar',
                data: {
                    labels: topRoutes.map(([k]) => k.replace('_', '→').slice(0, 10)),
                    datasets: [
                        {
                            label: 'Distance (km)',
                            data: topRoutes.map(([, r]) => r.distance_km),
                            backgroundColor: 'rgba(6,182,212,.5)',
                            borderColor: '#06b6d4',
                            borderWidth: 1
                        },
                        {
                            label: 'Time (hrs × 100)',
                            data: topRoutes.map(([, r]) => Math.round(r.duration_hrs * 100)),
                            backgroundColor: 'rgba(234,179,8,.4)',
                            borderColor: '#eab308',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } },
                    scales: {
                        x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(42,48,80,.3)' } },
                        y: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(42,48,80,.3)' } }
                    }
                }
            });
        }
    }

    // ─── CROSS-PAGE SYNC ─────────────────────────────────────────
    if (window.crossPageSync) {
        window.crossPageSync.on('SKU_SELECTED', (payload) => {
            if (payload.store) {
                const coords = STORE_COORDS[payload.store];
                if (coords && map) map.flyTo([coords.lat, coords.lng], 8, { duration: 1 });
            }
        });
        window.crossPageSync.on('STORE_SELECTED', (payload) => {
            if (payload.store) {
                const coords = STORE_COORDS[payload.store];
                if (coords && map) map.flyTo([coords.lat, coords.lng], 8, { duration: 1 });
            }
        });
        window.crossPageSync.on('ALERT_FIRED', (payload) => {
            console.log('[RoutingDash] Alert received:', payload);
        });
    }

    // ─── INIT ────────────────────────────────────────────────────
    await loadData();
    initMap();
    populateMap();
    renderWarehouseCards();

    // Fetch OSRM routes (async, updates map + KPIs when ready)
    fetchOSRMRoutes().then(() => {
        generateTransfers();
        renderTransferQueue();
        setTimeout(() => {
            renderCharts();
        }, 100);
    });

    updateKPIs();
    console.log('[RoutingDash] ✅ Routing & Warehouse Dashboard ready');
})();
