/**
 * FontDetectorPlugin - Lightweight Font Fingerprinting with Bitfield Encoding
 * 
 * Professional font detection using fastest methods (lengths/domRect).
 * Produces compact bitfield-encoded fingerprints per font category.
 * 
 * Usage:
 *   const detector = new FontDetectorPlugin({ method: 'lengths' });
 *   const result = await detector.detect();
 *   console.log(result.fingerprint.hash, result.categories);
 */

class FontDetectorPlugin {
    constructor(options = {}) {
        this.method = options.method || 'lengths';
        this.testChars = options.testChars || 'mmmmmmmmmmlli';
        this.fontSize = options.fontSize || 256;
        this.baseFonts = ['monospace', 'serif'];

        // Regional Non-Latin Language fonts (Hebrew, CJK, Korean, Hindi, Arabic)
        this.regionalNonLatinFonts = [
            'Gulim', 'GulimChe', 'Dotum', 'DotumChe',
            'MingLiU', 'PMingLiU', 'MingLiU_HKSCS',
            'David', 'Miriam', 'Miriam Fixed', 'FrankRuehl',
            'Gisha', 'Narkisim', 'Levenim MT', 'Rod',
            'SimSun', 'SimHei', 'MS Gothic', 'MS Mincho',
            'Malgun Gothic', 'Batang', 'BatangChe', 'Gungsuh',
            'Mangal', 'Kokila', 'Aparajita', 'Utsaah', 'Latha',
            'Arabic Typesetting', 'Simplified Arabic', 'Traditional Arabic'
        ];

        // Auto1: Cross-platform open source fonts (Google Fonts, Noto, etc.)
        this.auto1Fonts = [
            // Google/Android fonts
            'Roboto', 'Roboto Condensed', 'Roboto Mono', 'Roboto Slab',
            'Open Sans', 'Open Sans Condensed',
            'Noto Sans', 'Noto Serif', 'Noto Mono',
            // DejaVu variants
            'DejaVu Sans', 'DejaVu Sans Condensed', 'DejaVu Sans Mono',
            'DejaVu Serif', 'DejaVu Serif Condensed',
            // Ubuntu
            'Ubuntu', 'Ubuntu Mono', 'Ubuntu Condensed',
            // Noto CJK fonts (indicates Asian language support)
            'Noto Sans CJK HK', 'Noto Sans CJK JP', 'Noto Sans CJK KR',
            'Noto Sans CJK SC', 'Noto Sans CJK TC',
            'Noto Sans Mono CJK JP', 'Noto Sans Mono CJK KR', 'Noto Sans Mono CJK SC',
            'Noto Serif CJK JP', 'Noto Serif CJK KR', 'Noto Serif CJK SC',
            // Indic fonts (indicates Indian language support)
            'Lohit Devanagari', 'Lohit Tamil', 'Lohit Bengali', 'Lohit Gujarati',
            'Samyak Devanagari', 'Samyak Tamil',
            // Other cross-platform
            'Source Sans Pro', 'Source Code Pro', 'Source Serif Pro',
            'Fira Sans', 'Fira Mono', 'Fira Code',
            'Inter', 'Lato', 'Montserrat', 'Poppins'
        ];

        // Platform/OS Core fonts (Windows, macOS, Linux)
        this.platformCoreFonts = [
            // Windows Core
            'Segoe UI', 'Segoe UI Light', 'Segoe UI Semibold', 'Segoe UI Symbol',
            'Calibri', 'Consolas', 'Cambria', 'Candara', 'Corbel',
            'MS Sans Serif', 'MS Serif', 'Marlett',
            'Lucida Sans', 'Lucida Sans Typewriter', 'Lucida Console',
            'Century Gothic', 'Book Antiqua', 'Bookman Old Style',
            'Century Schoolbook', 'Century',
            'MS Reference Sans Serif', 'MS Reference Specialty',
            'Lucida Bright', 'Lucida Fax', 'Lucida Handwriting', 'Lucida Calligraphy',
            'MS Outlook', 'Bookshelf Symbol 7', 'MT Extra', 'ZWAdobeF',
            // macOS Core
            'Helvetica Neue', 'San Francisco', 'SF Pro', 'SF Pro Display',
            'Menlo', 'Monaco', 'Avenir', 'Avenir Next',
            'Futura', 'Optima', 'Gill Sans', 'Baskerville',
            'Hoefler Text', 'Didot', 'American Typewriter',
            // Linux Core
            'Ubuntu', 'Ubuntu Mono', 'DejaVu Sans', 'DejaVu Sans Mono',
            'Liberation Sans', 'Liberation Mono', 'Cantarell',
            'Noto Sans', 'Droid Sans', 'FreeSans', 'Bitstream Vera Sans'
        ];

        // General/Decorative fonts
        this.generalFonts = [
            // High probability common fonts
            'Arial', 'Arial Black', 'Arial Narrow',
            'Times New Roman', 'Courier New', 'Verdana',
            'Georgia', 'Tahoma', 'Trebuchet MS', 'Impact',
            'Comic Sans MS', 'Palatino Linotype', 'Garamond', 'Helvetica',
            // Medium probability
            'Haettenschweiler', 'Gill Sans MT', 'Gill Sans MT Condensed',
            'Perpetua', 'Perpetua Titling MT', 'Rockwell', 'Rockwell Condensed',
            'Tw Cen MT', 'Tw Cen MT Condensed',
            'Bodoni MT', 'Bodoni MT Black', 'Bodoni MT Condensed',
            'Goudy Old Style', 'Calisto MT', 'High Tower Text',
            'Baskerville Old Face', 'Bell MT', 'Centaur', 'Castellar',
            'Copperplate Gothic', 'Copperplate Gothic Light',
            'Engravers MT', 'Felix Titling', 'Elephant', 'Goudy Stout',
            // Lower probability / Decorative
            'Tempus Sans ITC', 'Monotype Corsiva', 'Californian FB',
            'Imprint MT Shadow', 'Bauhaus 93', 'Berlin Sans FB',
            'Broadway', 'Cooper Black', 'Algerian', 'Bernard MT Condensed',
            'Blackadder ITC', 'Bradley Hand ITC', 'Chiller', 'Colonna MT',
            'Curlz MT', 'Edwardian Script ITC', 'Footlight MT Light',
            'Forte', 'Freestyle Script', 'French Script MT', 'Gigi',
            'Harrington', 'Informal Roman', 'Jokerman', 'Juice ITC',
            'Kristen ITC', 'Kunstler Script', 'Magneto', 'Maiandra GD',
            'Matura MT Script Capitals', 'Mistral', 'Modern No. 20',
            'Niagara Engraved', 'Niagara Solid', 'Old English Text MT',
            'Onyx', 'Palace Script MT', 'Papyrus', 'Parchment', 'Playbill',
            'Poor Richard', 'Pristina', 'Ravie', 'Showcard Gothic',
            'Snap ITC', 'Stencil', 'Viner Hand ITC', 'Vivaldi',
            'Vladimir Script', 'Wide Latin'
        ];
    }

