/**
 * CSS Computed Style Detector Module
 * Focuses on system styles, CSS features, and media queries for browser fingerprinting
 * Inspired by CreepJS src/css/index.ts (system styles/computed style)
 *
 * @module detectors/cssComputedStyle
 * @see https://github.com/abrahamjuliot/creepjs/tree/master/src/css
 */

import { fnv1a32 } from './audioFingerprint.js';

// System color keywords (CSS spec) - critical for OS/theme fingerprinting
const SYSTEM_COLORS = [
    'ActiveBorder', 'ActiveCaption', 'ActiveText', 'AppWorkspace',
    'Background', 'ButtonBorder', 'ButtonFace', 'ButtonHighlight',
    'ButtonShadow', 'ButtonText', 'Canvas', 'CanvasText',
    'CaptionText', 'Field', 'FieldText', 'GrayText',
    'Highlight', 'HighlightText', 'InactiveBorder',
    'InactiveCaption', 'InactiveCaptionText', 'InfoBackground',
    'InfoText', 'LinkText', 'Mark', 'MarkText',
    'Menu', 'MenuText', 'Scrollbar', 'ThreeDDarkShadow',
    'ThreeDFace', 'ThreeDHighlight', 'ThreeDLightShadow',
    'ThreeDShadow', 'VisitedText', 'Window', 'WindowFrame', 'WindowText'
];

// System font keywords (CSS spec) - reveals OS default fonts
const SYSTEM_FONTS = [
    'caption', 'icon', 'menu', 'message-box', 'small-caption', 'status-bar'
];

// Modern CSS features - critical for browser version/bot detection
const CSS_FEATURES = [
    'aspect-ratio',
    'backdrop-filter',
    'container-type',  // container queries
    'accent-color',
    'scrollbar-color',
    'scrollbar-width',
    'content-visibility',
    'contain-intrinsic-size',
    'overscroll-behavior',
    'scroll-behavior',
    'touch-action',
    'user-select',
    'text-wrap',
    'hanging-punctuation'
];

// CSS functions to test support
const CSS_FUNCTIONS = [
    { name: 'color-mix', test: 'background-color: color-mix(in srgb, red 50%, blue)' },
    { name: 'oklch', test: 'color: oklch(70% 0.15 200)' },
    { name: 'lch', test: 'color: lch(50% 50 200)' },
    { name: 'lab', test: 'color: lab(50% 50 50)' },
    { name: 'hwb', test: 'color: hwb(200 20% 20%)' },
    { name: 'clamp', test: 'width: clamp(10px, 50%, 100px)' },
    { name: 'min', test: 'width: min(10px, 50%)' },
    { name: 'max', test: 'width: max(10px, 50%)' },
    { name: 'env', test: 'padding: env(safe-area-inset-top, 0px)' }
];

// Media queries - reveals user preferences, device capabilities, and OS settings
// Note: Order matters for hierarchical groups - strongest/most specific first
const MEDIA_QUERIES = [
    // User preferences (OS settings)
    { query: '(prefers-color-scheme: dark)', name: 'colorSchemeDark', group: 'colorScheme' },
    { query: '(prefers-color-scheme: light)', name: 'colorSchemeLight', group: 'colorScheme' },
    { query: '(prefers-reduced-motion: reduce)', name: 'reducedMotion', group: 'motion' },
    { query: '(prefers-reduced-transparency: reduce)', name: 'reducedTransparency', group: 'transparency' },
    { query: '(prefers-contrast: more)', name: 'highContrast', group: 'contrast' },
    { query: '(prefers-contrast: less)', name: 'lowContrast', group: 'contrast' },
    { query: '(forced-colors: active)', name: 'forcedColors', group: 'forcedColors' },
    { query: '(inverted-colors: inverted)', name: 'invertedColors', group: 'invertedColors' },
    
    // Device capabilities
    { query: '(hover: hover)', name: 'hoverCapable', group: 'hover' },
    { query: '(hover: none)', name: 'hoverNone', group: 'hover' },
    { query: '(pointer: fine)', name: 'pointerFine', group: 'pointer' },
    { query: '(pointer: coarse)', name: 'pointerCoarse', group: 'pointer' },
    { query: '(pointer: none)', name: 'pointerNone', group: 'pointer' },
    { query: '(any-hover: hover)', name: 'anyHover', group: 'anyHover' },
    { query: '(any-pointer: fine)', name: 'anyPointerFine', group: 'anyPointer' },
    
    // Display modes
    { query: '(display-mode: standalone)', name: 'displayStandalone', group: 'displayMode' },
    { query: '(display-mode: fullscreen)', name: 'displayFullscreen', group: 'displayMode' },
    { query: '(display-mode: browser)', name: 'displayBrowser', group: 'displayMode' },
    
    // Screen characteristics
    { query: '(orientation: portrait)', name: 'orientationPortrait', group: 'orientation' },
    { query: '(orientation: landscape)', name: 'orientationLandscape', group: 'orientation' },
    // Color gamut: strongest first (rec2020 > p3 > srgb) - first match wins
    { query: '(color-gamut: rec2020)', name: 'colorGamutRec2020', group: 'colorGamut', priority: 1 },
    { query: '(color-gamut: p3)', name: 'colorGamutP3', group: 'colorGamut', priority: 2 },
    { query: '(color-gamut: srgb)', name: 'colorGamutSrgb', group: 'colorGamut', priority: 3 },
    { query: '(dynamic-range: high)', name: 'hdrDisplay', group: 'dynamicRange' },
    
    // Scripting
    { query: '(scripting: enabled)', name: 'scriptingEnabled', group: 'scripting' },
    
    // Update frequency: strongest first (fast > slow > none)
    { query: '(update: fast)', name: 'updateFast', group: 'update', priority: 1 },
    { query: '(update: slow)', name: 'updateSlow', group: 'update', priority: 2 },
    { query: '(update: none)', name: 'updateNone', group: 'update', priority: 3 }
];

