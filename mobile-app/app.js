/**
 * RescueLink - Professional Emergency App
 * Clean, reliable, trustworthy
 */

// ==========================================
// Configuration
// ==========================================
const CONFIG = {
    HOLD_DURATION: 3000,
    GATEWAY: localStorage.getItem('gateway') || 'http://localhost:5000',
    SYNC_INTERVAL: 5000
};

// State
let db = null;
let connected = false;
let currentLocation = null;
let battery = null;
let motionState = 'Still';
let pendingAlert = null; // Holds alert waiting for emergency type

// ==========================================
// Initialization
// ==========================================
async function init() {
    console.log('🚀 RescueLink initializing...');

    initTheme();
    await initDB();
    initTime();
    initLocation();
    initBattery();
    initMotionDetection();
    initSOSButton();
    initHistoryPanel();
    initMotionTooltip();

    await checkConnection();
    setInterval(checkConnection, CONFIG.SYNC_INTERVAL);

    updateAlertBadge();
    console.log('✅ Ready');
}

// ==========================================
// Database
// ==========================================
async function initDB() {
    return new Promise((resolve) => {
        const req = indexedDB.open('RescueLink', 1);
        req.onsuccess = () => { db = req.result; resolve(); };
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore('alerts', { keyPath: 'id' });
        };
    });
}

async function saveAlert(alert) {
    return new Promise((resolve) => {
        const tx = db.transaction(['alerts'], 'readwrite');
        tx.objectStore('alerts').put(alert);
        tx.oncomplete = () => resolve();
    });
}

async function getAlerts() {
    return new Promise((resolve) => {
        const tx = db.transaction(['alerts'], 'readonly');
        const req = tx.objectStore('alerts').getAll();
        req.onsuccess = () => resolve(req.result || []);
    });
}

// ==========================================
// Theme Toggle (Dark/Light Mode)
// ==========================================
function initTheme() {
    const toggle = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');
    const savedTheme = localStorage.getItem('theme');

    // Apply saved theme or detect system preference
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-mode');
        document.documentElement.classList.remove('light-mode');
        icon.textContent = '☀️';
    } else if (savedTheme === 'light') {
        document.documentElement.classList.add('light-mode');
        document.documentElement.classList.remove('dark-mode');
        icon.textContent = '🌙';
    } else {
        // Use system preference (default)
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        icon.textContent = prefersDark ? '☀️' : '🌙';
    }

    toggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark-mode');
        const isLight = document.documentElement.classList.contains('light-mode');

        if (isDark) {
            // Switch to light
            document.documentElement.classList.remove('dark-mode');
            document.documentElement.classList.add('light-mode');
            localStorage.setItem('theme', 'light');
            icon.textContent = '🌙';
        } else if (isLight) {
            // Switch to dark
            document.documentElement.classList.remove('light-mode');
            document.documentElement.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
            icon.textContent = '☀️';
        } else {
            // No preference set, toggle based on current appearance
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
                document.documentElement.classList.add('light-mode');
                localStorage.setItem('theme', 'light');
                icon.textContent = '🌙';
            } else {
                document.documentElement.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');
                icon.textContent = '☀️';
            }
        }
    });
}

// ==========================================
// Time Display
// ==========================================
function initTime() {
    const update = () => {
        const now = new Date();
        document.getElementById('currentTime').textContent =
            now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };
    update();
    setInterval(update, 1000);
}

