/**
 * Advanced Metrics Renderer v2
 * Provides organized, logical grouping of metrics for complex detectors
 * 
 * This module enables switching between:
 * - v1: Flat table view (default)
 * - v2: Grouped card-based view with logical sections
 * 
 * @module fingerprint-ui/components/AdvancedMetricsRenderer
 */

import { formatMetricName, formatValue, getRiskConfig, isImageDataUrl } from '../utils/helpers.js';
import { getIcon } from '../utils/icons-v2.js';

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Metric group configuration for Battery & Storage detector
 * Defines logical groupings for better comprehension
 */
const BATTERY_STORAGE_GROUPS = {
    stackMethods: {
        id: 'stackMethods',
        title: 'Stack Size Measurements',
        icon: 'layers',
        description: 'JavaScript call stack limit measured using different recursion techniques. Variations between methods can indicate browser/environment characteristics.',
        methods: {
            direct: {
                id: 'direct',
                title: 'Direct Recursion',
                description: 'Standard recursive function call with try/catch. Passes counter as parameter.',
                metrics: ['stackSizeLimit', 'stackSizeDirectTiming', 'stackSizeErrorName', 'stackSizeErrorMessage'],
                codeExample: `const count = (n) => {
    try {
        return count(n + 1);
    } catch (e) {
        return n;
    }
};`
            },
            stabilized: {
                id: 'stabilized',
                title: 'JIT Stabilized',
                description: 'Runs 10 warmup iterations before measurement. JIT compilation produces more consistent results.',
                metrics: ['stackSizeStabilized', 'stackSizeStabilizedTiming', 'stackSizeStabilizedError', 'stackSizeStabilizedDiff'],
                codeExample: `const fn = () => {
    try {
        return 1 + fn();
    } catch (e) {
        return 1;
    }
};
// Warmup: run 10 times first
[...Array(10)].forEach(() => fn());
return fn();`
            },
            simple: {
                id: 'simple',
                title: 'Simple Increment',
                description: 'Minimal overhead approach using external counter. Fastest method but may differ slightly.',
                metrics: ['stackSizeSimple', 'stackSizeSimpleTiming', 'stackSizeSimpleError', 'stackSizeSimpleDiff'],
                codeExample: `let depth = 0;
const recurse = () => {
    depth++;
    recurse();
};
try { recurse(); } catch (e) {}
return depth;`
            },
            closure: {
                id: 'closure',
                title: 'Closure Recursion',
                description: 'Creates nested closures on each call. Higher memory overhead, may yield different limits.',
                metrics: ['stackSizeClosure', 'stackSizeClosureTiming', 'stackSizeClosureError'],
                codeExample: `const recurse = () => {
    const innerFunc = () => recurse();
    return innerFunc();
};`
            },
            async: {
                id: 'async',
                title: 'Async Context',
                description: 'Measures stack inside setTimeout callback. Tests async context stack limits.',
                metrics: ['stackSizeAsync', 'stackSizeAsyncTiming', 'stackSizeAsyncError', 'stackSizeAsyncDiff'],
                codeExample: `setTimeout(() => {
    // Measurement runs here
    const count = (n) => count(n + 1);
    try { count(0); } catch (e) {}
}, 0);`
            },
            strict: {
                id: 'strict',
                title: 'Strict Mode',
                description: 'Measurement in strict mode context. Some engines handle stack differently in strict mode.',
                metrics: ['stackSizeStrict', 'stackSizeStrictTiming', 'stackSizeStrictError'],
                codeExample: `'use strict';
const count = (n) => {
    try {
        return count(n + 1);
    } catch (e) {
        return n;
    }
};`
            }
        }
    },
    stackAnalysis: {
        id: 'stackAnalysis',
        title: 'Stack Analysis Summary',
        icon: 'chart',
        description: 'Aggregated metrics comparing all measurement methods.',
        metrics: [
            'stackMeasurementTotalTime',
            'stackMeasurementTimingRank',
            'stackSizeMethodDiff',
            'stackSizeConsistency',
            'stackSizeRawData'
        ]
    },
    battery: {
        id: 'battery',
        title: 'Battery Status',
        icon: 'battery',
        description: 'Battery Status API metrics. Can reveal device power state and indicate VM/container environments.',
        sections: {
            availability: {
                title: 'API Availability',
                metrics: ['hasBatteryAPI']
            },
            status: {
                title: 'Current Status',
                metrics: ['batteryLevel', 'batteryLevelRaw', 'batteryCharging', 'batteryStatus']
            },
            timing: {
                title: 'Charge Timing',
                metrics: ['batteryChargingTime', 'batteryChargingTimeRaw', 'batteryDischargingTime', 'batteryDischargingTimeRaw']
            },
            errors: {
                title: 'Errors',
                metrics: ['batteryError']
            }
        }
    },
    storage: {
        id: 'storage',
        title: 'Storage Manager',
        icon: 'database',
        description: 'Storage Manager API metrics. Storage quotas can vary by browser and environment.',
        sections: {
            availability: {
                title: 'API Availability',
                metrics: ['hasStorageAPI', 'hasStoragePersisted']
            },
            quota: {
                title: 'Storage Quota',
                metrics: ['storageQuota', 'storageQuotaBytes']
            },
            usage: {
                title: 'Current Usage',
                metrics: ['storageUsage', 'storageUsageBytes', 'storageUsagePercentage']
            },
            available: {
                title: 'Available Space',
                metrics: ['storageAvailable', 'storageAvailableBytes']
            },
            persistence: {
                title: 'Persistence',
                metrics: ['storagePersisted', 'storageUsageDetails']
            },
            errors: {
                title: 'Errors',
                metrics: ['storageError']
            }
        }
    },
    memory: {
        id: 'memory',
        title: 'Device Memory',
        icon: 'cpu',
        description: 'Device Memory API provides approximate RAM information.',
        metrics: ['hasDeviceMemory', 'deviceMemory', 'deviceMemoryFormatted', 'deviceMemoryBytes']
    },
    timing: {
        id: 'timing',
        title: 'Timing Resolution',
        icon: 'timer',
        description: 'Performance.now() timing resolution. Privacy features or containers may reduce precision.',
        metrics: ['timingResolutionMin', 'timingResolutionMax', 'timingResolutionAvg', 'timingResolutionSamples']
    }
};