    /**
     * Set detection method
     */
    setMethod(method) {
        if (!['lengths', 'domRect'].includes(method)) {
            throw new Error('Method must be "lengths" or "domRect"');
        }
        this.method = method;
        return this;
    }

    // ==================== BITFIELD ENCODING ====================
    
    /**
     * Encode boolean support array to compact base36 bitfield string
     * Each chunk represents 30 bits (safe for Number conversion)
     */
    encodeBitfield(supportArray) {
        const binary = supportArray.map(b => b ? '1' : '0').join('');
        const chunks = [];
        for (let i = 0; i < binary.length; i += 30) {
            const chunk = binary.slice(i, i + 30).padEnd(30, '0');
            chunks.push(parseInt(chunk, 2).toString(36));
        }
        return chunks.join('-');
    }

    /**
     * Decode compact bitfield string back to boolean array
     */
    decodeBitfield(encoded, totalFonts) {
        const chunks = encoded.split('-');
        let binary = '';
        for (const chunk of chunks) {
            binary += parseInt(chunk, 36).toString(2).padStart(30, '0');
        }
        return binary.slice(0, totalFonts).split('').map(bit => bit === '1');
    }

    /**
     * Get font names from encoded bitfield
     */
    getFontsFromBitfield(fontList, encoded) {
        const support = this.decodeBitfield(encoded, fontList.length);
        return fontList.filter((_, i) => support[i]);
    }

    // ==================== HASHING ====================

    /**
     * FNV-1a inspired hash - fast 8-char hex
     */
    hashMini(data) {
        if (!data) return null;
        const json = JSON.stringify(data);
        const hash = json.split('').reduce((h, _, i) => {
            return Math.imul(31, h) + json.charCodeAt(i) | 0;
        }, 0x811c9dc5);
        return ('0000000' + (hash >>> 0).toString(16)).substr(-8);
    }