// Groups where first match wins (hierarchical - strongest listed first in MEDIA_QUERIES)
const FIRST_MATCH_GROUPS = new Set(['colorGamut', 'update']);

// Blink-specific rendering quirks - critical for engine detection
const BLINK_QUIRKS = [
    'text-size-adjust',
    '-webkit-tap-highlight-color',
    '-webkit-text-stroke-width',
    '-webkit-font-smoothing',  // Critical for macOS detection
    'zoom',
    'user-select',
    'touch-action',
    'overscroll-behavior'
];

// OS/Browser-specific computed properties - reveals OS defaults and Chrome version
// These return ACTUAL VALUES (not just support) that differ between systems
const OS_BROWSER_COMPUTED_PROPS = [
    // Locale - CRITICAL: reveals system locale string
    '-webkit-locale',
    
    // Color scheme / accent - OS theme detection
    'color-scheme',
    'accent-color',
    'caret-color',
    'outline-color',
    
    // Windows-specific
    'forced-color-adjust',
    
    // Print/rendering
    '-webkit-print-color-adjust',
    'print-color-adjust',
    '-webkit-rtl-ordering',
    
    // Text rendering - differs macOS vs Windows
    '-webkit-text-fill-color',
    '-webkit-text-stroke-color',
    'text-rendering',
    
    // Form styling - OS-dependent defaults
    'appearance',
    '-webkit-appearance',
    
    // Scrollbar (computed values, not just support)
    'scrollbar-gutter',
    'scrollbar-color',
    'scrollbar-width',
    
    // Animation defaults
    'animation-timeline',
    
    // View transition (Chrome 111+)
    'view-transition-name',
    
    // Modern Chrome properties (version detection)
    'text-wrap',
    'white-space-collapse',
    'hyphenate-limit-chars'
];

/**
 * Get system styles (colors and fonts) - reveals OS theme and default fonts
 */
function getSystemStyles(element) {
    const originalStyle = element.getAttribute('style');
    
    try {
        const colors = {};
        const fonts = {};

        // Test system colors - each maps to OS theme colors
        for (const color of SYSTEM_COLORS) {
            try {
                element.style.cssText = `background-color: ${color} !important`;
                const computedColor = getComputedStyle(element).backgroundColor;
                colors[color] = computedColor;
            } catch (e) {
                colors[color] = 'error';
            }
        }

        // Test system fonts - reveals OS default font stack
        for (const font of SYSTEM_FONTS) {
            try {
                element.style.cssText = `font: ${font} !important`;
                const cs = getComputedStyle(element);
                fonts[font] = {
                    family: cs.fontFamily,
                    size: cs.fontSize,
                    weight: cs.fontWeight,
                    style: cs.fontStyle
                };
            } catch (e) {
                fonts[font] = { error: true };
            }
        }

        return { colors, fonts };
    } catch (error) {
        return { colors: {}, fonts: {}, error: error.message };
    } finally {
        if (originalStyle) {
            element.setAttribute('style', originalStyle);
        } else {
            element.removeAttribute('style');
        }
    }
}

/**
 * Test CSS property support using CSS.supports()
 */
