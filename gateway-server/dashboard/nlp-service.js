// ==========================================
// NLP SERVICE — DEMAND SIGNAL DETECTION
// Regime Change Detection for Inventory Intelligence
// Detects supply chain disruptions, panic buying,
// viral product trends, and demand regime shifts
// ==========================================

class NLPService {
    constructor() {
        this.config = {
            huggingface: {
                apiKey: 'YOUR_HUGGINGFACE_API_KEY',
                sentimentModel: 'cardiffnlp/twitter-roberta-base-sentiment',
                nerModel: 'dslim/bert-base-NER'
            },
            twitter: {
                bearerToken: 'YOUR_TWITTER_BEARER_TOKEN',
                apiKey: 'YOUR_TWITTER_API_KEY',
                apiSecret: 'YOUR_TWITTER_API_SECRET'
            },
            mode: 'demo' // 'huggingface', 'twitter', or 'demo'
        };

        // Supply chain disruption keywords
        this.demandKeywords = {
            panic: ['panic buying', 'hoarding', 'sold out', 'out of stock', 'empty shelves', 'shortage', 'rationing', 'bulk buying'],
            disruption: ['supply chain', 'port closure', 'factory shutdown', 'logistics delay', 'shipping delay', 'raw material shortage', 'production halt'],
            viral: ['trending', 'viral', 'tiktok', 'influencer', 'must have', 'best seller', 'go viral', 'everyone buying'],
            seasonal: ['festival', 'diwali', 'pongal', 'christmas', 'new year', 'back to school', 'monsoon', 'winter', 'summer'],
            regulatory: ['ban', 'recall', 'regulation', 'import duty', 'tariff', 'embargo', 'sanction', 'compliance'],
            weather: ['cyclone', 'flood', 'drought', 'heatwave', 'storm', 'cold wave', 'harvest failure'],
            economic: ['inflation', 'recession', 'price hike', 'rupee falling', 'interest rate', 'gdp', 'unemployment']
        };

        // Product & supply chain location patterns
        this.locationPatterns = [
            'mumbai', 'delhi', 'chennai', 'bangalore', 'kolkata', 'hyderabad',
            'pune', 'ahmedabad', 'jaipur', 'lucknow', 'surat', 'coimbatore',
            'warehouse', 'distribution center', 'factory', 'port', 'supplier'
        ];

        // Sentiment thresholds for demand impact
        this.sentimentThresholds = {
            critical: -0.7,  // Severe disruption signal
            high: -0.4,      // Significant concern
            moderate: -0.1,  // Mild concern
            low: 0           // Neutral / opportunity
        };

        // Active regime change alerts
        this.activeAlerts = [];
        this.lastAnalysis = null;

        console.log('📊 NLP Demand Signal Service initialized');
    }

    // ==========================================
    // MAIN ANALYSIS
    // ==========================================

    async analyzeText(text, options = {}) {
        const result = {
            text,
            timestamp: new Date().toISOString(),
            sentiment: null,
            entities: [],
            demandSignals: null,
            priority: 'low',
            location: null,
            confidence: 0,
            regime: null
        };

        try {
            result.sentiment = await this.analyzeSentiment(text);
            result.entities = await this.extractEntities(text);
            result.demandSignals = this.detectDemandSignals(text);
            result.location = this.extractLocation(text);
            result.priority = this.calculatePriority(result);
            result.confidence = this.calculateConfidence(result);
            result.regime = this.classifyRegime(result);
            this.lastAnalysis = result;
            return result;
        } catch (error) {
            console.error('NLP Analysis Error:', error);
            return result;
        }
    }

    // ==========================================
    // SENTIMENT ANALYSIS
    // ==========================================

    async analyzeSentiment(text) {
        if (this.config.mode === 'huggingface') {
            return await this.huggingFaceSentiment(text);
        }
        return this.demoSentiment(text);
    }

    async huggingFaceSentiment(text) {
        // Production: HuggingFace Inference API
        return this.demoSentiment(text);
    }

    demoSentiment(text) {
        const textLower = text.toLowerCase();
        let score = 0;

        // Negative demand signals
        const panicPatterns = ['panic', 'shortage', 'crisis', 'sold out', 'hoarding', 'empty', 'unavailable'];
        const disruption = ['delay', 'halt', 'shutdown', 'closure', 'blocked', 'stuck', 'failed'];
        const positive = ['restocked', 'available', 'normal', 'resolved', 'delivered', 'surplus', 'discount'];

        panicPatterns.forEach(p => { if (textLower.includes(p)) score -= 0.3; });
        disruption.forEach(p => { if (textLower.includes(p)) score -= 0.15; });
        positive.forEach(p => { if (textLower.includes(p)) score += 0.2; });

        score = Math.max(-1, Math.min(1, score));

        let label = 'neutral';
        if (score <= this.sentimentThresholds.critical) label = 'critical';
        else if (score <= this.sentimentThresholds.high) label = 'negative';
        else if (score <= this.sentimentThresholds.moderate) label = 'slightly_negative';
        else if (score < 0.2) label = 'neutral';
        else label = 'positive';

        return { score, label, confidence: Math.abs(score) * 100 };
    }

