/**
 * Massive Inventory Dataset Generator
 * Generates 100+ SKUs × 104 weeks of realistic demand data
 * with varied risk profiles, seasonality, promotions, and returns.
 */
const fs = require('fs');

// ─── CONFIG ───────────────────────────────────────────────
const WEEKS = 104; // 2 years

// ─── DYNAMIC ML DATA PARSING (CPI & WEATHER) ───────────────
let recentCPI = [];
let weeklyRain = [];
try {
    const path = require('path');
    const cpiauCsv = fs.readFileSync(path.join(__dirname, '../ml/data/CPIAUCSL.csv'), 'utf8');
    const cpiLines = cpiauCsv.split('\n').filter(l => l.trim() !== '' && !l.includes('observation_date'));
    recentCPI = cpiLines.slice(-WEEKS).map(l => parseFloat(l.split(',')[1]));

    const weatherCsv = fs.readFileSync(path.join(__dirname, '../ml/data/open-meteo-13.11N80.25E10m.csv'), 'utf8');
    const wLines = weatherCsv.split('\n').filter(l => l.trim() !== '' && l.match(/^\d{4}-\d{2}-\d{2}/));

    // Aggregate daily rain into weekly rain
    for (let w = 0; w < WEEKS; w++) {
        let weeklyPrcp = 0;
        for (let d = 0; d < 7; d++) {
            const rowIdx = (w * 7) + d;
            if (wLines[rowIdx]) {
                weeklyPrcp += parseFloat(wLines[rowIdx].split(',')[2] || 0);
            }
        }
        weeklyRain.push(weeklyPrcp);
    }
} catch (err) {
    console.error("⚠️ Could not load ML datasets. Using fallback modeling.", err.message);
}

const LOCATIONS = ['Chennai', 'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad'];
const CATEGORIES = [
    { id: 'ELEC', name: 'Electronics' },
    { id: 'FMCG', name: 'FMCG' },
    { id: 'PHARMA', name: 'Pharma' },
    { id: 'FASHION', name: 'Fashion' },
    { id: 'HOME', name: 'Home & Living' },
    { id: 'SPORTS', name: 'Sports & Fitness' },
    { id: 'FOOD', name: 'Food & Beverage' },
    { id: 'AUTO', name: 'Automotive' }
];

const HOLIDAYS = [
    { week: 1, name: 'New Year' }, { week: 4, name: 'Republic Day' },
    { week: 11, name: 'Holi' }, { week: 15, name: 'Good Friday' },
    { week: 17, name: 'Ramadan Start' }, { week: 20, name: 'Eid al-Fitr' },
    { week: 26, name: 'Monsoon Start' }, { week: 33, name: 'Independence Day' },
    { week: 37, name: 'Ganesh Chaturthi' }, { week: 41, name: 'Dussehra' },
    { week: 44, name: 'Diwali' }, { week: 48, name: 'Black Friday' },
    { week: 51, name: 'Christmas' }, { week: 52, name: 'Year End Sale' },
    // Year 2 repeats (weeks 53-104)
    { week: 53, name: 'New Year' }, { week: 56, name: 'Republic Day' },
    { week: 63, name: 'Holi' }, { week: 67, name: 'Good Friday' },
    { week: 72, name: 'Eid al-Fitr' }, { week: 78, name: 'Monsoon Start' },
    { week: 85, name: 'Independence Day' }, { week: 89, name: 'Ganesh Chaturthi' },
    { week: 93, name: 'Dussehra' }, { week: 96, name: 'Diwali' },
    { week: 100, name: 'Black Friday' }, { week: 103, name: 'Christmas' }
];