function testCssFeatures() {
    const supported = [];
    const unsupported = [];
    const details = {};
    
    try {
        if (!CSS || !CSS.supports) {
            return {
                supported: [],
                unsupported: CSS_FEATURES,
                details: {},
                hasRegisterProperty: false,
                error: 'CSS.supports not available'
            };
        }
        
        // Test CSS properties
        for (const feature of CSS_FEATURES) {
            const isSupported = CSS.supports(feature, 'auto') || 
                               CSS.supports(feature, 'initial') ||
                               CSS.supports(feature, 'normal');
            details[feature] = isSupported;
            if (isSupported) {
                supported.push(feature);
            } else {
                unsupported.push(feature);
            }
        }
        
        // Test CSS functions
        for (const func of CSS_FUNCTIONS) {
            try {
                const [prop, val] = func.test.split(':').map(s => s.trim());
                const isSupported = CSS.supports(prop, val);
                details[`fn:${func.name}`] = isSupported;
                if (isSupported) {
                    supported.push(`fn:${func.name}`);
                } else {
                    unsupported.push(`fn:${func.name}`);
                }
            } catch (e) {
                details[`fn:${func.name}`] = false;
                unsupported.push(`fn:${func.name}`);
            }
        }
        
        // Check @property support (CSS Houdini)
        const hasRegisterProperty = 'registerProperty' in CSS;
        details['@property'] = hasRegisterProperty;
        if (hasRegisterProperty) {
            supported.push('@property');
        } else {
            unsupported.push('@property');
        }
        
        return {
            supported,
            unsupported,
            details,
            hasRegisterProperty
        };
    } catch (error) {
        return {
            supported: [],
            unsupported: CSS_FEATURES,
            details: {},
            hasRegisterProperty: false,
            error: error.message
        };
    }
}

/**
 * Test media queries - reveals user preferences and device capabilities
 * Uses "first match wins" for hierarchical groups (colorGamut, update)
 */
function testMediaQueries() {
    const results = {};
    const matches = [];
    const noMatches = [];
    const activeValues = {};  // Which value is active per group
    
    try {
        for (const { query, name, group } of MEDIA_QUERIES) {
            try {
                const mq = window.matchMedia(query);
                results[name] = mq.matches;
                if (mq.matches) {
                    matches.push(name);
                    // For hierarchical groups (colorGamut, update): first match wins
                    // For other groups: last match wins (normal behavior)
                    if (FIRST_MATCH_GROUPS.has(group)) {
                        if (!activeValues[group]) {
                            activeValues[group] = name;  // Only set if not already set
                        }
                    } else {
                        activeValues[group] = name;  // Last match wins
                    }
                } else {
                    noMatches.push(name);
                }
            } catch (e) {
                results[name] = 'error';
            }
        }
        
        return {
            details: results,
            matches,
            noMatches,
            activeValues  // e.g., { colorScheme: 'colorSchemeDark', colorGamut: 'colorGamutP3' }
        };
    } catch (error) {
        return {
            details: {},
            matches: [],
            noMatches: [],
            activeValues: {},
            error: error.message
        };
    }
}

/**
 * Test Blink-specific quirks - engine detection
 */
function testBlinkQuirks() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;';
    document.body.appendChild(probe);
    
    const quirks = {};
    try {
        const computed = getComputedStyle(probe);
        for (const prop of BLINK_QUIRKS) {
            try {
                quirks[prop] = computed.getPropertyValue(prop) || 'not-set';
            } catch (e) {
                quirks[prop] = 'error';
            }
        }
    } finally {
        probe.remove();
    }
    
    return quirks;
}

/**
 * Get OS/Browser-specific computed style values
 * These default values differ between OS (Windows/macOS/Linux) and Chrome versions
 */