    // ==========================================
    // ENTITY EXTRACTION
    // ==========================================

    async extractEntities(text) {
        if (this.config.mode === 'huggingface') {
            return await this.huggingFaceNER(text);
        }
        return this.demoNER(text);
    }

    async huggingFaceNER(text) {
        return this.demoNER(text);
    }

    demoNER(text) {
        const entities = [];
        const textLower = text.toLowerCase();

        // Location detection
        this.locationPatterns.forEach(loc => {
            const index = textLower.indexOf(loc);
            if (index !== -1) {
                entities.push({
                    entity: 'LOCATION',
                    word: text.substring(index, index + loc.length),
                    score: 0.92,
                    index
                });
            }
        });

        // Product/SKU detection
        const productPatterns = /(sku[- ]?\w+|item[- ]?\d+|product[- ]?\d+)/gi;
        let match;
        while ((match = productPatterns.exec(text)) !== null) {
            entities.push({ entity: 'PRODUCT', word: match[0], score: 0.88, index: match.index });
        }

        // Quantity detection
        const qtyPattern = /(\d+[\.,]?\d*)\s*(units?|tons?|kg|boxes?|cases?|pallets?|containers?|lakh|crore|lakhs?)/gi;
        while ((match = qtyPattern.exec(text)) !== null) {
            entities.push({ entity: 'QUANTITY', word: match[0], score: 0.90, index: match.index });
        }

        // Time/duration detection
        const timePattern = /(\d+)\s*(days?|weeks?|months?|hours?)/gi;
        while ((match = timePattern.exec(text)) !== null) {
            entities.push({ entity: 'DURATION', word: match[0], score: 0.85, index: match.index });
        }

        // Currency detection
        const currencyPattern = /₹\s*[\d,]+\.?\d*|Rs\.?\s*[\d,]+\.?\d*|\d+\s*(crore|lakh)/gi;
        while ((match = currencyPattern.exec(text)) !== null) {
            entities.push({ entity: 'CURRENCY', word: match[0], score: 0.92, index: match.index });
        }

        return entities;
    }

    // ==========================================
    // DEMAND SIGNAL DETECTION (was detectFloodSignals)
    // ==========================================

    detectDemandSignals(text) {
        const signals = {
            isDemandRelated: false,
            isDisruption: false,
            categories: [],
            keywords: [],
            urgencyScore: 0,
            impactType: null,     // 'surge', 'drop', 'shift', 'disruption'
            expectedMultiplier: 1  // Demand multiplier estimate
        };

        const textLower = text.toLowerCase();

        // Check each category
        Object.entries(this.demandKeywords).forEach(([category, keywords]) => {
            keywords.forEach(keyword => {
                if (textLower.includes(keyword.toLowerCase())) {
                    signals.isDemandRelated = true;
                    signals.keywords.push(keyword);
                    if (!signals.categories.includes(category)) {
                        signals.categories.push(category);
                    }
                }
            });
        });

        // Classify impact type and estimate demand multiplier
        if (signals.categories.includes('panic')) {
            signals.impactType = 'surge';
            signals.expectedMultiplier = 2.5;
            signals.isDisruption = true;
        } else if (signals.categories.includes('viral')) {
            signals.impactType = 'surge';
            signals.expectedMultiplier = 3.0;
        } else if (signals.categories.includes('disruption')) {
            signals.impactType = 'disruption';
            signals.expectedMultiplier = 0.3; // Supply drop
            signals.isDisruption = true;
        } else if (signals.categories.includes('regulatory')) {
            signals.impactType = 'drop';
            signals.expectedMultiplier = 0.5;
            signals.isDisruption = true;
        } else if (signals.categories.includes('seasonal')) {
            signals.impactType = 'shift';
            signals.expectedMultiplier = 1.5;
        } else if (signals.categories.includes('weather')) {
            signals.impactType = 'disruption';
            signals.expectedMultiplier = 0.6;
            signals.isDisruption = true;
        }

        // Calculate urgency
        let urgency = 0;
        if (signals.categories.includes('panic')) urgency += 40;
        if (signals.categories.includes('disruption')) urgency += 35;
        if (signals.categories.includes('viral')) urgency += 25;
        if (signals.categories.includes('regulatory')) urgency += 30;
        if (signals.categories.includes('weather')) urgency += 20;
        if (signals.categories.includes('seasonal')) urgency += 10;
        urgency += Math.min(signals.keywords.length * 5, 25);
        signals.urgencyScore = Math.min(urgency, 100);

        return signals;
    }

