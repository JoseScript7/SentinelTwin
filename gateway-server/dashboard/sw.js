// Service Worker for SOS PWA + Inventory Intelligence
// Enables offline functionality + forecast caching + stockout push alerts

const CACHE_NAME = 'sos-pwa-v2';
const FORECAST_CACHE = 'inventory-forecast-v1';

const OFFLINE_URLS = [
    '/mobile-sos.html',
    '/manifest.json',
    '/dashboard/inventory-forecast.html',
    '/dashboard/inventory-forecast.js',
    '/dashboard/inventory-data.json',
    '/dashboard/ai-chatbot.js',
    '/dashboard/nlp-service.js',
    '/dashboard/dashboard.css'
];

// Install - cache essential files + inventory dashboard
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Caching files for offline use (SOS + Inventory)');
                return cache.addAll(OFFLINE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME && key !== FORECAST_CACHE)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch - serve from cache, fallback to network
// Special handling for forecast API: cache forecast results for offline use
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Cache forecast API responses for offline viewing
    if (url.pathname.includes('/api/forecast')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.status === 200) {
                        const clone = response.clone();
                        caches.open(FORECAST_CACHE)
                            .then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    // Return cached forecast when offline
                    return caches.match(event.request).then(cached => {
                        if (cached) {
                            console.log('📊 Serving cached forecast (offline)');
                            return cached;
                        }
                        return new Response(JSON.stringify({ error: 'offline', cached: false }), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    });
                })
        );
        return;
    }

    // Skip other API calls - let them go to network
    if (url.pathname.includes('/api/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then(response => {
                        if (response.status === 200) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, clone));
                        }
                        return response;
                    })
                    .catch(() => {
                        if (event.request.mode === 'navigate') {
                            return caches.match('/mobile-sos.html');
                        }
                    });
            })
    );
});

// Background sync for queued SOS + inventory reorders
self.addEventListener('sync', event => {
    if (event.tag === 'sos-sync') {
        event.waitUntil(syncQueuedSOS());
    }
    if (event.tag === 'inventory-reorder-sync') {
        event.waitUntil(syncQueuedReorders());
    }
});

async function syncQueuedSOS() {
    console.log('🔄 Syncing queued SOS alerts');
}

async function syncQueuedReorders() {
    console.log('📦 Syncing queued inventory reorders');
}

// Push notifications — SOS + Inventory stockout alerts
self.addEventListener('push', event => {
    const data = event.data?.json() || { title: 'Alert', body: 'New alert', type: 'sos' };

    let options = {
        body: data.body,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: { url: data.url || '/', type: data.type }
    };

    // Different notification styles for SOS vs inventory
    if (data.type === 'inventory-stockout') {
        options = {
            ...options,
            icon: '📊',
            badge: '⚠',
            tag: `stockout-${data.skuId || 'unknown'}`,
            actions: [
                { action: 'reorder', title: '📦 Reorder Now' },
                { action: 'dismiss', title: '✕ Dismiss' }
            ],
            data: {
                url: '/dashboard/inventory-forecast.html',
                type: 'inventory-stockout',
                skuId: data.skuId,
                probability: data.probability
            }
        };
    } else {
        // SOS alert
        options.icon = '🆘';
        options.badge = '🆘';
    }

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Handle notification click
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'reorder') {
        // Open inventory dashboard with reorder action
        event.waitUntil(
            clients.openWindow(`/dashboard/inventory-forecast.html?action=reorder&sku=${event.notification.data?.skuId || ''}`)
        );
    } else {
        // Open the relevant page
        const url = event.notification.data?.url || '/';
        event.waitUntil(clients.openWindow(url));
    }
});

// ─── Stockout Alert Helper ─────────────────────────────────────────
// Called from the main thread via message to check stockout thresholds
self.addEventListener('message', event => {
    if (event.data?.type === 'CHECK_STOCKOUT_ALERTS') {
        const results = event.data.results || [];
        const criticalSKUs = results.filter(r =>
            (r.stockoutProbability || 0) > 80
        );

        criticalSKUs.forEach(r => {
            self.registration.showNotification(
                `⚠ Stockout Alert: ${r.sku?.name || r.sku?.sku_id || 'Unknown'}`,
                {
                    body: `${r.stockoutProbability}% chance of stockout within ${r.daysToStockout?.p50 || '?'} days. Current stock: ${r.sku?.current_stock || 0} units.`,
                    icon: '📊',
                    badge: '⚠',
                    tag: `stockout-${r.sku?.sku_id}`,
                    requireInteraction: true,
                    vibrate: [300, 100, 300, 100, 300],
                    data: {
                        url: '/dashboard/inventory-forecast.html',
                        type: 'inventory-stockout',
                        skuId: r.sku?.sku_id,
                        probability: r.stockoutProbability
                    },
                    actions: [
                        { action: 'reorder', title: '📦 Reorder' },
                        { action: 'dismiss', title: '✕ Dismiss' }
                    ]
                }
            );
        });

        // Report back
        event.source?.postMessage({
            type: 'STOCKOUT_ALERTS_CHECKED',
            criticalCount: criticalSKUs.length
        });
    }
});