/**
 * Metric group configuration for WebGL & Canvas Fingerprint detector
 * Provides logical groupings for WebGL parameters, Canvas 2D text/geometry fingerprints,
 * and the new enhanced geometry fingerprinting with multi-level hashing
 */
const WEBGL_FINGERPRINT_GROUPS = {
    // === WebGL Core Info ===
    webglSupport: {
        id: 'webglSupport',
        title: 'WebGL Support & Hashes',
        icon: 'gpu',
        description: 'Core WebGL support status and fingerprint hashes. These hashes uniquely identify the GPU/driver combination.',
        sections: {
            support: {
                title: 'Support Status',
                metrics: ['webglSupported', 'webgl2Supported', 'supportedContexts']
            },
            hashes: {
                title: 'Fingerprint Hashes',
                metrics: ['reportHash', 'imageHash']
            },
            image: {
                title: 'Rendered Image',
                metrics: ['imageDataUrl']
            }
        }
    },
    
    // === Renderer Info ===
    rendererInfo: {
        id: 'rendererInfo',
        title: 'Renderer & Vendor',
        icon: 'display',
        description: 'GPU hardware identification. Unmasked values reveal actual GPU model; masked values may indicate spoofing.',
        sections: {
            masked: {
                title: 'Masked (Reported)',
                metrics: ['vendor', 'renderer', 'version', 'shadingLanguageVersion']
            },
            unmasked: {
                title: 'Unmasked (Hardware)',
                metrics: ['unmaskedVendor', 'unmaskedRenderer']
            }
        }
    },
    
    // === Context Attributes ===
    contextAttributes: {
        id: 'contextAttributes',
        title: 'Context Attributes',
        icon: 'css',
        description: 'WebGL context configuration. These attributes affect rendering behavior and can vary by browser/GPU.',
        sections: {
            buffers: {
                title: 'Buffer Configuration',
                metrics: ['alphaBuffer', 'depthBuffer', 'stencilBuffer', 'preserveDrawingBuffer']
            },
            rendering: {
                title: 'Rendering Options',
                metrics: ['antiAliasing', 'premultipliedAlpha', 'desynchronized']
            },
            advanced: {
                title: 'Advanced',
                metrics: ['performanceCaveat', 'powerPreference', 'xrCompatible', 'drawingBufferColorSpace', 'unpackColorSpace']
            }
        }
    },
    
    // === Shader Capabilities ===
    shaderCapabilities: {
        id: 'shaderCapabilities',
        title: 'Shader Capabilities',
        icon: 'code',
        description: 'Vertex and fragment shader limits. These vary by GPU and driver version.',
        sections: {
            vertexShader: {
                title: 'Vertex Shader',
                metrics: ['vertexShaderPrecision', 'maxVertexAttribs', 'maxVertexUniformVectors', 'maxVertexUniformComponents', 'maxVertexUniformBlocks', 'maxVertexTextureImageUnits', 'maxVertexOutputComponents', 'maxVaryingVectors']
            },
            fragmentShader: {
                title: 'Fragment Shader',
                metrics: ['fragmentShaderPrecision', 'fragmentPrecision', 'maxFragmentUniformVectors', 'maxFragmentUniformComponents', 'maxFragmentUniformBlocks', 'maxTextureImageUnits']
            }
        }
    },
    
    // === Texture Limits ===
    textureLimits: {
        id: 'textureLimits',
        title: 'Texture Limits',
        icon: 'grid',
        description: 'Maximum texture dimensions and capabilities supported by the GPU.',
        metrics: [
            'maxTextureSize', 'maxCubeMapTextureSize', 'max3DTextureSize',
            'maxArrayTextureLayers', 'maxTextureLodBias', 'maxAnisotropy',
            'maxCombinedTextureImageUnits'
        ]
    },
    
    // === Framebuffer & Rasterizer ===
    framebuffer: {
        id: 'framebuffer',
        title: 'Framebuffer & Rasterizer',
        icon: 'display',
        description: 'Framebuffer configuration and rasterization limits.',
        sections: {
            framebuffer: {
                title: 'Framebuffer',
                metrics: ['maxDrawBuffers', 'maxColorAttachments', 'maxSamples', 'maxRenderBufferSize', 'maxViewportDims']
            },
            colorBits: {
                title: 'Color Depth',
                metrics: ['redBits', 'greenBits', 'blueBits', 'alphaBits', 'depthBits', 'stencilBits']
            },
            rasterizer: {
                title: 'Rasterizer',
                metrics: ['aliasedLineWidthRange', 'aliasedPointSizeRange']
            }
        }
    },
    
    // === Uniform Buffers ===
    uniformBuffers: {
        id: 'uniformBuffers',
        title: 'Uniform Buffers',
        icon: 'database',
        description: 'Uniform buffer object limits (WebGL 2 feature).',
        metrics: [
            'maxUniformBufferBindings', 'maxUniformBlockSize', 'uniformBufferOffsetAlignment',
            'maxCombinedUniformBlocks', 'maxCombinedVertexUniformComponents', 'maxCombinedFragmentUniformComponents'
        ]
    },
    
    // === Extensions ===
    extensions: {
        id: 'extensions',
        title: 'WebGL Extensions',
        icon: 'terminal',
        description: 'Supported WebGL extensions. Extension availability creates a unique fingerprint.',
        metrics: ['extensionsCount', 'extensionsList']
    },
    
    // === Canvas 2D Text Fingerprint ===
    canvas2dText: {
        id: 'canvas2dText',
        title: 'Canvas 2D Text Fingerprint',
        icon: 'fonts',
        description: 'Text rendering fingerprint using specific fonts, colors, and emoji. Variations indicate different OS/browser font rendering.',
        sections: {
            hashes: {
                title: 'Fingerprint Hashes',
                metrics: ['canvas2dTextDataUrlHash', 'canvas2dTextImageDataHash']
            },
            stability: {
                title: 'Stability Analysis',
                metrics: ['canvas2dTextDataUrlStable', 'canvas2dTextImageDataStable', 'canvas2dTextStable']
            },
            pixelDiff: {
                title: 'Pixel Diff (if unstable)',
                metrics: ['canvas2dTextDiffPixels', 'canvas2dTextMeanAbsDiff', 'canvas2dTextMaxAbsDiff', 'canvas2dTextDeltaBuckets']
            },
            image: {
                title: 'Rendered Image',
                metrics: ['canvas2dTextImage']
            }
        }
    },
    
    // === Canvas 2D Geometry Fingerprint (Original) ===
    canvas2dGeometry: {
        id: 'canvas2dGeometry',
        title: 'Canvas 2D Geometry (Original)',
        icon: 'activity',
        description: 'Geometry fingerprint using blending modes and winding rules. Original FingerprintJS-style method.',
        sections: {
            hashes: {
                title: 'Fingerprint Hashes',
                metrics: ['canvas2dGeometryDataUrlHash', 'canvas2dGeometryImageDataHash']
            },
            stability: {
                title: 'Stability Analysis',
                metrics: ['canvas2dGeometryDataUrlStable', 'canvas2dGeometryImageDataStable']
            },
            pixelDiff: {
                title: 'Pixel Diff (if unstable)',
                metrics: ['canvas2dGeometryDiffPixels', 'canvas2dGeometryMeanAbsDiff', 'canvas2dGeometryMaxAbsDiff', 'canvas2dGeometryDeltaBuckets']
            },
            image: {
                title: 'Rendered Image',
                metrics: ['canvas2dGeometryImage']
            }
        }
    },
    
    // === Canvas 2D Geometry Enhanced (NEW) ===
    canvas2dGeometryEnhanced: {
        id: 'canvas2dGeometryEnhanced',
        title: 'Canvas 2D Geometry (Enhanced)',
        icon: 'shieldCheck',
        description: 'Improved geometry fingerprint with multi-level hashing. Uses constant TWO_PI, explicit context reset, and 4x rendering for rotation detection.',
        methods: {
            fullPrecision: {
                id: 'fullPrecision',
                title: 'Full Precision Hash',
                description: 'Maximum sensitivity hash - detects any pixel difference. Standard fingerprinting approach.',
                metrics: ['canvas2dGeometryEnhancedHashFull', 'canvas2dGeometryEnhancedStableFull', 'canvas2dGeometryEnhancedUniqueFullCount'],
                codeExample: `// Full precision - maximum sensitivity
const pixelStr = JSON.stringify(Array.from(pixels));
const hash = md5(pixelStr);`
            },
            quantized: {
                id: 'quantized',
                title: 'Quantized Hash (6-bit)',
                description: 'Reduced noise hash - keeps 6 most significant bits. Stable across minor GPU anti-aliasing differences.',
                metrics: ['canvas2dGeometryEnhancedHashQuantized', 'canvas2dGeometryEnhancedStableQuantized'],
                codeExample: `// Quantized - reduce LSB noise
for (let i = 0; i < pixels.length; i++) {
    quantized[i] = (pixels[i] >> 2) << 2;
}
const hash = md5(quantized);`
            },
            structural: {
                id: 'structural',
                title: 'Structural Hash',
                description: 'Shape-only hash based on alpha threshold. Highly stable, detects major rendering differences only.',
                metrics: ['canvas2dGeometryEnhancedHashStructural'],
                codeExample: `// Structural - shape only
let mask = '';
for (let i = 3; i < pixels.length; i += 4) {
    mask += pixels[i] > 128 ? '1' : '0';
}
const hash = md5(mask);`
            },
            colorRegion: {
                id: 'colorRegion',
                title: 'Color Region Hash',
                description: 'Color distribution hash - counts pixels per color bucket. Position-independent, detects overall color makeup.',
                metrics: ['canvas2dGeometryEnhancedHashColorRegion'],
                codeExample: `// Color region - distribution only
const buckets = new Map();
for (let i = 0; i < pixels.length; i += 4) {
    const key = \`\${pixels[i]>>4},\${pixels[i+1]>>4},\${pixels[i+2]>>4}\`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
}
const hash = md5(sortedBuckets);`
            }
        }
    },
    
    // === Rotation & Noise Detection ===
    rotationDetection: {
        id: 'rotationDetection',
        title: 'Rotation & Noise Detection',
        icon: 'shieldAlert',
        description: 'Detects fingerprint rotation (VM tools) and noise injection (anti-fingerprinting). Multiple renders reveal spoofing patterns.',
        sections: {
            rotation: {
                title: 'Fingerprint Rotation',
                metrics: ['canvas2dGeometryEnhancedRotationDetected', 'canvas2dGeometryEnhancedRotationPattern', 'canvas2dGeometryEnhancedRenderCount']
            },
            noiseInjection: {
                title: 'Noise Injection',
                metrics: ['canvas2dGeometryEnhancedNoiseInjection']
            },
            image: {
                title: 'Enhanced Rendered Image',
                metrics: ['canvas2dGeometryEnhancedImage']
            }
        }
    },
    
    // === Hook Detection ===
    hookDetection: {
        id: 'hookDetection',
        title: 'API Hook Detection',
        icon: 'signature',
        description: 'Detects if Canvas APIs are hooked or patched. Compares toDataURL vs getImageData for consistency.',
        sections: {
            detection: {
                title: 'Detection Results',
                metrics: ['canvas2dGetImageDataPatched', 'canvas2dFarblingDetected', 'canvas2dEnvRotationDetected']
            },
            details: {
                title: 'Details',
                metrics: ['canvas2dHookDetails']
            }
        }
    },
    
    // === Canvas 2D Summary ===
    canvas2dSummary: {
        id: 'canvas2dSummary',
        title: 'Canvas 2D Summary',
        icon: 'chart',
        description: 'Overall Canvas 2D fingerprint status and combined hashes.',
        metrics: ['canvas2dSupported', 'canvas2dWinding', 'canvas2dCombinedHash']
    },
    
    // === Timing Metrics ===
    webglTiming: {
        id: 'webglTiming',
        title: 'Collection Timing',
        icon: 'timer',
        description: 'Time taken for fingerprint collection. Unusual timing may indicate throttling or interception.',
        metrics: [
            'collectionTimeMs', 'contextProbeTimeMs', 'parameterCollectionTimeMs',
            'reportHashTimeMs', 'imageHashTimeMs', 'canvas2dCollectionTimeMs'
        ]
    },
    
    // === Errors ===
    errors: {
        id: 'errors',
        title: 'Errors',
        icon: 'alertCircle',
        description: 'Any errors encountered during fingerprint collection.',
        metrics: ['error', 'imageError', 'canvas2dError']
    }
};

