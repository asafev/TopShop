/**
 * Fingerprint UI - Configuration & Constants
 * Central location for all UI configuration, icons, labels, and mappings
 */

import { getCategoryIcon } from '../utils/icons.js';

// Helper to get icon dynamically
function getIcon(categoryKey) {
    return getCategoryIcon(categoryKey);
}

export const CATEGORY_CONFIG = {
    navigator: {
        get icon() { return getIcon('navigator'); },
        iconType: 'svg',
        label: 'Navigator Properties',
        description: 'Browser identification and configuration information',
        color: '#3B82F6'
    },
    display: {
        get icon() { return getIcon('display'); },
        iconType: 'svg',
        label: 'Display & Screen',
        description: 'Screen resolution, color depth, and display capabilities',
        color: '#10B981'
    },
    window: {
        get icon() { return getIcon('window'); },
        iconType: 'svg',
        label: 'Window Properties',
        description: 'Browser window dimensions and positioning',
        color: '#06B6D4'
    },
    automation: {
        get icon() { return getIcon('automation'); },
        iconType: 'svg',
        label: 'Automation Detection',
        description: 'Indicators of browser automation tools',
        color: '#EF4444'
    },
    jsEnvironment: {
        get icon() { return getIcon('jsEnvironment'); },
        iconType: 'svg',
        label: 'JavaScript Environment',
        description: 'JavaScript API availability and behavior',
        color: '#F59E0B'
    },
    performance: {
        get icon() { return getIcon('performance'); },
        iconType: 'svg',
        label: 'Performance Metrics',
        description: 'Memory, timing, and performance data',
        color: '#F97316'
    },
    webApis: {
        get icon() { return getIcon('webApis'); },
        iconType: 'svg',
        label: 'Web APIs',
        description: 'Available web platform APIs',
        color: '#14B8A6'
    },
    document: {
        get icon() { return getIcon('document'); },
        iconType: 'svg',
        label: 'Document Properties',
        description: 'DOM and document characteristics',
        color: '#6B7280'
    },
    security: {
        get icon() { return getIcon('security'); },
        iconType: 'svg',
        label: 'Security Features',
        description: 'Security context and permissions',
        color: '#EC4899'
    },
    functionIntegrity: {
        get icon() { return getIcon('functionIntegrity'); },
        iconType: 'svg',
        label: 'Function Integrity',
        description: 'Detection of modified native browser functions (only showing violations)',
        color: '#EF4444'
    },
    stringSignatureAutomation: {
        get icon() { return getIcon('stringSignatureAutomation'); },
        iconType: 'svg',
        label: 'String Signature Analysis',
        description: 'Function signature comparisons for automation detection',
        color: '#3B82F6'
    },
    behavioralIndicators: {
        get icon() { return getIcon('behavioralIndicators'); },
        iconType: 'svg',
        label: 'Behavioral Indicators',
        description: 'User interaction pattern analysis',
        color: '#8B5CF6'
    },
    behavioralTelemetry: {
        get icon() { return getIcon('behavioralTelemetry'); },
        iconType: 'svg',
        label: 'Behavioral Telemetry',
        description: 'Raw behavioral measurement data',
        color: '#A855F7'
    },
    webRTCLeak: {
        get icon() { return getIcon('webRTCLeak'); },
        iconType: 'svg',
        label: 'WebRTC Leak Detection',
        description: 'IP address and network leak detection via WebRTC',
        color: '#06B6D4'
    },
    webgl: {
        get icon() { return getIcon('webgl'); },
        iconType: 'svg',
        label: 'WebGL Fingerprint',
        description: 'WebGL rendering and GPU information',
        color: '#8B5CF6'
    },
    speechSynthesis: {
        get icon() { return getIcon('speechSynthesis'); },
        iconType: 'svg',
        label: 'Speech Synthesis',
        description: 'Text-to-speech voice fingerprinting',
        color: '#F97316'
    },
    language: {
        get icon() { return getIcon('language'); },
        iconType: 'svg',
        label: 'Language Detection',
        description: 'Language and locale configuration',
        color: '#3B82F6'
    },
    cssComputedStyle: {
        get icon() { return getIcon('cssComputedStyle'); },
        iconType: 'svg',
        label: 'CSS Computed Styles',
        description: 'CSS rendering characteristics',
        color: '#10B981'
    },
    workerSignals: {
        get icon() { return getIcon('workerSignals'); },
        iconType: 'svg',
        label: 'Worker Signals',
        description: 'Web Worker and Service Worker detection',
        color: '#A855F7'
    },
    fonts: {
        get icon() { return getIcon('fonts'); },
        iconType: 'svg',
        label: 'Font Detection',
        description: 'Installed system fonts fingerprint',
        color: '#F59E0B'
    },
    audio: {
        get icon() { return getIcon('audio'); },
        iconType: 'svg',
        label: 'Audio Fingerprint',
        description: 'AudioContext and audio processing fingerprint',
        color: '#3B82F6'
    },
    cdpSignals: {
        get icon() { return getIcon('cdpSignals'); },
        iconType: 'svg',
        label: 'CDP Signals',
        description: 'Chrome DevTools Protocol detection',
        color: '#EF4444'
    },
    battery: {
        get icon() { return getIcon('battery'); },
        iconType: 'svg',
        label: 'Battery Information',
        description: 'Battery API and power status',
        color: '#10B981'
    },
    network: {
        get icon() { return getIcon('network'); },
        iconType: 'svg',
        label: 'Network Capabilities',
        description: 'Network connection and bandwidth info',
        color: '#06B6D4'
    },
    performanceTiming: {
        get icon() { return getIcon('performanceTiming'); },
        iconType: 'svg',
        label: 'Performance Timing',
        description: 'Navigation, paint, and first-input timing metrics for actor clustering',
        color: '#F97316'
    },
    keyboardLayout: {
        get icon() { return getIcon('keyboardLayout'); },
        iconType: 'svg',
        label: 'Keyboard Layout',
        description: 'Physical keyboard locale fingerprint (hard to spoof)',
        color: '#8B5CF6'
    },
    collectionTiming: {
        get icon() { return getIcon('collectionTiming'); },
        iconType: 'svg',
        label: 'Collection Timing',
        description: 'Time taken by each fingerprint detector during analysis',
        color: '#F97316'
    },
    stackTraceFingerprint: {
        get icon() { return getIcon('stackTraceFingerprint'); },
        iconType: 'svg',
        label: 'Stack Trace Fingerprint',
        description: 'Error.stack format analysis for emulated Chromium clustering',
        color: '#9333EA'
    },
    iframeAnalysis: {
        get icon() { return getIcon('iframeAnalysis'); },
        iconType: 'svg',
        label: 'Iframe Analysis',
        description: 'Iframe contentWindow integrity and fresh window environment tests',
        color: '#DC2626'
    }
};

