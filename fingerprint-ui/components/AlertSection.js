/**
 * Fingerprint UI - Alert Section Component
 * Renders suspicious indicators and behavioral anomalies
 */

import { IMPORTANCE_LEVELS } from '../config/constants.js';
import { formatPercentage } from '../utils/helpers.js';
import { getAgentIconAsImage } from '../utils/agentIcons.js';

/**
 * Create suspicious indicators alert section
 * @param {Array} indicators - Array of suspicious indicators
 * @param {object} summary - Summary statistics
 * @returns {HTMLElement|null} Alert section or null if no indicators
 */
export function createSuspiciousIndicatorsSection(indicators, summary) {
    // Don't render if no suspicious activity
    if (!summary?.hasSuspiciousActivity || !indicators?.length) {
        return null;
    }
    
    const section = document.createElement('div');
    section.className = 'fp-alert-section fp-alert-section--danger';
    
    // Header
    const header = document.createElement('div');
    header.className = 'fp-alert-header fp-alert-header--danger';
    header.innerHTML = `
        <div class="fp-alert-header__icon">🚨</div>
        <div class="fp-alert-header__content">
            <h3 class="fp-alert-header__title">Suspicious Browser Patterns Detected</h3>
            <p class="fp-alert-header__subtitle">Patterns that indicate sandbox environments or automation tools</p>
            <div class="fp-alert-stats">
                <div class="fp-alert-stat">
                    <span class="fp-alert-stat__value">${summary.totalIndicators || 0}</span>
                    <span class="fp-alert-stat__label">Total Indicators</span>
                </div>
                <div class="fp-alert-stat">
                    <span class="fp-alert-stat__value">${summary.riskCounts?.HIGH || 0}</span>
                    <span class="fp-alert-stat__label">High Risk</span>
                </div>
                <div class="fp-alert-stat">
                    <span class="fp-alert-stat__value">${formatPercentage(summary.suspicionScore)}</span>
                    <span class="fp-alert-stat__label">Suspicion Score</span>
                </div>
            </div>
        </div>
    `;
    
    // Body with indicators
    const body = document.createElement('div');
    body.className = 'fp-alert-body';
    
    // Add reasoning if available
    if (summary.reasoning) {
        const reasoning = document.createElement('div');
        reasoning.style.cssText = `
            background: var(--fp-warning-50);
            border: 1px solid var(--fp-warning-200);
            padding: var(--fp-spacing-md);
            border-radius: var(--fp-radius-md);
            margin-bottom: var(--fp-spacing-md);
            font-size: 0.875rem;
            color: var(--fp-warning-700);
        `;
        reasoning.innerHTML = `
            <strong>Detection Reasoning:</strong> ${escapeHtml(summary.reasoning)}
            ${summary.totalDetectedIndicators > summary.totalIndicators 
                ? `<br><small style="opacity: 0.8;">Additional ${summary.totalDetectedIndicators - summary.totalIndicators} weak indicator(s) also detected.</small>` 
                : ''}
        `;
        body.appendChild(reasoning);
    }
    
    // Render each indicator
    indicators.forEach(indicator => {
        try {
            body.appendChild(createIndicatorItem(indicator));
        } catch (error) {
            console.error('Error rendering indicator:', indicator, error);
        }
    });
    
    section.appendChild(header);
    section.appendChild(body);
    
    return section;
}

/**
 * Create behavioral indicators alert section
 * @param {object} behavioralData - Behavioral indicators data
 * @returns {HTMLElement|null} Alert section or null if no detections
 */
