/**
 * Permissions Detector Module
 * Collects browser permission states for fingerprinting and bot detection
 * 
 * @module detectors/permissionsDetector
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API
 */

/**
 * All known permission names supported by the Permissions API
 * Note: Browser support varies - unsupported permissions will be caught and marked
 */
const PERMISSION_NAMES = [
    // Media permissions
    'microphone',
    'camera',
    
    // Location
    'geolocation',
    
    // Notifications & Push
    'notifications',
    'push',
    
    // Storage & Background
    'persistent-storage',
    'background-fetch',
    'background-sync',
    
    // Device access
    'accelerometer',
    'gyroscope',
    'magnetometer',
    'ambient-light-sensor',
    
    // Display & Screen
    'screen-wake-lock',
    'display-capture',
    
    // Clipboard
    'clipboard-read',
    'clipboard-write',
    
    // Payment & Identity
    'payment-handler',
    'identity-credentials-get',
    
    // MIDI
    'midi',
    
    // XR
    'xr-spatial-tracking',
    
    // Window management
    'window-management',
    
    // Local fonts
    'local-fonts',
    
    // Storage access
    'storage-access',
    'top-level-storage-access'
];

/**
 * Permissions Detector
 * Queries all available permission states
 */
class PermissionsDetector {
    constructor() {
        this.metrics = {};
        this.result = null;
    }

    /**
     * Analyze permissions and return formatted metrics
     * @returns {Promise<Object>} Permission metrics
     */
    async analyze() {
        const result = await this.collect();
        this.result = result;
        this.metrics = this._formatMetrics(result);
        return this.metrics;
    }

    /**
     * Static collect method matching the detector pattern
     * @returns {Promise<Object>} PermissionsResult
     */
    static async collect() {
        const detector = new PermissionsDetector();
        return detector.collect();
    }

    /**
     * Collect all permission states
     * @returns {Promise<Object>} PermissionsResult
     */
    async collect() {
        const startedAt = Date.now();
        
        const result = {
            apiSupported: false,
            permissions: {},
            summary: {
                granted: 0,
                denied: 0,
                prompt: 0,
                unsupported: 0,
                total: 0
            },
            timing: {
                startedAt,
                finishedAt: 0,
                durationMs: 0
            },
            errors: []
        };

        // Check API support
        if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
            result.errors.push('Permissions API not supported');
            result.timing.finishedAt = Date.now();
            result.timing.durationMs = result.timing.finishedAt - startedAt;
            return result;
        }

        result.apiSupported = true;

        // Query all permissions in parallel for speed
        const queries = PERMISSION_NAMES.map(async (name) => {
            try {
                const status = await navigator.permissions.query({ name });
                return { name, state: status.state, supported: true };
            } catch (e) {
                // Permission name not supported in this browser
                return { name, state: 'unsupported', supported: false };
            }
        });

        const results = await Promise.all(queries);

        // Process results
        for (const { name, state, supported } of results) {
            result.permissions[name] = {
                state,
                supported
            };
            
            result.summary.total++;
            if (state === 'granted') result.summary.granted++;
            else if (state === 'denied') result.summary.denied++;
            else if (state === 'prompt') result.summary.prompt++;
            else result.summary.unsupported++;
        }

        result.timing.finishedAt = Date.now();
        result.timing.durationMs = result.timing.finishedAt - startedAt;

        return result;
    }

    /**
     * Format results into metrics object
     * @private
     */
    _formatMetrics(result) {
        const metrics = {
            // API support
            permissionsApiSupported: {
                value: result.apiSupported,
                description: 'navigator.permissions.query API availability',
                risk: 'N/A'
            },
            
            // Summary counts
            grantedCount: {
                value: result.summary.granted,
                description: 'Number of permissions in granted state',
                risk: 'N/A'
            },
            deniedCount: {
                value: result.summary.denied,
                description: 'Number of permissions in denied state',
                risk: 'N/A'
            },
            promptCount: {
                value: result.summary.prompt,
                description: 'Number of permissions in prompt state',
                risk: 'N/A'
            },
            unsupportedCount: {
                value: result.summary.unsupported,
                description: 'Number of permission types not supported by browser',
                risk: 'N/A'
            },
            
            // Key permissions (commonly used for fingerprinting)
            microphonePermission: {
                value: result.permissions.microphone?.state || 'unsupported',
                description: 'Microphone permission state',
                risk: 'N/A'
            },
            cameraPermission: {
                value: result.permissions.camera?.state || 'unsupported',
                description: 'Camera permission state',
                risk: 'N/A'
            },
            geolocationPermission: {
                value: result.permissions.geolocation?.state || 'unsupported',
                description: 'Geolocation permission state',
                risk: 'N/A'
            },
            notificationsPermission: {
                value: result.permissions.notifications?.state || 'unsupported',
                description: 'Notifications permission state',
                risk: 'N/A'
            },
            clipboardReadPermission: {
                value: result.permissions['clipboard-read']?.state || 'unsupported',
                description: 'Clipboard read permission state',
                risk: 'N/A'
            },
            clipboardWritePermission: {
                value: result.permissions['clipboard-write']?.state || 'unsupported',
                description: 'Clipboard write permission state',
                risk: 'N/A'
            },
            
            // Fingerprint-relevant: which permissions are supported
            supportedPermissions: {
                value: Object.entries(result.permissions)
                    .filter(([_, v]) => v.supported)
                    .map(([k, _]) => k)
                    .join(', ') || 'None',
                description: 'List of supported permission types in this browser',
                risk: 'N/A'
            },
            
            // Fingerprint-relevant: which permissions are NOT supported
            unsupportedPermissions: {
                value: Object.entries(result.permissions)
                    .filter(([_, v]) => !v.supported)
                    .map(([k, _]) => k)
                    .join(', ') || 'None',
                description: 'List of unsupported permission types in this browser',
                risk: 'N/A'
            },
            
            // Compact state signature for fingerprinting
            permissionSignature: {
                value: this._generateSignature(result.permissions),
                description: 'Compact permission state signature (g=granted, d=denied, p=prompt, x=unsupported)',
                risk: 'N/A'
            },
            
            // Timing
            collectionDurationMs: {
                value: result.timing.durationMs,
                description: 'Permission collection duration in milliseconds',
                risk: 'N/A'
            }
        };

        return metrics;
    }

    /**
     * Generate a compact signature of permission states
     * Useful for fingerprinting - different browsers/configs yield different signatures
     * @private
     */
    _generateSignature(permissions) {
        const stateMap = { granted: 'g', denied: 'd', prompt: 'p', unsupported: 'x' };
        
        // Use a fixed subset of key permissions for stable signature
        const keyPermissions = [
            'microphone', 'camera', 'geolocation', 'notifications',
            'clipboard-read', 'clipboard-write', 'persistent-storage',
            'midi', 'accelerometer', 'gyroscope'
        ];
        
        return keyPermissions
            .map(name => stateMap[permissions[name]?.state] || 'x')
            .join('');
    }

    /**
     * Get the raw result object
     * @returns {Object} Full PermissionsResult
     */
    getResult() {
        return this.result;
    }
}

export { PermissionsDetector, PERMISSION_NAMES };
