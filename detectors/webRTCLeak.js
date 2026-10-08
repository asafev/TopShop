import { log as _log } from '../utils/log.js';
/**
 * WebRTC SDP Detector Module
 * Collects WebRTC SDP (Session Description Protocol) for fingerprinting
 * Extended with CreepJS-style media capabilities and SDP codec analysis
 * 
 * @module detectors/webRTCLeak
 * @see https://browserleaks.com/webrtc
 * @see https://github.com/AbrahamJuliot/creepjs - Media Capabilities & SDP parsing
 */

/**
 * Configuration for WebRTC SDP detection
 */
const WEBRTC_CONFIG = {
    // Maximum SDP length to store (40KB)
    maxSdpLength: 40000,
    // Media capabilities test configuration ()
    mediaCapabilities: {
        video: {
            width: 1920,
            height: 1080,
            bitrate: 120000,
            framerate: 60
        },
        audio: {
            channels: 2,
            bitrate: 300000,
            samplerate: 5200
        },
        // Comprehensive codec list for fingerprinting
        codecs: [
            // Audio codecs
            'audio/ogg; codecs=vorbis',
            'audio/ogg; codecs=flac',
            'audio/ogg; codecs=opus',
            'audio/mp4; codecs="mp4a.40.2"',  // AAC-LC
            'audio/mp4; codecs="mp4a.40.5"',  // HE-AAC
            'audio/mp4; codecs="mp4a.40.29"', // HE-AACv2
            'audio/mp4; codecs="mp4a.67"',    // AAC-LC (MPEG-2)
            'audio/mpeg; codecs="mp3"',
            'audio/webm; codecs=opus',
            'audio/webm; codecs=vorbis',
            'audio/wav; codecs="1"',          // PCM
            'audio/flac',
            // Video codecs
            'video/ogg; codecs="theora"',
            'video/mp4; codecs="avc1.42E01E"',  // H.264 Baseline
            'video/mp4; codecs="avc1.4D401E"',  // H.264 Main
            'video/mp4; codecs="avc1.64001E"',  // H.264 High
            'video/mp4; codecs="hvc1.1.6.L93.B0"', // HEVC/H.265
            'video/mp4; codecs="hev1.1.6.L93.B0"', // HEVC alternate
            'video/mp4; codecs="av01.0.00M.08"',   // AV1
            'video/mp4; codecs="vp09.00.10.08"',   // VP9
            'video/webm; codecs="vp8"',
            'video/webm; codecs="vp9"',
            'video/webm; codecs="av1"',
            'video/webm; codecs="vp09.00.10.08"'
        ]
    }
};

/**
 * FNV-1a 32-bit hash function (inlined, no dependencies)
 * Same implementation as audioFingerprint.js for consistency
 * @param {string} str - String to hash
 * @returns {string} Hex hash string
 */
function fnv1a32(str) {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        // FNV prime: 16777619
        hash = Math.imul(hash, 16777619);
    }
    // Convert to unsigned 32-bit and then to hex
    return (hash >>> 0).toString(16).padStart(8, '0');
}

// ============================================================================
//INSPIRED MEDIA CAPABILITIES & SDP ANALYSIS
// 
// ============================================================================

/**
 * Build media configuration for decodingInfo API
 * @param {string} codec - Codec string (e.g., 'video/mp4; codecs="avc1.42E01E"')
 * @param {Object} video - Video configuration
 * @param {Object} audio - Audio configuration
 * @returns {Object} MediaDecodingConfiguration
 */
function getMediaConfig(codec, video, audio) {
    return {
        type: 'file',
        video: !/^video/.test(codec) ? undefined : {
            contentType: codec,
            ...video
        },
        audio: !/^audio/.test(codec) ? undefined : {
            contentType: codec,
            ...audio
        }
    };
}

/**
 * Collect media capabilities using MediaCapabilities API
 * Reveals codec support patterns unique to browser/platform combinations
 * @param {Object} config - Configuration with video, audio, and codecs
 * @returns {Promise<Object>} Supported codecs with smooth/powerEfficient flags
 */
