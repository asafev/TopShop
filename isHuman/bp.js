// bot-protection.js
// Frontend-only bot protection system - NO BACKEND REQUIRED
// Add this script to the <head> of your protected pages (index.html, fingerprint-analysis.html)

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        challengePage: 'challenge.html',
        tokenKey: 'botChallenge_token',
        tokenExpiry: 3600000, // 1 hour
        minScore: 70 // Minimum score to pass
    };

    // Crypto hash function for token integrity (client-side only)
    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    // Additional bot detection on protected page
    function detectBotSignals() {
        const signals = {
            webdriver: navigator.webdriver === true,
            noChrome: !window.chrome && /Chrome/.test(navigator.userAgent),
            phantomJS: !!(window.callPhantom || window._phantom),
            selenium: !!(window.document.$cdc_ || window.document.$wdc_),
            screenZero: screen.width === 0 || screen.height === 0,
            noPlugins: navigator.plugins.length === 0,
            noLanguages: navigator.languages.length === 0
        };
        
        const botIndicators = Object.values(signals).filter(Boolean).length;
        return botIndicators >= 2; // If 2+ signals, likely bot
    }

    function verifyToken(token) {
        try {
            const data = JSON.parse(atob(token));
            const { h, t, s, v, r } = data;
            
            // Check if token exists and has all required fields
            if (!h || !t || !s || !v || !r) {
                console.warn('🛡️ Token missing required fields');
                return false;
            }
            
            // Check expiry
            if (Date.now() - t > CONFIG.tokenExpiry) {
                console.warn('🛡️ Token expired');
                return false;
            }
            
            // Verify hash to detect tampering
            const payload = JSON.stringify({ t, s, v, r });
            const expectedHash = simpleHash(payload + t);
            
            if (h !== expectedHash) {
                console.warn('🛡️ Token hash mismatch - tampering detected');
                return false;
            }
            
            // Must have passing score
            if (s < CONFIG.minScore) {
                console.warn('🛡️ Token score too low:', s);
                return false;
            }
            
            return true;
        } catch (e) {
            console.warn('🛡️ Token verification error:', e.message);
            return false;
        }
    }

    // Check if user has valid verification token
    function isVerified() {
        try {
            const token = sessionStorage.getItem(CONFIG.tokenKey);
            
            if (!token) {
                return false;
            }
            
            return verifyToken(token);
        } catch (e) {
            return false;
        }
    }

    // Redirect to challenge if needed
    function enforceProtection() {
        // Don't check if we're already on the challenge page
        if (window.location.pathname.includes('challenge.html')) {
            return;
        }

        // Additional bot detection
        if (detectBotSignals()) {
            console.warn('🛡️ Bot signals detected - redirecting to challenge');
            sessionStorage.removeItem(CONFIG.tokenKey);
            window.location.href = CONFIG.challengePage;
            return;
        }

        // Check verification status
        if (!isVerified()) {
            console.log('🛡️ No valid token - redirecting to challenge');
            sessionStorage.removeItem(CONFIG.tokenKey);
            
            // Store return URL for redirect after challenge
            sessionStorage.setItem('botChallenge_returnUrl', window.location.pathname + window.location.search);
            
            // Redirect to challenge
            window.location.href = CONFIG.challengePage;
        } else {
            console.log('✅ Bot protection verified - access granted');
        }
    }

    // Run protection check immediately (blocking)
    enforceProtection();

    // Monitor for token tampering attempts (anti-bypass measure)
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
        if (key === CONFIG.tokenKey) {
            // Someone is trying to set the token directly - verify it
            if (!verifyToken(value)) {
                console.warn('⚠️ Invalid token injection attempt blocked');
                sessionStorage.clear();
                if (!window.location.pathname.includes('challenge.html')) {
                    window.location.href = CONFIG.challengePage;
                }
                return;
            }
        }
        return originalSetItem.apply(this, arguments);
    };

    // Also monitor removeItem attempts
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key) {
        if (key === CONFIG.tokenKey && !window.location.pathname.includes('challenge.html')) {
            console.warn('⚠️ Token removal detected - redirecting to challenge');
            originalRemoveItem.apply(this, arguments);
            window.location.href = CONFIG.challengePage;
            return;
        }
        return originalRemoveItem.apply(this, arguments);
    };

    // Periodically verify token is still valid (handles expiry and tampering)
    setInterval(() => {
        if (!window.location.pathname.includes('challenge.html') && !isVerified()) {
            console.warn('🛡️ Token expired or invalid - redirecting');
            sessionStorage.removeItem(CONFIG.tokenKey);
            window.location.href = CONFIG.challengePage;
        }
    }, 30000); // Check every 30 seconds

    // Monitor visibility changes (detect tab switching bots)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !window.location.pathname.includes('challenge.html')) {
            if (!isVerified()) {
                console.warn('🛡️ Token invalid after visibility change');
                window.location.href = CONFIG.challengePage;
            }
        }
    });

    // Expose debugging methods (remove in production)
    window.__resetBotProtection = function() {
        sessionStorage.removeItem(CONFIG.tokenKey);
        sessionStorage.removeItem('botChallenge_returnUrl');
        console.log('🛡️ Bot protection reset. Reload page to see challenge.');
    };

    window.__checkProtectionStatus = function() {
        const token = sessionStorage.getItem(CONFIG.tokenKey);
        if (!token) {
            console.log('❌ No token found - not verified');
            return { verified: false };
        }
        
        try {
            const data = JSON.parse(atob(token));
            const valid = verifyToken(token);
            const age = Date.now() - data.t;
            const expiresIn = CONFIG.tokenExpiry - age;
            
            const status = {
                verified: valid,
                score: data.s,
                version: data.v,
                age: Math.round(age / 1000) + 's',
                expiresIn: Math.round(expiresIn / 1000) + 's',
                expired: expiresIn <= 0
            };
            
            console.log('🛡️ Protection Status:', status);
            return status;
        } catch (e) {
            console.log('❌ Invalid token format:', e.message);
            return { verified: false, error: e.message };
        }
    };

    window.__bypassProtection = function() {
        console.warn('⚠️ Bypass attempt detected - this action is logged');
        // In production, this could send an alert to monitoring
        return false;
    };

    console.log('🛡️ Bot protection active - behavioral verification required');
    console.log('📊 Token expiry:', CONFIG.tokenExpiry / 1000 / 60, 'minutes');
})();