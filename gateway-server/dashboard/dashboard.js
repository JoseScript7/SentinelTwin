/**
 * RescueLink Admin Dashboard - Enhanced Version
 * Features: Clustering, Confidence Scoring, Timeline, Escalation
 */

// ==========================================
// State
// ==========================================
let map = null;
let ws = null;
let sosAlerts = [];
let rescueTeams = [];
let markers = { sos: {}, rescue: {} };
let markerClusterGroup = null;
let clusteringEnabled = true;
let selectedSOS = null;
let currentFilter = 'all';

// Escalation config (accelerated for demo)
const ESCALATION_CONFIG = {
    UNRESPONSIVE_TIMEOUT: 60000,  // 1 min for demo
    CASUALTY_TIMEOUT: 120000,     // 2 min for demo
    HIGHLIGHT_TIMEOUT: 30000      // 30 sec highlight new alerts
};

// ==========================================
// WebSocket Connection
// ==========================================
function connectWebSocket() {
    const wsUrl = `ws://${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✅ Connected to Gateway');
        updateConnectionStatus('connected');
    };

    ws.onclose = () => {
        console.log('❌ Disconnected from Gateway');
        updateConnectionStatus('disconnected');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus('disconnected');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'INIT':
            sosAlerts = data.sosAlerts || [];
            rescueTeams = data.rescueTeams || [];
            renderInitialState();
            break;
        case 'NEW_SOS':
            handleNewSOS(data.sos);
            break;
        case 'STATUS_UPDATE':
            handleStatusUpdate(data.sos);
            break;
    }
}

function updateConnectionStatus(status) {
    const indicator = document.getElementById('connectionIndicator');
    const dot = indicator.querySelector('.indicator-dot');
    const text = indicator.querySelector('.indicator-text');

    dot.className = 'indicator-dot ' + status;
    text.textContent = status === 'connected' ? 'Live' : 'Reconnecting...';
}

// ==========================================
// Confidence Score Helpers
// ==========================================
function getConfidenceLevel(score) {
    if (score >= 70) return { level: 'high', label: 'High Risk', color: '#ff5252' };
    if (score >= 40) return { level: 'medium', label: 'Medium Risk', color: '#ffab40' };
    return { level: 'low', label: 'Low Risk', color: '#69f0ae' };
}

function calculateConfidenceScore(sos) {
    if (sos.confidenceScore) return sos.confidenceScore;

    let score = 50;

    if (sos.motion === 'stationary') score += 20;
    else if (sos.motion === 'moving') score -= 10;

    if (sos.battery !== null) {
        if (sos.battery < 10) score += 25;
        else if (sos.battery < 25) score += 15;
    }

    const timeSince = Date.now() - new Date(sos.timestamp).getTime();
    if (timeSince > 1800000) score += 15;
    else if (timeSince > 600000) score += 10;

    return Math.max(0, Math.min(100, score));
}

// ==========================================
// Map Initialization
// ==========================================
function initMap() {
    // Center on Tamil Nadu state to show all rescue teams
    map = L.map('map', {
        center: [11.1271, 78.6569],  // Tamil Nadu center
        zoom: 7,                      // State-wide view
        zoomControl: true
    });

    // Base layers - multiple map options
    const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '©CartoDB', maxZoom: 19
    });

    const googleSatellite = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        attribution: '©Google Maps', maxZoom: 20
    });

    const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '©Google Maps', maxZoom: 20
    });

    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '©Esri', maxZoom: 19
    });

    const osmStreets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '©OpenStreetMap', maxZoom: 19
    });

    // Add default layer
    darkMap.addTo(map);

    // Layer control
    const baseLayers = {
        '🌙 Dark Mode': darkMap,
        '🛰️ Google Satellite': googleSatellite,
        '🗺️ Google Hybrid': googleHybrid,
        '🌍 ESRI Satellite': esriSatellite,
        '🛣️ Streets': osmStreets
    };

    // Emergency services overlay layers
    window.emergencyLayers = {
        hospitals: L.layerGroup(),
        police: L.layerGroup(),
        fireStations: L.layerGroup()
    };

    const overlays = {
        '🏥 Hospitals': window.emergencyLayers.hospitals,
        '🚔 Police Stations': window.emergencyLayers.police,
        '🚒 Fire Stations': window.emergencyLayers.fireStations
    };

    L.control.layers(baseLayers, overlays, { position: 'topright' }).addTo(map);

    // Initialize marker cluster group
    markerClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
            const count = cluster.getChildCount();
            return L.divIcon({
                html: `<div style="
                    background: linear-gradient(135deg, #ff5252, #ff1744);
                    color: white;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 14px;
                    border: 3px solid white;
                    box-shadow: 0 0 20px rgba(255,82,82,0.5);
                ">${count}</div>`,
                className: 'custom-cluster',
                iconSize: [40, 40]
            });
        }
    });

    if (clusteringEnabled) {
        map.addLayer(markerClusterGroup);
    }

    // Add rescue team markers
    rescueTeams.forEach(addRescueTeamMarker);

    // Load emergency services markers
    loadEmergencyServices();

    // Setup map controls
    document.getElementById('toggleClustering').addEventListener('click', toggleClustering);
    document.getElementById('centerMap').addEventListener('click', centerOnAlerts);
}