    // Backward compatibility alias
    detectFloodSignals(text) {
        return this.detectDemandSignals(text);
    }

    // ==========================================
    // REGIME CHANGE CLASSIFICATION
    // ==========================================

    classifyRegime(analysisResult) {
        const signals = analysisResult.demandSignals;
        if (!signals || !signals.isDemandRelated) return null;

        const regime = {
            type: signals.impactType || 'unknown',
            severity: signals.urgencyScore > 60 ? 'critical' : signals.urgencyScore > 30 ? 'warning' : 'info',
            categories: signals.categories,
            recommendation: '',
            suppressAutoReorder: false,
            adjustmentFactor: signals.expectedMultiplier
        };

        // Generate recommendation
        switch (regime.type) {
            case 'surge':
                regime.recommendation = `Demand surge detected (${signals.categories.join(', ')}). ` +
                    `Expected ${signals.expectedMultiplier}× normal demand. ` +
                    `Recommend: increase safety stock by ${Math.round((signals.expectedMultiplier - 1) * 100)}%, ` +
                    `accelerate reorder, alert suppliers.`;
                regime.suppressAutoReorder = false; // Allow but increase quantities
                break;
            case 'disruption':
                regime.recommendation = `Supply disruption detected (${signals.categories.join(', ')}). ` +
                    `Supply may drop to ${Math.round(signals.expectedMultiplier * 100)}% of normal. ` +
                    `Recommend: suppress auto-reorder (supplier may not fulfill), ` +
                    `activate alternate suppliers, extend lead time estimates.`;
                regime.suppressAutoReorder = true;
                break;
            case 'drop':
                regime.recommendation = `Demand drop signal (${signals.categories.join(', ')}). ` +
                    `Expected demand at ${Math.round(signals.expectedMultiplier * 100)}% of forecast. ` +
                    `Recommend: reduce reorder quantities, hold excess stock, monitor closely.`;
                regime.suppressAutoReorder = true;
                break;
            case 'shift':
                regime.recommendation = `Demand shift detected (${signals.categories.join(', ')}). ` +
                    `Seasonal/event-driven ${Math.round(signals.expectedMultiplier * 100)}% demand change expected. ` +
                    `Recommend: adjust forecast manually, pre-position inventory.`;
                break;
            default:
                regime.recommendation = 'Signal detected but impact unclear. Monitor closely.';
        }

        // Store as active alert
        this.activeAlerts.push({
            ...regime,
            timestamp: new Date().toISOString(),
            text: analysisResult.text
        });

        // Keep only last 50 alerts
        if (this.activeAlerts.length > 50) {
            this.activeAlerts = this.activeAlerts.slice(-50);
        }

        return regime;
    }

    // ==========================================
    // LOCATION EXTRACTION
    // ==========================================