export const RISK_LEVELS = {
    HIGH: {
        label: 'High',
        icon: '🚨',
        className: 'high',
        color: '#EF4444'
    },
    MEDIUM: {
        label: 'Medium',
        icon: '⚠️',
        className: 'medium',
        color: '#F59E0B'
    },
    LOW: {
        label: 'Low',
        icon: '💡',
        className: 'low',
        color: '#10B981'
    },
    NONE: {
        label: 'N/A',
        icon: '⚪',
        className: 'none',
        color: '#6B7280'
    },
    'N/A': {
        label: 'N/A',
        icon: '⚪',
        className: 'na',
        color: '#6B7280'
    }
};

export const IMPORTANCE_LEVELS = {
    CRITICAL: {
        label: 'Critical',
        icon: '🔴',
        color: '#EF4444'
    },
    STRONG: {
        label: 'Strong',
        icon: '🟡',
        color: '#F59E0B'
    },
    WEAK: {
        label: 'Weak',
        icon: '🔵',
        color: '#6B7280'
    }
};

export const JS_CODE_MAP = {
    // Navigator
    'userAgent': 'navigator.userAgent',
    'appCodeName': 'navigator.appCodeName',
    'cookieEnabled': 'navigator.cookieEnabled',
    'platform': 'navigator.platform',
    'language': 'navigator.language',
    'webdriver': 'navigator.webdriver',
    'maxTouchPoints': 'navigator.maxTouchPoints',
    'onLine': 'navigator.onLine',
    'buildID': 'navigator.buildID',
    'hardwareConcurrency': 'navigator.hardwareConcurrency',
    'mimeTypesLength': 'navigator.mimeTypes.length',
    'pluginsLength': 'navigator.plugins.length',
    'product': 'navigator.product',
    'appVersion': 'navigator.appVersion',
    'vendor': 'navigator.vendor',
    'vendorSub': 'navigator.vendorSub',
    'productSub': 'navigator.productSub',
    'doNotTrack': 'navigator.doNotTrack',
    
    // Display
    'colorDepth': 'screen.colorDepth',
    'width': 'screen.width',
    'height': 'screen.height',
    'availWidth': 'screen.availWidth',
    'availHeight': 'screen.availHeight',
    'pixelDepth': 'screen.pixelDepth',
    'orientation': 'screen.orientation.type',
    
    // Window
    'innerWidth': 'window.innerWidth',
    'innerHeight': 'window.innerHeight',
    'outerWidth': 'window.outerWidth',
    'outerHeight': 'window.outerHeight',
    'screenTop': 'window.screenTop',
    'screenLeft': 'window.screenLeft',
    'devicePixelRatio': 'window.devicePixelRatio',
    'historyLength': 'history.length',
    
    // Performance
    'memoryLimit': 'performance.memory.jsHeapSizeLimit',
    'usedMemory': 'performance.memory.usedJSHeapSize',
    'totalMemory': 'performance.memory.totalJSHeapSize',
    'timezoneOffset': 'new Date().getTimezoneOffset()',
    
    // WebRTC
    'hasRTCPeerConnection': 'typeof RTCPeerConnection !== "undefined"',
    'localAddresses': 'ICE host candidate addresses',
    'publicAddresses': 'ICE srflx candidate addresses',
    'candidateCount': 'Total ICE candidates',
    
    // Default fallback handled in getJsCode function
};

