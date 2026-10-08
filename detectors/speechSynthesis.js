/**
 * Speech Synthesis Detector Module
 * Detects SpeechSynthesis support and enumerates voices (summary + hash)
 * Inspired by CreepJS src/speech/index.ts
 *
 * @module detectors/speechSynthesis
 * @see https://github.com/abrahamjuliot/creepjs/tree/master/src/speech
 */

import { fnv1a32 } from './audioFingerprint.js';

const SPEECH_CONFIG = {
    voicesTimeoutMs: 600, // CreepJS uses 300ms, but 600ms is safer for slower systems
    voicesWarmupDelayMs: 50
};

// Detect if browser is Blink-based (Chrome, Edge, Opera, Brave)
const IS_BLINK = (() => {
    try {
        return !!window.chrome || (navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Edg/'));
    } catch (e) {
        return false;
    }
})();

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

function normalizeVoice(voice) {
    const name = (voice && voice.name) ? String(voice.name).trim() : '';
    const lang = normalizeLocale(voice && voice.lang);
    const localService = !!(voice && voice.localService);
    const isDefault = !!(voice && voice.default);
    return { name, lang, localService, isDefault };
}

function buildVoiceHash(voices) {
    if (!voices || !voices.length) {
        return fnv1a32('empty');
    }
    const entries = voices.map((voice) => {
        const normalized = normalizeVoice(voice);
        return `${normalized.name}|${normalized.lang || ''}|${normalized.localService ? 1 : 0}`;
    });
    entries.sort();
    return fnv1a32(entries.join('|'));
}

function getUniqueVoices(voices) {
    const voiceURISet = new Set();
    return voices.filter((voice) => {
        const { voiceURI } = voice;
        if (!voiceURISet.has(voiceURI)) {
            voiceURISet.add(voiceURI);
            return true;
        }
        return false;
    });
}

class SpeechSynthesisDetector {
    constructor(config = {}) {
        this.config = { ...SPEECH_CONFIG, ...config };
        this.metrics = {};
        this.result = null;
    }

    async analyze() {
        const result = await this.collect();
        this.result = result;
        this.metrics = this._formatMetrics(result);
        return this.metrics;
    }

    async collect() {
        const supported = typeof window !== 'undefined' && typeof speechSynthesis !== 'undefined';
        if (!supported) {
            return {
                supported: false,
                voices: [],
                voicesCount: 0,
                localVoices: [],
                remoteVoices: [],
                languages: [],
                defaultVoiceName: null,
                defaultVoiceLang: null,
                voiceListHash: fnv1a32('unsupported'),
                voiceLangMismatch: false,
                blockedReason: 'speechSynthesis-unsupported'
            };
        }

        await new Promise((resolve) => setTimeout(resolve, this.config.voicesWarmupDelayMs));

        const safeGetVoices = () => {
            try {
                const voices = speechSynthesis.getVoices();
                return Array.isArray(voices) ? voices : [];
            } catch (error) {
                return { error };
            }
        };

        const initial = safeGetVoices();
        if (initial && initial.error) {
            return {
                supported: true,
                voices: [],
                voicesCount: 0,
                localVoices: [],
                remoteVoices: [],
                languages: [],
                defaultVoiceName: null,
                defaultVoiceLang: null,
                voiceListHash: fnv1a32('error'),
                voiceLangMismatch: false,
                blockedReason: `getVoices-error: ${initial.error.message || 'unknown'}`
            };
        }

        if (initial.length > 0) {
            return this._finalizeVoices(initial, null);
        }

        const voices = await this._waitForVoices();
        if (voices && voices.length > 0) {
            return this._finalizeVoices(voices, null);
        }

        return {
            supported: true,
            voices: [],
            voicesCount: 0,
            localVoices: [],
            remoteVoices: [],
            languages: [],
            defaultVoiceName: null,
            defaultVoiceLang: null,
            voiceListHash: fnv1a32('empty'),
            voiceLangMismatch: false,
            blockedReason: 'voices-empty'
        };
    }

    _waitForVoices() {
        return new Promise((resolve) => {
            let resolved = false;
            const timeout = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve([]);
            }, this.config.voicesTimeoutMs);

            const onVoicesChanged = () => {
                if (resolved) return;
                const voices = speechSynthesis.getVoices();
                if (!voices || !voices.length) {
                    return;
                }
                // CreepJS: In Blink browsers, wait for localService voices to load
                if (IS_BLINK) {
                    const localServiceLoaded = voices.find((v) => v.localService);
                    if (!localServiceLoaded) {
                        return; // Wait for local voices in Blink
                    }
                }
                resolved = true;
                cleanup();
                resolve(voices);
            };

            const cleanup = () => {
                clearTimeout(timeout);
                if (speechSynthesis.removeEventListener) {
                    speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
                } else {
                    speechSynthesis.onvoiceschanged = null;
                }
            };

            if (speechSynthesis.addEventListener) {
                speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
            } else {
                speechSynthesis.onvoiceschanged = onVoicesChanged;
            }
        });
    }

    _finalizeVoices(voices, blockedReason) {
        // CreepJS: Filter by unique voiceURI
        const uniqueVoices = getUniqueVoices(voices);
        
        const normalized = uniqueVoices.map(normalizeVoice);
        const sorted = [...normalized].sort((a, b) => {
            const keyA = `${a.name}|${a.lang || ''}|${a.localService ? 1 : 0}`;
            const keyB = `${b.name}|${b.lang || ''}|${b.localService ? 1 : 0}`;
            return keyA.localeCompare(keyB);
        });

        // Separate local and remote voices (CreepJS method)
        const localVoices = sorted.filter((v) => v.localService).map((v) => v.name);
        const remoteVoices = sorted.filter((v) => !v.localService).map((v) => v.name);
        const languages = [...new Set(sorted.map((v) => v.lang).filter(Boolean))];

        const defaultCandidates = sorted.filter((voice) => voice.isDefault && voice.localService);
        const defaultVoice = defaultCandidates.length === 1 ? defaultCandidates[0] : null;

        // CreepJS: Check for locale/voice mismatch
        let voiceLangMismatch = false;
        if (defaultVoice && defaultVoice.lang) {
            try {
                const { locale: intlLocale } = Intl.DateTimeFormat().resolvedOptions();
                const defaultLangPart = (defaultVoice.lang || '').split('-')[0];
                const intlLocalePart = (intlLocale || '').split('-')[0];
                if (defaultLangPart && intlLocalePart && defaultLangPart !== intlLocalePart) {
                    voiceLangMismatch = true;
                }
            } catch (e) {
                // Intl not available
            }
        }

        return {
            supported: true,
            voices: sorted,
            voicesCount: sorted.length,
            localVoices,
            remoteVoices,
            languages,
            defaultVoiceName: defaultVoice ? defaultVoice.name : null,
            defaultVoiceLang: defaultVoice ? defaultVoice.lang : null,
            voiceListHash: buildVoiceHash(uniqueVoices),
            voiceLangMismatch,
            blockedReason
        };
    }

    _formatMetrics(result) {
        return {
            speechSupported: {
                value: result.supported,
                description: 'SpeechSynthesis API availability',
                risk: result.supported ? 'N/A' : 'LOW'
            },
            speechVoicesCount: {
                value: result.voicesCount,
                description: 'Number of SpeechSynthesis voices available',
                risk: 'N/A'
            },
            speechLocalVoicesCount: {
                value: result.localVoices ? result.localVoices.length : 0,
                description: 'Number of local voices (CreepJS method)',
                risk: 'N/A'
            },
            speechRemoteVoicesCount: {
                value: result.remoteVoices ? result.remoteVoices.length : 0,
                description: 'Number of remote voices (CreepJS method)',
                risk: 'N/A'
            },
            speechLanguagesCount: {
                value: result.languages ? result.languages.length : 0,
                description: 'Number of unique voice languages',
                risk: 'N/A'
            },
            speechDefaultVoiceName: {
                value: result.defaultVoiceName,
                description: 'Default SpeechSynthesis voice name (if available)',
                risk: 'N/A'
            },
            speechDefaultVoiceLang: {
                value: result.defaultVoiceLang,
                description: 'Default SpeechSynthesis voice language (if available)',
                risk: 'N/A'
            },
            speechVoiceLangMismatch: {
                value: result.voiceLangMismatch || false,
                description: 'Whether default voice lang mismatches Intl locale (suspicious)',
                risk: result.voiceLangMismatch ? 'MEDIUM' : 'N/A'
            },
            speechVoiceListHash: {
                value: result.voiceListHash,
                description: 'FNV-1a hash of voice name/lang/localService list',
                risk: 'N/A'
            },
            speechBlockedReason: {
                value: result.blockedReason || 'None',
                description: 'Reason voices are unavailable or blocked',
                risk: 'N/A'
            }
        };
    }
}

export { SpeechSynthesisDetector };
