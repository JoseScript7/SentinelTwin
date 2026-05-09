// ============================================
// AI ANOMALY EXPLANATION ENGINE
// Inventory Intelligence — Feature Attribution NLG
// Replaces FloodAIChatbot with InventoryAIChatbot
// ============================================

class InventoryAIChatbot {
    constructor() {
        this.conversationHistory = [];
        this.isTyping = false;
        this.lastContext = null; // Current SKU forecast result
    }

    /**
     * Set the current SKU context for feature-aware responses.
     * Called by inventory-forecast.js whenever a SKU is selected.
     * @param {Object} forecastResult - The full result from runForecast()
     */
    setContext(forecastResult) {
        this.lastContext = forecastResult;
    }

    /**
     * Main query handler — routes questions to specialized analyzers.
     */
    async query(userMessage) {
        this.isTyping = true;
        const lowerMessage = userMessage.toLowerCase();
        await this.sleep(600 + Math.random() * 400);

        let response = { text: '', type: 'info', confidence: 85, sources: [] };
        const r = this.lastContext;

        // ─── Route by intent ───────────────────────────────────────
        if (lowerMessage.includes('anomaly') || lowerMessage.includes('unusual') || lowerMessage.includes('spike') || lowerMessage.includes('drop')) {
            response = this.explainAnomaly(r);
        }
        else if (lowerMessage.includes('why') && (lowerMessage.includes('forecast') || lowerMessage.includes('predict'))) {
            response = this.explainForecast(r);
        }
        else if (lowerMessage.includes('risk') || lowerMessage.includes('stockout')) {
            response = this.explainStockoutRisk(r);
        }
        else if (lowerMessage.includes('reorder') || lowerMessage.includes('order') || lowerMessage.includes('replenish')) {
            response = this.explainReplenishment(r);
        }
        else if (lowerMessage.includes('cost') || lowerMessage.includes('capital') || lowerMessage.includes('financial') || lowerMessage.includes('money')) {
            response = this.explainFinancialImpact(r);
        }
        else if (lowerMessage.includes('model') || lowerMessage.includes('accuracy') || lowerMessage.includes('mape')) {
            response = this.explainModel(r);
        }
        else if (lowerMessage.includes('safety stock') || lowerMessage.includes('buffer')) {
            response = this.explainSafetyStock(r);
        }
        else if (lowerMessage.includes('trend') || lowerMessage.includes('pattern') || lowerMessage.includes('seasonal')) {
            response = this.explainTrend(r);
        }
        else {
            response = this.defaultHelp(r);
        }

        this.isTyping = false;
        this.conversationHistory.push({ role: 'user', content: userMessage });
        this.conversationHistory.push({ role: 'assistant', content: response.text });
        return response;
    }

    // ─── Anomaly Explanation (SHAP-like attribution) ───────────────
    explainAnomaly(r) {
        if (!r) return this.noContext();
        const features = r.features || [];
        const topFeatures = features
            .sort((a, b) => b.importance - a.importance)
            .slice(0, 3);

        const units = r.units || [];
        const recent = units.slice(-8);
        const older = units.slice(-16, -8);
        const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
        const olderAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : 0;
        const changePct = olderAvg ? ((recentAvg - olderAvg) / olderAvg * 100).toFixed(1) : 0;
        const direction = changePct > 5 ? 'spike ↑' : changePct < -5 ? 'drop ↓' : 'stable →';

        let text = `**Anomaly Analysis for ${r.sku.name}**\n\n`;
        text += `Recent 8-week demand is **${direction}** (${changePct > 0 ? '+' : ''}${changePct}% vs prior 8 weeks).\n\n`;

        if (topFeatures.length > 0) {
            text += `**Top Feature Drivers (SHAP-like attribution):**\n`;
            topFeatures.forEach((f, i) => {
                const bar = '█'.repeat(Math.round(f.importance / 5));
                text += `${i + 1}. **${f.name}** — ${f.importance.toFixed(0)}% importance ${bar}\n`;
                text += `   ${this.featureNarrative(f.name, changePct)}\n`;
            });
        }

        text += `\nσ_forecast_error = ${(r.sigmaForecastError || 0).toFixed(1)} units — `;
        text += (r.sigmaForecastError || 0) > r.avgDemand * 0.3
            ? '⚠ High forecast uncertainty — model struggling with this SKU.'
            : '✓ Forecast error within acceptable range.';

        return { text, type: changePct > 10 || changePct < -10 ? 'warning' : 'info', confidence: 88, sources: ['Feature Attribution', 'Demand Analysis'] };
    }