async function getMediaCapabilities({ video, audio, codecs }) {
    if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.decodingInfo) {
        return { error: 'MediaCapabilities API not available', supported: false };
    }
    
    const startTime = performance.now();
    const results = {};
    const errors = [];
    
    const decodingPromises = codecs.map(async (codec) => {
        try {
            const config = getMediaConfig(codec, video, audio);
            const support = await navigator.mediaCapabilities.decodingInfo(config);
            return { codec, ...support };
        } catch (error) {
            errors.push({ codec, error: error.message });
            return { codec, supported: false, error: error.message };
        }
    });
    
    const allResults = await Promise.all(decodingPromises);
    
    // Build capability map
    const capabilities = allResults.reduce((acc, result) => {
        const { codec, supported, smooth, powerEfficient, error } = result || {};
        if (!supported) {
            return acc;
        }
        return {
            ...acc,
            [codec]: {
                smooth: !!smooth,
                powerEfficient: !!powerEfficient,
                flags: [
                    ...(smooth ? ['smooth'] : []),
                    ...(powerEfficient ? ['efficient'] : [])
                ].join(',') || 'basic'
            }
        };
    }, {});
    
    return {
        supported: true,
        capabilities,
        supportedCount: Object.keys(capabilities).length,
        testedCount: codecs.length,
        errors: errors.length > 0 ? errors : undefined,
        durationMs: Math.round(performance.now() - startTime)
    };
}

/**
 * Extract RTP header extensions from SDP
 * Extensions reveal browser-specific WebRTC implementation details
 * @param {string} sdp - Session Description Protocol string
 * @returns {string[]} Sorted unique extension URIs
 */
function getExtensionsFromSDP(sdp) {
    if (!sdp) return [];
    const extensions = (('' + sdp).match(/extmap:\d+ [^\n|\r]+/g) || [])
        .map(x => x.replace(/extmap:[^\s]+ /, ''));
    return [...new Set(extensions)].sort();
}

/**
 * Counter utility for RTX codec deduplication
 */
function createRtxCounter() {
    let counter = 0;
    return {
        increment: () => counter += 1,
        getValue: () => counter
    };
}

/**
 * Construct codec descriptions from SDP
 * Parses rtpmap, fmtp, and rtcp-fb lines for detailed codec information
 * @param {Object} params - Parameters for construction
 * @returns {Array} Array of codec description objects
 */
function constructCodecDescriptions({ mediaType, sdp, sdpDescriptors, rtxCounter }) {
    if (!sdpDescriptors || !('' + sdpDescriptors)) {
        return [];
    }
    
    return sdpDescriptors.reduce((descriptionAcc, descriptor) => {
        const matcher = `(rtpmap|fmtp|rtcp-fb):${descriptor} (.+)`;
        const formats = (sdp.match(new RegExp(matcher, 'g')) || []);
        
        if (!('' + formats)) {
            return descriptionAcc;
        }
        
        const isRtxCodec = ('' + formats).includes(' rtx/');
        if (isRtxCodec) {
            if (rtxCounter.getValue()) {
                return descriptionAcc;
            }
            rtxCounter.increment();
        }
        
        const getLineData = x => x.replace(/[^\s]+ /, '');
        
        const description = formats.reduce((acc, x) => {
            const rawData = getLineData(x);
            const data = rawData.split('/');
            const codec = data[0];
            const desc = {};
            
            if (x.includes('rtpmap')) {
                if (mediaType === 'audio') {
                    desc.channels = (+data[2]) || 1;
                }
                desc.mimeType = `${mediaType}/${codec}`;
                desc.clockRates = [+data[1]];
                return { ...acc, ...desc };
            } else if (x.includes('rtcp-fb')) {
                return {
                    ...acc,
                    feedbackSupport: [...(acc.feedbackSupport || []), rawData]
                };
            } else if (isRtxCodec) {
                return acc; // no sdpFmtpLine for RTX
            }
            return { ...acc, sdpFmtpLine: [...rawData.split(';')] };
        }, {});
        
        // Check if we should merge with existing codec
        let shouldMerge = false;
        const mergedAcc = descriptionAcc.map(x => {
            shouldMerge = x.mimeType === description.mimeType;
            if (shouldMerge) {
                if (x.feedbackSupport && description.feedbackSupport) {
                    x.feedbackSupport = [
                        ...new Set([...x.feedbackSupport, ...description.feedbackSupport])
                    ];
                }
                if (x.sdpFmtpLine && description.sdpFmtpLine) {
                    x.sdpFmtpLine = [
                        ...new Set([...x.sdpFmtpLine, ...description.sdpFmtpLine])
                    ];
                }
                return {
                    ...x,
                    clockRates: [
                        ...new Set([...(x.clockRates || []), ...(description.clockRates || [])])
                    ]
                };
            }
            return x;
        });
        
        if (shouldMerge) {
            return mergedAcc;
        }
        return [...descriptionAcc, description];
    }, []);
}

