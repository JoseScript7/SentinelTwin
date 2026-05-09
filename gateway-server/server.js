/**
 * RescueLink Gateway Server
 * Acts as the rescue command unit that receives SOS alerts
 */

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ==========================================
// Configuration
// ==========================================
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Listen on all interfaces

// ==========================================
// Data Storage (In-Memory for Demo)
// ==========================================
let sosAlerts = [];
let rescueTeams = [];
let statusTimers = new Map(); // Store timers separately to avoid circular JSON

// Load rescue teams
try {
    rescueTeams = JSON.parse(fs.readFileSync(path.join(__dirname, 'rescue-teams.json'), 'utf8'));
    console.log(`✅ Loaded ${rescueTeams.length} rescue teams`);
} catch (error) {
    console.warn('⚠️ Could not load rescue teams:', error.message);
}

// ==========================================
// Status Evolution Timer
// ==========================================
const STATUS_EVOLUTION = {
    ACTIVE: { timeout: 60000, next: 'UNRESPONSIVE' },           // 1 min for demo (10 min in real)
    UNRESPONSIVE: { timeout: 120000, next: 'POSSIBLE_CASUALTY' } // 2 min for demo (30 min in real)
};

function startStatusEvolution(sosId) {
    const sos = sosAlerts.find(s => s.id === sosId);
    if (!sos || sos.adminStatus === 'ACKNOWLEDGED') return;

    const evolution = STATUS_EVOLUTION[sos.emergencyStatus];
    if (!evolution) return;

    // Clear existing timer if any
    if (statusTimers.has(sosId)) {
        clearTimeout(statusTimers.get(sosId));
    }

    const timer = setTimeout(() => {
        const currentSOS = sosAlerts.find(s => s.id === sosId);
        if (currentSOS && currentSOS.adminStatus !== 'ACKNOWLEDGED') {
            currentSOS.emergencyStatus = evolution.next;
            currentSOS.statusUpdatedAt = new Date().toISOString();
            console.log(`⚠️ SOS ${sosId} status evolved to: ${evolution.next}`);
            broadcastUpdate({ type: 'STATUS_UPDATE', sos: sanitizeSOS(currentSOS) });
            startStatusEvolution(sosId); // Continue evolution chain
        }
    }, evolution.timeout);

    statusTimers.set(sosId, timer);
}