// ==========================================
// Location
// ==========================================
function initLocation() {
    if (!navigator.geolocation) {
        document.getElementById('locationText').textContent = 'Location unavailable';
        return;
    }

    navigator.geolocation.watchPosition(
        (pos) => {
            currentLocation = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            };

            document.getElementById('locationText').textContent =
                `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`;
            document.getElementById('accuracyText').textContent =
                `±${Math.round(currentLocation.accuracy)}m`;
            document.getElementById('locationCard').classList.add('ready');
            document.getElementById('locStatus').textContent = '●';
        },
        (err) => {
            document.getElementById('locationText').textContent = 'Enable location access';
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ==========================================
// Battery
// ==========================================
async function initBattery() {
    if (!navigator.getBattery) {
        document.getElementById('batteryText').textContent = 'N/A';
        return;
    }

    const bat = await navigator.getBattery();
    const update = () => {
        battery = Math.round(bat.level * 100);
        document.getElementById('batteryText').textContent = battery + '%';
    };
    update();
    bat.addEventListener('levelchange', update);
}

// ==========================================
// Motion Detection
// How it works:
// - Uses device accelerometer (DeviceMotionEvent API)
// - Calculates total acceleration magnitude
// - Compares against gravity (~9.81 m/s²)
// - If difference > 1.5 m/s², device is moving
// - If no significant motion for 5+ seconds, marked as "Still"
// ==========================================
function initMotionDetection() {
    let lastMotionTime = Date.now();

    if ('DeviceMotionEvent' in window) {
        window.addEventListener('devicemotion', (event) => {
            const acc = event.accelerationIncludingGravity;
            if (!acc || acc.x === null) return;

            // Calculate total acceleration magnitude
            // At rest, this should be ~9.81 (gravity)
            const totalAcc = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);

            // If acceleration deviates from gravity by >1.5 m/s², we're moving
            if (Math.abs(totalAcc - 9.81) > 1.5) {
                lastMotionTime = Date.now();
                motionState = 'Moving';
            }
        });
    }

    // Check motion state every 2 seconds
    setInterval(() => {
        // If no motion for 5 seconds, mark as still
        if (Date.now() - lastMotionTime > 5000) {
            motionState = 'Still';
        }

        const el = document.getElementById('motionText');
        if (el) {
            el.textContent = motionState;
        }
    }, 2000);
}

function initMotionTooltip() {
    const chip = document.getElementById('motionChip');
    const tooltip = document.getElementById('motionTooltip');

    if (chip && tooltip) {
        chip.addEventListener('click', () => {
            tooltip.classList.toggle('show');

            // Auto-hide after 5 seconds
            setTimeout(() => {
                tooltip.classList.remove('show');
            }, 5000);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!chip.contains(e.target) && !tooltip.contains(e.target)) {
                tooltip.classList.remove('show');
            }
        });
    }
}

// ==========================================
// SOS Button with Progress Ring
// ==========================================
function initSOSButton() {
    const btn = document.getElementById('sosButton');
    const progressFill = document.getElementById('progressFill');
    const circumference = 2 * Math.PI * 46;

    let timer = null;
    let startTime = null;
    let animFrame = null;

    const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / CONFIG.HOLD_DURATION, 1);
        progressFill.style.strokeDashoffset = circumference * (1 - progress);

        if (progress < 1) {
            animFrame = requestAnimationFrame(updateProgress);
        }
    };

    const startPress = (e) => {
        e.preventDefault();
        startTime = Date.now();
        btn.classList.add('pressing');
        progressFill.style.strokeDashoffset = circumference;
        animFrame = requestAnimationFrame(updateProgress);

        timer = setTimeout(async () => {
            btn.classList.remove('pressing');
            progressFill.style.strokeDashoffset = 0;

            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

            // Show emergency type selection
            showEmergencyTypeSelection();

            setTimeout(() => {
                progressFill.style.strokeDashoffset = circumference;
            }, 500);
        }, CONFIG.HOLD_DURATION);
    };

    const endPress = () => {
        if (timer) clearTimeout(timer);
        if (animFrame) cancelAnimationFrame(animFrame);
        btn.classList.remove('pressing');
        progressFill.style.strokeDashoffset = circumference;
    };

    btn.addEventListener('touchstart', startPress, { passive: false });
    btn.addEventListener('touchend', endPress);
    btn.addEventListener('mousedown', startPress);
    btn.addEventListener('mouseup', endPress);
    btn.addEventListener('mouseleave', endPress);
}

// ==========================================
// Emergency Type Selection
// ==========================================
function showEmergencyTypeSelection() {
    document.getElementById('emergencyTypeOverlay').classList.add('show');
}

// Global function called by onclick
window.selectEmergencyType = async function (type) {
    document.getElementById('emergencyTypeOverlay').classList.remove('show');
    await createSOS(type);
};