// Load emergency services (hospitals, police, fire stations)
function loadEmergencyServices() {
    // Chennai area emergency services
    const emergencyServices = {
        hospitals: [
            { name: 'Government General Hospital', lat: 13.0827, lng: 80.2707, type: 'government' },
            { name: 'Rajiv Gandhi Govt Hospital', lat: 13.0615, lng: 80.2303, type: 'government' },
            { name: 'Stanley Medical College Hospital', lat: 13.1143, lng: 80.2852, type: 'government' },
            { name: 'Kilpauk Medical College Hospital', lat: 13.0850, lng: 80.2384, type: 'government' },
            { name: 'Apollo Hospital', lat: 13.0097, lng: 80.2271, type: 'private' },
            { name: 'MIOT Hospital', lat: 12.9857, lng: 80.2025, type: 'private' },
            { name: 'Fortis Malar Hospital', lat: 13.0067, lng: 80.2565, type: 'private' },
            { name: 'Vijaya Hospital', lat: 13.0400, lng: 80.2300, type: 'private' }
        ],
        police: [
            { name: 'Chennai Police HQ', lat: 13.0827, lng: 80.2707, type: 'headquarters' },
            { name: 'Anna Nagar Police Station', lat: 13.0850, lng: 80.2100, type: 'station' },
            { name: 'T Nagar Police Station', lat: 13.0412, lng: 80.2339, type: 'station' },
            { name: 'Adyar Police Station', lat: 13.0067, lng: 80.2565, type: 'station' },
            { name: 'Velachery Police Station', lat: 12.9815, lng: 80.2180, type: 'station' },
            { name: 'Porur Police Station', lat: 13.0359, lng: 80.1566, type: 'station' }
        ],
        fireStations: [
            { name: 'Chennai Fire & Rescue HQ', lat: 13.0670, lng: 80.2520, type: 'headquarters' },
            { name: 'Adyar Fire Station', lat: 13.0067, lng: 80.2565, type: 'station' },
            { name: 'Kodambakkam Fire Station', lat: 13.0500, lng: 80.2250, type: 'station' },
            { name: 'Perambur Fire Station', lat: 13.1150, lng: 80.2350, type: 'station' }
        ]
    };

    // Add hospital markers
    emergencyServices.hospitals.forEach(h => {
        const icon = L.divIcon({
            className: 'emergency-marker',
            html: `<div style="
                background: ${h.type === 'government' ? '#22c55e' : '#3b82f6'};
                width: 28px; height: 28px; border-radius: 6px;
                display: flex; align-items: center; justify-content: center;
                font-size: 14px; border: 2px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);">🏥</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14]
        });
        const marker = L.marker([h.lat, h.lng], { icon });
        marker.bindPopup(`<b>${h.name}</b><br>Type: ${h.type}<br><a href="https://maps.google.com/?q=${h.lat},${h.lng}" target="_blank">Navigate →</a>`);
        window.emergencyLayers.hospitals.addLayer(marker);
    });

    // Add police markers
    emergencyServices.police.forEach(p => {
        const icon = L.divIcon({
            className: 'emergency-marker',
            html: `<div style="
                background: #3b82f6;
                width: 28px; height: 28px; border-radius: 6px;
                display: flex; align-items: center; justify-content: center;
                font-size: 14px; border: 2px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);">🚔</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14]
        });
        const marker = L.marker([p.lat, p.lng], { icon });
        marker.bindPopup(`<b>${p.name}</b><br>Type: ${p.type}<br>Emergency: 100`);
        window.emergencyLayers.police.addLayer(marker);
    });

    // Add fire station markers
    emergencyServices.fireStations.forEach(f => {
        const icon = L.divIcon({
            className: 'emergency-marker',
            html: `<div style="
                background: #dc2626;
                width: 28px; height: 28px; border-radius: 6px;
                display: flex; align-items: center; justify-content: center;
                font-size: 14px; border: 2px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);">🚒</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14]
        });
        const marker = L.marker([f.lat, f.lng], { icon });
        marker.bindPopup(`<b>${f.name}</b><br>Emergency: 101`);
        window.emergencyLayers.fireStations.addLayer(marker);
    });

    // Add all layers to map by default
    window.emergencyLayers.hospitals.addTo(map);
    window.emergencyLayers.police.addTo(map);
    window.emergencyLayers.fireStations.addTo(map);

    console.log('🏥 Emergency services loaded');
}


function toggleClustering() {
    const btn = document.getElementById('toggleClustering');
    clusteringEnabled = !clusteringEnabled;
    btn.classList.toggle('active', clusteringEnabled);

    if (clusteringEnabled) {
        // Move markers to cluster
        Object.values(markers.sos).forEach(marker => {
            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
            markerClusterGroup.addLayer(marker);
        });
        map.addLayer(markerClusterGroup);
    } else {
        // Remove from cluster, add to map
        map.removeLayer(markerClusterGroup);
        Object.values(markers.sos).forEach(marker => {
            markerClusterGroup.removeLayer(marker);
            marker.addTo(map);
        });
    }
}

function centerOnAlerts() {
    if (sosAlerts.length === 0) return;

    const bounds = L.latLngBounds(
        sosAlerts.map(sos => [sos.location?.lat || 0, sos.location?.lng || 0])
    );
    map.fitBounds(bounds, { padding: [50, 50] });
}

function addRescueTeamMarker(team) {
    const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background: #40c4ff;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ">${getTeamIcon(team.type)}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });

    const marker = L.marker([team.lat, team.lng], { icon }).addTo(map);
    marker.bindPopup(`
        <div style="min-width: 200px; padding: 4px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="font-size: 24px;">${getTeamIcon(team.type)}</span>
                <div>
                    <strong style="font-size: 14px; display: block;">${team.name}</strong>
                    <span style="color: #888; font-size: 11px; text-transform: uppercase;">${team.type} • ${team.jurisdiction || 'Local'}</span>
                </div>
            </div>
            <div style="background: #1a1a2e; padding: 8px; border-radius: 8px; margin-bottom: 8px;">
                <div style="font-size: 11px; color: #888; margin-bottom: 4px;">📞 EMERGENCY CONTACT</div>
                <div style="font-size: 18px; font-weight: bold; color: #40c4ff;">${team.contact}</div>
            </div>
            <a href="tel:${team.contact}" 
               style="display: block; text-align: center; background: #40c4ff; color: #000; 
                      padding: 10px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                📞 Call Now
            </a>
            <div style="font-size: 10px; color: #666; margin-top: 6px; text-align: center;">
                Status: <span style="color: ${team.status === 'available' ? '#69f0ae' : '#ff5252'};">
                    ${team.status === 'available' ? '✓ Available' : '⏳ Busy'}
                </span>
            </div>
        </div>
    `);

    markers.rescue[team.id] = marker;
}

function getTeamIcon(type) {
    const icons = {
        fire: '🚒',
        medical: '🚑',
        police: '🚔',
        disaster: '🆘',
        flood: '🚤',
        safety: '🛡️',
        unified: '📞',
        municipal: '🏛️',
        utility: '⚡'
    };
    return icons[type] || '📍';
}

// Store accuracy circles separately
let accuracyCircles = {};

function addSOSMarker(sos) {
    if (!sos.location) return;

    const confidence = getConfidenceLevel(calculateConfidenceScore(sos));

    // Remove existing accuracy circle if any
    if (accuracyCircles[sos.id]) {
        map.removeLayer(accuracyCircles[sos.id]);
    }

    // Add accuracy circle (shows search radius)
    const accuracy = sos.location.accuracy || 100;
    if (accuracy > 5 && accuracy < 10000) {
        const circleColor = accuracy < 50 ? '#69f0ae' : accuracy < 200 ? '#ffab40' : '#ff5252';
        const circle = L.circle([sos.location.lat, sos.location.lng], {
            radius: accuracy,
            color: circleColor,
            fillColor: circleColor,
            fillOpacity: 0.15,
            weight: 2,
            dashArray: '5, 5'
        }).addTo(map);

        circle.bindTooltip(`Search radius: ±${Math.round(accuracy)}m`, {
            permanent: false,
            direction: 'top'
        });

        accuracyCircles[sos.id] = circle;
    }

    const icon = L.divIcon({
        className: 'sos-marker-container',
        html: `<div class="sos-marker" style="
            background: ${confidence.color};
            width: 44px;
            height: 44px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            border: 3px solid white;
            box-shadow: 0 0 20px ${confidence.color}80;
            animation: pulse-marker 2s infinite;
        ">🆘</div>
        <style>
            @keyframes pulse-marker {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
        </style>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
    });

    const marker = L.marker([sos.location.lat, sos.location.lng], { icon });

    // Create popup with ML recommendations
    const recommendedTeamsHtml = sos.recommendedTeams && sos.recommendedTeams.length > 0
        ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #444;">
            <strong style="font-size: 11px; color: #888;">ML RECOMMENDED:</strong><br>
            ${sos.recommendedTeams.slice(0, 2).map(t => `
                <span style="font-size: 11px; color: #40c4ff;">${t.name}</span>
                <span style="font-size: 10px; color: #888;">(${t.matchScore}pts)</span><br>
            `).join('')}
           </div>`
        : '';

    marker.bindPopup(`
        <div style="min-width: 200px;">
            <strong style="color: ${confidence.color}; font-size: 14px;">${sos.id}</strong><br>
            <span style="
                display: inline-block;
                padding: 2px 8px;
                background: ${confidence.color}30;
                color: ${confidence.color};
                border-radius: 10px;
                font-size: 11px;
                font-weight: 600;
                margin: 4px 0;
            ">${confidence.label}</span>
            ${sos.emergencyType ? `<span style="
                display: inline-block;
                padding: 2px 8px;
                background: #40c4ff30;
                color: #40c4ff;
                border-radius: 10px;
                font-size: 11px;
                margin-left: 4px;
            ">${sos.emergencyType.toUpperCase()}</span>` : ''}<br>
            <span style="color: #888; font-size: 12px;">Status: ${sos.emergencyStatus}</span><br>
            <span style="color: #888; font-size: 12px;">Battery: ${sos.battery || '--'}%</span><br>
            <span style="color: #888; font-size: 12px;">Accuracy: ±${Math.round(sos.location.accuracy || 0)}m</span><br>
            <span style="color: #888; font-size: 12px;">${new Date(sos.timestamp).toLocaleString()}</span>
            ${recommendedTeamsHtml}
        </div>
    `);

    if (markers.sos[sos.id]) {
        // Update existing
        if (clusteringEnabled) {
            markerClusterGroup.removeLayer(markers.sos[sos.id]);
        } else {
            map.removeLayer(markers.sos[sos.id]);
        }
    }

    markers.sos[sos.id] = marker;

    if (clusteringEnabled) {
        markerClusterGroup.addLayer(marker);
    } else {
        marker.addTo(map);
    }
}

// ==========================================
// Alert Handling
// ==========================================
function handleNewSOS(sos) {
    const existingIndex = sosAlerts.findIndex(s => s.id === sos.id);
    if (existingIndex === -1) {
        sosAlerts.unshift(sos);
    } else {
        sosAlerts[existingIndex] = sos;
    }

    playAlertSound();
    addSOSMarker(sos);

    // Center map on new SOS
    if (sos.location) {
        map.setView([sos.location.lat, sos.location.lng], 15);
    }

    renderAlertsList();
    updateStats();

    console.log('🆘 New SOS:', sos.id);
}

function handleStatusUpdate(sos) {
    const index = sosAlerts.findIndex(s => s.id === sos.id);
    if (index !== -1) {
        sosAlerts[index] = sos;
    }

    addSOSMarker(sos);
    renderAlertsList();
    updateStats();
}

function playAlertSound() {
    const audio = document.getElementById('alertSound');
    audio.currentTime = 0;
    audio.play().catch(e => console.log('Audio blocked:', e));

    // Flash title
    let originalTitle = document.title;
    let count = 0;
    const flashInterval = setInterval(() => {
        document.title = count % 2 === 0 ? '🚨 NEW SOS!' : originalTitle;
        if (++count > 10) {
            clearInterval(flashInterval);
            document.title = originalTitle;
        }
    }, 500);
}

// ==========================================
// UI Rendering
// ==========================================
function renderInitialState() {
    initMap();
    rescueTeams.forEach(addRescueTeamMarker);
    sosAlerts.forEach(addSOSMarker);
    renderAlertsList();
    updateStats();
    setupFilterTabs();
}

function setupFilterTabs() {
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            renderAlertsList();
        });
    });
}

function renderAlertsList() {
    const container = document.getElementById('alertsList');

    let filtered = [...sosAlerts];

    // Apply filter
    if (currentFilter === 'new') {
        filtered = filtered.filter(s => s.adminStatus === 'NEW');
    } else if (currentFilter === 'critical') {
        filtered = filtered.filter(s => {
            const score = calculateConfidenceScore(s);
            return score >= 70;
        });
    }

    // Sort by confidence score (highest first), then by timestamp
    filtered.sort((a, b) => {
        const scoreA = calculateConfidenceScore(a);
        const scoreB = calculateConfidenceScore(b);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.timestamp) - new Date(a.timestamp);
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="no-alerts">
                <div class="no-alerts-icon">📡</div>
                <p>${currentFilter === 'all' ? 'Waiting for SOS alerts...' : 'No matching alerts'}</p>
                <p class="no-alerts-sub">Connect mobile devices to receive emergency signals</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(sos => renderAlertCard(sos)).join('');

    // Add click handlers
    container.querySelectorAll('.alert-card').forEach(card => {
        card.addEventListener('click', () => {
            const sosId = card.dataset.sosId;
            const sos = sosAlerts.find(s => s.id === sosId);
            if (sos) showAlertModal(sos);
        });
    });
}

function renderAlertCard(sos) {
    const time = new Date(sos.timestamp).toLocaleString();
    const isNew = sos.adminStatus === 'NEW';
    const confidenceScore = calculateConfidenceScore(sos);
    const confidence = getConfidenceLevel(confidenceScore);

    // Time since received
    const timeSince = getTimeAgo(sos.receivedAt || sos.timestamp);

    // Emergency type emoji
    const typeEmojis = {
        flood: '🌊',
        fire: '🔥',
        medical: '🚑',
        accident: '🚗',
        crime: '🚨',
        other: '⚠️',
        general: '🆘'
    };
    const typeEmoji = typeEmojis[sos.emergencyType] || '🆘';

    // Rescue teams section
    let rescueHtml = '';
    if (sos.recommendedTeams && sos.recommendedTeams.length > 0) {
        const topTeams = sos.recommendedTeams.slice(0, 2);
        rescueHtml = `
            <div class="alert-rescue">
                <div class="rescue-label">🚨 NEAREST RESCUE UNITS</div>
                ${topTeams.map((team, i) => `
                    <div class="rescue-team ${i === 0 ? 'primary' : ''}">
                        <span class="rescue-icon">${getTeamIcon(team.type)}</span>
                        <div class="rescue-info">
                            <div class="rescue-name">${team.name}</div>
                            <div class="rescue-meta">${team.distance?.toFixed(2) || '--'} km • ${team.phone || team.contact}</div>
                        </div>
                        <span class="rescue-score">${team.matchScore}pts</span>
                    </div>
                `).join('')}
            </div>
        `;
    } else if (sos.nearestTeam) {
        rescueHtml = `
            <div class="alert-rescue">
                <div class="rescue-label">🚨 NEAREST RESCUE UNIT</div>
                <div class="rescue-team primary">
                    <span class="rescue-icon">${getTeamIcon(sos.nearestTeam.type)}</span>
                    <div class="rescue-info">
                        <div class="rescue-name">${sos.nearestTeam.name}</div>
                        <div class="rescue-meta">${sos.nearestTeam.distance?.toFixed(2) || '--'} km away</div>
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="alert-card ${confidence.level} ${isNew ? 'new' : ''}" data-sos-id="${sos.id}">
            <div class="alert-header">
                <div>
                    <div class="alert-id">${sos.id}</div>
                    <div class="alert-time">${time}</div>
                </div>
                <div class="alert-badges">
                    <span class="badge confidence-${confidence.level}">${confidence.label}</span>
                    <span class="badge status-${sos.emergencyStatus?.toLowerCase() || 'active'}">${sos.emergencyType ? typeEmoji + ' ' + sos.emergencyType.toUpperCase() : sos.emergencyStatus || 'ACTIVE'}</span>
                    ${isNew ? '<span class="badge status-new">NEW</span>' : ''}
                </div>
            </div>
            <div class="alert-details">
                <div class="detail-item">
                    <span class="detail-label">📍 LOCATION</span>
                    <span class="detail-value">${sos.location?.lat?.toFixed(4) || '--'}, ${sos.location?.lng?.toFixed(4) || '--'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">🔋 BATTERY</span>
                    <span class="detail-value">${sos.battery || '--'}%${sos.charging ? ' ⚡' : ''}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">📶 MOTION</span>
                    <span class="detail-value">${sos.motion || 'Unknown'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">⏱️ RECEIVED</span>
                    <span class="detail-value">${timeSince}</span>
                </div>
            </div>
            ${rescueHtml}
        </div>
    `;
}

function getTimeAgo(dateString) {
    if (!dateString) return 'Just now';
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
}

function updateStats() {
    let critical = 0, warning = 0, active = 0, resolved = 0;

    sosAlerts.forEach(sos => {
        const score = calculateConfidenceScore(sos);

        // Count resolved (DISPATCHED or RESOLVED)
        if (sos.adminStatus === 'DISPATCHED' || sos.adminStatus === 'RESOLVED') {
            resolved++;
        } else {
            // Active alerts
            active++;
            if (score >= 70) critical++;
            else if (score >= 40) warning++;
        }
    });

    document.getElementById('criticalCount').textContent = critical;
    document.getElementById('warningCount').textContent = warning;
    document.getElementById('activeCount').textContent = active;
    document.getElementById('resolvedCount').textContent = resolved;
}

// ==========================================
// Modal
// ==========================================
function showAlertModal(sos) {
    selectedSOS = sos;
    const modal = document.getElementById('alertModal');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const actions = document.getElementById('modalActions');

    const confidence = getConfidenceLevel(calculateConfidenceScore(sos));

    title.innerHTML = `<span style="color: ${confidence.color}">${sos.id}</span>`;

    body.innerHTML = `
        <div class="detail-grid">
            <div class="detail-box">
                <div class="label">Risk Level</div>
                <div class="value" style="color: ${confidence.color}">${confidence.label}</div>
            </div>
            <div class="detail-box">
                <div class="label">Emergency Status</div>
                <div class="value">${sos.emergencyStatus || 'ACTIVE'}</div>
            </div>
            <div class="detail-box">
                <div class="label">Location</div>
                <div class="value">${sos.location?.lat?.toFixed(6) || '--'}, ${sos.location?.lng?.toFixed(6) || '--'}</div>
            </div>
            <div class="detail-box">
                <div class="label">Accuracy</div>
                <div class="value">${sos.location?.accuracy ? Math.round(sos.location.accuracy) + 'm' : 'N/A'}</div>
            </div>
            <div class="detail-box">
                <div class="label">Battery</div>
                <div class="value">${sos.battery || '--'}%${sos.charging ? ' (Charging)' : ''}</div>
            </div>
            <div class="detail-box">
                <div class="label">Motion</div>
                <div class="value">${sos.motion || 'Unknown'}</div>
            </div>
        </div>
        
        ${sos.nearestTeam ? `
            <div class="alert-rescue" style="margin-bottom: 16px;">
                <div class="rescue-label">Nearest Rescue Unit</div>
                <div class="rescue-name">${sos.nearestTeam.name}</div>
                <div class="rescue-distance">${sos.nearestTeam.distance} km away • ${sos.nearestTeam.contact}</div>
            </div>
        ` : ''}
        
        ${renderTimeline(sos)}
    `;

    // Action buttons based on workflow stage
    // Workflow: NEW → ACKNOWLEDGED → DISPATCHED → RESOLVED
    let actionsHtml = '';

    switch (sos.adminStatus) {
        case 'NEW':
            actionsHtml = `
                <button class="btn btn-acknowledge" onclick="updateSOSStatus('${sos.id}', 'ACKNOWLEDGED')">
                    ✓ Acknowledge Alert
                </button>
                ${sos.recommendedTeams?.[0] ? `
                    <a href="tel:${sos.recommendedTeams[0].phone || sos.recommendedTeams[0].contact}" class="btn btn-call">
                        📞 Call ${sos.recommendedTeams[0].name}
                    </a>
                ` : ''}
            `;
            break;

        case 'ACKNOWLEDGED':
            actionsHtml = `
                <button class="btn btn-action" onclick="updateSOSStatus('${sos.id}', 'DISPATCHED')">
                    🚀 Dispatch Rescue Team
                </button>
                ${sos.recommendedTeams?.[0] ? `
                    <a href="tel:${sos.recommendedTeams[0].phone || sos.recommendedTeams[0].contact}" class="btn btn-call">
                        📞 Call ${sos.recommendedTeams[0].name}
                    </a>
                ` : ''}
            `;
            break;

        case 'DISPATCHED':
            actionsHtml = `
                <button class="btn btn-resolve" onclick="updateSOSStatus('${sos.id}', 'RESOLVED')">
                    ✅ Mark as Resolved
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            `;
            break;

        case 'RESOLVED':
            actionsHtml = `
                <div style="text-align: center; color: var(--status-success); font-weight: 600;">
                    ✅ This alert has been resolved
                </div>
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            `;
            break;

        default:
            actionsHtml = `
                <button class="btn btn-acknowledge" onclick="updateSOSStatus('${sos.id}', 'ACKNOWLEDGED')">
                    ✓ Acknowledge Alert
                </button>
            `;
    }

    actions.innerHTML = actionsHtml;

    modal.classList.add('show');
}

function renderTimeline(sos) {
    const timeline = sos.timeline || [];
    if (timeline.length === 0) {
        timeline.push({ action: 'RECEIVED', time: sos.receivedAt || sos.timestamp, note: 'SOS received at gateway' });
    }

    // Add current status to timeline
    const statusEvents = [
        { action: sos.adminStatus || 'NEW', time: sos.statusUpdatedAt || sos.receivedAt, note: `Current status` }
    ];

    const allEvents = [...timeline, ...statusEvents].sort((a, b) =>
        new Date(a.time) - new Date(b.time)
    );

    const getTimelineClass = (action) => {
        if (['DELIVERED', 'ACKNOWLEDGED', 'ACTION_INITIATED'].includes(action)) return 'active';
        if (['SYNC_FAILED', 'UNRESPONSIVE', 'POSSIBLE_CASUALTY'].includes(action)) return 'error';
        if (['SYNC_ATTEMPT', 'CREATED'].includes(action)) return 'warning';
        return '';
    };

    return `
        <div class="timeline">
            <div class="timeline-title">📋 Action Timeline</div>
            <div class="timeline-list">
                ${allEvents.map(event => `
                    <div class="timeline-item ${getTimelineClass(event.action)}">
                        <div class="timeline-action">${event.action}</div>
                        <div class="timeline-time">${new Date(event.time).toLocaleString()}</div>
                        ${event.note ? `<div class="timeline-note">${event.note}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function closeModal() {
    document.getElementById('alertModal').classList.remove('show');
    selectedSOS = null;
}

async function updateSOSStatus(sosId, status) {
    try {
        const response = await fetch(`/api/sos/${sosId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminStatus: status })
        });

        if (response.ok) {
            console.log(`✅ Status updated: ${sosId} → ${status}`);
            closeModal();
        }
    } catch (error) {
        console.error('Failed to update status:', error);
    }
}

// ==========================================
// Initialize
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing RescueLink Dashboard...');

    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('alertModal').addEventListener('click', (e) => {
        if (e.target.id === 'alertModal') closeModal();
    });

    connectWebSocket();

    // Periodic stats update
    setInterval(updateStats, 10000);
});
