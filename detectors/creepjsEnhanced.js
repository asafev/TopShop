/**
 * CreepJS Enhanced Fingerprint Detector
 * 
 * Integrates stable fingerprinting techniques from CreepJS that remain consistent
 * across stealth environments. This plugin provides:
 * 
 * 1. Math Fingerprinting - Engine-specific floating point precision detection
 * 2. DOMRect Fingerprinting - Element/Range bounding rect analysis with emoji system detection
 * 3. CSS Media Fingerprinting - Media query-based device/preference detection
 * 4. Intl Fingerprinting - Internationalization API locale/format detection
 * 
 * Based on CreepJS by AbrahamJuliot
 * @see https://github.com/AbrahamJuliot/creepjs
 * 
 * @module detectors/creepjsEnhanced
 */

// ============================================================
// UTILITY FUNCTIONS (from CreepJS utils)
// ============================================================

/**
 * Simple FNV-1a hash for fingerprint generation
 * @param {string} str - String to hash
 * @returns {string} 8-character hex hash
 */
function hashMini(x) {
    if (!x) return 'undefined';
    const str = JSON.stringify(x);
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return ('0000000' + (hash >>> 0).toString(16)).slice(-8);
}

/**
 * Safe attempt to execute a function
 * @param {Function} fn - Function to execute
 * @param {*} defaultValue - Default value on error
 * @returns {*} Result or default value
 */
function attempt(fn, defaultValue = undefined) {
    try {
        return fn();
    } catch (e) {
        return defaultValue;
    }
}

/**
 * Check if feature is available and execute
 * @param {Function} fn - Function to execute
 * @returns {*} Result or undefined
 */
function caniuse(fn) {
    try {
        return fn();
    } catch (e) {
        return undefined;
    }
}

/**
 * Detect browser engine
 */
const IS_BLINK = (() => {
    try {
        return (
            'chrome' in window ||
            /Chrome/.test(navigator.userAgent) ||
            CSS.supports('accent-color', 'red')
        );
    } catch (e) {
        return false;
    }
})();

const IS_GECKO = (() => {
    try {
        return (
            'MozAppearance' in (document.documentElement?.style || {}) ||
            /Firefox/.test(navigator.userAgent)
        );
    } catch (e) {
        return false;
    }
})();

const IS_WEBKIT = (() => {
    try {
        return (
            !IS_BLINK &&
            'WebkitAppearance' in (document.documentElement?.style || {}) &&
            /Safari/.test(navigator.userAgent)
        );
    } catch (e) {
        return false;
    }
})();

/**
 * CSS font family for emoji rendering tests
 */
const CSS_FONT_FAMILY = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'`;

/**
 * Emoji set for DOMRect fingerprinting
 * These emojis have varying rendering dimensions across systems
 */
const EMOJIS = [
    '🌐', '🌑', '🌒', '🌓', '🌔', '🌕',
    '🌖', '🌗', '🌘', '🌙', '🌚', '🌛',
    '🌜', '🌡', '🌤', '🌥', '🌦', '🌧',
    '🌨', '🌩', '🌪', '🌫', '🌬', '🔥',
    '⭐', '🌟', '💫', '✨', '☀️', '🌞',
];

// ============================================================
// MATH FINGERPRINT DETECTOR
// Based on CreepJS src/math/index.ts
// ============================================================

/**
 * Math Fingerprint Detector
 * Tests specific Math function outputs with known expected values per browser engine.
 * Floating-point implementations have subtle differences between engines.
 */
class MathFingerprintDetector {
    constructor() {
        this.result = null;
        this.metrics = {};
        this.lied = false;
        this.lies = [];
    }

    /**
     * Main analysis entry point
     * @returns {Promise<Object>} Formatted metrics
     */
    async analyze() {
        const startTime = performance.now();
        
        try {
            this.result = this._collectMathFingerprint();
            this.metrics = this._formatMetrics(this.result);
        } catch (error) {
            this.metrics = {
                error: {
                    value: error.message,
                    description: 'Math fingerprint detection error',
                    risk: 'N/A'
                }
            };
        }
        
        this.metrics._timing = {
            value: Math.round(performance.now() - startTime),
            description: 'Math detection duration (ms)',
            risk: 'N/A'
        };
        
        return this.metrics;
    }