/**
 * Extract audio and video codec capabilities from SDP
 * Provides detailed codec information including clock rates, channels, feedback support
 * @param {string} sdp - Session Description Protocol string
 * @returns {Object} Audio and video codec capabilities
 */
function getCodecCapabilitiesFromSDP(sdp) {
    if (!sdp) return { audio: [], video: [] };
    
    const videoDescriptors = ((/m=video [^\s]+ [^\s]+ ([^\n|\r]+)/.exec(sdp) || [])[1] || '').split(' ').filter(Boolean);
    const audioDescriptors = ((/m=audio [^\s]+ [^\s]+ ([^\n|\r]+)/.exec(sdp) || [])[1] || '').split(' ').filter(Boolean);
    const rtxCounter = createRtxCounter();
    
    return {
        audio: constructCodecDescriptions({
            mediaType: 'audio',
            sdp,
            sdpDescriptors: audioDescriptors,
            rtxCounter
        }),
        video: constructCodecDescriptions({
            mediaType: 'video',
            sdp,
            sdpDescriptors: videoDescriptors,
            rtxCounter
        })
    };
}

/**
 * Parse additional SDP attributes for fingerprinting
 * @param {string} sdp - Session Description Protocol string
 * @returns {Object} Parsed SDP attributes
 */
function parseSDPAttributes(sdp) {
    if (!sdp) return {};
    
    const attributes = {
        // Session-level attributes
        sessionName: (sdp.match(/s=([^\r\n]+)/) || [])[1] || null,
        
        // ICE attributes (without revealing actual credentials)
        hasIceUfrag: /a=ice-ufrag:/.test(sdp),
        hasIcePwd: /a=ice-pwd:/.test(sdp),
        iceOptions: ((sdp.match(/a=ice-options:([^\r\n]+)/) || [])[1] || '').trim() || null,
        
        // DTLS/SRTP
        fingerprint: ((sdp.match(/a=fingerprint:([^\s]+)/) || [])[1] || null), // Hash algorithm only
        setupRole: (sdp.match(/a=setup:([^\r\n]+)/) || [])[1] || null,
        
        // Media directions
        mediaDirections: [...new Set((sdp.match(/a=(sendrecv|sendonly|recvonly|inactive)/g) || [])
            .map(x => x.replace('a=', '')))],
        
        // RTCP configuration
        rtcpMux: /a=rtcp-mux/.test(sdp),
        rtcpRsize: /a=rtcp-rsize/.test(sdp),
        
        // Bundle/grouping
        bundleGroup: ((sdp.match(/a=group:BUNDLE ([^\r\n]+)/) || [])[1] || '').split(' ').filter(Boolean),
        
        // MSID (Media Stream ID) - count only, not actual values
        msidCount: (sdp.match(/a=msid:/g) || []).length,
        
        // SSRC count (without revealing actual values)
        ssrcCount: (sdp.match(/a=ssrc:/g) || []).length,
        
        // Mid (Media ID) values
        mids: (sdp.match(/a=mid:([^\r\n]+)/g) || []).map(x => x.replace('a=mid:', '')),
        
        // Extmap-allow-mixed (Chrome 71+)
        extmapAllowMixed: /a=extmap-allow-mixed/.test(sdp),
        
        // SCTP (DataChannel) parameters
        sctpPort: ((sdp.match(/a=sctp-port:(\d+)/) || [])[1]) || null,
        maxMessageSize: ((sdp.match(/a=max-message-size:(\d+)/) || [])[1]) || null
    };
    
    return attributes;
}

