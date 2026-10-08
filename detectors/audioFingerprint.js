/**
 * Audio Fingerprint Detector Module
 * Collects audio system parameters and fingerprint data
 * 
 * Enhanced with CreepJS techniques for stealth detection:
 * - Known audio patterns for engine validation (Blink/Gecko/WebKit)
 * - Fake audio detection (silent oscillator test)
 * - Noise factor detection (buffer tampering)
 * - Sample matching (getChannelData vs copyFromChannel)
 * - Extended audio node property collection
 * 
 * KEY INSIGHT: Audio fingerprint rendering fails on headless Chromium without audio output.
 * However, AudioContext METADATA reveals OS/driver-level parameters that are:
 * - Available even without audio devices
 * - OS and driver specific (sampleRate, baseLatency, maxChannelCount)
 * - Hard to spoof consistently without deep knowledge
 * - Similar to CSS computed styles for OS detection
 * 
 * This implementation focuses on THREE approaches:
 * 1. Audio System Parameters (Cloudflare-style) - Always available, reveals OS/driver info
 * 2. Audio Fingerprint Rendering (PX-style) - When available, provides unique hash
 * 3. CreepJS Lie Detection - Validates audio data integrity and detects spoofing
 * 
 * @module detectors/audioFingerprint
 * @see https://fingerprintjs.com/blog/audio-fingerprinting/
 * @see https://github.com/AbrahamJuliot/creepjs (audio detection)
 */

// ============================================================
// CREEPJS KNOWN AUDIO PATTERNS
// These are engine-specific compressor gain values mapped to expected sample sums
// Used to validate that audio processing matches expected browser engine
// ============================================================
const KNOWN_AUDIO_PATTERNS = {
    // Blink/WebKit - Chrome, Edge, Opera, etc.
    [-20.538286209106445]: [
        124.0434488439787,
        124.04344968475198,
        124.04347527516074,
        124.04347503720783,
        124.04347657808103,
    ],
    [-20.538288116455078]: [
        124.04347518575378,
        124.04347527516074,
        124.04344884395687,
        124.04344968475198,
        124.04347657808103,
        124.04347730590962,
        124.0434765110258,
        124.04347656317987,
        124.04375314689969,
        // WebKit specific
        124.0434485301812,
        124.0434496849557,
        124.043453265891,
        124.04345734833623,
        124.04345808873768,
    ],
    [-20.535268783569336]: [
        // Android/Linux Blink
        124.080722568091,
        124.08072256811283,
        124.08072766105033,
        124.08072787802666,
        124.08072787804849,
        124.08074500028306,
        124.0807470110085,
        124.08075528279005,
        124.08075643483608,
    ],
    // Gecko - Firefox
    [-31.502187728881836]: [35.74996626004577],
    [-31.502185821533203]: [35.74996031448245, 35.7499681673944, 35.749968223273754],
    [-31.50218963623047]: [35.74996031448245],
    [-31.509262084960938]: [35.7383295930922, 35.73833402246237],
    // WebKit - Safari
    [-29.837873458862305]: [35.10892717540264, 35.10892752557993],
    [-29.83786964416504]: [35.10893232002854, 35.10893253237009],
};

// Extended known patterns: pattern -> expected sampleSum values
// Pattern format: "compressorGainReduction,floatFrequencyDataSum,floatTimeDomainDataSum"
const KNOWN_AUDIO_EXTENDED_PATTERNS = {
    // BLINK
    '-20.538286209106445,164537.64796829224,502.5999283068122': [124.04347527516074],
    '-20.538288116455078,164537.64796829224,502.5999283068122': [124.04347527516074],
    '-20.538288116455078,164537.64795303345,502.5999283068122': [124.04347527516074, 124.04347518575378],
    '-20.538286209106445,164537.64805984497,502.5999283068122': [124.04347527516074],
    '-20.538288116455078,164537.64805984497,502.5999283068122': [124.04347527516074, 124.04347518575378],
    '-20.538288116455078,164881.9727935791,502.59990317908887': [124.04344884395687],
    '-20.538286209106445,164882.2082748413,502.59990317911434': [124.0434488439787],
    '-20.538286209106445,164863.45319366455,502.5999033495791': [124.04344968475198],
    '-20.538288116455078,164863.45319366455,502.5999033495791': [124.04344968475198, 124.04375314689969],
    '-20.538286209106445,164540.1567993164,502.59992209258417': [124.04347657808103],
    '-20.538288116455078,164540.1567993164,502.59992209258417': [124.04347657808103, 124.0434765110258],
    // Android/Linux
    '-20.535268783569336,164940.360786438,502.69695458233764': [124.080722568091],
    '-20.535268783569336,164948.14596557617,502.6969545823631': [124.08072256811283],
    '-20.535268783569336,164926.65912628174,502.6969610930064': [124.08072766105033],
    // GECKO
    '-31.509262084960938,167722.6894454956,148.42717787250876': [35.7383295930922],
    '-31.509262084960938,167728.72756958008,148.427184343338': [35.73833402246237],
    '-31.50218963623047,167721.27517700195,148.47537828609347': [35.74996031448245],
    '-31.502185821533203,167727.52931976318,148.47542023658752': [35.7499681673944],
    '-31.502187728881836,167697.23177337646,148.47541113197803': [35.74996626004577],
    // WEBKIT
    '-29.837873458862305,163206.43050384521,0': [35.10892717540264],
    '-29.837873458862305,163224.69785308838,0': [35.10892752557993],
    '-29.83786964416504,163209.17245483398,0': [35.10893232002854],
    '-29.83786964416504,163202.77336883545,0': [35.10893253237009],
};

// Audio trap value for noise detection
const AUDIO_TRAP = Math.random();

/**
 * Configuration for audio fingerprinting
 * Parameters aligned with industry-standard implementations
 */
const AUDIO_CONFIG = {
    // Sample rate for offline audio context (industry standard)
    sampleRate: 44100,
    
    // Number of samples to render (1 second of audio at 44100Hz)
    // PX uses exactly 44100 samples
    sampleLength: 44100,
    
    // Oscillator frequency (Hz) - ALL vendors use 10kHz
    oscillatorFrequency: 10000,
    
    // Oscillator type - PX uses 'sine', others use 'triangle'
    // 'sine' provides cleaner, more consistent fingerprint
    oscillatorType: 'sine',
    
    // Sample range to analyze - PX uses 4500-5000
    // This range captures the compressor's effect on the signal
    sampleRangeStart: 4500,
    sampleRangeEnd: 5000,
    
    // Dynamics compressor settings (matches PX/CHEQ)
    compressor: {
        threshold: -50,
        knee: 40,
        ratio: 12,
        attack: 0,
        release: 0.25
    },
    
    // Timeout in milliseconds
    timeout: 1500,
    
    // Rounding precision for deterministic results
    roundingPrecision: 10000,
    
    // Enable system parameter collection (Cloudflare-style)
    collectSystemParams: true,
    
    // Enable offline fingerprint rendering (PX-style)
    collectOfflineFingerprint: true
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
        // FNV prime: 16777619
        hash = Math.imul(hash, 16777619);
    }
    // Convert to unsigned 32-bit and then to hex
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Audio Fingerprint Detector
 * Collects audio system parameters and fingerprint using AudioContext APIs
 * Implementation combines Cloudflare (system params) and PerimeterX (offline fingerprint) approaches
 */
