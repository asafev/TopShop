/**
 * Codec Support Detector Module
 * Comprehensive codec detection using HTMLMediaElement.canPlayType,
 * MediaSource.isTypeSupported, and RTCRtpReceiver.getCapabilities
 * 
 * RESEARCH NOTES - Vendor Comparison Analysis:
 * 

 * This implementation combines the best from each:
 * - canPlayType with comprehensive codec list (PX + DD extended)
 * - MediaSource.isTypeSupported for MSE/EME scenarios
 * - RTCRtpReceiver.getCapabilities for WebRTC codec fingerprinting
 * - Maintains individual values AND generates hashes for comparison
 * - Includes support counts and lists for analysis
 * 
 * Codec Categories Tested:
 * - Audio: MP4/AAC, MP3, WebM/Opus, WebM/Vorbis, OGG, WAV, FLAC, AC3
 * - Video: H.264 (AVC), H.265 (HEVC), VP8, VP9, AV1, Theora, 3GPP
 * 
 * @module detectors/codecSupport
 * @see test/perimeterX_deobfuscated/07_fingerprint.js
 * @see test/datadom/deobfuscated/01_constants.js
 * @see test/comparison/COMPREHENSIVE_FINGERPRINT_COMPARISON.md
 */

/**
 * Configuration for codec detection
 * Comprehensive codec list derived from vendor analysis
 */