/**
 * Detector group configurations
 * Add new detector configurations here to enable v2 rendering
 */
const DETECTOR_CONFIGS = {
    batteryStorage: BATTERY_STORAGE_GROUPS,
    battery: BATTERY_STORAGE_GROUPS, // Alias
    webgl: WEBGL_FINGERPRINT_GROUPS,
    webglFingerprint: WEBGL_FINGERPRINT_GROUPS, // Alias
    webGL: WEBGL_FINGERPRINT_GROUPS // Alias for case variations
};

/**
 * Check if a category has v2 renderer support
 * @param {string} categoryKey - The category key
 * @returns {boolean}
 */
export function hasAdvancedRenderer(categoryKey) {
    const result = categoryKey in DETECTOR_CONFIGS;
    console.log(`[hasAdvancedRenderer] categoryKey: "${categoryKey}", found: ${result}, available keys: ${Object.keys(DETECTOR_CONFIGS).join(', ')}`);
    return result;
}

/**
 * Get available view modes for a category
 * @param {string} categoryKey - The category key
 * @returns {Array<{id: string, label: string, icon: string}>}
 */
export function getViewModes(categoryKey) {
    const modes = [
        { id: 'v1', label: 'Table View', icon: 'table' }
    ];
    
    if (hasAdvancedRenderer(categoryKey)) {
        modes.push({ id: 'v2', label: 'Grouped View', icon: 'grid' });
    }
    
    return modes;
}

