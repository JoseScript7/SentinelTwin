// ==========================================
// LLM SERVICE - GPT-4 + RAG INTEGRATION
// AI Flood Nowcasting Platform
// Phase 2: Advanced AI Capabilities
// ==========================================

class LLMService {
    constructor() {
        this.config = {
            // OpenAI Configuration
            openai: {
                apiKey: 'YOUR_OPENAI_API_KEY', // Get from platform.openai.com
                model: 'gpt-4-turbo-preview',
                maxTokens: 1000,
                temperature: 0.7
            },

            // ChromaDB Configuration (Vector Database)
            chromadb: {
                host: 'http://localhost:8000',
                collection: 'flood_knowledge'
            },

            // Active mode
            mode: 'demo' // 'openai', 'local', or 'demo'
        };

        // Knowledge base for RAG
        this.knowledgeBase = this.initializeKnowledgeBase();

        // Conversation history for context
        this.conversationHistory = [];

        // Query cache for faster responses
        this.queryCache = new Map();

        console.log('🤖 LLM Service initialized');
    }

    // ==========================================
    // KNOWLEDGE BASE (RAG Context)
    // ==========================================

    initializeKnowledgeBase() {
        return {
            floodRisk: {
                chennai: {
                    historicalEvents: [
                        { year: 2015, severity: 'catastrophic', deaths: 500, damage: '₹50,000 Cr' },
                        { year: 2021, severity: 'severe', deaths: 14, damage: '₹2,000 Cr' },
                        { year: 2023, severity: 'severe', deaths: 17, damage: '₹15,000 Cr' }
                    ],
                    vulnerableZones: ['Velachery', 'Porur', 'Adyar', 'Tambaram', 'Mambalam'],
                    drainageCapacity: '32,000 cusecs',
                    monsoonPeriod: 'October-December'
                }
            },

            emergencyProtocols: {
                evacuation: [
                    'Move to higher floors (3+ storeys)',
                    'Pack documents, medicine, phone charger',
                    'Listen to radio/mobile alerts',
                    'Report to nearest relief camp',
                    'Avoid walking through floodwater'
                ],
                helplines: {
                    ndrf: '1070',
                    police: '100',
                    fire: '101',
                    disaster: '108',
                    stateDisaster: '1077'
                }
            },

            riverData: {
                adyar: { warningLevel: 12, dangerLevel: 15, catchmentArea: '858 sq km' },
                cooum: { warningLevel: 3.5, dangerLevel: 4.5, catchmentArea: '648 sq km' },
                kosasthalaiyar: { warningLevel: 4.2, dangerLevel: 5.8, catchmentArea: '3,727 sq km' }
            },

            damData: {
                chembarambakkam: { capacity: '3,645 mcft', frl: '25.4m', alertLevel: '22m' },
                poondi: { capacity: '3,231 mcft', frl: '42.2m', alertLevel: '38m' },
                redHills: { capacity: '3,300 mcft', frl: '14.2m', alertLevel: '12m' }
            },

            weatherPatterns: {
                neMonsoon: 'October-December brings 60% of annual rainfall',
                cycloneSeason: 'November-December peak cyclone activity',
                averageRainfall: '1,400mm annually'
            }
        };
    }

    // ==========================================
    // MAIN QUERY FUNCTION
    // ==========================================

