/**
 * Browser Fingerprinting Module
 * Collects browser surface data without external APIs
 * Avoids PII while gathering environment characteristics
 */

export class BrowserFingerprint {
    constructor() {
        this.data = {};
    }

    /**
     * Collect all fingerprint data
     * @returns {Object} Complete fingerprint object
     */
    async collect() {
        // Basic navigator properties
        this.collectNavigatorData();
        
        // Screen and display information
        this.collectScreenData();
        
        // Storage capabilities
        this.collectStorageData();
        
        // WebGL renderer information
        await this.collectWebGLData();
        
        // Canvas fingerprint (small hash)
        this.collectCanvasHash();
        
        // Internationalization settings
        this.collectIntlData();
        
        // Performance memory if available
        this.collectPerformanceData();
        
        // Permissions (safe queries only)
        await this.collectPermissionsData();
        
        return this.data;
    }

    /**
     * Collect navigator object properties
     */
    collectNavigatorData() {
        const nav = navigator;
        
        this.data.navigator = {
            userAgent: nav.userAgent || '',
            platform: nav.platform || '',
            language: nav.language || '',
            languages: Array.from(nav.languages || []),
            hardwareConcurrency: nav.hardwareConcurrency || 0,
            deviceMemory: nav.deviceMemory || null,
            webdriver: nav.webdriver || false,
            maxTouchPoints: nav.maxTouchPoints || 0,
            plugins_len: nav.plugins ? nav.plugins.length : 0,
            plugins_is_array: nav.plugins instanceof PluginArray,
            cookieEnabled: nav.cookieEnabled || false,
            onLine: nav.onLine || false
        };

        // Connection info if available
        if (nav.connection) {
            this.data.navigator.connection = {
                downlink: nav.connection.downlink || null,
                effectiveType: nav.connection.effectiveType || null,
                rtt: nav.connection.rtt || null,
                saveData: nav.connection.saveData || false
            };
        }
    }

    /**
     * Collect screen and display information
     */
    collectScreenData() {
        const screen = window.screen;
        
        this.data.screen = {
            width: screen.width || 0,
            height: screen.height || 0,
            availWidth: screen.availWidth || 0,
            availHeight: screen.availHeight || 0,
            colorDepth: screen.colorDepth || 0,
            pixelDepth: screen.pixelDepth || 0
        };

        // Viewport information
        this.data.viewport = {
            innerWidth: window.innerWidth || 0,
            innerHeight: window.innerHeight || 0,
            outerWidth: window.outerWidth || 0,
            outerHeight: window.outerHeight || 0,
            devicePixelRatio: window.devicePixelRatio || 1
        };
    }

    /**
     * Test storage availability
     */
    collectStorageData() {
        this.data.storage = {
            localStorage: this.testStorage('localStorage'),
            sessionStorage: this.testStorage('sessionStorage'),
            indexedDB: !!window.indexedDB,
            webSQL: !!window.openDatabase,
            cookies: navigator.cookieEnabled || false
        };
    }

    /**
     * Test if storage type is available
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @returns {boolean}
     */
    testStorage(storageType) {
        try {
            const storage = window[storageType];
            const test = '__test__';
            storage.setItem(test, test);
            storage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Collect WebGL renderer information
     */
    async collectWebGLData() {
        this.data.webgl = {
            vendor: '',
            renderer: '',
            version: '',
            shadingLanguageVersion: '',
            supported: false
        };

        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            
            if (gl) {
                this.data.webgl.supported = true;
                this.data.webgl.version = gl.getParameter(gl.VERSION) || '';
                this.data.webgl.shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || '';
                
                // Get debug renderer info extension
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    this.data.webgl.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
                    this.data.webgl.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
                }
            }
        } catch (e) {
            // WebGL not supported or blocked
            this.data.webgl.error = e.message;
        }
    }

    /**
     * Generate a small canvas-based hash
     */
    collectCanvasHash() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Draw some text with different properties
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillText('BrowserLab🔬', 2, 2);
            ctx.font = '12px Times';
            ctx.fillStyle = 'rgba(255,0,0,0.5)';
            ctx.fillText('Fingerprint', 4, 17);
            
            // Get data URL and create short hash
            const dataURL = canvas.toDataURL();
            this.data.canvas_hash = this.simpleHash(dataURL).toString(16).slice(0, 16);
        } catch (e) {
            this.data.canvas_hash = 'unavailable';
        }
    }

    /**
     * Simple hash function for canvas data
     * @param {string} str - String to hash
     * @returns {number}
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Collect internationalization settings
     */
    collectIntlData() {
        try {
            const formatter = new Intl.DateTimeFormat();
            const resolved = formatter.resolvedOptions();
            
            this.data.intl = {
                locale: resolved.locale || '',
                timeZone: resolved.timeZone || '',
                calendar: resolved.calendar || '',
                numberingSystem: resolved.numberingSystem || ''
            };

            // Additional Intl support
            this.data.intl.support = {
                Collator: !!Intl.Collator,
                NumberFormat: !!Intl.NumberFormat,
                PluralRules: !!Intl.PluralRules,
                RelativeTimeFormat: !!Intl.RelativeTimeFormat
            };
        } catch (e) {
            this.data.intl = { error: e.message };
        }
    }

    /**
     * Collect performance memory information
     */
    collectPerformanceData() {
        this.data.performance = {};
        
        if (performance.memory) {
            this.data.performance.memory = {
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit || 0,
                totalJSHeapSize: performance.memory.totalJSHeapSize || 0,
                usedJSHeapSize: performance.memory.usedJSHeapSize || 0
            };
        }

        // Timing information
        if (performance.timing) {
            const timing = performance.timing;
            this.data.performance.navigation = {
                type: performance.navigation ? performance.navigation.type : null,
                redirectCount: performance.navigation ? performance.navigation.redirectCount : 0,
                loadEventEnd: timing.loadEventEnd - timing.navigationStart
            };
        }
    }

    /**
     * Safely query permissions
     */
    async collectPermissionsData() {
        this.data.permissions = {};
        
        if (!navigator.permissions || !navigator.permissions.query) {
            this.data.permissions.unsupported = true;
            return;
        }

        // Safe permission queries (no prompts)
        const permissions = [
            'notifications',
            'clipboard-read',
            'clipboard-write',
            'geolocation',
            'camera',
            'microphone'
        ];

        for (const permission of permissions) {
            try {
                const result = await navigator.permissions.query({ name: permission });
                this.data.permissions[permission] = result.state;
            } catch (e) {
                this.data.permissions[permission] = 'unsupported';
            }
        }
    }

    /**
     * Get a summary suitable for reports
     * @returns {Object} Simplified fingerprint data
     */
    getSummary() {
        return {
            ua: this.data.navigator?.userAgent?.substring(0, 100) + '...' || '',
            platform: this.data.navigator?.platform || '',
            language: this.data.navigator?.language || '',
            languages: this.data.navigator?.languages || [],
            webdriver: this.data.navigator?.webdriver || false,
            hardwareConcurrency: this.data.navigator?.hardwareConcurrency || 0,
            plugins_len: this.data.navigator?.plugins_len || 0,
            webgl: {
                vendor: this.data.webgl?.vendor || '',
                renderer: this.data.webgl?.renderer || ''
            },
            canvas_hash: this.data.canvas_hash || '',
            screen: {
                w: this.data.screen?.width || 0,
                h: this.data.screen?.height || 0
            },
            intl: {
                locale: this.data.intl?.locale || '',
                timeZone: this.data.intl?.timeZone || ''
            }
        };
    }
}

// Export singleton instance
export const fingerprint = new BrowserFingerprint();