class AudioFingerprintDetector {
    constructor(config = {}) {
        this.config = { ...AUDIO_CONFIG, ...config };
        this.metrics = {};
        this.audioFingerprint = null;
        this.systemParams = null;
        this.suspiciousIndicators = [];
    }

    /**
     * Analyze audio fingerprint capabilities and collect data
     * @returns {Promise<Object>} Audio fingerprint metrics
     */
    async analyze() {
        const startTime = performance.now();
        
        // 1. Collect Audio System Parameters (Cloudflare-style) - Always available
        if (this.config.collectSystemParams) {
            this.systemParams = await this._collectAudioSystemParams();
        }
        
        // 2. Collect Offline Audio Fingerprint (PX-style) - May fail on headless
        let offlineResult = null;
        if (this.config.collectOfflineFingerprint) {
            offlineResult = await this.collectAudioFingerprint();
            this.audioFingerprint = offlineResult;
        }
        
        const totalTime = Math.round(performance.now() - startTime);
        
        // Combine results
        const result = {
            systemParams: this.systemParams,
            offlineFingerprint: offlineResult,
            collectionTime: totalTime
        };
        
        this.metrics = this._formatMetrics(result);
        
        // Analyze for suspicious patterns
        this._analyzeForSuspiciousPatterns(result);
        
        return this.metrics;
    }

    /**
     * Collect Audio System Parameters using live AudioContext
     * These are OS/driver-level parameters that reveal system characteristics
     * Available even on headless browsers without audio devices
     * 
     * @private
     * @returns {Promise<Object>} Audio system parameters
     */
    async _collectAudioSystemParams() {
        const startTime = performance.now();
        
        try {
            // Get AudioContext class (live, not offline)
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            
            if (!AudioContextClass) {
                return {
                    supported: false,
                    error: 'AudioContext not supported'
                };
            }
            
            // Create a live AudioContext to probe system parameters
            const audioCtx = new AudioContextClass();
            
            const params = {
                supported: true,
                
                // === CORE AUDIO CONTEXT PARAMETERS ===
                // These reveal OS/driver configuration
                
                // Sample rate: OS default (44100, 48000, 96000, etc.)
                // Different on Windows (48000 default) vs macOS (44100) vs Linux
                sampleRate: audioCtx.sampleRate,
                
                // Context state: "suspended", "running", or "closed"
                // Headless browsers may have different initial state
                state: audioCtx.state,
                
                // Base latency: Audio system latency in seconds
                // OS and driver dependent - different across platforms
                baseLatency: audioCtx.baseLatency,
                
                // Output latency: Time between audio request and output
                // Will be 0 or undefined if no output device
                outputLatency: audioCtx.outputLatency,
                
                // Current time: Context time in seconds
                currentTime: audioCtx.currentTime,
                
                // === DESTINATION NODE PARAMETERS ===
                // The destination represents the final audio output
                
                destination: {
                    // Max channels: Hardware/driver max (2 for stereo, 6 for 5.1, 8 for 7.1)
                    // OS and hardware dependent
                    maxChannelCount: audioCtx.destination.maxChannelCount,
                    
                    // Current channel count
                    channelCount: audioCtx.destination.channelCount,
                    
                    // Channel count mode: "max", "clamped-max", or "explicit"
                    channelCountMode: audioCtx.destination.channelCountMode,
                    
                    // Channel interpretation: "speakers" or "discrete"
                    channelInterpretation: audioCtx.destination.channelInterpretation,
                    
                    // Number of inputs (always 1 for destination)
                    numberOfInputs: audioCtx.destination.numberOfInputs,
                    
                    // Number of outputs (always 0 for destination - it's the final node)
                    numberOfOutputs: audioCtx.destination.numberOfOutputs
                }
            };
            
            // === AUDIO NODE DEFAULT PARAMETERS ===
            // Probe default values of audio nodes - can reveal browser/engine version
            
            try {
                // AnalyserNode defaults
                const analyser = audioCtx.createAnalyser();
                params.analyserDefaults = {
                    fftSize: analyser.fftSize,
                    frequencyBinCount: analyser.frequencyBinCount,
                    minDecibels: analyser.minDecibels,
                    maxDecibels: analyser.maxDecibels,
                    smoothingTimeConstant: analyser.smoothingTimeConstant
                };
                analyser.disconnect();
            } catch (e) {
                params.analyserError = e.message;
            }
            
            try {
                // BiquadFilterNode defaults - filter type reveals engine defaults
                const biquad = audioCtx.createBiquadFilter();
                params.biquadDefaults = {
                    type: biquad.type,
                    frequency: biquad.frequency.value,
                    Q: biquad.Q.value,
                    gain: biquad.gain.value,
                    detune: biquad.detune.value
                };
                biquad.disconnect();
            } catch (e) {
                params.biquadError = e.message;
            }
            
            try {
                // DynamicsCompressorNode defaults
                const compressor = audioCtx.createDynamicsCompressor();
                params.compressorDefaults = {
                    threshold: compressor.threshold.value,
                    knee: compressor.knee.value,
                    ratio: compressor.ratio.value,
                    attack: compressor.attack.value,
                    release: compressor.release.value
                };
                compressor.disconnect();
            } catch (e) {
                params.compressorError = e.message;
            }
            
            try {
                // OscillatorNode defaults
                const osc = audioCtx.createOscillator();
                params.oscillatorDefaults = {
                    type: osc.type,
                    frequency: osc.frequency.value,
                    detune: osc.detune.value
                };
                osc.disconnect();
            } catch (e) {
                params.oscillatorError = e.message;
            }
            
            try {
                // GainNode defaults
                const gain = audioCtx.createGain();
                params.gainDefaults = {
                    gain: gain.gain.value
                };
                gain.disconnect();
            } catch (e) {
                params.gainError = e.message;
            }
            
            try {
                // StereoPannerNode defaults (if available)
                if (audioCtx.createStereoPanner) {
                    const panner = audioCtx.createStereoPanner();
                    params.stereoPannerDefaults = {
                        pan: panner.pan.value
                    };
                    panner.disconnect();
                }
            } catch (e) {
                params.stereoPannerError = e.message;
            }
            
            try {
                // ConvolverNode - check for normalize default
                const convolver = audioCtx.createConvolver();
                params.convolverDefaults = {
                    normalize: convolver.normalize
                };
                convolver.disconnect();
            } catch (e) {
                params.convolverError = e.message;
            }
            
            try {
                // WaveShaperNode defaults
                const waveShaper = audioCtx.createWaveShaper();
                params.waveShaperDefaults = {
                    oversample: waveShaper.oversample
                };
                waveShaper.disconnect();
            } catch (e) {
                params.waveShaperError = e.message;
            }
            
            // === AUDIO WORKLET AVAILABILITY ===
            // Modern audio API - availability varies
            params.audioWorkletAvailable = typeof audioCtx.audioWorklet !== 'undefined';
            
            // === AUDIO CONTEXT TIMING ===
            params.collectionTimeMs = Math.round(performance.now() - startTime);
            
            // Close the context
            try {
                await audioCtx.close();
            } catch (e) {}
            
            return params;
            
        } catch (error) {
            return {
                supported: false,
                error: error.message,
                collectionTimeMs: Math.round(performance.now() - startTime)
            };
        }
    }