    async query(userMessage, context = {}) {
        // Check cache first
        const cacheKey = this.generateCacheKey(userMessage);
        if (this.queryCache.has(cacheKey)) {
            console.log('📦 Cache hit for query');
            return this.queryCache.get(cacheKey);
        }

        // Add to conversation history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage,
            timestamp: new Date().toISOString()
        });

        let response;

        try {
            switch (this.config.mode) {
                case 'openai':
                    response = await this.queryOpenAI(userMessage, context);
                    break;
                case 'local':
                    response = await this.queryLocalLLM(userMessage, context);
                    break;
                case 'demo':
                default:
                    response = this.queryDemoMode(userMessage, context);
            }

            // Cache the response
            this.queryCache.set(cacheKey, response);

            // Add to history
            this.conversationHistory.push({
                role: 'assistant',
                content: response.answer,
                timestamp: new Date().toISOString()
            });

            return response;

        } catch (error) {
            console.error('LLM Query Error:', error);
            return this.getFallbackResponse(userMessage);
        }
    }

    // ==========================================
    // OPENAI GPT-4 INTEGRATION
    // ==========================================

    async queryOpenAI(userMessage, context) {
        // Retrieve relevant context using RAG
        const ragContext = this.retrieveRAGContext(userMessage);

        // Build system prompt with context
        const systemPrompt = this.buildSystemPrompt(ragContext, context);

        // Prepare messages
        const messages = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory.slice(-6), // Last 6 messages for context
            { role: 'user', content: userMessage }
        ];

        // Call OpenAI API
        // Requires: npm install openai
        /*
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: this.config.openai.apiKey });
        
        const completion = await openai.chat.completions.create({
            model: this.config.openai.model,
            messages: messages,
            max_tokens: this.config.openai.maxTokens,
            temperature: this.config.openai.temperature
        });
        
        return {
            answer: completion.choices[0].message.content,
            model: this.config.openai.model,
            tokens: completion.usage.total_tokens,
            sources: ragContext.sources
        };
        */

        // Simulated response for demo
        console.log('🚀 OpenAI API call (simulated)');
        return this.queryDemoMode(userMessage, context);
    }

    // ==========================================
    // RAG (Retrieval Augmented Generation)
    // ==========================================

    retrieveRAGContext(query) {
        const context = {
            text: '',
            sources: []
        };

        // Keyword-based retrieval (simple version)
        const queryLower = query.toLowerCase();

        // Check for flood-related queries
        if (queryLower.includes('flood') || queryLower.includes('water')) {
            context.text += `Chennai Flood History:\n`;
            this.knowledgeBase.floodRisk.chennai.historicalEvents.forEach(event => {
                context.text += `- ${event.year}: ${event.severity} flood, ${event.deaths} deaths, ${event.damage} damage\n`;
            });
            context.sources.push('Chennai Municipal Records', 'NDMA Reports');
        }

        // Check for evacuation queries
        if (queryLower.includes('evacuat') || queryLower.includes('safe') || queryLower.includes('emergency')) {
            context.text += `\nEvacuation Protocol:\n`;
            this.knowledgeBase.emergencyProtocols.evacuation.forEach((step, i) => {
                context.text += `${i + 1}. ${step}\n`;
            });
            context.sources.push('NDRF Guidelines', 'State Disaster Management');
        }

        // Check for river queries
        if (queryLower.includes('river') || queryLower.includes('adyar') || queryLower.includes('cooum')) {
            context.text += `\nRiver Status Information:\n`;
            Object.entries(this.knowledgeBase.riverData).forEach(([river, data]) => {
                context.text += `- ${river.charAt(0).toUpperCase() + river.slice(1)}: Warning at ${data.warningLevel}m, Danger at ${data.dangerLevel}m\n`;
            });
            context.sources.push('Central Water Commission', 'PWD Chennai');
        }

        // Check for dam queries
        if (queryLower.includes('dam') || queryLower.includes('reservoir') || queryLower.includes('chembarambakkam')) {
            context.text += `\nDam/Reservoir Data:\n`;
            Object.entries(this.knowledgeBase.damData).forEach(([dam, data]) => {
                context.text += `- ${dam.charAt(0).toUpperCase() + dam.slice(1)}: Capacity ${data.capacity}, FRL ${data.frl}\n`;
            });
            context.sources.push('Metrowater Chennai', 'PWD Dam Records');
        }

        // Check for helpline queries
        if (queryLower.includes('help') || queryLower.includes('call') || queryLower.includes('contact')) {
            context.text += `\nEmergency Helplines:\n`;
            Object.entries(this.knowledgeBase.emergencyProtocols.helplines).forEach(([name, number]) => {
                context.text += `- ${name.toUpperCase()}: ${number}\n`;
            });
            context.sources.push('Government of Tamil Nadu');
        }

        return context;
    }

    buildSystemPrompt(ragContext, liveContext) {
        return `You are an AI assistant for the Flood Nowcasting Platform in Tamil Nadu, India.

KNOWLEDGE BASE:
${ragContext.text}

CURRENT CONDITIONS:
- Active Zones: ${liveContext.activeZones || 'Chennai Metropolitan'}
- Risk Level: ${liveContext.riskLevel || 'Moderate'}
- Weather: ${liveContext.weather || 'Partly cloudy'}
- Rainfall: ${liveContext.rainfall || '0mm'}

INSTRUCTIONS:
1. Provide accurate, actionable flood-related information
2. Cite sources when available
3. Prioritize safety in all recommendations
4. Be concise but comprehensive
5. Use metric units (meters, mm, km)
6. Include emergency contacts when relevant
7. If unsure, recommend contacting local authorities`;
    }

    // ==========================================
    // DEMO MODE (No API Key Required)
    // ==========================================

    queryDemoMode(userMessage, context) {
        const queryLower = userMessage.toLowerCase();
        const timestamp = new Date().toLocaleTimeString('en-IN');

        // Retrieve knowledge context
        const ragContext = this.retrieveRAGContext(userMessage);

        // Pattern matching for intelligent responses
        let answer = '';
        let confidence = 0.85;

        if (queryLower.includes('risk') && (queryLower.includes('chennai') || queryLower.includes('velachery'))) {
            answer = `**Current Flood Risk Assessment for Chennai:**

📊 **Risk Level:** ${context.riskLevel || 'HIGH (72%)'}

🏘️ **Vulnerable Areas:**
• Velachery: CRITICAL - Low elevation, poor drainage
• Porur/Kundrathur: HIGH - Near Adyar river basin
• Tambaram: MODERATE - Better drainage post-2015

📈 **Contributing Factors:**
• Current rainfall: ${context.rainfall || '45mm'} in last 6 hours
• Adyar river: 2.8m below warning level
• Chembarambakkam: 78% capacity

⚠️ **Recommendation:** Stay alert. Monitor official channels.

📞 **Helpline:** 1070 (NDRF), 1077 (State Disaster)`;
            confidence = 0.92;

        } else if (queryLower.includes('evacuate') || queryLower.includes('evacuation')) {
            answer = `**🚨 Evacuation Guidelines:**

**Immediate Steps:**
1. Move to higher floors (3+ storeys)
2. Pack essentials:
   - ID documents, insurance papers
   - Medicines (3-day supply)
   - Phone, charger, power bank
   - Bottled water, dry food

3. **Do NOT:**
   - Walk through moving water
   - Drive into flooded areas
   - Touch electrical equipment

**Relief Camps Nearby:**
• Government schools designated as shelters
• Check @ChennaiCorp on Twitter for locations

**Emergency Contacts:**
• NDRF: 1070
• Police: 100
• State Helpline: 1077

💡 **Tip:** Share your location with family before leaving.`;
            confidence = 0.95;

        } else if (queryLower.includes('dam') || queryLower.includes('release') || queryLower.includes('chembarambakkam')) {
            answer = `**🌊 Dam Status & Release Information:**

**Chembarambakkam Reservoir:**
• Current Level: 21.2m (FRL: 25.4m)
• Storage: 78% capacity (2,843 mcft)
• Inflow: 1,200 cusecs
• Outflow: 800 cusecs

**Release Protocol:**
• Alert issued 24 hours before major release
• SMS alerts sent to downstream residents
• Coordinated with Adyar river management

**Downstream Impact Zones:**
• Tambaram, Chrompet, Pallavaram
• Adyar, Guindy, Velachery

**2015 Lesson:** Unannounced release caused catastrophic flooding. Now mandatory 24-hour notice.

📱 **Alert Registration:** Register at chennai.tn.gov.in for SMS alerts`;
            confidence = 0.88;

        } else if (queryLower.includes('weather') || queryLower.includes('rain') || queryLower.includes('forecast')) {
            answer = `**🌧️ Weather Forecast - Chennai:**

**Next 24 Hours:**
• Rainfall: Heavy (50-100mm expected)
• Wind: 25-35 km/h from NE
• Humidity: 85%
• Visibility: Moderate

**7-Day Outlook:**
• Active NE Monsoon conditions
• 60% chance of very heavy rain
• Depression in Bay of Bengal intensifying

**Cyclone Watch:**
• No active cyclone threat currently
• Next update: 6 hours

**Impact Assessment:**
• Waterlogging expected in low-lying areas
• Traffic disruptions likely on major roads

📡 **Sources:** IMD Chennai, Open-Meteo API`;
            confidence = 0.90;

        } else if (queryLower.includes('help') || queryLower.includes('sos') || queryLower.includes('rescue')) {
            answer = `**🆘 Emergency Help & Rescue:**

**If You Need Rescue:**
1. Call **1070** (NDRF) immediately
2. Share exact location (use Google Maps)
3. Move to rooftop/highest point
4. Wave bright cloth for visibility
5. Keep phone charged

**Key Contacts:**
• NDRF: 1070
• Police: 100
• Fire: 101
• State Disaster: 1077
• Ambulance: 108

**WhatsApp SOS:**
• TN Police: +91 9498-170-170

**Active Rescue Teams:**
• 12 NDRF teams deployed
• 450 boats available
• 35 helicopters on standby

💡 **Tip:** Stay calm, help is on the way!`;
            confidence = 0.96;

        } else {
            // Generic flood-related response
            answer = `I understand you're asking about flood-related information. Here's what I can help with:

**🌊 Available Information:**
• Current flood risk levels for zones
• Dam/reservoir status and release schedules
• Evacuation guidelines and routes
• Weather forecasts and rainfall data
• Emergency contacts and helplines
• Historical flood data and patterns

**Try asking:**
• "What's the flood risk in Velachery?"
• "Should I evacuate?"
• "Chembarambakkam dam status"
• "Emergency helpline numbers"
• "Weather forecast for today"

📞 **Immediate Help:** Call 1070 (NDRF)`;
            confidence = 0.70;
        }

        return {
            answer: answer,
            confidence: confidence,
            model: 'demo-rag-v1',
            sources: ragContext.sources,
            timestamp: timestamp,
            context: {
                ragUsed: ragContext.text.length > 0,
                queryType: this.classifyQuery(queryLower)
            }
        };
    }

    // ==========================================
    // HELPER FUNCTIONS
    // ==========================================

    classifyQuery(query) {
        if (query.includes('risk') || query.includes('danger')) return 'risk_assessment';
        if (query.includes('evacuate') || query.includes('safe')) return 'evacuation';
        if (query.includes('dam') || query.includes('reservoir')) return 'infrastructure';
        if (query.includes('weather') || query.includes('rain')) return 'weather';
        if (query.includes('help') || query.includes('rescue')) return 'emergency';
        return 'general';
    }

    generateCacheKey(query) {
        return query.toLowerCase().trim().replace(/\s+/g, '_').substring(0, 50);
    }

    getFallbackResponse(query) {
        return {
            answer: `I apologize, but I'm having trouble processing your request right now. 

For immediate assistance:
📞 NDRF Helpline: 1070
📞 State Disaster: 1077

Please try again or contact emergency services directly.`,
            confidence: 0.5,
            model: 'fallback',
            sources: [],
            error: true
        };
    }

    clearHistory() {
        this.conversationHistory = [];
        console.log('🗑️ Conversation history cleared');
    }

    clearCache() {
        this.queryCache.clear();
        console.log('🗑️ Query cache cleared');
    }
}