    // ─── Forecast Explanation ──────────────────────────────────────
    explainForecast(r) {
        if (!r) return this.noContext();
        const fc = r.forecast || [];
        const fcAvg = fc.length ? fc.reduce((a, b) => a + b, 0) / fc.length : 0;
        const fcTrend = fc.length > 1 ? (fc[fc.length - 1] - fc[0]) / fc[0] * 100 : 0;

        let text = `**Forecast Breakdown for ${r.sku.name}**\n\n`;
        text += `Model: **${r.modelName}** (${r.accuracy.toFixed(1)}% accuracy, MAPE ${r.mape.toFixed(1)}%)\n\n`;
        text += `**8-Week Forecast:**\n`;
        fc.forEach((v, i) => {
            text += `  Wk${i + 1}: ${Math.round(v)} units\n`;
        });
        text += `\nForecast avg: **${fcAvg.toFixed(0)} units/wk** `;
        text += fcTrend > 5 ? '(📈 upward trend)' : fcTrend < -5 ? '(📉 downward trend)' : '(→ stable)';
        text += `\nConfidence interval: **±${(r.sigmaForecastError || 0).toFixed(0)} units** per week`;

        return { text, type: 'info', confidence: 90, sources: [r.modelName, 'Walk-Forward Validation'] };
    }

    // ─── Stockout Risk Explanation ─────────────────────────────────
    explainStockoutRisk(r) {
        if (!r) return this.noContext();
        const dt = r.daysToStockout || { p10: 0, p50: 0, p90: 0 };
        const prob = r.stockoutProbability || r.stockoutRisk;

        let text = `**Stockout Risk Analysis for ${r.sku.name}**\n\n`;
        text += `**Monte Carlo Simulation** (2000 demand scenarios):\n`;
        text += `• P(stockout) = **${prob}%** over ${Math.round((r.sku.lead_time_days || 14) / 7 * 2)} weeks\n`;
        text += `• Best case: stock lasts **${dt.p90} days** (P90)\n`;
        text += `• Median: stock lasts **${dt.p50} days** (P50)\n`;
        text += `• Worst case: stock depletes in **${dt.p10} days** (P10)\n\n`;
        text += `Current stock: **${r.sku.current_stock}** units\n`;
        text += `Reorder point: **${r.reorderPoint}** units\n`;
        text += r.sku.current_stock < r.reorderPoint
            ? `\n⚠ **Below ROP** — immediate reorder recommended.`
            : `\n✓ Above ROP — ${r.daysOfSupply} days of supply remaining.`;

        return { text, type: prob > 50 ? 'warning' : 'info', confidence: 92, sources: ['Monte Carlo Engine', 'Forecast σ'] };
    }

    // ─── Replenishment Explanation ─────────────────────────────────
    explainReplenishment(r) {
        if (!r) return this.noContext();
        let text = `**Replenishment Advisory for ${r.sku.name}**\n\n`;
        text += `• **Reorder Point (ROP):** ${r.reorderPoint} units\n`;
        text += `  (avg demand × lead time + safety stock)\n`;
        text += `• **Economic Order Quantity (EOQ):** ${r.eoq} units\n`;
        text += `  (Wilson's formula: √(2DS/H))\n`;
        text += `• **Safety Stock:** ${r.safetyStock} units\n`;
        text += `  (1.65 × σ_forecast_error × √lead_time)\n\n`;

        const action = r.sku.current_stock < r.reorderPoint ? 'ORDER NOW' : 'Monitor';
        const qty = r.sku.current_stock < r.reorderPoint ? r.eoq : 0;
        text += `**Action: ${action}**`;
        if (qty > 0) text += ` — Recommended order: **${qty} units**`;
        text += `\nEst. cost: ₹${((qty || r.eoq) * (r.sku.unit_cost || 100)).toLocaleString()}`;

        return { text, type: action === 'ORDER NOW' ? 'warning' : 'info', confidence: 95, sources: ['Replenishment Engine', 'EOQ Formula'] };
    }