function getOsBrowserComputedStyles() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;';
    document.body.appendChild(probe);
    
    const values = {};
    const computed = getComputedStyle(probe);
    
    try {
        // Get total CSS property count - differs between Chrome versions!
        values._propertyCount = computed.length;
        
        // Capture each OS/browser-specific property
        for (const prop of OS_BROWSER_COMPUTED_PROPS) {
            try {
                const val = computed.getPropertyValue(prop);
                // Only store if has meaningful value
                if (val && val !== '' && val !== 'none' && val !== 'auto') {
                    values[prop] = val;
                } else {
                    values[prop] = val || 'empty';
                }
            } catch (e) {
                values[prop] = 'error';
            }
        }
        
        // Special: Get computed font-family on body (OS default)
        const bodyComputed = getComputedStyle(document.body);
        values._bodyFontFamily = bodyComputed.fontFamily;
        values._bodyFontSize = bodyComputed.fontSize;
        values._bodyLineHeight = bodyComputed.lineHeight;
        
        // Special: Default link color (varies by OS/theme)
        const link = document.createElement('a');
        link.href = '#';
        probe.appendChild(link);
        const linkComputed = getComputedStyle(link);
        values._linkColor = linkComputed.color;
        values._linkTextDecoration = linkComputed.textDecorationColor;
        
        // Special: Input element defaults (OS-specific)
        const input = document.createElement('input');
        input.type = 'text';
        probe.appendChild(input);
        const inputComputed = getComputedStyle(input);
        values._inputFontFamily = inputComputed.fontFamily;
        values._inputFontSize = inputComputed.fontSize;
        values._inputBorderColor = inputComputed.borderColor;
        values._inputBackgroundColor = inputComputed.backgroundColor;
        values._inputOutlineColor = inputComputed.outlineColor;
        
        // Special: Button defaults
        const button = document.createElement('button');
        probe.appendChild(button);
        const buttonComputed = getComputedStyle(button);
        values._buttonFontFamily = buttonComputed.fontFamily;
        values._buttonAppearance = buttonComputed.appearance || buttonComputed.webkitAppearance;
        values._buttonBorderRadius = buttonComputed.borderRadius;
        
        // Special: Select element (highly OS-specific)
        const select = document.createElement('select');
        probe.appendChild(select);
        const selectComputed = getComputedStyle(select);
        values._selectAppearance = selectComputed.appearance || selectComputed.webkitAppearance;
        values._selectFontFamily = selectComputed.fontFamily;
        
    } catch (e) {
        values._error = e.message;
    } finally {
        probe.remove();
    }
    
    return values;
}

/**
 * Test CSS variable edge cases - bots often fail these
 */
function testCssVariables() {
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const tests = {};
    
    try {
        // Test 1: Basic variable resolution
        probe.style.cssText = '--test-var: 42px; width: var(--test-var);';
        tests.basicResolution = getComputedStyle(probe).width === '42px';
        
        // Test 2: Fallback values
        probe.style.cssText = 'width: var(--undefined-var, 100px);';
        tests.fallbackWorks = getComputedStyle(probe).width === '100px';
        
        // Test 3: Nested variables
        probe.style.cssText = '--a: 10px; --b: var(--a); width: var(--b);';
        tests.nestedResolution = getComputedStyle(probe).width === '10px';
        
        // Test 4: calc() with variables
        probe.style.cssText = '--size: 50px; width: calc(var(--size) * 2);';
        tests.calcWithVars = getComputedStyle(probe).width === '100px';
        
    } catch (e) {
        tests.error = e.message;
    } finally {
        probe.remove();
    }
    
    return tests;
}

/**
 * Detect automation via getComputedStyle inconsistencies and prototype checks
 */
function detectComputedStyleLies() {
    const probe = document.createElement('div');
    probe.style.cssText = 'width:123.456px;height:78.901px;opacity:0.5;';
    document.body.appendChild(probe);
    
    const lies = [];
    const checks = {};
    
    try {
        const computed = getComputedStyle(probe);
        
        // Getter consistency checks
        checks.widthConsistent = computed.width === computed.getPropertyValue('width');
        if (!checks.widthConsistent) lies.push('width-getter-mismatch');
        
        checks.heightConsistent = computed.height === computed.getPropertyValue('height');
        if (!checks.heightConsistent) lies.push('height-getter-mismatch');
        
        // cssText check
        checks.cssTextLength = computed.cssText?.length || 0;
        if (checks.cssTextLength === 0) lies.push('empty-cssText');
        
        // Length property check
        checks.hasLength = 'length' in computed;
        if (!checks.hasLength) lies.push('missing-length-property');
        
        // Prototype chain check - critical for detecting spoofed objects
        const proto = Object.getPrototypeOf(computed);
        checks.protoName = proto?.constructor?.name || 'unknown';
        if (checks.protoName !== 'CSSStyleDeclaration') {
            lies.push('invalid-prototype');
        }
        
        // Check if toString is native
        checks.toStringNative = computed.toString.toString().includes('[native code]');
        
    } finally {
        probe.remove();
    }
    
    return {
        hasLies: lies.length > 0,
        lies,
        checks
    };
}

class CssComputedStyleDetector {
    constructor() {
        this.metrics = {};
        this.result = null;
    }

    analyze() {
        const result = this.collect();
        this.result = result;
        this.metrics = this._formatMetrics(result);
        return this.metrics;
    }