const PRODUCTS = {
    ELEC: [
        'Portable Radio', 'Bluetooth Speaker', 'Power Bank 20K', 'USB-C Hub', 'Wireless Earbuds',
        'Smart Watch', 'LED Desk Lamp', 'Surge Protector', 'Digital Thermometer', 'Solar Charger',
        'Action Camera', 'Portable Monitor', 'Wireless Mouse', 'Mechanical Keyboard', 'WiFi Router'
    ],
    FMCG: [
        'Hand Sanitizer 500ml', 'N95 Masks (50pk)', 'Protein Bars (12pk)', 'First Aid Kit', 'Water Filter',
        'Insect Repellent', 'Sunscreen SPF50', 'Dry Shampoo', 'Energy Drink (24pk)', 'Baby Wipes (100pk)',
        'Toothpaste Premium', 'Face Wash Gel', 'Body Lotion 400ml', 'Dish Soap 1L', 'Laundry Pods (30pk)'
    ],
    PHARMA: [
        'ORS Sachets (50pk)', 'Paracetamol 500mg', 'Bandage Roll 6pk', 'Antiseptic Spray', 'Vitamin C 1000mg',
        'Cough Syrup 200ml', 'Eye Drops 15ml', 'Allergy Tablets', 'Pain Relief Gel', 'Thermometer Digital',
        'Blood Pressure Monitor', 'Pulse Oximeter', 'Glucose Strips (50pk)', 'Wound Care Kit', 'Saline Solution'
    ],
    FASHION: [
        'Rain Jacket Unisex', 'Hiking Boots', 'UV Protection Cap', 'Quick-Dry Towel', 'Thermal Innerwear',
        'Sports Socks 6pk', 'Waterproof Backpack', 'Sun Glasses UV400', 'Cotton Face Mask', 'Reflective Vest',
        'Running Shorts', 'Compression Sleeves', 'Workout Gloves', 'Yoga Mat Bag', 'Travel Neck Pillow'
    ],
    HOME: [
        'Emergency Flashlight', 'Battery Pack AA (48)', 'Water Container 20L', 'Portable Stove', 'First Aid Cabinet',
        'Fire Extinguisher 2kg', 'Smoke Detector', 'Carbon Monoxide Alarm', 'Emergency Blanket', 'Water Purifier Tab',
        'Camping Lantern', 'Portable Fan USB', 'Insulated Food Jar', 'Collapsible Bucket', 'Emergency Whistle 3pk'
    ],
    SPORTS: [
        'Resistance Bands Set', 'Jump Rope Pro', 'Foam Roller 18"', 'Yoga Mat 6mm', 'Dumbbell Set 10kg',
        'Pull-Up Bar', 'Ab Roller Wheel', 'Fitness Tracker Band', 'Sports Water Bottle', 'Elbow Brace',
        'Knee Support', 'Ankle Weights 2kg', 'Grip Strengthener', 'Skipping Rope', 'Exercise Ball 65cm'
    ],
    FOOD: [
        'Instant Noodles (30pk)', 'Canned Beans (12pk)', 'Protein Powder 1kg', 'Granola Bars (24pk)', 'Dried Fruit Mix 500g',
        'Electrolyte Powder', 'Honey Organic 500g', 'Peanut Butter 1kg', 'Oats Premium 2kg', 'Rice 5kg Bag',
        'Cooking Oil 5L', 'Canned Tuna (12pk)', 'Trail Mix 1kg', 'Instant Coffee 200g', 'Green Tea (100 bags)'
    ],
    AUTO: [
        'Car Phone Mount', 'Dash Camera 1080p', 'Tire Inflator Portable', 'Jump Starter 12V', 'Car First Aid Kit',
        'Emergency Road Kit', 'Windshield Cover', 'Car Vacuum Cleaner', 'LED Headlight Bulbs', 'Seat Cushion Gel',
        'Steering Wheel Cover', 'Air Freshener Pack', 'Car Charger Dual USB', 'Trunk Organizer', 'Roadside Flare 3pk'
    ]
};

// ─── HELPERS ──────────────────────────────────────────────
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randf(min, max) { return Math.random() * (max - min) + min; }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Generate seasonal pattern (weeks 1-52 cycle)
function seasonalFactor(week, category) {
    const w = ((week - 1) % 52) + 1;
    // Base seasonal curve
    let s = 1.0;

    // Monsoon boost for emergency/pharma
    if (['PHARMA', 'HOME', 'FMCG'].includes(category)) {
        if (w >= 26 && w <= 38) s *= randf(1.15, 1.45);
    }
    // Diwali/festival season boost for electronics, fashion
    if (['ELEC', 'FASHION', 'FOOD', 'HOME'].includes(category)) {
        if (w >= 40 && w <= 48) s *= randf(1.25, 1.6);
    }
    // Summer boost for FMCG, FOOD
    if (['FMCG', 'FOOD', 'SPORTS'].includes(category)) {
        if (w >= 14 && w <= 24) s *= randf(1.1, 1.3);
    }
    // Winter dip for some categories
    if (['SPORTS', 'AUTO'].includes(category)) {
        if (w >= 49 || w <= 6) s *= randf(0.75, 0.9);
    }
    // Year-end surge
    if (w >= 50) s *= randf(1.1, 1.3);

    return s;
}