    // ─── Financial Impact Explanation ──────────────────────────────
    explainFinancialImpact(r) {
        if (!r) return this.noContext();
        const overstock = Math.max(0, r.sku.current_stock - r.reorderPoint);
        const understock = Math.max(0, r.reorderPoint - r.sku.current_stock);
        const capitalLocked = overstock * (r.sku.unit_cost || 100);
        const revenueRisk = understock * (r.sku.selling_price || 200);
        const inventoryValue = r.sku.current_stock * (r.sku.unit_cost || 100);
        const safetyValue = r.safetyStock * (r.sku.unit_cost || 100);

        let text = `**Financial Impact — ${r.sku.name}**\n\n`;
        text += `| Metric | Value |\n|---|---|\n`;
        text += `| Capital Locked (overstock) | ₹${(capitalLocked / 1000).toFixed(1)}K (${overstock} units above ROP) |\n`;
        text += `| Revenue at Risk (understock) | ₹${(revenueRisk / 1000).toFixed(1)}K (${understock} units below ROP) |\n`;
        text += `| Total Inventory Value | ₹${(inventoryValue / 1000).toFixed(1)}K |\n`;
        text += `| Safety Buffer Value | ₹${(safetyValue / 1000).toFixed(1)}K |\n\n`;

        if (capitalLocked > 0) text += `💡 **Opportunity:** Reducing stock by ${overstock} units frees ₹${(capitalLocked / 1000).toFixed(1)}K working capital.`;
        if (revenueRisk > 0) text += `⚠ **Risk:** ${understock} units short of ROP — ₹${(revenueRisk / 1000).toFixed(1)}K revenue at risk if demand spikes.`;

        return { text, type: revenueRisk > 0 ? 'warning' : 'info', confidence: 90, sources: ['Financial Model', 'Inventory Costing'] };
    }

    // ─── Model Explanation ─────────────────────────────────────────
    explainModel(r) {
        if (!r) return this.noContext();
        const mc = r.modelComparison || [];
        let text = `**Model Performance — ${r.sku.name}**\n\n`;
        text += `Winner: **${r.modelName}**\n`;
        text += `• Accuracy: ${r.accuracy.toFixed(1)}%\n• MAPE: ${r.mape.toFixed(1)}%\n• RMSE: ${(r.rmse || 0).toFixed(1)}\n• R²: ${(r.r2 || 0).toFixed(3)}\n\n`;

        if (mc.length > 0) {
            text += `**All Models Tested:**\n`;
            mc.forEach(m => {
                const icon = m.name === r.modelName ? '🏆' : '  ';
                text += `${icon} ${m.name}: MAPE ${(m.mape || 0).toFixed(1)}%, Acc ${(m.accuracy || 0).toFixed(1)}%\n`;
            });
        }
        text += `\n${r.selectionReason || ''}`;

        return { text, type: 'info', confidence: 95, sources: ['Model Selection Engine', 'Walk-Forward CV'] };
    }

    // ─── Safety Stock Explanation ──────────────────────────────────
    explainSafetyStock(r) {
        if (!r) return this.noContext();
        let text = `**Safety Stock Analysis — ${r.sku.name}**\n\n`;
        text += `Formula: **SS = z × σ_FE × √LT**\n\n`;
        text += `• z = 1.65 (95% service level)\n`;
        text += `• σ_FE = ${(r.sigmaForecastError || 0).toFixed(1)} (forecast error std dev)\n`;
        text += `• LT = ${(r.sku.lead_time_days || 14) / 7} weeks (lead time)\n`;
        text += `• **Safety Stock = ${r.safetyStock} units**\n\n`;
        text += `> Note: σ uses **forecast error** (actual − predicted), not raw demand variance. `;
        text += `This correctly measures prediction uncertainty rather than demand variability.`;

        return { text, type: 'info', confidence: 97, sources: ['Inventory Theory', 'Forecast Error Distribution'] };
    }