export function createBehavioralIndicatorsSection(behavioralData) {
    if (!behavioralData || behavioralData.error) {
        return null;
    }
    
    // Extract detected indicators
    const detectedIndicators = Object.entries(behavioralData).filter(([key, data]) => {
        return data && data.value === true;
    });
    
    if (detectedIndicators.length === 0) {
        return null;
    }
    
    const maxConfidence = behavioralData.maxConfidence?.value || 0;
    const riskLevel = behavioralData.riskLevel?.value || 'None';
    
    const section = document.createElement('div');
    const isHighRisk = riskLevel === 'HIGH' || riskLevel === 'MEDIUM';
    section.className = `fp-alert-section ${isHighRisk ? 'fp-alert-section--warning' : 'fp-alert-section--info'}`;
    
    // Header
    const header = document.createElement('div');
    header.className = `fp-alert-header ${isHighRisk ? 'fp-alert-header--warning' : 'fp-alert-header--info'}`;
    header.innerHTML = `
        <div class="fp-alert-header__icon">${isHighRisk ? '⚠️' : '🎯'}</div>
        <div class="fp-alert-header__content">
            <h3 class="fp-alert-header__title">${isHighRisk ? 'Behavioral Anomalies Detected' : 'Behavioral Patterns Detected'}</h3>
            <p class="fp-alert-header__subtitle">${isHighRisk ? 'Suspicious interaction patterns detected during testing' : 'Analysis of user interaction patterns'}</p>
            <div class="fp-alert-stats">
                <div class="fp-alert-stat">
                    <span class="fp-alert-stat__value">${detectedIndicators.length}</span>
                    <span class="fp-alert-stat__label">Detected Patterns</span>
                </div>
                <div class="fp-alert-stat">
                    <span class="fp-alert-stat__value">${formatPercentage(maxConfidence)}</span>
                    <span class="fp-alert-stat__label">Max Confidence</span>
                </div>
                <div class="fp-alert-stat">
                    <span class="fp-alert-stat__value">${riskLevel}</span>
                    <span class="fp-alert-stat__label">Risk Level</span>
                </div>
            </div>
        </div>
    `;
    
    // Body
    const body = document.createElement('div');
    body.className = 'fp-alert-body';
    
    // Session info
    if (behavioralData.sessionDuration?.value > 0) {
        const sessionInfo = document.createElement('div');
        sessionInfo.style.cssText = `
            background: var(--fp-info-50);
            border: 1px solid var(--fp-info-200);
            padding: var(--fp-spacing-md);
            border-radius: var(--fp-radius-md);
            margin-bottom: var(--fp-spacing-md);
        `;
        sessionInfo.innerHTML = `
            <div style="font-weight: 600; color: var(--fp-info-700); margin-bottom: var(--fp-spacing-xs);">📊 Session Information</div>
            <div style="font-size: 0.875rem; color: var(--fp-gray-600);">
                Duration: ${behavioralData.sessionDuration.value}s | 
                Total Events: ${behavioralData.totalEvents?.value || 0} | 
                ${behavioralData.summary?.value || 'No summary available'}
            </div>
        `;
        body.appendChild(sessionInfo);
    }
    
    // Render detected indicators
    const indicatorNames = {
        'centralButtonClicks': 'Central Button Clicks',
        'clicksWithoutMouseMovement': 'Clicks Without Mouse Movement',
        'nonHumanScrolling': 'Non-Human Scrolling',
        'artificialTiming': 'Artificial Timing Patterns',
        'missingMouseTrails': 'Missing Mouse Trails'
    };
    
    detectedIndicators
        .filter(([key]) => indicatorNames[key])
        .forEach(([key, data]) => {
            try {
                body.appendChild(createBehavioralItem(indicatorNames[key], data));
            } catch (error) {
                console.error('Error rendering behavioral indicator:', key, error);
            }
        });
    
    section.appendChild(header);
    section.appendChild(body);
    
    return section;
}

/**
 * Create a single indicator item
 * @param {object} indicator - Indicator data
 * @returns {HTMLElement} Indicator item element
 */