// ==========================================
// Haversine Distance Calculation
// ==========================================
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function findNearestRescueTeam(sosLocation) {
    if (!sosLocation || rescueTeams.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    for (const team of rescueTeams) {
        const distance = calculateDistance(
            sosLocation.lat, sosLocation.lng,
            team.lat, team.lng
        );
        if (distance < minDistance) {
            minDistance = distance;
            nearest = { ...team, distance: Math.round(distance * 100) / 100 };
        }
    }

    return nearest;
}

// ==========================================
// ML-Based Rescue Team Prediction
// ==========================================
function predictBestRescueTeams(sos) {
    if (!sos.location || rescueTeams.length === 0) return [];

    const predictions = rescueTeams.map(team => {
        let score = 0;

        // Distance factor (closer = higher score, max 40 points)
        const distance = calculateDistance(
            sos.location.lat, sos.location.lng,
            team.lat, team.lng
        );
        const distanceScore = Math.max(0, 40 - (distance * 4));
        score += distanceScore;

        // Emergency type matching (max 30 points)
        const emergencyType = sos.emergencyType || sos.victimMetadata?.emergencyType || 'general';
        const typeMapping = {
            'fire': ['fire', 'disaster'],
            'flood': ['flood', 'disaster'],
            'medical': ['medical', 'unified'],
            'accident': ['medical', 'police', 'unified'],
            'crime': ['police', 'safety', 'unified'],
            'collapse': ['fire', 'disaster', 'medical'],
            'general': ['unified', 'police', 'medical']
        };

        const preferredTypes = typeMapping[emergencyType] || typeMapping['general'];
        if (preferredTypes.includes(team.type)) {
            score += 30;
        } else if (team.type === 'unified') {
            score += 20; // Unified response (112) is always relevant
        }

        // Capability matching (max 20 points)
        if (team.capabilities) {
            const relevantCapabilities = {
                'fire': ['fire', 'rescue', 'building_collapse'],
                'flood': ['flood', 'water_rescue', 'boat_operations'],
                'medical': ['medical', 'accident', 'emergency'],
                'accident': ['medical', 'accident', 'traffic'],
                'crime': ['crime', 'law_enforcement', 'women_safety'],
                'collapse': ['rescue', 'building_collapse', 'mass_casualty'],
                'general': ['all_emergencies', 'unified_response']
            };

            const neededCaps = relevantCapabilities[emergencyType] || [];
            const matchedCaps = team.capabilities.filter(c => neededCaps.includes(c));
            score += matchedCaps.length * 5;
        }

        // Priority boost for vulnerable victims (max 10 points)
        if (sos.victimMetadata?.hasVulnerable) {
            if (team.type === 'medical' || team.capabilities?.includes('medical')) {
                score += 10;
            }
        }

        // Status penalty (unavailable teams get -50)
        if (team.status !== 'available') {
            score -= 50;
        }

        return {
            ...team,
            distance: Math.round(distance * 100) / 100,
            matchScore: Math.round(score),
            isRecommended: score >= 50
        };
    });

    // Sort by match score descending
    predictions.sort((a, b) => b.matchScore - a.matchScore);

    return predictions.slice(0, 3); // Return top 3 recommendations
}

// ==========================================
// Confidence Score Calculation
// ==========================================
function calculateConfidenceScore(sos) {
    let score = 50; // Base score

    // Motion factor
    if (sos.motion === 'stationary') score += 20;
    else if (sos.motion === 'moving') score -= 10;

    // Battery factor
    if (sos.battery !== null && sos.battery !== undefined) {
        if (sos.battery < 10) score += 25;
        else if (sos.battery < 25) score += 15;
        else if (sos.battery > 80) score -= 5;
    }

    // Time since creation
    const timeSince = Date.now() - new Date(sos.timestamp).getTime();
    const minutesSince = timeSince / 60000;
    if (minutesSince > 30) score += 15;
    else if (minutesSince > 10) score += 10;

    return Math.max(0, Math.min(100, score));
}

function getConfidenceLevel(score) {
    if (score >= 70) return { level: 'high', label: 'High Risk' };
    if (score >= 40) return { level: 'medium', label: 'Medium Risk' };
    return { level: 'low', label: 'Low Risk' };
}

// Sanitize SOS for JSON serialization (remove non-serializable fields)
function sanitizeSOS(sos) {
    const { statusTimer, ...cleanSOS } = sos;
    return cleanSOS;
}

function sanitizeAllSOS() {
    return sosAlerts.map(sanitizeSOS);
}

// ==========================================
// Express App Setup
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

// Serve dashboard static files
app.use(express.static(path.join(__dirname, 'dashboard')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Receive SOS from mobile app
app.post('/api/sos', (req, res) => {
    const sosData = req.body;

    // Check if already exists
    const existing = sosAlerts.find(s => s.id === sosData.id);
    if (existing) {
        console.log(`ℹ️ SOS ${sosData.id} already received`);
        return res.json({ success: true, message: 'Already received', id: sosData.id });
    }

    // ML-based rescue team prediction
    const predictedTeams = predictBestRescueTeams(sosData);
    const nearestTeam = findNearestRescueTeam(sosData.location);

    // Enrich SOS data
    const enrichedSOS = {
        ...sosData,
        receivedAt: new Date().toISOString(),
        emergencyStatus: 'ACTIVE',
        adminStatus: 'NEW',
        nearestTeam: nearestTeam,
        recommendedTeams: predictedTeams, // ML predictions
        lastUpdate: new Date().toISOString()
    };

    sosAlerts.push(enrichedSOS);
    console.log(`🆘 NEW SOS RECEIVED: ${sosData.id}`);
    console.log(`   📍 Location: ${sosData.location?.lat}, ${sosData.location?.lng} (±${sosData.location?.accuracy}m)`);
    console.log(`   🔋 Battery: ${sosData.battery}%`);
    console.log(`   📶 Motion: ${sosData.motion}`);
    console.log(`   🎯 Emergency Type: ${sosData.emergencyType || 'general'}`);
    if (predictedTeams.length > 0) {
        console.log(`   🏥 Best Match: ${predictedTeams[0].name} (Score: ${predictedTeams[0].matchScore})`);
    }

    // Start status evolution timer
    startStatusEvolution(sosData.id);

    // Broadcast to all connected dashboards
    broadcastUpdate({ type: 'NEW_SOS', sos: sanitizeSOS(enrichedSOS) });

    res.json({ success: true, message: 'SOS received', id: sosData.id });
});

// SMS Gateway Webhook (For Automating Offline SMS)
app.post('/api/sms-gateway', (req, res) => {
    // Accepts requests from "SMS Forwarder" apps
    // Payload usually: { "from": "+123456", "message": "..." } or { "text": "..." }
    const { from, message, text, body } = req.body;
    const smsContent = message || text || body || '';

    console.log(`📩 SMS Gateway Received: ${smsContent}`);

    // Parse logic: Look for coordinates in the text
    // Matches "q=13.08,80.20" or "13.08, 80.20"
    const coords = smsContent.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/) || smsContent.match(/(\d+\.\d+),\s*(\d+\.\d+)/);

    if (coords) {
        const lat = parseFloat(coords[1]);
        const lng = parseFloat(coords[2]);

        const sosData = {
            id: 'SMS-' + Date.now().toString().slice(-6),
            location: { lat, lng, accuracy: 50 },
            emergencyType: 'flood',
            emergencyStatus: 'CRITICAL',
            timestamp: new Date().toISOString(),
            source: 'SMS Gateway',
            battery: 15,
            motion: 'stationary',
            victimMetadata: { name: 'Unknown (via SMS)', contact: from || 'Hidden' }
        };

        // Add to System
        sosAlerts.push(sosData);

        // Predictions
        sosData.recommendedTeams = predictBestRescueTeams(sosData);
        startStatusEvolution(sosData.id);

        // Broadcast
        broadcastUpdate({ type: 'NEW_SOS', sos: sanitizeSOS(sosData) });

        console.log(`✅ SMS Processed as Valid SOS from ${from}`);
        res.json({ success: true, message: 'SMS Processed' });
    } else {
        console.log('⚠️ Incoming SMS ignored: No coordinates found');
        res.json({ success: false, message: 'Ignored - Valid format required' });
    }
});

// Get all SOS alerts
app.get('/api/sos', (req, res) => {
    res.json(sanitizeAllSOS());
});

// Get rescue teams
app.get('/api/rescue-teams', (req, res) => {
    res.json(rescueTeams);
});

// Update SOS admin status
app.post('/api/sos/:id/status', (req, res) => {
    const { id } = req.params;
    const { adminStatus, note } = req.body;

    const sos = sosAlerts.find(s => s.id === id);
    if (!sos) {
        return res.status(404).json({ error: 'SOS not found' });
    }

    sos.adminStatus = adminStatus;
    sos.adminNote = note || '';
    sos.statusUpdatedAt = new Date().toISOString();

    // Clear evolution timer if acknowledged
    if (adminStatus === 'ACKNOWLEDGED' && statusTimers.has(id)) {
        clearTimeout(statusTimers.get(id));
        statusTimers.delete(id);
    }

    console.log(`✅ SOS ${id} status updated to: ${adminStatus}`);
    broadcastUpdate({ type: 'STATUS_UPDATE', sos: sanitizeSOS(sos) });

    res.json({ success: true, sos: sanitizeSOS(sos) });
});

// Simulate victim update (for testing status evolution)
app.post('/api/sos/:id/ping', (req, res) => {
    const { id } = req.params;
    const sos = sosAlerts.find(s => s.id === id);

    if (!sos) {
        return res.status(404).json({ error: 'SOS not found' });
    }

    sos.lastUpdate = new Date().toISOString();
    sos.emergencyStatus = 'ACTIVE';

    // Reset evolution timer
    if (statusTimers.has(id)) {
        clearTimeout(statusTimers.get(id));
    }
    startStatusEvolution(id);

    broadcastUpdate({ type: 'STATUS_UPDATE', sos: sanitizeSOS(sos) });
    res.json({ success: true, sos: sanitizeSOS(sos) });
});

// ==========================================
// HTTP & WebSocket Server
// ==========================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Connected clients
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`📡 Dashboard connected (${clients.size} total)`);

    // Send current state
    ws.send(JSON.stringify({
        type: 'INIT',
        sosAlerts: sanitizeAllSOS(),
        rescueTeams
    }));

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`📡 Dashboard disconnected (${clients.size} remaining)`);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

