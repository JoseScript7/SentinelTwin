/**
 * ═══════════════════════════════════════════════════════════════════
 *  SHARED STATE & EVENT BUS — Unified Dashboard Nervous System
 *  Every dashboard reads/writes through this single source of truth.
 *  Events propagate to all subscribers in <200ms.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Event Types ──────────────────────────────────────────────────
const EVT = Object.freeze({
    SKU_SELECTED: 'SKU_SELECTED',
    STORE_SELECTED: 'STORE_SELECTED',
    FORECAST_UPDATED: 'FORECAST_UPDATED',
    ALERT_FIRED: 'ALERT_FIRED',
    ALERT_ACKNOWLEDGED: 'ALERT_ACKNOWLEDGED',
    ALERT_RESOLVED: 'ALERT_RESOLVED',
    REPLENISHMENT_APPROVED: 'REPLENISHMENT_APPROVED',
    TRANSFER_APPROVED: 'TRANSFER_APPROVED',
    OVERRIDE_SUBMITTED: 'OVERRIDE_SUBMITTED',
    SCENARIO_CHANGED: 'SCENARIO_CHANGED',
    SUPPLIER_STATUS_CHANGED: 'SUPPLIER_STATUS_CHANGED',
    FINANCIAL_RECALCULATED: 'FINANCIAL_RECALCULATED',
    MODEL_ACCURACY_UPDATED: 'MODEL_ACCURACY_UPDATED',
    REGIME_CHANGE_DETECTED: 'REGIME_CHANGE_DETECTED'
});

// ── Event Bus (Pub/Sub) ──────────────────────────────────────────
class EventBus {
    constructor() {
        this._subs = {};
        this._history = [];
    }
    on(event, fn, ctx) {
        if (!this._subs[event]) this._subs[event] = [];
        this._subs[event].push({ fn, ctx: ctx || null });
        return () => this.off(event, fn);
    }
    off(event, fn) {
        if (!this._subs[event]) return;
        this._subs[event] = this._subs[event].filter(s => s.fn !== fn);
    }
    emit(event, payload) {
        const entry = { event, payload, ts: Date.now() };
        this._history.push(entry);
        if (this._history.length > 200) this._history.shift();
        const subs = this._subs[event] || [];
        for (const s of subs) {
            try { s.fn.call(s.ctx, payload, event); }
            catch (e) { console.error(`[EventBus] ${event} handler error:`, e); }
        }
        // Wildcard subscribers
        const wildcard = this._subs['*'] || [];
        for (const s of wildcard) {
            try { s.fn.call(s.ctx, payload, event); }
            catch (e) { console.error(`[EventBus] wildcard handler error:`, e); }
        }
    }
    history(n) { return this._history.slice(-(n || 50)); }
}

// ── SystemState ──────────────────────────────────────────────────
const SystemState = {
    // Current selection
    selectedSKU: null,
    selectedStore: null,

    // Forecast output for selected SKU-Store
    currentForecast: { P10: [], P50: [], P90: [], dates: [], history: [] },

    // All inventory positions: Map<skuId, Map<storeId, {...}>>
    inventoryPositions: {},

    // Active alerts
    activeAlerts: [],
    alertHistory: [],

    // Routing decisions
    routingDecisions: [],
    pendingTransfers: [],

    // Financial snapshot
    financialSnapshot: {
        capitalAtRisk: 0,
        revenueAtRisk: 0,
        workingCapitalFreed: 0,
        totalInventoryValue: 0,
        optimalInventoryValue: 0,
        workingCapitalBudget: 500000  // ₹5L default weekly budget
    },

    // Supplier status
    supplierStatus: {},

    // Planner actions / decision log
    plannerActions: [],

    // Store network (populated from data)
    storeNetwork: {},
    warehouseNetwork: {},
    supplierNetwork: {},

    // Model performance
    modelAccuracy: { overallMAPE: 0, skuMAPEs: {}, driftFlags: {} },

    // Service level config
    serviceLevel: { target: 95, zScore: 1.65 },

    // What-if scenario state
    activeScenario: null
};

// ── Convenience Dispatchers ──────────────────────────────────────
const bus = new EventBus();

function selectSKU(skuId) {
    SystemState.selectedSKU = skuId;
    bus.emit(EVT.SKU_SELECTED, { skuId });
}

function selectStore(storeId) {
    SystemState.selectedStore = storeId;
    bus.emit(EVT.STORE_SELECTED, { storeId });
}

function updateForecast(skuId, storeId, forecastData) {
    SystemState.currentForecast = forecastData;
    bus.emit(EVT.FORECAST_UPDATED, { skuId, storeId, forecast: forecastData });
}

function fireAlert(alert) {
    alert.id = alert.id || `ALR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    alert.status = 'active';
    alert.firedAt = Date.now();
    alert.acknowledgedAt = null;
    alert.resolvedAt = null;
    alert.resolution = null;
    SystemState.activeAlerts.push(alert);
    bus.emit(EVT.ALERT_FIRED, alert);
    return alert;
}

function acknowledgeAlert(alertId, plannerName) {
    const alert = SystemState.activeAlerts.find(a => a.id === alertId);
    if (!alert) return null;
    alert.status = 'acknowledged';
    alert.acknowledgedAt = Date.now();
    alert.acknowledgedBy = plannerName || 'System';
    bus.emit(EVT.ALERT_ACKNOWLEDGED, alert);
    return alert;
}

function resolveAlert(alertId, resolution, plannerName) {
    const idx = SystemState.activeAlerts.findIndex(a => a.id === alertId);
    if (idx === -1) return null;
    const alert = SystemState.activeAlerts[idx];
    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    alert.resolution = resolution;
    alert.resolvedBy = plannerName || 'System';
    SystemState.alertHistory.push(alert);
    SystemState.activeAlerts.splice(idx, 1);
    bus.emit(EVT.ALERT_RESOLVED, alert);
    return alert;
}

function approveReplenishment(decision) {
    decision.id = decision.id || `REP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    decision.type = 'replenishment';
    decision.status = 'approved';
    decision.approvedAt = Date.now();
    SystemState.routingDecisions.push(decision);
    logAction('unified', 'replenishment_approved', decision);
    bus.emit(EVT.REPLENISHMENT_APPROVED, decision);
    return decision;
}

function approveTransfer(decision) {
    decision.id = decision.id || `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    decision.type = 'transfer';
    decision.status = 'approved';
    decision.approvedAt = Date.now();
    SystemState.routingDecisions.push(decision);
    SystemState.pendingTransfers.push(decision);
    logAction('unified', 'transfer_approved', decision);
    bus.emit(EVT.TRANSFER_APPROVED, decision);
    return decision;
}

function submitOverride(override) {
    override.id = override.id || `OVR-${Date.now()}`;
    override.submittedAt = Date.now();
    logAction('risk', 'override_submitted', override);
    bus.emit(EVT.OVERRIDE_SUBMITTED, override);
    return override;
}

function changeScenario(scenario) {
    SystemState.activeScenario = scenario;
    bus.emit(EVT.SCENARIO_CHANGED, scenario);
}

function updateSupplierStatus(supplierId, status) {
    SystemState.supplierStatus[supplierId] = { ...SystemState.supplierStatus[supplierId], ...status, updatedAt: Date.now() };
    bus.emit(EVT.SUPPLIER_STATUS_CHANGED, { supplierId, status });
}

function recalculateFinancials(snapshot) {
    Object.assign(SystemState.financialSnapshot, snapshot);
    bus.emit(EVT.FINANCIAL_RECALCULATED, SystemState.financialSnapshot);
}

function detectRegimeChange(data) {
    bus.emit(EVT.REGIME_CHANGE_DETECTED, data);
}

function logAction(dashboardOrigin, actionType, details) {
    const action = {
        id: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        dashboardOrigin,
        actionType,
        timestamp: Date.now(),
        planner: details.planner || 'System',
        skuId: details.skuId || SystemState.selectedSKU,
        storeId: details.storeId || SystemState.selectedStore,
        description: details.description || actionType.replace(/_/g, ' '),
        details,
        outcome: null
    };
    SystemState.plannerActions.unshift(action);
    if (SystemState.plannerActions.length > 50) SystemState.plannerActions.pop();
    return action;
}

// ── Alert Generation Engine ──────────────────────────────────────
function evaluateAlerts(inventoryData, forecastResults) {
    if (!inventoryData || !inventoryData.skus) return;

    const alerts = [];
    const now = Date.now();

    for (const sku of inventoryData.skus) {
        for (const store of (inventoryData.metadata?.locations || [])) {
            const pos = getInventoryPosition(sku, store);
            if (!pos) continue;

            // 1. Stockout imminent — Monte Carlo prob > 75%
            if (pos.stockoutProb > 75) {
                alerts.push(fireAlert({
                    type: 'stockout_imminent',
                    severity: pos.stockoutProb > 90 ? 'critical' : 'high',
                    skuId: sku.id,
                    skuName: sku.name,
                    store,
                    triggerValue: pos.stockoutProb,
                    triggerUnit: '% stockout probability',
                    daysOfSupply: pos.daysOfSupply,
                    recommendation: `Place emergency replenishment order for ${Math.round(pos.eoq)} units today`,
                    icon: '🚨'
                }));
            }

            // 2. Overstock detected — stock > 140% of optimal
            if (pos.stockRatio > 1.4 && pos.daysOfSupply > 42) {
                alerts.push(fireAlert({
                    type: 'overstock',
                    severity: 'medium',
                    skuId: sku.id,
                    skuName: sku.name,
                    store,
                    triggerValue: Math.round(pos.stockRatio * 100),
                    triggerUnit: '% of optimal stock',
                    recommendation: `Consider markdown or inter-store transfer of ${Math.round(pos.excessUnits)} units`,
                    icon: '📦'
                }));
            }

            // 3. Forecast accuracy degrading — MAPE > baseline + 20%
            if (pos.mape4w > 0 && pos.mapeBaseline > 0 && pos.mape4w > pos.mapeBaseline * 1.2) {
                alerts.push(fireAlert({
                    type: 'accuracy_degrading',
                    severity: 'medium',
                    skuId: sku.id,
                    skuName: sku.name,
                    store,
                    triggerValue: Math.round(pos.mape4w),
                    triggerUnit: '% MAPE (4-week)',
                    recommendation: 'Review demand pattern for potential regime change',
                    icon: '📉'
                }));
            }
        }
    }

    return alerts;
}

function getInventoryPosition(sku, store) {
    const key = `${sku.id}_${store}`;
    if (SystemState.inventoryPositions[key]) return SystemState.inventoryPositions[key];

    // Compute from sku data
    const hist = sku.weeklyHistory || [];
    if (hist.length === 0) return null;

    const avgDemand = hist.reduce((a, b) => a + b, 0) / hist.length;
    const stdDemand = Math.sqrt(hist.map(v => (v - avgDemand) ** 2).reduce((a, b) => a + b, 0) / hist.length);
    const lt = sku.leadTimeDays || 7;
    const z = SystemState.serviceLevel.zScore;
    const safetyStock = Math.round(z * stdDemand * Math.sqrt(lt / 7));
    const rop = Math.round(avgDemand * (lt / 7) + safetyStock);
    const currentStock = sku.currentStock || 0;
    const daysOfSupply = avgDemand > 0 ? Math.round(currentStock / (avgDemand / 7)) : 999;
    const optimalStock = rop + Math.round(avgDemand * 2);
    const stockRatio = optimalStock > 0 ? currentStock / optimalStock : 1;
    const excessUnits = Math.max(0, currentStock - optimalStock);

    // Simple stockout probability
    const dailyDemand = avgDemand / 7;
    const dailyStd = stdDemand / Math.sqrt(7);
    const stockoutProb = dailyDemand > 0 ? Math.round(Math.max(0, Math.min(100,
        100 * (1 - normalCDF((currentStock - dailyDemand * lt) / (dailyStd * Math.sqrt(lt) + 0.01)))
    ))) : 0;

    const pos = {
        skuId: sku.id, store, currentStock, avgDemand: Math.round(avgDemand),
        stdDemand: Math.round(stdDemand), safetyStock, rop, daysOfSupply,
        optimalStock, stockRatio: Math.round(stockRatio * 100) / 100,
        excessUnits, stockoutProb,
        eoq: Math.round(Math.sqrt(2 * avgDemand * 52 * (sku.unitCost || 100) * 0.2 / ((sku.unitCost || 100) * 0.25))),
        mape4w: 0, mapeBaseline: 0,
        inventoryValue: currentStock * (sku.unitCost || 100),
        category: sku.category
    };

    SystemState.inventoryPositions[key] = pos;
    return pos;
}

function normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
}

// ── Formatting Helpers ───────────────────────────────────────────
function formatCurrency(n) {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + ' Cr';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + ' L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K';
    return '₹' + Math.round(n);
}

function formatTime(ts) {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.round(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.round(diff / 3600000) + 'h ago';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function severityColor(severity) {
    return { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', info: '#3b82f6' }[severity] || '#888';
}

function statusColor(status) {
    return {
        healthy: '#22c55e', warning: '#eab308', critical: '#ef4444', danger: '#ef4444',
        approaching: '#f97316', stockout: '#7f1d1d', excess: '#3b82f6'
    }[status] || '#888';
}

// ── Export for use in other dashboard scripts ─────────────────────
window.EVT = EVT;
window.EventBus = EventBus;
window.bus = bus;
window.SystemState = SystemState;
window.selectSKU = selectSKU;
window.selectStore = selectStore;
window.updateForecast = updateForecast;
window.fireAlert = fireAlert;
window.acknowledgeAlert = acknowledgeAlert;
window.resolveAlert = resolveAlert;
window.approveReplenishment = approveReplenishment;
window.approveTransfer = approveTransfer;
window.submitOverride = submitOverride;
window.changeScenario = changeScenario;
window.updateSupplierStatus = updateSupplierStatus;
window.recalculateFinancials = recalculateFinancials;
window.detectRegimeChange = detectRegimeChange;
window.logAction = logAction;
window.evaluateAlerts = evaluateAlerts;
window.getInventoryPosition = getInventoryPosition;
window.formatCurrency = formatCurrency;
window.formatTime = formatTime;
window.severityColor = severityColor;
window.statusColor = statusColor;

console.log('[SharedState] ✅ SystemState + EventBus initialized — 14 event types, pub/sub ready');