// ============================================================================
// END INSPIRED MEDIA CAPABILITIES & SDP ANALYSIS
// ============================================================================

/**
 * WebRTC Leak Detector
 * Collects WebRTC-related fingerprint data and potential IP leaks
 */
class WebRTCLeakDetector {
    constructor(config = {}) {
        this.config = { ...WEBRTC_CONFIG, ...config };
        this.metrics = {};
        this.result = null;
        this.suspiciousIndicators = [];
    }

    /**
     * Analyze WebRTC capabilities and collect leak data
     * @returns {Promise<Object>} WebRTC metrics
     */
    async analyze() {
        const result = await this.collect();
        this.result = result;
        this.metrics = this._formatMetrics(result);
        
        // Analyze for suspicious patterns
        this._analyzeForSuspiciousPatterns(result);
        
        return this.metrics;
    }

    /**
     * Static collect method matching the design pattern
     * @returns {Promise<Object>} WebRTCLeakResult
     */
    static async collect() {
        const detector = new WebRTCLeakDetector();
        return detector.collect();
    }

    /**
     * Collect WebRTC leak data
     * @returns {Promise<Object>} WebRTCLeakResult
     */
    async collect() {
        const startedAt = Date.now();
        const errors = [];
        
        // Initialize result structure with extended capabilities
        const result = {
            supported: {
                RTCPeerConnection: false,
                RTCDataChannel: false,
                MediaCapabilities: !!navigator.mediaCapabilities
            },
            sessionDescription: {
                sdpHash: null,
                sdp: null
            },
            // Extended: SDP-derived codec capabilities ()
            sdpCodecs: {
                audio: [],
                video: [],
                extensions: [],
                attributes: {}
            },
            // Extended: MediaCapabilities API results
            mediaCapabilities: null,
            timing: {
                startedAt,
                finishedAt: 0,
                durationMs: 0,
                // Detailed timing breakdown for latency analysis
                breakdown: {
                    sdpOfferCreation: { startedAt: 0, finishedAt: 0, durationMs: 0 },
                    mediaCapabilities: { startedAt: 0, finishedAt: 0, durationMs: 0 }
                }
            },
            errors
        };

        try {
            // Check RTCPeerConnection support
            const RTCPeerConnection = window.RTCPeerConnection || 
                                       window.webkitRTCPeerConnection || 
                                       window.mozRTCPeerConnection;
            
            result.supported.RTCPeerConnection = !!RTCPeerConnection;
            
            if (!RTCPeerConnection) {
                errors.push('RTCPeerConnection not supported');
                result.timing.finishedAt = Date.now();
                result.timing.durationMs = result.timing.finishedAt - startedAt;
                return result;
            }

            // Collect WebRTC leak data (including SDP parsing)
            await this._collectWebRTCData(result, RTCPeerConnection);
            
            // Collect MediaCapabilities data (parallel-safe, independent of RTC)
            await this._collectMediaCapabilities(result);
            
        } catch (e) {
            errors.push(`WebRTC collection error: ${e.message}`);
        }

        result.timing.finishedAt = Date.now();
        result.timing.durationMs = result.timing.finishedAt - startedAt;
        
        return result;
    }