function createIndicatorItem(indicator) {
    const riskClass = (indicator.riskLevel || 'high').toLowerCase();
    const importance = IMPORTANCE_LEVELS[indicator.importance] || IMPORTANCE_LEVELS.WEAK;
    
    const item = document.createElement('article');
    item.className = `fp-alert-item fp-alert-item--${riskClass}`;
    item.setAttribute('role', 'article');
    item.setAttribute('aria-label', `${indicator.name}: ${riskClass} risk`);
    
    item.innerHTML = `
        <div class="fp-alert-item__icon" aria-hidden="true">${getRiskIcon(indicator.riskLevel)}</div>
        <div class="fp-alert-item__content">
            <div class="fp-alert-item__name">${escapeHtml(indicator.name)} <span aria-label="${importance.label}">${importance.icon}</span></div>
            <div class="fp-alert-item__description">${escapeHtml(indicator.description)}</div>
            <div class="fp-alert-item__meta">
                <span class="fp-alert-tag fp-alert-tag--primary">${escapeHtml(indicator.category)}</span>
                <span class="fp-alert-tag">Value: <code>${escapeHtml(String(indicator.value))}</code></span>
                <span class="fp-alert-tag">Confidence: ${formatPercentage(indicator.confidence)}</span>
                <span class="fp-alert-tag" style="background: ${importance.color}; color: white; border-color: ${importance.color};">
                    ${importance.label}
                </span>
            </div>
            ${indicator.details ? `
                <div style="margin-top: var(--fp-space-2, 0.5rem); font-size: var(--fp-font-size-200, 0.75rem); color: var(--fp-neutral-foreground-4, #707070);">
                    ${escapeHtml(indicator.details)}
                </div>
            ` : ''}
        </div>
    `;
    
    return item;
}

/**
 * Create a behavioral indicator item
 * @param {string} name - Display name
 * @param {object} data - Indicator data
 * @returns {HTMLElement} Behavioral item element
 */
function createBehavioralItem(name, data) {
    const item = document.createElement('article');
    item.className = 'fp-alert-item';
    item.setAttribute('role', 'article');
    item.setAttribute('aria-label', `${name}: behavioral anomaly detected`);
    
    const confidenceHigh = data.confidence > 0.7;
    const confidenceClass = confidenceHigh ? 'high-confidence' : '';
    
    item.innerHTML = `
        <div class="fp-alert-item__icon" aria-hidden="true">🎯</div>
        <div class="fp-alert-item__content">
            <div class="fp-alert-item__name">${escapeHtml(name)}</div>
            <div class="fp-alert-item__description">${escapeHtml(data.description || 'Behavioral anomaly detected during user interaction analysis')}</div>
            <div class="fp-alert-item__meta">
                <span class="fp-alert-tag">Count: <strong>${data.count || 0}</strong></span>
                <span class="fp-alert-tag">Threshold: ${data.threshold || 0}</span>
                <span class="fp-alert-tag ${confidenceClass}" style="${confidenceHigh ? 'background: var(--fp-status-danger-background, #FDE7E9); color: var(--fp-status-danger-foreground, #B10E1C); border-color: var(--fp-status-danger-border, #F7A6AD);' : ''}">
                    Confidence: ${formatPercentage(data.confidence)}
                </span>
                <span class="fp-alert-tag" style="background: var(--fp-status-danger-background, #FDE7E9); color: var(--fp-status-danger-foreground, #B10E1C); border-color: var(--fp-status-danger-border, #F7A6AD); font-weight: 600;">
                    ⚡ DETECTED
                </span>
            </div>
            ${data.details?.length ? `
                <details style="margin-top: var(--fp-space-3, 0.75rem);">
                    <summary style="cursor: pointer; color: var(--fp-brand-primary, #0F6CBD); font-size: var(--fp-font-size-300, 0.8125rem); font-weight: 500;">
                        View Details (${data.details.length} samples)
                    </summary>
                    <div style="margin-top: var(--fp-space-2, 0.5rem); font-size: var(--fp-font-size-200, 0.75rem);">
                        ${data.details.slice(0, 3).map(detail => `
                            <div style="background: var(--fp-neutral-background-3, #F5F5F5); padding: var(--fp-space-2, 0.5rem); margin: var(--fp-space-1, 0.25rem) 0; border-radius: var(--fp-radius-md, 4px); font-family: var(--fp-font-family-mono, monospace);">
                                ${escapeHtml(JSON.stringify(detail, null, 2).substring(0, 150))}...
                            </div>
                        `).join('')}
                    </div>
                </details>
            ` : ''}
        </div>
    `;
    
    return item;
}

/**
 * Get risk icon based on severity
 * @param {string} riskLevel - Risk level
 * @returns {string} Icon emoji
 */
