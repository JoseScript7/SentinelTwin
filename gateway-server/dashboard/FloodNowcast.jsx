/**
 * AI-Based Urban Flood Nowcasting & Rapid Risk Intelligence Platform
 * Chennai Metropolitan Area - Real-time Flood Prediction System
 * 
 * Features:
 * - Physics-informed risk engine with zone propagation
 * - Interactive canvas map with Chennai zones
 * - Demo storm simulation (90 seconds)
 * - 6-hour historical + 15-min prediction chart
 * - Live social media feed with NLP keyword detection
 * - Active SOS integration
 * - Shelter & evacuation panel
 * - SMS alert log
 */

import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine, Legend
} from 'recharts';
import {
    AlertTriangle, MapPin, Users, Clock, MessageSquare, Phone,
    Play, Square, Navigation, Home, Shield, Radio, Droplets,
    TrendingUp, TrendingDown, Minus, Bell, Send
} from 'lucide-react';

// ==========================================
// CHENNAI ZONE DATA (Real Geography)
// ==========================================
const ZONES = {
    C: {
        id: 'C',
        name: 'Porur / Kundrathur / Gerugambakkam',
        shortName: 'Porur',
        elevation: 3.2,
        drainage: 0.42,
        color: '#ef4444',
        neighbors: ['B', 'E'],
        // Canvas polygon coordinates (normalized 0-1, will scale to canvas)
        polygon: [[0.15, 0.45], [0.35, 0.40], [0.40, 0.55], [0.30, 0.65], [0.15, 0.60]],
        center: [0.27, 0.52],
        shelters: [
            { name: 'Porur Community Hall', capacity: 500, distance: '0.8 km', status: 'open' },
            { name: 'Kundrathur School', capacity: 300, distance: '1.2 km', status: 'open' },
            { name: 'Gerugambakkam Temple', capacity: 200, distance: '1.5 km', status: 'full' }
        ],
        evacRoutes: ['NH-4 → Tambaram via Poonamallee', 'Kundrathur Road → Chromepet']
    },
    D: {
        id: 'D',
        name: 'Velachery / Adyar',
        shortName: 'Velachery',
        elevation: 4.8,
        drainage: 0.55,
        color: '#f97316',
        neighbors: ['A', 'C'],
        polygon: [[0.50, 0.55], [0.70, 0.50], [0.75, 0.65], [0.65, 0.75], [0.50, 0.70]],
        center: [0.62, 0.63],
        shelters: [
            { name: 'Velachery Stadium', capacity: 1000, distance: '0.5 km', status: 'open' },
            { name: 'Adyar Community Center', capacity: 400, distance: '1.0 km', status: 'open' }
        ],
        evacRoutes: ['Velachery Main Road → Guindy', 'Adyar Bridge → Besant Nagar']
    },
    A: {
        id: 'A',
        name: 'Marina Beach / Mylapore',
        shortName: 'Marina',
        elevation: 1.9,
        drainage: 0.70,
        color: '#3b82f6',
        neighbors: ['D', 'B'],
        polygon: [[0.70, 0.25], [0.90, 0.20], [0.92, 0.45], [0.75, 0.50], [0.70, 0.40]],
        center: [0.80, 0.36],
        shelters: [
            { name: 'Marina Beach Shelter', capacity: 800, distance: '0.3 km', status: 'open' },
            { name: 'Mylapore Temple Hall', capacity: 350, distance: '0.7 km', status: 'open' }
        ],
        evacRoutes: ['Marina Road → Triplicane', 'Mylapore → T. Nagar via Cathedral Road']
    },
    B: {
        id: 'B',
        name: 'T. Nagar / Kodambakkam',
        shortName: 'T. Nagar',
        elevation: 6.1,
        drainage: 0.63,
        color: '#eab308',
        neighbors: ['A', 'C', 'E'],
        polygon: [[0.40, 0.25], [0.65, 0.22], [0.68, 0.40], [0.50, 0.50], [0.38, 0.45]],
        center: [0.52, 0.36],
        shelters: [
            { name: 'T. Nagar Bus Depot', capacity: 600, distance: '0.4 km', status: 'open' },
            { name: 'Kodambakkam School', capacity: 250, distance: '0.9 km', status: 'open' }
        ],
        evacRoutes: ['Usman Road → Nungambakkam', 'Kodambakkam → Ashok Nagar']
    },
    E: {
        id: 'E',
        name: 'Ambattur / Avadi',
        shortName: 'Ambattur',
        elevation: 7.4,
        drainage: 0.68,
        color: '#22c55e',
        neighbors: ['B', 'C'],
        polygon: [[0.10, 0.15], [0.35, 0.12], [0.38, 0.35], [0.15, 0.40], [0.08, 0.30]],
        center: [0.22, 0.26],
        shelters: [
            { name: 'Ambattur Industrial Estate', capacity: 1200, distance: '0.6 km', status: 'open' },
            { name: 'Avadi Military Ground', capacity: 2000, distance: '2.0 km', status: 'open' }
        ],
        evacRoutes: ['Ambattur Road → Padi', 'Avadi Highway → Thiruvallur']
    }
};