// ==========================================
// Create SOS Alert
// ==========================================
async function createSOS(emergencyType = 'general') {
    const id = 'SOS-' + Date.now().toString(36).toUpperCase();

    const alert = {
        id,
        timestamp: new Date().toISOString(),
        location: currentLocation || { lat: 0, lng: 0, accuracy: 10000 },
        battery,
        motion: motionState,
        emergencyType: emergencyType,
        status: 'PENDING'
    };

    // Save locally first (offline-first)
    await saveAlert(alert);

    // Show success overlay immediately
    showSuccess();

    // Try to sync and get rescue team info
    const result = await syncAlert(alert);

    if (result.delivered) {
        const status = document.getElementById('deliveryStatus');
        status.classList.add('done');
        status.querySelector('.status-dot').textContent = '✓';
        status.querySelector('span:last-child').textContent = 'Delivered to rescue center';

        // Show nearest rescue team
        if (result.rescueTeam) {
            document.getElementById('rescueName').textContent = result.rescueTeam.name;
            document.getElementById('rescueDistance').textContent =
                `${result.rescueTeam.distance.toFixed(2)} km away • ${result.rescueTeam.phone}`;
        }
    }

    updateAlertBadge();
}

function showSuccess() {
    document.getElementById('successOverlay').classList.add('show');

    // Reset delivery status
    const status = document.getElementById('deliveryStatus');
    status.classList.remove('done');
    status.querySelector('.status-dot').textContent = '○';
    status.querySelector('span:last-child').textContent = 'Sending to rescue center...';

    // Reset rescue info
    document.getElementById('rescueName').textContent = 'Locating...';
    document.getElementById('rescueDistance').textContent = '';
}

// ==========================================
// Sync
// ==========================================
async function syncAlert(alert) {
    try {
        const res = await fetch(`${CONFIG.GATEWAY}/sos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(alert)
        });

        if (res.ok) {
            const data = await res.json();
            alert.status = 'DELIVERED';
            await saveAlert(alert);
            setConnected(true);

            return {
                delivered: true,
                rescueTeam: data.nearestRescue || data.recommendedTeams?.[0] || null
            };
        }
    } catch (e) {
        console.warn('Sync failed:', e);
    }
    return { delivered: false };
}

async function syncAll() {
    const alerts = await getAlerts();
    for (const a of alerts) {
        if (a.status === 'PENDING') {
            await syncAlert(a);
        }
    }
}

async function checkConnection() {
    try {
        const res = await fetch(`${CONFIG.GATEWAY}/health`);
        if (res.ok) {
            setConnected(true);
            await syncAll();
            return;
        }
    } catch (e) { }
    setConnected(false);
}

function setConnected(online) {
    connected = online;
    const el = document.getElementById('connection');
    el.classList.toggle('online', online);
    el.querySelector('.conn-text').textContent = online ? 'Connected' : 'Offline';
}

// ==========================================
// History Panel
// ==========================================
function initHistoryPanel() {
    document.getElementById('historyBtn').addEventListener('click', openHistory);
    document.getElementById('closeHistory').addEventListener('click', closeHistory);
    document.getElementById('closeSuccess').addEventListener('click', closeSuccess);
}

function openHistory() {
    renderAlerts();
    document.getElementById('historyPanel').classList.add('open');
}

function closeHistory() {
    document.getElementById('historyPanel').classList.remove('open');
}

function closeSuccess() {
    document.getElementById('successOverlay').classList.remove('show');
}

async function renderAlerts() {
    const list = document.getElementById('alertsList');
    const alerts = await getAlerts();

    if (alerts.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <p>No alerts sent yet</p>
            </div>
        `;
        return;
    }

    alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const typeEmojis = {
        flood: '🌊',
        fire: '🔥',
        medical: '🚑',
        accident: '🚗',
        crime: '🚨',
        other: '⚠️',
        general: '🆘'
    };

    list.innerHTML = alerts.map(a => `
        <div class="alert-card ${a.status === 'DELIVERED' ? 'delivered' : ''}">
            <div class="alert-id">${typeEmojis[a.emergencyType] || '🆘'} ${a.id}</div>
            <div class="alert-time">${new Date(a.timestamp).toLocaleString()}</div>
            <span class="alert-badge ${a.status === 'DELIVERED' ? 'delivered' : 'pending'}">
                ${a.status === 'DELIVERED' ? '✓ Delivered' : '⏳ Pending'}
            </span>
        </div>
    `).join('');
}

async function updateAlertBadge() {
    const alerts = await getAlerts();
    const pending = alerts.filter(a => a.status === 'PENDING').length;
    const badge = document.getElementById('alertBadge');
    badge.textContent = pending || '';
}

// ==========================================
// Start
// ==========================================
document.addEventListener('DOMContentLoaded', init);