// ==========================================
// CHROMADB VECTOR STORE (Optional Enhancement)
// ==========================================

class VectorStore {
    constructor() {
        this.documents = [];
        this.embeddings = [];
        console.log('📚 Vector Store initialized (in-memory mode)');
    }

    async addDocument(text, metadata = {}) {
        // In production, use ChromaDB client
        // const { ChromaClient } = require('chromadb');

        const doc = {
            id: `doc_${Date.now()}`,
            text: text,
            metadata: metadata,
            embedding: this.simpleEmbedding(text)
        };

        this.documents.push(doc);
        return doc.id;
    }

    query(queryText, nResults = 5) {
        const queryEmbedding = this.simpleEmbedding(queryText);

        // Simple cosine similarity
        const scores = this.documents.map(doc => ({
            ...doc,
            score: this.cosineSimilarity(queryEmbedding, doc.embedding)
        }));

        return scores
            .sort((a, b) => b.score - a.score)
            .slice(0, nResults);
    }

    // Simple bag-of-words embedding (demo)
    simpleEmbedding(text) {
        const words = text.toLowerCase().split(/\W+/);
        const wordFreq = {};
        words.forEach(w => {
            if (w.length > 2) wordFreq[w] = (wordFreq[w] || 0) + 1;
        });
        return wordFreq;
    }

    cosineSimilarity(a, b) {
        const allWords = new Set([...Object.keys(a), ...Object.keys(b)]);
        let dotProduct = 0, normA = 0, normB = 0;

        allWords.forEach(word => {
            const valA = a[word] || 0;
            const valB = b[word] || 0;
            dotProduct += valA * valB;
            normA += valA * valA;
            normB += valB * valB;
        });

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    }
}

// ==========================================
// EXPORTS & GLOBAL INSTANCE
// ==========================================

const llmService = new LLMService();
const vectorStore = new VectorStore();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LLMService, VectorStore, llmService, vectorStore };
}

if (typeof window !== 'undefined') {
    window.llmService = llmService;
    window.vectorStore = vectorStore;
    window.LLMService = LLMService;
}