const CODEC_CONFIG = {
    // Audio codecs to test (consolidated from PX + DD)
    audioCodecs: [
        // MP4 Container / AAC codec family
        { mimeType: 'audio/mp4; codecs="mp4a.40.2"', id: 'mp4_aac_lc', name: 'AAC-LC (MP4)' },
        { mimeType: 'audio/mp4; codecs="mp4a.40.5"', id: 'mp4_aac_he', name: 'HE-AAC (MP4)' },
        { mimeType: 'audio/x-m4a;', id: 'm4a', name: 'M4A' },
        { mimeType: 'audio/mp4;', id: 'mp4_audio', name: 'MP4 Audio' },
        // MP3
        { mimeType: 'audio/mpeg;', id: 'mp3', name: 'MP3' },
        { mimeType: 'audio/mp3;', id: 'mp3_alt', name: 'MP3 (alt)' },
        // WebM / Opus / Vorbis
        { mimeType: 'audio/webm; codecs="opus"', id: 'webm_opus', name: 'Opus (WebM)' },
        { mimeType: 'audio/webm; codecs="vorbis"', id: 'webm_vorbis', name: 'Vorbis (WebM)' },
        { mimeType: 'audio/webm;', id: 'webm_audio', name: 'WebM Audio' },
        // OGG
        { mimeType: 'audio/ogg; codecs="vorbis"', id: 'ogg_vorbis', name: 'Vorbis (OGG)' },
        { mimeType: 'audio/ogg; codecs="opus"', id: 'ogg_opus', name: 'Opus (OGG)' },
        { mimeType: 'audio/ogg;', id: 'ogg_audio', name: 'OGG Audio' },
        // WAV / PCM
        { mimeType: 'audio/wav; codecs="1"', id: 'wav', name: 'WAV PCM' },
        { mimeType: 'audio/wave;', id: 'wave', name: 'WAVE' },
        // FLAC
        { mimeType: 'audio/flac;', id: 'flac', name: 'FLAC' },
        // AC3 / EAC3 (Dolby)
        { mimeType: 'audio/ac3;', id: 'ac3', name: 'AC3 (Dolby Digital)' },
        { mimeType: 'audio/eac3;', id: 'eac3', name: 'E-AC3 (Dolby Digital Plus)' },
        // AAC standalone
        { mimeType: 'audio/aac;', id: 'aac', name: 'AAC' }
    ],

    // Video codecs to test (consolidated from PX + DD)
    videoCodecs: [
        // H.264 / AVC
        { mimeType: 'video/mp4; codecs="avc1.42E01E"', id: 'h264_baseline', name: 'H.264 Baseline' },
        { mimeType: 'video/mp4; codecs="avc1.4D401E"', id: 'h264_main', name: 'H.264 Main' },
        { mimeType: 'video/mp4; codecs="avc1.64001E"', id: 'h264_high', name: 'H.264 High' },
        { mimeType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', id: 'h264_aac', name: 'H.264 + AAC' },
        // H.265 / HEVC
        { mimeType: 'video/mp4; codecs="hvc1.1.6.L93.B0"', id: 'hevc', name: 'HEVC/H.265' },
        { mimeType: 'video/mp4; codecs="hev1.1.6.L93.B0"', id: 'hevc_alt', name: 'HEVC (alt)' },
        // VP8
        { mimeType: 'video/webm; codecs="vp8"', id: 'vp8', name: 'VP8' },
        { mimeType: 'video/webm; codecs="vp8, vorbis"', id: 'vp8_vorbis', name: 'VP8 + Vorbis' },
        // VP9
        { mimeType: 'video/webm; codecs="vp9"', id: 'vp9', name: 'VP9' },
        { mimeType: 'video/webm; codecs="vp09.00.10.08"', id: 'vp9_profile0', name: 'VP9 Profile 0' },
        // AV1 (from DataDome - important for modern browser detection)
        { mimeType: 'video/mp4; codecs="av01.0.08M.08"', id: 'av1_mp4', name: 'AV1 (MP4)' },
        { mimeType: 'video/webm; codecs="av01.0.08M.08"', id: 'av1_webm', name: 'AV1 (WebM)' },
        // OGG / Theora
        { mimeType: 'video/ogg; codecs="theora"', id: 'theora', name: 'Theora' },
        { mimeType: 'video/ogg; codecs="theora, vorbis"', id: 'theora_vorbis', name: 'Theora + Vorbis' },
        // 3GPP (mobile)
        { mimeType: 'video/3gpp;', id: '3gpp', name: '3GPP' },
        { mimeType: 'video/3gpp2;', id: '3gpp2', name: '3GPP2' },
        // WebM generic
        { mimeType: 'video/webm;', id: 'webm_video', name: 'WebM Video' },
        // MP4 generic
        { mimeType: 'video/mp4;', id: 'mp4_video', name: 'MP4 Video' }
    ],

    // MediaSource codecs (for MSE fingerprinting)
    mediaSourceCodecs: [
        // Video with codecs
        { mimeType: 'video/mp4; codecs="avc1.42E01E"', id: 'mse_h264', name: 'MSE H.264' },
        { mimeType: 'video/webm; codecs="vp8"', id: 'mse_vp8', name: 'MSE VP8' },
        { mimeType: 'video/webm; codecs="vp9"', id: 'mse_vp9', name: 'MSE VP9' },
        { mimeType: 'video/mp4; codecs="av01.0.08M.08"', id: 'mse_av1', name: 'MSE AV1' },
        // Audio with codecs
        { mimeType: 'audio/mp4; codecs="mp4a.40.2"', id: 'mse_aac', name: 'MSE AAC' },
        { mimeType: 'audio/webm; codecs="opus"', id: 'mse_opus', name: 'MSE Opus' },
        { mimeType: 'audio/webm; codecs="vorbis"', id: 'mse_vorbis', name: 'MSE Vorbis' }
    ]
};

/**
 * FNV-1a 32-bit hash function (inlined, no dependencies)
 * @param {string} str - String to hash
 * @returns {string} Hex hash string
 */
function fnv1a32(str) {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Codec Support Detector Class
 * Collects comprehensive codec support information
 */
class CodecSupportDetector {
    constructor(config = {}) {
        this.config = { ...CODEC_CONFIG, ...config };
        this.metrics = {};
        this.result = null;
        this.suspiciousIndicators = [];
    }

    /**
     * Analyze codec support and collect all data
     * @returns {Promise<Object>} Codec support metrics
     */
    async analyze() {
        const startTime = performance.now();
        
        const result = {
            canPlayType: this._collectCanPlayTypeSupport(),
            mediaSource: this._collectMediaSourceSupport(),
            rtcCapabilities: await this._collectRTCCapabilities()
        };

        result.collectionTimeMs = Math.round(performance.now() - startTime);
        
        // Generate combined metrics
        this.result = result;
        this.metrics = this._formatMetrics(result);
        
        // Analyze for suspicious patterns
        this._analyzeForSuspiciousPatterns(result);
        
        return this.metrics;
    }

    /**
     * Collect HTMLMediaElement.canPlayType support
     * @private
     * @returns {Object} canPlayType results
     */
    _collectCanPlayTypeSupport() {
        const audio = document.createElement('audio');
        const video = document.createElement('video');
        
        const result = {
            audio: {
                supported: [],
                unsupported: [],
                maybe: [],
                details: {}
            },
            video: {
                supported: [],
                unsupported: [],
                maybe: [],
                details: {}
            },
            apiIntact: true
        };

        // Check API integrity first
        try {
            const audioToString = audio.canPlayType.toString();
            const videoToString = video.canPlayType.toString();
            result.apiIntact = 
                audioToString.indexOf('[native code]') > -1 &&
                videoToString.indexOf('[native code]') > -1;
        } catch (e) {
            result.apiIntact = false;
        }

        // Test audio codecs
        for (const codec of this.config.audioCodecs) {
            try {
                const support = audio.canPlayType(codec.mimeType);
                result.audio.details[codec.id] = support || '';
                
                if (support === 'probably') {
                    result.audio.supported.push(codec.id);
                } else if (support === 'maybe') {
                    result.audio.maybe.push(codec.id);
                } else {
                    result.audio.unsupported.push(codec.id);
                }
            } catch (e) {
                result.audio.details[codec.id] = 'error';
                result.audio.unsupported.push(codec.id);
            }
        }

        // Test video codecs
        for (const codec of this.config.videoCodecs) {
            try {
                const support = video.canPlayType(codec.mimeType);
                result.video.details[codec.id] = support || '';
                
                if (support === 'probably') {
                    result.video.supported.push(codec.id);
                } else if (support === 'maybe') {
                    result.video.maybe.push(codec.id);
                } else {
                    result.video.unsupported.push(codec.id);
                }
            } catch (e) {
                result.video.details[codec.id] = 'error';
                result.video.unsupported.push(codec.id);
            }
        }

        // Calculate counts
        result.audio.supportedCount = result.audio.supported.length;
        result.audio.unsupportedCount = result.audio.unsupported.length;
        result.audio.maybeCount = result.audio.maybe.length;
        result.audio.totalTested = this.config.audioCodecs.length;

        result.video.supportedCount = result.video.supported.length;
        result.video.unsupportedCount = result.video.unsupported.length;
        result.video.maybeCount = result.video.maybe.length;
        result.video.totalTested = this.config.videoCodecs.length;

        // Generate hashes for comparison
        const audioString = Object.entries(result.audio.details)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, v]) => `${k}:${v}`)
            .join('|');
        const videoString = Object.entries(result.video.details)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, v]) => `${k}:${v}`)
            .join('|');

        result.audio.hash = fnv1a32(audioString);
        result.video.hash = fnv1a32(videoString);
        result.combinedHash = fnv1a32(audioString + '||' + videoString);

        return result;
    }

    /**
     * Collect MediaSource.isTypeSupported support
     * @private
     * @returns {Object} MediaSource results
     */
    _collectMediaSourceSupport() {
        const result = {
            available: false,
            supported: [],
            unsupported: [],
            details: {},
            hash: null
        };

        // Check if MediaSource is available
        if (typeof MediaSource === 'undefined') {
            result.hash = fnv1a32('unavailable');
            return result;
        }

        result.available = true;

        // Check API integrity
        try {
            result.apiIntact = MediaSource.isTypeSupported.toString().indexOf('[native code]') > -1;
        } catch (e) {
            result.apiIntact = false;
        }

        // Test MediaSource codecs
        for (const codec of this.config.mediaSourceCodecs) {
            try {
                const support = MediaSource.isTypeSupported(codec.mimeType);
                result.details[codec.id] = support;
                
                if (support) {
                    result.supported.push(codec.id);
                } else {
                    result.unsupported.push(codec.id);
                }
            } catch (e) {
                result.details[codec.id] = 'error';
                result.unsupported.push(codec.id);
            }
        }

        result.supportedCount = result.supported.length;
        result.unsupportedCount = result.unsupported.length;
        result.totalTested = this.config.mediaSourceCodecs.length;

        // Generate hash
        const mseString = Object.entries(result.details)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, v]) => `${k}:${v}`)
            .join('|');
        result.hash = fnv1a32(mseString);

        return result;
    }

    /**
     * Collect RTCRtpReceiver.getCapabilities data
     * Based on PerimeterX implementation
     * @private
     * @returns {Promise<Object>} RTC capabilities
     */
    async _collectRTCCapabilities() {
        const result = {
            available: false,
            audio: null,
            video: null,
            audioCodecs: [],
            videoCodecs: [],
            audioCodecCount: 0,
            videoCodecCount: 0,
            audioHash: null,
            videoHash: null,
            combinedHash: null,
            // Advanced video codec analysis
            videoCodecsLength: 0,
            hasH265: false,
            hasAV1: false,
            vp9Profiles: [],
            vp9ProfileCount: 0,
            h264ProfileCount: 0,
            hasH264High64001f: false,
            codecFamilyCount: 0,
            codecFamilies: []
        };

        try {
            const RTCRtpReceiver = window.RTCRtpReceiver;
            
            if (!RTCRtpReceiver || typeof RTCRtpReceiver.getCapabilities !== 'function') {
                result.audioHash = fnv1a32('unavailable');
                result.videoHash = fnv1a32('unavailable');
                result.combinedHash = fnv1a32('unavailable');
                return result;
            }

            result.available = true;

            // Get audio capabilities
            try {
                const audioCapabilities = RTCRtpReceiver.getCapabilities('audio');
                if (audioCapabilities) {
                    result.audio = audioCapabilities;
                    
                    // Extract codec names for easier analysis
                    if (audioCapabilities.codecs) {
                        result.audioCodecs = audioCapabilities.codecs.map(c => ({
                            mimeType: c.mimeType,
                            clockRate: c.clockRate,
                            channels: c.channels,
                            sdpFmtpLine: c.sdpFmtpLine
                        }));
                        result.audioCodecCount = audioCapabilities.codecs.length;
                    }
                    
                    result.audioHash = fnv1a32(JSON.stringify(audioCapabilities));
                }
            } catch (e) {
                result.audioHash = fnv1a32('error');
            }

            // Get video capabilities
            try {
                const videoCapabilities = RTCRtpReceiver.getCapabilities('video');
                if (videoCapabilities) {
                    result.video = videoCapabilities;
                    
                    // Extract codec names for easier analysis
                    if (videoCapabilities.codecs) {
                        result.videoCodecs = videoCapabilities.codecs.map(c => ({
                            mimeType: c.mimeType,
                            clockRate: c.clockRate,
                            sdpFmtpLine: c.sdpFmtpLine
                        }));
                        result.videoCodecCount = videoCapabilities.codecs.length;
                        result.videoCodecsLength = videoCapabilities.codecs.length;
                        
                        // Advanced codec analysis
                        this._analyzeVideoCodecs(videoCapabilities.codecs, result);
                    }
                    
                    result.videoHash = fnv1a32(JSON.stringify(videoCapabilities));
                }
            } catch (e) {
                result.videoHash = fnv1a32('error');
            }

            // Combined hash
            result.combinedHash = fnv1a32(
                (result.audioHash || '') + '|' + (result.videoHash || '')
            );

        } catch (e) {
            result.audioHash = fnv1a32('error');
            result.videoHash = fnv1a32('error');
            result.combinedHash = fnv1a32('error');
        }

        return result;
    }

    /**
     * Analyze video codecs for detailed fingerprinting
     * Extracts H.265, AV1, VP9 profiles, H.264 profiles, and codec families
     * @private
     * @param {Array} codecs - Array of codec objects from RTCRtpReceiver
     * @param {Object} result - Result object to populate
     */
    _analyzeVideoCodecs(codecs, result) {
        const codecFamilies = new Set();
        const vp9Profiles = new Set();
        let h264ProfileCount = 0;
        
        for (const codec of codecs) {
            const mimeType = (codec.mimeType || '').toLowerCase();
            const sdpFmtpLine = codec.sdpFmtpLine || '';
            
            // Detect H.265/HEVC
            if (mimeType.includes('h265') || mimeType.includes('hevc')) {
                result.hasH265 = true;
                codecFamilies.add('H.265');
            }
            
            // Detect AV1
            if (mimeType.includes('av1') || mimeType === 'video/av1') {
                result.hasAV1 = true;
                codecFamilies.add('AV1');
            }
            
            // Detect and analyze VP9 profiles
            if (mimeType.includes('vp9') || mimeType === 'video/vp9') {
                codecFamilies.add('VP9');
                
                // Extract profile-id from sdpFmtpLine (e.g., "profile-id=0" or "profile-id=2")
                const profileMatch = sdpFmtpLine.match(/profile-id=(\d+)/i);
                if (profileMatch) {
                    vp9Profiles.add(parseInt(profileMatch[1], 10));
                } else {
                    // If no profile specified, assume profile 0 (baseline)
                    vp9Profiles.add(0);
                }
            }
            
            // Detect and analyze VP8
            if (mimeType.includes('vp8') || mimeType === 'video/vp8') {
                codecFamilies.add('VP8');
            }
            
            // Detect and analyze H.264/AVC profiles
            if (mimeType.includes('h264') || mimeType.includes('avc')) {
                codecFamilies.add('H.264');
                h264ProfileCount++;
                
                // Check for specific H.264 High profile (64001f)
                // This is typically in sdpFmtpLine as "profile-level-id=64001f" or similar
                const profileLevelMatch = sdpFmtpLine.match(/profile-level-id=([0-9a-fA-F]+)/i);
                if (profileLevelMatch) {
                    const profileLevelId = profileLevelMatch[1].toLowerCase();
                    // 64001f = High profile, Level 3.1
                    // 640 = High profile prefix
                    if (profileLevelId === '64001f' || profileLevelId.startsWith('64001f')) {
                        result.hasH264High64001f = true;
                    }
                }
            }
            
            // Detect RTX (retransmission)
            if (mimeType.includes('rtx')) {
                codecFamilies.add('RTX');
            }
            
            // Detect RED (redundant encoding)
            if (mimeType.includes('red')) {
                codecFamilies.add('RED');
            }
            
            // Detect ULPFEC (forward error correction)
            if (mimeType.includes('ulpfec')) {
                codecFamilies.add('ULPFEC');
            }
            
            // Detect FlexFEC
            if (mimeType.includes('flexfec')) {
                codecFamilies.add('FlexFEC');
            }
        }
        
        // Store VP9 profiles sorted
        result.vp9Profiles = Array.from(vp9Profiles).sort((a, b) => a - b);
        result.vp9ProfileCount = result.vp9Profiles.length;
        
        // Store H.264 profile count
        result.h264ProfileCount = h264ProfileCount;
        
        // Store codec families
        result.codecFamilies = Array.from(codecFamilies).sort();
        result.codecFamilyCount = codecFamilies.size;
    }

    /**
     * Format results into metrics object
     * Each metric must have { value, description, risk } for UI rendering
     * @private
     * @param {Object} result - Raw collection result
     * @returns {Object} Formatted metrics
     */
    _formatMetrics(result) {
        // Helper to format arrays for display
        const formatList = (arr) => arr && arr.length > 0 ? arr.join(', ') : 'None';
        
        // Calculate master hash
        const masterHash = fnv1a32(
            result.canPlayType.combinedHash + '|' +
            result.mediaSource.hash + '|' +
            result.rtcCapabilities.combinedHash
        );

        const metrics = {
            // === API Availability ===
            canPlayTypeAvailable: {
                value: true,
                description: 'HTMLMediaElement.canPlayType() API availability',
                risk: 'N/A'
            },
            mediaSourceAvailable: {
                value: result.mediaSource.available,
                description: 'MediaSource API availability for MSE streaming',
                risk: result.mediaSource.available ? 'N/A' : 'LOW'
            },
            rtcCapabilitiesAvailable: {
                value: result.rtcCapabilities.available,
                description: 'RTCRtpReceiver.getCapabilities() API availability',
                risk: result.rtcCapabilities.available ? 'N/A' : 'LOW'
            },

            // === API Integrity ===
            canPlayTypeIntact: {
                value: result.canPlayType.apiIntact,
                description: 'canPlayType() native function integrity check',
                risk: result.canPlayType.apiIntact ? 'LOW' : 'HIGH'
            },
            mediaSourceIntact: {
                value: result.mediaSource.apiIntact,
                description: 'MediaSource.isTypeSupported() native function check',
                risk: result.mediaSource.available ? (result.mediaSource.apiIntact ? 'LOW' : 'HIGH') : 'N/A'
            },

            // === Audio Codec Support (canPlayType) ===
            audioSupportedCount: {
                value: result.canPlayType.audio.supportedCount,
                description: `Audio codecs with "probably" support (of ${result.canPlayType.audio.totalTested} tested)`,
                risk: result.canPlayType.audio.supportedCount < 3 ? 'MEDIUM' : 'LOW'
            },
            audioMaybeCount: {
                value: result.canPlayType.audio.maybeCount,
                description: 'Audio codecs with "maybe" support',
                risk: 'N/A'
            },
            audioUnsupportedCount: {
                value: result.canPlayType.audio.unsupportedCount,
                description: 'Audio codecs with no support',
                risk: 'N/A'
            },
            audioSupportedList: {
                value: formatList(result.canPlayType.audio.supported),
                description: 'List of fully supported audio codecs',
                risk: 'N/A'
            },
            audioUnsupportedList: {
                value: formatList(result.canPlayType.audio.unsupported),
                description: 'List of unsupported audio codecs',
                risk: 'N/A'
            },
            audioHash: {
                value: result.canPlayType.audio.hash,
                description: 'FNV-1a hash of audio codec support fingerprint',
                risk: 'N/A'
            },

            // === Video Codec Support (canPlayType) ===
            videoSupportedCount: {
                value: result.canPlayType.video.supportedCount,
                description: `Video codecs with "probably" support (of ${result.canPlayType.video.totalTested} tested)`,
                risk: result.canPlayType.video.supportedCount < 3 ? 'MEDIUM' : 'LOW'
            },
            videoMaybeCount: {
                value: result.canPlayType.video.maybeCount,
                description: 'Video codecs with "maybe" support',
                risk: 'N/A'
            },
            videoUnsupportedCount: {
                value: result.canPlayType.video.unsupportedCount,
                description: 'Video codecs with no support',
                risk: 'N/A'
            },
            videoSupportedList: {
                value: formatList(result.canPlayType.video.supported),
                description: 'List of fully supported video codecs',
                risk: 'N/A'
            },
            videoUnsupportedList: {
                value: formatList(result.canPlayType.video.unsupported),
                description: 'List of unsupported video codecs',
                risk: 'N/A'
            },
            videoHash: {
                value: result.canPlayType.video.hash,
                description: 'FNV-1a hash of video codec support fingerprint',
                risk: 'N/A'
            },

            // === Combined canPlayType ===
            canPlayTypeCombinedHash: {
                value: result.canPlayType.combinedHash,
                description: 'Combined hash of all canPlayType results',
                risk: 'N/A'
            },

            // === MediaSource (MSE) Support ===
            mseSupportedCount: {
                value: result.mediaSource.supportedCount || 0,
                description: `MSE codecs supported (of ${result.mediaSource.totalTested || 0} tested)`,
                risk: 'N/A'
            },
            mseSupportedList: {
                value: formatList(result.mediaSource.supported),
                description: 'MediaSource supported codec list',
                risk: 'N/A'
            },
            mseHash: {
                value: result.mediaSource.hash,
                description: 'FNV-1a hash of MediaSource codec support',
                risk: 'N/A'
            },

            // === RTC Capabilities ===
            rtcAudioCodecCount: {
                value: result.rtcCapabilities.audioCodecCount,
                description: 'Number of WebRTC audio codecs available',
                risk: result.rtcCapabilities.available && result.rtcCapabilities.audioCodecCount === 0 ? 'HIGH' : 'N/A'
            },
            rtcVideoCodecCount: {
                value: result.rtcCapabilities.videoCodecCount,
                description: 'Number of WebRTC video codecs available',
                risk: result.rtcCapabilities.available && result.rtcCapabilities.videoCodecCount === 0 ? 'HIGH' : 'N/A'
            },
            rtcAudioCodecs: {
                value: result.rtcCapabilities.audioCodecs,
                description: 'WebRTC audio codec details (mimeType, clockRate, channels)',
                risk: 'N/A'
            },
            rtcVideoCodecs: {
                value: result.rtcCapabilities.videoCodecs,
                description: 'WebRTC video codec details (mimeType, clockRate)',
                risk: 'N/A'
            },
            rtcAudioHash: {
                value: result.rtcCapabilities.audioHash,
                description: 'Hash of RTC audio capabilities',
                risk: 'N/A'
            },
            rtcVideoHash: {
                value: result.rtcCapabilities.videoHash,
                description: 'Hash of RTC video capabilities',
                risk: 'N/A'
            },
            rtcCombinedHash: {
                value: result.rtcCapabilities.combinedHash,
                description: 'Combined hash of all RTC capabilities',
                risk: 'N/A'
            },

            // === Advanced RTC Video Codec Analysis ===
            rtcVideoCodecsLength: {
                value: result.rtcCapabilities.videoCodecsLength,
                description: 'Total number of RTC video codecs (including profiles)',
                risk: 'N/A'
            },
            rtcHasH265: {
                value: result.rtcCapabilities.hasH265,
                description: 'H.265/HEVC codec support in WebRTC',
                risk: 'N/A'
            },
            rtcHasAV1: {
                value: result.rtcCapabilities.hasAV1,
                description: 'AV1 codec support in WebRTC',
                risk: 'N/A'
            },
            rtcVp9Profiles: {
                value: formatList(result.rtcCapabilities.vp9Profiles.map(p => `Profile ${p}`)),
                description: 'VP9 profiles supported (0=baseline, 2=10-bit)',
                risk: 'N/A'
            },
            rtcVp9ProfileCount: {
                value: result.rtcCapabilities.vp9ProfileCount,
                description: 'Number of VP9 profiles supported',
                risk: 'N/A'
            },
            rtcH264ProfileCount: {
                value: result.rtcCapabilities.h264ProfileCount,
                description: 'Number of H.264/AVC profile entries',
                risk: 'N/A'
            },
            rtcHasH264High64001f: {
                value: result.rtcCapabilities.hasH264High64001f,
                description: 'H.264 High profile Level 3.1 (64001f) support',
                risk: 'N/A'
            },
            rtcCodecFamilies: {
                value: formatList(result.rtcCapabilities.codecFamilies),
                description: 'Unique codec families detected (H.264, VP8, VP9, AV1, etc.)',
                risk: 'N/A'
            },
            rtcCodecFamilyCount: {
                value: result.rtcCapabilities.codecFamilyCount,
                description: 'Number of unique codec families',
                risk: 'N/A'
            },

            // === Master Fingerprint ===
            masterHash: {
                value: masterHash,
                description: 'Master codec fingerprint hash (canPlayType + MSE + RTC)',
                risk: 'N/A'
            },

            // === Summary ===
            totalSupportedCodecs: {
                value: result.canPlayType.audio.supportedCount + 
                       result.canPlayType.video.supportedCount +
                       (result.mediaSource.supportedCount || 0),
                description: 'Total supported codecs across all APIs',
                risk: 'N/A'
            },
            totalTestedCodecs: {
                value: result.canPlayType.audio.totalTested +
                       result.canPlayType.video.totalTested +
                       (result.mediaSource.totalTested || 0),
                description: 'Total codecs tested across all APIs',
                risk: 'N/A'
            },
            collectionTimeMs: {
                value: result.collectionTimeMs,
                description: 'Time to collect all codec data (ms)',
                risk: 'N/A'
            }
        };

        return metrics;
    }

    /**
     * Analyze codec support for suspicious patterns
     * @private
     * @param {Object} result - Collection result
     */
    _analyzeForSuspiciousPatterns(result) {
        this.suspiciousIndicators = [];

        // Check for tampered canPlayType API
        if (!result.canPlayType.apiIntact) {
            this.suspiciousIndicators.push({
                category: 'codec',
                name: 'canPlayType_tampered',
                description: 'HTMLMediaElement.canPlayType appears to be overridden',
                severity: 'HIGH',
                confidence: 0.85,
                details: 'Native function check failed'
            });
        }

        // Check for tampered MediaSource API
        if (result.mediaSource.available && !result.mediaSource.apiIntact) {
            this.suspiciousIndicators.push({
                category: 'codec',
                name: 'mediaSource_tampered',
                description: 'MediaSource.isTypeSupported appears to be overridden',
                severity: 'HIGH',
                confidence: 0.85,
                details: 'Native function check failed'
            });
        }

        // Check for unusually low codec support (headless indicators)
        const totalSupported = result.canPlayType.audio.supportedCount + 
                               result.canPlayType.video.supportedCount;
        if (totalSupported < 5) {
            this.suspiciousIndicators.push({
                category: 'codec',
                name: 'minimal_codec_support',
                description: 'Unusually low number of supported codecs',
                severity: 'MEDIUM',
                confidence: 0.6,
                details: `Only ${totalSupported} codecs supported (expected 10+)`
            });
        }

        // Check for missing basic codecs that all browsers support
        const basicAudioCodecs = ['mp3', 'webm_opus'];
        const basicVideoCodecs = ['h264_baseline', 'vp8'];
        
        const missingBasicAudio = basicAudioCodecs.filter(
            c => !result.canPlayType.audio.supported.includes(c) &&
                 !result.canPlayType.audio.maybe.includes(c)
        );
        const missingBasicVideo = basicVideoCodecs.filter(
            c => !result.canPlayType.video.supported.includes(c) &&
                 !result.canPlayType.video.maybe.includes(c)
        );

        if (missingBasicAudio.length > 0 || missingBasicVideo.length > 0) {
            this.suspiciousIndicators.push({
                category: 'codec',
                name: 'missing_basic_codecs',
                description: 'Basic codecs that all browsers support are missing',
                severity: 'MEDIUM',
                confidence: 0.7,
                details: {
                    missingAudio: missingBasicAudio,
                    missingVideo: missingBasicVideo
                }
            });
        }

        // Check for RTC capabilities mismatch (available but no codecs)
        if (result.rtcCapabilities.available && 
            result.rtcCapabilities.audioCodecCount === 0 &&
            result.rtcCapabilities.videoCodecCount === 0) {
            this.suspiciousIndicators.push({
                category: 'codec',
                name: 'rtc_capabilities_empty',
                description: 'RTCRtpReceiver available but reports no codecs',
                severity: 'HIGH',
                confidence: 0.8,
                details: 'May indicate headless browser or spoofing'
            });
        }

        // Check for MediaSource available but no support
        if (result.mediaSource.available && result.mediaSource.supportedCount === 0) {
            this.suspiciousIndicators.push({
                category: 'codec',
                name: 'mse_no_support',
                description: 'MediaSource available but no codecs supported',
                severity: 'MEDIUM',
                confidence: 0.65,
                details: 'Unusual configuration'
            });
        }
    }

    /**
     * Get suspicious indicators from analysis
     * @returns {Array} List of suspicious indicators
     */
    getSuspiciousIndicators() {
        return this.suspiciousIndicators;
    }

    /**
     * Quick codec hash for lightweight fingerprinting
     * @returns {Promise<string>} Combined codec hash
     */
    async quickHash() {
        const result = await this.analyze();
        // Extract value from the formatted metric object
        return result.masterHash && result.masterHash.value ? result.masterHash.value : result.masterHash;
    }

    /**
     * Get individual codec support status
     * @param {string} mimeType - MIME type to check
     * @returns {Object} Support status
     */
    checkCodec(mimeType) {
        const audio = document.createElement('audio');
        const video = document.createElement('video');
        
        const isAudio = mimeType.startsWith('audio/');
        const element = isAudio ? audio : video;
        
        let canPlayType = '';
        let mediaSource = null;
        
        try {
            canPlayType = element.canPlayType(mimeType);
        } catch (e) {
            canPlayType = 'error';
        }
        
        if (typeof MediaSource !== 'undefined') {
            try {
                mediaSource = MediaSource.isTypeSupported(mimeType);
            } catch (e) {
                mediaSource = 'error';
            }
        }
        
        return {
            mimeType,
            canPlayType,
            mediaSource,
            supported: canPlayType === 'probably' || canPlayType === 'maybe'
        };
    }

    /**
     * Compare two codec fingerprints for similarity
     * Works with the formatted metrics structure { value, description, risk }
     * @param {Object} fp1 - First fingerprint
     * @param {Object} fp2 - Second fingerprint
     * @returns {Object} Comparison result
     */
    static compare(fp1, fp2) {
        if (!fp1 || !fp2) {
            return { match: false, reason: 'Invalid fingerprints' };
        }

        // Helper to extract value from metric object
        const getValue = (metric) => metric && typeof metric === 'object' && 'value' in metric ? metric.value : metric;

        const masterMatch = getValue(fp1.masterHash) === getValue(fp2.masterHash);
        const canPlayTypeMatch = getValue(fp1.canPlayTypeCombinedHash) === getValue(fp2.canPlayTypeCombinedHash);
        const mseMatch = getValue(fp1.mseHash) === getValue(fp2.mseHash);
        const rtcMatch = getValue(fp1.rtcCombinedHash) === getValue(fp2.rtcCombinedHash);

        // Calculate similarity score
        let similarityScore = 0;
        let totalChecks = 0;

        // Get supported lists (need to parse from string if formatted)
        const getListValue = (metric) => {
            const val = getValue(metric);
            if (Array.isArray(val)) return val;
            if (typeof val === 'string' && val !== 'None') return val.split(', ');
            return [];
        };

        // Compare audio codec support
        const audioList1 = getListValue(fp1.audioSupportedList);
        const audioList2 = getListValue(fp2.audioSupportedList);
        const audioOverlap = audioList1.filter(c => audioList2.includes(c)).length;
        const audioUnion = new Set([...audioList1, ...audioList2]).size;
        if (audioUnion > 0) {
            similarityScore += audioOverlap / audioUnion;
            totalChecks++;
        }

        // Compare video codec support
        const videoList1 = getListValue(fp1.videoSupportedList);
        const videoList2 = getListValue(fp2.videoSupportedList);
        const videoOverlap = videoList1.filter(c => videoList2.includes(c)).length;
        const videoUnion = new Set([...videoList1, ...videoList2]).size;
        if (videoUnion > 0) {
            similarityScore += videoOverlap / videoUnion;
            totalChecks++;
        }

        // Compare MSE codec support
        const mseList1 = getListValue(fp1.mseSupportedList);
        const mseList2 = getListValue(fp2.mseSupportedList);
        const mseOverlap = mseList1.filter(c => mseList2.includes(c)).length;
        const mseUnion = new Set([...mseList1, ...mseList2]).size;
        if (mseUnion > 0) {
            similarityScore += mseOverlap / mseUnion;
            totalChecks++;
        }

        const similarity = totalChecks > 0 ? similarityScore / totalChecks : 0;

        return {
            match: masterMatch,
            similarity: Math.round(similarity * 100) / 100,
            hashMatch: {
                master: masterMatch,
                canPlayType: canPlayTypeMatch,
                mediaSource: mseMatch,
                rtcCapabilities: rtcMatch
            },
            countDiff: {
                audioSupported: Math.abs(getValue(fp1.audioSupportedCount) - getValue(fp2.audioSupportedCount)),
                videoSupported: Math.abs(getValue(fp1.videoSupportedCount) - getValue(fp2.videoSupportedCount)),
                mseSupported: Math.abs(getValue(fp1.mseSupportedCount) - getValue(fp2.mseSupportedCount)),
                rtcAudio: Math.abs(getValue(fp1.rtcAudioCodecCount) - getValue(fp2.rtcAudioCodecCount)),
                rtcVideo: Math.abs(getValue(fp1.rtcVideoCodecCount) - getValue(fp2.rtcVideoCodecCount))
            }
        };
    }
}

export { CodecSupportDetector, CODEC_CONFIG, fnv1a32 };
