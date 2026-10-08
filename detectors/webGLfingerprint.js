/**
 * WebGL & Canvas Fingerprint Detector Module
 * Implements BrowserLeaks-equivalent WebGL fingerprinting
 * Collects WebGL/WebGL2 parameters, extensions, and generates image hash
 * 
 * Also includes Canvas 2D fingerprinting based on FingerprintJS approach:
 * - Text rendering fingerprint (font rendering differences)
 * - Geometry fingerprint (blending/winding differences)
 * 
 * @module detectors/webGLfingerprint
 * @see https://browserleaks.com/webgl
 * @see https://browserleaks.com/canvas
 */

/**
 * WebGL parameters to collect (matching BrowserLeaks)
 */
const PARAM_ENUM_NAMES = [
    'VERSION', 'SHADING_LANGUAGE_VERSION', 'VENDOR', 'RENDERER',
    'MAX_VERTEX_ATTRIBS', 'MAX_VERTEX_UNIFORM_VECTORS', 'MAX_VERTEX_TEXTURE_IMAGE_UNITS',
    'MAX_VARYING_VECTORS', 'MAX_VERTEX_UNIFORM_COMPONENTS', 'MAX_VERTEX_UNIFORM_BLOCKS',
    'MAX_VERTEX_OUTPUT_COMPONENTS', 'MAX_VARYING_COMPONENTS',
    'MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS', 'MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS',
    'MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS',
    'ALIASED_LINE_WIDTH_RANGE', 'ALIASED_POINT_SIZE_RANGE',
    'MAX_FRAGMENT_UNIFORM_VECTORS', 'MAX_TEXTURE_IMAGE_UNITS',
    'MAX_FRAGMENT_UNIFORM_COMPONENTS', 'MAX_FRAGMENT_UNIFORM_BLOCKS',
    'MAX_FRAGMENT_INPUT_COMPONENTS', 'MIN_PROGRAM_TEXEL_OFFSET', 'MAX_PROGRAM_TEXEL_OFFSET',
    'MAX_DRAW_BUFFERS', 'MAX_COLOR_ATTACHMENTS', 'MAX_SAMPLES',
    'MAX_RENDERBUFFER_SIZE', 'MAX_VIEWPORT_DIMS',
    'RED_BITS', 'GREEN_BITS', 'BLUE_BITS', 'ALPHA_BITS', 'DEPTH_BITS', 'STENCIL_BITS',
    'MAX_TEXTURE_SIZE', 'MAX_CUBE_MAP_TEXTURE_SIZE', 'MAX_COMBINED_TEXTURE_IMAGE_UNITS',
    'MAX_3D_TEXTURE_SIZE', 'MAX_ARRAY_TEXTURE_LAYERS', 'MAX_TEXTURE_LOD_BIAS',
    'MAX_UNIFORM_BUFFER_BINDINGS', 'MAX_UNIFORM_BLOCK_SIZE', 'UNIFORM_BUFFER_OFFSET_ALIGNMENT',
    'MAX_COMBINED_UNIFORM_BLOCKS', 'MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS',
    'MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS'
];

/**
 * Context names to probe (in BrowserLeaks order)
 */
const CONTEXT_NAMES = [
    'webgl2',
    'webgl',
    'moz-webgl',
    'webkit-3d',
    'webgl2-compute'
];

/**
 * Shaders for deterministic scene rendering
 */
const VERTEX_SHADER_SOURCE = `
attribute vec2 attrVertex;
attribute vec4 attrColor;
varying vec4 varyinColor;
uniform mat4 transform;

void main() {
  varyinColor = attrColor;
  gl_Position = transform * vec4(attrVertex, 0, 1);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;
varying vec4 varyinColor;

void main() {
  gl_FragColor = varyinColor;
}
`;

/**
 * Transform matrix for scene (matching BrowserLeaks)
 */
const TRANSFORM_MATRIX = [
    1.5, 0, 0, 0,
    0, 1.5, 0, 0,
    0, 0, 1, 0,
    0.5, 0, 0, 1
];

/**
 * Constant for 2*PI to avoid floating-point computation variance across JS engines
 * Using an explicit constant instead of Math.PI * 2 ensures identical values everywhere
 */
const TWO_PI = 6.283185307179586;

/**
 * Canvas 2D Text for fingerprinting
 * Uses a specific string with emoji that renders differently across browsers/OSes
 * The 😃 emoji (U+1F603) is chosen for stability and cross-platform variance
 */
const CANVAS_TEXT_STRING = `Cwm fjordbank gly ${String.fromCharCode(55357, 56835)}`; // "Cwm fjordbank gly 😃"

/**
 * Alternative text string (more pangram chars, different emoji)
 * Used by some implementations for additional variance detection
 */
const CANVAS_TEXT_STRING_ALT = 'Cwm fjordbank glyphs vext quiz, 😃';

/**
 * Hash raw pixel bytes using MD5
 * More reliable than hashing dataURL which can vary due to encoding
 * @param {Uint8ClampedArray} pixels - Raw RGBA pixel data from getImageData().data
 * @returns {string} MD5 hash of pixel bytes
 */
function hashImageData(pixels) {
    // Convert to string representation for MD5
    // Using JSON-style format similar to WebGL image hash for consistency
    const pixelStr = JSON.stringify(Array.from(pixels)).replace(/,?"[0-9]+":/g, '');
    return md5(pixelStr);
}

/**
 * Multi-level hash for image data with noise reduction capabilities
 * 
 * Produces multiple hash variants at different sensitivity levels:
 * - full: Maximum sensitivity - detects any pixel difference (current behavior)
 * - quantized6bit: Reduces noise by keeping only 6 most significant bits per channel
 * - structural: Shape-only hash based on alpha threshold (highly stable)
 * - colorRegion: Color distribution hash - counts pixels per quantized color bucket
 * 
 * Use cases:
 * - full: Standard fingerprinting, maximum entropy
 * - quantized6bit: Reduces GPU anti-aliasing variance while preserving fingerprint
 * - structural: Detects major rendering engine differences only
 * - colorRegion: Stable across minor rendering variations, good for VM detection
 * 
 * @param {Uint8ClampedArray} pixels - Raw RGBA pixel data from getImageData().data
 * @param {Object} options - Hashing options
 * @param {number} [options.quantizeBits=6] - Bits to keep per channel for quantized hash (1-8)
 * @param {number} [options.alphaThreshold=128] - Alpha threshold for structural hash (0-255)
 * @param {number} [options.colorBucketBits=4] - Bits per channel for color bucketing (1-8)
 * @returns {Object} Object containing multiple hash variants
 */