    /**
     * Collect Math fingerprint - exact CreepJS implementation
     * @private
     */
    _collectMathFingerprint() {
        // Math functions to check for consistency (lie detection)
        const check = [
            'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'atan2',
            'cbrt', 'cos', 'cosh', 'expm1', 'exp', 'hypot', 'log',
            'log1p', 'log10', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'pow'
        ];

        let lied = false;
        const lieDetails = [];

        // Check for Math function lies (calling twice should return same result)
        check.forEach((prop) => {
            const test = (
                prop === 'cos' ? [1e308] :
                prop === 'acos' || prop === 'asin' || prop === 'atanh' ? [0.5] :
                prop === 'pow' || prop === 'atan2' ? [Math.PI, 2] :
                [Math.PI]
            );
            
            try {
                const res1 = Math[prop](...test);
                const res2 = Math[prop](...test);
                const matching = (isNaN(res1) && isNaN(res2)) ? true : res1 === res2;
                
                if (!matching) {
                    lied = true;
                    lieDetails.push({ prop, type: 'inconsistent-result' });
                }
            } catch (e) {
                // Function not available or blocked
            }
        });

        this.lied = lied;
        this.lies = lieDetails;

        // Test values for engine fingerprinting
        const n = 0.123;
        const bigN = 5.860847362277284e+38;

        // [functionName, args, label, chromeExpected, firefoxExpected, torExpected, safariExpected]
        const fns = [
            ['acos', [n], `acos(${n})`, 1.4474840516030247, NaN, NaN, 1.4474840516030245],
            ['acos', [Math.SQRT1_2], 'acos(Math.SQRT1_2)', 0.7853981633974483, NaN, NaN, NaN],
            ['acosh', [1e308], 'acosh(1e308)', 709.889355822726, NaN, NaN, NaN],
            ['acosh', [Math.PI], 'acosh(Math.PI)', 1.811526272460853, NaN, NaN, NaN],
            ['acosh', [Math.SQRT2], 'acosh(Math.SQRT2)', 0.881373587019543, NaN, NaN, 0.8813735870195432],
            ['asin', [n], `asin(${n})`, 0.12331227519187199, NaN, NaN, NaN],
            ['asinh', [1e300], 'asinh(1e308)', 691.4686750787736, NaN, NaN, NaN],
            ['asinh', [Math.PI], 'asinh(Math.PI)', 1.8622957433108482, NaN, NaN, NaN],
            ['atan', [2], 'atan(2)', 1.1071487177940904, NaN, NaN, 1.1071487177940906],
            ['atan', [Math.PI], 'atan(Math.PI)', 1.2626272556789115, NaN, NaN, NaN],
            ['atanh', [0.5], 'atanh(0.5)', 0.5493061443340548, NaN, NaN, 0.5493061443340549],
            ['atan2', [1e-310, 2], 'atan2(1e-310, 2)', 5e-311, NaN, NaN, NaN],
            ['atan2', [Math.PI, 2], 'atan2(Math.PI)', 1.0038848218538872, NaN, NaN, NaN],
            ['cbrt', [100], 'cbrt(100)', 4.641588833612779, NaN, NaN, NaN],
            ['cbrt', [Math.PI], 'cbrt(Math.PI)', 1.4645918875615231, NaN, NaN, 1.4645918875615234],
            ['cos', [n], `cos(${n})`, 0.9924450321351935, NaN, NaN, NaN],
            ['cos', [Math.PI], 'cos(Math.PI)', -1, NaN, NaN, NaN],
            ['cos', [bigN], `cos(${bigN})`, -0.10868049424995659, NaN, -0.9779661551196617, NaN],
            ['cos', [-1e308], 'cos(-1e308)', -0.8913089376870335, NaN, 0.99970162388838, NaN],
            ['cos', [13*Math.E], 'cos(13*Math.E)', -0.7108118501064331, -0.7108118501064332, NaN, NaN],
            ['cos', [57*Math.E], 'cos(57*Math.E)', -0.536911695749024, -0.5369116957490239, NaN, NaN],
            ['cos', [21*Math.LN2], 'cos(21*Math.LN2)', -0.4067775970251724, -0.40677759702517235, -0.6534063185820197, NaN],
            ['cos', [51*Math.LN2], 'cos(51*Math.LN2)', -0.7017203400855446, -0.7017203400855445, NaN, NaN],
            ['cos', [21*Math.LOG2E], 'cos(21*Math.LOG2E)', 0.4362848063618998, 0.43628480636189976, NaN, NaN],
            ['cos', [25*Math.SQRT2], 'cos(25*Math.SQRT2)', -0.6982689820462377, -0.6982689820462376, NaN, NaN],
            ['cos', [50*Math.SQRT1_2], 'cos(50*Math.SQRT1_2)', -0.6982689820462377, -0.6982689820462376, NaN, NaN],
            ['cos', [21*Math.SQRT1_2], 'cos(21*Math.SQRT1_2)', -0.6534063185820198, NaN, NaN, NaN],
            ['cos', [17*Math.LOG10E], 'cos(17*Math.LOG10E)', 0.4537557425982784, 0.45375574259827833, NaN, NaN],
            ['cos', [2*Math.LOG10E], 'cos(2*Math.LOG10E)', 0.6459044007438142, NaN, 0.6459044007438141, NaN],
            ['cosh', [1], 'cosh(1)', 1.5430806348152437, NaN, NaN, NaN],
            ['cosh', [Math.PI], 'cosh(Math.PI)', 11.591953275521519, NaN, NaN, NaN],
            ['cosh', [492*Math.LOG2E], 'cosh(492*Math.LOG2E)', 9.199870313877772e+307, 9.199870313877774e+307, NaN, NaN],
            ['cosh', [502*Math.SQRT2], 'cosh(502*Math.SQRT2)', 1.0469199669023138e+308, 1.046919966902314e+308, NaN, NaN],
            ['expm1', [1], 'expm1(1)', 1.718281828459045, NaN, NaN, 1.7182818284590453],
            ['expm1', [Math.PI], 'expm1(Math.PI)', 22.140692632779267, NaN, NaN, NaN],
            ['exp', [n], `exp(${n})`, 1.1308844209474893, NaN, NaN, NaN],
            ['exp', [Math.PI], 'exp(Math.PI)', 23.140692632779267, NaN, NaN, NaN],
            ['hypot', [1, 2, 3, 4, 5, 6], 'hypot(1, 2, 3, 4, 5, 6)', 9.539392014169456, NaN, NaN, NaN],
            ['hypot', [bigN, bigN], `hypot(${bigN}, ${bigN})`, 8.288489826731116e+38, 8.288489826731114e+38, NaN, NaN],
            ['hypot', [2*Math.E, -100], 'hypot(2*Math.E, -100)', 100.14767208675259, 100.14767208675258, NaN, NaN],
            ['hypot', [6*Math.PI, -100], 'hypot(6*Math.PI, -100)', 101.76102278593319, 101.7610227859332, NaN, NaN],
            ['hypot', [2*Math.LN2, -100], 'hypot(2*Math.LN2, -100)', 100.0096085986525, 100.00960859865252, NaN, NaN],
            ['hypot', [Math.LOG2E, -100], 'hypot(Math.LOG2E, -100)', 100.01040630344929, 100.01040630344927, NaN, NaN],
            ['hypot', [Math.SQRT2, -100], 'hypot(Math.SQRT2, -100)', 100.00999950004999, 100.00999950005, NaN, NaN],
            ['hypot', [Math.SQRT1_2, -100], 'hypot(Math.SQRT1_2, -100)', 100.0024999687508, 100.00249996875078, NaN, NaN],
            ['hypot', [2*Math.LOG10E, -100], 'hypot(2*Math.LOG10E, -100)', 100.00377216279416, 100.00377216279418, NaN, NaN],
            ['log', [n], `log(${n})`, -2.0955709236097197, NaN, NaN, NaN],
            ['log', [Math.PI], 'log(Math.PI)', 1.1447298858494002, NaN, NaN, NaN],
            ['log1p', [n], `log1p(${n})`, 0.11600367575630613, NaN, NaN, NaN],
            ['log1p', [Math.PI], 'log1p(Math.PI)', 1.4210804127942926, NaN, NaN, NaN],
            ['log10', [n], `log10(${n})`, -0.9100948885606021, NaN, NaN, NaN],
            ['log10', [Math.PI], 'log10(Math.PI)', 0.4971498726941338, 0.49714987269413385, NaN, NaN],
            ['log10', [Math.E], 'log10(Math.E)', 0.4342944819032518, NaN, NaN, NaN],
            ['log10', [34*Math.E], 'log10(34*Math.E)', 1.9657733989455068, 1.965773398945507, NaN, NaN],
            ['log10', [Math.LN2], 'log10(Math.LN2)', -0.1591745389548616, NaN, NaN, NaN],
            ['log10', [11*Math.LN2], 'log10(11*Math.LN2)', 0.8822181462033634, 0.8822181462033635, NaN, NaN],
            ['log10', [Math.LOG2E], 'log10(Math.LOG2E)', 0.15917453895486158, NaN, NaN, NaN],
            ['log10', [43*Math.LOG2E], 'log10(43*Math.LOG2E)', 1.792642994534448, 1.7926429945344482, NaN, NaN],
            ['log10', [Math.LOG10E], 'log10(Math.LOG10E)', -0.36221568869946325, NaN, NaN, NaN],
            ['log10', [7*Math.LOG10E], 'log10(7*Math.LOG10E)', 0.4828823513147936, 0.48288235131479357, NaN, NaN],
            ['log10', [Math.SQRT1_2], 'log10(Math.SQRT1_2)', -0.15051499783199057, NaN, NaN, NaN],
            ['log10', [2*Math.SQRT1_2], 'log10(2*Math.SQRT1_2)', 0.1505149978319906, 0.15051499783199063, NaN, NaN],
            ['log10', [Math.SQRT2], 'log10(Math.SQRT2)', 0.1505149978319906, 0.15051499783199063, NaN, NaN],
            ['sin', [bigN], `sin(${bigN})`, 0.994076732536068, NaN, -0.20876350121720488, NaN],
            ['sin', [Math.PI], 'sin(Math.PI)', 1.2246467991473532e-16, NaN, 1.2246063538223773e-16, NaN],
            ['sin', [39*Math.E], 'sin(39*Math.E)', -0.7181630308570677, -0.7181630308570678, NaN, NaN],
            ['sin', [35*Math.LN2], 'sin(35*Math.LN2)', -0.7659964138980511, -0.765996413898051, NaN, NaN],
            ['sin', [110*Math.LOG2E], 'sin(110*Math.LOG2E)', 0.9989410140273756, 0.9989410140273757, NaN, NaN],
            ['sin', [7*Math.LOG10E], 'sin(7*Math.LOG10E)', 0.10135692924965616, 0.10135692924965614, NaN, NaN],
            ['sin', [35*Math.SQRT1_2], 'sin(35*Math.SQRT1_2)', -0.3746357547858202, -0.37463575478582023, NaN, NaN],
            ['sin', [21*Math.SQRT2], 'sin(21*Math.SQRT2)', -0.9892668187780498, -0.9892668187780497, NaN, NaN],
            ['sinh', [1], 'sinh(1)', 1.1752011936438014, NaN, NaN, NaN],
            ['sinh', [Math.PI], 'sinh(Math.PI)', 11.548739357257748, NaN, NaN, 11.548739357257746],
            ['sinh', [Math.E], 'sinh(Math.E)', 7.544137102816975, NaN, NaN, NaN],
            ['sinh', [Math.LN2], 'sinh(Math.LN2)', 0.75, NaN, NaN, NaN],
            ['sinh', [Math.LOG2E], 'sinh(Math.LOG2E)', 1.9978980091062795, NaN, NaN, NaN],
            ['sinh', [492*Math.LOG2E], 'sinh(492*Math.LOG2E)', 9.199870313877772e+307, 9.199870313877774e+307, NaN, NaN],
            ['sinh', [Math.LOG10E], 'sinh(Math.LOG10E)', 0.44807597941469024, NaN, NaN, NaN],
            ['sinh', [Math.SQRT1_2], 'sinh(Math.SQRT1_2)', 0.7675231451261164, NaN, NaN, NaN],
            ['sinh', [Math.SQRT2], 'sinh(Math.SQRT2)', 1.935066822174357, NaN, NaN, 1.9350668221743568],
            ['sinh', [502*Math.SQRT2], 'sinh(502*Math.SQRT2)', 1.0469199669023138e+308, 1.046919966902314e+308, NaN, NaN],
            ['sqrt', [n], `sqrt(${n})`, 0.3507135583350036, NaN, NaN, NaN],
            ['sqrt', [Math.PI], 'sqrt(Math.PI)', 1.7724538509055159, NaN, NaN, NaN],
            ['tan', [-1e308], 'tan(-1e308)', 0.5086861259107568, NaN, NaN, 0.5086861259107567],
            ['tan', [Math.PI], 'tan(Math.PI)', -1.2246467991473532e-16, NaN, NaN, NaN],
            ['tan', [6*Math.E], 'tan(6*Math.E)', 0.6866761546452431, 0.686676154645243, NaN, NaN],
            ['tan', [6*Math.LN2], 'tan(6*Math.LN2)', 1.6182817135715877, 1.618281713571588, NaN, 1.6182817135715875],
            ['tan', [10*Math.LOG2E], 'tan(10*Math.LOG2E)', -3.3537128705376014, -3.353712870537601, NaN, -3.353712870537602],
            ['tan', [17*Math.SQRT2], 'tan(17*Math.SQRT2)', -1.9222955461799982, -1.922295546179998, NaN, NaN],
            ['tan', [34*Math.SQRT1_2], 'tan(34*Math.SQRT1_2)', -1.9222955461799982, -1.922295546179998, NaN, NaN],
            ['tan', [10*Math.LOG10E], 'tan(10*Math.LOG10E)', 2.5824856130712432, 2.5824856130712437, NaN, NaN],
            ['tanh', [n], `tanh(${n})`, 0.12238344189440875, NaN, NaN, 0.12238344189440876],
            ['tanh', [Math.PI], 'tanh(Math.PI)', 0.99627207622075, NaN, NaN, NaN],
            ['pow', [n, -100], `pow(${n}, -100)`, 1.022089333584519e+91, 1.0220893335845176e+91, NaN, NaN],
            ['pow', [Math.PI, -100], 'pow(Math.PI, -100)', 1.9275814160560204e-50, 1.9275814160560185e-50, NaN, 1.9275814160560206e-50],
            ['pow', [Math.E, -100], 'pow(Math.E, -100)', 3.7200759760208555e-44, 3.720075976020851e-44, NaN, NaN],
            ['pow', [Math.LN2, -100], 'pow(Math.LN2, -100)', 8269017203802394, 8269017203802410, NaN, NaN],
            ['pow', [Math.LN10, -100], 'pow(Math.LN10, -100)', 6.003867926738829e-37, 6.003867926738811e-37, NaN, NaN],
            ['pow', [Math.LOG2E, -100], 'pow(Math.LOG2E, -100)', 1.20933355845501e-16, 1.2093335584550061e-16, NaN, NaN],
            ['pow', [Math.LOG10E, -100], 'pow(Math.LOG10E, -100)', 1.6655929347585958e+36, 1.665592934758592e+36, NaN, 1.6655929347585955e+36],
            ['pow', [Math.SQRT1_2, -100], 'pow(Math.SQRT1_2, -100)', 1125899906842616.2, 1125899906842611.5, NaN, NaN],
            ['pow', [Math.SQRT2, -100], 'pow(Math.SQRT2, -100)', 8.881784197001191e-16, 8.881784197001154e-16, NaN, NaN],
            // Polyfill test
            ['polyfill', [2e-3 ** -100], 'polyfill pow(2e-3, -100)', 7.888609052210102e+269, 7.888609052210126e+269, NaN, NaN],
        ];

        // Collect results and match against expected values
        const data = {};
        let chromeCount = 0;
        let firefoxCount = 0;
        let torCount = 0;
        let safariCount = 0;
        let totalTests = 0;

        fns.forEach((fn) => {
            const [funcName, args, label, chromeExpected, firefoxExpected, torExpected, safariExpected] = fn;
            
            data[label] = attempt(() => {
                const result = funcName !== 'polyfill' ? Math[funcName](...args) : args[0];
                const chrome = result === chromeExpected;
                const firefox = !isNaN(firefoxExpected) && result === firefoxExpected;
                const torBrowser = !isNaN(torExpected) && result === torExpected;
                const safari = !isNaN(safariExpected) && result === safariExpected;
                
                totalTests++;
                if (chrome) chromeCount++;
                if (firefox) firefoxCount++;
                if (torBrowser) torCount++;
                if (safari) safariCount++;
                
                return { result, chrome, firefox, torBrowser, safari };
            }, { result: NaN, chrome: false, firefox: false, torBrowser: false, safari: false });
        });

        // Determine detected engine
        const engineScores = {
            chrome: chromeCount / totalTests,
            firefox: firefoxCount / totalTests,
            tor: torCount / totalTests,
            safari: safariCount / totalTests
        };
        
        const detectedEngine = Object.entries(engineScores)
            .sort((a, b) => b[1] - a[1])[0];

        return {
            data,
            lied,
            lieDetails,
            engineScores,
            detectedEngine: detectedEngine[0],
            detectedEngineScore: detectedEngine[1],
            totalTests,
            hash: hashMini(data)
        };
    }

