/**
 * Fingerprint UI - Section Component
 * Enterprise-grade expandable section with header and content
 * Following Microsoft Fluent and IBM Carbon design patterns
 */

import { getCategoryConfig } from '../utils/helpers.js';

/**
 * Create an expandable section component
 * @param {object} options - Section options
 * @param {string} options.categoryKey - The category key
 * @param {number} options.metricCount - Number of metrics in section
 * @param {HTMLElement} options.content - The content element
 * @param {boolean} options.expanded - Initial expanded state
 * @param {object} options.diffInfo - Optional diff information for diff mode
 * @returns {HTMLElement} Section element
 */
export function createSection({ categoryKey, metricCount, content, expanded = false, diffInfo = null }) {
    const config = getCategoryConfig(categoryKey);
    
    const section = document.createElement('section');
    section.className = `fp-section premium-section premium-section--${categoryKey}${expanded ? ' premium-section--expanded' : ''}`;
    section.dataset.category = categoryKey;
    section.setAttribute('aria-label', config.label);
    
    // Create unique ID for accessibility
    const sectionId = `fp-section-${categoryKey}-${Date.now()}`;
    const contentId = `${sectionId}-content`;
    
    // Create header
    const header = document.createElement('div');
    header.className = 'fp-section__header premium-section__header';
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    header.setAttribute('aria-controls', contentId);
    header.setAttribute('tabindex', '0');
    header.id = sectionId;
    
    // Build diff status indicator if in diff mode
    let diffStatusHtml = '';
    if (diffInfo) {
        const statusClass = diffInfo.hasChanges ? 'changed' : 'match';
        const statusIcon = diffInfo.hasChanges ? '⚡' : '✓';
        diffStatusHtml = `<span class="fp-section__diff-status fp-section__diff-status--${statusClass}" aria-hidden="true">${statusIcon}</span>`;
    }
    
    // Build metric count badge with optional diff counts
    let countBadgesHtml = '';
    if (diffInfo && diffInfo.counts) {
        if (diffInfo.counts.changed > 0) {
            countBadgesHtml += `<span class="fp-diff-count fp-diff-count--changed" title="Changed">${diffInfo.counts.changed} changed</span>`;
        }
        if (diffInfo.counts.new > 0) {
            countBadgesHtml += `<span class="fp-diff-count fp-diff-count--new" title="New">${diffInfo.counts.new} new</span>`;
        }
        if (diffInfo.counts.missing > 0) {
            countBadgesHtml += `<span class="fp-diff-count fp-diff-count--missing" title="Missing">${diffInfo.counts.missing} missing</span>`;
        }
    }
    
    // Handle SVG icons vs emoji
    const iconHtml = config.iconType === 'svg' 
        ? `<div class="fp-section__icon premium-section__icon fp-section__icon--svg" aria-hidden="true">${config.icon}</div>`
        : `<div class="fp-section__icon premium-section__icon" aria-hidden="true">${config.icon}</div>`;
    
    header.innerHTML = `
        ${iconHtml}
        <div class="fp-section__title-group premium-section__title-group">
            <h3 class="fp-section__title premium-section__title">
                ${diffStatusHtml}${escapeHtml(config.label)}
            </h3>
            <p class="fp-section__subtitle premium-section__subtitle">${escapeHtml(config.description)}</p>
        </div>
        <div class="fp-section__meta premium-section__meta">
            ${countBadgesHtml}
            <span class="fp-section__count premium-section__count" title="${metricCount} metrics" aria-label="${metricCount} metrics">${metricCount}</span>
            <div class="fp-section__toggle premium-section__toggle" aria-hidden="true">
                <svg class="fp-section__toggle-icon premium-section__toggle-icon fp-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
        </div>
    `;
    
    // Create content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'fp-section__content premium-section__content';
    contentWrapper.id = contentId;
    contentWrapper.setAttribute('role', 'region');
    contentWrapper.setAttribute('aria-labelledby', sectionId);
    
    const contentInner = document.createElement('div');
    contentInner.className = 'fp-section__inner premium-section__inner';
    contentInner.appendChild(content);
    
    contentWrapper.appendChild(contentInner);
    
    // Toggle functionality
    const toggleSection = () => {
        const isExpanded = section.classList.toggle('fp-section--expanded');
        section.classList.toggle('premium-section--expanded', isExpanded);
        header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        
        // Announce state change to screen readers
        const announcement = isExpanded ? `${config.label} section expanded` : `${config.label} section collapsed`;
        announceToScreenReader(announcement);
    };
    
    header.addEventListener('click', toggleSection);
    header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSection();
        }
    });
    
    section.appendChild(header);
    section.appendChild(contentWrapper);
    
    return section;
}

/**
 * Create the section manager to handle expand all/collapse all
 * @returns {object} Section manager with methods
 */
export function createSectionManager() {
    const sections = new Map();
    
    return {
        /**
         * Register a section
         * @param {string} categoryKey - The category key
         * @param {HTMLElement} element - The section element
         */
        register(categoryKey, element) {
            sections.set(categoryKey, element);
        },
        
        /**
         * Expand all sections
         */
        expandAll() {
            sections.forEach((element) => {
                element.classList.add('fp-section--expanded', 'premium-section--expanded');
                const header = element.querySelector('.fp-section__header');
                if (header) header.setAttribute('aria-expanded', 'true');
            });
            announceToScreenReader('All sections expanded');
        },
        
        /**
         * Collapse all sections
         */
        collapseAll() {
            sections.forEach((element) => {
                element.classList.remove('fp-section--expanded', 'premium-section--expanded');
                const header = element.querySelector('.fp-section__header');
                if (header) header.setAttribute('aria-expanded', 'false');
            });
            announceToScreenReader('All sections collapsed');
        },
        
        /**
         * Toggle a specific section
         * @param {string} categoryKey - The category key
         */
        toggle(categoryKey) {
            const element = sections.get(categoryKey);
            if (element) {
                const isExpanded = element.classList.toggle('fp-section--expanded');
                element.classList.toggle('premium-section--expanded', isExpanded);
                const header = element.querySelector('.fp-section__header');
                if (header) header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
            }
        },
        
        /**
         * Get all registered sections
         * @returns {Map} Sections map
         */
        getSections() {
            return sections;
        },
        
        /**
         * Clear all registered sections
         */
        clear() {
            sections.clear();
        },
        
        /**
         * Get section count
         * @returns {number} Number of registered sections
         */
        count() {
            return sections.size;
        }
    };
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

/**
 * Announce message to screen readers using aria-live region
 * @param {string} message - Message to announce
 */
function announceToScreenReader(message) {
    // Check if announcement region exists, create if not
    let announcer = document.getElementById('fp-sr-announcer');
    if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = 'fp-sr-announcer';
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'sr-only';
        announcer.style.cssText = 'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;';
        document.body.appendChild(announcer);
    }
    
    // Update message (this triggers the announcement)
    announcer.textContent = '';
    setTimeout(() => {
        announcer.textContent = message;
    }, 100);
}