    /**
     * Collect WebRTC SDP data
     * @private
     */
    async _collectWebRTCData(result, RTCPeerConnection) {
        let pc = null;
        
        const cleanup = () => {
            if (pc) {
                try {
                    pc.close();
                } catch (e) {
                    // Ignore cleanup errors
                }
                pc = null;
            }
        };
        
        try {
            // Create RTCPeerConnection with minimal config (no STUN needed for SDP only)
            pc = new RTCPeerConnection({ iceServers: [] });
            
            // Test RTCDataChannel support
            try {
                const dc = pc.createDataChannel('test');
                result.supported.RTCDataChannel = true;
                dc.close();
            } catch (e) {
                result.supported.RTCDataChannel = false;
                result.errors.push(`RTCDataChannel test failed: ${e.message}`);
            }
            
            // Create a data channel to ensure SDP has data channel info
            pc.createDataChannel('probe');
            
            // Start timing SDP offer creation
            result.timing.breakdown.sdpOfferCreation.startedAt = Date.now();
            
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            
            // Finalize SDP offer creation timing
            result.timing.breakdown.sdpOfferCreation.finishedAt = Date.now();
            result.timing.breakdown.sdpOfferCreation.durationMs = 
                result.timing.breakdown.sdpOfferCreation.finishedAt - 
                result.timing.breakdown.sdpOfferCreation.startedAt;
            
            // Store SDP
            if (pc.localDescription && pc.localDescription.sdp) {
                const sdp = pc.localDescription.sdp;
                result.sessionDescription.sdp = sdp.length > this.config.maxSdpLength 
                    ? sdp.substring(0, this.config.maxSdpLength) + '...[truncated]'
                    : sdp;
                result.sessionDescription.sdpHash = fnv1a32(sdp);
                
                // Extended: Parse SDP for codec capabilities ()
                try {
                    const codecCapabilities = getCodecCapabilitiesFromSDP(sdp);
                    result.sdpCodecs.audio = codecCapabilities.audio;
                    result.sdpCodecs.video = codecCapabilities.video;
                    result.sdpCodecs.extensions = getExtensionsFromSDP(sdp);
                    result.sdpCodecs.attributes = parseSDPAttributes(sdp);
                } catch (parseError) {
                    result.errors.push(`SDP parsing failed: ${parseError.message}`);
                }
            }
            
        } catch (e) {
            result.errors.push(`SDP collection failed: ${e.message}`);
        } finally {
            cleanup();
        }
    }

    /**
     * Collect MediaCapabilities API data
     * Tests codec support patterns for fingerprinting
     * @private
     */
    async _collectMediaCapabilities(result) {
        result.timing.breakdown.mediaCapabilities.startedAt = Date.now();
        
        try {
            const mcConfig = this.config.mediaCapabilities;
            result.mediaCapabilities = await getMediaCapabilities({
                video: mcConfig.video,
                audio: mcConfig.audio,
                codecs: mcConfig.codecs
            });
        } catch (e) {
            result.errors.push(`MediaCapabilities collection failed: ${e.message}`);
            result.mediaCapabilities = { error: e.message, supported: false };
        }
        
        result.timing.breakdown.mediaCapabilities.finishedAt = Date.now();
        result.timing.breakdown.mediaCapabilities.durationMs = 
            result.timing.breakdown.mediaCapabilities.finishedAt - 
            result.timing.breakdown.mediaCapabilities.startedAt;
    }