function broadcastUpdate(data) {
    const message = JSON.stringify(data);
    for (const client of clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
        }
    }
}

// ==========================================
// Inventory Intelligence — Real-Time API
// ==========================================
const inventoryFeed = [];
const inventoryOrders = [];
const inventoryFlags = [];
const inventoryAlerts = [];

// Simulated real-time POS feed generator
function generateInventoryEvent() {
    const skuIds = ['SKU-1001', 'SKU-1002', 'SKU-1003', 'SKU-1004', 'SKU-1005', 'SKU-1006', 'SKU-1007', 'SKU-1008', 'SKU-1009', 'SKU-1010',
        'SKU-2001', 'SKU-2002', 'SKU-2003', 'SKU-2004', 'SKU-2005', 'SKU-3001', 'SKU-3002', 'SKU-3003', 'SKU-3004', 'SKU-3005',
        'SKU-4001', 'SKU-4002', 'SKU-4003', 'SKU-4004', 'SKU-4005', 'SKU-5001', 'SKU-5002', 'SKU-5003', 'SKU-5004', 'SKU-5005'];
    const locations = ['Chennai', 'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad'];
    const channels = ['Online', 'Retail', 'Wholesale', 'B2B'];
    const eventTypes = [
        { type: 'POS_SALE', weight: 50 },
        { type: 'DEMAND_SPIKE', weight: 8 },
        { type: 'PROMO_TRIGGERED', weight: 10 },
        { type: 'STOCK_UPDATE', weight: 15 },
        { type: 'SUPPLIER_DELAY', weight: 5 },
        { type: 'PRICE_CHANGE', weight: 7 },
        { type: 'WEATHER_ALERT', weight: 3 },
        { type: 'RETURN_PROCESSED', weight: 2 },
    ];
    const total = eventTypes.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total, pick = eventTypes[0].type;
    for (const e of eventTypes) { r -= e.weight; if (r <= 0) { pick = e.type; break; } }
    const sku = skuIds[Math.floor(Math.random() * skuIds.length)];
    const loc = locations[Math.floor(Math.random() * locations.length)];
    const channel = channels[Math.floor(Math.random() * channels.length)];
    const qty = Math.floor(Math.random() * 30) + 1;
    const event = {
        id: 'EVT-' + Date.now().toString(36),
        timestamp: new Date().toISOString(),
        type: pick,
        sku_id: sku,
        location: loc,
        channel: channel,
        quantity: qty,
        details: {}
    };
    switch (pick) {
        case 'POS_SALE': event.details = { units: qty, revenue: qty * (500 + Math.random() * 5000) }; break;
        case 'DEMAND_SPIKE': event.details = { deviation: (20 + Math.random() * 40).toFixed(1) + '%', baseline: qty * 2 }; break;
        case 'PROMO_TRIGGERED': event.details = { discount: (10 + Math.floor(Math.random() * 30)) + '%', lift: (1.1 + Math.random() * 0.4).toFixed(2) }; break;
        case 'STOCK_UPDATE': event.details = { previous: qty * 3, current: qty * 3 - qty, delta: -qty }; break;
        case 'SUPPLIER_DELAY': event.details = { expected_days: 7, new_days: 7 + Math.floor(Math.random() * 10), reason: 'logistics' }; break;
        case 'PRICE_CHANGE': event.details = { old_price: 1000 + Math.floor(Math.random() * 4000), change_pct: (-15 + Math.random() * 30).toFixed(1) + '%' }; break;
        case 'WEATHER_ALERT': event.details = { condition: ['Heavy Rain', 'Cyclone Warning', 'Heatwave', 'Flood Alert'][Math.floor(Math.random() * 4)], impact: 'demand_shift' }; break;
        case 'RETURN_PROCESSED': event.details = { units: Math.ceil(qty / 3), reason: ['Defective', 'Wrong Item', 'Size Issue'][Math.floor(Math.random() * 3)] }; break;
    }
    inventoryFeed.unshift(event);
    if (inventoryFeed.length > 200) inventoryFeed.length = 200;
    return event;
}