    collect() {
        if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
            return {
                supported: false,
                systemStyles: null,
                systemStylesHash: fnv1a32('unsupported'),
                cssFeatures: null,
                cssFeaturesHash: fnv1a32('unsupported'),
                mediaQueries: null,
                mediaQueriesHash: fnv1a32('unsupported'),
                error: 'getComputedStyle-unsupported'
            };
        }

        // Create probe element for system styles detection
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';

        try {
            document.body.appendChild(probe);
        } catch (error) {
            return {
                supported: false,
                systemStyles: null,
                systemStylesHash: fnv1a32('error'),
                cssFeatures: null,
                cssFeaturesHash: fnv1a32('error'),
                mediaQueries: null,
                mediaQueriesHash: fnv1a32('error'),
                error: error.message || 'probe-append-error'
            };
        }

        // 1. Collect system styles (colors + fonts) - reveals OS theme
        const systemStyles = getSystemStyles(probe);
        const systemStylesHash = systemStyles && !systemStyles.error 
            ? fnv1a32(JSON.stringify(systemStyles))
            : fnv1a32('system-styles-error');

        // 2. Test CSS features support - reveals browser version/capabilities
        const cssFeatures = testCssFeatures();
        const cssFeaturesHash = fnv1a32(JSON.stringify(cssFeatures.details));

        // 3. Test media queries - reveals user preferences and device
        const mediaQueries = testMediaQueries();
        const mediaQueriesHash = fnv1a32(JSON.stringify(mediaQueries.details));

        // 4. Test Blink quirks - engine detection
        const blinkQuirks = testBlinkQuirks();
        const blinkQuirksHash = fnv1a32(JSON.stringify(blinkQuirks));

        // 5. Test CSS variable edge cases - bot detection
        const cssVariables = testCssVariables();

        // 6. Detect computed style lies - automation detection
        const computedStyleLies = detectComputedStyleLies();

        // 7. Get OS/Browser-specific computed values - OS & Chrome version detection
        const osBrowserStyles = getOsBrowserComputedStyles();
        const osBrowserStylesHash = fnv1a32(JSON.stringify(osBrowserStyles));

        // Cleanup
        if (probe.parentNode) {
            probe.parentNode.removeChild(probe);
        }