    /**
     * Format results into metrics object for fingerprint
     * @private
     */
    _formatMetrics(result) {
        // Build base metrics
        const metrics = {
            // ================================================================
            // SUPPORT DETECTION
            // ================================================================
            hasRTCPeerConnection: {
                value: result.supported.RTCPeerConnection,
                description: 'RTCPeerConnection API availability',
                risk: 'N/A'
            },
            hasRTCDataChannel: {
                value: result.supported.RTCDataChannel,
                description: 'RTCDataChannel support (verified)',
                risk: 'N/A'
            },
            hasMediaCapabilities: {
                value: result.supported.MediaCapabilities,
                description: 'MediaCapabilities API availability',
                risk: 'N/A'
            },
            
            // ================================================================
            // SDP CORE METRICS
            // ================================================================
            sdpHash: {
                value: result.sessionDescription.sdpHash || 'Not available',
                description: 'FNV-1a hash of SDP (Session Description Protocol)',
                risk: 'N/A'
            },
            sdpLength: {
                value: result.sessionDescription.sdp ? result.sessionDescription.sdp.length : 0,
                description: 'SDP content length in characters',
                risk: 'N/A'
            },
            sdpOffering: {
                value: result.sessionDescription.sdp || 'Not available',
                description: 'Full SDP (Session Description Protocol) offering string for analysis',
                risk: 'N/A',
                isLargeValue: true
            },
            
            // ================================================================
            // EXTENDED: SDP CODEC CAPABILITIES ()
            // ================================================================
            sdpAudioCodecs: {
                value: result.sdpCodecs?.audio || [],
                description: 'Audio codecs parsed from SDP with clock rates, channels, and feedback support',
                risk: 'N/A'
            },
            sdpAudioCodecCount: {
                value: result.sdpCodecs?.audio?.length || 0,
                description: 'Number of audio codecs advertised in SDP',
                risk: 'N/A'
            },
            sdpAudioCodecList: {
                value: (result.sdpCodecs?.audio || []).map(c => c.mimeType).join(', ') || 'None',
                description: 'List of audio codec mimeTypes from SDP',
                risk: 'N/A'
            },
            sdpVideoCodecs: {
                value: result.sdpCodecs?.video || [],
                description: 'Video codecs parsed from SDP with clock rates and feedback support',
                risk: 'N/A'
            },
            sdpVideoCodecCount: {
                value: result.sdpCodecs?.video?.length || 0,
                description: 'Number of video codecs advertised in SDP',
                risk: 'N/A'
            },
            sdpVideoCodecList: {
                value: (result.sdpCodecs?.video || []).map(c => c.mimeType).join(', ') || 'None',
                description: 'List of video codec mimeTypes from SDP',
                risk: 'N/A'
            },
            
            // ================================================================
            // EXTENDED: RTP EXTENSIONS ()
            // ================================================================
            sdpExtensions: {
                value: result.sdpCodecs?.extensions || [],
                description: 'RTP header extensions from SDP (browser-specific implementation details)',
                risk: 'N/A'
            },
            sdpExtensionCount: {
                value: result.sdpCodecs?.extensions?.length || 0,
                description: 'Number of RTP header extensions in SDP',
                risk: 'N/A'
            },
            sdpExtensionHash: {
                value: result.sdpCodecs?.extensions?.length > 0 
                    ? fnv1a32(result.sdpCodecs.extensions.join('|'))
                    : 'N/A',
                description: 'Hash of RTP extensions (fingerprinting signal)',
                risk: 'N/A'
            },
            
            // ================================================================
            // EXTENDED: SDP ATTRIBUTES ()
            // ================================================================
            sdpSessionName: {
                value: result.sdpCodecs?.attributes?.sessionName || 'N/A',
                description: 'SDP session name (s= line)',
                risk: 'N/A'
            },
            sdpIceOptions: {
                value: result.sdpCodecs?.attributes?.iceOptions || 'N/A',
                description: 'ICE options from SDP',
                risk: 'N/A'
            },
            sdpFingerprintAlgorithm: {
                value: result.sdpCodecs?.attributes?.fingerprint || 'N/A',
                description: 'DTLS fingerprint hash algorithm',
                risk: 'N/A'
            },
            sdpSetupRole: {
                value: result.sdpCodecs?.attributes?.setupRole || 'N/A',
                description: 'DTLS setup role (actpass/active/passive)',
                risk: 'N/A'
            },
            sdpRtcpMux: {
                value: result.sdpCodecs?.attributes?.rtcpMux ?? false,
                description: 'RTCP multiplexing support',
                risk: 'N/A'
            },
            sdpRtcpRsize: {
                value: result.sdpCodecs?.attributes?.rtcpRsize ?? false,
                description: 'Reduced-size RTCP support',
                risk: 'N/A'
            },
            sdpBundleGroup: {
                value: result.sdpCodecs?.attributes?.bundleGroup?.join(', ') || 'N/A',
                description: 'BUNDLE group media identifiers',
                risk: 'N/A'
            },
            sdpExtmapAllowMixed: {
                value: result.sdpCodecs?.attributes?.extmapAllowMixed ?? false,
                description: 'extmap-allow-mixed support (Chrome 71+)',
                risk: 'N/A'
            },
            sdpSctpPort: {
                value: result.sdpCodecs?.attributes?.sctpPort || 'N/A',
                description: 'SCTP port for DataChannel',
                risk: 'N/A'
            },
            sdpMaxMessageSize: {
                value: result.sdpCodecs?.attributes?.maxMessageSize || 'N/A',
                description: 'Maximum DataChannel message size',
                risk: 'N/A'
            },
            
            // ================================================================
            // EXTENDED: MEDIA CAPABILITIES ()
            // ================================================================
            mediaCapabilitiesSupported: {
                value: result.mediaCapabilities?.supported ?? false,
                description: 'MediaCapabilities API decodingInfo availability',
                risk: 'N/A'
            },
            mediaCapabilitiesSupportedCount: {
                value: result.mediaCapabilities?.supportedCount || 0,
                description: 'Number of codecs supported via MediaCapabilities API',
                risk: 'N/A'
            },
            mediaCapabilitiesTestedCount: {
                value: result.mediaCapabilities?.testedCount || 0,
                description: 'Total number of codecs tested',
                risk: 'N/A'
            },
            mediaCapabilitiesHash: {
                value: result.mediaCapabilities?.capabilities 
                    ? fnv1a32(JSON.stringify(result.mediaCapabilities.capabilities))
                    : 'N/A',
                description: 'Hash of MediaCapabilities results (fingerprinting signal)',
                risk: 'N/A'
            },
            mediaCapabilitiesDetails: {
                value: result.mediaCapabilities?.capabilities || {},
                description: 'Detailed codec support with smooth/powerEfficient flags',
                risk: 'N/A',
                isLargeValue: true
            },
            
            // ================================================================
            // TIMING METRICS
            // ================================================================
            collectionDurationMs: {
                value: result.timing.durationMs,
                description: 'Total WebRTC collection duration in milliseconds',
                risk: 'N/A'
            },
            sdpOfferCreationMs: {
                value: result.timing.breakdown.sdpOfferCreation.durationMs,
                description: 'Time to create and set SDP offer (createOffer + setLocalDescription)',
                risk: 'N/A'
            },
            mediaCapabilitiesDurationMs: {
                value: result.timing.breakdown.mediaCapabilities?.durationMs || 0,
                description: 'Time to test MediaCapabilities codec support',
                risk: 'N/A'
            },
            
            // ================================================================
            // ERROR TRACKING
            // ================================================================
            errorCount: {
                value: result.errors.length,
                description: 'Number of non-fatal errors during collection',
                risk: result.errors.length > 0 ? 'MEDIUM' : 'N/A'
            },
            errorMessages: {
                value: result.errors.join('; ') || 'None',
                description: 'Error messages encountered during collection',
                risk: 'N/A'
            }
        };
        
        // Generate combined fingerprint hash from key signals
        const fingerprintSignals = [
            result.sessionDescription.sdpHash,
            result.sdpCodecs?.extensions?.join('|'),
            JSON.stringify(result.mediaCapabilities?.capabilities || {})
        ].filter(Boolean).join('::');
        
        metrics.webrtcCombinedHash = {
            value: fnv1a32(fingerprintSignals),
            description: 'Combined hash of SDP + Extensions + MediaCapabilities (primary fingerprint)',
            risk: 'N/A'
        };
        
        return metrics;
    }