// Start real-time feed
setInterval(generateInventoryEvent, 3000 + Math.random() * 5000);

// GET live data feed (dashboard polls this)
app.get('/api/inventory/feed', (req, res) => {
    const since = req.query.since ? new Date(req.query.since).getTime() : 0;
    const events = since ? inventoryFeed.filter(e => new Date(e.timestamp).getTime() > since) : inventoryFeed.slice(0, 50);
    res.json({ events, count: events.length, total: inventoryFeed.length });
});

// POST reorder
app.post('/api/inventory/reorder', (req, res) => {
    const { sku_id, quantity, reorder_point, safety_stock, model_used } = req.body;
    const order = { id: 'ORD-' + Date.now().toString(36), sku_id, quantity, reorder_point, safety_stock, model_used, status: 'SUBMITTED', timestamp: new Date().toISOString() };
    inventoryOrders.push(order);
    console.log(`📦 Reorder: ${sku_id} × ${quantity} units (model: ${model_used})`);
    res.json({ success: true, order });
});

// POST flag SKU
app.post('/api/inventory/flag', (req, res) => {
    const { sku_id, reason, risk_score } = req.body;
    const flag = { id: 'FLG-' + Date.now().toString(36), sku_id, reason, risk_score, timestamp: new Date().toISOString() };
    inventoryFlags.push(flag);
    console.log(`🚩 Flagged: ${sku_id} — ${reason} (risk: ${risk_score}%)`);
    res.json({ success: true, flag });
});

