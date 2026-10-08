/**
 * Fingerprint UI - Refined Icon System v2.0
 * Enterprise Research Grade - Minimal Geometric Icons
 * 2026 Edition - No AI-ish aesthetics, pure functionality
 */

/**
 * All icons use consistent 20x20 viewBox with 1.5px stroke
 * Geometric, minimal, professional design language
 */
const ICONS = {
    // === Navigation & UI ===
    chevronDown: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 7.5L10 12.5L15 7.5"/>
    </svg>`,
    
    chevronRight: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7.5 5L12.5 10L7.5 15"/>
    </svg>`,
    
    chevronLeft: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.5 15L7.5 10L12.5 5"/>
    </svg>`,
    
    search: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="9" r="5.5"/>
        <path d="M13 13L16.5 16.5"/>
    </svg>`,
    
    download: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 3V13M10 13L6 9M10 13L14 9"/>
        <path d="M3 15V16C3 16.5523 3.44772 17 4 17H16C16.5523 17 17 16.5523 17 16V15"/>
    </svg>`,
    
    close: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 5L15 15M15 5L5 15"/>
    </svg>`,
    
    // === Status Icons ===
    checkCircle: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="10" r="7"/>
        <path d="M7 10L9 12L13 8"/>
    </svg>`,
    
    alertCircle: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="10" r="7"/>
        <path d="M10 7V10.5"/>
        <circle cx="10" cy="13" r="0.5" fill="currentColor"/>
    </svg>`,
    
    alertTriangle: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 3L17.5 16H2.5L10 3Z"/>
        <path d="M10 8V11"/>
        <circle cx="10" cy="13.5" r="0.5" fill="currentColor"/>
    </svg>`,
    
    info: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="10" r="7"/>
        <path d="M10 9V14"/>
        <circle cx="10" cy="6.5" r="0.5" fill="currentColor"/>
    </svg>`,
    
    // === Category Icons - Research Focused ===
    
    // Overview & Summary
    dashboard: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="6" height="6" rx="1"/>
        <rect x="11" y="3" width="6" height="4" rx="1"/>
        <rect x="11" y="9" width="6" height="8" rx="1"/>
        <rect x="3" y="11" width="6" height="6" rx="1"/>
    </svg>`,
    
    suspiciousIndicator: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 2L3 6V10.5C3 14.5 6 17.5 10 18.5C14 17.5 17 14.5 17 10.5V6L10 2Z"/>
        <path d="M10 7V11"/>
        <circle cx="10" cy="13.5" r="0.5" fill="currentColor"/>
    </svg>`,
    
    agent: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="6" width="12" height="10" rx="2"/>
        <path d="M7 10H8"/>
        <path d="M12 10H13"/>
        <path d="M7.5 13.5C8 14 9 14.5 10 14.5C11 14.5 12 14 12.5 13.5"/>
        <path d="M7 3V6"/>
        <path d="M13 3V6"/>
    </svg>`,
    
    // Browser Environment
    browser: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2.5" y="3" width="15" height="14" rx="2"/>
        <path d="M2.5 7H17.5"/>
        <circle cx="5" cy="5" r="0.5" fill="currentColor"/>
        <circle cx="7" cy="5" r="0.5" fill="currentColor"/>
        <circle cx="9" cy="5" r="0.5" fill="currentColor"/>
    </svg>`,
    
    navigator: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="10" r="7"/>
        <path d="M10 3V5"/>
        <path d="M10 15V17"/>
        <path d="M3 10H5"/>
        <path d="M15 10H17"/>
        <circle cx="10" cy="10" r="2"/>
    </svg>`,
    
    window: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="4" width="16" height="12" rx="2"/>
        <path d="M2 7H18"/>
        <path d="M5 4V7"/>
    </svg>`,
    
    document: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2H5C4.44772 2 4 2.44772 4 3V17C4 17.5523 4.44772 18 5 18H15C15.5523 18 16 17.5523 16 17V6L12 2Z"/>
        <path d="M12 2V6H16"/>
        <path d="M7 10H13"/>
        <path d="M7 13H13"/>
    </svg>`,
    
    // Hardware Signals
    gpu: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="16" height="10" rx="1"/>
        <path d="M5 9H7V11H5V9Z"/>
        <path d="M9 9H11V11H9V9Z"/>
        <path d="M13 9H15V11H13V9Z"/>
        <path d="M4 5V3"/>
        <path d="M8 5V3"/>
        <path d="M12 5V3"/>
        <path d="M16 5V3"/>
    </svg>`,
    
    audio: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 8V12"/>
        <path d="M6 6V14"/>
        <path d="M9 4V16"/>
        <path d="M12 7V13"/>
        <path d="M15 5V15"/>
        <path d="M18 9V11"/>
    </svg>`,
    
    battery: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="6" width="14" height="8" rx="1.5"/>
        <path d="M18 9V11"/>
        <path d="M5 9V11"/>
        <path d="M8 9V11"/>
    </svg>`,
    
    display: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="16" height="11" rx="1.5"/>
        <path d="M7 17H13"/>
        <path d="M10 14V17"/>
    </svg>`,
    
    // Network & Communication
    network: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="10" r="7"/>
        <path d="M3 10H17"/>
        <ellipse cx="10" cy="10" rx="3" ry="7"/>
    </svg>`,
    
    wifi: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 8C5 5 8 4 10 4C12 4 15 5 18 8"/>
        <path d="M4.5 11C6.5 9 8 8.5 10 8.5C12 8.5 13.5 9 15.5 11"/>
        <path d="M7 14C8 13 9 12.5 10 12.5C11 12.5 12 13 13 14"/>
        <circle cx="10" cy="16" r="1" fill="currentColor"/>
    </svg>`,
    
    webrtc: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5" cy="10" r="2.5"/>
        <circle cx="15" cy="10" r="2.5"/>
        <path d="M7.5 10H12.5"/>
        <path d="M10 7L12.5 10L10 13"/>
    </svg>`,
    
    measurements: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 15L7 9L11 12L17 5"/>
        <path d="M14 5H17V8"/>
    </svg>`,
    
    // Rendering & Styles
    css: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="14" height="14" rx="1.5"/>
        <path d="M8 3V17"/>
        <path d="M3 8H17"/>
    </svg>`,
    
    fonts: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 5H16"/>
        <path d="M10 5V16"/>
        <path d="M7 16H13"/>
        <path d="M6 5V7"/>
        <path d="M14 5V7"/>
    </svg>`,
    
    // Locale & Accessibility
    language: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="10" r="7"/>
        <path d="M3 10H17"/>
        <path d="M10 3C7.5 5.5 7.5 14.5 10 17"/>
        <path d="M10 3C12.5 5.5 12.5 14.5 10 17"/>
    </svg>`,
    
    keyboard: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="16" height="10" rx="1.5"/>
        <path d="M5 9H6"/>
        <path d="M9 9H11"/>
        <path d="M14 9H15"/>
        <path d="M6 12H14"/>
    </svg>`,
    
    speech: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 3C8.34315 3 7 4.34315 7 6V10C7 11.6569 8.34315 13 10 13C11.6569 13 13 11.6569 13 10V6C13 4.34315 11.6569 3 10 3Z"/>
        <path d="M5 9V10C5 12.7614 7.23858 15 10 15C12.7614 15 15 12.7614 15 10V9"/>
        <path d="M10 15V18"/>
        <path d="M7 18H13"/>
    </svg>`,
    
    // Automation Detection
    shield: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 2L3 5.5V9.5C3 14 6 17 10 18C14 17 17 14 17 9.5V5.5L10 2Z"/>
    </svg>`,
    
    shieldCheck: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 2L3 5.5V9.5C3 14 6 17 10 18C14 17 17 14 17 9.5V5.5L10 2Z"/>
        <path d="M7.5 10L9.5 12L13 8"/>
    </svg>`,
    
    shieldAlert: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 2L3 5.5V9.5C3 14 6 17 10 18C14 17 17 14 17 9.5V5.5L10 2Z"/>
        <path d="M10 7V11"/>
        <circle cx="10" cy="13.5" r="0.5" fill="currentColor"/>
    </svg>`,
    
    code: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 7L3 10L6 13"/>
        <path d="M14 7L17 10L14 13"/>
        <path d="M11 4L9 16"/>
    </svg>`,
    
    signature: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 15C5 12 6 10 8 10C10 10 9 14 12 14C14 14 15 11 17 8"/>
        <path d="M3 17H17"/>
    </svg>`,
    
    terminal: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="4" width="16" height="12" rx="1.5"/>
        <path d="M5 8L8 10.5L5 13"/>
        <path d="M10 13H15"/>
    </svg>`,
    
    worker: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="7" width="14" height="10" rx="1.5"/>
        <path d="M6 4H14"/>
        <path d="M8 4V7"/>
        <path d="M12 4V7"/>
        <circle cx="7" cy="12" r="1.5"/>
        <circle cx="13" cy="12" r="1.5"/>
    </svg>`,
    
    // Behavioral Analysis
    activity: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 10H5L7.5 4L10.5 16L13 10H18"/>
    </svg>`,
    
    chart: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 16V8"/>
        <path d="M8 16V4"/>
        <path d="M12 16V10"/>
        <path d="M16 16V6"/>
    </svg>`,
    
    timer: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="11" r="6"/>
        <path d="M10 8V11L12 12"/>
        <path d="M8 3H12"/>
        <path d="M10 3V5"/>
    </svg>`,
    
    // View mode icons
    table: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="14" height="14" rx="1.5"/>
        <path d="M3 7H17"/>
        <path d="M3 11H17"/>
        <path d="M3 15H17"/>
        <path d="M8 3V17"/>
    </svg>`,
    
    grid: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="5.5" height="5.5" rx="1"/>
        <rect x="11.5" y="3" width="5.5" height="5.5" rx="1"/>
        <rect x="3" y="11.5" width="5.5" height="5.5" rx="1"/>
        <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1"/>
    </svg>`,
    
    database: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="10" cy="5" rx="6" ry="2.5"/>
        <path d="M4 5V15C4 16.3807 6.68629 17.5 10 17.5C13.3137 17.5 16 16.3807 16 15V5"/>
        <path d="M4 10C4 11.3807 6.68629 12.5 10 12.5C13.3137 12.5 16 11.3807 16 10"/>
    </svg>`,
    
    cpu: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="5" width="10" height="10" rx="1.5"/>
        <rect x="7" y="7" width="6" height="6" rx="0.5"/>
        <path d="M8 2V5M12 2V5M8 15V18M12 15V18"/>
        <path d="M2 8H5M2 12H5M15 8H18M15 12H18"/>
    </svg>`,
    
    box: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z"/>
        <path d="M10 10L17 6"/>
        <path d="M10 10L3 6"/>
        <path d="M10 10V18"/>
    </svg>`,
    
    // Misc
    layers: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 2L2 6L10 10L18 6L10 2Z"/>
        <path d="M2 14L10 18L18 14"/>
        <path d="M2 10L10 14L18 10"/>
    </svg>`,
    
    fingerprint: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10"/>
        <path d="M5 10C5 7.23858 7.23858 5 10 5C12.7614 5 15 7.23858 15 10V14"/>
        <path d="M7 10C7 8.34315 8.34315 7 10 7C11.6569 7 13 8.34315 13 10V16"/>
        <path d="M10 10V17"/>
    </svg>`,
    
    permissions: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="8" width="12" height="9" rx="1.5"/>
        <path d="M7 8V5.5C7 4.11929 8.11929 3 9.5 3H10.5C11.8807 3 13 4.11929 13 5.5V8"/>
        <circle cx="10" cy="12.5" r="1"/>
    </svg>`,
    
    mediaDevices: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="3" width="10" height="7" rx="1"/>
        <circle cx="10" cy="6.5" r="2"/>
        <path d="M10 10V12"/>
        <rect x="3" y="12" width="14" height="5" rx="1"/>
    </svg>`
};

/**
 * Category to icon mapping for research categories
 */
const CATEGORY_ICONS = {
    // Overview
    summary: 'dashboard',
    suspiciousIndicators: 'shieldAlert',
    knownAgents: 'agent',
    
    // Browser Environment
    core: 'browser',
    navigator: 'navigator',
    window: 'window',
    document: 'document',
    jsEnvironment: 'code',
    
    // Hardware Signals
    webgl: 'gpu',
    audio: 'audio',
    battery: 'battery',
    display: 'display',
    mediaDevices: 'mediaDevices',
    
    // Network & Communication
    network: 'network',
    networkCapabilities: 'wifi',
    webrtc: 'webrtc',
    webRTCLeak: 'webrtc',
    activeMeasurements: 'measurements',
    
    // Rendering & Styles
    css: 'css',
    cssComputedStyle: 'css',
    fonts: 'fonts',
    
    // Locale & Accessibility
    language: 'language',
    keyboardLayout: 'keyboard',
    speechSynthesis: 'speech',
    speech: 'speech',
    
    // Automation Detection
    automation: 'shield',
    functionIntegrity: 'shieldCheck',
    stringSignature: 'signature',
    stringSignatureAutomation: 'signature',
    cdpSignals: 'terminal',
    workers: 'worker',
    workerSignals: 'worker',
    
    // Behavioral Analysis
    behavioralIndicators: 'activity',
    behavioralTelemetry: 'chart',
    performanceTiming: 'timer',
    performance: 'chart',
    collectionTiming: 'timer',
    
    // Misc
    permissions: 'permissions',
    security: 'shield'
};

/**
 * Get SVG icon by name
 * @param {string} iconName - Icon identifier
 * @returns {string} SVG markup
 */
export function getIcon(iconName) {
    return ICONS[iconName] || ICONS.layers;
}

/**
 * Get icon for a category
 * @param {string} categoryKey - Category identifier
 * @returns {string} SVG markup
 */
export function getCategoryIcon(categoryKey) {
    const iconName = CATEGORY_ICONS[categoryKey] || 'layers';
    return getIcon(iconName);
}

/**
 * Get all available icon names
 * @returns {string[]} Array of icon names
 */
export function getIconNames() {
    return Object.keys(ICONS);
}

export { ICONS, CATEGORY_ICONS };

