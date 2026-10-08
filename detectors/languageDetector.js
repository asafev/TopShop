/**
 * Language Detector Module
 * Collects and normalizes navigator/Intl/document language signals
 * Inspired by CreepJS src/navigator/index.ts and src/worker/index.ts
 *
 * @module detectors/languageDetector
 * @see https://github.com/abrahamjuliot/creepjs/tree/master/src/navigator
 */

import { fnv1a32 } from './audioFingerprint.js';

function normalizeLocale(locale) {
    if (!locale || typeof locale !== 'string') return null;
    const cleaned = locale.trim().replace(/_/g, '-');
    if (!cleaned) return null;
    const parts = cleaned.split('-').filter(Boolean);
    return parts.map((part, index) => {
        if (index === 0) return part.toLowerCase();
        if (part.length === 4) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        if (part.length === 2 || part.length === 3) return part.toUpperCase();
        return part.toLowerCase();
    }).join('-');
}

function normalizeList(list) {
    if (!Array.isArray(list)) return [];
    const normalized = list.map(normalizeLocale).filter(Boolean);
    return Array.from(new Set(normalized));
}

function buildLanguageHash(languages) {
    const sorted = [...languages].sort();
    return fnv1a32(sorted.join('|'));
}

function getComprehensiveIntlLocales() {
    const constructors = [
        'Collator',
        'DateTimeFormat',
        'DisplayNames',
        'ListFormat',
        'NumberFormat',
        'PluralRules',
        'RelativeTimeFormat'
    ];

    const locales = constructors.reduce((acc, name) => {
        try {
            if (typeof Intl[name] !== 'function') return acc;
            const instance = new Intl[name]();
            const options = instance.resolvedOptions();
            if (options && options.locale) {
                acc.push({ constructor: name, locale: options.locale });
            }
        } catch (e) {
            // Constructor not supported or failed
        }
        return acc;
    }, []);

    return locales;
}

function validateLocaleEntropy(language) {
    if (!language) return { localeEntropyIsTrusty: null, systemCurrencyLocale: null, engineCurrencyLocale: null };

    const lang = ('' + language).split(',')[0];

    // System currency locale (using explicit language)
    let systemCurrencyLocale;
    try {
        systemCurrencyLocale = (1).toLocaleString(lang, {
            style: 'currency',
            currency: 'USD',
            currencyDisplay: 'name',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    } catch (e) {
        systemCurrencyLocale = null;
    }

    // Engine currency locale (using default/undefined)
    let engineCurrencyLocale;
    try {
        engineCurrencyLocale = (1).toLocaleString(undefined, {
            style: 'currency',
            currency: 'USD',
            currencyDisplay: 'name',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    } catch (e) {
        engineCurrencyLocale = null;
    }

    const localeEntropyIsTrusty = engineCurrencyLocale === systemCurrencyLocale;

    return { localeEntropyIsTrusty, systemCurrencyLocale, engineCurrencyLocale };
}

class LanguageDetector {
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
        const navLang = normalizeLocale(navigator.language);
        const navLanguages = normalizeList(navigator.languages);
        
        // Comprehensive Intl locale collection (CreepJS method)
        const intlLocales = getComprehensiveIntlLocales();
        const intlLocaleStrings = intlLocales.map(item => normalizeLocale(item.locale)).filter(Boolean);
        
        const intlLocale = (() => {
            try {
                const resolved = Intl.DateTimeFormat().resolvedOptions();
                return normalizeLocale(resolved && resolved.locale);
            } catch (e) {
                return null;
            }
        })();
        
        const docLang = (() => {
            try {
                return normalizeLocale(document.documentElement && document.documentElement.lang);
            } catch (e) {
                return null;
            }
        })();

        // Locale entropy validation (CreepJS method)
        const localeEntropy = validateLocaleEntropy(navLang);

        // Check if Intl locales match navigator.language
        const intlLocaleSet = new Set(intlLocaleStrings);
        const navLanguageSet = new Set(('' + navLang).split(',').map(normalizeLocale).filter(Boolean));
        const localeIntlEntropyIsTrusty = Array.from(navLanguageSet).some(lang => intlLocaleSet.has(lang));

        const all = new Set([
            ...(navLang ? [navLang] : []),
            ...navLanguages,
            ...intlLocaleStrings,
            ...(intlLocale ? [intlLocale] : []),
            ...(docLang ? [docLang] : [])
        ]);
        const languageSet = Array.from(all).sort();

        return {
            navigatorLanguage: navLang,
            navigatorLanguages: navLanguages,
            intlLocale,
            intlLocales, // Full Intl constructor details
            intlLocaleStrings, // Just the locale strings
            documentLang: docLang,
            languageSet,
            languageSetHash: buildLanguageHash(languageSet),
            localeEntropyIsTrusty: localeEntropy.localeEntropyIsTrusty,
            systemCurrencyLocale: localeEntropy.systemCurrencyLocale,
            engineCurrencyLocale: localeEntropy.engineCurrencyLocale,
            localeIntlEntropyIsTrusty
        };
    }

    _formatMetrics(result) {
        return {
            languagePrimary: {
                value: result.navigatorLanguage,
                description: 'navigator.language (normalized)',
                risk: 'N/A'
            },
            languagesList: {
                value: result.navigatorLanguages,
                description: 'navigator.languages list (normalized)',
                risk: 'N/A'
            },
            intlResolvedLocale: {
                value: result.intlLocale,
                description: 'Intl.DateTimeFormat().resolvedOptions().locale (normalized)',
                risk: 'N/A'
            },
            intlComprehensiveLocales: {
                value: result.intlLocaleStrings.join(', ') || 'None',
                description: 'Locales from 7 Intl constructors (CreepJS method)',
                risk: 'N/A'
            },
            intlConstructorsCount: {
                value: result.intlLocales.length,
                description: 'Number of Intl constructors that provided locale data',
                risk: 'N/A'
            },
            documentLang: {
                value: result.documentLang,
                description: 'document.documentElement.lang (normalized)',
                risk: 'N/A'
            },
            languageSetCount: {
                value: result.languageSet.length,
                description: 'Unique language tags across all sources',
                risk: 'N/A'
            },
            languageSetHash: {
                value: result.languageSetHash,
                description: 'FNV-1a hash of unique language set',
                risk: 'N/A'
            },
            localeEntropyIsTrusty: {
                value: result.localeEntropyIsTrusty === null ? 'Unknown' : result.localeEntropyIsTrusty,
                description: 'Whether locale entropy is trustworthy (currency format match)',
                risk: result.localeEntropyIsTrusty === false ? 'MEDIUM' : 'N/A'
            },
            localeIntlEntropyIsTrusty: {
                value: result.localeIntlEntropyIsTrusty,
                description: 'Whether Intl locales match navigator.language',
                risk: result.localeIntlEntropyIsTrusty === false ? 'MEDIUM' : 'N/A'
            },
            systemCurrencyLocale: {
                value: result.systemCurrencyLocale || 'Not available',
                description: 'Currency format using explicit language',
                risk: 'N/A'
            },
            engineCurrencyLocale: {
                value: result.engineCurrencyLocale || 'Not available',
                description: 'Currency format using default/engine language',
                risk: 'N/A'
            }
        };
    }
}

export { LanguageDetector, normalizeLocale };
