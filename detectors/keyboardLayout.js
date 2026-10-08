import { log as _log } from '../utils/log.js';
/**
 * Keyboard Layout Detector Module
 * Collects keyboard layout fingerprinting data via navigator.keyboard API
 * 
 * This reveals physical keyboard locale which is:
 * - Locale-specific (different countries use QWERTY, QWERTZ, AZERTY)
 * - Hard to spoof (most anti-detect tools don't modify this API)
 * - Persistent (tied to hardware/OS configuration, not browser settings)
 * 
 * @module detectors/keyboardLayout
 * @see CHEQ deobfuscated test ID 141 - Keyboard layout detection
 */

import { fnv1a32 } from './audioFingerprint.js';

/**
 * Generate list of standard key codes to check
 * Based on CHEQ's implementation
 */
function getStandardKeyCodes() {
    const keyCodes = [];
    
    // Digit keys (0-9)
    for (let i = 0; i <= 9; i++) {
        keyCodes.push('Digit' + i);
    }
    
    // Letter keys (A-Z)
    for (let i = 65; i <= 90; i++) {
        keyCodes.push('Key' + String.fromCharCode(i));
    }
    
    // Special/punctuation keys
    keyCodes.push(
        'Backquote', 'Backslash', 'Backspace', 'BracketLeft', 'BracketRight',
        'Comma', 'Equal', 'IntlBackslash', 'IntlRo', 'IntlYen',
        'Minus', 'Period', 'Quote', 'Semicolon', 'Slash'
    );
    
    return keyCodes;
}

/**
 * Detect keyboard layout type based on key mappings
 * @param {Object} mappings - Key code to character mappings
 * @returns {string} Detected layout type
 */
function detectLayoutType(mappings) {
    if (!mappings || Object.keys(mappings).length === 0) {
        return 'Unknown';
    }
    
    const keyZ = mappings.KeyZ;
    const keyY = mappings.KeyY;
    const keyA = mappings.KeyA;
    const keyQ = mappings.KeyQ;
    const semicolon = mappings.Semicolon;
    
    // QWERTY (US/UK) - Z=z, Y=y, Q=q, A=a
    if (keyZ === 'z' && keyY === 'y' && keyQ === 'q' && keyA === 'a') {
        // Check for UK vs US
        if (mappings.IntlBackslash) {
            return 'QWERTY (UK/ISO)';
        }
        return 'QWERTY (US)';
    }
    
    // QWERTZ (German/Central European) - Z=y, Y=z
    if (keyZ === 'y' && keyY === 'z') {
        return 'QWERTZ (German/CE)';
    }
    
    // AZERTY (French/Belgian) - Q=a, A=q
    if (keyA === 'q' && keyQ === 'a') {
        return 'AZERTY (French)';
    }
    
    // Spanish - check for ñ on semicolon
    if (semicolon === 'ñ') {
        return 'QWERTY (Spanish)';
    }
    
    // Colemak - check for specific layout
    if (keyZ === 'z' && mappings.KeyS === 'r' && mappings.KeyD === 's') {
        return 'Colemak';
    }
    
    // Dvorak - check for specific layout
    if (mappings.KeyS === 'o' && mappings.KeyD === 'e') {
        return 'Dvorak';
    }
    
    return 'Unknown';
}

/**
 * Calculate fingerprint hash from keyboard layout
 * @param {string} fingerprint - Raw fingerprint string
 * @returns {number} 32-bit hash
 */
function calculateFingerprintHash(fingerprint) {
    if (!fingerprint) return 0;
    return fnv1a32(fingerprint);
}

/**
 * KeyboardLayoutDetector class
 * Collects keyboard layout information for fingerprinting
 */
class KeyboardLayoutDetector {
    constructor(options = {}) {
        this.metrics = {};
        this.result = null;
        this.options = {
            timeout: options.timeout || 3000,
            ...options
        };
    }

    /**
     * Check if Keyboard API is available
     * @returns {boolean}
     */
    isSupported() {
        return 'keyboard' in navigator && 
               typeof navigator.keyboard.getLayoutMap === 'function';
    }

    /**
     * Analyze keyboard layout (async)
     * @returns {Promise<Object>} Formatted metrics
     */
    async analyze() {
        try {
            const result = await this.collect();
            this.result = result;
            this.metrics = this._formatMetrics(result);
            return this.metrics;
        } catch (error) {
            _log.warn('⚠️ Keyboard layout analysis failed:', error.message);
            return this._formatMetrics({
                supported: false,
                error: error.message
            });
        }
    }