        return {
            supported: true,
            systemStyles,
            systemStylesHash,
            cssFeatures,
            cssFeaturesHash,
            mediaQueries,
            mediaQueriesHash,
            blinkQuirks,
            blinkQuirksHash,
            cssVariables,
            computedStyleLies,
            osBrowserStyles,
            osBrowserStylesHash,
            error: null
        };
    }

    _formatMetrics(result) {
        const metrics = {};
        
        // === SYSTEM STYLES (OS Theme Fingerprinting) ===
        metrics.cssSystemStylesHash = {
            value: result.systemStylesHash,
            description: 'FNV-1a hash of system colors and fonts - unique per OS theme',
            risk: 'N/A'
        };
        
        // Expose individual system colors for research
        if (result.systemStyles && result.systemStyles.colors) {
            const colors = result.systemStyles.colors;
            
            // Key system colors that differ between OS/themes
            const keyColors = ['Canvas', 'CanvasText', 'ButtonFace', 'ButtonText', 'Highlight', 'HighlightText', 'Field', 'FieldText'];
            for (const colorName of keyColors) {
                if (colors[colorName]) {
                    metrics[`cssSystemColor_${colorName}`] = {
                        value: colors[colorName],
                        description: `System color: ${colorName} - OS theme dependent`,
                        risk: 'N/A'
                    };
                }
            }
            
            // Full color signature for deep comparison
            metrics.cssSystemColorsSignature = {
                value: Object.entries(colors).map(([k, v]) => `${k}:${v}`).join('|'),
                description: 'Full system colors signature',
                risk: 'N/A'
            };
        }
        
        // Expose system fonts for research
        if (result.systemStyles && result.systemStyles.fonts) {
            const fonts = result.systemStyles.fonts;
            
            for (const [fontName, fontData] of Object.entries(fonts)) {
                if (fontData && !fontData.error) {
                    metrics[`cssSystemFont_${fontName}`] = {
                        value: `${fontData.family} | ${fontData.size} | ${fontData.weight}`,
                        description: `System font: ${fontName} - reveals OS default fonts`,
                        risk: 'N/A'
                    };
                }
            }
        }

        // === CSS FEATURES (Browser Version Detection) ===
        metrics.cssFeaturesHash = {
            value: result.cssFeaturesHash || fnv1a32('none'),
            description: 'Hash of CSS feature support - reveals browser version',
            risk: 'N/A'
        };
        
        if (result.cssFeatures) {
            metrics.cssFeaturesSupported = {
                value: result.cssFeatures.supported.join(', ') || 'none',
                description: 'CSS features/functions supported by this browser',
                risk: 'N/A'
            };
            
            metrics.cssFeaturesUnsupported = {
                value: result.cssFeatures.unsupported.join(', ') || 'none',
                description: 'CSS features/functions NOT supported - useful for version detection',
                risk: 'N/A'
            };
            
            metrics.cssFeaturesCount = {
                value: `${result.cssFeatures.supported.length}/${result.cssFeatures.supported.length + result.cssFeatures.unsupported.length}`,
                description: 'Supported/total CSS features ratio',
                risk: 'N/A'
            };
            
            metrics.cssHasRegisterProperty = {
                value: result.cssFeatures.hasRegisterProperty,
                description: 'CSS @property (Houdini) support - modern browser indicator',
                risk: 'N/A'
            };
            
            // Individual feature flags for detailed analysis
            if (result.cssFeatures.details) {
                for (const [feature, supported] of Object.entries(result.cssFeatures.details)) {
                    metrics[`cssFeature_${feature.replace(/[^a-zA-Z0-9]/g, '_')}`] = {
                        value: supported,
                        description: `CSS feature: ${feature}`,
                        risk: 'N/A'
                    };
                }
            }
        }

        // === MEDIA QUERIES (User Preferences & Device) ===
        metrics.cssMediaQueriesHash = {
            value: result.mediaQueriesHash || fnv1a32('none'),
            description: 'Hash of media query states - reveals user preferences',
            risk: 'N/A'
        };
        
        if (result.mediaQueries) {
            metrics.cssMediaQueriesMatched = {
                value: result.mediaQueries.matches.join(', ') || 'none',
                description: 'Media queries that matched - active user preferences',
                risk: 'N/A'
            };
            
            // Individual media query results for research
            if (result.mediaQueries.details) {
                // Group by category for clarity
                const userPrefs = ['colorSchemeDark', 'colorSchemeLight', 'reducedMotion', 'reducedTransparency', 'highContrast', 'lowContrast', 'forcedColors', 'invertedColors'];
                const deviceCaps = ['hoverCapable', 'hoverNone', 'pointerFine', 'pointerCoarse', 'pointerNone', 'anyHover', 'anyPointerFine'];
                const display = ['displayStandalone', 'displayFullscreen', 'displayBrowser', 'orientationPortrait', 'orientationLandscape'];
                const colorCaps = ['colorGamutSrgb', 'colorGamutP3', 'colorGamutRec2020', 'hdrDisplay'];
                
                // User preferences (high value for fingerprinting)
                for (const mq of userPrefs) {
                    if (result.mediaQueries.details[mq] !== undefined) {
                        metrics[`cssMQ_${mq}`] = {
                            value: result.mediaQueries.details[mq],
                            description: `Media query: ${mq}`,
                            risk: 'N/A'
                        };
                    }
                }
                
                // Device capabilities
                for (const mq of deviceCaps) {
                    if (result.mediaQueries.details[mq] !== undefined) {
                        metrics[`cssMQ_${mq}`] = {
                            value: result.mediaQueries.details[mq],
                            description: `Device capability: ${mq}`,
                            risk: 'N/A'
                        };
                    }
                }
                
                // Display characteristics
                for (const mq of display) {
                    if (result.mediaQueries.details[mq] !== undefined) {
                        metrics[`cssMQ_${mq}`] = {
                            value: result.mediaQueries.details[mq],
                            description: `Display mode: ${mq}`,
                            risk: 'N/A'
                        };
                    }
                }
                
                // Color capabilities
                for (const mq of colorCaps) {
                    if (result.mediaQueries.details[mq] !== undefined) {
                        metrics[`cssMQ_${mq}`] = {
                            value: result.mediaQueries.details[mq],
                            description: `Color capability: ${mq}`,
                            risk: 'N/A'
                        };
                    }
                }
            }
            
            // Active values per group - shows which preference is currently active
            if (result.mediaQueries.activeValues) {
                metrics.cssMQ_activeValues = {
                    value: JSON.stringify(result.mediaQueries.activeValues),
                    description: 'Active media query values per category',
                    risk: 'N/A'
                };
            }
        }

        // === BLINK QUIRKS (Engine Detection) ===
        if (result.blinkQuirks) {
            metrics.cssBlinkQuirksHash = {
                value: result.blinkQuirksHash || fnv1a32('none'),
                description: 'Hash of Blink-specific rendering quirks',
                risk: 'N/A'
            };
            
            // Key quirks for research
            for (const [prop, value] of Object.entries(result.blinkQuirks)) {
                metrics[`cssQuirk_${prop.replace(/[^a-zA-Z0-9]/g, '_')}`] = {
                    value: value,
                    description: `Blink quirk: ${prop}`,
                    risk: 'N/A'
                };
            }
        }

        // === CSS VARIABLES (Bot Detection) ===
        if (result.cssVariables) {
            const varTests = result.cssVariables;
            const allPassed = varTests.basicResolution && varTests.fallbackWorks && 
                             varTests.nestedResolution && varTests.calcWithVars;
            
            metrics.cssVariablesAllPass = {
                value: allPassed,
                description: 'All CSS variable edge case tests passed',
                risk: allPassed ? 'N/A' : 'HIGH'
            };
            
            metrics.cssVar_basicResolution = {
                value: varTests.basicResolution,
                description: 'Basic CSS variable resolution works',
                risk: varTests.basicResolution ? 'N/A' : 'HIGH'
            };
            
            metrics.cssVar_fallbackWorks = {
                value: varTests.fallbackWorks,
                description: 'CSS variable fallback values work',
                risk: varTests.fallbackWorks ? 'N/A' : 'MEDIUM'
            };
            
            metrics.cssVar_nestedResolution = {
                value: varTests.nestedResolution,
                description: 'Nested CSS variables resolve correctly',
                risk: varTests.nestedResolution ? 'N/A' : 'HIGH'
            };
            
            metrics.cssVar_calcWithVars = {
                value: varTests.calcWithVars,
                description: 'calc() with CSS variables works',
                risk: varTests.calcWithVars ? 'N/A' : 'MEDIUM'
            };
        }

        // === COMPUTED STYLE LIES (Automation Detection) ===
        if (result.computedStyleLies) {
            metrics.cssComputedStyleHasLies = {
                value: result.computedStyleLies.hasLies,
                description: 'Detected getComputedStyle inconsistencies (automation signal)',
                risk: result.computedStyleLies.hasLies ? 'CRITICAL' : 'N/A'
            };
            
            if (result.computedStyleLies.lies.length > 0) {
                metrics.cssComputedStyleLies = {
                    value: result.computedStyleLies.lies.join(', '),
                    description: 'Specific lies detected in getComputedStyle',
                    risk: 'CRITICAL'
                };
            }
            
            // Prototype check - critical for detecting spoofed objects
            metrics.cssProtoName = {
                value: result.computedStyleLies.checks.protoName,
                description: 'CSSStyleDeclaration prototype constructor name',
                risk: result.computedStyleLies.checks.protoName !== 'CSSStyleDeclaration' ? 'CRITICAL' : 'N/A'
            };
            
            metrics.cssToStringNative = {
                value: result.computedStyleLies.checks.toStringNative,
                description: 'CSSStyleDeclaration.toString is native',
                risk: result.computedStyleLies.checks.toStringNative ? 'N/A' : 'HIGH'
            };
        }
        
        // === OS/BROWSER COMPUTED STYLES (OS & Chrome Version Detection) ===
        if (result.osBrowserStyles) {
            const obs = result.osBrowserStyles;
            
            metrics.cssOsBrowserStylesHash = {
                value: result.osBrowserStylesHash || fnv1a32('none'),
                description: 'Hash of OS/browser-specific computed values',
                risk: 'N/A'
            };
            
            // Property count - differs between Chrome versions!
            if (obs._propertyCount) {
                metrics.cssPropCount = {
                    value: obs._propertyCount,
                    description: 'Total CSS properties count - Chrome version indicator',
                    risk: 'N/A'
                };
            }
            
            // Locale - CRITICAL for OS/region detection
            if (obs['-webkit-locale']) {
                metrics.cssWebkitLocale = {
                    value: obs['-webkit-locale'],
                    description: 'System locale from -webkit-locale - OS region indicator',
                    risk: 'N/A'
                };
            }
            
            // Color scheme
            if (obs['color-scheme']) {
                metrics.cssColorSchemeValue = {
                    value: obs['color-scheme'],
                    description: 'Computed color-scheme value',
                    risk: 'N/A'
                };
            }
            
            // Accent color (OS theme color)
            if (obs['accent-color'] && obs['accent-color'] !== 'auto') {
                metrics.cssAccentColorValue = {
                    value: obs['accent-color'],
                    description: 'OS accent color - system theme detection',
                    risk: 'N/A'
                };
            }
            
            // Caret/cursor color
            if (obs['caret-color']) {
                metrics.cssCaretColor = {
                    value: obs['caret-color'],
                    description: 'Default caret color - OS theme dependent',
                    risk: 'N/A'
                };
            }
            
            // Windows High Contrast
            if (obs['forced-color-adjust']) {
                metrics.cssForcedColorAdjust = {
                    value: obs['forced-color-adjust'],
                    description: 'Forced color adjust - Windows High Contrast indicator',
                    risk: 'N/A'
                };
            }
            
            // Text rendering
            if (obs['text-rendering']) {
                metrics.cssTextRendering = {
                    value: obs['text-rendering'],
                    description: 'Text rendering mode - OS font rendering',
                    risk: 'N/A'
                };
            }
            
            // RTL ordering
            if (obs['-webkit-rtl-ordering']) {
                metrics.cssRtlOrdering = {
                    value: obs['-webkit-rtl-ordering'],
                    description: 'RTL ordering - locale/language indicator',
                    risk: 'N/A'
                };
            }
            
            // Body font (OS default)
            if (obs._bodyFontFamily) {
                metrics.cssBodyFontFamily = {
                    value: obs._bodyFontFamily,
                    description: 'Body default font family - OS font stack',
                    risk: 'N/A'
                };
            }
            
            // Link color (theme-dependent)
            if (obs._linkColor) {
                metrics.cssDefaultLinkColor = {
                    value: obs._linkColor,
                    description: 'Default unvisited link color - theme dependent',
                    risk: 'N/A'
                };
            }
            
            // Input element defaults (highly OS-specific)
            if (obs._inputFontFamily) {
                metrics.cssInputFontFamily = {
                    value: obs._inputFontFamily,
                    description: 'Input element default font - OS form controls',
                    risk: 'N/A'
                };
            }
            
            if (obs._inputBorderColor) {
                metrics.cssInputBorderColor = {
                    value: obs._inputBorderColor,
                    description: 'Input border color - OS form styling',
                    risk: 'N/A'
                };
            }
            
            if (obs._inputBackgroundColor) {
                metrics.cssInputBgColor = {
                    value: obs._inputBackgroundColor,
                    description: 'Input background color - OS form styling',
                    risk: 'N/A'
                };
            }
            
            // Button appearance
            if (obs._buttonAppearance) {
                metrics.cssButtonAppearance = {
                    value: obs._buttonAppearance,
                    description: 'Button appearance - OS native controls',
                    risk: 'N/A'
                };
            }
            
            if (obs._buttonFontFamily) {
                metrics.cssButtonFontFamily = {
                    value: obs._buttonFontFamily,
                    description: 'Button font family - OS form controls',
                    risk: 'N/A'
                };
            }
            
            // Select element (very OS-specific rendering)
            if (obs._selectAppearance) {
                metrics.cssSelectAppearance = {
                    value: obs._selectAppearance,
                    description: 'Select element appearance - OS dropdown styling',
                    risk: 'N/A'
                };
            }
            
            if (obs._selectFontFamily) {
                metrics.cssSelectFontFamily = {
                    value: obs._selectFontFamily,
                    description: 'Select font family - OS form controls',
                    risk: 'N/A'
                };
            }
            
            // Scrollbar styling
            if (obs['scrollbar-width'] && obs['scrollbar-width'] !== 'auto') {
                metrics.cssScrollbarWidth = {
                    value: obs['scrollbar-width'],
                    description: 'Scrollbar width value - OS scrollbar style',
                    risk: 'N/A'
                };
            }
            
            if (obs['scrollbar-color'] && obs['scrollbar-color'] !== 'auto') {
                metrics.cssScrollbarColor = {
                    value: obs['scrollbar-color'],
                    description: 'Scrollbar color value - OS scrollbar colors',
                    risk: 'N/A'
                };
            }
            
            // Modern Chrome version indicators
            if (obs['text-wrap']) {
                metrics.cssTextWrapValue = {
                    value: obs['text-wrap'],
                    description: 'text-wrap computed value - Chrome version indicator',
                    risk: 'N/A'
                };
            }
            
            if (obs['white-space-collapse']) {
                metrics.cssWhiteSpaceCollapse = {
                    value: obs['white-space-collapse'],
                    description: 'white-space-collapse value - Chrome 114+ indicator',
                    risk: 'N/A'
                };
            }
        }

        // === ERROR REPORTING ===
        if (result.error) {
            metrics.cssDetectorError = {
                value: result.error,
                description: 'CSS detector error (if any)',
                risk: 'MEDIUM'
            };
        }

        return metrics;
    }
}

export { CssComputedStyleDetector };
