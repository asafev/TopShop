/**
 * Fingerprint UI - Summary Cards Component
 * Enterprise-grade KPI dashboard cards with professional styling
 * Following Microsoft Fluent and IBM Carbon design patterns
 */

/**
 * Create summary cards section
 * @param {object} summary - Summary data
 * @returns {HTMLElement} Summary cards container
 */
export function createSummaryCards(summary) {
    const container = document.createElement('div');
    container.className = 'fp-summary-grid';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Analysis Summary');
    
    const cards = [
        {
            label: 'Total Metrics',
            value: formatNumber(summary.totalMetrics || 0),
            description: 'Browser characteristics analyzed',
            icon: '📊',
            variant: 'info',
            trend: null
        },
        {
            label: 'Risk Assessment',
            value: formatRiskLevel(summary.riskLevel),
            description: 'Overall automation risk level',
            icon: getRiskIcon(summary.riskLevel),
            variant: getRiskVariant(summary.riskLevel),
            trend: null
        },
        {
            label: 'High Risk Signals',
            value: formatNumber(summary.highRiskIndicators || 0),
            description: 'Critical indicators detected',
            icon: summary.highRiskIndicators > 0 ? '⚠️' : '✓',
            variant: summary.highRiskIndicators > 0 ? 'danger' : 'success',
            trend: summary.highRiskIndicators > 0 ? 'negative' : 'positive'
        },
        {
            label: 'Automation Status',
            value: formatAutomationStatus(summary.automationLikelihood),
            description: 'Probability of automated browsing',
            icon: getAutomationIcon(summary.automationLikelihood),
            variant: getAutomationVariant(summary.automationLikelihood),
            trend: null
        }
    ];
    
    cards.forEach(card => {
        container.appendChild(createSummaryCard(card));
    });
    
    return container;
}

/**
 * Create a single summary card
 * @param {object} options - Card options
 * @returns {HTMLElement} Card element
 */
function createSummaryCard({ label, value, description, icon, variant, trend }) {
    const card = document.createElement('article');
    card.className = `fp-summary-card fp-summary-card--${variant}`;
    card.setAttribute('role', 'article');
    card.setAttribute('aria-label', `${label}: ${value}`);
    
    // Build trend indicator if applicable
    const trendHtml = trend ? `<span class="fp-summary-card__trend fp-summary-card__trend--${trend}" aria-hidden="true">${trend === 'positive' ? '↓' : '↑'}</span>` : '';
    
    card.innerHTML = `
        <div class="fp-summary-card__header">
            <span class="fp-summary-card__label">${escapeHtml(label)}</span>
            <div class="fp-summary-card__icon" aria-hidden="true">${icon}</div>
        </div>
        <div class="fp-summary-card__value">
            ${escapeHtml(String(value))}${trendHtml}
        </div>
        <div class="fp-summary-card__description">${escapeHtml(description)}</div>
    `;
    
    return card;
}

/**
 * Update summary cards with new data
 * @param {HTMLElement} container - Container element
 * @param {object} summary - New summary data
 */
export function updateSummaryCards(container, summary) {
    // Clear and recreate
    container.innerHTML = '';
    const newCards = createSummaryCards(summary);
    container.innerHTML = newCards.innerHTML;
}

/**
 * Format number with locale-aware formatting
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    return num.toLocaleString();
}

/**
 * Format risk level for display
 * @param {string} riskLevel - Risk level
 * @returns {string} Formatted risk level
 */
function formatRiskLevel(riskLevel) {
    const level = String(riskLevel || 'Unknown').toLowerCase();
    switch (level) {
        case 'high': return 'High';
        case 'medium': return 'Medium';
        case 'low': return 'Low';
        case 'none': return 'None';
        default: return 'Unknown';
    }
}

/**
 * Format automation status for display
 * @param {string} likelihood - Automation likelihood
 * @returns {string} Formatted status
 */
function formatAutomationStatus(likelihood) {
    const level = String(likelihood || 'Unknown').toLowerCase();
    if (level.includes('high') || level.includes('likely')) return 'Likely';
    if (level.includes('medium') || level.includes('possible')) return 'Possible';
    if (level.includes('low') || level.includes('unlikely')) return 'Unlikely';
    if (level.includes('none')) return 'Human';
    return 'Unknown';
}

/**
 * Get risk icon based on level
 * @param {string} riskLevel - Risk level
 * @returns {string} Icon emoji
 */
function getRiskIcon(riskLevel) {
    const level = String(riskLevel || '').toLowerCase();
    switch (level) {
        case 'high': return '�';
        case 'medium': return '🟡';
        case 'low': return '🟢';
        case 'none': return '✓';
        default: return '○';
    }
}

/**
 * Get automation icon based on likelihood
 * @param {string} likelihood - Automation likelihood
 * @returns {string} Icon emoji
 */
function getAutomationIcon(likelihood) {
    const level = String(likelihood || '').toLowerCase();
    if (level.includes('high') || level.includes('likely')) return '🤖';
    if (level.includes('medium') || level.includes('possible')) return '⚡';
    if (level.includes('low') || level.includes('unlikely')) return '👤';
    if (level.includes('none')) return '👤';
    return '○';
}

/**
 * Get variant based on risk level
 * @param {string} riskLevel - Risk level
 * @returns {string} Variant name
 */
function getRiskVariant(riskLevel) {
    const level = String(riskLevel || '').toLowerCase();
    switch (level) {
        case 'high': return 'danger';
        case 'medium': return 'warning';
        case 'low': return 'success';
        case 'none': return 'success';
        default: return 'info';
    }
}

/**
 * Get variant based on automation likelihood
 * @param {string} likelihood - Automation likelihood
 * @returns {string} Variant name
 */
function getAutomationVariant(likelihood) {
    const level = String(likelihood || '').toLowerCase();
    if (level.includes('high') || level.includes('likely')) return 'danger';
    if (level.includes('medium') || level.includes('possible')) return 'warning';
    if (level.includes('low') || level.includes('unlikely')) return 'success';
    if (level.includes('none')) return 'success';
    return 'info';
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
