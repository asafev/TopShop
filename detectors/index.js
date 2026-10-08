/**
 * Index file for detectors module
 * Exports all detector classes for easy importing
 * 
 * @module detectors
 */

export { NetworkCapabilitiesDetector } from './networkCapabilities.js';
export { BatteryStorageDetector } from './batteryStorage.js';
export { ActiveMeasurementsDetector, ACTIVE_MEASUREMENTS_CONFIG } from './activeMeasurements.js';
export { initCdpSignals } from './cdpSignals.js';
export { AudioFingerprintDetector, AUDIO_CONFIG } from './audioFingerprint.js';
export { WebRTCLeakDetector, WEBRTC_CONFIG } from './webRTCLeak.js';
export { WebGLFingerprintDetector } from './webGLfingerprint.js';
export { SpeechSynthesisDetector } from './speechSynthesis.js';
export { LanguageDetector } from './languageDetector.js';
export { CssComputedStyleDetector } from './cssComputedStyle.js';
export { WorkerSignalsDetector } from './workerSignals.js';
export { FontsDetector } from './fonts.js';
export { PerformanceTimingDetector, PERFORMANCE_TIMING_CONFIG } from './performanceTiming.js';
export { KeyboardLayoutDetector } from './keyboardLayout.js';
export { PermissionsDetector, PERMISSION_NAMES } from './permissionsDetector.js';
export { CodecSupportDetector, CODEC_CONFIG } from './codecSupport.js';
export { StackTraceFingerprintDetector, STACK_TRACE_FINGERPRINT_CONFIG } from './stackTraceFingerprint.js';
export { IframeDetector, IFRAME_DETECTOR_CONFIG, detectIframeAnomalies } from './iframeDetector.js';
export { 
    CreepjsEnhancedDetector,
    MathFingerprintDetector,
    DOMRectFingerprintDetector,
    CSSMediaFingerprintDetector,
    IntlFingerprintDetector
} from './creepjsEnhanced.js';