function getRiskIcon(riskLevel) {
    switch (String(riskLevel).toUpperCase()) {
        case 'HIGH': return '�';
        case 'MEDIUM': return '🟡';
        case 'LOW': return '�';
        default: return '○';
    }
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

/**
 * Create fake devices alert section
 * @param {Object} mediaDevicesMetrics - Media devices metrics from fingerprint
 * @returns {HTMLElement|null} Alert section or null if no fake devices
 */
export function createFakeDevicesSection(mediaDevicesMetrics) {
    // Check if fake devices were detected
    if (!mediaDevicesMetrics?.fakeDevicesDetected?.value) {
        return null;
    }
    
    const section = document.createElement('div');
    section.className = 'fp-alert-section fp-alert-section--danger';
    
    // Header
    const header = document.createElement('div');
    header.className = 'fp-alert-header fp-alert-header--danger';
    header.innerHTML = `
        <div class="fp-alert-header__icon">🎭</div>
        <div class="fp-alert-header__content">
            <h3 class="fp-alert-header__title">Fake Media Devices Detected</h3>
            <p class="fp-alert-header__subtitle">This browser is using simulated/fake media devices - strong indicator of AI automation</p>
            <div class="fp-alert-stats">
                <div class="fp-alert-stat">
                    <span class="fp-alert-stat__value">${mediaDevicesMetrics.fakeDeviceCount?.value || 0}</span>
                    <span class="fp-alert-stat__label">Fake Devices</span>
                </div>
                <div class="fp-alert-stat">
                    <span class="fp-alert-stat__value">HIGH</span>
                    <span class="fp-alert-stat__label">Risk Level</span>
                </div>
                <div class="fp-alert-stat">
                    <span class="fp-alert-stat__value">95%</span>
                    <span class="fp-alert-stat__label">Confidence</span>
                </div>
            </div>
        </div>
    `;
    
    // Body
    const body = document.createElement('div');
    body.className = 'fp-alert-body';
    
    const detailsItem = document.createElement('article');
    detailsItem.className = 'fp-alert-item fp-alert-item--high';
    detailsItem.innerHTML = `
        <div class="fp-alert-item__header">
            <span class="fp-alert-item__icon">🔊</span>
            <span class="fp-alert-item__title">Fake Device Labels</span>
            <span class="fp-alert-item__badge fp-alert-item__badge--high">AI Agent Indicator</span>
        </div>
        <div class="fp-alert-item__body">
            <p class="fp-alert-item__description">
                ${escapeHtml(mediaDevicesMetrics.fakeDevicesDetected?.details || 'Fake media devices detected')}
            </p>
            ${mediaDevicesMetrics.fakeDeviceLabels?.value ? `
                <details class="fp-alert-item__details" open>
                    <summary>Detected Fake Device Labels</summary>
                    <pre class="fp-alert-item__code">${escapeHtml(mediaDevicesMetrics.fakeDeviceLabels.value)}</pre>
                </details>
            ` : ''}
            <p style="margin-top: 12px; font-size: 0.85rem; color: var(--fp-gray-500);">
                <strong>Why this matters:</strong> Real browsers have real media devices with legitimate names. 
                Fake device labels like "Fake Microphone", "Fake Camera", or "Fake Speaker" are commonly used by 
                AI automation agents (e.g., browserUse) to simulate media device presence without actual hardware.
            </p>
        </div>
    `;
    
    body.appendChild(detailsItem);
    section.appendChild(header);
    section.appendChild(body);
    
    return section;
}

/**
 * Create known agents detection section
 * Renders detection results for known AI agents (Manus, Comet, Genspark, etc.)
 * @param {object} knownAgentsData - Known agents detection data from analyzer
 * @returns {HTMLElement|null} Alert section or null if no data
 */
export function createKnownAgentsSection(knownAgentsData) {
    if (!knownAgentsData || !knownAgentsData.results) {
        return null;
    }

    const results = knownAgentsData.results;
    const detectionResults = results.detectionResults || [];
    const detectedAgents = results.detectedAgents || [];
    const hasAnyAgent = results.hasAnyAgent || false;
    const history = knownAgentsData.history || [];
    const isPeriodicRunning = knownAgentsData.isPeriodicRunning || false;
    const intervalMs = knownAgentsData.intervalMs || 60000;

    const section = document.createElement('div');
    section.className = `fp-alert-section fp-known-agents-section ${hasAnyAgent ? 'fp-alert-section--danger' : 'fp-alert-section--success'}`;
    section.id = 'fp-known-agents-section';

    // Header
    const header = document.createElement('div');
    header.className = `fp-alert-header premium-agents-header ${hasAnyAgent ? 'fp-alert-header--danger' : 'fp-alert-header--success'}`;
    const headerIcon = hasAnyAgent 
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4M12 16h.01"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`;
    header.innerHTML = `
        <div class="fp-alert-header__icon premium-agents-icon">${headerIcon}</div>
        <div class="fp-alert-header__content premium-agents-content">
            <h3 class="fp-alert-header__title premium-agents-title">
                ${hasAnyAgent ? 'Known AI Agent(s) Detected!' : 'No Known Agents Detected'}
            </h3>
            <p class="fp-alert-header__subtitle premium-agents-subtitle">
                Detection for known automation frameworks and AI agents
                ${isPeriodicRunning ? `<span class="fp-badge fp-badge--info" style="margin-left: 8px; display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Live monitoring (every ${intervalMs / 1000}s)</span>` : ''}
            </p>
            <div class="fp-alert-stats premium-agents-stats">
                <div class="fp-alert-stat premium-agent-stat">
                    <span class="fp-alert-stat__value premium-agent-stat-value">${detectedAgents.length}</span>
                    <span class="fp-alert-stat__label premium-agent-stat-label">Agents Detected</span>
                </div>
                <div class="fp-alert-stat premium-agent-stat">
                    <span class="fp-alert-stat__value premium-agent-stat-value">${detectionResults.length}</span>
                    <span class="fp-alert-stat__label premium-agent-stat-label">Agents Checked</span>
                </div>
                <div class="fp-alert-stat premium-agent-stat">
                    <span class="fp-alert-stat__value premium-agent-stat-value">${history.length}</span>
                    <span class="fp-alert-stat__label premium-agent-stat-label">Detection Runs</span>
                </div>
            </div>
        </div>
    `;

    // Body with detection results
    const body = document.createElement('div');
    body.className = 'fp-alert-body premium-agents-body';
    body.id = 'fp-known-agents-body';

    // Show detected agents first (if any)
    if (hasAnyAgent) {
        const detectedSection = document.createElement('div');
        detectedSection.className = 'fp-known-agents-detected premium-agents-detected';
        detectedSection.innerHTML = `
            <h4>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span>Detected Agents</span>
            </h4>
        `;

        detectionResults.filter(r => r.detected).forEach(result => {
            detectedSection.appendChild(createAgentResultItem(result, true));
        });

        body.appendChild(detectedSection);
    }

    // Show all agent checks as a grid
    const allAgentsSection = document.createElement('div');
    allAgentsSection.className = 'fp-known-agents-grid premium-agents-grid';
    allAgentsSection.innerHTML = `
        <h4>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
            </svg>
            <span>All Agent Checks</span>
        </h4>
        <div class="fp-agent-grid premium-agent-grid">
            ${detectionResults.map(result => createAgentCardHTML(result)).join('')}
        </div>
    `;

    body.appendChild(allAgentsSection);

    // Add last detection timestamp
    if (results.timestamp) {
        const timestamp = document.createElement('div');
        timestamp.className = 'fp-known-agents-timestamp premium-agents-timestamp';
        timestamp.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Last detection: ${new Date(results.timestamp).toLocaleString()}</span>
            ${isPeriodicRunning ? '<span class="fp-badge fp-badge--success" style="font-size: 0.7rem; display: inline-flex; align-items: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> Monitoring Active</span>' : ''}
        `;
        body.appendChild(timestamp);
    }

    section.appendChild(header);
    section.appendChild(body);

    return section;
}