    /**
     * Format metrics for standard output
     * @private
     */
    _formatMetrics(result) {
        if (!result) return {};

        const { data, lied, engineScores, detectedEngine, detectedEngineScore, totalTests, hash, lieDetails } = result;

        return {
            mathHash: {
                value: hash,
                description: 'Math fingerprint hash (engine-specific floating point)',
                risk: 'Low'
            },
            mathDetectedEngine: {
                value: detectedEngine,
                description: 'Detected JavaScript engine from Math precision',
                risk: lied ? 'High' : 'Low'
            },
            mathEngineScore: {
                value: Math.round(detectedEngineScore * 100) + '%',
                description: `Match percentage for ${detectedEngine} engine`,
                risk: detectedEngineScore < 0.8 ? 'Medium' : 'Low'
            },
            mathChromeScore: {
                value: Math.round(engineScores.chrome * 100) + '%',
                description: 'Chrome/Chromium engine match',
                risk: 'N/A'
            },
            mathFirefoxScore: {
                value: Math.round(engineScores.firefox * 100) + '%',
                description: 'Firefox/Gecko engine match',
                risk: 'N/A'
            },
            mathSafariScore: {
                value: Math.round(engineScores.safari * 100) + '%',
                description: 'Safari/WebKit engine match',
                risk: 'N/A'
            },
            mathLied: {
                value: lied,
                description: 'Math functions returning inconsistent results (lie detected)',
                risk: lied ? 'Critical' : 'Low'
            },
            mathLieCount: {
                value: lieDetails?.length || 0,
                description: 'Number of Math function inconsistencies detected',
                risk: lieDetails?.length > 0 ? 'High' : 'Low'
            },
            mathTotalTests: {
                value: totalTests,
                description: 'Total Math precision tests performed',
                risk: 'N/A'
            }
        };
    }

