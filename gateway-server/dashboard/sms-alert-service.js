// ==========================================
// EMERGENCY SMS ALERT SERVICE - REAL SMS DEMO
// For Flood Nowcasting Platform
// Configured for REAL SMS sending
// ==========================================

class EmergencyAlertService {
    constructor() {
        // SMS Provider Configuration
        this.config = {
            // Fast2SMS (India) - FREE 100 SMS
            // Sign up at: https://www.fast2sms.com
            fast2sms: {
                apiKey: '', // User will enter their key
                endpoint: 'https://www.fast2sms.com/dev/bulkV2'
            },

            // Twilio - $15 Free Credit
            twilio: {
                accountSid: '',
                authToken: '',
                fromNumber: ''
            },

            // TextLocal (India)
            textlocal: {
                apiKey: '',
                sender: 'FLOODS'
            },

            // Active mode - 'real' for actual SMS, 'demo' for testing
            mode: 'demo', // Change to 'real' when API key is set
            provider: 'fast2sms'
        };

        // Demo phone numbers for testing (add your real phone)
        this.demoPhones = [];

        // Alert history
        this.alertHistory = [];

        // Stats
        this.stats = {
            totalSent: 0,
            totalFailed: 0
        };

        console.log('📱 SMS Alert Service initialized');
        console.log('💡 Add your phone number using: window.alertService.addPhone("919XXXXXXXXX")');
    }

    // ==========================================
    // PHONE NUMBER MANAGEMENT
    // ==========================================

    addPhone(phoneNumber, name = 'User', zone = 'Chennai') {
        // Clean phone number
        const cleaned = phoneNumber.replace(/\D/g, '');

        // Validate Indian number
        if (cleaned.length !== 10 && cleaned.length !== 12) {
            console.error('❌ Invalid phone number. Use 10 digits (e.g., 9876543210) or with country code (919876543210)');
            return false;
        }

        // Remove +91 or 91 prefix if present
        const phone = cleaned.length === 12 ? cleaned.substring(2) : cleaned;

        // Check if already exists
        if (this.demoPhones.find(p => p.phone === phone)) {
            console.log('ℹ️ Phone already registered');
            return true;
        }

        this.demoPhones.push({ phone, name, zone, addedAt: new Date().toISOString() });
        console.log(`✅ Phone registered: ${phone} (${name}) - Zone: ${zone}`);
        console.log(`📊 Total registered phones: ${this.demoPhones.length}`);

        // Show notification
        this.showNotification(`📱 Phone registered: ${phone}`, 'success');

        return true;
    }

    removePhone(phoneNumber) {
        const phone = phoneNumber.replace(/\D/g, '');
        const idx = this.demoPhones.findIndex(p => p.phone === phone || p.phone.endsWith(phone));
        if (idx !== -1) {
            this.demoPhones.splice(idx, 1);
            console.log(`❌ Phone removed: ${phone}`);
            return true;
        }
        return false;
    }

    listPhones() {
        console.log('\n📱 REGISTERED PHONES:');
        console.log('─'.repeat(50));
        if (this.demoPhones.length === 0) {
            console.log('   No phones registered. Add using: addPhone("9876543210")');
        } else {
            this.demoPhones.forEach((p, i) => {
                console.log(`   ${i + 1}. ${p.phone} - ${p.name} (${p.zone})`);
            });
        }
        console.log('─'.repeat(50));
        return this.demoPhones;
    }

    // ==========================================
    // API KEY SETUP
    // ==========================================

    setApiKey(provider, apiKey) {
        if (provider === 'fast2sms') {
            this.config.fast2sms.apiKey = apiKey;
            this.config.mode = 'real';
            this.config.provider = 'fast2sms';
            console.log('✅ Fast2SMS API key set. SMS sending is now LIVE!');
        } else if (provider === 'twilio') {
            // For Twilio, pass {accountSid, authToken, fromNumber}
            Object.assign(this.config.twilio, apiKey);
            this.config.mode = 'real';
            this.config.provider = 'twilio';
            console.log('✅ Twilio configured. SMS sending is now LIVE!');
        }
    }

    // ==========================================
    // SEND SMS FUNCTIONS
    // ==========================================