// POST send alert
app.post('/api/inventory/alert', (req, res) => {
    const { message, severity, affected_skus } = req.body;
    const alert = { id: 'ALT-' + Date.now().toString(36), message, severity, affected_skus, timestamp: new Date().toISOString() };
    inventoryAlerts.push(alert);
    console.log(`⚠️ Alert [${severity}]: ${message} (${affected_skus?.length || 0} SKUs)`);
    broadcastUpdate({ type: 'INVENTORY_ALERT', alert });
    res.json({ success: true, alert });
});

// GET inventory status summary
app.get('/api/inventory/status', (req, res) => {
    res.json({ orders: inventoryOrders.slice(-20), flags: inventoryFlags.slice(-20), alerts: inventoryAlerts.slice(-20), feed_size: inventoryFeed.length });
});

// ==========================================
// Start Server
// ==========================================
server.listen(PORT, HOST, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           🆘 RescueLink Gateway Server Started 🆘          ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  📡 Server running on: http://${HOST}:${PORT}                 ║`);
    console.log(`║  🖥️  Dashboard: http://localhost:${PORT}                      ║`);
    console.log(`║  📱 Mobile endpoint: POST http://<your-ip>:${PORT}/sos        ║`);
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  To get your IP for mobile connection:                     ║');
    console.log('║  Windows: ipconfig | Find "IPv4 Address"                   ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
});