    /**
     * Get raw result data
     */
    getResult() {
        return this.result;
    }
}

// ============================================================
// DOMRECT FINGERPRINT DETECTOR
// Based on CreepJS src/domrect/index.ts
// ============================================================

/**
 * DOMRect Fingerprint Detector
 * Uses Element.getClientRects() and getBoundingClientRect() for fingerprinting.
 * Also tests emoji rendering dimensions for system detection.
 */
class DOMRectFingerprintDetector {
    constructor() {
        this.result = null;
        this.metrics = {};
        this.lied = false;
        this.lies = [];
    }

    /**
     * Main analysis entry point
     * @returns {Promise<Object>} Formatted metrics
     */
    async analyze() {
        const startTime = performance.now();
        
        try {
            this.result = await this._collectDOMRectFingerprint();
            this.metrics = this._formatMetrics(this.result);
        } catch (error) {
            this.metrics = {
                error: {
                    value: error.message,
                    description: 'DOMRect fingerprint detection error',
                    risk: 'N/A'
                }
            };
        }
        
        this.metrics._timing = {
            value: Math.round(performance.now() - startTime),
            description: 'DOMRect detection duration (ms)',
            risk: 'N/A'
        };
        
        return this.metrics;
    }

    /**
     * Convert DOMRect to plain object
     * @private
     */
    _toNativeObject(domRect) {
        return {
            bottom: domRect.bottom,
            height: domRect.height,
            left: domRect.left,
            right: domRect.right,
            width: domRect.width,
            top: domRect.top,
            x: domRect.x,
            y: domRect.y
        };
    }

    /**
     * Get sum of rect values for comparison
     * @private
     */
    _getRectSum(rect) {
        return Object.keys(rect).reduce((acc, key) => acc + rect[key], 0) / 100_000_000;
    }

    /**
     * Collect DOMRect fingerprint - exact CreepJS implementation
     * @private
     */
    async _collectDOMRectFingerprint() {
        let lied = false;
        const lies = [];

        // Create test container
        const containerId = `domrect-test-${Date.now()}`;
        const container = document.createElement('div');
        container.setAttribute('id', containerId);
        container.style.cssText = 'position:absolute;left:-10000px;visibility:hidden;';
        
        // Build test HTML - exact CSS from CreepJS
        container.innerHTML = `
            <style>
            .rect-ghost, .rect-known {
                top: 0; left: 0; position: absolute; visibility: hidden;
            }
            .rect-known { width: 100px; height: 100px; transform: rotate(45deg); }
            .rect-ghost { width: 0; height: 0; }
            </style>
            <div class="rect-known"></div>
            <div class="rect-ghost"></div>
            <div style="perspective:100px;width:1000.099%;" id="rect-container">
                <style>
                .rects { width: 1000%; height: 1000%; max-width: 1000%; }
                .absolute { position: absolute; }
                #cRect1 { border: solid 2.715px; border-color: #F72585; padding: 3.98px; margin-left: 12.12px; }
                #cRect2 { border: solid 2px; border-color: #7209B7; font-size: 30px; margin-top: 20px; padding: 3.98px; transform: skewY(23.1753218deg) rotate3d(10.00099, 90, 0.100000000000009, 60000000000008.00000009deg); }
                #cRect3 { border: solid 2.89px; border-color: #3A0CA3; font-size: 45px; transform: skewY(-23.1753218deg) scale(1099.0000000099, 1.89) matrix(1.11, 2.0001, -1.0001, 1.009, 150, 94.4); margin-top: 50px; }
                #cRect4 { border: solid 2px; border-color: #4361EE; transform: matrix(1.11, 2.0001, -1.0001, 1.009, 150, 94.4); margin-top: 11.1331px; margin-left: 12.1212px; padding: 4.4545px; left: 239.4141px; top: 8.5050px; }
                #cRect5 { border: solid 2px; border-color: #4CC9F0; margin-left: 42.395pt; }
                #cRect6 { border: solid 2px; border-color: #F72585; transform: perspective(12890px) translateZ(101.5px); padding: 12px; }
                #cRect7 { margin-top: -350.552px; margin-left: 0.9099rem; border: solid 2px; border-color: #4361EE; }
                #cRect8 { margin-top: -150.552px; margin-left: 15.9099rem; border: solid 2px; border-color: #3A0CA3; }
                #cRect9 { margin-top: -110.552px; margin-left: 15.9099rem; border: solid 2px; border-color: #7209B7; }
                #cRect10 { margin-top: -315.552px; margin-left: 15.9099rem; border: solid 2px; border-color: #F72585; }
                #cRect11 { width: 10px; height: 10px; margin-left: 15.0000009099rem; border: solid 2px; border-color: #F72585; }
                #cRect12 { width: 10px; height: 10px; margin-left: 15.0000009099rem; border: solid 2px; border-color: #F72585; }
                #rect-container .shift-dom-rect { top: 1px !important; left: 1px !important; }
                </style>
                <div id="cRect1" class="rects"></div>
                <div id="cRect2" class="rects"></div>
                <div id="cRect3" class="rects"></div>
                <div id="cRect4" class="rects absolute"></div>
                <div id="cRect5" class="rects"></div>
                <div id="cRect6" class="rects"></div>
                <div id="cRect7" class="rects absolute"></div>
                <div id="cRect8" class="rects absolute"></div>
                <div id="cRect9" class="rects absolute"></div>
                <div id="cRect10" class="rects absolute"></div>
                <div id="cRect11" class="rects"></div>
                <div id="cRect12" class="rects"></div>
            </div>
            <div id="emoji-container">
                <style>
                .domrect-emoji {
                    font-family: ${CSS_FONT_FAMILY};
                    font-size: 200px !important;
                    height: auto;
                    position: absolute !important;
                    transform: scale(1.000999);
                }
                </style>
                ${EMOJIS.map(emoji => `<div class="domrect-emoji">${emoji}</div>`).join('')}
            </div>
        `;

        document.body.appendChild(container);

        // Allow render
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        try {
            // Get emoji set dimensions for system fingerprinting
            const pattern = new Set();
            const emojiElems = [...container.getElementsByClassName('domrect-emoji')];
            const emojiSet = emojiElems.reduce((emojiSet, el, i) => {
                const emoji = EMOJIS[i];
                const rect = el.getBoundingClientRect();
                const dimensions = `${rect.width},${rect.height}`;
                if (!pattern.has(dimensions)) {
                    pattern.add(dimensions);
                    emojiSet.add(emoji);
                }
                return emojiSet;
            }, new Set());

            const domrectSystemSum = 0.00001 * [...pattern].map(x => {
                return x.split(',').reduce((acc, v) => acc + (+v || 0), 0);
            }).reduce((acc, x) => acc + x, 0);

            // Get client rects
            const range = document.createRange();
            const rectElems = [...container.getElementsByClassName('rects')];

            const elementClientRects = rectElems.map(el => this._toNativeObject(el.getClientRects()[0]));
            const elementBoundingClientRect = rectElems.map(el => this._toNativeObject(el.getBoundingClientRect()));

            const rangeClientRects = rectElems.map(el => {
                range.selectNode(el);
                return this._toNativeObject(range.getClientRects()[0]);
            });

            const rangeBoundingClientRect = rectElems.map(el => {
                range.selectNode(el);
                return this._toNativeObject(el.getBoundingClientRect());
            });

            // Shift calculation test (inspired by arkenfox TZP)
            const rect4 = rectElems[3];
            const { top: initialTop } = elementClientRects[3];
            rect4.classList.add('shift-dom-rect');
            const { top: shiftedTop } = this._toNativeObject(rect4.getClientRects()[0]);
            rect4.classList.remove('shift-dom-rect');
            const { top: unshiftedTop } = this._toNativeObject(rect4.getClientRects()[0]);
            const diff = initialTop - shiftedTop;
            const unshiftLie = diff !== (unshiftedTop - shiftedTop);
            
            if (unshiftLie) {
                lied = true;
                lies.push('failed-unshift-calculation');
            }

            // Math calculation lie detection
            let mathLie = false;
            elementClientRects.forEach(rect => {
                const { right, left, width, bottom, top, height, x, y } = rect;
                if (
                    right - left !== width ||
                    bottom - top !== height ||
                    right - x !== width ||
                    bottom - y !== height
                ) {
                    lied = true;
                    mathLie = true;
                }
            });
            
            if (mathLie) {
                lies.push('failed-math-calculation');
            }

            // Equal elements mismatch detection
            const { right: right1, left: left1 } = elementClientRects[10];
            const { right: right2, left: left2 } = elementClientRects[11];
            if (right1 !== right2 || left1 !== left2) {
                lied = true;
                lies.push('equal-elements-mismatch');
            }

            // Known rotate dimensions check
            const knownEl = container.getElementsByClassName('rect-known')[0];
            const knownDimensions = this._toNativeObject(knownEl.getClientRects()[0]);
            const knownHash = hashMini(knownDimensions);

            if (IS_BLINK) {
                const validRotateHashes = {
                    '9d9215cc': true, // 100, etc
                    '47ded322': true, // 33, 67
                    'd0eceaa8': true, // 90
                };
                if (!validRotateHashes[knownHash]) {
                    lied = true;
                    lies.push('unknown-rotate-dimensions');
                }
            } else if (IS_GECKO) {
                const validRotateHashes = {
                    'e38453f0': true, // 100, etc
                };
                if (!validRotateHashes[knownHash]) {
                    lied = true;
                    lies.push('unknown-rotate-dimensions');
                }
            }

            // Ghost dimensions check
            const ghostEl = container.getElementsByClassName('rect-ghost')[0];
            const ghostDimensions = this._toNativeObject(ghostEl.getClientRects()[0]);
            const hasGhostDimensions = Object.keys(ghostDimensions).some(key => ghostDimensions[key] !== 0);

            if (hasGhostDimensions) {
                lied = true;
                lies.push('unknown-ghost-dimensions');
            }

            // Calculate sums for fingerprinting
            const elementClientRectsSum = elementClientRects.reduce((acc, rect) => acc + this._getRectSum(rect), 0);
            const elementBoundingClientRectSum = elementBoundingClientRect.reduce((acc, rect) => acc + this._getRectSum(rect), 0);
            const rangeClientRectsSum = rangeClientRects.reduce((acc, rect) => acc + this._getRectSum(rect), 0);
            const rangeBoundingClientRectSum = rangeBoundingClientRect.reduce((acc, rect) => acc + this._getRectSum(rect), 0);

            this.lied = lied;
            this.lies = lies;

            return {
                elementClientRects,
                elementBoundingClientRect,
                rangeClientRects,
                rangeBoundingClientRect,
                elementClientRectsSum,
                elementBoundingClientRectSum,
                rangeClientRectsSum,
                rangeBoundingClientRectSum,
                emojiSet: [...emojiSet],
                domrectSystemSum,
                knownHash,
                lied,
                lies,
                hash: hashMini({
                    elementClientRectsSum,
                    elementBoundingClientRectSum,
                    rangeClientRectsSum,
                    rangeBoundingClientRectSum,
                    domrectSystemSum
                })
            };

        } finally {
            // Cleanup
            document.body.removeChild(container);
        }
    }