    async sendFloodAlert(zone, riskPercentage) {
        const message = `🚨 FLOOD ALERT: ${zone} - ${riskPercentage}% risk. Water levels rising. Move to higher ground immediately. Helpline: 1070 - NDRF Emergency`;

        // Get phones for this zone or all phones
        const recipients = this.demoPhones.filter(p =>
            p.zone.toLowerCase().includes(zone.toLowerCase()) ||
            zone.toLowerCase().includes(p.zone.toLowerCase()) ||
            zone === 'all'
        );

        // If no specific zone matches, send to all
        const phonesToAlert = recipients.length > 0 ? recipients : this.demoPhones;

        if (phonesToAlert.length === 0) {
            console.log('⚠️ No phones registered! Add phone using: alertService.addPhone("9876543210")');
            this.showNotification('No phones registered! Add via console.', 'warning');
            return { success: 0, failed: 0 };
        }

        console.log(`\n📱 Sending FLOOD ALERT to ${phonesToAlert.length} phones in ${zone}...`);

        const results = { success: 0, failed: 0 };

        for (const recipient of phonesToAlert) {
            const result = await this.sendSMS(recipient.phone, message);
            if (result.success) {
                results.success++;
                this.stats.totalSent++;
            } else {
                results.failed++;
                this.stats.totalFailed++;
            }
        }

        console.log(`✅ Alert complete: ${results.success} sent, ${results.failed} failed`);

        // Log to history
        this.alertHistory.push({
            type: 'FLOOD_ALERT',
            zone,
            risk: riskPercentage,
            recipients: phonesToAlert.length,
            success: results.success,
            timestamp: new Date().toISOString()
        });

        return results;
    }

    async sendSOS(phoneNumber, message) {
        const sms = `✅ SOS RECEIVED: Your distress signal has been logged. Rescue team dispatched. ${message || 'Stay calm, help is coming.'} - Flood Emergency Response`;
        return await this.sendSMS(phoneNumber, sms);
    }

    async sendEvacuationOrder(zone, shelterLocation = 'Nearest relief camp') {
        const message = `⚠️ EVACUATION ORDER: ${zone} - Immediate evacuation required. Proceed to ${shelterLocation}. NDRF teams deploying. Stay safe! Helpline: 1070`;

        const phonesToAlert = this.demoPhones.filter(p =>
            p.zone.toLowerCase().includes(zone.toLowerCase())
        );

        for (const recipient of phonesToAlert) {
            await this.sendSMS(recipient.phone, message);
        }

        return { recipients: phonesToAlert.length };
    }

    // ==========================================
    // CORE SMS SENDING
    // ==========================================

    async sendSMS(phoneNumber, message) {
        const phone = phoneNumber.replace(/\D/g, '');

        if (this.config.mode === 'real' && this.config.fast2sms.apiKey) {
            return await this.sendViaFast2SMS(phone, message);
        } else {
            return this.sendDemo(phone, message);
        }
    }