/**
 * Create view mode toggle buttons
 * @param {string} categoryKey - The category key
 * @param {string} currentMode - Current view mode
 * @param {Function} onModeChange - Callback when mode changes
 * @returns {HTMLElement|null}
 */
export function createViewModeToggle(categoryKey, currentMode, onModeChange) {
    const modes = getViewModes(categoryKey);
    if (modes.length <= 1) return null;
    
    const toggle = document.createElement('div');
    toggle.className = 'rx-view-toggle';
    toggle.setAttribute('role', 'tablist');
    toggle.setAttribute('aria-label', 'View mode');
    
    modes.forEach(mode => {
        const btn = document.createElement('button');
        btn.className = `rx-view-toggle__btn${mode.id === currentMode ? ' rx-view-toggle__btn--active' : ''}`;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', mode.id === currentMode ? 'true' : 'false');
        btn.dataset.mode = mode.id;
        btn.innerHTML = `
            ${getIcon(mode.icon)}
            <span>${escapeHtml(mode.label)}</span>
        `;
        btn.addEventListener('click', () => {
            if (mode.id !== currentMode) {
                onModeChange(mode.id);
            }
        });
        toggle.appendChild(btn);
    });
    
    return toggle;
}

/**
 * Render category metrics with advanced v2 grouped view
 * @param {HTMLElement} container - Container element
 * @param {string} categoryKey - The category key
 * @param {Object} metrics - The metrics object
 * @param {Object} options - Render options
 * @returns {void}
 */