    /**
     * Format metrics for standard output
     * @private
     */
    _formatMetrics(result) {
        if (!result) return {};

        return {
            domrectHash: {
                value: result.hash,
                description: 'DOMRect fingerprint hash',
                risk: 'Low'
            },
            domrectElementSum: {
                value: result.elementClientRectsSum?.toFixed(8),
                description: 'Element.getClientRects() sum fingerprint',
                risk: 'Low'
            },
            domrectBoundingSum: {
                value: result.elementBoundingClientRectSum?.toFixed(8),
                description: 'Element.getBoundingClientRect() sum fingerprint',
                risk: 'Low'
            },
            domrectRangeSum: {
                value: result.rangeClientRectsSum?.toFixed(8),
                description: 'Range.getClientRects() sum fingerprint',
                risk: 'Low'
            },
            domrectRangeBoundingSum: {
                value: result.rangeBoundingClientRectSum?.toFixed(8),
                description: 'Range.getBoundingClientRect() sum fingerprint',
                risk: 'Low'
            },
            domrectEmojiSystemSum: {
                value: result.domrectSystemSum?.toFixed(8),
                description: 'Emoji rendering system fingerprint',
                risk: 'Low'
            },
            domrectEmojiSet: {
                value: result.emojiSet?.join('') || '',
                description: 'Unique emoji dimensions set',
                risk: 'Low'
            },
            domrectEmojiSetHash: {
                value: hashMini(result.emojiSet),
                description: 'Emoji set hash',
                risk: 'Low'
            }
            
        };
    }

    /**
     * Get raw result data
     */
    getResult() {
        return this.result;
    }
}

// ============================================================
// CSS MEDIA FINGERPRINT DETECTOR
// Based on CreepJS src/cssmedia/index.ts
// ============================================================

/**
 * CSS Media Fingerprint Detector
 * Uses media queries to detect device capabilities and user preferences.
 */
class CSSMediaFingerprintDetector {
    constructor() {
        this.result = null;
        this.metrics = {};
    }

    /**
     * Main analysis entry point
     * @returns {Promise<Object>} Formatted metrics
     */
    async analyze() {
        const startTime = performance.now();
        
        try {
            this.result = this._collectCSSMediaFingerprint();
            this.metrics = this._formatMetrics(this.result);
        } catch (error) {
            this.metrics = {
                error: {
                    value: error.message,
                    description: 'CSS Media fingerprint detection error',
                    risk: 'N/A'
                }
            };
        }
        
        this.metrics._timing = {
            value: Math.round(performance.now() - startTime),
            description: 'CSS Media detection duration (ms)',
            risk: 'N/A'
        };
        
        return this.metrics;
    }

    /**
     * Calculate GCD for aspect ratio
     * @private
     */
    _gcd(a, b) {
        return b === 0 ? a : this._gcd(b, a % b);
    }

    /**
     * Get aspect ratio string
     * @private
     */
    _getAspectRatio(width, height) {
        const r = this._gcd(width, height);
        return `${width / r}/${height / r}`;
    }

    /**
     * Query device dimension via CSS media queries
     * @private
     */
    _queryDimension(body, type, rangeStart, rangeLen) {
        const html = [...Array(rangeLen)].map((_, i) => {
            i += rangeStart;
            return `@media(device-${type}:${i}px){body{--device-${type}:${i};}}`;
        }).join('');
        body.innerHTML = `<style>${html}</style>`;
        const style = getComputedStyle(body);
        return style.getPropertyValue(`--device-${type}`).trim();
    }