/**
 * Create a detailed agent result item for detected agents
 * @private
 */
function createAgentResultItem(result, isDetected) {
    const item = document.createElement('article');
    item.className = `fp-alert-item premium-agent-result-item ${isDetected ? 'fp-alert-item--high premium-agent-result-item--detected' : 'fp-alert-item--low'}`;
    
    const confidence = result.confidence ? `${(result.confidence * 100).toFixed(0)}%` : 'N/A';
    const indicators = result.indicators || [];
    const agentIcon = getAgentIconAsImage(result.name);
    
    item.innerHTML = `
        <div class="fp-alert-item__header premium-agent-result-header">
            <div class="premium-agent-card__icon">${agentIcon}</div>
            <span class="fp-alert-item__title premium-agent-result-title">${escapeHtml(result.name)}</span>
            <span class="fp-alert-item__badge premium-agent-card__badge ${isDetected ? 'premium-agent-card__badge--detected' : 'premium-agent-card__badge--clear'}">
                ${isDetected ? `DETECTED (${confidence})` : 'Not Detected'}
            </span>
        </div>
        <div class="fp-alert-item__body premium-agent-result-body">
            <p class="fp-alert-item__description premium-agent-result-description">
                <strong>Detection Method:</strong> ${escapeHtml(result.detectionMethod || 'Unknown')}
            </p>
            ${result.primarySignal ? `
                <p class="fp-alert-item__description premium-agent-result-description">
                    <strong>Primary Signal:</strong> ${escapeHtml(result.primarySignal)}
                </p>
            ` : ''}
            ${indicators.length > 0 ? `
                <details class="fp-alert-item__details premium-agent-result-details">
                    <summary>Detection Indicators (${indicators.length})</summary>
                    <ul style="margin: var(--premium-space-3) 0; padding-left: var(--premium-space-5); list-style: none;">
                        ${indicators.map(ind => `
                            <li style="margin: var(--premium-space-2) 0; font-size: var(--premium-font-size-sm); display: flex; align-items: flex-start; gap: var(--premium-space-2);">
                                <span style="color: var(--premium-primary); margin-top: 4px;">•</span>
                                <span><strong>${escapeHtml(ind.name || 'Unknown')}</strong>: ${escapeHtml(ind.description || ind.value || '')}</span>
                            </li>
                        `).join('')}
                    </ul>
                </details>
            ` : ''}
            ${result.error ? `
                <p style="color: var(--premium-warning); font-size: var(--premium-font-size-sm); margin-top: var(--premium-space-3); display: flex; align-items: center; gap: var(--premium-space-2);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Detection error: ${escapeHtml(result.error)}
                </p>
            ` : ''}
        </div>
    `;
    
    return item;
}