    /**
     * Collect keyboard layout data
     * @returns {Promise<Object>} Raw collection result
     */
    async collect() {
        // Check API availability
        if (!('keyboard' in navigator)) {
            return {
                supported: false,
                reason: 'Keyboard API not available',
                note: 'Requires secure context (HTTPS) and Chromium browser'
            };
        }

        if (typeof navigator.keyboard.getLayoutMap !== 'function') {
            return {
                supported: false,
                reason: 'getLayoutMap method not available'
            };
        }

        // Verify native function
        const fnString = navigator.keyboard.getLayoutMap.toString();
        const isNative = fnString.indexOf('[native code]') > -1;

        try {
            const layoutMap = await navigator.keyboard.getLayoutMap();
            const keyCodes = getStandardKeyCodes();
            
            // Collect mappings from our predefined list
            const mappings = {};
            let fingerprint = '';
            
            keyCodes.forEach(code => {
                const key = layoutMap.get(code);
                fingerprint += ',';
                if (key) {
                    fingerprint += key;
                    mappings[code] = key;
                }
            });

            // === RESEARCH: Capture ALL keys from the layoutMap itself ===
            // This reveals exactly what keys the browser reports, regardless of our list
            const allMappings = {};
            const allKeyCodes = [];
            
            // layoutMap is iterable - get all entries directly from the browser
            for (const [code, key] of layoutMap.entries()) {
                allMappings[code] = key;
                allKeyCodes.push(code);
            }
            
            // Find keys we're missing (in browser but not in our list)
            const ourKeySet = new Set(keyCodes);
            const missingFromOurList = allKeyCodes.filter(k => !ourKeySet.has(k));
            
            // Find keys we test but browser doesn't have
            const browserKeySet = new Set(allKeyCodes);
            const notInBrowser = keyCodes.filter(k => !browserKeySet.has(k));

            // Calculate hash
            const fingerprintHash = calculateFingerprintHash(fingerprint);
            
            // Detect layout type
            const layoutType = detectLayoutType(mappings);
            
            // Count mapped keys
            const totalMappedKeys = Object.keys(mappings).length;
            const totalBrowserKeys = allKeyCodes.length;

            return {
                supported: true,
                isNativeFunction: isNative,
                layoutType,
                fingerprintHash,
                fingerprint,
                totalMappedKeys,
                mappings,
                
                // === RESEARCH DATA: For comparing with other tools ===
                totalBrowserKeys,           // Total keys the browser actually reports
                allMappings,                 // All key->char mappings from browser
                allKeyCodes,                 // All key codes the browser knows about (sorted for comparison)
                missingFromOurList,          // Keys browser has but we don't test
                notInBrowser,                // Keys we test but browser doesn't have
                
                // Key differentiators for fingerprinting
                keySemicolon: mappings.Semicolon || null,
                keyQuote: mappings.Quote || null,
                keyZ: mappings.KeyZ || null,
                keyY: mappings.KeyY || null,
                intlBackslash: mappings.IntlBackslash || null,
                intlRo: mappings.IntlRo || null,
                intlYen: mappings.IntlYen || null,
                backquote: mappings.Backquote || null
            };
        } catch (error) {
            return {
                supported: true, // API exists but failed
                error: error.message,
                isNativeFunction: isNative
            };
        }
    }