    /**
     * Analyze results for suspicious patterns
     * @private
     */
    _analyzeForSuspiciousPatterns(result) {
        this.suspiciousIndicators = [];
        
        // No WebRTC support might indicate a privacy-focused or sandboxed browser
        if (!result.supported.RTCPeerConnection) {
            this.suspiciousIndicators.push({
                category: 'webrtc',
                name: 'webrtc_not_supported',
                description: 'WebRTC API not available',
                value: 'RTCPeerConnection unavailable',
                riskLevel: 'MEDIUM',
                confidence: 0.5,
                importance: 'WEAK',
                details: 'WebRTC is blocked or not supported, which could indicate privacy browser/extension or sandboxed environment'
            });
        }
        
        // No SDP generated is suspicious
        if (result.supported.RTCPeerConnection && !result.sessionDescription.sdp) {
            this.suspiciousIndicators.push({
                category: 'webrtc',
                name: 'webrtc_no_sdp',
                description: 'No SDP generated',
                value: 'SDP unavailable',
                riskLevel: 'MEDIUM',
                confidence: 0.6,
                importance: 'WEAK',
                details: 'WebRTC is supported but no SDP was generated, possibly indicating a sandboxed or restricted environment'
            });
        }
        
        // Extended: Very few or no RTP extensions is suspicious (headless/minimal browsers)
        const extensionCount = result.sdpCodecs?.extensions?.length || 0;
        if (result.supported.RTCPeerConnection && extensionCount === 0) {
            this.suspiciousIndicators.push({
                category: 'webrtc',
                name: 'webrtc_no_extensions',
                description: 'No RTP extensions in SDP',
                value: `Extension count: ${extensionCount}`,
                riskLevel: 'MEDIUM',
                confidence: 0.6,
                importance: 'MODERATE',
                details: 'SDP contains no RTP header extensions, which is unusual for standard browsers'
            });
        } else if (result.supported.RTCPeerConnection && extensionCount < 5) {
            this.suspiciousIndicators.push({
                category: 'webrtc',
                name: 'webrtc_few_extensions',
                description: 'Very few RTP extensions in SDP',
                value: `Extension count: ${extensionCount}`,
                riskLevel: 'LOW',
                confidence: 0.4,
                importance: 'WEAK',
                details: 'SDP contains fewer RTP extensions than typical browsers'
            });
        }
        
        // Extended: No audio or video codecs is suspicious
        const audioCodecCount = result.sdpCodecs?.audio?.length || 0;
        const videoCodecCount = result.sdpCodecs?.video?.length || 0;
        if (result.supported.RTCPeerConnection && audioCodecCount === 0 && videoCodecCount === 0) {
            this.suspiciousIndicators.push({
                category: 'webrtc',
                name: 'webrtc_no_codecs',
                description: 'No audio or video codecs in SDP',
                value: `Audio: ${audioCodecCount}, Video: ${videoCodecCount}`,
                riskLevel: 'HIGH',
                confidence: 0.8,
                importance: 'STRONG',
                details: 'SDP contains no media codecs, which is highly unusual and suggests manipulation or headless environment'
            });
        }
        
        // Extended: MediaCapabilities API missing when expected
        if (!result.supported.MediaCapabilities) {
            this.suspiciousIndicators.push({
                category: 'webrtc',
                name: 'media_capabilities_missing',
                description: 'MediaCapabilities API not available',
                value: 'navigator.mediaCapabilities unavailable',
                riskLevel: 'LOW',
                confidence: 0.4,
                importance: 'WEAK',
                details: 'MediaCapabilities API is missing, could indicate older browser or privacy restrictions'
            });
        }
        
        // Extended: Very low codec support count is suspicious
        const supportedCodecs = result.mediaCapabilities?.supportedCount || 0;
        const testedCodecs = result.mediaCapabilities?.testedCount || 0;
        if (testedCodecs > 0 && supportedCodecs === 0) {
            this.suspiciousIndicators.push({
                category: 'webrtc',
                name: 'no_codec_support',
                description: 'No codecs supported via MediaCapabilities',
                value: `0/${testedCodecs} codecs supported`,
                riskLevel: 'HIGH',
                confidence: 0.7,
                importance: 'STRONG',
                details: 'MediaCapabilities reports no codec support, suggesting virtual or heavily restricted environment'
            });
        } else if (testedCodecs > 0 && supportedCodecs < 3) {
            this.suspiciousIndicators.push({
                category: 'webrtc',
                name: 'minimal_codec_support',
                description: 'Very limited codec support',
                value: `${supportedCodecs}/${testedCodecs} codecs supported`,
                riskLevel: 'MEDIUM',
                confidence: 0.5,
                importance: 'MODERATE',
                details: 'Very few codecs supported via MediaCapabilities, unusual for standard browsers'
            });
        }
    }

    /**
     * Get suspicious indicators for integration with main detector
     * @returns {Array} Array of suspicious indicator objects
     */
    getSuspiciousIndicators() {
        return this.suspiciousIndicators;
    }

    /**
     * Get the raw result object
     * @returns {Object} Full WebRTCLeakResult
     */
    getResult() {
        return this.result;
    }

    /**
     * Render method for UI integration
     * @param {Object} result - The WebRTC leak result
     * @param {Object} uiTargets - DOM elements for rendering
     */
    static render(result, uiTargets) {
        // This is handled by the existing fingerprint-analysis.html metrics table
        // The result is formatted into metrics and rendered automatically
        _log.log('WebRTCLeakDetector render called with:', result);
    }
}

export { WebRTCLeakDetector, WEBRTC_CONFIG };