    extractLocation(text) {
        const textLower = text.toLowerCase();
        let bestMatch = null;
        let confidence = 0;

        for (const loc of this.locationPatterns) {
            if (textLower.includes(loc)) {
                if (loc.length > (bestMatch?.length || 0)) {
                    bestMatch = loc;
                    confidence = 0.85;
                }
            }
        }

        const coordPattern = /(\d+\.\d+)[,\s]+(\d+\.\d+)/;
        const coordMatch = text.match(coordPattern);
        if (coordMatch) {
            return { type: 'coordinates', lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]), confidence: 0.95 };
        }

        if (bestMatch) {
            return { type: 'named', name: bestMatch.charAt(0).toUpperCase() + bestMatch.slice(1), confidence };
        }
        return null;
    }

    // ==========================================
    // PRIORITY CALCULATION
    // ==========================================

    calculatePriority(analysisResult) {
        let score = 0;

        if (analysisResult.sentiment) {
            const s = analysisResult.sentiment.score;
            if (s <= -0.7) score += 30;
            else if (s <= -0.4) score += 20;
            else if (s <= -0.1) score += 10;
        }

        if (analysisResult.demandSignals) {
            score += analysisResult.demandSignals.urgencyScore * 0.4;
        }

        if (analysisResult.location) score += 15;
        if (analysisResult.entities.length > 0) {
            score += Math.min(analysisResult.entities.length * 3, 15);
        }

        if (score >= 70) return 'critical';
        if (score >= 50) return 'high';
        if (score >= 30) return 'moderate';
        return 'low';
    }

    calculateConfidence(result) {
        let total = 0, count = 0;
        if (result.sentiment?.confidence) { total += result.sentiment.confidence; count++; }
        result.entities.forEach(e => { total += (e.score || 0) * 100; count++; });
        if (result.location?.confidence) { total += result.location.confidence * 100; count++; }
        return count > 0 ? Math.round(total / count) : 50;
    }

    // ==========================================
    // SOCIAL MEDIA MONITORING
    // ==========================================

    async searchTwitter(query, options = {}) {
        if (this.config.mode !== 'twitter') {
            return this.demoTwitterSearch(query);
        }
        return this.demoTwitterSearch(query);
    }

    demoTwitterSearch(query) {
        // Simulated supply chain social signals
        const demoTweets = [
            {
                id: '1',
                text: 'Panic buying of rice and cooking oil in Chennai markets! Shelves going empty fast. #Shortage',
                created_at: new Date().toISOString(),
                author: '@shopper1',
                location: 'Chennai'
            },
            {
                id: '2',
                text: 'Port delay at Mumbai: container ships waiting 5 days to unload. Supply chain disruption expected. #Logistics',
                created_at: new Date().toISOString(),
                author: '@logistics_watch',
                location: 'Mumbai'
            },
            {
                id: '3',
                text: 'This new protein bar is going viral on TikTok! Everyone buying it, sold out at BigBasket. #TrendingProduct',
                created_at: new Date().toISOString(),
                author: '@foodie_india',
                location: 'Bangalore'
            },
            {
                id: '4',
                text: 'Factory shutdown at supplier in Pune due to equipment failure. 2 week delay expected for electronics components.',
                created_at: new Date().toISOString(),
                author: '@mfg_news',
                location: 'Pune'
            },
            {
                id: '5',
                text: 'Diwali season starting! Expect 3x demand for gifting items, sweets, and diyas. Stock up early! #FestivalSeason',
                created_at: new Date().toISOString(),
                author: '@retail_insights',
                location: 'Delhi'
            }
        ];

        return demoTweets.filter(t =>
            t.text.toLowerCase().includes(query.toLowerCase()) ||
            t.location?.toLowerCase().includes(query.toLowerCase())
        );
    }

    // ==========================================
    // BATCH & STREAM PROCESSING
    // ==========================================

    async analyzeMultiple(texts) {
        const results = await Promise.all(texts.map(text => this.analyzeText(text)));
        return results.sort((a, b) => {
            const priorityOrder = { critical: 4, high: 3, moderate: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    async processTwitterStream(query, callback) {
        console.log(`📊 Starting demand signal stream for: ${query}`);
        const tweets = await this.searchTwitter(query);
        for (const tweet of tweets) {
            const analysis = await this.analyzeText(tweet.text);
            analysis.tweet = tweet;
            callback(analysis);
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // ==========================================
    // REGIME CHANGE SUMMARY
    // ==========================================

    getActiveAlerts() {
        return this.activeAlerts.filter(a => {
            const age = Date.now() - new Date(a.timestamp).getTime();
            return age < 24 * 60 * 60 * 1000; // Last 24 hours
        });
    }

    getRegimeSummary() {
        const alerts = this.getActiveAlerts();
        if (alerts.length === 0) return { regime: 'normal', alerts: [] };

        const worstSeverity = alerts.reduce((worst, a) => {
            const order = { critical: 3, warning: 2, info: 1 };
            return (order[a.severity] || 0) > (order[worst] || 0) ? a.severity : worst;
        }, 'info');

        return {
            regime: worstSeverity === 'critical' ? 'disrupted' : worstSeverity === 'warning' ? 'shifted' : 'normal',
            alerts,
            suppressAutoReorder: alerts.some(a => a.suppressAutoReorder),
            dominantImpact: alerts[alerts.length - 1]?.type || 'unknown'
        };
    }
}

// ==========================================
// IMAGE VERIFICATION (Kept for compatibility)
// ==========================================

class ImageVerificationService {
    constructor() {
        this.config = { threshold: 0.7, model: 'product-verification-resnet' };
        console.log('🖼️ Image Verification Service initialized');
    }

    async verifyProductImage(imageUrl) {
        return {
            isValid: Math.random() > 0.2,
            confidence: Math.random() * 0.3 + 0.7,
            detectedObjects: ['product', 'barcode', 'packaging'],
            timestamp: new Date().toISOString()
        };
    }

    // Backward compat
    async verifyFloodImage(imageUrl) {
        return this.verifyProductImage(imageUrl);
    }
}

// ==========================================
// EXPORTS
// ==========================================

const nlpService = new NLPService();
const imageVerification = new ImageVerificationService();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NLPService, ImageVerificationService, nlpService, imageVerification };
}

if (typeof window !== 'undefined') {
    window.nlpService = nlpService;
    window.imageVerification = imageVerification;
}