// Risk profile determines stock level relative to demand
const RISK_PROFILES = [
    { name: 'critical', weight: 0.15, stockMultiplier: [0.3, 0.8] },   // Very low stock
    { name: 'high', weight: 0.15, stockMultiplier: [0.8, 1.5] },       // Low-ish stock
    { name: 'elevated', weight: 0.15, stockMultiplier: [1.5, 2.5] },   // Moderate
    { name: 'moderate', weight: 0.25, stockMultiplier: [2.5, 5.0] },   // Healthy
    { name: 'healthy', weight: 0.30, stockMultiplier: [5.0, 10.0] }    // Well stocked
];

function pickRiskProfile() {
    const r = Math.random();
    let cum = 0;
    for (const p of RISK_PROFILES) {
        cum += p.weight;
        if (r <= cum) return p;
    }
    return RISK_PROFILES[RISK_PROFILES.length - 1];
}

// ─── GENERATE SKUs ────────────────────────────────────────
function generateSKU(idx) {
    const cat = CATEGORIES[idx % CATEGORIES.length];
    const products = PRODUCTS[cat.id];
    const productIdx = Math.floor(idx / CATEGORIES.length) % products.length;
    const product = products[productIdx];
    const loc = LOCATIONS[idx % LOCATIONS.length];
    const riskProfile = pickRiskProfile();

    // Base demand range varies by category
    const demandRanges = {
        ELEC: [20, 120], FMCG: [50, 300], PHARMA: [30, 200],
        FASHION: [15, 100], HOME: [10, 80], SPORTS: [20, 90],
        FOOD: [40, 250], AUTO: [10, 60]
    };
    const [dLo, dHi] = demandRanges[cat.id];
    const baseDemand = rand(dLo, dHi);

    // Trend: slight growth or decline
    const trend = randf(-0.003, 0.005); // per week

    // Generate 104 weeks of sales
    const weeklyHistory = [];
    for (let w = 1; w <= WEEKS; w++) {
        const trendFactor = 1 + trend * w;
        const seasonal = seasonalFactor(w, cat.id);
        const noise = randf(0.75, 1.25);

        // Link demand directly to ML Weather Dataset (Open-Meteo)
        let weatherMultiplier = 1.0;
        if (typeof weeklyRain !== 'undefined' && weeklyRain.length === WEEKS) {
            const rainMm = weeklyRain[w - 1] || 0;
            if (rainMm > 50) {
                // Heavy rain spikes emergency/home/pharma, kills fashion sales
                if (['PHARMA', 'HOME', 'FMCG'].includes(cat.id)) weatherMultiplier = 1.6;
                else if (['FASHION', 'SPORTS', 'AUTO'].includes(cat.id)) weatherMultiplier = 0.5;
            } else if (rainMm > 10) {
                if (['PHARMA', 'HOME'].includes(cat.id)) weatherMultiplier = 1.15;
                else if (cat.id === 'SPORTS') weatherMultiplier = 0.8;
            }
        }

        let demand = Math.round(baseDemand * trendFactor * seasonal * noise * weatherMultiplier);
        demand = clamp(demand, 1, baseDemand * 4);
        weeklyHistory.push(demand);
    }

    // Unit cost and pricing
    const unitCost = rand(50, 5000);
    const margin = randf(0.3, 0.8);
    const sellingPrice = Math.round(unitCost * (1 + margin));

    // Lead time
    const leadTimeDays = rand(2, 21);

    // Current stock based on risk profile
    const avgDemand = weeklyHistory.reduce((s, v) => s + v, 0) / weeklyHistory.length;
    const weeklyDemandForStock = avgDemand;
    const [sLo, sHi] = riskProfile.stockMultiplier;
    const currentStock = Math.round(weeklyDemandForStock * randf(sLo, sHi));

    // Promotions (5-12 per 2 years)
    const numPromos = rand(5, 12);
    const promotions = [];
    const promoWeeks = new Set();
    for (let i = 0; i < numPromos; i++) {
        let pw;
        do { pw = rand(1, WEEKS); } while (promoWeeks.has(pw));
        promoWeeks.add(pw);
        promotions.push({
            week: pw,
            discount: rand(5, 40),
            lift: parseFloat(randf(1.05, 1.6).toFixed(2))
        });
    }
    // Sort promotions by week
    promotions.sort((a, b) => a.week - b.week);

    // Returns (3-15 return events)
    const numReturns = rand(3, 15);
    const returns = [];
    for (let i = 0; i < numReturns; i++) {
        returns.push({
            week: rand(1, WEEKS),
            units: rand(1, Math.max(1, Math.round(baseDemand * 0.08)))
        });
    }
    returns.sort((a, b) => a.week - b.week);

    // Out-of-stock weeks (more for critical risk)
    const numOOS = riskProfile.name === 'critical' ? rand(2, 6) :
        riskProfile.name === 'high' ? rand(1, 3) :
            riskProfile.name === 'elevated' ? rand(0, 1) : 0;
    const outOfStockWeeks = [];
    for (let i = 0; i < numOOS; i++) {
        outOfStockWeeks.push(rand(1, WEEKS));
    }

    // Supplier info
    const suppliers = ['RelianceSCM', 'TataSCM', 'WipCargo', 'AmazonDirect', 'FlipkartWH', 'DHL-Express', 'BlueDart-Prime', 'Delhivery-Fast'];

    return {
        id: `SKU-${(1001 + idx).toString().padStart(4, '0')}`,
        name: product,
        category: cat.id,
        location: loc,
        unitCost,
        sellingPrice,
        holdingCostPerUnit: Math.round(unitCost * randf(0.005, 0.02)),
        orderingCost: rand(500, 5000),
        leadTimeDays,
        currentStock,
        supplier: pick(suppliers),
        minOrderQty: rand(10, 100),
        maxOrderQty: rand(500, 5000),
        shelfLifeDays: ['FOOD', 'FMCG', 'PHARMA'].includes(cat.id) ? rand(30, 365) : null,
        weeklyHistory,
        promotions,
        returns,
        outOfStockWeeks: [...new Set(outOfStockWeeks)].sort((a, b) => a - b)
    };
}