function hashImageDataMultiLevel(pixels, options = {}) {
    const {
        quantizeBits = 6,
        alphaThreshold = 128,
        colorBucketBits = 4
    } = options;
    
    // ============================================================
    // HASH 1: Full precision (current behavior - maximum sensitivity)
    // ============================================================
    const fullPixelStr = JSON.stringify(Array.from(pixels)).replace(/,?"[0-9]+":/g, '');
    const full = md5(fullPixelStr);
    
    // ============================================================
    // HASH 2: Quantized hash (reduces LSB noise from GPU differences)
    // Shift right to remove least significant bits, preserving structure
    // Example: 6-bit keeps values like 252, 248, 244... instead of 255, 254, 253...
    // ============================================================
    const shift = 8 - quantizeBits;
    const quantizedPixels = new Uint8Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) {
        // Right-shift removes LSBs, left-shift restores scale
        quantizedPixels[i] = (pixels[i] >> shift) << shift;
    }
    const quantizedPixelStr = JSON.stringify(Array.from(quantizedPixels)).replace(/,?"[0-9]+":/g, '');
    const quantized = md5(quantizedPixelStr);
    
    // ============================================================
    // HASH 3: Structural hash (shape only - alpha channel based)
    // Creates a binary mask: 1 if pixel is "visible" (alpha > threshold), 0 otherwise
    // Highly stable across color variations, detects only shape differences
    // ============================================================
    let structuralStr = '';
    for (let i = 3; i < pixels.length; i += 4) {
        structuralStr += pixels[i] > alphaThreshold ? '1' : '0';
    }
    const structural = md5(structuralStr);
    
    // ============================================================
    // HASH 4: Color region hash (quantized color distribution)
    // Counts pixels per color bucket, then hashes the distribution
    // Very stable - ignores individual pixel positions, captures overall color makeup
    // Good for detecting canvas spoofing that preserves color distribution
    // ============================================================
    const colorShift = 8 - colorBucketBits;
    const colorBuckets = new Map();
    
    for (let i = 0; i < pixels.length; i += 4) {
        // Skip nearly transparent pixels
        if (pixels[i + 3] < 32) continue;
        
        // Quantize each channel to reduce color space
        const r = pixels[i] >> colorShift;
        const g = pixels[i + 1] >> colorShift;
        const b = pixels[i + 2] >> colorShift;
        const key = `${r},${g},${b}`;
        
        colorBuckets.set(key, (colorBuckets.get(key) || 0) + 1);
    }
    
    // Sort buckets by key for deterministic output
    const colorHashInput = Array.from(colorBuckets.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k}:${v}`)
        .join('|');
    const colorRegion = md5(colorHashInput);
    
    return {
        full,           // Maximum sensitivity (current behavior)
        quantized,      // Reduced noise (configurable bits, default 6)
        structural,     // Shape only (binary alpha mask)
        colorRegion     // Color distribution (position-independent)
    };
}

/**
 * Compute pixel diff statistics between two renders
 * Detects farbling (small bounded deltas) vs environment rotation (large structural diffs)
 * 
 * @param {Uint8ClampedArray} pixels1 - First render pixel data
 * @param {Uint8ClampedArray} pixels2 - Second render pixel data
 * @returns {Object} Diff statistics
 */
function computePixelDiffStats(pixels1, pixels2) {
    if (pixels1.length !== pixels2.length) {
        return {
            error: 'size-mismatch',
            length1: pixels1.length,
            length2: pixels2.length
        };
    }
    
    let diffPixelsCount = 0;
    let totalAbsDiff = 0;
    let maxAbsDiff = 0;
    
    // Distribution buckets for delta magnitudes (farbling detection)
    // Farbling typically produces small bounded deltas (1-3)
    const deltaBuckets = { 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0 };
    
    // Track max per-channel deltas for analysis
    let maxRDiff = 0, maxGDiff = 0, maxBDiff = 0, maxADiff = 0;
    
    // Process 4 bytes at a time (RGBA)
    const pixelCount = pixels1.length / 4;
    for (let i = 0; i < pixels1.length; i += 4) {
        const rDiff = Math.abs(pixels1[i] - pixels2[i]);
        const gDiff = Math.abs(pixels1[i + 1] - pixels2[i + 1]);
        const bDiff = Math.abs(pixels1[i + 2] - pixels2[i + 2]);
        const aDiff = Math.abs(pixels1[i + 3] - pixels2[i + 3]);
        
        const pixelDiff = rDiff + gDiff + bDiff; // Exclude alpha for main diff
        
        if (pixelDiff > 0 || aDiff > 0) {
            diffPixelsCount++;
            totalAbsDiff += pixelDiff;
            
            // Track max deltas
            if (pixelDiff > maxAbsDiff) maxAbsDiff = pixelDiff;
            if (rDiff > maxRDiff) maxRDiff = rDiff;
            if (gDiff > maxGDiff) maxGDiff = gDiff;
            if (bDiff > maxBDiff) maxBDiff = bDiff;
            if (aDiff > maxADiff) maxADiff = aDiff;
            
            // Bucket the max channel delta for this pixel
            const maxChannelDelta = Math.max(rDiff, gDiff, bDiff);
            if (maxChannelDelta >= 5) deltaBuckets['5+']++;
            else if (maxChannelDelta >= 1) deltaBuckets[maxChannelDelta]++;
        }
    }
    
    const meanAbsDiff = diffPixelsCount > 0 ? totalAbsDiff / diffPixelsCount : 0;
    const diffRatio = diffPixelsCount / pixelCount;
    
    return {
        diffPixelsCount,
        totalPixels: pixelCount,
        diffRatio: Math.round(diffRatio * 10000) / 10000, // 4 decimal places
        meanAbsDiff: Math.round(meanAbsDiff * 100) / 100,
        maxAbsDiff,
        maxChannelDeltas: { r: maxRDiff, g: maxGDiff, b: maxBDiff, a: maxADiff },
        deltaBuckets,
        // Heuristics for detection type
        isFarbling: diffPixelsCount > 0 && maxAbsDiff <= 12 && diffRatio > 0.01,
        isEnvRotation: diffPixelsCount > 0 && (maxAbsDiff > 12 || diffRatio < 0.01)
    };
}

/**
 * Simple shift-subtract hash (used by some implementations)
 * Fast integer hash, less collision-resistant than MD5
 * @param {string} str - String to hash
 * @returns {number} 32-bit integer hash
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash | 0; // Convert to 32-bit integer
    }
    return hash;
}

/**
 * Simple MD5 implementation (no external dependencies)
 * Based on the RSA Data Security, Inc. MD5 Message-Digest Algorithm
 */
function md5(str) {
    function rotateLeft(value, shift) {
        return (value << shift) | (value >>> (32 - shift));
    }
    
    function addUnsigned(x, y) {
        const lsw = (x & 0xFFFF) + (y & 0xFFFF);
        const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }
    
    function md5cycle(x, k) {
        let a = x[0], b = x[1], c = x[2], d = x[3];
        
        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);
        
        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);
        
        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);
        
        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);
        
        x[0] = addUnsigned(a, x[0]);
        x[1] = addUnsigned(b, x[1]);
        x[2] = addUnsigned(c, x[2]);
        x[3] = addUnsigned(d, x[3]);
    }
    
    function cmn(q, a, b, x, s, t) {
        a = addUnsigned(addUnsigned(a, q), addUnsigned(x, t));
        return addUnsigned(rotateLeft(a, s), b);
    }
    
    function ff(a, b, c, d, x, s, t) {
        return cmn((b & c) | ((~b) & d), a, b, x, s, t);
    }
    
    function gg(a, b, c, d, x, s, t) {
        return cmn((b & d) | (c & (~d)), a, b, x, s, t);
    }
    
    function hh(a, b, c, d, x, s, t) {
        return cmn(b ^ c ^ d, a, b, x, s, t);
    }
    
    function ii(a, b, c, d, x, s, t) {
        return cmn(c ^ (b | (~d)), a, b, x, s, t);
    }
    
    function md51(s) {
        const n = s.length;
        const state = [1732584193, -271733879, -1732584194, 271733878];
        let i;
        for (i = 64; i <= s.length; i += 64) {
            md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < s.length; i++) {
            tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        }
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i++) tail[i] = 0;
        }
        tail[14] = n * 8;
        md5cycle(state, tail);
        return state;
    }
    
    function md5blk(s) {
        const md5blks = [];
        for (let i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = s.charCodeAt(i) +
                (s.charCodeAt(i + 1) << 8) +
                (s.charCodeAt(i + 2) << 16) +
                (s.charCodeAt(i + 3) << 24);
        }
        return md5blks;
    }
    
    const hex_chr = '0123456789abcdef'.split('');
    
    function rhex(n) {
        let s = '';
        for (let j = 0; j < 4; j++) {
            s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
        }
        return s;
    }
    
    function hex(x) {
        for (let i = 0; i < x.length; i++) {
            x[i] = rhex(x[i]);
        }
        return x.join('');
    }
    
    return hex(md51(str));
}

/**
 * WebGL & Canvas 2D Fingerprint Detector
 * 
 * Collects:
 * - WebGL/WebGL2 parameters and extensions
 * - WebGL rendered scene hash
 * - Canvas 2D text rendering fingerprint
 * - Canvas 2D geometry fingerprint
 */
class WebGLFingerprintDetector {
    constructor(config = {}) {
        this.config = {
            canvasWidth: 256,
            canvasHeight: 128,
            canvas2dWidth: 240,
            canvas2dHeight: 60,
            ...config
        };
        this.metrics = {};
        this.suspiciousIndicators = [];
    }

    /**
     * Main analysis method
     * @returns {Promise<Object>} WebGL and Canvas 2D fingerprint data
     */
    async analyze() {
        const [webglResult, canvas2dResult] = await Promise.all([
            this.collectWebGLFingerprint(),
            this.collectCanvas2DFingerprint()
        ]);
        
        // Merge results
        const combinedResult = {
            ...webglResult,
            canvas2d: canvas2dResult
        };
        
        this.metrics = this._formatMetrics(combinedResult);
        this._analyzeForSuspiciousPatterns(combinedResult);
        return this.metrics;
    }

    /**
     * Collect WebGL fingerprint (matching BrowserLeaks)
     * @returns {Promise<Object>} Complete WebGL fingerprint
     */
    async collectWebGLFingerprint() {
        // Timing: Start total collection time
        const totalStartTime = performance.now();
        
        // Timing object to track sub-operations
        const timing = {
            totalMs: 0,
            contextProbeMs: 0,
            parameterCollectionMs: 0,
            reportHashMs: 0,
            imageHashMs: 0
        };
        
        try {
            // One canvas per context name: a canvas that already holds a webgl2 context returns null for 'webgl'.
            const canvasByContext = {};
            const newCanvas = () => {
                const c = document.createElement('canvas');
                c.width = this.config.canvasWidth;
                c.height = this.config.canvasHeight;
                return c;
            };

            const supported = { webgl: false, webgl2: false };
            const contexts = [];
            const reportByContext = {};

            // Timing: Context probing
            const probeStartTime = performance.now();
            
            // Probe contexts in BrowserLeaks order
            for (const ctxName of CONTEXT_NAMES) {
                const canvas = newCanvas();
                const ctx = this._getContext(canvas, ctxName);
                if (!ctx) continue;

                canvasByContext[ctxName] = canvas;
                contexts.push(ctxName);
                
                // Timing: Parameter collection per context
                const paramStartTime = performance.now();
                reportByContext[ctxName] = this._collectContextReport(ctx, ctxName);
                timing.parameterCollectionMs += Math.round(performance.now() - paramStartTime);

                // Mark support
                if (ctxName === 'webgl2') supported.webgl2 = true;
                if (ctxName === 'webgl' || ctxName === 'moz-webgl' || ctxName === 'webkit-3d') {
                    supported.webgl = true;
                }
            }
            
            timing.contextProbeMs = Math.round(performance.now() - probeStartTime);

            // Timing: Report hash generation
            const hashStartTime = performance.now();
            const reportJson = JSON.stringify(reportByContext);
            const reportHash = md5(reportJson);
            timing.reportHashMs = Math.round(performance.now() - hashStartTime);

            // Generate image hash from first available context
            let imageHash = null;
            let imageError = null;
            let imageDataUrl = null;
            if (contexts.length > 0) {
                const ctx = this._getContext(canvasByContext[contexts[0]], contexts[0]);
                if (ctx) {
                    try {
                        // Timing: Image hash generation (computationally expensive)
                        const imageStartTime = performance.now();
                        const imageResult = this._generateImageHash(ctx);
                        timing.imageHashMs = Math.round(performance.now() - imageStartTime);
                        
                        imageHash = imageResult.hash;
                        imageDataUrl = imageResult.dataUrl;
                    } catch (err) {
                        imageError = err.message;
                    }
                }
            }
            
            // Timing: Calculate total
            timing.totalMs = Math.round(performance.now() - totalStartTime);

            return {
                supported,
                contexts,
                reportByContext,
                reportJson,
                reportHash,
                imageHash,
                imageDataUrl,
                imageError,
                timing
            };

        } catch (error) {
            return {
                error: error.message,
                supported: { webgl: false, webgl2: false },
                contexts: [],
                reportByContext: {},
                reportJson: '{}',
                reportHash: md5('{}'),
                imageHash: null,
                timing: {
                    totalMs: Math.round(performance.now() - totalStartTime),
                    contextProbeMs: 0,
                    parameterCollectionMs: 0,
                    reportHashMs: 0,
                    imageHashMs: 0,
                    error: true
                }
            };
        }
    }

    /**
     * Collect Canvas 2D fingerprint with comprehensive stability and pixel-level analysis
     * 
     * Implements multiple collection methods:
     * 1. toDataURL hashing (standard approach)
     * 2. getImageData pixel hashing (more reliable, bypasses some hooks)
     * 3. Pixel diff statistics (detects farbling vs environment rotation)
     * 4. Cross-method stability comparison (detects selective API hooks)
     * 
     * Key improvements:
     * - Re-renders for stability check (not just double toDataURL)
     * - Pixel-level diff stats: diffPixelsCount, meanAbsDiff, maxAbsDiff, deltaBuckets
     * - Separate stability flags for toDataURL vs getImageData
     * - Hook detection heuristics
     * 
     * @returns {Promise<Object>} Canvas 2D fingerprint data with pixel analysis
     */
    async collectCanvas2DFingerprint() {
        const startTime = performance.now();
        
        try {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { willReadFrequently: true });
            
            if (!context || !canvas.toDataURL) {
                return {
                    supported: false,
                    error: 'canvas-2d-unsupported',
                    timing: { totalMs: Math.round(performance.now() - startTime) }
                };
            }
            
            // Check winding support
            const winding = this._checkWindingSupport(context);
            
            // === TEXT FINGERPRINT WITH FULL ANALYSIS ===
            const textAnalysis = this._collectCanvasRenderAnalysis(
                canvas, context, 
                (c, ctx) => this._renderCanvas2DTextImage(c, ctx),
                'text'
            );
            
            // === GEOMETRY FINGERPRINT WITH FULL ANALYSIS (Original Method) ===
            const geometryAnalysis = this._collectCanvasRenderAnalysis(
                canvas, context,
                (c, ctx) => this._renderCanvas2DGeometryImage(c, ctx),
                'geometry'
            );
            
            // === GEOMETRY FINGERPRINT ENHANCED (New Improved Method) ===
            // Uses improved stability techniques:
            // - Explicit context state reset
            // - Constant TWO_PI instead of Math.PI * 2
            // - Clockwise winding for consistency
            // - Multi-level hashing for noise reduction
            const geometryEnhancedAnalysis = this._collectCanvasRenderAnalysisEnhanced(
                canvas, context,
                (c, ctx) => this._renderCanvas2DGeometryImageEnhanced(c, ctx),
                'geometry-enhanced'
            );
            
            // === HOOK DETECTION HEURISTICS ===
            const hookAnalysis = this._analyzeHookPatterns(textAnalysis, geometryAnalysis);
            
            // === COMBINED HASHES ===
            // Use imageData hash as primary (more reliable)
            const textHash = textAnalysis.imageDataStable 
                ? textAnalysis.imageDataHash1 
                : (textAnalysis.dataUrlStable ? textAnalysis.dataUrlHash1 : 'unstable');
            const geometryHash = geometryAnalysis.imageDataStable
                ? geometryAnalysis.imageDataHash1
                : (geometryAnalysis.dataUrlStable ? geometryAnalysis.dataUrlHash1 : 'unstable');
            
            const combinedHash = md5(`${textHash}|${geometryHash}|${winding}`);
            
            return {
                supported: true,
                winding,
                
                // Text fingerprint
                text: {
                    // Hashes from both methods
                    dataUrlHash: textAnalysis.dataUrlHash1,
                    imageDataHash: textAnalysis.imageDataHash1,
                    simpleHash: textAnalysis.simpleHash1,
                    
                    // Stability flags
                    dataUrlStable: textAnalysis.dataUrlStable,
                    imageDataStable: textAnalysis.imageDataStable,
                    
                    // Pixel diff stats (only if unstable)
                    pixelDiff: textAnalysis.pixelDiff,
                    
                    // Data URL for visual inspection (if stable)
                    dataUrl: textAnalysis.dataUrlStable ? textAnalysis.dataUrl1 : null
                },
                
                // Geometry fingerprint (Original method)
                geometry: {
                    dataUrlHash: geometryAnalysis.dataUrlHash1,
                    imageDataHash: geometryAnalysis.imageDataHash1,
                    simpleHash: geometryAnalysis.simpleHash1,
                    
                    dataUrlStable: geometryAnalysis.dataUrlStable,
                    imageDataStable: geometryAnalysis.imageDataStable,
                    
                    pixelDiff: geometryAnalysis.pixelDiff,
                    
                    dataUrl: geometryAnalysis.dataUrlStable ? geometryAnalysis.dataUrl1 : null
                },
                
                // Geometry fingerprint (Enhanced method with multi-level hashing)
                geometryEnhanced: {
                    // Multi-level hashes for different sensitivity levels
                    hashes: geometryEnhancedAnalysis.hashes,
                    
                    // Primary hash (quantized for stability)
                    imageDataHash: geometryEnhancedAnalysis.imageDataHash,
                    dataUrlHash: geometryEnhancedAnalysis.dataUrlHash,
                    
                    // Stability analysis
                    stability: geometryEnhancedAnalysis.stability,
                    
                    // Rotation detection (multiple hashes from VM tools)
                    rotationDetected: geometryEnhancedAnalysis.rotationDetected,
                    rotationPattern: geometryEnhancedAnalysis.rotationPattern,
                    
                    // Noise injection detection
                    noiseInjectionLikely: geometryEnhancedAnalysis.noiseInjectionLikely,
                    
                    // Data URL for visual inspection
                    dataUrl: geometryEnhancedAnalysis.stability?.full ? geometryEnhancedAnalysis.dataUrl : null,
                    
                    // Render count used for analysis
                    renderCount: geometryEnhancedAnalysis.renderCount
                },
                
                // Hook detection
                hooks: hookAnalysis,
                
                // Legacy compatibility fields
                textStable: textAnalysis.dataUrlStable && textAnalysis.imageDataStable,
                textHash: textHash,
                textImage: textAnalysis.dataUrlStable ? textAnalysis.dataUrl1 : null,
                geometryHash: geometryHash,
                geometryImage: geometryAnalysis.dataUrlStable ? geometryAnalysis.dataUrl1 : null,
                combinedHash,
                
                timing: {
                    totalMs: Math.round(performance.now() - startTime)
                }
            };
            
        } catch (error) {
            return {
                supported: false,
                error: error.message || 'canvas-2d-error',
                timing: { totalMs: Math.round(performance.now() - startTime) }
            };
        }
    }
    
    /**
     * Collect comprehensive render analysis for a canvas operation
     * Renders twice, collects both toDataURL and getImageData, computes diff stats
     * 
     * @private
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} context
     * @param {Function} renderFn - Function that renders to canvas
     * @param {string} label - Label for debugging
     * @returns {Object} Complete analysis including hashes, stability, and diff stats
     */
    _collectCanvasRenderAnalysis(canvas, context, renderFn, label) {
        // === FIRST RENDER ===
        renderFn(canvas, context);
        
        // Force synchronous flush before reading pixels
        // Some browsers have async GPU operations that can cause false instability
        // Reading toDataURL first ensures the canvas is fully rendered
        const dataUrl1 = canvas.toDataURL();
        
        // Now read pixel data (after toDataURL has forced a flush)
        const imageData1 = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixels1 = new Uint8ClampedArray(imageData1.data); // Clone for comparison
        
        const dataUrlHash1 = md5(dataUrl1);
        const imageDataHash1 = hashImageData(imageData1.data);
        const simpleHash1 = simpleHash(dataUrl1);
        
        // === SECOND RENDER (fresh state via renderFn which resizes canvas) ===
        renderFn(canvas, context);
        
        // Same order: toDataURL first to force flush, then getImageData
        const dataUrl2 = canvas.toDataURL();
        const imageData2 = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixels2 = imageData2.data;
        
        const dataUrlHash2 = md5(dataUrl2);
        const imageDataHash2 = hashImageData(pixels2);
        
        // === STABILITY CHECKS ===
        const dataUrlStable = dataUrl1 === dataUrl2;
        const imageDataStable = imageDataHash1 === imageDataHash2;
        
        // === PIXEL DIFF STATS (even if hashes match, for research) ===
        const pixelDiff = computePixelDiffStats(pixels1, pixels2);
        
        // === CROSS-METHOD CONSISTENCY ===
        // If one is stable but not the other, something is hooking selectively
        const methodsConsistent = dataUrlStable === imageDataStable;
        
        return {
            dataUrl1,
            dataUrlHash1,
            dataUrlHash2,
            dataUrlStable,
            
            imageDataHash1,
            imageDataHash2,
            imageDataStable,
            
            simpleHash1,
            
            pixelDiff,
            methodsConsistent,
            
            // Canvas dimensions for reference
            width: canvas.width,
            height: canvas.height,
            
            // Debug info: first few pixels from each render (for troubleshooting)
            _debug: {
                pixels1Sample: Array.from(pixels1.slice(0, 20)),
                pixels2Sample: Array.from(pixels2.slice(0, 20)),
                dataUrlLengths: [dataUrl1.length, dataUrl2.length]
            }
        };
    }
    
    /**
     * Analyze patterns that suggest API hooking
     * 
     * Detection logic:
     * - toDataURL stable but imageData unstable: toDataURL is hooked/cached
     * - imageData stable but toDataURL unstable: getImageData is hooked/cached
     * - Both unstable with different patterns: complex spoofing
     * - Farbling pattern (small bounded deltas): noise injection
     * - Large structural diffs: environment rotation
     * 
     * @private
     * @param {Object} textAnalysis
     * @param {Object} geometryAnalysis
     * @returns {Object} Hook detection results
     */
    _analyzeHookPatterns(textAnalysis, geometryAnalysis) {
        const result = {
            // Per-API hook detection
            getImageDataPatched: false,
            
            // Pattern detection
            farblingDetected: false,
            envRotationDetected: false,
            
            // Confidence and details
            confidence: 'none',
            details: []
        };
        
        // Check text analysis
        if (!textAnalysis.dataUrlStable && textAnalysis.imageDataStable) {
            result.getImageDataPatched = true;
            result.details.push('text: getImageData stable but toDataURL differs');
        }
        
        // Check geometry analysis
        if (!geometryAnalysis.dataUrlStable && geometryAnalysis.imageDataStable) {
            result.getImageDataPatched = true;
            result.details.push('geometry: getImageData stable but toDataURL differs');
        }
        
        // Check for farbling patterns
        if (textAnalysis.pixelDiff?.isFarbling || geometryAnalysis.pixelDiff?.isFarbling) {
            result.farblingDetected = true;
            result.details.push('farbling pattern detected (small bounded deltas)');
        }
        
        // Check for environment rotation
        if (textAnalysis.pixelDiff?.isEnvRotation || geometryAnalysis.pixelDiff?.isEnvRotation) {
            result.envRotationDetected = true;
            result.details.push('environment rotation pattern (large structural diffs)');
        }
        
        // Determine confidence
        if (result.getImageDataPatched) {
            result.confidence = 'high';
        } else if (result.farblingDetected || result.envRotationDetected) {
            result.confidence = 'medium';
        } else if (!textAnalysis.methodsConsistent || !geometryAnalysis.methodsConsistent) {
            result.confidence = 'low';
            result.details.push('method consistency mismatch');
        }
        
        return result;
    }
    
    /**
     * Check canvas winding rule support
     * @private
     * @see https://web.archive.org/web/20170825024655/http://blogs.adobe.com/webplatform/2013/01/30/winding-rules-in-canvas/
     */
    _checkWindingSupport(context) {
        try {
            // Need fresh path for winding test
            context.beginPath();
            context.rect(0, 0, 10, 10);
            context.rect(2, 2, 6, 6);
            return !context.isPointInPath(5, 5, 'evenodd');
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Render Canvas 2D text fingerprint image (Method A - FingerprintJS style)
     * Uses specific fonts, colors, and emoji to maximize cross-platform variance
     * 
     * Key stability practices:
     * - Canvas resize FIRST (auto-clears and ensures clean state)
     * - Explicit textBaseline before any drawing
     * - Built-in fonts only (Times New Roman, Arial) for consistency
     * - Specific rendering order matching FingerprintJS
     * 
     * @private
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} context
     */
    _renderCanvas2DTextImage(canvas, context) {
        // CRITICAL: Resize canvas first (this also clears it completely)
        canvas.width = this.config.canvas2dWidth || 240;
        canvas.height = this.config.canvas2dHeight || 60;
        
        // Set text baseline FIRST before any drawing operations
        context.textBaseline = 'alphabetic';
        
        // 1. Orange background rectangle
        context.fillStyle = '#f60';
        context.fillRect(100, 1, 62, 20);
        
        // 2. Blue text with Times New Roman (built-in font for stability)
        context.fillStyle = '#069';
        context.font = '11pt "Times New Roman"';
        context.fillText(CANVAS_TEXT_STRING, 2, 15);
        
        // 3. Semi-transparent green text with Arial (built-in font)
        context.fillStyle = 'rgba(102, 204, 0, 0.2)';
        context.font = '18pt Arial';
        context.fillText(CANVAS_TEXT_STRING, 4, 45);
    }
    
    /**
     * Render Canvas 2D text fingerprint image (Method B - Alternative style)
     * Uses different positioning and opacity for additional variance detection
     * Includes overlapping text with transparency for blending detection
     * 
     * @private
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} context
     */
    _renderCanvas2DTextImageAlt(canvas, context) {
        // Larger canvas for more rendering area
        canvas.width = 280;
        canvas.height = 60;
        
        // Different baseline approach
        context.textBaseline = 'top';
        context.font = '14px Arial';
        context.textBaseline = 'alphabetic';
        
        // Orange rectangle at different position
        context.fillStyle = '#f60';
        context.fillRect(125, 1, 62, 20);
        
        // Blue text with extended pangram
        context.fillStyle = '#069';
        context.fillText(CANVAS_TEXT_STRING_ALT, 2, 15);
        
        // Semi-transparent overlay (higher opacity for blend detection)
        context.fillStyle = 'rgba(102, 204, 0, 0.7)';
        context.fillText(CANVAS_TEXT_STRING_ALT, 4, 17);
    }
    
    /**
     * Render Canvas 2D geometry fingerprint image (Method A - FingerprintJS style)
     * Uses blending modes and winding rules to detect GPU/driver differences
     * 
     * Key stability practices:
     * - Canvas resize FIRST (auto-clears previous content)
     * - Set globalCompositeOperation BEFORE drawing
     * - Proper beginPath/closePath for each shape
     * 
     * @private
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} context
     */
    _renderCanvas2DGeometryImage(canvas, context) {
        // CRITICAL: Resize canvas first (clears previous content completely)
        canvas.width = 122;
        canvas.height = 110;
        
        // Reset composite operation for clean state
        context.globalCompositeOperation = 'source-over';
        
        // Set blending mode BEFORE any drawing operations
        // Different GPUs/drivers compute blending slightly differently
        context.globalCompositeOperation = 'multiply';
        
        // Draw colored circles with multiply blend
        const circles = [
            ['#f2f', 40, 40], // Magenta
            ['#2ff', 80, 40], // Cyan
            ['#ff2', 60, 80]  // Yellow
        ];
        
        for (const [color, x, y] of circles) {
            context.fillStyle = color;
            context.beginPath();
            context.arc(x, y, 40, 0, Math.PI * 2, true);
            context.closePath();
            context.fill();
        }
        
        // Canvas winding - nested arcs with evenodd fill
        // Tests path winding implementation differences
        context.fillStyle = '#f9c'; // Pink
        context.beginPath();
        context.arc(60, 60, 60, 0, Math.PI * 2, true);
        context.arc(60, 60, 20, 0, Math.PI * 2, true);
        context.fill('evenodd');
    }
    
    /**
     * Render Canvas 2D geometry fingerprint image (ENHANCED - Improved Stability)
     * 
     * This method implements several stability improvements based on research into
     * canvas fingerprinting variance sources. Use this alongside the original method
     * to compare hash stability.
     * 
     * Key improvements over _renderCanvas2DGeometryImage:
     * 1. Explicit clearRect after resize (don't rely on resize behavior alone)
     * 2. Full context state reset (all properties that affect rendering)
     * 3. Constant TWO_PI instead of Math.PI * 2 (avoids floating-point variance)
     * 4. Clockwise winding (false) for cross-renderer consistency
     * 5. Explicit 6-character hex colors (not shorthand)
     * 6. Integer coordinates only
     * 
     * @private
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} context
     */
    _renderCanvas2DGeometryImageEnhanced(canvas, context) {
        // ============================================================
        // STEP 1: Canvas setup with explicit clear
        // ============================================================
        // Set dimensions (this implicitly clears, but we add explicit clear for safety)
        canvas.width = 122;
        canvas.height = 110;
        
        // Explicit clear - don't rely on resize behavior which varies by implementation
        context.clearRect(0, 0, 122, 110);
        
        // ============================================================
        // STEP 2: Reset ALL rendering state to known defaults
        // Some VM tools may leave state from previous operations
        // ============================================================
        
        // Compositing and blending
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = 1.0;
        
        // Colors (will be overwritten, but reset for clean state)
        context.fillStyle = '#000000';
        context.strokeStyle = '#000000';
        
        // Line styles
        context.lineWidth = 1.0;
        context.lineCap = 'butt';
        context.lineJoin = 'miter';
        context.miterLimit = 10;
        context.setLineDash([]);
        context.lineDashOffset = 0;
        
        // Shadows (must be disabled for consistent rendering)
        context.shadowBlur = 0;
        context.shadowColor = 'rgba(0,0,0,0)';
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        
        // Image smoothing (affects anti-aliasing)
        context.imageSmoothingEnabled = true;
        if (context.imageSmoothingQuality !== undefined) {
            context.imageSmoothingQuality = 'low'; // Explicit quality level
        }
        
        // Transform - reset to identity matrix
        context.setTransform(1, 0, 0, 1, 0, 0);
        
        // ============================================================
        // STEP 3: Set blending mode for the geometry test
        // ============================================================
        // Multiply blend mode - different GPUs/drivers compute this slightly differently
        // This is intentional: we want to detect GPU/driver differences
        context.globalCompositeOperation = 'multiply';
        
        // ============================================================
        // STEP 4: Draw geometry with maximum stability settings
        // ============================================================
        // Using:
        // - Integer coordinates only (no sub-pixel positioning)
        // - Explicit 6-char hex colors (not shorthand like #f2f)
        // - Constant TWO_PI (not computed Math.PI * 2)
        // - Clockwise winding (false) - more consistent across renderers
        
        // Circle 1: Magenta at (40, 40)
        context.fillStyle = '#ff22ff';
        context.beginPath();
        context.arc(40, 40, 40, 0, TWO_PI, false);
        context.closePath();
        context.fill();
        
        // Circle 2: Cyan at (80, 40)
        context.fillStyle = '#22ffff';
        context.beginPath();
        context.arc(80, 40, 40, 0, TWO_PI, false);
        context.closePath();
        context.fill();
        
        // Circle 3: Yellow at (60, 80)
        context.fillStyle = '#ffff22';
        context.beginPath();
        context.arc(60, 80, 40, 0, TWO_PI, false);
        context.closePath();
        context.fill();
        
        // ============================================================
        // STEP 5: Winding rule test (evenodd fill)
        // ============================================================
        // Tests path winding implementation - creates a donut shape
        context.fillStyle = '#ff99cc'; // Explicit pink (not shorthand)
        context.beginPath();
        context.arc(60, 60, 60, 0, TWO_PI, false);
        context.arc(60, 60, 20, 0, TWO_PI, false);
        context.fill('evenodd');
    }
    
    /**
     * Collect enhanced render analysis with multi-level hashing and rotation detection
     * 
     * This method provides deeper analysis than _collectCanvasRenderAnalysis by:
     * 1. Rendering 4 times (not 2) to detect session-based rotation patterns
     * 2. Producing multi-level hashes (full, quantized, structural, colorRegion)
     * 3. Detecting if different renders produce different hashes (rotation detection)
     * 4. Identifying noise injection patterns (unstable at full, stable at quantized)
     * 
     * Use this method for research and to compare against the original analysis.
     * 
     * @private
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} context
     * @param {Function} renderFn - Function that renders to canvas
     * @param {string} label - Label for debugging
     * @returns {Object} Enhanced analysis with multi-level hashes and rotation detection
     */
    _collectCanvasRenderAnalysisEnhanced(canvas, context, renderFn, label) {
        // Number of renders to detect rotation patterns
        // VM tools that rotate fingerprints per-session will show multiple unique hashes
        const RENDER_COUNT = 4;
        
        const renders = [];
        
        // ============================================================
        // Collect multiple renders
        // ============================================================
        for (let i = 0; i < RENDER_COUNT; i++) {
            // Render the geometry
            renderFn(canvas, context);
            
            // Force GPU flush by reading toDataURL first
            // This ensures the canvas is fully rendered before reading pixels
            const dataUrl = canvas.toDataURL();
            
            // Read pixel data
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = new Uint8ClampedArray(imageData.data); // Clone for storage
            
            // Compute multi-level hashes
            const multiLevelHashes = hashImageDataMultiLevel(pixels, {
                quantizeBits: 6,
                alphaThreshold: 128,
                colorBucketBits: 4
            });
            
            renders.push({
                dataUrl,
                dataUrlHash: md5(dataUrl),
                pixels,
                hashes: multiLevelHashes
            });
        }
        
        // ============================================================
        // Analyze stability across all renders
        // ============================================================
        const uniqueDataUrls = new Set(renders.map(r => r.dataUrlHash));
        const uniqueFullHashes = new Set(renders.map(r => r.hashes.full));
        const uniqueQuantizedHashes = new Set(renders.map(r => r.hashes.quantized));
        const uniqueStructuralHashes = new Set(renders.map(r => r.hashes.structural));
        const uniqueColorRegionHashes = new Set(renders.map(r => r.hashes.colorRegion));
        
        // Stability at each level
        const stability = {
            full: uniqueFullHashes.size === 1,
            quantized: uniqueQuantizedHashes.size === 1,
            structural: uniqueStructuralHashes.size === 1,
            colorRegion: uniqueColorRegionHashes.size === 1,
            dataUrl: uniqueDataUrls.size === 1,
            
            // Count of unique hashes at each level (1 = stable, >1 = rotation)
            uniqueFullCount: uniqueFullHashes.size,
            uniqueQuantizedCount: uniqueQuantizedHashes.size,
            uniqueStructuralCount: uniqueStructuralHashes.size,
            uniqueColorRegionCount: uniqueColorRegionHashes.size,
            uniqueDataUrlCount: uniqueDataUrls.size
        };
        
        // ============================================================
        // Rotation detection
        // ============================================================
        // VM tools often rotate fingerprints between sessions
        // This manifests as >1 unique hash across renders
        const rotationDetected = uniqueFullHashes.size > 1;
        
        let rotationPattern = null;
        if (rotationDetected) {
            // Build distribution of hashes across renders
            const distribution = {};
            for (const r of renders) {
                const hash = r.hashes.full;
                distribution[hash] = (distribution[hash] || 0) + 1;
            }
            
            rotationPattern = {
                uniqueHashes: Array.from(uniqueFullHashes),
                distribution,
                uniqueCount: uniqueFullHashes.size
            };
        }
        
        // ============================================================
        // Noise injection detection
        // ============================================================
        // If unstable at full precision but stable at quantized level,
        // this indicates noise injection (small LSB modifications)
        const noiseInjectionLikely = !stability.full && stability.quantized;
        
        // ============================================================
        // Compute pixel diff between first two renders (for detailed analysis)
        // ============================================================
        const pixelDiff = computePixelDiffStats(renders[0].pixels, renders[1].pixels);
        
        // ============================================================
        // Return comprehensive analysis
        // ============================================================
        return {
            // Render count for reference
            renderCount: RENDER_COUNT,
            
            // Use first render as canonical values
            dataUrl: renders[0].dataUrl,
            dataUrlHash: renders[0].dataUrlHash,
            imageDataHash: renders[0].hashes.full,
            
            // Multi-level hashes from first render
            hashes: renders[0].hashes,
            
            // Stability analysis
            stability,
            
            // Detection flags
            rotationDetected,
            rotationPattern,
            noiseInjectionLikely,
            
            // Pixel diff stats between first two renders
            pixelDiff,
            
            // Canvas dimensions
            width: canvas.width,
            height: canvas.height,
            
            // All render hashes for research/debugging
            _allRenders: renders.map((r, i) => ({
                renderIndex: i,
                dataUrlHash: r.dataUrlHash,
                hashes: r.hashes
            }))
        };
    }
    
    /**
     * Render Canvas 2D geometry fingerprint image (Method B - Alternative style)
     * Uses different circle positions and RGB colors for additional variance
     * Matches approach used by some bot detection systems
     * 
     * @private
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} context
     */
    _renderCanvas2DGeometryImageAlt(canvas, context) {
        // Different canvas dimensions
        canvas.width = 200;
        canvas.height = 150;
        
        // Reset and set composite operation
        context.globalCompositeOperation = 'source-over';
        context.globalCompositeOperation = 'multiply';
        
        // RGB circles at different positions
        const circles = [
            ['rgb(255,0,255)', 50, 50],  // Magenta
            ['rgb(0,255,255)', 100, 50], // Cyan
            ['rgb(255,255,0)', 75, 100]  // Yellow
        ];
        
        for (const [color, x, y] of circles) {
            context.fillStyle = color;
            context.beginPath();
            context.arc(x, y, 50, 0, Math.PI * 2, true);
            context.closePath();
            context.fill();
        }
    }
    
    /**
     * Collect Canvas 2D fingerprint using alternative rendering methods
     * Provides additional data points for cross-method comparison
     * 
     * @returns {Promise<Object>} Alternative Canvas 2D fingerprint data
     */
    async collectCanvas2DFingerprintAlt() {
        const startTime = performance.now();
        
        try {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { willReadFrequently: true });
            
            if (!context) {
                return {
                    supported: false,
                    error: 'canvas-2d-unsupported',
                    timing: { totalMs: Math.round(performance.now() - startTime) }
                };
            }
            
            // Use alternative rendering methods
            const textAnalysis = this._collectCanvasRenderAnalysis(
                canvas, context,
                (c, ctx) => this._renderCanvas2DTextImageAlt(c, ctx),
                'text-alt'
            );
            
            const geometryAnalysis = this._collectCanvasRenderAnalysis(
                canvas, context,
                (c, ctx) => this._renderCanvas2DGeometryImageAlt(c, ctx),
                'geometry-alt'
            );
            
            return {
                supported: true,
                method: 'alternative',
                
                text: {
                    dataUrlHash: textAnalysis.dataUrlHash1,
                    imageDataHash: textAnalysis.imageDataHash1,
                    dataUrlStable: textAnalysis.dataUrlStable,
                    imageDataStable: textAnalysis.imageDataStable,
                    pixelDiff: textAnalysis.pixelDiff
                },
                
                geometry: {
                    dataUrlHash: geometryAnalysis.dataUrlHash1,
                    imageDataHash: geometryAnalysis.imageDataHash1,
                    dataUrlStable: geometryAnalysis.dataUrlStable,
                    imageDataStable: geometryAnalysis.imageDataStable,
                    pixelDiff: geometryAnalysis.pixelDiff
                },
                
                timing: {
                    totalMs: Math.round(performance.now() - startTime)
                }
            };
            
        } catch (error) {
            return {
                supported: false,
                error: error.message || 'canvas-2d-alt-error',
                timing: { totalMs: Math.round(performance.now() - startTime) }
            };
        }
    }

    /**
     * Get WebGL context with BrowserLeaks options
     * @private
     */
    _getContext(canvas, name) {
        try {
            const ctx = canvas.getContext(name, { failIfMajorPerformanceCaveat: false });
            if (!ctx || ctx.isContextLost()) return null;
            return ctx;
        } catch (e) {
            return null;
        }
    }

    /**
     * Collect comprehensive context report
     * @private
     */
    _collectContextReport(gl, ctxName) {
        const report = {};

        // Collect standard parameters
        for (const paramName of PARAM_ENUM_NAMES) {
            const enumValue = gl[paramName];
            if (enumValue === undefined) continue;

            try {
                const value = gl.getParameter(enumValue);
                if (value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array) {
                    // Convert typed arrays to plain objects for JSON
                    report[paramName] = Object.fromEntries(
                        Array.from(value).map((v, i) => [i, v])
                    );
                } else {
                    report[paramName] = value;
                }
            } catch (e) {
                // Skip parameters that fail
            }
        }

        // Merge context attributes
        try {
            const attrs = gl.getContextAttributes();
            if (attrs) {
                Object.assign(report, attrs);
            }
        } catch (e) {
            // Ignore
        }

        // Add drawingBufferColorSpace and unpackColorSpace
        try {
            if (gl.drawingBufferColorSpace !== undefined) {
                report.drawingBufferColorSpace = gl.drawingBufferColorSpace;
            }
            if (gl.unpackColorSpace !== undefined) {
                report.unpackColorSpace = gl.unpackColorSpace;
            }
        } catch (e) {
            // Ignore
        }

        // UNMASKED_VENDOR_WEBGL and UNMASKED_RENDERER_WEBGL (excluding from hash as they rotate)
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            try {
                report.UNMASKED_RENDERER_WEBGL = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                report.UNMASKED_VENDOR_WEBGL = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            } catch (e) {
                // Ignore
            }
        }

        // Shader precision
        try {
            const vertexPrecision = this._getShaderPrecisionSummary(gl, gl.VERTEX_SHADER);
            const fragmentPrecision = this._getShaderPrecisionSummary(gl, gl.FRAGMENT_SHADER);
            report.VERTEX_SHADER = vertexPrecision;
            report.FRAGMENT_SHADER = fragmentPrecision;

            // HIGH_FLOAT_HIGH_INT format
            const fragHighFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
            const fragHighInt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_INT);
            const floatStr = fragHighFloat && fragHighFloat.precision > 0 ? 'highp' : 'mediump';
            const intStr = fragHighInt && fragHighInt.rangeMax > 0 ? 'highp' : 'mediump';
            report.HIGH_FLOAT_HIGH_INT = `${floatStr}/${intStr}`;
        } catch (e) {
            // Ignore
        }

        // MAX_DRAW_BUFFERS_WEBGL from WEBGL_draw_buffers
        const drawBuffersExt = gl.getExtension('WEBGL_draw_buffers');
        if (drawBuffersExt) {
            try {
                report.MAX_DRAW_BUFFERS_WEBGL = gl.getParameter(drawBuffersExt.MAX_DRAW_BUFFERS_WEBGL);
            } catch (e) {
                // Ignore
            }
        }

        // MAX_TEXTURE_MAX_ANISOTROPY_EXT
        const anisotropyExt = gl.getExtension('EXT_texture_filter_anisotropic') ||
                              gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
                              gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
        if (anisotropyExt) {
            try {
                report.MAX_TEXTURE_MAX_ANISOTROPY_EXT = gl.getParameter(anisotropyExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
            } catch (e) {
                // Ignore
            }
        }

        // Extensions list
        try {
            const extensions = gl.getSupportedExtensions();
            if (extensions) {
                report.extensions = extensions.sort();
            }
        } catch (e) {
            report.extensions = [];
        }

        return report;
    }

    /**
     * Get shader precision summary in format "[-2^min,2^max](precision)"
     * @private
     */
    _getShaderPrecisionSummary(gl, shaderType) {
        try {
            const highFloat = gl.getShaderPrecisionFormat(shaderType, gl.HIGH_FLOAT);
            if (!highFloat) return 'unknown';
            return `[-2^${highFloat.rangeMin},2^${highFloat.rangeMax}](${highFloat.precision})`;
        } catch (e) {
            return 'unknown';
        }
    }

    /**
     * Generate image hash using BrowserLeaks deterministic scene
     * @private
     */
    _generateImageHash(gl) {
        // Set viewport to full drawing buffer
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        // Create and compile vertex shader
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, VERTEX_SHADER_SOURCE);
        gl.compileShader(vs);

        // Create and compile fragment shader
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, FRAGMENT_SHADER_SOURCE);
        gl.compileShader(fs);

        // Create and link program
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.useProgram(prog);

        // Get attribute and uniform locations
        const locPos = gl.getAttribLocation(prog, 'attrVertex');
        const locCol = gl.getAttribLocation(prog, 'attrColor');
        const locXf = gl.getUniformLocation(prog, 'transform');

        // Enable attributes
        gl.enableVertexAttribArray(locPos);
        gl.enableVertexAttribArray(locCol);

        // Set transform matrix
        gl.uniformMatrix4fv(locXf, false, TRANSFORM_MATRIX);

        // Generate geometry (BrowserLeaks arc pattern)
        const geometryData = this._buildArcGeometry();

        // Upload to GPU
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, geometryData, gl.STATIC_DRAW);

        // Set up vertex attributes (stride 24 bytes = 6 floats * 4 bytes)
        gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(locCol, 4, gl.FLOAT, false, 24, 8);

        // Draw
        gl.drawArrays(gl.LINE_STRIP, 0, geometryData.length / 6);

        // Capture canvas as data URL for display
        const dataUrl = gl.canvas.toDataURL();

        // Read pixels
        const w = new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
        gl.readPixels(0, 0, gl.canvas.width, gl.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, w);

        // Convert to string using BrowserLeaks method
        const y = JSON.stringify(w).replace(/,?"[0-9]+":/g, '');

        // Return both MD5 hash and data URL
        return {
            hash: md5(y),
            dataUrl: dataUrl
        };
    }

    /**
     * Build arc geometry matching BrowserLeaks pattern
     * @private
     */
    _buildArcGeometry() {
        const anchor = [-0.25, 0];
        const steps = 128;
        const data = [];

        for (let step = 0; step < steps; step++) {
            // Calculate angles for 270° arc from 45° to 315°
            const angleL = (45 + (step / steps) * 270) / 360 * 2 * Math.PI;
            const angleR = (45 + ((step + 1) / steps) * 270) / 360 * 2 * Math.PI;

            // Push anchor point with color (1, 0.7, 0, 1)
            data.push(anchor[0], anchor[1], 1, 0.7, 0, 1);

            // Push point at angle L with color (2, 1 - step/steps, 0, 1)
            const xL = Math.cos(angleL) * 0.5;
            const yL = Math.sin(angleL) * 0.5;
            data.push(xL, yL, 2, 1 - step / steps, 0, 1);

            // Push point at angle R with color (1, 1 - (step+1)/steps, 0, 1)
            const xR = Math.cos(angleR) * 0.5;
            const yR = Math.sin(angleR) * 0.5;
            data.push(xR, yR, 1, 1 - (step + 1) / steps, 0, 1);
        }

        return new Float32Array(data);
    }

    /**
     * Format metrics for fingerprint display
     * @private
     */
    _formatMetrics(result) {
        const metrics = {};

        // Support status
        metrics.webglSupported = {
            value: result.supported?.webgl || false,
            description: 'WebGL 1.0 support status',
            risk: 'NONE'
        };

        metrics.webgl2Supported = {
            value: result.supported?.webgl2 || false,
            description: 'WebGL 2.0 support status',
            risk: 'NONE'
        };

        // Context names
        metrics.supportedContexts = {
            value: result.contexts?.join(', ') || 'none',
            description: 'Supported WebGL context names',
            risk: 'NONE'
        };

        // Hashes
        metrics.reportHash = {
            value: result.reportHash || 'none',
            description: 'MD5 hash of WebGL parameters report',
            risk: 'NONE'
        };

        metrics.imageHash = {
            value: result.imageHash || 'none',
            description: 'MD5 hash of rendered WebGL scene',
            risk: 'NONE'
        };

        // Image data URL (for display)
        if (result.imageDataUrl) {
            metrics.imageDataUrl = {
                value: result.imageDataUrl,
                description: 'Rendered WebGL scene as data URL',
                risk: 'NONE'
            };
        }

        // Add comprehensive parameters from first context (matching BrowserLeaks categories)
        if (result.reportByContext) {
            const firstCtx = result.contexts?.[0];
            if (firstCtx && result.reportByContext[firstCtx]) {
                const report = result.reportByContext[firstCtx];

                // Basic info
                if (report.VENDOR) {
                    metrics.vendor = {
                        value: report.VENDOR,
                        description: 'WebGL vendor string',
                        risk: 'NONE'
                    };
                }

                if (report.RENDERER) {
                    metrics.renderer = {
                        value: report.RENDERER,
                        description: 'WebGL renderer string',
                        risk: 'NONE'
                    };
                }

                // Unmasked renderer/vendor from WEBGL_debug_renderer_info extension
                if (report.UNMASKED_RENDERER_WEBGL) {
                    metrics.unmaskedRenderer = {
                        value: report.UNMASKED_RENDERER_WEBGL,
                        description: 'Unmasked WebGL renderer (GPU hardware)',
                        risk: 'NONE'
                    };
                }

                if (report.UNMASKED_VENDOR_WEBGL) {
                    metrics.unmaskedVendor = {
                        value: report.UNMASKED_VENDOR_WEBGL,
                        description: 'Unmasked WebGL vendor (GPU manufacturer)',
                        risk: 'NONE'
                    };
                }

                if (report.VERSION) {
                    metrics.version = {
                        value: report.VERSION,
                        description: 'WebGL version string',
                        risk: 'NONE'
                    };
                }

                if (report.SHADING_LANGUAGE_VERSION) {
                    metrics.shadingLanguageVersion = {
                        value: report.SHADING_LANGUAGE_VERSION,
                        description: 'GLSL version string',
                        risk: 'NONE'
                    };
                }

                // Context Attributes (matching BrowserLeaks display)
                if (report.alpha !== undefined) {
                    metrics.alphaBuffer = {
                        value: report.alpha,
                        description: 'Alpha Buffer (Context Attribute)',
                        risk: 'NONE'
                    };
                }

                if (report.depth !== undefined) {
                    metrics.depthBuffer = {
                        value: report.depth,
                        description: 'Depth Buffer (Context Attribute)',
                        risk: 'NONE'
                    };
                }

                if (report.stencil !== undefined) {
                    metrics.stencilBuffer = {
                        value: report.stencil,
                        description: 'Stencil Buffer (Context Attribute)',
                        risk: 'NONE'
                    };
                }

                if (report.antialias !== undefined) {
                    metrics.antiAliasing = {
                        value: report.antialias,
                        description: 'Anti-Aliasing (Context Attribute)',
                        risk: 'NONE'
                    };
                }

                if (report.desynchronized !== undefined) {
                    metrics.desynchronized = {
                        value: report.desynchronized,
                        description: 'Desynchronized (Context Attribute)',
                        risk: 'NONE'
                    };
                }

                if (report.failIfMajorPerformanceCaveat !== undefined) {
                    metrics.performanceCaveat = {
                        value: report.failIfMajorPerformanceCaveat,
                        description: 'Major Performance Caveat (Context Attribute)',
                        risk: 'NONE'
                    };
                }

                if (report.powerPreference !== undefined) {
                    metrics.powerPreference = {
                        value: report.powerPreference,
                        description: 'Power Preference (Context Attribute)',
                        risk: 'NONE'
                    };
                }

                if (report.premultipliedAlpha !== undefined) {
                    metrics.premultipliedAlpha = {
                        value: report.premultipliedAlpha,
                        description: 'Pre-multiplied Alpha (Context Attribute)',
                        risk: 'NONE'
                    };
                }

                if (report.preserveDrawingBuffer !== undefined) {
                    metrics.preserveDrawingBuffer = {
                        value: report.preserveDrawingBuffer,
                        description: 'Preserve Drawing Buffer (Context Attribute)',
                        risk: 'NONE'
                    };
                }

                if (report.xrCompatible !== undefined) {
                    metrics.xrCompatible = {
                        value: report.xrCompatible,
                        description: 'XR Compatible (Context Attribute)',
                        risk: 'NONE'
                    };
                }

                if (report.drawingBufferColorSpace) {
                    metrics.drawingBufferColorSpace = {
                        value: report.drawingBufferColorSpace,
                        description: 'Drawing Buffer Color Space',
                        risk: 'NONE'
                    };
                }

                if (report.unpackColorSpace) {
                    metrics.unpackColorSpace = {
                        value: report.unpackColorSpace,
                        description: 'Unpack Color Space',
                        risk: 'NONE'
                    };
                }

                // Vertex Shader metrics
                if (report.MAX_VERTEX_ATTRIBS !== undefined) {
                    metrics.maxVertexAttribs = {
                        value: report.MAX_VERTEX_ATTRIBS,
                        description: 'Max Vertex Attributes',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_VERTEX_UNIFORM_VECTORS !== undefined) {
                    metrics.maxVertexUniformVectors = {
                        value: report.MAX_VERTEX_UNIFORM_VECTORS,
                        description: 'Max Vertex Uniform Vectors',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_VERTEX_TEXTURE_IMAGE_UNITS !== undefined) {
                    metrics.maxVertexTextureImageUnits = {
                        value: report.MAX_VERTEX_TEXTURE_IMAGE_UNITS,
                        description: 'Max Vertex Texture Image Units',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_VARYING_VECTORS !== undefined) {
                    metrics.maxVaryingVectors = {
                        value: report.MAX_VARYING_VECTORS,
                        description: 'Max Varying Vectors',
                        risk: 'NONE'
                    };
                }

                if (report.VERTEX_SHADER) {
                    metrics.vertexShaderPrecision = {
                        value: report.VERTEX_SHADER,
                        description: 'Vertex Shader Best Float Precision',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_VERTEX_UNIFORM_COMPONENTS !== undefined) {
                    metrics.maxVertexUniformComponents = {
                        value: report.MAX_VERTEX_UNIFORM_COMPONENTS,
                        description: 'Max Vertex Uniform Components',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_VERTEX_UNIFORM_BLOCKS !== undefined) {
                    metrics.maxVertexUniformBlocks = {
                        value: report.MAX_VERTEX_UNIFORM_BLOCKS,
                        description: 'Max Vertex Uniform Blocks',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_VERTEX_OUTPUT_COMPONENTS !== undefined) {
                    metrics.maxVertexOutputComponents = {
                        value: report.MAX_VERTEX_OUTPUT_COMPONENTS,
                        description: 'Max Vertex Output Components',
                        risk: 'NONE'
                    };
                }

                // Fragment Shader metrics
                if (report.MAX_FRAGMENT_UNIFORM_VECTORS !== undefined) {
                    metrics.maxFragmentUniformVectors = {
                        value: report.MAX_FRAGMENT_UNIFORM_VECTORS,
                        description: 'Max Fragment Uniform Vectors',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_TEXTURE_IMAGE_UNITS !== undefined) {
                    metrics.maxTextureImageUnits = {
                        value: report.MAX_TEXTURE_IMAGE_UNITS,
                        description: 'Max Texture Image Units',
                        risk: 'NONE'
                    };
                }

                if (report.HIGH_FLOAT_HIGH_INT) {
                    metrics.fragmentPrecision = {
                        value: report.HIGH_FLOAT_HIGH_INT,
                        description: 'Fragment Shader Float/Int Precision',
                        risk: 'NONE'
                    };
                }

                if (report.FRAGMENT_SHADER) {
                    metrics.fragmentShaderPrecision = {
                        value: report.FRAGMENT_SHADER,
                        description: 'Fragment Shader Best Float Precision',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_FRAGMENT_UNIFORM_COMPONENTS !== undefined) {
                    metrics.maxFragmentUniformComponents = {
                        value: report.MAX_FRAGMENT_UNIFORM_COMPONENTS,
                        description: 'Max Fragment Uniform Components',
                        risk: 'NONE'
                    };
                }

                // Rasterizer
                if (report.ALIASED_LINE_WIDTH_RANGE) {
                    const range = report.ALIASED_LINE_WIDTH_RANGE;
                    metrics.aliasedLineWidthRange = {
                        value: `[${range[0]},${range[1]}]`,
                        description: 'Aliased Line Width Range',
                        risk: 'NONE'
                    };
                }

                if (report.ALIASED_POINT_SIZE_RANGE) {
                    const range = report.ALIASED_POINT_SIZE_RANGE;
                    metrics.aliasedPointSizeRange = {
                        value: `[${range[0]},${range[1]}]`,
                        description: 'Aliased Point Size Range',
                        risk: 'NONE'
                    };
                }

                // Framebuffer
                if (report.MAX_DRAW_BUFFERS !== undefined) {
                    metrics.maxDrawBuffers = {
                        value: report.MAX_DRAW_BUFFERS,
                        description: 'Max Draw Buffers',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_COLOR_ATTACHMENTS !== undefined) {
                    metrics.maxColorAttachments = {
                        value: report.MAX_COLOR_ATTACHMENTS,
                        description: 'Max Color Attachments',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_SAMPLES !== undefined) {
                    metrics.maxSamples = {
                        value: report.MAX_SAMPLES,
                        description: 'Max Samples',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_RENDERBUFFER_SIZE !== undefined) {
                    metrics.maxRenderBufferSize = {
                        value: report.MAX_RENDERBUFFER_SIZE,
                        description: 'Max Render Buffer Size',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_VIEWPORT_DIMS) {
                    const dims = report.MAX_VIEWPORT_DIMS;
                    metrics.maxViewportDims = {
                        value: `[${dims[0]},${dims[1]}]`,
                        description: 'Max Viewport Dimensions',
                        risk: 'NONE'
                    };
                }

                if (report.RED_BITS !== undefined) {
                    metrics.redBits = {
                        value: report.RED_BITS,
                        description: 'Red Bits',
                        risk: 'NONE'
                    };
                }

                if (report.GREEN_BITS !== undefined) {
                    metrics.greenBits = {
                        value: report.GREEN_BITS,
                        description: 'Green Bits',
                        risk: 'NONE'
                    };
                }

                if (report.BLUE_BITS !== undefined) {
                    metrics.blueBits = {
                        value: report.BLUE_BITS,
                        description: 'Blue Bits',
                        risk: 'NONE'
                    };
                }

                if (report.ALPHA_BITS !== undefined) {
                    metrics.alphaBits = {
                        value: report.ALPHA_BITS,
                        description: 'Alpha Bits',
                        risk: 'NONE'
                    };
                }

                if (report.DEPTH_BITS !== undefined) {
                    metrics.depthBits = {
                        value: report.DEPTH_BITS,
                        description: 'Depth Bits',
                        risk: 'NONE'
                    };
                }

                if (report.STENCIL_BITS !== undefined) {
                    metrics.stencilBits = {
                        value: report.STENCIL_BITS,
                        description: 'Stencil Bits',
                        risk: 'NONE'
                    };
                }

                // Textures
                if (report.MAX_TEXTURE_SIZE !== undefined) {
                    metrics.maxTextureSize = {
                        value: report.MAX_TEXTURE_SIZE,
                        description: 'Max Texture Size',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_CUBE_MAP_TEXTURE_SIZE !== undefined) {
                    metrics.maxCubeMapTextureSize = {
                        value: report.MAX_CUBE_MAP_TEXTURE_SIZE,
                        description: 'Max Cube Map Texture Size',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_COMBINED_TEXTURE_IMAGE_UNITS !== undefined) {
                    metrics.maxCombinedTextureImageUnits = {
                        value: report.MAX_COMBINED_TEXTURE_IMAGE_UNITS,
                        description: 'Max Combined Texture Image Units',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_TEXTURE_MAX_ANISOTROPY_EXT !== undefined) {
                    metrics.maxAnisotropy = {
                        value: report.MAX_TEXTURE_MAX_ANISOTROPY_EXT,
                        description: 'Max Anisotropy',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_3D_TEXTURE_SIZE !== undefined) {
                    metrics.max3DTextureSize = {
                        value: report.MAX_3D_TEXTURE_SIZE,
                        description: 'Max 3D Texture Size',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_ARRAY_TEXTURE_LAYERS !== undefined) {
                    metrics.maxArrayTextureLayers = {
                        value: report.MAX_ARRAY_TEXTURE_LAYERS,
                        description: 'Max Array Texture Layers',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_TEXTURE_LOD_BIAS !== undefined) {
                    metrics.maxTextureLodBias = {
                        value: report.MAX_TEXTURE_LOD_BIAS,
                        description: 'Max Texture LOD Bias',
                        risk: 'NONE'
                    };
                }

                // Uniform Buffers
                if (report.MAX_UNIFORM_BUFFER_BINDINGS !== undefined) {
                    metrics.maxUniformBufferBindings = {
                        value: report.MAX_UNIFORM_BUFFER_BINDINGS,
                        description: 'Max Uniform Buffer Bindings',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_UNIFORM_BLOCK_SIZE !== undefined) {
                    metrics.maxUniformBlockSize = {
                        value: report.MAX_UNIFORM_BLOCK_SIZE,
                        description: 'Max Uniform Block Size',
                        risk: 'NONE'
                    };
                }

                if (report.UNIFORM_BUFFER_OFFSET_ALIGNMENT !== undefined) {
                    metrics.uniformBufferOffsetAlignment = {
                        value: report.UNIFORM_BUFFER_OFFSET_ALIGNMENT,
                        description: 'Uniform Buffer Offset Alignment',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_COMBINED_UNIFORM_BLOCKS !== undefined) {
                    metrics.maxCombinedUniformBlocks = {
                        value: report.MAX_COMBINED_UNIFORM_BLOCKS,
                        description: 'Max Combined Uniform Blocks',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS !== undefined) {
                    metrics.maxCombinedVertexUniformComponents = {
                        value: report.MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS,
                        description: 'Max Combined Vertex Uniform Components',
                        risk: 'NONE'
                    };
                }

                if (report.MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS !== undefined) {
                    metrics.maxCombinedFragmentUniformComponents = {
                        value: report.MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS,
                        description: 'Max Combined Fragment Uniform Components',
                        risk: 'NONE'
                    };
                }

                // Extensions - show count AND list
                if (report.extensions && Array.isArray(report.extensions)) {
                    metrics.extensionsCount = {
                        value: report.extensions.length,
                        description: 'Number of supported WebGL extensions',
                        risk: 'NONE'
                    };

                    metrics.extensionsList = {
                        value: report.extensions.join(', '),
                        description: 'Supported WebGL extensions (full list)',
                        risk: 'NONE'
                    };
                }
            }
        }

        // === Canvas 2D Fingerprint Metrics ===
        if (result.canvas2d) {
            const c2d = result.canvas2d;
            
            metrics.canvas2dSupported = {
                value: c2d.supported,
                description: 'Canvas 2D fingerprinting support',
                risk: 'NONE'
            };
            
            if (c2d.supported) {
                metrics.canvas2dWinding = {
                    value: c2d.winding,
                    description: 'Canvas evenodd winding rule support',
                    risk: 'NONE'
                };
                
                // === Text Fingerprint Metrics ===
                if (c2d.text) {
                    metrics.canvas2dTextDataUrlHash = {
                        value: c2d.text.dataUrlHash,
                        description: 'MD5 hash of Canvas 2D text (toDataURL)',
                        risk: 'NONE'
                    };
                    
                    metrics.canvas2dTextImageDataHash = {
                        value: c2d.text.imageDataHash,
                        description: 'MD5 hash of Canvas 2D text (getImageData pixels)',
                        risk: 'NONE'
                    };
                    
                    metrics.canvas2dTextDataUrlStable = {
                        value: c2d.text.dataUrlStable,
                        description: 'Canvas text toDataURL stability across renders',
                        risk: c2d.text.dataUrlStable ? 'NONE' : 'LOW'
                    };
                    
                    metrics.canvas2dTextImageDataStable = {
                        value: c2d.text.imageDataStable,
                        description: 'Canvas text getImageData stability across renders',
                        risk: c2d.text.imageDataStable ? 'NONE' : 'LOW'
                    };
                    
                    // Pixel diff stats for text
                    if (c2d.text.pixelDiff && c2d.text.pixelDiff.diffPixelsCount > 0) {
                        metrics.canvas2dTextDiffPixels = {
                            value: c2d.text.pixelDiff.diffPixelsCount,
                            description: 'Number of differing pixels in text render',
                            risk: 'LOW'
                        };
                        
                        metrics.canvas2dTextMeanAbsDiff = {
                            value: c2d.text.pixelDiff.meanAbsDiff,
                            description: 'Mean absolute pixel diff (text)',
                            risk: 'NONE'
                        };
                        
                        metrics.canvas2dTextMaxAbsDiff = {
                            value: c2d.text.pixelDiff.maxAbsDiff,
                            description: 'Max absolute pixel diff (text)',
                            risk: 'NONE'
                        };
                        
                        metrics.canvas2dTextDeltaBuckets = {
                            value: JSON.stringify(c2d.text.pixelDiff.deltaBuckets),
                            description: 'Delta distribution buckets (text) - farbling detection',
                            risk: 'NONE'
                        };
                    }
                    
                    if (c2d.text.dataUrl) {
                        metrics.canvas2dTextImage = {
                            value: c2d.text.dataUrl,
                            description: 'Canvas 2D text fingerprint image (data URL)',
                            risk: 'NONE'
                        };
                    }
                }
                
                // === Geometry Fingerprint Metrics ===
                if (c2d.geometry) {
                    metrics.canvas2dGeometryDataUrlHash = {
                        value: c2d.geometry.dataUrlHash,
                        description: 'MD5 hash of Canvas 2D geometry (toDataURL)',
                        risk: 'NONE'
                    };
                    
                    metrics.canvas2dGeometryImageDataHash = {
                        value: c2d.geometry.imageDataHash,
                        description: 'MD5 hash of Canvas 2D geometry (getImageData pixels)',
                        risk: 'NONE'
                    };
                    
                    metrics.canvas2dGeometryDataUrlStable = {
                        value: c2d.geometry.dataUrlStable,
                        description: 'Canvas geometry toDataURL stability across renders',
                        risk: c2d.geometry.dataUrlStable ? 'NONE' : 'LOW'
                    };
                    
                    metrics.canvas2dGeometryImageDataStable = {
                        value: c2d.geometry.imageDataStable,
                        description: 'Canvas geometry getImageData stability across renders',
                        risk: c2d.geometry.imageDataStable ? 'NONE' : 'LOW'
                    };
                    
                    // Pixel diff stats for geometry
                    if (c2d.geometry.pixelDiff && c2d.geometry.pixelDiff.diffPixelsCount > 0) {
                        metrics.canvas2dGeometryDiffPixels = {
                            value: c2d.geometry.pixelDiff.diffPixelsCount,
                            description: 'Number of differing pixels in geometry render',
                            risk: 'LOW'
                        };
                        
                        metrics.canvas2dGeometryMeanAbsDiff = {
                            value: c2d.geometry.pixelDiff.meanAbsDiff,
                            description: 'Mean absolute pixel diff (geometry)',
                            risk: 'NONE'
                        };
                        
                        metrics.canvas2dGeometryMaxAbsDiff = {
                            value: c2d.geometry.pixelDiff.maxAbsDiff,
                            description: 'Max absolute pixel diff (geometry)',
                            risk: 'NONE'
                        };
                        
                        metrics.canvas2dGeometryDeltaBuckets = {
                            value: JSON.stringify(c2d.geometry.pixelDiff.deltaBuckets),
                            description: 'Delta distribution buckets (geometry) - farbling detection',
                            risk: 'NONE'
                        };
                    }
                    
                    if (c2d.geometry.dataUrl) {
                        metrics.canvas2dGeometryImage = {
                            value: c2d.geometry.dataUrl,
                            description: 'Canvas 2D geometry fingerprint image (data URL)',
                            risk: 'NONE'
                        };
                    }
                }
                
                // === Geometry Enhanced Fingerprint Metrics (New Improved Method) ===
                if (c2d.geometryEnhanced) {
                    const ge = c2d.geometryEnhanced;
                    
                    // Primary enhanced hash (full precision from improved renderer)
                    metrics.canvas2dGeometryEnhancedImageDataHash = {
                        value: ge.imageDataHash,
                        description: 'MD5 hash of enhanced Canvas 2D geometry (getImageData, full precision)',
                        risk: 'NONE'
                    };
                    
                    // Multi-level hashes for different sensitivity levels
                    if (ge.hashes) {
                        metrics.canvas2dGeometryEnhancedHashFull = {
                            value: ge.hashes.full,
                            description: 'Enhanced geometry hash - full precision (max sensitivity)',
                            risk: 'NONE'
                        };
                        
                        metrics.canvas2dGeometryEnhancedHashQuantized = {
                            value: ge.hashes.quantized,
                            description: 'Enhanced geometry hash - quantized 6-bit (reduced noise)',
                            risk: 'NONE'
                        };
                        
                        metrics.canvas2dGeometryEnhancedHashStructural = {
                            value: ge.hashes.structural,
                            description: 'Enhanced geometry hash - structural (shape only)',
                            risk: 'NONE'
                        };
                        
                        metrics.canvas2dGeometryEnhancedHashColorRegion = {
                            value: ge.hashes.colorRegion,
                            description: 'Enhanced geometry hash - color region (distribution)',
                            risk: 'NONE'
                        };
                    }
                    
                    // Stability metrics
                    if (ge.stability) {
                        metrics.canvas2dGeometryEnhancedStableFull = {
                            value: ge.stability.full,
                            description: 'Enhanced geometry stable at full precision',
                            risk: ge.stability.full ? 'NONE' : 'LOW'
                        };
                        
                        metrics.canvas2dGeometryEnhancedStableQuantized = {
                            value: ge.stability.quantized,
                            description: 'Enhanced geometry stable at quantized level',
                            risk: ge.stability.quantized ? 'NONE' : 'LOW'
                        };
                        
                        metrics.canvas2dGeometryEnhancedUniqueFullCount = {
                            value: ge.stability.uniqueFullCount,
                            description: 'Number of unique full hashes across renders (1=stable)',
                            risk: ge.stability.uniqueFullCount > 1 ? 'MEDIUM' : 'NONE'
                        };
                    }
                    
                    // Rotation detection
                    metrics.canvas2dGeometryEnhancedRotationDetected = {
                        value: ge.rotationDetected,
                        description: 'Canvas fingerprint rotation detected across renders',
                        risk: ge.rotationDetected ? 'HIGH' : 'NONE'
                    };
                    
                    if (ge.rotationPattern) {
                        metrics.canvas2dGeometryEnhancedRotationPattern = {
                            value: JSON.stringify(ge.rotationPattern),
                            description: 'Rotation pattern details (unique hashes and distribution)',
                            risk: 'MEDIUM'
                        };
                    }
                    
                    // Noise injection detection
                    metrics.canvas2dGeometryEnhancedNoiseInjection = {
                        value: ge.noiseInjectionLikely,
                        description: 'Noise injection likely (unstable full, stable quantized)',
                        risk: ge.noiseInjectionLikely ? 'MEDIUM' : 'NONE'
                    };
                    
                    // Render count
                    metrics.canvas2dGeometryEnhancedRenderCount = {
                        value: ge.renderCount,
                        description: 'Number of renders used for stability analysis',
                        risk: 'NONE'
                    };
                    
                    // Data URL for visual inspection
                    if (ge.dataUrl) {
                        metrics.canvas2dGeometryEnhancedImage = {
                            value: ge.dataUrl,
                            description: 'Enhanced Canvas 2D geometry fingerprint image (data URL)',
                            risk: 'NONE'
                        };
                    }
                }
                
                // === Hook Detection Metrics ===
                if (c2d.hooks) {
                    metrics.canvas2dGetImageDataPatched = {
                        value: c2d.hooks.getImageDataPatched,
                        description: 'getImageData appears to be hooked/patched',
                        risk: c2d.hooks.getImageDataPatched ? 'MEDIUM' : 'NONE'
                    };
                    
                    metrics.canvas2dFarblingDetected = {
                        value: c2d.hooks.farblingDetected,
                        description: 'Farbling pattern detected (small bounded noise)',
                        risk: c2d.hooks.farblingDetected ? 'LOW' : 'NONE'
                    };
                    
                    metrics.canvas2dEnvRotationDetected = {
                        value: c2d.hooks.envRotationDetected,
                        description: 'Environment rotation pattern detected',
                        risk: c2d.hooks.envRotationDetected ? 'LOW' : 'NONE'
                    };
                    
                    if (c2d.hooks.details && c2d.hooks.details.length > 0) {
                        metrics.canvas2dHookDetails = {
                            value: c2d.hooks.details.join('; '),
                            description: 'Hook detection details',
                            risk: 'NONE'
                        };
                    }
                }
                
                // === Legacy Combined Hash ===
                metrics.canvas2dCombinedHash = {
                    value: c2d.combinedHash,
                    description: 'Combined Canvas 2D fingerprint hash',
                    risk: 'NONE'
                };
                
                // Legacy stability flag
                metrics.canvas2dTextStable = {
                    value: c2d.textStable,
                    description: 'Canvas text rendering overall stability',
                    risk: c2d.textStable ? 'NONE' : 'LOW'
                };
                
                if (c2d.timing) {
                    metrics.canvas2dCollectionTimeMs = {
                        value: c2d.timing.totalMs,
                        description: 'Canvas 2D fingerprint collection time (ms)',
                        risk: 'N/A'
                    };
                }
            }
            
            if (c2d.error) {
                metrics.canvas2dError = {
                    value: c2d.error,
                    description: 'Canvas 2D fingerprint error',
                    risk: 'LOW'
                };
            }
        }

        // Timing metrics
        if (result.timing) {
            metrics.collectionTimeMs = {
                value: result.timing.totalMs,
                description: 'Total WebGL fingerprint collection time (ms)',
                risk: 'N/A'
            };
            
            metrics.contextProbeTimeMs = {
                value: result.timing.contextProbeMs,
                description: 'Time to probe WebGL contexts (ms)',
                risk: 'N/A'
            };
            
            metrics.parameterCollectionTimeMs = {
                value: result.timing.parameterCollectionMs,
                description: 'Time to collect WebGL parameters (ms)',
                risk: 'N/A'
            };
            
            metrics.reportHashTimeMs = {
                value: result.timing.reportHashMs,
                description: 'Time to generate report MD5 hash (ms)',
                risk: 'N/A'
            };
            
            metrics.imageHashTimeMs = {
                value: result.timing.imageHashMs,
                description: 'Time to render and hash WebGL image (ms)',
                risk: 'N/A'
            };
        }

        // Error handling
        if (result.error) {
            metrics.error = {
                value: result.error,
                description: 'WebGL fingerprint collection error',
                risk: 'HIGH'
            };
        }

        if (result.imageError) {
            metrics.imageError = {
                value: result.imageError,
                description: 'WebGL image hash generation error',
                risk: 'MEDIUM'
            };
        }

        return metrics;
    }

    /**
     * Analyze for suspicious patterns
     * @private
     */
    _analyzeForSuspiciousPatterns(result) {
        this.suspiciousIndicators = [];

        // No WebGL support is suspicious
        if (!result.supported?.webgl && !result.supported?.webgl2) {
            this.suspiciousIndicators.push({
                name: 'no_webgl_support',
                category: 'WebGL',
                description: 'WebGL not supported - rare in modern browsers',
                riskLevel: 'MEDIUM',
                confidence: 0.6,
                importance: 'WEAK',
                value: 'not supported'
            });
        }

        // Check for software renderer patterns
        if (result.reportByContext) {
            for (const [ctxName, report] of Object.entries(result.reportByContext)) {
                if (report.RENDERER && typeof report.RENDERER === 'string') {
                    const renderer = report.RENDERER.toLowerCase();
                    if (renderer.includes('swiftshader') || 
                        renderer.includes('llvmpipe') || 
                        renderer.includes('software')) {
                        this.suspiciousIndicators.push({
                            name: 'software_renderer',
                            category: 'WebGL',
                            description: 'Software WebGL renderer detected (no GPU acceleration)',
                            riskLevel: 'MEDIUM',
                            confidence: 0.7,
                            importance: 'STRONG',
                            value: report.RENDERER
                        });
                    }
                }
            }
        }

        // Failed image hash generation
        if (result.imageError) {
            this.suspiciousIndicators.push({
                name: 'webgl_image_error',
                category: 'WebGL',
                description: 'Failed to generate WebGL image hash',
                riskLevel: 'LOW',
                confidence: 0.4,
                importance: 'WEAK',
                value: result.imageError
            });
        }
        
        // === Canvas 2D Suspicious Patterns ===
        if (result.canvas2d) {
            const c2d = result.canvas2d;
            
            // Canvas 2D not supported is suspicious
            if (!c2d.supported) {
                this.suspiciousIndicators.push({
                    name: 'canvas2d_unsupported',
                    category: 'Canvas2D',
                    description: 'Canvas 2D not supported - very rare in modern browsers',
                    riskLevel: 'MEDIUM',
                    confidence: 0.7,
                    importance: 'STRONG',
                    value: c2d.error || 'unsupported'
                });
            }
            
            // Text rendering unstable (noise injection detected)
            if (c2d.supported && !c2d.textStable) {
                this.suspiciousIndicators.push({
                    name: 'canvas2d_noise_detected',
                    category: 'Canvas2D',
                    description: 'Canvas noise injection detected (anti-fingerprinting mode)',
                    riskLevel: 'LOW',
                    confidence: 0.8,
                    importance: 'WEAK',
                    value: 'text rendering unstable'
                });
            }
            
            // Hook detection indicators
            if (c2d.hooks) {
                if (c2d.hooks.getImageDataPatched) {
                    this.suspiciousIndicators.push({
                        name: 'canvas2d_getImageData_hooked',
                        category: 'Canvas2D',
                        description: 'getImageData appears to be hooked (stable but toDataURL differs)',
                        riskLevel: 'MEDIUM',
                        confidence: 0.85,
                        importance: 'STRONG',
                        value: c2d.hooks.details.join('; ')
                    });
                }
                
                if (c2d.hooks.farblingDetected) {
                    this.suspiciousIndicators.push({
                        name: 'canvas2d_farbling',
                        category: 'Canvas2D',
                        description: 'Farbling pattern detected - small bounded pixel noise (privacy mode)',
                        riskLevel: 'LOW',
                        confidence: 0.75,
                        importance: 'WEAK',
                        value: 'bounded noise injection'
                    });
                }
                
                if (c2d.hooks.envRotationDetected) {
                    this.suspiciousIndicators.push({
                        name: 'canvas2d_env_rotation',
                        category: 'Canvas2D',
                        description: 'Environment rotation pattern - large structural diffs between renders',
                        riskLevel: 'LOW',
                        confidence: 0.6,
                        importance: 'WEAK',
                        value: 'session-based fingerprint rotation'
                    });
                }
            }
            
            // Specific pixel diff patterns
            if (c2d.text?.pixelDiff) {
                const pd = c2d.text.pixelDiff;
                
                // High diff ratio with bounded deltas = farbling
                if (pd.diffRatio > 0.1 && pd.maxAbsDiff <= 6) {
                    this.suspiciousIndicators.push({
                        name: 'canvas2d_text_bounded_noise',
                        category: 'Canvas2D',
                        description: `Text canvas: ${Math.round(pd.diffRatio * 100)}% pixels differ with max delta ${pd.maxAbsDiff}`,
                        riskLevel: 'LOW',
                        confidence: 0.7,
                        importance: 'WEAK',
                        value: `diffRatio=${pd.diffRatio}, maxDelta=${pd.maxAbsDiff}`
                    });
                }
            }
            
            if (c2d.geometry?.pixelDiff) {
                const pd = c2d.geometry.pixelDiff;
                
                if (pd.diffRatio > 0.1 && pd.maxAbsDiff <= 6) {
                    this.suspiciousIndicators.push({
                        name: 'canvas2d_geometry_bounded_noise',
                        category: 'Canvas2D',
                        description: `Geometry canvas: ${Math.round(pd.diffRatio * 100)}% pixels differ with max delta ${pd.maxAbsDiff}`,
                        riskLevel: 'LOW',
                        confidence: 0.7,
                        importance: 'WEAK',
                        value: `diffRatio=${pd.diffRatio}, maxDelta=${pd.maxAbsDiff}`
                    });
                }
            }
        }
    }

    /**
     * Get suspicious indicators
     */
    getSuspiciousIndicators() {
        return this.suspiciousIndicators;
    }

    /**
     * Get metrics
     */
    getMetrics() {
        return this.metrics;
    }
}

// Export
export { WebGLFingerprintDetector };
