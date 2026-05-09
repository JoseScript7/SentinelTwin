// ==========================================
// VOICE INTERFACE SERVICE - INTEGRATED VERSION
// AI Flood Nowcasting Platform
// Simplified, Header-Integrated Voice Control
// ==========================================

class VoiceService {
    constructor() {
        this.recognition = null;
        this.synthesis = null;
        this.isListening = false;
        this.isSupported = false;
        this.voicesLoaded = false;

        // Voice configuration
        this.config = {
            language: 'en-IN',
            continuous: true, // Listen continuously
            interimResults: true,
            maxAlternatives: 1,
            voiceSpeed: 0.9,
            voicePitch: 1.0
        };

        // Command patterns with multiple variations
        this.commands = {
            checkRisk: {
                patterns: ['risk', 'danger', 'flood risk', 'what is the risk', 'check risk', 'flood level'],
                handler: 'handleRiskCheck'
            },
            sendAlert: {
                patterns: ['send alert', 'emergency', 'alert', 'trigger alert', 'dispatch'],
                handler: 'handleSendAlert'
            },
            getWeather: {
                patterns: ['weather', 'forecast', 'rain', 'rainfall', 'raining'],
                handler: 'handleWeather'
            },
            help: {
                patterns: ['help', 'helpline', 'emergency number', 'contact', 'sos', 'rescue'],
                handler: 'handleHelp'
            }
        };

        console.log('🎙️ Voice Service loading...');
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================

    init() {
        // Check browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.isSupported = true;
            this.configureRecognition();
            console.log('✅ Voice recognition ready');
        } else {
            console.warn('⚠️ Speech recognition not supported');
            this.showToast('Voice not supported in this browser. Use Chrome for best experience.', 'warning');
        }

        // Initialize speech synthesis
        if ('speechSynthesis' in window) {
            this.synthesis = window.speechSynthesis;

            // Load voices
            if (this.synthesis.getVoices().length === 0) {
                this.synthesis.onvoiceschanged = () => {
                    this.voicesLoaded = true;
                    console.log('🔊 Voices loaded:', this.synthesis.getVoices().length);
                };
            } else {
                this.voicesLoaded = true;
            }
        }

        return this.isSupported;
    }

    configureRecognition() {
        this.recognition.lang = this.config.language;
        this.recognition.continuous = this.config.continuous;
        this.recognition.interimResults = this.config.interimResults;
        this.recognition.maxAlternatives = this.config.maxAlternatives;

        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateVoiceButton(true);
            this.showToast('🎤 Listening... Speak now!', 'info');
            console.log('🎤 Started listening');
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.updateVoiceButton(false);
            console.log('🎤 Stopped listening');
        };