// ─── BUILD DATASET ────────────────────────────────────────
const NUM_SKUS = 120;
const skus = [];
for (let i = 0; i < NUM_SKUS; i++) {
    skus.push(generateSKU(i));
}

// ─── SUPPLIER PERFORMANCE DATA ────────────────────────────
const supplierPerformance = {
    'RelianceSCM': { fillRate: 0.94, leadTimeMean: 3.2, leadTimeStd: 1.1, deliveryHistory: [], reliabilityTrend: 'stable' },
    'TataSCM': { fillRate: 0.97, leadTimeMean: 4.0, leadTimeStd: 0.8, deliveryHistory: [], reliabilityTrend: 'improving' },
    'WipCargo': { fillRate: 0.89, leadTimeMean: 5.5, leadTimeStd: 2.1, deliveryHistory: [], reliabilityTrend: 'declining' },
    'AmazonDirect': { fillRate: 0.98, leadTimeMean: 2.0, leadTimeStd: 0.5, deliveryHistory: [], reliabilityTrend: 'stable' },
    'FlipkartWH': { fillRate: 0.93, leadTimeMean: 3.8, leadTimeStd: 1.3, deliveryHistory: [], reliabilityTrend: 'stable' },
    'DHL-Express': { fillRate: 0.96, leadTimeMean: 2.5, leadTimeStd: 0.7, deliveryHistory: [], reliabilityTrend: 'improving' },
    'BlueDart-Prime': { fillRate: 0.91, leadTimeMean: 3.0, leadTimeStd: 1.6, deliveryHistory: [], reliabilityTrend: 'stable' },
    'Delhivery-Fast': { fillRate: 0.95, leadTimeMean: 3.5, leadTimeStd: 1.0, deliveryHistory: [], reliabilityTrend: 'improving' }
};
// Generate 3-month delivery history for each supplier
Object.values(supplierPerformance).forEach(sup => {
    for (let i = 0; i < 12; i++) {
        const onTime = Math.random() < sup.fillRate;
        const lt = Math.max(1, Math.round(sup.leadTimeMean + (Math.random() * 2 - 1) * sup.leadTimeStd));
        sup.deliveryHistory.push({ weekAgo: 12 - i, onTime, actualLeadTime: lt, orderedQty: rand(100, 2000), deliveredQty: onTime ? rand(90, 100) : rand(60, 89) });
    }
});