    /**
     * Get screen dimensions via CSS queries
     * @private
     */
    _getScreenMedia(body, width, height) {
        let widthMatch = this._queryDimension(body, 'width', width, 1);
        let heightMatch = this._queryDimension(body, 'height', height, 1);
        
        if (widthMatch && heightMatch) {
            return { width, height };
        }
        
        const rangeLen = 1000;
        [...Array(10)].find((_, i) => {
            if (!widthMatch) {
                widthMatch = this._queryDimension(body, 'width', i * rangeLen, rangeLen);
            }
            if (!heightMatch) {
                heightMatch = this._queryDimension(body, 'height', i * rangeLen, rangeLen);
            }
            return widthMatch && heightMatch;
        });
        
        return { width: +widthMatch, height: +heightMatch };
    }

    /**
     * Collect CSS Media fingerprint - exact CreepJS implementation
     * @private
     */
    _collectCSSMediaFingerprint() {
        const win = window;
        const { width, availWidth, height, availHeight } = screen;

        const noTaskbar = !(width - availWidth || height - availHeight);
        const deviceAspectRatio = this._getAspectRatio(width, height);

        // matchMedia-based detection
        const matchMediaCSS = {
            'prefers-reduced-motion': (
                win.matchMedia('(prefers-reduced-motion: no-preference)').matches ? 'no-preference' :
                win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : undefined
            ),
            'prefers-color-scheme': (
                matchMedia('(prefers-color-scheme: light)').matches ? 'light' :
                matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : undefined
            ),
            'monochrome': (
                win.matchMedia('(monochrome)').matches ? 'monochrome' :
                win.matchMedia('(monochrome: 0)').matches ? 'non-monochrome' : undefined
            ),
            'inverted-colors': (
                win.matchMedia('(inverted-colors: inverted)').matches ? 'inverted' :
                win.matchMedia('(inverted-colors: none)').matches ? 'none' : undefined
            ),
            'forced-colors': (
                win.matchMedia('(forced-colors: none)').matches ? 'none' :
                win.matchMedia('(forced-colors: active)').matches ? 'active' : undefined
            ),
            'any-hover': (
                win.matchMedia('(any-hover: hover)').matches ? 'hover' :
                win.matchMedia('(any-hover: none)').matches ? 'none' : undefined
            ),
            'hover': (
                win.matchMedia('(hover: hover)').matches ? 'hover' :
                win.matchMedia('(hover: none)').matches ? 'none' : undefined
            ),
            'any-pointer': (
                win.matchMedia('(any-pointer: fine)').matches ? 'fine' :
                win.matchMedia('(any-pointer: coarse)').matches ? 'coarse' :
                win.matchMedia('(any-pointer: none)').matches ? 'none' : undefined
            ),
            'pointer': (
                win.matchMedia('(pointer: fine)').matches ? 'fine' :
                win.matchMedia('(pointer: coarse)').matches ? 'coarse' :
                win.matchMedia('(pointer: none)').matches ? 'none' : undefined
            ),
            'device-aspect-ratio': (
                win.matchMedia(`(device-aspect-ratio: ${deviceAspectRatio})`).matches ? deviceAspectRatio : undefined
            ),
            'device-screen': (
                win.matchMedia(`(device-width: ${width}px) and (device-height: ${height}px)`).matches ? `${width} x ${height}` : undefined
            ),
            'display-mode': (
                win.matchMedia('(display-mode: fullscreen)').matches ? 'fullscreen' :
                win.matchMedia('(display-mode: standalone)').matches ? 'standalone' :
                win.matchMedia('(display-mode: minimal-ui)').matches ? 'minimal-ui' :
                win.matchMedia('(display-mode: browser)').matches ? 'browser' : undefined
            ),
            'color-gamut': (
                win.matchMedia('(color-gamut: rec2020)').matches ? 'rec2020' :
                win.matchMedia('(color-gamut: p3)').matches ? 'p3' :
                win.matchMedia('(color-gamut: srgb)').matches ? 'srgb' : undefined
            ),
            'orientation': (
                matchMedia('(orientation: landscape)').matches ? 'landscape' :
                matchMedia('(orientation: portrait)').matches ? 'portrait' : undefined
            ),
            'prefers-contrast': (
                win.matchMedia('(prefers-contrast: more)').matches ? 'more' :
                win.matchMedia('(prefers-contrast: less)').matches ? 'less' :
                win.matchMedia('(prefers-contrast: no-preference)').matches ? 'no-preference' : undefined
            ),
            'dynamic-range': (
                win.matchMedia('(dynamic-range: high)').matches ? 'high' :
                win.matchMedia('(dynamic-range: standard)').matches ? 'standard' : undefined
            ),
            'scripting': (
                win.matchMedia('(scripting: enabled)').matches ? 'enabled' :
                win.matchMedia('(scripting: none)').matches ? 'none' : undefined
            ),
            'update': (
                win.matchMedia('(update: fast)').matches ? 'fast' :
                win.matchMedia('(update: slow)').matches ? 'slow' :
                win.matchMedia('(update: none)').matches ? 'none' : undefined
            )
        };

        // CSS @media-based detection (via computed style)
        const testContainer = document.createElement('div');
        testContainer.style.cssText = 'position:absolute;left:-10000px;visibility:hidden;';
        document.body.appendChild(testContainer);

        testContainer.innerHTML = `
        <style>
        @media (prefers-reduced-motion: no-preference) {body {--prefers-reduced-motion: no-preference}}
        @media (prefers-reduced-motion: reduce) {body {--prefers-reduced-motion: reduce}}
        @media (prefers-color-scheme: light) {body {--prefers-color-scheme: light}}
        @media (prefers-color-scheme: dark) {body {--prefers-color-scheme: dark}}
        @media (monochrome) {body {--monochrome: monochrome}}
        @media (monochrome: 0) {body {--monochrome: non-monochrome}}
        @media (inverted-colors: inverted) {body {--inverted-colors: inverted}}
        @media (inverted-colors: none) {body {--inverted-colors: none}}
        @media (forced-colors: none) {body {--forced-colors: none}}
        @media (forced-colors: active) {body {--forced-colors: active}}
        @media (any-hover: hover) {body {--any-hover: hover}}
        @media (any-hover: none) {body {--any-hover: none}}
        @media (hover: hover) {body {--hover: hover}}
        @media (hover: none) {body {--hover: none}}
        @media (any-pointer: fine) {body {--any-pointer: fine}}
        @media (any-pointer: coarse) {body {--any-pointer: coarse}}
        @media (any-pointer: none) {body {--any-pointer: none}}
        @media (pointer: fine) {body {--pointer: fine}}
        @media (pointer: coarse) {body {--pointer: coarse}}
        @media (pointer: none) {body {--pointer: none}}
        @media (device-aspect-ratio: ${deviceAspectRatio}) {body {--device-aspect-ratio: ${deviceAspectRatio}}}
        @media (device-width: ${width}px) and (device-height: ${height}px) {body {--device-screen: ${width} x ${height}}}
        @media (display-mode: fullscreen) {body {--display-mode: fullscreen}}
        @media (display-mode: standalone) {body {--display-mode: standalone}}
        @media (display-mode: minimal-ui) {body {--display-mode: minimal-ui}}
        @media (display-mode: browser) {body {--display-mode: browser}}
        @media (color-gamut: srgb) {body {--color-gamut: srgb}}
        @media (color-gamut: p3) {body {--color-gamut: p3}}
        @media (color-gamut: rec2020) {body {--color-gamut: rec2020}}
        @media (orientation: landscape) {body {--orientation: landscape}}
        @media (orientation: portrait) {body {--orientation: portrait}}
        </style>
        `;

        const style = getComputedStyle(document.body);
        const mediaCSS = {
            'prefers-reduced-motion': style.getPropertyValue('--prefers-reduced-motion').trim() || undefined,
            'prefers-color-scheme': style.getPropertyValue('--prefers-color-scheme').trim() || undefined,
            'monochrome': style.getPropertyValue('--monochrome').trim() || undefined,
            'inverted-colors': style.getPropertyValue('--inverted-colors').trim() || undefined,
            'forced-colors': style.getPropertyValue('--forced-colors').trim() || undefined,
            'any-hover': style.getPropertyValue('--any-hover').trim() || undefined,
            'hover': style.getPropertyValue('--hover').trim() || undefined,
            'any-pointer': style.getPropertyValue('--any-pointer').trim() || undefined,
            'pointer': style.getPropertyValue('--pointer').trim() || undefined,
            'device-aspect-ratio': style.getPropertyValue('--device-aspect-ratio').trim() || undefined,
            'device-screen': style.getPropertyValue('--device-screen').trim() || undefined,
            'display-mode': style.getPropertyValue('--display-mode').trim() || undefined,
            'color-gamut': style.getPropertyValue('--color-gamut').trim() || undefined,
            'orientation': style.getPropertyValue('--orientation').trim() || undefined
        };

        // Get screen query via CSS
        const screenQuery = this._getScreenMedia(testContainer, width, height);

        // Cleanup
        document.body.removeChild(testContainer);

        // Check for suspicious patterns
        const isTouchDevice = matchMediaCSS['any-pointer'] === 'coarse';
        const hasNoTaskbar = noTaskbar && width > 800;

        return {
            mediaCSS,
            matchMediaCSS,
            screenQuery,
            deviceAspectRatio,
            noTaskbar,
            isTouchDevice,
            hasNoTaskbar,
            screenWidth: width,
            screenHeight: height,
            hash: hashMini({ mediaCSS, matchMediaCSS })
        };
    }