    /**
     * Collect audio fingerprint data
     * @returns {Promise<Object>} Audio fingerprint result
     */
    async collectAudioFingerprint() {
        const startTime = performance.now();
        
        try {
            // Check for API availability
            const AudioContextClass = this._getAudioContextClass();
            if (!AudioContextClass) {
                return {
                    error: 'AudioContext/OfflineAudioContext not supported',
                    supported: false
                };
            }

            // Create timeout promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Audio fingerprint timeout')), this.config.timeout);
            });

            // Create fingerprint promise
            const fingerprintPromise = this._generateFingerprint(AudioContextClass);

            // Race against timeout
            const result = await Promise.race([fingerprintPromise, timeoutPromise]);
            
            result.collectionTime = Math.round(performance.now() - startTime);
            return result;

        } catch (error) {
            return {
                error: error.message || 'Unknown audio fingerprint error',
                supported: true,
                collectionTime: Math.round(performance.now() - startTime)
            };
        }
    }

    /**
     * Get the appropriate AudioContext class
     * @private
     * @returns {Function|null} AudioContext constructor or null
     */
    _getAudioContextClass() {
        try {
            // Check for OfflineAudioContext (preferred for fingerprinting - no audible output)
            if (typeof OfflineAudioContext !== 'undefined') {
                return OfflineAudioContext;
            }
            // Fallback for older browsers
            if (typeof webkitOfflineAudioContext !== 'undefined') {
                return webkitOfflineAudioContext;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    // ============================================================
    // CREEPJS-STYLE DETECTION METHODS
    // ============================================================

    /**
     * Detect fake audio buffer (CreepJS technique)
     * Creates a silent oscillator and checks if buffer contains non-zero values
     * If spoofed audio APIs return noise for silence, this detects it
     * 
     * @private
     * @returns {Promise<boolean>} True if audio is fake/spoofed
     */
    async _detectFakeAudio() {
        try {
            const context = new OfflineAudioContext(1, 100, 44100);
            const oscillator = context.createOscillator();
            oscillator.frequency.value = 0; // Silent - should produce zeros
            oscillator.start(0);
            context.startRendering();

            return new Promise((resolve) => {
                context.oncomplete = (event) => {
                    try {
                        const channelData = event.renderedBuffer.getChannelData?.(0);
                        if (!channelData) {
                            resolve(false);
                            return;
                        }
                        // If all values are 0, audio is real. Otherwise it's fake/spoofed
                        const isFake = '' + [...new Set(channelData)] !== '0';
                        resolve(isFake);
                    } catch (e) {
                        resolve(false);
                    } finally {
                        try { oscillator.disconnect(); } catch (e) {}
                    }
                };
            });
        } catch (e) {
            return false;
        }
    }

    /**
     * Detect noise factor in audio buffer (CreepJS technique)
     * Tests if writing to audio buffer and reading back produces unexpected noise
     * This catches stealth plugins that add random noise to audio data
     * 
     * @private
     * @returns {number} Noise factor (0 = clean, >0 = tampered)
     */
    _detectNoiseFactor() {
        const length = 2000;
        try {
            const getRandFromRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            
            const getCopyFrom = (rand, buffer, copy) => {
                const bufLength = buffer.length;
                const max = 20;
                const start = getRandFromRange(275, bufLength - (max + 1));
                const mid = start + max / 2;
                const end = start + max;

                buffer.getChannelData(0)[start] = rand;
                buffer.getChannelData(0)[mid] = rand;
                buffer.getChannelData(0)[end] = rand;
                buffer.copyFromChannel(copy, 0);
                
                const attack = [
                    buffer.getChannelData(0)[start] === 0 ? Math.random() : 0,
                    buffer.getChannelData(0)[mid] === 0 ? Math.random() : 0,
                    buffer.getChannelData(0)[end] === 0 ? Math.random() : 0,
                ];
                return [...new Set([...buffer.getChannelData(0), ...copy, ...attack])].filter((x) => x !== 0);
            };

            const getCopyTo = (rand, buffer, copy) => {
                buffer.copyToChannel(copy.map(() => rand), 0);
                const frequency = buffer.getChannelData(0)[0];
                const dataAttacked = [...buffer.getChannelData(0)]
                    .map((x) => x !== frequency || !x ? Math.random() : x);
                return dataAttacked.filter((x) => x !== frequency);
            };

            const result = [...new Set([
                ...getCopyFrom(
                    AUDIO_TRAP,
                    new AudioBuffer({ length, sampleRate: 44100 }),
                    new Float32Array(length),
                ),
                ...getCopyTo(
                    AUDIO_TRAP,
                    new AudioBuffer({ length, sampleRate: 44100 }),
                    new Float32Array(length),
                ),
            ])];
            
            return +(
                result.length !== 1 &&
                result.reduce((acc, n) => acc += +n, 0)
            );
        } catch (error) {
            return 0;
        }
    }

    /**
     * Check if sample data matches between getChannelData and copyFromChannel
     * Stealth plugins may not properly synchronize these two methods
     * 
     * @private
     * @param {Float32Array} bins - Data from getChannelData
     * @param {Float32Array} copy - Data from copyFromChannel
     * @param {number} start - Start index
     * @param {number} end - End index
     * @returns {boolean} True if samples match
     */
    _checkSampleMatching(bins, copy, start, end) {
        if (!bins || !copy) return true;
        
        const getSnapshot = (arr, s, e) => {
            const collection = [];
            for (let i = s; i < e; i++) {
                collection.push(arr[i]);
            }
            return collection;
        };
        
        const binsSample = getSnapshot([...bins], start, end);
        const copySample = getSnapshot([...copy], start, end);
        
        return '' + binsSample === '' + copySample;
    }

    /**
     * Validate audio pattern against known browser engine patterns
     * Returns detected engine and whether pattern matches expectations
     * 
     * @private
     * @param {number} compressorGain - DynamicsCompressor reduction value
     * @param {number} sampleSum - Sum of audio samples
     * @param {number} floatFrequencySum - Sum of frequency data
     * @param {number} floatTimeSum - Sum of time domain data
     * @returns {Object} Pattern validation result
     */
    _validateAudioPattern(compressorGain, sampleSum, floatFrequencySum, floatTimeSum) {
        const result = {
            knownEngine: null,
            patternMatch: false,
            expectedSums: [],
            suspiciousPattern: false
        };

        // Check against simple gain -> expected sums mapping
        const knownSums = KNOWN_AUDIO_PATTERNS[compressorGain];
        if (knownSums) {
            result.expectedSums = knownSums;
            result.patternMatch = knownSums.includes(sampleSum);
            
            // Determine engine from gain value
            if (compressorGain > -22) {
                result.knownEngine = 'blink'; // Chrome/Edge/Opera
            } else if (compressorGain > -30) {
                result.knownEngine = 'webkit'; // Safari
            } else {
                result.knownEngine = 'gecko'; // Firefox
            }
        }

        // Check extended pattern (more precise)
        const extendedPattern = `${compressorGain},${floatFrequencySum},${floatTimeSum}`;
        const extendedSums = KNOWN_AUDIO_EXTENDED_PATTERNS[extendedPattern];
        if (extendedSums) {
            result.extendedPatternMatch = extendedSums.includes(sampleSum);
            if (!result.extendedPatternMatch && result.patternMatch) {
                // Simple pattern matched but extended didn't - suspicious
                result.suspiciousPattern = true;
            }
        }

        return result;
    }

    /**
     * Collect extended audio node properties (CreepJS style)
     * These values vary by browser engine and can fingerprint the browser
     * 
     * @private
     * @param {OfflineAudioContext} context - Audio context
     * @returns {Object} Extended property values
     */
    _collectExtendedNodeProperties(context) {
        const attempt = (fn) => { try { return fn(); } catch (e) { return undefined; } };
        
        const analyser = context.createAnalyser();
        const oscillator = context.createOscillator();
        const dynamicsCompressor = context.createDynamicsCompressor();
        const biquadFilter = context.createBiquadFilter();

        const values = {
            // AnalyserNode properties
            'AnalyserNode.channelCount': attempt(() => analyser.channelCount),
            'AnalyserNode.channelCountMode': attempt(() => analyser.channelCountMode),
            'AnalyserNode.channelInterpretation': attempt(() => analyser.channelInterpretation),
            'AnalyserNode.context.sampleRate': attempt(() => analyser.context.sampleRate),
            'AnalyserNode.fftSize': attempt(() => analyser.fftSize),
            'AnalyserNode.frequencyBinCount': attempt(() => analyser.frequencyBinCount),
            'AnalyserNode.maxDecibels': attempt(() => analyser.maxDecibels),
            'AnalyserNode.minDecibels': attempt(() => analyser.minDecibels),
            'AnalyserNode.numberOfInputs': attempt(() => analyser.numberOfInputs),
            'AnalyserNode.numberOfOutputs': attempt(() => analyser.numberOfOutputs),
            'AnalyserNode.smoothingTimeConstant': attempt(() => analyser.smoothingTimeConstant),
            'AnalyserNode.context.listener.forwardX.maxValue': attempt(() => 
                analyser.context.listener?.forwardX?.maxValue
            ),
            // BiquadFilterNode properties
            'BiquadFilterNode.gain.maxValue': attempt(() => biquadFilter.gain.maxValue),
            'BiquadFilterNode.frequency.defaultValue': attempt(() => biquadFilter.frequency.defaultValue),
            'BiquadFilterNode.frequency.maxValue': attempt(() => biquadFilter.frequency.maxValue),
            // DynamicsCompressorNode properties
            'DynamicsCompressorNode.attack.defaultValue': attempt(() => dynamicsCompressor.attack.defaultValue),
            'DynamicsCompressorNode.knee.defaultValue': attempt(() => dynamicsCompressor.knee.defaultValue),
            'DynamicsCompressorNode.knee.maxValue': attempt(() => dynamicsCompressor.knee.maxValue),
            'DynamicsCompressorNode.ratio.defaultValue': attempt(() => dynamicsCompressor.ratio.defaultValue),
            'DynamicsCompressorNode.ratio.maxValue': attempt(() => dynamicsCompressor.ratio.maxValue),
            'DynamicsCompressorNode.release.defaultValue': attempt(() => dynamicsCompressor.release.defaultValue),
            'DynamicsCompressorNode.release.maxValue': attempt(() => dynamicsCompressor.release.maxValue),
            'DynamicsCompressorNode.threshold.defaultValue': attempt(() => dynamicsCompressor.threshold.defaultValue),
            'DynamicsCompressorNode.threshold.minValue': attempt(() => dynamicsCompressor.threshold.minValue),
            // OscillatorNode properties
            'OscillatorNode.detune.maxValue': attempt(() => oscillator.detune.maxValue),
            'OscillatorNode.detune.minValue': attempt(() => oscillator.detune.minValue),
            'OscillatorNode.frequency.defaultValue': attempt(() => oscillator.frequency.defaultValue),
            'OscillatorNode.frequency.maxValue': attempt(() => oscillator.frequency.maxValue),
            'OscillatorNode.frequency.minValue': attempt(() => oscillator.frequency.minValue),
        };

        // Cleanup
        try { analyser.disconnect(); } catch (e) {}
        try { oscillator.disconnect(); } catch (e) {}
        try { dynamicsCompressor.disconnect(); } catch (e) {}
        try { biquadFilter.disconnect(); } catch (e) {}

        return values;
    }

    /**
     * Detect AnalyserNode lie - getting frequency data before any audio is processed
     * Should return all -Infinity (silence), if not, audio API is tampered
     * 
     * @private
     * @param {AnalyserNode} analyser - Analyser node to test
     * @returns {Object} Lie detection result
     */
    _detectAnalyserLie(analyser) {
        try {
            const dataArray = new Float32Array(analyser.frequencyBinCount);
            analyser.getFloatFrequencyData?.(dataArray);
            const uniqueSize = new Set(dataArray).size;
            
            // Before any audio is processed, all values should be -Infinity
            // If we get more than 1 unique value, something is wrong
            if (uniqueSize > 1) {
                return {
                    lied: true,
                    reason: `expected -Infinity (silence) and got ${uniqueSize} frequencies`,
                    uniqueFrequencies: uniqueSize
                };
            }
            
            return { lied: false };
        } catch (e) {
            return { lied: false, error: e.message };
        }
    }

    /**
     * Generate audio fingerprint using OfflineAudioContext
     * Implementation aligned with PerimeterX methodology:
     * - Sine wave at 10kHz through DynamicsCompressor
     * - Sample indices 4500-5000 for consistent fingerprint
     * - Sum of absolute values as the primary signal
     * 
     * Enhanced with CreepJS techniques:
     * - Fake audio detection
     * - Noise factor detection
     * - Sample matching (getChannelData vs copyFromChannel)
     * - Extended node property collection
     * - Pattern validation against known engines
     * - AnalyserNode lie detection
     * 
     * @private
     * @param {Function} AudioContextClass - AudioContext constructor
     * @returns {Promise<Object>} Fingerprint data
     */
    async _generateFingerprint(AudioContextClass) {
        const startTime = performance.now();
        
        const sampleRate = this.config.sampleRate;
        const bufferLen = 5000; // CreepJS uses 5000 samples for triangle wave analysis
        const length = this.config.sampleLength;

        // === CREEPJS LIE DETECTION: Run parallel checks ===
        const [audioIsFake, noiseFactor] = await Promise.all([
            this._detectFakeAudio().catch(() => false),
            Promise.resolve(this._detectNoiseFactor())
        ]);

        // Create OfflineAudioContext for main fingerprint
        let offlineContext;
        try {
            offlineContext = new AudioContextClass(1, bufferLen, sampleRate);
        } catch (e) {
            try {
                offlineContext = new AudioContextClass({
                    numberOfChannels: 1,
                    length: bufferLen,
                    sampleRate: sampleRate
                });
            } catch (e2) {
                throw new Error(`Failed to create OfflineAudioContext: ${e2.message}`);
            }
        }

        const currentTime = offlineContext.currentTime || 0;

        // === CREEPJS: Collect extended node properties ===
        const extendedNodeProps = this._collectExtendedNodeProperties(offlineContext);

        // Create analyser for frequency/time domain data
        const analyser = offlineContext.createAnalyser();

        // === CREEPJS LIE DETECTION: Check for AnalyserNode lies ===
        const analyserLie = this._detectAnalyserLie(analyser);

        // Create oscillator (triangle wave at 10kHz - CreepJS uses triangle)
        const oscillator = offlineContext.createOscillator();
        oscillator.type = 'triangle'; // CreepJS uses triangle for more entropy
        oscillator.frequency.value = 10000;

        // Create compressor (creates unique audio signature per browser/device)
        const compressor = offlineContext.createDynamicsCompressor();
        try {
            compressor.threshold.value = -50;
            compressor.knee.value = 40;
            compressor.attack.value = 0;
        } catch (e) {}

        // Connect: oscillator -> compressor -> analyser -> destination
        oscillator.connect(compressor);
        compressor.connect(analyser);
        compressor.connect(offlineContext.destination);

        // Start oscillator
        oscillator.start(0);
        
        const setupTime = Math.round(performance.now() - startTime);
        const renderStartTime = performance.now();

        // Render the audio
        const renderedBuffer = await offlineContext.startRendering();
        
        const renderTime = Math.round(performance.now() - renderStartTime);

        // Disconnect nodes
        try { oscillator.disconnect(); } catch (e) {}
        try { compressor.disconnect(); } catch (e) {}

        // === CREEPJS: Get compressor gain reduction ===
        const compressorGainReduction = compressor.reduction?.value ?? compressor.reduction;

        // === CREEPJS: Get frequency and time domain data ===
        const floatFrequencyData = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData?.(floatFrequencyData);
        
        const floatTimeDomainData = new Float32Array(analyser.fftSize);
        if ('getFloatTimeDomainData' in analyser) {
            analyser.getFloatTimeDomainData(floatTimeDomainData);
        }

        // Calculate sums
        const getSum = (arr) => !arr ? 0 : [...arr].reduce((acc, curr) => acc += Math.abs(curr), 0);
        const floatFrequencyDataSum = getSum(floatFrequencyData);
        const floatTimeDomainDataSum = getSum(floatTimeDomainData);

        // === Extract channel data ===
        const channelData = renderedBuffer.getChannelData(0);
        
        // === CREEPJS: Get data via copyFromChannel for comparison ===
        const copy = new Float32Array(bufferLen);
        try {
            renderedBuffer.copyFromChannel?.(copy, 0);
        } catch (e) {}

        // === Calculate sample sums ===
        const rangeStart = 4500;
        const rangeEnd = bufferLen;
        
        // CreepJS-style sum (4500 to end)
        let sampleSum = 0;
        for (let i = rangeStart; i < rangeEnd && i < channelData.length; i++) {
            sampleSum += Math.abs(channelData[i]);
        }

        // PX-style sum (4500-5000 range)
        const pxRangeEnd = Math.min(5000, channelData.length);
        let pxSum = 0;
        for (let i = rangeStart; i < pxRangeEnd; i++) {
            pxSum += Math.abs(channelData[i]);
        }

        // === CREEPJS: Sample matching check ===
        const samplesMatch = this._checkSampleMatching(channelData, copy, 4500, 4600);
        const copyFromChannelSupported = 'copyFromChannel' in AudioBuffer.prototype;

        // === CREEPJS: Sample uniqueness check ===
        const totalUniqueSamples = new Set([...channelData]).size;
        const tooManyUniqueSamples = totalUniqueSamples === bufferLen;

        // === CREEPJS: Pattern validation ===
        const patternValidation = this._validateAudioPattern(
            compressorGainReduction,
            sampleSum,
            floatFrequencyDataSum,
            floatTimeDomainDataSum
        );

        // === Calculate noise from first 100 samples (fallback) ===
        const noiseFromSamples = noiseFactor || [...new Set(channelData.slice(0, 100))]
            .reduce((acc, n) => acc += n, 0);

        // === Aggregate lie detection ===
        let lied = false;
        const lies = [];

        if (audioIsFake) {
            lied = true;
            lies.push('audio-is-fake');
        }
        if (noiseFactor) {
            lied = true;
            lies.push('noise-factor-detected');
        }
        if (analyserLie.lied) {
            lied = true;
            lies.push('analyser-frequency-lie');
        }
        if (copyFromChannelSupported && !samplesMatch) {
            lied = true;
            lies.push('sample-mismatch');
        }
        if (tooManyUniqueSamples) {
            lies.push('too-many-unique-samples'); // Suspicious but not definitive lie
        }
        if (patternValidation.suspiciousPattern) {
            lies.push('suspicious-pattern-mismatch');
        }

        // Create fingerprint hash
        const fingerprintHash = fnv1a32(sampleSum.toString());
        const pxFingerprintHash = fnv1a32(pxSum.toString());

        // Trap score based on multiple factors
        const trapScore = (
            (!lied ? 0.5 : 0) +
            (samplesMatch ? 0.2 : 0) +
            (patternValidation.patternMatch ? 0.2 : 0) +
            (!tooManyUniqueSamples ? 0.1 : 0)
        );

        return {
            supported: true,
            
            // === PRIMARY FINGERPRINT (CreepJS style) ===
            sampleSum: sampleSum,
            hash: fingerprintHash,
            
            // === PX-STYLE FINGERPRINT ===
            pxSum: pxSum,
            pxHash: pxFingerprintHash,
            
            // === CREEPJS EXTENDED DATA ===
            compressorGainReduction: compressorGainReduction,
            floatFrequencyDataSum: floatFrequencyDataSum,
            floatTimeDomainDataSum: floatTimeDomainDataSum,
            totalUniqueSamples: totalUniqueSamples,
            
            // === LIE DETECTION ===
            lied: lied,
            lies: lies,
            audioIsFake: audioIsFake,
            noiseFactor: noiseFactor,
            noiseFromSamples: noiseFromSamples,
            analyserLie: analyserLie,
            samplesMatch: samplesMatch,
            
            // === PATTERN VALIDATION ===
            patternValidation: patternValidation,
            detectedEngine: patternValidation.knownEngine,
            patternMatch: patternValidation.patternMatch,
            
            // === INTEGRITY ===
            trap: trapScore,
            trapValue: AUDIO_TRAP,
            
            // === EXTENDED NODE PROPERTIES (for engine fingerprinting) ===
            extendedNodeProps: extendedNodeProps,
            extendedNodePropsHash: fnv1a32(JSON.stringify(extendedNodeProps)),
            
            // === TIMING ===
            setupTimeMs: setupTime,
            renderTimeMs: renderTime,
            
            // === CONFIG ===
            config: {
                oscillatorType: 'triangle',
                oscillatorFrequency: 10000,
                sampleRate: sampleRate,
                bufferLength: bufferLen,
                sampleRange: `${rangeStart}-${rangeEnd}`
            }
        };
    }

    /**
     * Set audio parameter value (handles old and new API)
     * @private
     * @param {AudioParam} param - Audio parameter object
     * @param {number} value - Value to set
     * @param {number} time - Time to set at
     */
    _setAudioParam(param, value, time) {
        if (!param) return;
        
        if (typeof param.setValueAtTime === 'function') {
            param.setValueAtTime(value, time);
        } else {
            param.value = value;
        }
    }

    /**
     * Analyze audio fingerprint for suspicious patterns
     * @private
     */
    _analyzeForSuspiciousPatterns(result) {
        this.suspiciousIndicators = [];
        
        const { systemParams, offlineFingerprint } = result;

        // === SYSTEM PARAMETER ANOMALIES ===
        if (systemParams) {
            // Check for missing AudioContext support
            if (!systemParams.supported) {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_context_unsupported',
                    description: 'AudioContext not supported - unusual for modern browsers',
                    severity: 'MEDIUM',
                    confidence: 0.6,
                    details: systemParams.error || 'Unknown error'
                });
            } else {
                // Check for unusual sample rate (most common: 44100, 48000)
                const commonSampleRates = [44100, 48000, 96000, 22050];
                if (!commonSampleRates.includes(systemParams.sampleRate)) {
                    this.suspiciousIndicators.push({
                        category: 'audio',
                        name: 'audio_unusual_sample_rate',
                        description: 'Unusual audio sample rate detected',
                        severity: 'LOW',
                        confidence: 0.5,
                        details: `Sample rate: ${systemParams.sampleRate}`
                    });
                }
                
                // Check for zero maxChannelCount (no audio output capability)
                if (systemParams.destination?.maxChannelCount === 0) {
                    this.suspiciousIndicators.push({
                        category: 'audio',
                        name: 'audio_no_output_channels',
                        description: 'No audio output channels - headless/automation indicator',
                        severity: 'MEDIUM',
                        confidence: 0.7,
                        details: 'maxChannelCount is 0'
                    });
                }
                
                // Check for missing baseLatency (older browsers or mock)
                if (systemParams.baseLatency === undefined || systemParams.baseLatency === null) {
                    this.suspiciousIndicators.push({
                        category: 'audio',
                        name: 'audio_missing_latency',
                        description: 'baseLatency not available - may indicate mocked API',
                        severity: 'LOW',
                        confidence: 0.4,
                        details: 'baseLatency is undefined'
                    });
                }
                
                // Check for zero outputLatency combined with other signals
                if (systemParams.outputLatency === 0 && systemParams.destination?.maxChannelCount === 0) {
                    this.suspiciousIndicators.push({
                        category: 'audio',
                        name: 'audio_headless_pattern',
                        description: 'Audio parameters suggest headless/virtual environment',
                        severity: 'HIGH',
                        confidence: 0.75,
                        details: 'Zero output latency with zero channel count'
                    });
                }
            }
        }

        // === OFFLINE FINGERPRINT ANOMALIES ===
        if (offlineFingerprint) {
            if (offlineFingerprint.error) {
                // Offline fingerprint failed but system params worked
                if (systemParams?.supported) {
                    this.suspiciousIndicators.push({
                        category: 'audio',
                        name: 'audio_offline_failed',
                        description: 'OfflineAudioContext failed while AudioContext works',
                        severity: 'LOW',
                        confidence: 0.5,
                        details: offlineFingerprint.error
                    });
                }
                return;
            }

            // === CREEPJS LIE DETECTION ===
            if (offlineFingerprint.lied) {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_tampering_detected',
                    description: 'Audio API tampering/lies detected (CreepJS)',
                    severity: 'CRITICAL',
                    confidence: 0.95,
                    details: `Lies: ${offlineFingerprint.lies?.join(', ') || 'unknown'}`
                });
            }

            if (offlineFingerprint.audioIsFake) {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_fake_buffer',
                    description: 'Silent oscillator test detected fake audio buffer',
                    severity: 'CRITICAL',
                    confidence: 0.9,
                    details: 'Zero-frequency oscillator should produce zeros, but got noise'
                });
            }

            if (offlineFingerprint.noiseFactor) {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_noise_injection',
                    description: 'Audio buffer noise injection detected',
                    severity: 'HIGH',
                    confidence: 0.85,
                    details: `Noise factor: ${offlineFingerprint.noiseFactor}`
                });
            }

            if (offlineFingerprint.samplesMatch === false) {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_sample_mismatch',
                    description: 'getChannelData and copyFromChannel samples do not match',
                    severity: 'HIGH',
                    confidence: 0.85,
                    details: 'Audio buffer methods return inconsistent data'
                });
            }

            if (offlineFingerprint.analyserLie?.lied) {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_analyser_lie',
                    description: 'AnalyserNode returned non-silent data before processing',
                    severity: 'HIGH',
                    confidence: 0.8,
                    details: offlineFingerprint.analyserLie.reason
                });
            }

            if (offlineFingerprint.totalUniqueSamples === 5000) {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_too_unique',
                    description: 'All audio samples are unique - suspicious pattern',
                    severity: 'MEDIUM',
                    confidence: 0.6,
                    details: '5000 unique samples out of 5000 is statistically improbable'
                });
            }

            // Check trap score (integrity verification)
            if (offlineFingerprint.trap < 0.5) {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_integrity_mismatch',
                    description: 'Audio fingerprint data integrity check failed',
                    severity: 'HIGH',
                    confidence: 0.8,
                    details: `Trap score: ${offlineFingerprint.trap}`
                });
            }

            // Pattern validation
            if (offlineFingerprint.patternValidation?.suspiciousPattern) {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_pattern_mismatch',
                    description: 'Audio pattern mismatch between simple and extended validation',
                    severity: 'MEDIUM',
                    confidence: 0.7,
                    details: `Expected engine: ${offlineFingerprint.detectedEngine}, gain: ${offlineFingerprint.compressorGainReduction}`
                });
            }

            // Check for zero sum (all silent - suspicious)
            const sampleSum = offlineFingerprint.sampleSum ?? offlineFingerprint.sum;
            if (sampleSum === 0) {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_silent_output',
                    description: 'Audio rendering produced silent output',
                    severity: 'MEDIUM',
                    confidence: 0.7,
                    details: 'Sum of samples is zero, indicating possible mocked audio API'
                });
            }

            // Check for known mocked/spoofed patterns
            if (offlineFingerprint.hash === '00000000' || offlineFingerprint.hash === 'ffffffff') {
                this.suspiciousIndicators.push({
                    category: 'audio',
                    name: 'audio_spoofed_hash',
                    description: 'Audio fingerprint hash indicates spoofed data',
                    severity: 'HIGH',
                    confidence: 0.9,
                    details: `Suspicious hash pattern: ${offlineFingerprint.hash}`
                });
            }
        }
    }

    /**
     * Format metrics for fingerprint output
     * Combines system parameters and offline fingerprint into unified metrics
     * 
     * FOCUS: OS/System-level audio parameters for automation detection
     * - System parameters always available (even on headless)
     * - Offline fingerprint for additional clustering when available
     * 
     * @private
     */
    _formatMetrics(result) {
        const { systemParams, offlineFingerprint, collectionTime } = result;
        const metrics = {};
        
        // === AUDIO API SUPPORT ===
        metrics.audioContextSupported = {
            value: systemParams?.supported ?? false,
            description: 'Live AudioContext API availability'
        };
        
        metrics.offlineAudioContextSupported = {
            value: offlineFingerprint?.supported ?? false,
            description: 'OfflineAudioContext API availability'
        };
        
        // === SYSTEM PARAMETERS (OS/Driver level - primary for automation detection) ===
        if (systemParams?.supported) {
            // Core system parameters
            metrics.audioSampleRate = {
                value: systemParams.sampleRate,
                description: 'OS default audio sample rate (Hz) - OS/driver specific'
            };
            
            metrics.audioState = {
                value: systemParams.state,
                description: 'AudioContext initial state'
            };
            
            metrics.audioBaseLatency = {
                value: systemParams.baseLatency,
                description: 'Audio system base latency (seconds) - OS/driver specific'
            };
            
            metrics.audioOutputLatency = {
                value: systemParams.outputLatency,
                description: 'Audio output latency (seconds) - 0 if no output device'
            };
            
            // Destination parameters
            if (systemParams.destination) {
                metrics.audioMaxChannelCount = {
                    value: systemParams.destination.maxChannelCount,
                    description: 'Max audio output channels (2=stereo, 6=5.1, 8=7.1) - hardware/driver'
                };
                
                metrics.audioChannelCount = {
                    value: systemParams.destination.channelCount,
                    description: 'Current audio channel count'
                };
                
                metrics.audioChannelCountMode = {
                    value: systemParams.destination.channelCountMode,
                    description: 'Channel count mode: max, clamped-max, or explicit'
                };
                
                metrics.audioChannelInterpretation = {
                    value: systemParams.destination.channelInterpretation,
                    description: 'Channel interpretation mode: speakers or discrete'
                };
            }
            
            // Audio Worklet availability
            metrics.audioWorkletAvailable = {
                value: systemParams.audioWorkletAvailable,
                description: 'AudioWorklet API availability (modern audio API)'
            };
            
            // AnalyserNode defaults (can vary by browser/version)
            if (systemParams.analyserDefaults) {
                metrics.audioAnalyserFFTSize = {
                    value: systemParams.analyserDefaults.fftSize,
                    description: 'Default AnalyserNode FFT size'
                };
                
                metrics.audioAnalyserFrequencyBinCount = {
                    value: systemParams.analyserDefaults.frequencyBinCount,
                    description: 'AnalyserNode frequency bin count'
                };
                
                metrics.audioAnalyserMinDecibels = {
                    value: systemParams.analyserDefaults.minDecibels,
                    description: 'AnalyserNode min decibels threshold'
                };
                
                metrics.audioAnalyserMaxDecibels = {
                    value: systemParams.analyserDefaults.maxDecibels,
                    description: 'AnalyserNode max decibels threshold'
                };
                
                metrics.audioAnalyserSmoothing = {
                    value: systemParams.analyserDefaults.smoothingTimeConstant,
                    description: 'AnalyserNode smoothing time constant'
                };
            }
            
            // BiquadFilter defaults
            if (systemParams.biquadDefaults) {
                metrics.audioBiquadType = {
                    value: systemParams.biquadDefaults.type,
                    description: 'Default BiquadFilterNode type'
                };
                
                metrics.audioBiquadFrequency = {
                    value: systemParams.biquadDefaults.frequency,
                    description: 'Default BiquadFilterNode frequency'
                };
                
                metrics.audioBiquadQ = {
                    value: systemParams.biquadDefaults.Q,
                    description: 'Default BiquadFilterNode Q factor'
                };
            }
            
            // Oscillator defaults
            if (systemParams.oscillatorDefaults) {
                metrics.audioOscillatorType = {
                    value: systemParams.oscillatorDefaults.type,
                    description: 'Default OscillatorNode type'
                };
                
                metrics.audioOscillatorFrequency = {
                    value: systemParams.oscillatorDefaults.frequency,
                    description: 'Default OscillatorNode frequency'
                };
            }
            
            // Compressor defaults
            if (systemParams.compressorDefaults) {
                metrics.audioCompressorThreshold = {
                    value: systemParams.compressorDefaults.threshold,
                    description: 'Default DynamicsCompressor threshold'
                };
                
                metrics.audioCompressorKnee = {
                    value: systemParams.compressorDefaults.knee,
                    description: 'Default DynamicsCompressor knee'
                };
                
                metrics.audioCompressorRatio = {
                    value: systemParams.compressorDefaults.ratio,
                    description: 'Default DynamicsCompressor ratio'
                };
            }
            
            // WaveShaper defaults
            if (systemParams.waveShaperDefaults) {
                metrics.audioWaveShaperOversample = {
                    value: systemParams.waveShaperDefaults.oversample,
                    description: 'Default WaveShaperNode oversample mode'
                };
            }
            
            // System param collection time
            metrics.audioSystemParamTimeMs = {
                value: systemParams.collectionTimeMs,
                description: 'System parameter collection time (ms)'
            };
        } else if (systemParams?.error) {
            metrics.audioSystemError = {
                value: systemParams.error,
                description: 'Error collecting audio system parameters'
            };
        }
        
        // === OFFLINE FINGERPRINT (Enhanced with CreepJS) ===
        if (offlineFingerprint?.supported && !offlineFingerprint.error) {
            // Primary fingerprints
            metrics.audioFingerprintSum = {
                value: offlineFingerprint.sampleSum ?? offlineFingerprint.sum,
                description: 'Sum of audio samples (CreepJS methodology)',
                risk: 'Low'
            };
            
            metrics.audioFingerprintHash = {
                value: offlineFingerprint.hash,
                description: 'FNV-1a hash of audio fingerprint',
                risk: 'Low'
            };
            
            metrics.audioPxSum = {
                value: offlineFingerprint.pxSum,
                description: 'Sum of samples 4500-5000 (PX methodology)',
                risk: 'Low'
            };
            
            metrics.audioPxHash = {
                value: offlineFingerprint.pxHash,
                description: 'FNV-1a hash of PX-style fingerprint',
                risk: 'Low'
            };
            
            // CreepJS Extended Data
            metrics.audioCompressorGainReduction = {
                value: offlineFingerprint.compressorGainReduction,
                description: 'DynamicsCompressor gain reduction - engine-specific value',
                risk: 'Low'
            };
            
            metrics.audioFloatFrequencySum = {
                value: offlineFingerprint.floatFrequencyDataSum,
                description: 'Sum of float frequency data from AnalyserNode',
                risk: 'Low'
            };
            
            metrics.audioFloatTimeDomainSum = {
                value: offlineFingerprint.floatTimeDomainDataSum,
                description: 'Sum of float time domain data from AnalyserNode',
                risk: 'Low'
            };
            
            metrics.audioTotalUniqueSamples = {
                value: offlineFingerprint.totalUniqueSamples,
                description: 'Number of unique audio samples - too many indicates tampering',
                risk: offlineFingerprint.totalUniqueSamples === 5000 ? 'High' : 'Low'
            };
            
            // Lie Detection Results
            metrics.audioLied = {
                value: offlineFingerprint.lied,
                description: 'Audio API tampering detected',
                risk: offlineFingerprint.lied ? 'Critical' : 'Low'
            };
            
            metrics.audioLies = {
                value: offlineFingerprint.lies?.join(', ') || 'none',
                description: 'Types of audio lies/tampering detected',
                risk: offlineFingerprint.lies?.length > 0 ? 'High' : 'Low'
            };
            
            metrics.audioIsFake = {
                value: offlineFingerprint.audioIsFake,
                description: 'Silent oscillator test detected fake audio buffer',
                risk: offlineFingerprint.audioIsFake ? 'Critical' : 'Low'
            };
            
            metrics.audioNoiseFactor = {
                value: offlineFingerprint.noiseFactor,
                description: 'Audio buffer noise injection detected (0 = clean)',
                risk: offlineFingerprint.noiseFactor ? 'High' : 'Low'
            };
            
            metrics.audioSamplesMatch = {
                value: offlineFingerprint.samplesMatch,
                description: 'getChannelData matches copyFromChannel',
                risk: offlineFingerprint.samplesMatch === false ? 'High' : 'Low'
            };
            
            if (offlineFingerprint.analyserLie?.lied) {
                metrics.audioAnalyserLied = {
                    value: true,
                    description: offlineFingerprint.analyserLie.reason,
                    risk: 'High'
                };
            }
            
            // Pattern Validation
            metrics.audioDetectedEngine = {
                value: offlineFingerprint.detectedEngine || 'unknown',
                description: 'Detected browser engine from audio pattern (blink/gecko/webkit)',
                risk: 'Low'
            };
            
            metrics.audioPatternMatch = {
                value: offlineFingerprint.patternMatch,
                description: 'Audio pattern matches known browser engine values',
                risk: offlineFingerprint.patternMatch ? 'Low' : 'Medium'
            };
            
            if (offlineFingerprint.patternValidation?.suspiciousPattern) {
                metrics.audioSuspiciousPattern = {
                    value: true,
                    description: 'Audio pattern mismatch between simple and extended validation',
                    risk: 'Medium'
                };
            }
            
            // Integrity
            metrics.audioFingerprintTrap = {
                value: offlineFingerprint.trap,
                description: 'Audio integrity score (1.0 = fully verified)',
                risk: this._assessTrapRisk(offlineFingerprint.trap)
            };
            
            metrics.audioTrapValue = {
                value: offlineFingerprint.trapValue,
                description: 'Random trap value used for noise detection',
                risk: 'N/A'
            };
            
            // Extended Node Properties Hash
            metrics.audioExtendedPropsHash = {
                value: offlineFingerprint.extendedNodePropsHash,
                description: 'Hash of all audio node default properties (engine fingerprint)',
                risk: 'Low'
            };
            
            // Timing
            metrics.audioFingerprintRenderTimeMs = {
                value: offlineFingerprint.renderTimeMs,
                description: 'Audio render time - spoofing indicator if < 50ms',
                risk: offlineFingerprint.renderTimeMs < 4 ? 'Medium' : 'Low'
            };
            
            metrics.audioFingerprintSetupTimeMs = {
                value: offlineFingerprint.setupTimeMs,
                description: 'Audio context and node setup time (ms)',
                risk: 'N/A'
            };
        } else if (offlineFingerprint?.error) {
            metrics.audioFingerprintError = {
                value: offlineFingerprint.error,
                description: 'Error generating offline audio fingerprint',
                risk: 'Medium'
            };
        }
        
        // === TOTAL COLLECTION TIME ===
        metrics.audioTotalCollectionTimeMs = {
            value: collectionTime,
            description: 'Total audio fingerprint collection time (ms)',
            risk: 'N/A'
        };
        
        return metrics;
    }

    /**
     * Assess risk level based on trap score
     * @private
     */
    _assessTrapRisk(trap) {
        if (trap < 0.5) return 'HIGH';
        if (trap < 0.8) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Get formatted results for inclusion in fingerprint
     * @returns {Object} Formatted audio metrics
     */
    getFormattedResults() {
        return {
            audioFingerprint: this.metrics
        };
    }

    /**
     * Get suspicious indicators related to audio fingerprinting
     * @returns {Array} Array of suspicious indicator objects
     */
    getSuspiciousIndicators() {
        return this.suspiciousIndicators;
    }

    /**
     * Get raw audio fingerprint data (offline fingerprint)
     * @returns {Object|null} Raw fingerprint data or null
     */
    getRawFingerprint() {
        return this.audioFingerprint;
    }
    
    /**
     * Get raw audio system parameters
     * @returns {Object|null} Raw system parameters or null
     */
    getRawSystemParams() {
        return this.systemParams;
    }

    /**
     * Quick audio fingerprint check (for lightweight detection)
     * @returns {Promise<string|null>} Audio hash or null on failure
     */
    async quickHash() {
        try {
            const result = await this.collectAudioFingerprint();
            return result.hash || null;
        } catch (e) {
            return null;
        }
    }
    
    /**
     * Quick system parameter check (for lightweight detection)
     * Returns key OS-level audio metrics without full fingerprinting
     * 
     * @returns {Promise<Object|null>} Key system params or null on failure
     */
    async quickSystemParams() {
        try {
            const params = await this._collectAudioSystemParams();
            if (!params.supported) return null;
            
            return {
                sampleRate: params.sampleRate,
                baseLatency: params.baseLatency,
                outputLatency: params.outputLatency,
                maxChannelCount: params.destination?.maxChannelCount,
                channelCount: params.destination?.channelCount,
                audioWorkletAvailable: params.audioWorkletAvailable
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Compare two audio fingerprints for similarity
     * Uses hash match as primary comparison (aligned with PX approach)
     * 
     * @param {Object} fp1 - First fingerprint
     * @param {Object} fp2 - Second fingerprint
     * @returns {Object} Comparison result
     */
    static compare(fp1, fp2) {
        if (!fp1 || !fp2 || fp1.error || fp2.error) {
            return { match: false, reason: 'Invalid fingerprints' };
        }

        const hashMatch = fp1.hash === fp2.hash;
        const sumDiff = Math.abs(fp1.sum - fp2.sum);
        
        // Fingerprints are considered matching if hash matches
        // Close match: sum difference is within 1% tolerance
        const sumTolerance = Math.max(fp1.sum, fp2.sum) * 0.01;
        const closeMatch = sumDiff < sumTolerance;

        return {
            match: hashMatch,
            closeMatch: closeMatch,
            hashMatch: hashMatch,
            sumDifference: sumDiff
        };
    }
    
    /**
     * Compare two audio system parameter sets for similarity
     * Focuses on OS-level parameters that should be consistent for same machine
     * 
     * @param {Object} params1 - First system params
     * @param {Object} params2 - Second system params
     * @returns {Object} Comparison result
     */
    static compareSystemParams(params1, params2) {
        if (!params1?.supported || !params2?.supported) {
            return { match: false, reason: 'Invalid system params' };
        }
        
        // Core OS-level parameters that should match for same machine
        const coreMatch = 
            params1.sampleRate === params2.sampleRate &&
            params1.destination?.maxChannelCount === params2.destination?.maxChannelCount;
        
        // Latency can vary slightly, check if within 10%
        const latencyMatch = params1.baseLatency !== undefined && params2.baseLatency !== undefined ?
            Math.abs(params1.baseLatency - params2.baseLatency) < Math.max(params1.baseLatency, params2.baseLatency) * 0.1 :
            true; // If undefined in both, consider match
        
        return {
            match: coreMatch && latencyMatch,
            coreMatch,
            latencyMatch,
            sampleRateMatch: params1.sampleRate === params2.sampleRate,
            maxChannelMatch: params1.destination?.maxChannelCount === params2.destination?.maxChannelCount
        };
    }
}

export { AudioFingerprintDetector, AUDIO_CONFIG, fnv1a32 };