// Risk calculation weights
const WEIGHTS = {
    elevation: 0.18,
    drainage: 0.15,
    rainfall: 0.25,
    sarWater: 0.22,
    socialMedia: 0.12,
    neighborPropagation: 0.08
};

// Simulated social media posts
const SOCIAL_POSTS = [
    { text: "Ground floor flooded in Porur 🚨 Water entering homes", zone: 'C', keywords: ['flooded', 'Water'] },
    { text: "Road near Kundrathur completely submerged, cars stuck", zone: 'C', keywords: ['submerged', 'stuck'] },
    { text: "SOS family trapped in Gerugambakkam, need rescue boat", zone: 'C', keywords: ['SOS', 'trapped', 'rescue'] },
    { text: "Velachery underpass underwater, avoid area!", zone: 'D', keywords: ['underwater', 'avoid'] },
    { text: "Adyar river overflowing near bridge #ChennaiFloods", zone: 'D', keywords: ['overflowing'] },
    { text: "Heavy waterlogging in T. Nagar market area", zone: 'B', keywords: ['waterlogging'] },
    { text: "Kodambakkam drain burst, streets flooding fast", zone: 'B', keywords: ['drain', 'flooding'] },
    { text: "Marina Beach road flooded, sea water entering", zone: 'A', keywords: ['flooded', 'sea water'] },
    { text: "Mylapore temple street knee-deep water 😰", zone: 'A', keywords: ['water'] },
    { text: "Ambattur safe so far but rain intensifying", zone: 'E', keywords: ['rain'] },
    { text: "Porur lake overflowing! EVACUATE NOW", zone: 'C', keywords: ['overflowing', 'EVACUATE'] },
    { text: "Stranded at Kundrathur junction, water rising", zone: 'C', keywords: ['Stranded', 'water rising'] },
    { text: "Emergency! Children stuck on terrace Velachery", zone: 'D', keywords: ['Emergency', 'stuck'] },
    { text: "Power cut entire Gerugambakkam area 😭", zone: 'C', keywords: ['Power cut'] },
    { text: "Boats needed urgently Porur area #FloodRelief", zone: 'C', keywords: ['Boats', 'urgently', 'FloodRelief'] }
];

// Active SOS data
const INITIAL_SOS = [
    { id: 'SOS-001', zone: 'C', desc: 'Family of 4 stranded, ground floor flooded', time: '5m ago', status: 'active' },
    { id: 'SOS-002', zone: 'D', desc: 'Elderly person needs medical evacuation', time: '12m ago', status: 'responded' },
    { id: 'SOS-003', zone: 'B', desc: 'Vehicle stuck in underpass', time: '18m ago', status: 'active' },
    { id: 'SOS-004', zone: 'A', desc: 'Shop flooding, goods need rescue', time: '25m ago', status: 'responded' },
    { id: 'SOS-005', zone: 'C', desc: 'Children trapped in school building', time: '8m ago', status: 'active' }
];