    /**
     * Format raw results into metrics object
     * @private
     * @param {Object} result - Raw collection result
     * @returns {Object} Formatted metrics
     */
    _formatMetrics(result) {
        if (!result.supported) {
            return {
                hasKeyboardAPI: {
                    value: false,
                    description: 'Keyboard API availability',
                    risk: 'N/A'
                },
                keyboardAPIReason: {
                    value: result.reason || result.error || 'Not supported',
                    description: 'Why Keyboard API is not available',
                    risk: 'N/A'
                },
                keyboardNote: {
                    value: result.note || 'Requires HTTPS and Chromium browser (Chrome/Edge)',
                    description: 'Keyboard API support note',
                    risk: 'N/A'
                }
            };
        }

        if (result.error) {
            return {
                hasKeyboardAPI: {
                    value: true,
                    description: 'Keyboard API availability',
                    risk: 'N/A'
                },
                keyboardError: {
                    value: result.error,
                    description: 'Error collecting keyboard layout',
                    risk: 'MEDIUM'
                }
            };
        }

        return {
            hasKeyboardAPI: {
                value: true,
                description: 'Keyboard API availability (reveals physical keyboard locale)',
                risk: 'N/A'
            },
            layoutTypeDetected: {
                value: result.layoutType,
                description: 'Detected keyboard layout type',
                risk: 'N/A'
            },
            fingerprintHash: {
                value: result.fingerprintHash,
                description: 'FNV-1a hash of keyboard layout fingerprint',
                risk: 'N/A'
            },
            totalMappedKeys: {
                value: result.totalMappedKeys,
                description: 'Number of keys with valid mappings (from our predefined list)',
                risk: result.totalMappedKeys === 0 ? 'HIGH' : 'N/A'
            },
            
            // === RESEARCH METRICS: For comparing with other tools ===
            totalBrowserKeys: {
                value: result.totalBrowserKeys,
                description: 'Total keys the browser actually reports in layoutMap',
                risk: 'N/A'
            },
            missingFromOurList: {
                value: result.missingFromOurList,
                description: 'Keys browser has but we don\'t test (add these to match other tools)',
                risk: 'N/A'
            },
            notInBrowser: {
                value: result.notInBrowser,
                description: 'Keys we test but browser doesn\'t have (expected for some keys)',
                risk: 'N/A'
            },
            allKeyCodes: {
                value: result.allKeyCodes,
                description: 'All key codes from browser layoutMap (for comparison)',
                risk: 'N/A'
            },
            allMappings: {
                value: result.allMappings,
                description: 'Complete key->char mapping from browser (for diff analysis)',
                risk: 'N/A'
            },
            
            keySemicolon: {
                value: result.keySemicolon || '(unmapped)',
                description: 'Semicolon key mapping (differs across layouts: ; vs ñ vs ö)',
                risk: 'N/A'
            },
            keyQuote: {
                value: result.keyQuote || '(unmapped)',
                description: 'Quote key mapping (differs: \' vs ù vs ä)',
                risk: 'N/A'
            },
            keyZPosition: {
                value: result.keyZ || '(unmapped)',
                description: 'Z key mapping (QWERTY: z, QWERTZ: y)',
                risk: 'N/A'
            },
            keyYPosition: {
                value: result.keyY || '(unmapped)',
                description: 'Y key mapping (QWERTY: y, QWERTZ: z)',
                risk: 'N/A'
            },
            intlBackslash: {
                value: result.intlBackslash || '(unmapped)',
                description: 'IntlBackslash key (ISO marker - present on UK/EU keyboards)',
                risk: 'N/A'
            },
            backquote: {
                value: result.backquote || '(unmapped)',
                description: 'Backquote/tilde key mapping',
                risk: 'N/A'
            },
            isNativeFunction: {
                value: result.isNativeFunction,
                description: 'Whether getLayoutMap is native (not spoofed)',
                risk: result.isNativeFunction === false ? 'HIGH' : 'N/A'
            }
        };
    }

    /**
     * Get suspicious indicators from keyboard layout analysis
     * @returns {Array} Array of suspicious indicators
     */
    getSuspiciousIndicators() {
        const indicators = [];
        
        if (!this.result) return indicators;

        // API spoofing detection
        if (this.result.supported && this.result.isNativeFunction === false) {
            indicators.push({
                category: 'keyboard_layout',
                name: 'keyboard_api_spoofed',
                description: 'Keyboard API getLayoutMap function appears to be modified/spoofed',
                severity: 'HIGH',
                confidence: 0.9,
                details: 'Native function signature not detected'
            });
        }

        // No keys mapped (unusual)
        if (this.result.supported && this.result.totalMappedKeys === 0) {
            indicators.push({
                category: 'keyboard_layout',
                name: 'no_keyboard_mappings',
                description: 'Keyboard layout returned no key mappings',
                severity: 'HIGH',
                confidence: 0.85,
                details: 'Real systems should have keyboard mappings available'
            });
        }

        // Error getting layout in supported browser
        if (this.result.supported && this.result.error) {
            indicators.push({
                category: 'keyboard_layout',
                name: 'keyboard_layout_error',
                description: 'Error accessing keyboard layout despite API being available',
                severity: 'MEDIUM',
                confidence: 0.7,
                details: `Error: ${this.result.error}`
            });
        }

        return indicators;
    }
}

export { KeyboardLayoutDetector, getStandardKeyCodes, detectLayoutType };