export function renderAdvancedMetrics(container, categoryKey, metrics, options = {}) {
    const config = DETECTOR_CONFIGS[categoryKey];
    if (!config) {
        console.warn(`No advanced renderer config for category: ${categoryKey}`);
        return;
    }
    
    container.innerHTML = '';
    container.className = 'rx-advanced-metrics';
    
    // Render each group
    for (const [groupKey, group] of Object.entries(config)) {
        const groupEl = createMetricGroup(group, metrics, options);
        if (groupEl) {
            container.appendChild(groupEl);
        }
    }
}

/**
 * Create a metric group element
 * @param {Object} group - Group configuration
 * @param {Object} metrics - All metrics
 * @param {Object} options - Render options
 * @returns {HTMLElement|null}
 */
function createMetricGroup(group, metrics, options) {
    // Check if group has any metrics
    const hasMetrics = checkGroupHasMetrics(group, metrics);
    if (!hasMetrics) return null;
    
    const groupEl = document.createElement('div');
    groupEl.className = 'rx-metric-group';
    groupEl.dataset.group = group.id;
    
    // Group header
    const header = document.createElement('div');
    header.className = 'rx-metric-group__header';
    header.innerHTML = `
        <div class="rx-metric-group__title-row">
            <span class="rx-metric-group__icon">${getIcon(group.icon || 'box')}</span>
            <h3 class="rx-metric-group__title">${escapeHtml(group.title)}</h3>
        </div>
        ${group.description ? `<p class="rx-metric-group__desc">${escapeHtml(group.description)}</p>` : ''}
    `;
    groupEl.appendChild(header);
    
    // Group content
    const content = document.createElement('div');
    content.className = 'rx-metric-group__content';
    
    // Handle different group types
    if (group.methods) {
        // Stack methods with individual cards
        renderStackMethodCards(content, group.methods, metrics);
    } else if (group.sections) {
        // Sectioned metrics (battery, storage)
        renderSectionedMetrics(content, group.sections, metrics);
    } else if (group.metrics) {
        // Simple metric list
        renderMetricList(content, group.metrics, metrics);
    }
    
    groupEl.appendChild(content);
    return groupEl;
}

/**
 * Check if a group has any metrics with values
 */
function checkGroupHasMetrics(group, metrics) {
    if (group.methods) {
        return Object.values(group.methods).some(method => 
            method.metrics.some(key => metrics[key] !== undefined)
        );
    }
    if (group.sections) {
        return Object.values(group.sections).some(section =>
            section.metrics.some(key => metrics[key] !== undefined)
        );
    }
    if (group.metrics) {
        return group.metrics.some(key => metrics[key] !== undefined);
    }
    return false;
}

/**
 * Render stack method cards
 */
function renderStackMethodCards(container, methods, metrics) {
    const grid = document.createElement('div');
    grid.className = 'rx-method-grid';
    
    for (const [methodKey, method] of Object.entries(methods)) {
        const card = createStackMethodCard(method, metrics);
        if (card) {
            grid.appendChild(card);
        }
    }
    
    container.appendChild(grid);
}

/**
 * Create a single stack method card
 */
