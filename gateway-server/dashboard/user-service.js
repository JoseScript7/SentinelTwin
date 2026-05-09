// ==========================================
// USER SERVICE - MINIMAL VERSION
// No floating buttons - profile via header menu
// ==========================================

class UserService {
    constructor() {
        this.currentUser = null;
        this.loadUser();
    }

    loadUser() {
        try {
            const saved = localStorage.getItem('floodApp_user');
            if (saved) {
                this.currentUser = JSON.parse(saved);
            }
        } catch (e) {
            console.log('No saved user');
        }
    }

    saveUser() {
        if (this.currentUser) {
            localStorage.setItem('floodApp_user', JSON.stringify(this.currentUser));
        }
    }

    getUser() {
        return this.currentUser;
    }

    setUser(data) {
        this.currentUser = {
            ...this.currentUser,
            ...data,
            updatedAt: new Date().toISOString()
        };
        this.saveUser();
    }

    getZone() {
        return this.currentUser?.zone || 'Chennai';
    }

    getPhone() {
        return this.currentUser?.phone || null;
    }
}

// Global instance
const userService = new UserService();

if (typeof window !== 'undefined') {
    window.userService = userService;
}