        this.recognition.onresult = (event) => {
            const last = event.results.length - 1;
            const transcript = event.results[last][0].transcript.toLowerCase().trim();
            const confidence = event.results[last][0].confidence;

            if (event.results[last].isFinal) {
                console.log(`🎤 Heard: "${transcript}" (${(confidence * 100).toFixed(0)}%)`);
                this.showToast(`Heard: "${transcript}"`, 'success');
                this.processCommand(transcript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech error:', event.error);
            this.isListening = false;
            this.updateVoiceButton(false);

            if (event.error === 'not-allowed') {
                this.showToast('❌ Microphone access denied. Click the 🔒 in address bar to enable.', 'error');
            } else if (event.error !== 'aborted') {
                this.showToast(`Voice error: ${event.error}`, 'error');
            }
        };
    }

    // ==========================================
    // VOICE CONTROL
    // ==========================================

    toggleListening() {
        if (!this.isSupported) {
            this.showToast('Voice not supported. Please use Chrome browser.', 'error');
            return;
        }

        if (this.isListening) {
            this.stopListening();
        } else {
            this.startListening();
        }
    }

    startListening() {
        if (!this.recognition) {
            this.init();
        }

        try {
            this.recognition.start();
        } catch (e) {
            if (e.name === 'InvalidStateError') {
                // Already listening
                this.recognition.stop();
                setTimeout(() => this.recognition.start(), 100);
            } else {
                console.error('Start error:', e);
            }
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }

    // ==========================================
    // COMMAND PROCESSING
    // ==========================================

    processCommand(transcript) {
        for (const [name, cmd] of Object.entries(this.commands)) {
            for (const pattern of cmd.patterns) {
                if (transcript.includes(pattern)) {
                    console.log(`✅ Matched: ${name}`);
                    this[cmd.handler](transcript);
                    return;
                }
            }
        }

        // No match - general response
        this.speak("I can help with flood risk, weather, sending alerts, or emergency numbers. Try saying 'what is the flood risk' or 'help'.");
    }

    handleRiskCheck(transcript) {
        const zones = window.floodApp?.state?.zoneRisks || {};
        const highestRisk = Object.entries(zones).sort((a, b) => b[1] - a[1])[0];

        const zone = highestRisk?.[0] || 'Chennai';
        const risk = highestRisk?.[1] || 65;
        const status = risk > 70 ? 'critical' : risk > 50 ? 'high' : 'moderate';

        this.speak(`Current flood risk in ${zone} is ${risk} percent. Status is ${status}. ${risk > 60 ? 'Please stay alert and monitor updates.' : 'Conditions are stable for now.'}`);
    }

    handleSendAlert(transcript) {
        this.speak('Triggering emergency alert now.');

        // Actually trigger the alert
        if (typeof triggerEmergencyAlert === 'function') {
            setTimeout(() => triggerEmergencyAlert(), 500);
        } else {
            const btn = document.getElementById('emergencyAlertBtn');
            if (btn) btn.click();
        }
    }

    handleWeather(transcript) {
        const rainfall = window.floodApp?.state?.rainfall || 45;
        const intensity = rainfall > 50 ? 'heavy' : rainfall > 20 ? 'moderate' : 'light';

        this.speak(`Current rainfall is ${rainfall} millimeters. Intensity is ${intensity}. ${rainfall > 40 ? 'Heavy rain may continue. Stay prepared.' : 'Conditions appear manageable.'}`);
    }

    handleHelp(transcript) {
        this.speak('Emergency helplines: NDRF 1070, Police 100, Fire 101, Ambulance 108. For flood rescue, call NDRF at 1070.');
    }

    // ==========================================
    // TEXT-TO-SPEECH
    // ==========================================

    speak(text) {
        if (!this.synthesis) {
            console.warn('Speech synthesis unavailable');
            this.showToast(text, 'info');
            return;
        }

        // Cancel current speech
        this.synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-IN';
        utterance.rate = this.config.voiceSpeed;
        utterance.pitch = this.config.voicePitch;

        // Get best voice
        const voices = this.synthesis.getVoices();
        const indianVoice = voices.find(v => v.lang.includes('en-IN')) ||
            voices.find(v => v.lang.includes('en-GB')) ||
            voices.find(v => v.lang.includes('en'));

        if (indianVoice) {
            utterance.voice = indianVoice;
        }

        this.synthesis.speak(utterance);
        this.showToast('🔊 ' + text.substring(0, 60) + '...', 'info');
    }

    // ==========================================
    // UI HELPERS
    // ==========================================

    updateVoiceButton(listening) {
        const btn = document.getElementById('voiceBtn');
        if (btn) {
            if (listening) {
                btn.style.background = 'linear-gradient(135deg, #dc2626, #991b1b)';
                btn.style.animation = 'pulse 1s infinite';
                btn.innerHTML = '🎤';
                btn.title = 'Stop Listening';
            } else {
                btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
                btn.style.animation = 'none';
                btn.innerHTML = '🎙️';
                btn.title = 'Start Voice Command';
            }
        }
    }

    showToast(message, type = 'info') {
        // Remove existing toast
        const existing = document.getElementById('voiceToast');
        if (existing) existing.remove();

        const colors = {
            info: '#3b82f6',
            success: '#22c55e',
            warning: '#f59e0b',
            error: '#dc2626'
        };

        const toast = document.createElement('div');
        toast.id = 'voiceToast';
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: fadeInDown 0.3s ease;
            max-width: 80%;
            text-align: center;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 4000);
    }
}

// ==========================================
// GLOBAL INSTANCE
// ==========================================

const voiceService = new VoiceService();

// Initialize when page loads
if (typeof window !== 'undefined') {
    window.voiceService = voiceService;

    // Initialize after a short delay to ensure DOM is ready
    window.addEventListener('load', () => {
        setTimeout(() => {
            voiceService.init();
        }, 500);
    });
}