function createStackMethodCard(method, metrics) {
    // Check if method has metrics
    const availableMetrics = method.metrics.filter(key => metrics[key] !== undefined);
    if (availableMetrics.length === 0) return null;
    
    const card = document.createElement('div');
    card.className = 'rx-method-card';
    card.dataset.method = method.id;
    
    // Find the primary value (stack depth)
    const primaryMetric = availableMetrics[0];
    const primaryData = metrics[primaryMetric];
    const primaryValue = primaryData?.value;
    
    // Find timing
    const timingMetric = availableMetrics.find(k => k.toLowerCase().includes('timing'));
    const timingValue = timingMetric ? metrics[timingMetric]?.value : null;
    
    // Find error
    const errorMetric = availableMetrics.find(k => k.toLowerCase().includes('error'));
    const errorValue = errorMetric ? metrics[errorMetric]?.value : null;
    
    // Find diff
    const diffMetric = availableMetrics.find(k => k.toLowerCase().includes('diff'));
    const diffValue = diffMetric ? metrics[diffMetric]?.value : null;
    
    card.innerHTML = `
        <div class="rx-method-card__header">
            <h4 class="rx-method-card__title">${escapeHtml(method.title)}</h4>
            ${timingValue !== null ? `<span class="rx-method-card__timing">${formatTiming(timingValue)}</span>` : ''}
        </div>
        
        <p class="rx-method-card__desc">${escapeHtml(method.description)}</p>
        
        <div class="rx-method-card__value-row">
            <span class="rx-method-card__label">Stack Depth</span>
            <span class="rx-method-card__value">${formatStackValue(primaryValue)}</span>
        </div>
        
        ${diffValue !== null && diffValue !== 0 ? `
            <div class="rx-method-card__diff">
                <span class="rx-method-card__diff-label">vs Direct:</span>
                <span class="rx-method-card__diff-value ${diffValue > 0 ? 'rx-diff--positive' : 'rx-diff--negative'}">
                    ${diffValue > 0 ? '+' : ''}${diffValue}
                </span>
            </div>
        ` : ''}
        
        ${errorValue ? `
            <div class="rx-method-card__error">
                <span class="rx-method-card__error-label">Error:</span>
                <code class="rx-method-card__error-value">${escapeHtml(errorValue)}</code>
            </div>
        ` : ''}
        
        ${method.codeExample ? `
            <details class="rx-method-card__code-toggle">
                <summary>View Code</summary>
                <pre class="rx-method-card__code"><code>${escapeHtml(method.codeExample)}</code></pre>
            </details>
        ` : ''}
    `;
    
    return card;
}

/**
 * Format stack value for display
 */
function formatStackValue(value) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
        return value.toLocaleString();
    }
    return escapeHtml(String(value));
}

/**
 * Format timing value
 */
function formatTiming(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
        if (value < 1) {
            return `${(value * 1000).toFixed(1)}μs`;
        }
        return `${value.toFixed(2)}ms`;
    }
    return escapeHtml(String(value));
}

/**
 * Render sectioned metrics (battery, storage)
 */
function renderSectionedMetrics(container, sections, metrics) {
    for (const [sectionKey, section] of Object.entries(sections)) {
        const availableMetrics = section.metrics.filter(key => metrics[key] !== undefined);
        if (availableMetrics.length === 0) continue;
        
        const sectionEl = document.createElement('div');
        sectionEl.className = 'rx-metric-section';
        
        sectionEl.innerHTML = `
            <h4 class="rx-metric-section__title">${escapeHtml(section.title)}</h4>
            <div class="rx-metric-section__content"></div>
        `;
        
        const contentEl = sectionEl.querySelector('.rx-metric-section__content');
        renderMetricRows(contentEl, availableMetrics, metrics);
        
        container.appendChild(sectionEl);
    }
}

/**
 * Render simple metric list
 */
function renderMetricList(container, metricKeys, metrics) {
    const availableMetrics = metricKeys.filter(key => metrics[key] !== undefined);
    if (availableMetrics.length === 0) return;
    
    renderMetricRows(container, availableMetrics, metrics);
}

/**
 * Render metric rows
 */
function renderMetricRows(container, metricKeys, metrics) {
    const table = document.createElement('div');
    table.className = 'rx-metric-rows';
    
    for (const key of metricKeys) {
        const data = metrics[key];
        if (!data) continue;
        
        const row = document.createElement('div');
        row.className = 'rx-metric-row';
        
        const value = data.value;
        let valueHtml = '';
        
        if (value === null || value === undefined) {
            valueHtml = '<span class="rx-metric-row__value--empty">—</span>';
        } else if (isImageDataUrl(value)) {
            valueHtml = `<img src="${value}" class="rx-metric-row__image">`;
        } else if (typeof value === 'object') {
            const json = JSON.stringify(value, null, 2);
            if (json.length > 100) {
                valueHtml = `
                    <details class="rx-metric-row__object">
                        <summary>Object (${Object.keys(value).length} keys)</summary>
                        <pre><code>${escapeHtml(json)}</code></pre>
                    </details>
                `;
            } else {
                valueHtml = `<code class="rx-metric-row__code">${escapeHtml(json)}</code>`;
            }
        } else if (typeof value === 'boolean') {
            valueHtml = `<span class="rx-metric-row__bool rx-metric-row__bool--${value}">${value ? 'true' : 'false'}</span>`;
        } else {
            valueHtml = `<code class="rx-metric-row__code">${escapeHtml(formatValue(value))}</code>`;
        }
        
        const risk = (data.risk || 'none').toLowerCase();
        const riskConfig = getRiskConfig(risk);
        
        row.innerHTML = `
            <div class="rx-metric-row__main">
                <span class="rx-metric-row__key" title="${escapeHtml(key)}">${escapeHtml(formatMetricName(key))}</span>
                <div class="rx-metric-row__value">${valueHtml}</div>
            </div>
            <div class="rx-metric-row__meta">
                ${data.description ? `<span class="rx-metric-row__desc">${escapeHtml(data.description)}</span>` : ''}
                ${risk !== 'none' && risk !== 'n/a' ? `<span class="rx-risk rx-risk--${risk}">${riskConfig.label}</span>` : ''}
            </div>
        `;
        
        table.appendChild(row);
    }
    
    container.appendChild(table);
}