    // ─── Trend / Decomposition Explanation ─────────────────────────
    explainTrend(r) {
        if (!r) return this.noContext();
        const dec = r.decomposition || {};
        let text = `**Trend & Seasonality — ${r.sku.name}**\n\n`;

        if (dec.trend && dec.trend.length > 1) {
            const trendDir = dec.trend[dec.trend.length - 1] > dec.trend[0] ? 'upward 📈' : 'downward 📉';
            text += `• Trend: **${trendDir}** over the observation window\n`;
        }
        if (dec.seasonal && dec.seasonal.length > 0) {
            const seasonalRange = Math.max(...dec.seasonal) - Math.min(...dec.seasonal);
            text += `• Seasonal amplitude: **±${(seasonalRange / 2).toFixed(0)} units**\n`;
            text += `  (peak weeks identified in demand cycle)\n`;
        }
        if (dec.residual && dec.residual.length > 0) {
            const residualStd = Math.sqrt(dec.residual.map(x => x * x).reduce((a, b) => a + b, 0) / dec.residual.length);
            text += `• Residual noise: σ = ${residualStd.toFixed(1)} units\n`;
        }

        const features = r.features || [];
        const seasonal = features.find(f => f.name && f.name.toLowerCase().includes('season'));
        if (seasonal) text += `\nSeasonality importance: **${seasonal.importance.toFixed(0)}%** of forecast driver weight.`;

        return { text, type: 'info', confidence: 88, sources: ['STL Decomposition', 'Feature Analysis'] };
    }

    // ─── Feature Narrative Generator ───────────────────────────────
    featureNarrative(featureName, changePct) {
        const fn = featureName.toLowerCase();
        const dir = changePct > 5 ? 'increased' : changePct < -5 ? 'decreased' : 'remained stable';

        if (fn.includes('season')) return `Seasonal patterns are driving demand cycle — expect repetition from prior year.`;
        if (fn.includes('trend')) return `Underlying trend has ${dir}, affecting baseline demand level.`;
        if (fn.includes('promo')) return `Promotional activity is ${changePct > 5 ? 'boosting' : 'not currently affecting'} demand.`;
        if (fn.includes('price')) return `Price sensitivity detected — price changes correlate with volume shifts.`;
        if (fn.includes('lag') || fn.includes('auto')) return `Recent demand momentum (autocorrelation) is a strong predictor — last week's demand predicts next.`;
        if (fn.includes('stock') || fn.includes('inventory')) return `Stock level itself influences sell-through rate (availability effect).`;
        if (fn.includes('day') || fn.includes('week')) return `Day-of-week/month patterns detected in purchase behavior.`;
        if (fn.includes('weather') || fn.includes('temp')) return `Environmental conditions correlated with demand fluctuations.`;
        return `This feature contributes significantly to the forecast model's predictions.`;
    }

    // ─── Helpers ───────────────────────────────────────────────────
    noContext() {
        return {
            text: '⚠ No SKU selected. Please click on a SKU in the dashboard first, then ask me about it.',
            type: 'warning', confidence: 100, sources: []
        };
    }

    defaultHelp(r) {
        const sku = r ? ` (${r.sku.name})` : '';
        return {
            text: `I can explain the following for the selected SKU${sku}:\n\n` +
                `• **"Why this forecast?"** — Model reasoning & feature drivers\n` +
                `• **"Explain the anomaly"** — SHAP-like demand spike/drop analysis\n` +
                `• **"Stockout risk?"** — Monte Carlo probability breakdown\n` +
                `• **"Reorder recommendation"** — ROP, EOQ, action plan\n` +
                `• **"Financial impact"** — Capital locked, revenue at risk\n` +
                `• **"Model accuracy"** — Comparison across all tested models\n` +
                `• **"Safety stock formula"** — σ_FE calculation explained\n` +
                `• **"Show trend"** — Decomposition & seasonality\n\n` +
                `Try: "Why is demand spiking?" or "What's the stockout risk?"`,
            type: 'assistant', confidence: 95, sources: []
        };
    }

    getSuggestedQueries() {
        return [
            "Why is demand spiking?",
            "Explain the stockout risk",
            "What's the financial impact?",
            "Why this forecast?",
            "Show me the model accuracy",
            "Safety stock calculation?"
        ];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize global chatbot (backward compatible name + new name)
window.inventoryChatbot = new InventoryAIChatbot();
window.floodChatbot = window.inventoryChatbot; // backward compat