/**
 * Create HTML for agent card in the grid
 * @private
 */
function createAgentCardHTML(result) {
    const isDetected = result.detected;
    const confidence = result.confidence ? `${(result.confidence * 100).toFixed(0)}%` : 'N/A';
    const agentIcon = getAgentIconAsImage(result.name);
    
    return `
        <div class="fp-agent-card premium-agent-card ${isDetected ? 'premium-agent-card--detected' : ''}">
            <div class="premium-agent-card__header">
                <div class="premium-agent-card__icon">${agentIcon}</div>
                <span class="premium-agent-card__name">${escapeHtml(result.name)}</span>
                <span class="premium-agent-card__badge ${isDetected ? 'premium-agent-card__badge--detected' : 'premium-agent-card__badge--clear'}">
                    ${isDetected ? 'DETECTED' : 'Clear'}
                </span>
            </div>
            <div class="premium-agent-card__method">
                ${escapeHtml(result.detectionMethod || 'Unknown method')}
            </div>
            ${isDetected ? `
                <div class="premium-agent-card__confidence">
                    Confidence: <strong>${confidence}</strong>
                    ${result.primarySignal ? ` • ${escapeHtml(result.primarySignal)}` : ''}
                </div>
            ` : ''}
            ${result.error ? `
                <div style="font-size: var(--premium-font-size-xs); color: var(--premium-warning); margin-top: var(--premium-space-2); display: flex; align-items: center; gap: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    ${escapeHtml(result.error)}
                </div>
            ` : ''}
        </div>
    `;
}

/**
 * Update known agents section with new data (for live updates)
 * @param {object} knownAgentsData - Updated known agents detection data
 */
export function updateKnownAgentsSection(knownAgentsData) {
    const section = document.getElementById('fp-known-agents-section');
    if (!section) {
        console.warn('Known agents section not found, cannot update');
        return;
    }

    // Remove old section and create new one
    const newSection = createKnownAgentsSection(knownAgentsData);
    if (newSection) {
        section.replaceWith(newSection);
    }
}