export const TELEMETRY_DESCRIPTIONS = {
    totalMouseMoves: 'Total number of mouse movement events tracked',
    totalClicks: 'Total number of click events recorded',
    totalScrolls: 'Total number of scroll events recorded',
    totalMouseDistance: 'Total distance traveled by mouse cursor in pixels',
    averageMouseVelocity: 'Average mouse movement velocity (pixels/ms)',
    maxMouseVelocity: 'Maximum mouse movement velocity (pixels/ms)',
    mouseMovementCount: 'Number of discrete mouse movements tracked',
    averageClickInterval: 'Average time between clicks in milliseconds',
    clickRate: 'Number of clicks per second',
    totalScrollDistance: 'Total scroll distance in pixels',
    averageScrollDistance: 'Average distance per scroll event in pixels',
    averageScrollInterval: 'Average time between scroll events in milliseconds',
    scrollRate: 'Number of scroll events per second',
    collectionDurationMs: 'Total behavioral data collection duration in milliseconds',
    collectionDurationSec: 'Total behavioral data collection duration in seconds',
    eventsPerSecond: 'Total interaction events (mouse + click + scroll) per second',
    mouseToClickRatio: 'Ratio of mouse movements to clicks',
    hasMouseActivity: 'Whether any mouse movement was detected',
    hasClickActivity: 'Whether any click events were detected',
    hasScrollActivity: 'Whether any scroll events were detected'
};

export const BEHAVIORAL_INDICATOR_NAMES = {
    'centralButtonClicks': 'Central Button Clicks',
    'clicksWithoutMouseMovement': 'Clicks Without Mouse Movement',
    'nonHumanScrolling': 'Non-Human Scrolling',
    'artificialTiming': 'Artificial Timing Patterns',
    'missingMouseTrails': 'Missing Mouse Trails'
};