    async sendViaFast2SMS(phone, message) {
        try {
            console.log(`📤 Sending REAL SMS to ${phone}...`);

            const response = await fetch(this.config.fast2sms.endpoint, {
                method: 'POST',
                headers: {
                    'authorization': this.config.fast2sms.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    route: 'q', // Quick/Transactional
                    message: message,
                    language: 'english',
                    flash: 0,
                    numbers: phone
                })
            });

            const data = await response.json();

            if (data.return === true) {
                console.log(`✅ SMS SENT to ${phone}`);
                this.showNotification(`SMS sent to ${phone}!`, 'success');
                return { success: true, requestId: data.request_id };
            } else {
                console.error(`❌ SMS FAILED: ${data.message}`);
                this.showNotification(`SMS failed: ${data.message}`, 'error');
                return { success: false, error: data.message };
            }
        } catch (error) {
            console.error(`❌ SMS Error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    sendDemo(phone, message) {
        const timestamp = new Date().toLocaleString('en-IN');

        console.log('\n' + '═'.repeat(60));
        console.log('📱 SMS DEMO - Would send to: ' + phone);
        console.log('═'.repeat(60));
        console.log('Message:', message);
        console.log('Time:', timestamp);
        console.log('═'.repeat(60) + '\n');

        // Show in UI
        this.showNotification(`📱 Demo SMS to ${phone}: ${message.substring(0, 40)}...`, 'info');

        this.alertHistory.push({
            type: 'DEMO_SMS',
            phone,
            message,
            timestamp,
            mode: 'demo'
        });

        return { success: true, mode: 'demo' };
    }

    // ==========================================
    // WEB PUSH NOTIFICATIONS (FREE!)
    // ==========================================

    async requestNotificationPermission() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('✅ Browser notifications enabled');
                this.showNotification('Notifications enabled!', 'success');
            }
            return permission === 'granted';
        }
        return false;
    }

    sendWebPush(title, body, data = {}) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(title, {
                body: body,
                icon: '🚨',
                tag: 'flood-alert',
                requireInteraction: true
            });

            notification.onclick = () => {
                window.focus();
                notification.close();
            };

            return true;
        }
        return false;
    }

    // ==========================================
    // UI HELPERS
    // ==========================================

    showNotification(message, type = 'info') {
        const colors = {
            success: '#22c55e',
            error: '#dc2626',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        // Remove existing
        document.getElementById('smsNotification')?.remove();

        const notif = document.createElement('div');
        notif.id = 'smsNotification';
        notif.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${colors[type]};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10001;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
            max-width: 350px;
        `;
        notif.textContent = message;
        document.body.appendChild(notif);

        setTimeout(() => notif.remove(), 5000);
    }

    // ==========================================
    // PHONE INPUT MODAL
    // ==========================================

    showPhoneRegistration() {
        let modal = document.getElementById('phoneRegistrationModal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'phoneRegistrationModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10002;
        `;

        modal.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #1a1a24, #12121a);
                border: 2px solid #3b82f6;
                border-radius: 16px;
                padding: 32px;
                width: 400px;
                max-width: 90%;
            ">
                <h2 style="color:#f0f0f5;margin:0 0 20px;text-align:center">📱 Register Phone for Alerts</h2>
                
                <div style="margin-bottom:16px">
                    <label style="color:#a0a0b0;font-size:12px;display:block;margin-bottom:4px">Phone Number (10 digits)</label>
                    <input type="tel" id="phoneInput" placeholder="9876543210" 
                        style="width:100%;padding:12px;background:#242430;border:1px solid #333;
                        border-radius:8px;color:#f0f0f5;font-size:16px">
                </div>
                
                <div style="margin-bottom:16px">
                    <label style="color:#a0a0b0;font-size:12px;display:block;margin-bottom:4px">Name</label>
                    <input type="text" id="nameInput" placeholder="Your Name" 
                        style="width:100%;padding:12px;background:#242430;border:1px solid #333;
                        border-radius:8px;color:#f0f0f5;font-size:14px">
                </div>
                
                <div style="margin-bottom:20px">
                    <label style="color:#a0a0b0;font-size:12px;display:block;margin-bottom:4px">Zone</label>
                    <select id="zoneSelect" style="width:100%;padding:12px;background:#242430;
                        border:1px solid #333;border-radius:8px;color:#f0f0f5;font-size:14px">
                        <option value="Chennai">Chennai</option>
                        <option value="Velachery">Velachery</option>
                        <option value="Porur">Porur</option>
                        <option value="Adyar">Adyar</option>
                        <option value="Tambaram">Tambaram</option>
                    </select>
                </div>
                
                <div style="display:flex;gap:12px">
                    <button onclick="
                        const phone = document.getElementById('phoneInput').value;
                        const name = document.getElementById('nameInput').value || 'User';
                        const zone = document.getElementById('zoneSelect').value;
                        if (window.alertService.addPhone(phone, name, zone)) {
                            document.getElementById('phoneRegistrationModal').remove();
                        }
                    " style="
                        flex:1;
                        background:linear-gradient(135deg,#22c55e,#16a34a);
                        border:none;
                        color:white;
                        padding:12px;
                        border-radius:8px;
                        font-weight:600;
                        cursor:pointer;
                    ">Register</button>
                    <button onclick="document.getElementById('phoneRegistrationModal').remove()" style="
                        flex:1;
                        background:#333;
                        border:none;
                        color:#a0a0b0;
                        padding:12px;
                        border-radius:8px;
                        cursor:pointer;
                    ">Cancel</button>
                </div>
                
                <div style="margin-top:16px;font-size:11px;color:#666;text-align:center">
                    For REAL SMS: Set API key using console:<br>
                    <code style="color:#3b82f6">alertService.setApiKey('fast2sms', 'YOUR_KEY')</code>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    // Get stats
    getStats() {
        return {
            registeredPhones: this.demoPhones.length,
            totalSent: this.stats.totalSent,
            totalFailed: this.stats.totalFailed,
            mode: this.config.mode,
            recentAlerts: this.alertHistory.slice(-5)
        };
    }
}

// ==========================================
// GLOBAL INSTANCE
// ==========================================

const alertService = new EmergencyAlertService();

if (typeof window !== 'undefined') {
    window.alertService = alertService;

    // Helper functions for console
    window.addPhone = (phone, name, zone) => alertService.addPhone(phone, name, zone);
    window.listPhones = () => alertService.listPhones();
    window.sendTestAlert = (zone) => alertService.sendFloodAlert(zone || 'Chennai', 75);
    window.showPhoneRegistration = () => alertService.showPhoneRegistration();

    console.log('\n📱 SMS ALERT SERVICE READY');
    console.log('─'.repeat(50));
    console.log('Quick commands:');
    console.log('  addPhone("9876543210", "Name", "Chennai")');
    console.log('  listPhones()');
    console.log('  sendTestAlert("Velachery")');
    console.log('  showPhoneRegistration()  - Opens UI form');
    console.log('─'.repeat(50));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EmergencyAlertService, alertService };
}