    /**
     * Format metrics for standard output
     * @private
     */
    _formatMetrics(result) {
        if (!result) return {};

        const { matchMediaCSS, mediaCSS, screenQuery } = result;

        return {
            cssMediaHash: {
                value: result.hash,
                description: 'CSS Media fingerprint hash',
                risk: 'Low'
            },
            cssMediaColorScheme: {
                value: matchMediaCSS['prefers-color-scheme'] || 'unknown',
                description: 'User color scheme preference',
                risk: 'Low'
            },
            cssMediaReducedMotion: {
                value: matchMediaCSS['prefers-reduced-motion'] || 'unknown',
                description: 'Reduced motion preference',
                risk: 'Low'
            },
            cssMediaColorGamut: {
                value: matchMediaCSS['color-gamut'] || 'unknown',
                description: 'Display color gamut',
                risk: 'Low'
            },
            cssMediaDynamicRange: {
                value: matchMediaCSS['dynamic-range'] || 'unknown',
                description: 'Display dynamic range (HDR)',
                risk: 'Low'
            },
            cssMediaPointer: {
                value: matchMediaCSS['pointer'] || 'unknown',
                description: 'Primary pointing device type',
                risk: 'Low'
            },
            cssMediaHover: {
                value: matchMediaCSS['hover'] || 'unknown',
                description: 'Hover capability',
                risk: 'Low'
            },
            cssMediaAnyPointer: {
                value: matchMediaCSS['any-pointer'] || 'unknown',
                description: 'Any pointer device type',
                risk: 'Low'
            },
            cssMediaDisplayMode: {
                value: matchMediaCSS['display-mode'] || 'unknown',
                description: 'Display mode',
                risk: 'Low'
            },
            cssMediaOrientation: {
                value: matchMediaCSS['orientation'] || 'unknown',
                description: 'Screen orientation',
                risk: 'Low'
            },
            cssMediaDeviceAspectRatio: {
                value: result.deviceAspectRatio,
                description: 'Device aspect ratio',
                risk: 'Low'
            },
            cssMediaForcedColors: {
                value: matchMediaCSS['forced-colors'] || 'unknown',
                description: 'Forced colors mode (high contrast)',
                risk: 'Low'
            },
            cssMediaInvertedColors: {
                value: matchMediaCSS['inverted-colors'] || 'unknown',
                description: 'Inverted colors setting',
                risk: 'Low'
            },
            cssMediaContrast: {
                value: matchMediaCSS['prefers-contrast'] || 'unknown',
                description: 'Contrast preference',
                risk: 'Low'
            },
            cssMediaScreenQuery: {
                value: screenQuery ? `${screenQuery.width} x ${screenQuery.height}` : 'unknown',
                description: 'CSS screen query dimensions',
                risk: 'Low'
            },
            cssMediaNoTaskbar: {
                value: result.hasNoTaskbar,
                description: 'Screen has no taskbar (suspicious for desktop)',
                risk: result.hasNoTaskbar ? 'Medium' : 'Low'
            },
            cssMediaIsTouchDevice: {
                value: result.isTouchDevice,
                description: 'Device is touch-capable',
                risk: 'Low'
            }
        };
    }

    /**
     * Get raw result data
     */
    getResult() {
        return this.result;
    }
}

// ============================================================
// INTL FINGERPRINT DETECTOR
// Based on CreepJS src/intl/index.ts
// ============================================================

/**
 * Intl Fingerprint Detector
 * Uses Internationalization API to fingerprint locale and formatting preferences.
 */
class IntlFingerprintDetector {
    constructor() {
        this.result = null;
        this.metrics = {};
    }

    /**
     * Main analysis entry point
     * @returns {Promise<Object>} Formatted metrics
     */
    async analyze() {
        const startTime = performance.now();
        
        try {
            this.result = await this._collectIntlFingerprint();
            this.metrics = this._formatMetrics(this.result);
        } catch (error) {
            this.metrics = {
                error: {
                    value: error.message,
                    description: 'Intl fingerprint detection error',
                    risk: 'N/A'
                }
            };
        }
        
        this.metrics._timing = {
            value: Math.round(performance.now() - startTime),
            description: 'Intl detection duration (ms)',
            risk: 'N/A'
        };
        
        return this.metrics;
    }

    /**
     * Get locale from all Intl constructors
     * @private
     */
    _getLocale() {
        const constructors = [
            'Collator',
            'DateTimeFormat',
            'DisplayNames',
            'ListFormat',
            'NumberFormat',
            'PluralRules',
            'RelativeTimeFormat',
        ];

        const locales = constructors.reduce((acc, name) => {
            try {
                const obj = new Intl[name]();
                if (!obj) return acc;
                const { locale } = obj.resolvedOptions() || {};
                return [...acc, locale];
            } catch (e) {
                return acc;
            }
        }, []);

        return [...new Set(locales)];
    }