/**
 * CSS Styles for Advanced Metrics Renderer
 * Inject these styles when the module is loaded
 */
function injectStyles() {
    if (document.getElementById('rx-advanced-metrics-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'rx-advanced-metrics-styles';
    styles.textContent = `
        /* View Mode Toggle */
        .rx-view-toggle {
            display: inline-flex;
            gap: 2px;
            padding: 3px;
            background: var(--rx-bg-secondary, #f4f4f5);
            border-radius: 8px;
        }
        
        .rx-view-toggle__btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: transparent;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            color: var(--rx-text-secondary, #71717a);
            cursor: pointer;
            transition: all 0.15s ease;
        }
        
        .rx-view-toggle__btn:hover {
            color: var(--rx-text-primary, #18181b);
            background: var(--rx-bg-tertiary, #e4e4e7);
        }
        
        .rx-view-toggle__btn--active {
            background: var(--rx-bg-primary, #fff);
            color: var(--rx-text-primary, #18181b);
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        
        .rx-view-toggle__btn svg {
            width: 14px;
            height: 14px;
        }
        
        /* Advanced Metrics Container */
        .rx-advanced-metrics {
            display: flex;
            flex-direction: column;
            gap: 24px;
        }
        
        /* Metric Group */
        .rx-metric-group {
            background: var(--rx-bg-primary, #fff);
            border: 1px solid var(--rx-border-subtle, #e4e4e7);
            border-radius: 12px;
            overflow: hidden;
        }
        
        .rx-metric-group__header {
            padding: 16px 20px;
            background: var(--rx-bg-secondary, #fafafa);
            border-bottom: 1px solid var(--rx-border-subtle, #e4e4e7);
        }
        
        .rx-metric-group__title-row {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .rx-metric-group__icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: var(--rx-accent-subtle, #e0e7ff);
            border-radius: 8px;
            color: var(--rx-accent, #3b528b);
        }
        
        .rx-metric-group__icon svg {
            width: 18px;
            height: 18px;
        }
        
        .rx-metric-group__title {
            font-size: 16px;
            font-weight: 600;
            color: var(--rx-text-primary, #18181b);
            margin: 0;
        }
        
        .rx-metric-group__desc {
            margin: 8px 0 0 42px;
            font-size: 13px;
            color: var(--rx-text-tertiary, #a1a1aa);
            line-height: 1.5;
        }
        
        .rx-metric-group__content {
            padding: 16px 20px;
        }
        
        /* Method Grid (for stack methods) */
        .rx-method-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 16px;
        }
        
        /* Method Card */
        .rx-method-card {
            background: var(--rx-bg-secondary, #fafafa);
            border: 1px solid var(--rx-border-subtle, #e4e4e7);
            border-radius: 10px;
            padding: 16px;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        
        .rx-method-card:hover {
            border-color: var(--rx-accent-muted, #93a5cf);
            box-shadow: 0 2px 8px rgba(59, 82, 139, 0.08);
        }
        
        .rx-method-card__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        
        .rx-method-card__title {
            font-size: 14px;
            font-weight: 600;
            color: var(--rx-text-primary, #18181b);
            margin: 0;
        }
        
        .rx-method-card__timing {
            font-size: 12px;
            font-weight: 500;
            color: var(--rx-text-tertiary, #a1a1aa);
            background: var(--rx-bg-tertiary, #e4e4e7);
            padding: 2px 8px;
            border-radius: 4px;
        }
        
        .rx-method-card__desc {
            font-size: 12px;
            color: var(--rx-text-secondary, #71717a);
            line-height: 1.5;
            margin: 0 0 12px 0;
        }
        
        .rx-method-card__value-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            background: var(--rx-bg-primary, #fff);
            border-radius: 6px;
            margin-bottom: 8px;
        }
        
        .rx-method-card__label {
            font-size: 12px;
            font-weight: 500;
            color: var(--rx-text-secondary, #71717a);
        }
        
        .rx-method-card__value {
            font-size: 18px;
            font-weight: 700;
            color: var(--rx-accent, #3b528b);
            font-family: 'SF Mono', 'Fira Code', monospace;
        }
        
        .rx-method-card__diff {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            margin-bottom: 8px;
        }
        
        .rx-method-card__diff-label {
            color: var(--rx-text-tertiary, #a1a1aa);
        }
        
        .rx-method-card__diff-value {
            font-weight: 600;
            font-family: 'SF Mono', 'Fira Code', monospace;
        }
        
        .rx-diff--positive {
            color: var(--rx-status-success, #22c55e);
        }
        
        .rx-diff--negative {
            color: var(--rx-status-danger, #ef4444);
        }
        
        .rx-method-card__error {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            margin-bottom: 8px;
        }
        
        .rx-method-card__error-label {
            color: var(--rx-text-tertiary, #a1a1aa);
        }
        
        .rx-method-card__error-value {
            font-size: 11px;
            padding: 2px 6px;
            background: var(--rx-status-warning-bg, #fef3c7);
            color: var(--rx-status-warning, #d97706);
            border-radius: 4px;
        }
        
        .rx-method-card__code-toggle {
            margin-top: 8px;
            font-size: 12px;
        }
        
        .rx-method-card__code-toggle summary {
            cursor: pointer;
            color: var(--rx-accent, #3b528b);
            font-weight: 500;
            user-select: none;
        }
        
        .rx-method-card__code-toggle summary:hover {
            text-decoration: underline;
        }
        
        .rx-method-card__code {
            margin-top: 8px;
            padding: 10px;
            background: var(--rx-bg-code, #1e1e1e);
            color: var(--rx-text-code, #d4d4d4);
            border-radius: 6px;
            font-size: 11px;
            line-height: 1.5;
            overflow-x: auto;
            white-space: pre;
        }
        
        /* Metric Sections */
        .rx-metric-section {
            margin-bottom: 16px;
        }
        
        .rx-metric-section:last-child {
            margin-bottom: 0;
        }
        
        .rx-metric-section__title {
            font-size: 13px;
            font-weight: 600;
            color: var(--rx-text-secondary, #71717a);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0 0 10px 0;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--rx-border-subtle, #e4e4e7);
        }
        
        .rx-metric-section__content {
            padding-left: 0;
        }
        
        /* Metric Rows */
        .rx-metric-rows {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        
        .rx-metric-row {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 10px 12px;
            background: var(--rx-bg-secondary, #fafafa);
            border-radius: 6px;
            transition: background 0.1s ease;
        }
        
        .rx-metric-row:hover {
            background: var(--rx-bg-tertiary, #f0f0f0);
        }
        
        .rx-metric-row__main {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
        }
        
        .rx-metric-row__key {
            font-size: 13px;
            font-weight: 500;
            color: var(--rx-text-primary, #18181b);
            flex-shrink: 0;
        }
        
        .rx-metric-row__value {
            text-align: right;
            flex: 1;
            min-width: 0;
        }
        
        .rx-metric-row__code {
            font-size: 12px;
            font-family: 'SF Mono', 'Fira Code', monospace;
            background: var(--rx-bg-primary, #fff);
            padding: 2px 8px;
            border-radius: 4px;
            color: var(--rx-text-primary, #18181b);
            word-break: break-all;
        }
        
        .rx-metric-row__bool {
            font-size: 12px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 4px;
        }
        
        .rx-metric-row__bool--true {
            background: var(--rx-status-success-bg, #dcfce7);
            color: var(--rx-status-success, #16a34a);
        }
        
        .rx-metric-row__bool--false {
            background: var(--rx-bg-tertiary, #e4e4e7);
            color: var(--rx-text-tertiary, #a1a1aa);
        }
        
        .rx-metric-row__value--empty {
            color: var(--rx-text-muted, #d4d4d8);
        }
        
        .rx-metric-row__image {
            max-width: 80px;
            max-height: 40px;
            border-radius: 4px;
        }
        
        .rx-metric-row__object summary {
            cursor: pointer;
            font-size: 12px;
            color: var(--rx-accent, #3b528b);
        }
        
        .rx-metric-row__object pre {
            margin-top: 8px;
            padding: 10px;
            background: var(--rx-bg-code, #1e1e1e);
            color: var(--rx-text-code, #d4d4d4);
            border-radius: 6px;
            font-size: 11px;
            overflow-x: auto;
        }
        
        .rx-metric-row__meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        
        .rx-metric-row__desc {
            font-size: 11px;
            color: var(--rx-text-tertiary, #a1a1aa);
            flex: 1;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .rx-method-grid {
                grid-template-columns: 1fr;
            }
            
            .rx-metric-row__main {
                flex-direction: column;
                gap: 6px;
            }
            
            .rx-metric-row__value {
                text-align: left;
            }
        }
    `;
    
    document.head.appendChild(styles);
}

// Inject styles on module load
injectStyles();

export {
    DETECTOR_CONFIGS,
    BATTERY_STORAGE_GROUPS,
    WEBGL_FINGERPRINT_GROUPS
};