// ==========================================
// RISK ENGINE
// ==========================================
function calculateRisk(zoneId, state) {
    const zone = ZONES[zoneId];
    const { rainfall, sarData, socialSignals, zoneRisks } = state;

    // Elevation factor (lower = higher risk, normalize to 0-1)
    const elevationFactor = 1 - (zone.elevation / 10);

    // Drainage factor (lower = higher risk)
    const drainageFactor = 1 - zone.drainage;

    // Rainfall factor (mm, normalize max 200mm)
    const rainfallFactor = Math.min(rainfall / 200, 1);

    // SAR water detection factor
    const sarFactor = sarData[zoneId] || 0;

    // Social media signals factor (normalize max 20 signals)
    const socialFactor = Math.min((socialSignals[zoneId] || 0) / 20, 1);

    // Neighbor propagation
    let neighborBoost = 0;
    zone.neighbors.forEach(neighborId => {
        const neighborRisk = zoneRisks[neighborId] || 0;
        if (neighborRisk > 75) {
            neighborBoost += 0.20; // +20% if neighbor is critical
        } else if (neighborRisk > 50) {
            neighborBoost += 0.10;
        }
    });
    neighborBoost = Math.min(neighborBoost, 0.30); // Cap at 30%

    // Weighted sum
    const baseRisk = (
        elevationFactor * WEIGHTS.elevation +
        drainageFactor * WEIGHTS.drainage +
        rainfallFactor * WEIGHTS.rainfall +
        sarFactor * WEIGHTS.sarWater +
        socialFactor * WEIGHTS.socialMedia
    ) * 100;

    const finalRisk = Math.min(baseRisk + (neighborBoost * 100 * WEIGHTS.neighborPropagation / 0.08), 100);

    return Math.round(finalRisk);
}

// ==========================================
// STATE REDUCER
// ==========================================
const initialState = {
    stormActive: false,
    stormTime: 0,
    rainfall: 0,
    sarData: { A: 0, B: 0, C: 0, D: 0, E: 0 },
    socialSignals: { A: 0, B: 0, C: 0, D: 0, E: 0 },
    zoneRisks: { A: 12, B: 15, C: 18, D: 14, E: 8 },
    targetRisks: { A: 12, B: 15, C: 18, D: 14, E: 8 },
    selectedZone: 'C',
    socialFeed: [],
    smsAlerts: [],
    sosList: [...INITIAL_SOS],
    historicalData: generateHistoricalData()
};

function generateHistoricalData() {
    const data = [];
    for (let i = -360; i <= 15; i += 5) {
        data.push({
            time: i,
            label: i < 0 ? `${Math.abs(i)}m ago` : i === 0 ? 'Now' : `+${i}m`,
            A: 10 + Math.random() * 5,
            B: 12 + Math.random() * 5,
            C: 15 + Math.random() * 8,
            D: 12 + Math.random() * 6,
            E: 6 + Math.random() * 4,
            isPrediction: i > 0
        });
    }
    return data;
}