    /**
     * Collect Intl fingerprint - exact CreepJS implementation
     * @private
     */
    async _collectIntlFingerprint() {
        // DateTimeFormat test
        const dateTimeFormat = caniuse(() => {
            return new Intl.DateTimeFormat(undefined, {
                month: 'long',
                timeZoneName: 'long',
            }).format(963644400000); // Fixed timestamp for consistency
        });

        // DisplayNames test
        const displayNames = caniuse(() => {
            return new Intl.DisplayNames(undefined, {
                type: 'language',
            }).of('en-US');
        });

        // ListFormat test
        const listFormat = caniuse(() => {
            return new Intl.ListFormat(undefined, {
                style: 'long',
                type: 'disjunction',
            }).format(['0', '1']);
        });

        // NumberFormat test
        const numberFormat = caniuse(() => {
            return new Intl.NumberFormat(undefined, {
                notation: 'compact',
                compactDisplay: 'long',
            }).format(21000000);
        });

        // PluralRules test
        const pluralRules = caniuse(() => {
            return new Intl.PluralRules().select(1);
        });

        // RelativeTimeFormat test
        const relativeTimeFormat = caniuse(() => {
            return new Intl.RelativeTimeFormat(undefined, {
                localeMatcher: 'best fit',
                numeric: 'auto',
                style: 'long',
            }).format(1, 'year');
        });

        // Get locale from all constructors
        const locale = this._getLocale();

        // Get resolved options from key constructors
        const dateTimeFormatOptions = caniuse(() => {
            return new Intl.DateTimeFormat().resolvedOptions();
        });

        const numberFormatOptions = caniuse(() => {
            return new Intl.NumberFormat().resolvedOptions();
        });

        const collatorOptions = caniuse(() => {
            return new Intl.Collator().resolvedOptions();
        });

        return {
            dateTimeFormat,
            displayNames,
            listFormat,
            numberFormat,
            pluralRules,
            relativeTimeFormat,
            locale: locale.join(','),
            dateTimeFormatOptions,
            numberFormatOptions,
            collatorOptions,
            hash: hashMini({
                dateTimeFormat,
                displayNames,
                listFormat,
                numberFormat,
                pluralRules,
                relativeTimeFormat,
                locale
            })
        };
    }

    /**
     * Format metrics for standard output
     * @private
     */
    _formatMetrics(result) {
        if (!result) return {};

        return {
            intlHash: {
                value: result.hash,
                description: 'Intl API fingerprint hash',
                risk: 'Low'
            },
            intlLocale: {
                value: result.locale || 'unknown',
                description: 'Detected locale from Intl constructors',
                risk: 'Low'
            },
            intlDateTimeFormat: {
                value: result.dateTimeFormat || 'unsupported',
                description: 'DateTimeFormat output (locale-specific)',
                risk: 'Low'
            },
            intlDisplayNames: {
                value: result.displayNames || 'unsupported',
                description: 'DisplayNames output for en-US',
                risk: 'Low'
            },
            intlListFormat: {
                value: result.listFormat || 'unsupported',
                description: 'ListFormat output (locale-specific)',
                risk: 'Low'
            },
            intlNumberFormat: {
                value: result.numberFormat || 'unsupported',
                description: 'NumberFormat compact output',
                risk: 'Low'
            },
            intlPluralRules: {
                value: result.pluralRules || 'unsupported',
                description: 'PluralRules select(1) output',
                risk: 'Low'
            },
            intlRelativeTimeFormat: {
                value: result.relativeTimeFormat || 'unsupported',
                description: 'RelativeTimeFormat output',
                risk: 'Low'
            },
            intlTimezone: {
                value: result.dateTimeFormatOptions?.timeZone || 'unknown',
                description: 'Resolved timezone',
                risk: 'Low'
            },
            intlCalendar: {
                value: result.dateTimeFormatOptions?.calendar || 'unknown',
                description: 'Resolved calendar system',
                risk: 'Low'
            },
            intlNumberingSystem: {
                value: result.numberFormatOptions?.numberingSystem || 'unknown',
                description: 'Resolved numbering system',
                risk: 'Low'
            },
            intlCollation: {
                value: result.collatorOptions?.collation || 'unknown',
                description: 'Resolved collation type',
                risk: 'Low'
            }
        };
    }

    /**
     * Get raw result data
     */
    getResult() {
        return this.result;
    }
}

// ============================================================
// COMBINED CREEPJS ENHANCED DETECTOR
// ============================================================

/**
 * CreepJS Enhanced Detector
 * Combines all CreepJS-inspired fingerprinting techniques.
 */
class CreepjsEnhancedDetector {
    constructor(config = {}) {
        this.config = {
            enableMath: true,
            enableDOMRect: true,
            enableCSSMedia: true,
            enableIntl: true,
            ...config
        };
        
        this.mathDetector = new MathFingerprintDetector();
        this.domrectDetector = new DOMRectFingerprintDetector();
        this.cssMediaDetector = new CSSMediaFingerprintDetector();
        this.intlDetector = new IntlFingerprintDetector();
        
        this.result = null;
        this.metrics = {};
    }

    /**
     * Main analysis entry point - runs all enabled detectors
     * @returns {Promise<Object>} Combined formatted metrics
     */
    async analyze() {
        const startTime = performance.now();
        const results = {};
        const allMetrics = {};

        try {
            // Run enabled detectors in parallel
            const promises = [];

            if (this.config.enableMath) {
                promises.push(
                    this.mathDetector.analyze().then(metrics => {
                        results.math = this.mathDetector.getResult();
                        Object.assign(allMetrics, metrics);
                    })
                );
            }

            if (this.config.enableDOMRect) {
                promises.push(
                    this.domrectDetector.analyze().then(metrics => {
                        results.domrect = this.domrectDetector.getResult();
                        Object.assign(allMetrics, metrics);
                    })
                );
            }

            if (this.config.enableCSSMedia) {
                promises.push(
                    this.cssMediaDetector.analyze().then(metrics => {
                        results.cssMedia = this.cssMediaDetector.getResult();
                        Object.assign(allMetrics, metrics);
                    })
                );
            }

            if (this.config.enableIntl) {
                promises.push(
                    this.intlDetector.analyze().then(metrics => {
                        results.intl = this.intlDetector.getResult();
                        Object.assign(allMetrics, metrics);
                    })
                );
            }

            await Promise.all(promises);

            this.result = results;
            this.metrics = allMetrics;

            // Add combined fingerprint hash
            this.metrics.creepjsCombinedHash = {
                value: hashMini({
                    math: results.math?.hash,
                    domrect: results.domrect?.hash,
                    cssMedia: results.cssMedia?.hash,
                    intl: results.intl?.hash
                }),
                description: 'Combined CreepJS-enhanced fingerprint hash',
                risk: 'Low'
            };

            // Add any detected lies summary
            const allLies = [];
            if (results.math?.lied) allLies.push('math');
            if (results.domrect?.lied) allLies.push('domrect');

            this.metrics.creepjsLiesDetected = {
                value: allLies.length > 0 ? allLies.join(', ') : 'none',
                description: 'APIs with tampering detected',
                risk: allLies.length > 0 ? 'High' : 'Low'
            };

        } catch (error) {
            this.metrics.error = {
                value: error.message,
                description: 'CreepJS enhanced detection error',
                risk: 'N/A'
            };
        }

        this.metrics._totalTiming = {
            value: Math.round(performance.now() - startTime),
            description: 'Total CreepJS detection duration (ms)',
            risk: 'N/A'
        };

        return this.metrics;
    }

    /**
     * Get all raw results
     */
    getResults() {
        return this.result;
    }

    /**
     * Get individual detector
     */
    getMathDetector() {
        return this.mathDetector;
    }

    getDOMRectDetector() {
        return this.domrectDetector;
    }

    getCSSMediaDetector() {
        return this.cssMediaDetector;
    }

    getIntlDetector() {
        return this.intlDetector;
    }
}

// ============================================================
// EXPORTS
// ============================================================

export {
    MathFingerprintDetector,
    DOMRectFingerprintDetector,
    CSSMediaFingerprintDetector,
    IntlFingerprintDetector,
    CreepjsEnhancedDetector,
    // Utilities
    hashMini,
    attempt,
    caniuse,
    IS_BLINK,
    IS_GECKO,
    IS_WEBKIT
};

// Default export for convenience
export default CreepjsEnhancedDetector;