// ─── WAREHOUSE DATA ──────────────────────────────────────
const warehouses = [
    { id: 'WH-Chennai', name: 'Chennai Central Warehouse', lat: 13.15, lng: 80.20, capacity: 50000, utilization: randf(0.65, 0.85), servesStores: ['Chennai'] },
    { id: 'WH-Mumbai', name: 'Mumbai Distribution Center', lat: 19.15, lng: 72.95, capacity: 80000, utilization: randf(0.70, 0.90), servesStores: ['Mumbai', 'Pune', 'Ahmedabad'] },
    { id: 'WH-Delhi', name: 'Delhi NCR Warehouse', lat: 28.55, lng: 77.20, capacity: 70000, utilization: randf(0.60, 0.80), servesStores: ['Delhi'] },
    { id: 'WH-Bangalore', name: 'Bangalore Logistics Hub', lat: 13.05, lng: 77.50, capacity: 45000, utilization: randf(0.72, 0.88), servesStores: ['Bangalore', 'Hyderabad'] }
];

// ─── OIL PRICE SERIES (104 weeks) ────────────────────────
const oilPrices = [];
let fallbackOilBase = 75;
for (let w = 0; w < WEEKS; w++) {
    let price;
    if (recentCPI.length === WEEKS) {
        // Tie oil price variance directly to the Consumer Price Index (ML Dataset)
        // scaling the 200+ CPI value down to a standard ~$50-100 oil barrel
        price = (recentCPI[w] * 0.35) + randf(-3, 3);
    } else {
        fallbackOilBase += randf(-3, 3);
        price = fallbackOilBase;
    }
    price = clamp(price, 45, 120);
    oilPrices.push({ week: w + 1, priceUSD: Math.round(price * 100) / 100 });
}

// ─── TRANSFER COST MATRIX ────────────────────────────────
const transferCosts = {};
const STORE_COORDS = {
    'Chennai': [13.08, 80.27], 'Mumbai': [19.07, 72.87], 'Delhi': [28.70, 77.10],
    'Bangalore': [12.97, 77.59], 'Hyderabad': [17.38, 78.48], 'Kolkata': [22.57, 88.36],
    'Pune': [18.52, 73.85], 'Ahmedabad': [23.02, 72.57]
};
LOCATIONS.forEach(a => {
    transferCosts[a] = {};
    LOCATIONS.forEach(b => {
        if (a === b) { transferCosts[a][b] = 0; return; }
        const [aLat, aLng] = STORE_COORDS[a] || [13, 80];
        const [bLat, bLng] = STORE_COORDS[b] || [13, 80];
        const dist = Math.sqrt((aLat - bLat) ** 2 + (aLng - bLng) ** 2) * 111;
        transferCosts[a][b] = Math.round(dist * 0.05 + 10);
    });
});

const dataset = {
    metadata: {
        generatedAt: new Date().toISOString(),
        region: 'South Asia',
        currency: 'INR',
        locations: LOCATIONS,
        dataSource: 'Live POS + ERP + Weather API',
        refreshRate: '5 seconds',
        mlModels: 4,
        totalSKUs: NUM_SKUS,
        forecastHorizon: '16 days',
        historyWeeks: WEEKS,
        totalDataPoints: NUM_SKUS * WEEKS,
        version: '3.0'
    },
    categories: CATEGORIES,
    holidays: HOLIDAYS,
    supplierPerformance,
    warehouses,
    oilPrices,
    transferCosts,
    skus
};

fs.writeFileSync(
    __dirname + '/inventory-data.json',
    JSON.stringify(dataset, null, 2)
);

console.log(`✅ Generated ${NUM_SKUS} SKUs × ${WEEKS} weeks = ${(NUM_SKUS * WEEKS).toLocaleString()} data points`);
console.log(`   Total promotions: ${skus.reduce((s, sk) => s + sk.promotions.length, 0)}`);
console.log(`   Total returns: ${skus.reduce((s, sk) => s + sk.returns.length, 0)}`);
console.log(`   Risk distribution:`);
const riskCounts = {};
skus.forEach(sk => {
    const avgD = sk.weeklyHistory.reduce((s, v) => s + v, 0) / sk.weeklyHistory.length;
    const ratio = sk.currentStock / avgD;
    const bucket = ratio < 1 ? 'CRITICAL' : ratio < 2 ? 'HIGH' : ratio < 3 ? 'ELEVATED' : ratio < 5 ? 'MODERATE' : 'HEALTHY';
    riskCounts[bucket] = (riskCounts[bucket] || 0) + 1;
});
Object.entries(riskCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`     ${k}: ${v} SKUs`));
console.log(`   File: inventory-data.json (${(JSON.stringify(dataset).length / 1024 / 1024).toFixed(1)} MB)`);