    /**
     * SHA-256 full hash
     */
    async hashFull(data) {
        const json = JSON.stringify(data);
        const buffer = new TextEncoder().encode(json);
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // ==================== DETECTION CORE ====================

    /**
     * Create measurement span (reusable across categories)
     */
    createMeasureSpan() {
        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;';
        
        const span = document.createElement('span');
        span.style.cssText = `
            font-size:${this.fontSize}px;
            font-style:normal;
            font-weight:normal;
            letter-spacing:normal;
            line-height:normal;
            text-transform:none;
            white-space:nowrap;
            padding:0;
            margin:0;
        `;
        span.textContent = this.testChars;
        container.appendChild(span);
        document.body.appendChild(container);
        
        return { container, span };
    }

    /**
     * Lengths detection - returns boolean array preserving font order
     */
    detectWithLengths(fonts, span) {
        const getDims = () => ({
            sw: span.scrollWidth,
            sh: span.scrollHeight,
            ow: span.offsetWidth,
            oh: span.offsetHeight
        });

        // Measure base fonts
        const baseMeasurements = {};
        for (const base of this.baseFonts) {
            span.style.fontFamily = base;
            baseMeasurements[base] = getDims();
        }

        // Test each font - return boolean array
        return fonts.map(font => {
            for (const base of this.baseFonts) {
                span.style.fontFamily = `'${font}', ${base}`;
                const d = getDims();
                const b = baseMeasurements[base];
                if (d.sw !== b.sw || d.sh !== b.sh || d.ow !== b.ow || d.oh !== b.oh) {
                    return true;
                }
            }
            return false;
        });
    }

    /**
     * DOMRect detection - returns boolean array preserving font order
     */
    detectWithDOMRect(fonts, span) {
        const getDims = () => {
            const rect = span.getBoundingClientRect();
            return { w: Math.round(rect.width), h: Math.round(rect.height) };
        };

        const baseMeasurements = {};
        for (const base of this.baseFonts) {
            span.style.fontFamily = base;
            baseMeasurements[base] = getDims();
        }

        return fonts.map(font => {
            for (const base of this.baseFonts) {
                span.style.fontFamily = `'${font}', ${base}`;
                const d = getDims();
                const b = baseMeasurements[base];
                if (d.w !== b.w || d.h !== b.h) {
                    return true;
                }
            }
            return false;
        });
    }

    // ==================== CATEGORY DETECTION ====================

    /**
     * Detect a single font category - returns structured result with bitfield
     */
    detectCategory(categoryName, fontList, span, method) {
        const start = performance.now();
        
        const supportArray = method === 'lengths'
            ? this.detectWithLengths(fontList, span)
            : this.detectWithDOMRect(fontList, span);
        
        const perfMs = performance.now() - start;
        const supported = fontList.filter((_, i) => supportArray[i]);
        const bitfield = this.encodeBitfield(supportArray);

        return {
            name: categoryName,
            bitfield,
            hash: this.hashMini(supported),
            supported,
            supportedCount: supported.length,
            totalCount: fontList.length,
            performanceMs: parseFloat(perfMs.toFixed(2))
        };
    }

    // ==================== MAIN API ====================

    /**
     * Main detection method - produces JSON with bitfields per category
     */
    async detect() {
        const totalStart = performance.now();
        const { container, span } = this.createMeasureSpan();

        // Detect each category with timing
        const regional = this.detectCategory('regionalNonLatin', this.regionalNonLatinFonts, span, this.method);
        const platform = this.detectCategory('platformCore', this.platformCoreFonts, span, this.method);
        const general = this.detectCategory('general', this.generalFonts, span, this.method);
        const auto1 = this.detectCategory('auto1', this.auto1Fonts, span, this.method);

        container.remove();
        const totalMs = performance.now() - totalStart;

        // Combined fingerprint from all supported fonts (sorted for consistency)
        const allSupported = [
            ...regional.supported,
            ...platform.supported,
            ...general.supported,
            ...auto1.supported
        ].sort();

        const combinedHash = this.hashMini(allSupported);
        const combinedHashFull = await this.hashFull(allSupported);

        // Compact combined bitfield: regional|platform|general|auto1
        const combinedBitfield = `${regional.bitfield}|${platform.bitfield}|${general.bitfield}|${auto1.bitfield}`;

        return {
            method: this.method,
            
            // Combined fingerprint
            fingerprint: {
                hash: combinedHash,
                hashFull: combinedHashFull,
                bitfield: combinedBitfield,
                supportedCount: allSupported.length,
                testedCount: this.regionalNonLatinFonts.length + 
                            this.platformCoreFonts.length + 
                            this.generalFonts.length +
                            this.auto1Fonts.length
            },

            // Per-category results
            categories: {
                regionalNonLatin: {
                    description: 'Hebrew, CJK, Korean, Hindi, Arabic fonts - indicates locale/region',
                    bitfield: regional.bitfield,
                    hash: regional.hash,
                    supported: regional.supported,
                    supportedCount: regional.supportedCount,
                    totalCount: regional.totalCount,
                    performanceMs: regional.performanceMs
                },
                platformCore: {
                    description: 'Windows/macOS/Linux core OS fonts - indicates platform',
                    bitfield: platform.bitfield,
                    hash: platform.hash,
                    supported: platform.supported,
                    supportedCount: platform.supportedCount,
                    totalCount: platform.totalCount,
                    performanceMs: platform.performanceMs
                },
                general: {
                    description: 'Common and decorative fonts - general fingerprinting',
                    bitfield: general.bitfield,
                    hash: general.hash,
                    supported: general.supported,
                    supportedCount: general.supportedCount,
                    totalCount: general.totalCount,
                    performanceMs: general.performanceMs
                },
                auto1: {
                    description: 'Cross-platform open source fonts (Google/Noto/Fira) - indicates modern/dev environment',
                    bitfield: auto1.bitfield,
                    hash: auto1.hash,
                    supported: auto1.supported,
                    supportedCount: auto1.supportedCount,
                    totalCount: auto1.totalCount,
                    performanceMs: auto1.performanceMs
                }
            },

            // Performance breakdown
            performance: {
                method: this.method,
                totalMs: parseFloat(totalMs.toFixed(2)),
                breakdown: {
                    regionalNonLatinMs: regional.performanceMs,
                    platformCoreMs: platform.performanceMs,
                    generalMs: general.performanceMs,
                    auto1Ms: auto1.performanceMs
                }
            },

            timestamp: new Date().toISOString()
        };
    }

    /**
     * Run both methods and compare results
     */
    async detectBoth() {
        const originalMethod = this.method;

        this.method = 'lengths';
        const lengthsResult = await this.detect();

        this.method = 'domRect';
        const domRectResult = await this.detect();

        this.method = originalMethod;

        return {
            lengths: lengthsResult,
            domRect: domRectResult,
            
            comparison: {
                hashesMatch: lengthsResult.fingerprint.hash === domRectResult.fingerprint.hash,
                countsMatch: lengthsResult.fingerprint.supportedCount === domRectResult.fingerprint.supportedCount,
                bitfieldsMatch: lengthsResult.fingerprint.bitfield === domRectResult.fingerprint.bitfield,
                
                performance: {
                    lengthsTotalMs: lengthsResult.performance.totalMs,
                    domRectTotalMs: domRectResult.performance.totalMs,
                    winner: lengthsResult.performance.totalMs < domRectResult.performance.totalMs 
                        ? 'lengths' : 'domRect',
                    difference: Math.abs(
                        lengthsResult.performance.totalMs - domRectResult.performance.totalMs
                    ).toFixed(2) + 'ms'
                }
            },
            
            timestamp: new Date().toISOString()
        };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Decode combined bitfield back to font names (for debugging/verification)
     */
    decodeCombinedBitfield(combinedBitfield) {
        const [regionalBf, platformBf, generalBf, auto1Bf] = combinedBitfield.split('|');
        return {
            regionalNonLatin: this.getFontsFromBitfield(this.regionalNonLatinFonts, regionalBf),
            platformCore: this.getFontsFromBitfield(this.platformCoreFonts, platformBf),
            general: this.getFontsFromBitfield(this.generalFonts, generalBf),
            auto1: auto1Bf ? this.getFontsFromBitfield(this.auto1Fonts, auto1Bf) : []
        };
    }

    /**
     * Get all font lists for reference
     */
    getFontLists() {
        return {
            regionalNonLatin: [...this.regionalNonLatinFonts],
            platformCore: [...this.platformCoreFonts],
            general: [...this.generalFonts],
            auto1: [...this.auto1Fonts],
            totals: {
                regionalNonLatin: this.regionalNonLatinFonts.length,
                platformCore: this.platformCoreFonts.length,
                general: this.generalFonts.length,
                auto1: this.auto1Fonts.length,
                total: this.regionalNonLatinFonts.length + 
                       this.platformCoreFonts.length + 
                       this.generalFonts.length +
                       this.auto1Fonts.length
            }
        };
    }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FontDetectorPlugin;
}
if (typeof window !== 'undefined') {
    window.FontDetectorPlugin = FontDetectorPlugin;
}