function stateReducer(state, action) {
    switch (action.type) {
        case 'START_STORM':
            return { ...state, stormActive: true, stormTime: 0 };
        case 'STOP_STORM':
            return {
                ...initialState,
                selectedZone: state.selectedZone,
                smsAlerts: state.smsAlerts
            };
        case 'TICK': {
            const newTime = state.stormTime + 1;
            const newState = { ...state, stormTime: newTime };

            // Storm progression timeline
            if (newTime <= 15) {
                // Phase 1: Heavy rain begins
                newState.rainfall = Math.min(newTime * 8, 120);
            } else if (newTime <= 30) {
                // Phase 2: SAR detects water in Zone C
                newState.rainfall = Math.min(120 + (newTime - 15) * 4, 180);
                newState.sarData = {
                    ...state.sarData,
                    C: Math.min((newTime - 15) * 0.06, 0.9),
                    D: Math.min((newTime - 20) * 0.02, 0.3)
                };
            } else if (newTime <= 45) {
                // Phase 3: Social signals spike
                newState.rainfall = Math.min(180 + (newTime - 30) * 2, 210);
                newState.sarData = {
                    ...state.sarData,
                    C: Math.min(0.9 + (newTime - 30) * 0.005, 0.95),
                    D: Math.min(0.3 + (newTime - 30) * 0.03, 0.6),
                    B: Math.min((newTime - 35) * 0.02, 0.25)
                };
                newState.socialSignals = {
                    ...state.socialSignals,
                    C: Math.min((newTime - 30) * 3, 45),
                    D: Math.min((newTime - 35) * 1.5, 15)
                };
            } else if (newTime <= 60) {
                // Phase 4: Risk crosses 75%, propagation begins
                newState.rainfall = 210;
                newState.sarData = {
                    ...state.sarData,
                    C: 0.95,
                    D: Math.min(0.6 + (newTime - 45) * 0.02, 0.8),
                    B: Math.min(0.25 + (newTime - 45) * 0.015, 0.4),
                    E: Math.min((newTime - 50) * 0.01, 0.15)
                };
                newState.socialSignals = {
                    ...state.socialSignals,
                    C: 47,
                    D: Math.min(15 + (newTime - 45) * 1, 25),
                    B: Math.min((newTime - 50) * 0.8, 8)
                };
            } else if (newTime <= 75) {
                // Phase 5: Second alert, neighbor propagation
                newState.sarData = {
                    ...state.sarData,
                    D: 0.85,
                    E: Math.min(0.15 + (newTime - 60) * 0.02, 0.35)
                };
                newState.socialSignals = {
                    ...state.socialSignals,
                    D: 30,
                    E: Math.min((newTime - 60) * 0.5, 8)
                };
            } else {
                // Phase 6: Storm peaks
                newState.rainfall = 220;
            }

            // Calculate new risks with smooth interpolation
            const newTargetRisks = {};
            const newZoneRisks = {};
            Object.keys(ZONES).forEach(zoneId => {
                newTargetRisks[zoneId] = calculateRisk(zoneId, newState);
                const current = state.zoneRisks[zoneId];
                const target = newTargetRisks[zoneId];
                const diff = target - current;
                const step = Math.sign(diff) * Math.min(Math.abs(diff), 3);
                newZoneRisks[zoneId] = Math.round(current + step);
            });
            newState.targetRisks = newTargetRisks;
            newState.zoneRisks = newZoneRisks;

            // Update historical data with current values
            newState.historicalData = state.historicalData.map((point, idx) => {
                if (idx === state.historicalData.length - 4) { // "Now" point
                    return { ...point, ...newZoneRisks };
                }
                return point;
            });

            return newState;
        }
        case 'ADD_SOCIAL_POST':
            return {
                ...state,
                socialFeed: [action.post, ...state.socialFeed].slice(0, 20)
            };
        case 'ADD_SMS_ALERT':
            return {
                ...state,
                smsAlerts: [action.alert, ...state.smsAlerts]
            };
        case 'ADD_SOS':
            return {
                ...state,
                sosList: [action.sos, ...state.sosList].slice(0, 8)
            };
        case 'SELECT_ZONE':
            return { ...state, selectedZone: action.zoneId };
        default:
            return state;
    }
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function FloodNowcast() {
    const [state, dispatch] = useReducer(stateReducer, initialState);
    const canvasRef = useRef(null);
    const stormIntervalRef = useRef(null);
    const socialPostIndexRef = useRef(0);
    const alertsFiredRef = useRef({ C: false, D: false });

    const {
        stormActive, stormTime, rainfall, zoneRisks, selectedZone,
        socialFeed, smsAlerts, sosList, historicalData, sarData, socialSignals
    } = state;

    // ==========================================
    // STORM SIMULATION
    // ==========================================
    const startStorm = useCallback(() => {
        dispatch({ type: 'START_STORM' });
        socialPostIndexRef.current = 0;
        alertsFiredRef.current = { C: false, D: false };

        stormIntervalRef.current = setInterval(() => {
            dispatch({ type: 'TICK' });
        }, 1000);
    }, []);

    const stopStorm = useCallback(() => {
        if (stormIntervalRef.current) {
            clearInterval(stormIntervalRef.current);
            stormIntervalRef.current = null;
        }
        dispatch({ type: 'STOP_STORM' });
    }, []);

    // Add social posts during storm
    useEffect(() => {
        if (stormActive && stormTime > 30 && stormTime % 3 === 0) {
            if (socialPostIndexRef.current < SOCIAL_POSTS.length) {
                const post = SOCIAL_POSTS[socialPostIndexRef.current];
                dispatch({
                    type: 'ADD_SOCIAL_POST',
                    post: {
                        ...post,
                        id: Date.now(),
                        timestamp: new Date().toLocaleTimeString(),
                        confidence: 75 + Math.floor(Math.random() * 20)
                    }
                });
                socialPostIndexRef.current++;
            }
        }
    }, [stormActive, stormTime]);

    // Fire SMS alerts when risk exceeds 75%
    useEffect(() => {
        if (stormActive) {
            Object.keys(ZONES).forEach(zoneId => {
                if (zoneRisks[zoneId] >= 75 && !alertsFiredRef.current[zoneId]) {
                    alertsFiredRef.current[zoneId] = true;
                    dispatch({
                        type: 'ADD_SMS_ALERT',
                        alert: {
                            id: Date.now(),
                            zone: zoneId,
                            zoneName: ZONES[zoneId].name,
                            risk: zoneRisks[zoneId],
                            timestamp: new Date().toLocaleTimeString(),
                            recipients: Math.floor(2000 + Math.random() * 2000),
                            message: `[NDMA-TN] 🚨 FLOOD WARNING — Zone: ${ZONES[zoneId].name}. Risk: ${zoneRisks[zoneId]}%. Action: EVACUATE to nearest shelter immediately.`
                        }
                    });

                    // Also add a new SOS
                    dispatch({
                        type: 'ADD_SOS',
                        sos: {
                            id: `SOS-${Date.now().toString().slice(-4)}`,
                            zone: zoneId,
                            desc: `Emergency evacuation needed - ${ZONES[zoneId].shortName}`,
                            time: 'Just now',
                            status: 'active'
                        }
                    });
                }
            });
        }
    }, [stormActive, zoneRisks]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (stormIntervalRef.current) {
                clearInterval(stormIntervalRef.current);
            }
        };
    }, []);

    // ==========================================
    // CANVAS MAP RENDERING
    // ==========================================
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines (terrain effect)
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for (let i = 0; i < width; i += 30) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
        }
        for (let i = 0; i < height; i += 30) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
            ctx.stroke();
        }

        // Draw zones
        Object.entries(ZONES).forEach(([zoneId, zone]) => {
            const risk = zoneRisks[zoneId];
            const isSelected = selectedZone === zoneId;

            // Determine color based on risk
            let fillColor;
            if (risk >= 75) {
                fillColor = 'rgba(239, 68, 68, 0.6)'; // Red
            } else if (risk >= 50) {
                fillColor = 'rgba(249, 115, 22, 0.5)'; // Orange
            } else if (risk >= 25) {
                fillColor = 'rgba(234, 179, 8, 0.4)'; // Yellow
            } else {
                fillColor = 'rgba(34, 197, 94, 0.3)'; // Green
            }

            // Draw polygon
            ctx.beginPath();
            zone.polygon.forEach((point, idx) => {
                const x = point[0] * width;
                const y = point[1] * height;
                if (idx === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.closePath();

            // Fill
            ctx.fillStyle = fillColor;
            ctx.fill();

            // Stroke
            ctx.strokeStyle = isSelected ? '#ffffff' : '#64748b';
            ctx.lineWidth = isSelected ? 3 : 1.5;
            ctx.stroke();

            // Pulsing glow for high risk zones
            if (risk >= 75) {
                const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.5;
                ctx.shadowBlur = 20 * pulse;
                ctx.shadowColor = '#ef4444';
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Zone label
            const centerX = zone.center[0] * width;
            const centerY = zone.center[1] * height;

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Zone ${zoneId}`, centerX, centerY - 8);

            ctx.font = '12px Inter, sans-serif';
            ctx.fillText(`${risk}%`, centerX, centerY + 8);

            // SAR water detection indicator
            if (sarData[zoneId] > 0.3) {
                ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
                ctx.beginPath();
                ctx.arc(centerX - 25, centerY + 20, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = '10px Inter';
                ctx.fillText('💧', centerX - 25, centerY + 24);
            }

            // Social media cluster indicator
            if (socialSignals[zoneId] > 10) {
                ctx.fillStyle = 'rgba(168, 85, 247, 0.8)';
                ctx.beginPath();
                ctx.arc(centerX + 25, centerY + 20, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 8px Inter';
                ctx.textAlign = 'center';
                ctx.fillText(socialSignals[zoneId], centerX + 25, centerY + 23);
            }

            // Shelter pins
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.arc(centerX, centerY + 35, 5, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw legend
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Inter';
        ctx.textAlign = 'left';
        ctx.fillText('🟢 Low (<25%)  🟡 Elevated  🟠 Moderate  🔴 High (>75%)', 10, height - 10);

    }, [zoneRisks, selectedZone, sarData, socialSignals]);

    // Handle canvas click
    const handleCanvasClick = useCallback((e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        // Check which zone was clicked
        Object.entries(ZONES).forEach(([zoneId, zone]) => {
            const centerX = zone.center[0];
            const centerY = zone.center[1];
            const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            if (dist < 0.15) {
                dispatch({ type: 'SELECT_ZONE', zoneId });
            }
        });
    }, []);

    // ==========================================
    // RENDER HELPERS
    // ==========================================
    const getRiskColor = (risk) => {
        if (risk >= 75) return '#ef4444';
        if (risk >= 50) return '#f97316';
        if (risk >= 25) return '#eab308';
        return '#22c55e';
    };

    const getRiskLabel = (risk) => {
        if (risk >= 75) return 'HIGH';
        if (risk >= 50) return 'MODERATE';
        if (risk >= 25) return 'ELEVATED';
        return 'LOW';
    };

    const getTrendIcon = (zoneId) => {
        const current = zoneRisks[zoneId];
        const target = state.targetRisks[zoneId];
        if (target > current + 2) return <TrendingUp size={14} className="text-red-400" />;
        if (target < current - 2) return <TrendingDown size={14} className="text-green-400" />;
        return <Minus size={14} className="text-gray-400" />;
    };

    const selectedZoneData = ZONES[selectedZone];
    const selectedRisk = zoneRisks[selectedZone];

    // ==========================================
    // JSX RENDER
    // ==========================================
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            color: '#e2e8f0',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: '16px'
        }}>
            {/* Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                padding: '12px 20px',
                background: 'rgba(30, 41, 59, 0.8)',
                borderRadius: '12px',
                backdropFilter: 'blur(10px)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Droplets size={28} style={{ color: '#3b82f6' }} />
                    <div>
                        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
                            AI Flood Nowcasting
                        </h1>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            Chennai Metropolitan Area
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        background: stormActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                        borderRadius: '20px',
                        border: `1px solid ${stormActive ? '#ef4444' : '#22c55e'}`
                    }}>
                        <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: stormActive ? '#ef4444' : '#22c55e',
                            animation: stormActive ? 'pulse 1s infinite' : 'none'
                        }} />
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>
                            {stormActive ? `Storm Active: ${stormTime}s` : 'System Ready'}
                        </span>
                    </div>

                    {!stormActive ? (
                        <button
                            onClick={startStorm}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 20px',
                                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#fff',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'transform 0.2s'
                            }}
                        >
                            <Play size={18} /> Launch Demo Storm
                        </button>
                    ) : (
                        <button
                            onClick={stopStorm}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 20px',
                                background: '#ef4444',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#fff',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            <Square size={18} /> Stop Storm
                        </button>
                    )}

                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>RAINFALL</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#3b82f6' }}>
                            {Math.round(rainfall)} mm
                        </div>
                    </div>
                </div>
            </header>

            {/* Zone Summary Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '12px',
                marginBottom: '16px'
            }}>
                {Object.entries(ZONES).map(([zoneId, zone]) => {
                    const risk = zoneRisks[zoneId];
                    const isSelected = selectedZone === zoneId;
                    const isHigh = risk >= 75;

                    return (
                        <div
                            key={zoneId}
                            onClick={() => dispatch({ type: 'SELECT_ZONE', zoneId })}
                            style={{
                                padding: '12px',
                                background: isSelected
                                    ? 'rgba(59, 130, 246, 0.2)'
                                    : 'rgba(30, 41, 59, 0.6)',
                                borderRadius: '10px',
                                border: `2px solid ${isSelected ? '#3b82f6' : 'transparent'}`,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                animation: isHigh ? 'pulse 1.5s infinite' : 'none'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '8px'
                            }}>
                                <span style={{
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    color: getRiskColor(risk)
                                }}>
                                    Zone {zoneId}
                                </span>
                                {getTrendIcon(zoneId)}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                                {zone.shortName}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    fontSize: '22px',
                                    fontWeight: 700,
                                    color: getRiskColor(risk)
                                }}>
                                    {risk}%
                                </span>
                                <span style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: getRiskColor(risk),
                                    color: risk >= 50 ? '#000' : '#fff'
                                }}>
                                    {getRiskLabel(risk)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Main Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 380px',
                gap: '16px'
            }}>
                {/* Left Column: Map + Chart */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Canvas Map */}
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '12px',
                        padding: '12px',
                        position: 'relative'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px'
                        }}>
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                                <MapPin size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                Chennai Flood Risk Map
                            </h3>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                Click zone to select
                            </div>
                        </div>
                        <canvas
                            ref={canvasRef}
                            width={700}
                            height={400}
                            onClick={handleCanvasClick}
                            style={{
                                width: '100%',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        />
                    </div>

                    {/* Historical + Prediction Chart */}
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '12px',
                        padding: '16px'
                    }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
                            <Clock size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                            Zone {selectedZone} - 6hr History + 15min Prediction
                        </h3>
                        <ResponsiveContainer width="100%" height={180}>
                            <AreaChart data={historicalData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                                    interval={10}
                                />
                                <YAxis
                                    domain={[0, 100]}
                                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '8px'
                                    }}
                                />
                                <ReferenceLine x="Now" stroke="#ef4444" strokeDasharray="5 5" />
                                <Area
                                    type="monotone"
                                    dataKey={selectedZone}
                                    stroke={getRiskColor(selectedRisk)}
                                    fill={getRiskColor(selectedRisk)}
                                    fillOpacity={0.3}
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Right Column: Panels */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Zone Details */}
                    <div style={{
                        background: `linear-gradient(135deg, ${getRiskColor(selectedRisk)}22, transparent)`,
                        borderRadius: '12px',
                        padding: '14px',
                        borderLeft: `4px solid ${getRiskColor(selectedRisk)}`
                    }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 700 }}>
                            Zone {selectedZone} — {selectedZoneData.shortName}
                        </h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '8px',
                            fontSize: '12px'
                        }}>
                            <div>📍 {selectedZoneData.name}</div>
                            <div>📏 Elevation: {selectedZoneData.elevation}m</div>
                            <div>🚰 Drainage: {Math.round(selectedZoneData.drainage * 100)}%</div>
                            <div>🌊 SAR Water: {Math.round((sarData[selectedZone] || 0) * 100)}%</div>
                            <div>📱 Social Signals: {socialSignals[selectedZone] || 0}</div>
                            <div style={{
                                fontWeight: 700,
                                color: getRiskColor(selectedRisk)
                            }}>
                                ⚠️ Risk: {selectedRisk}%
                            </div>
                        </div>
                        {selectedRisk >= 75 && (
                            <div style={{
                                marginTop: '10px',
                                padding: '8px',
                                background: 'rgba(239, 68, 68, 0.2)',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600
                            }}>
                                🚨 HIGH FLOOD PROBABILITY (&gt;85%) — Flooding likely within 15 minutes
                            </div>
                        )}
                    </div>

                    {/* Social Media Feed */}
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '12px',
                        padding: '12px',
                        maxHeight: '200px',
                        overflow: 'hidden'
                    }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>
                            <MessageSquare size={14} style={{ marginRight: '6px' }} />
                            Live Social Feed ({socialFeed.length})
                        </h3>
                        <div style={{
                            maxHeight: '160px',
                            overflowY: 'auto',
                            fontSize: '11px'
                        }}>
                            {socialFeed.length === 0 ? (
                                <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
                                    No distress signals detected
                                </div>
                            ) : (
                                socialFeed.map(post => (
                                    <div key={post.id} style={{
                                        padding: '8px',
                                        marginBottom: '6px',
                                        background: 'rgba(15, 23, 42, 0.6)',
                                        borderRadius: '6px',
                                        borderLeft: `3px solid ${ZONES[post.zone]?.color || '#64748b'}`
                                    }}>
                                        <div style={{ marginBottom: '4px' }}>
                                            {post.text.split(' ').map((word, i) => (
                                                <span key={i} style={{
                                                    color: post.keywords?.some(k =>
                                                        word.toLowerCase().includes(k.toLowerCase())
                                                    ) ? '#ef4444' : 'inherit',
                                                    fontWeight: post.keywords?.some(k =>
                                                        word.toLowerCase().includes(k.toLowerCase())
                                                    ) ? 700 : 400
                                                }}>
                                                    {word}{' '}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            color: '#64748b',
                                            fontSize: '10px'
                                        }}>
                                            <span>Zone {post.zone} • {post.timestamp}</span>
                                            <span style={{ color: '#22c55e' }}>
                                                {post.confidence}% match
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Active SOS */}
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '12px',
                        padding: '12px',
                        maxHeight: '180px',
                        overflow: 'hidden'
                    }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>
                            <AlertTriangle size={14} style={{ marginRight: '6px', color: '#ef4444' }} />
                            Active SOS ({sosList.filter(s => s.status === 'active').length})
                        </h3>
                        <div style={{ maxHeight: '140px', overflowY: 'auto', fontSize: '11px' }}>
                            {sosList.slice(0, 5).map(sos => {
                                const isFloodRelated = zoneRisks[sos.zone] >= 50;
                                return (
                                    <div key={sos.id} style={{
                                        padding: '8px',
                                        marginBottom: '6px',
                                        background: 'rgba(15, 23, 42, 0.6)',
                                        borderRadius: '6px',
                                        borderLeft: `3px solid ${isFloodRelated ? '#ef4444' : '#64748b'}`,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                                                {sos.id}
                                                {isFloodRelated && (
                                                    <span style={{
                                                        marginLeft: '6px',
                                                        padding: '1px 4px',
                                                        background: '#ef4444',
                                                        borderRadius: '3px',
                                                        fontSize: '9px'
                                                    }}>
                                                        🌊 Flood
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ color: '#94a3b8' }}>
                                                Zone {sos.zone} • {sos.desc.slice(0, 30)}...
                                            </div>
                                        </div>
                                        <span style={{
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '10px',
                                            background: sos.status === 'active'
                                                ? 'rgba(239, 68, 68, 0.3)'
                                                : 'rgba(34, 197, 94, 0.3)',
                                            color: sos.status === 'active' ? '#ef4444' : '#22c55e'
                                        }}>
                                            {sos.status}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Shelters */}
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '12px',
                        padding: '12px'
                    }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>
                            <Home size={14} style={{ marginRight: '6px', color: '#22c55e' }} />
                            Shelters — Zone {selectedZone}
                        </h3>
                        <div style={{ fontSize: '11px' }}>
                            {selectedZoneData.shelters.map((shelter, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '6px 0',
                                    borderBottom: '1px solid #334155'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{shelter.name}</div>
                                        <div style={{ color: '#64748b' }}>
                                            {shelter.distance} • Cap: {shelter.capacity}
                                        </div>
                                    </div>
                                    <span style={{
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        background: shelter.status === 'open'
                                            ? 'rgba(34, 197, 94, 0.3)'
                                            : 'rgba(239, 68, 68, 0.3)',
                                        color: shelter.status === 'open' ? '#22c55e' : '#ef4444'
                                    }}>
                                        {shelter.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: '10px' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                                <Navigation size={12} style={{ marginRight: '4px' }} />
                                Evacuation Routes:
                            </div>
                            {selectedZoneData.evacRoutes.map((route, i) => (
                                <div key={i} style={{
                                    fontSize: '10px',
                                    color: '#94a3b8',
                                    padding: '2px 0'
                                }}>
                                    → {route}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* SMS Alerts Log */}
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '12px',
                        padding: '12px'
                    }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>
                            <Bell size={14} style={{ marginRight: '6px', color: '#f97316' }} />
                            SMS Alert Log ({smsAlerts.length})
                        </h3>
                        <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '10px' }}>
                            {smsAlerts.length === 0 ? (
                                <div style={{ color: '#64748b', textAlign: 'center', padding: '15px' }}>
                                    No alerts triggered
                                </div>
                            ) : (
                                smsAlerts.map(alert => (
                                    <div key={alert.id} style={{
                                        padding: '8px',
                                        marginBottom: '6px',
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        borderRadius: '6px',
                                        borderLeft: '3px solid #ef4444'
                                    }}>
                                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                                            {alert.message}
                                        </div>
                                        <div style={{ color: '#64748b' }}>
                                            {alert.timestamp} • {alert.recipients.toLocaleString()} recipients
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
            `}</style>
        </div>
    );
}
