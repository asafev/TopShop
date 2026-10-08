/**
 * Fingerprint UI - Scroll Navigator Component
 * Enterprise-grade floating navigation hint showing remaining sections
 * Senior UI/UX design with smooth animations and accessibility
 */

import { getCategoryConfig } from '../utils/helpers.js';

/**
 * Create a floating scroll navigator that shows remaining categories
 * @param {object} options - Configuration options
 * @param {HTMLElement} options.sectionsContainer - The container with all sections
 * @param {number} options.visibleThreshold - Viewport threshold for visibility (0-1)
 * @param {number} options.maxCategoriesToShow - Maximum categories to display
 * @param {boolean} options.showProgress - Show scroll progress indicator
 * @param {string} options.position - Position: 'bottom-right' | 'bottom-center' | 'bottom-left'
 * @returns {object} Navigator controller with show/hide/update methods
 */
export function createScrollNavigator(options = {}) {
    const {
        sectionsContainer = null,
        visibleThreshold = 0.3,
        maxCategoriesToShow = 5,
        showProgress = true,
        position = 'bottom-right',
        onCategoryClick = null
    } = options;

    // State
    let isVisible = false;
    let isMinimized = false;
    let currentSections = [];
    let remainingCategories = [];
    let scrollProgress = 0;
    let lastScrollY = 0;
    let scrollTimeout = null;
    let hideTimeout = null;

    // Create navigator container
    const navigator = document.createElement('div');
    navigator.className = `fp-scroll-navigator fp-scroll-navigator--${position}`;
    navigator.setAttribute('role', 'navigation');
    navigator.setAttribute('aria-label', 'Category navigation');
    navigator.innerHTML = `
        <div class="fp-scroll-navigator__header">
            <div class="fp-scroll-navigator__title">
                <svg class="fp-scroll-navigator__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <polyline points="19 12 12 19 5 12"></polyline>
                </svg>
                <span class="fp-scroll-navigator__title-text">Scroll to Explore</span>
            </div>
            <div class="fp-scroll-navigator__controls">
                <button class="fp-scroll-navigator__btn fp-scroll-navigator__btn--minimize" title="Minimize" aria-label="Minimize navigator">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="4 14 10 14 10 20"></polyline>
                        <polyline points="20 10 14 10 14 4"></polyline>
                        <line x1="14" y1="10" x2="21" y2="3"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                </button>
                <button class="fp-scroll-navigator__btn fp-scroll-navigator__btn--close" title="Close" aria-label="Close navigator">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        ${showProgress ? `
        <div class="fp-scroll-navigator__progress">
            <div class="fp-scroll-navigator__progress-bar">
                <div class="fp-scroll-navigator__progress-fill"></div>
            </div>
            <span class="fp-scroll-navigator__progress-text">0%</span>
        </div>
        ` : ''}
        <div class="fp-scroll-navigator__categories">
            <div class="fp-scroll-navigator__list"></div>
        </div>
        <div class="fp-scroll-navigator__footer">
            <span class="fp-scroll-navigator__remaining">0 categories remaining</span>
        </div>
    `;

    // Cache DOM elements
    const headerEl = navigator.querySelector('.fp-scroll-navigator__header');
    const listEl = navigator.querySelector('.fp-scroll-navigator__list');
    const footerEl = navigator.querySelector('.fp-scroll-navigator__footer');
    const remainingTextEl = navigator.querySelector('.fp-scroll-navigator__remaining');
    const progressFillEl = navigator.querySelector('.fp-scroll-navigator__progress-fill');
    const progressTextEl = navigator.querySelector('.fp-scroll-navigator__progress-text');
    const minimizeBtn = navigator.querySelector('.fp-scroll-navigator__btn--minimize');
    const closeBtn = navigator.querySelector('.fp-scroll-navigator__btn--close');

    // Event handlers
    minimizeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMinimize();
    });

    closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        hide();
        // Remember user preference
        sessionStorage.setItem('fp-scroll-nav-hidden', 'true');
    });

    // Click on minimized state to expand
    navigator.addEventListener('click', (e) => {
        if (isMinimized && !e.target.closest('.fp-scroll-navigator__btn')) {
            toggleMinimize();
        }
    });

    /**
     * Toggle minimized state
     */
    function toggleMinimize() {
        isMinimized = !isMinimized;
        navigator.classList.toggle('fp-scroll-navigator--minimized', isMinimized);
        
        if (isMinimized) {
            minimizeBtn.title = 'Expand';
            minimizeBtn.setAttribute('aria-label', 'Expand navigator');
        } else {
            minimizeBtn.title = 'Minimize';
            minimizeBtn.setAttribute('aria-label', 'Minimize navigator');
        }
    }

    /**
     * Show the navigator
     */
    function show() {
        if (sessionStorage.getItem('fp-scroll-nav-hidden') === 'true') {
            return; // User closed it, don't show again
        }
        
        if (!isVisible) {
            isVisible = true;
            document.body.appendChild(navigator);
            // Trigger animation
            requestAnimationFrame(() => {
                navigator.classList.add('fp-scroll-navigator--visible');
            });
        }
    }

    /**
     * Hide the navigator
     */
    function hide() {
        if (isVisible) {
            navigator.classList.remove('fp-scroll-navigator--visible');
            isVisible = false;
            setTimeout(() => {
                if (!isVisible && navigator.parentNode) {
                    navigator.parentNode.removeChild(navigator);
                }
            }, 300); // Match CSS transition
        }
    }

    /**
     * Update the list of remaining categories
     * @param {Array} categories - Array of {key, label, icon, element}
     */
    function updateCategories(categories) {
        remainingCategories = categories.slice(0, maxCategoriesToShow);
        const hasMore = categories.length > maxCategoriesToShow;
        
        listEl.innerHTML = '';
        
        remainingCategories.forEach((cat, index) => {
            const item = document.createElement('button');
            item.className = 'fp-scroll-navigator__item';
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', `Scroll to ${cat.label}`);
            item.style.setProperty('--item-delay', `${index * 50}ms`);
            
            // Get icon - handle both SVG strings and emoji
            const iconHtml = cat.iconType === 'svg' 
                ? `<span class="fp-scroll-navigator__item-icon fp-scroll-navigator__item-icon--svg">${cat.icon}</span>`
                : `<span class="fp-scroll-navigator__item-icon">${cat.icon}</span>`;
            
            item.innerHTML = `
                ${iconHtml}
                <span class="fp-scroll-navigator__item-label">${escapeHtml(cat.label)}</span>
                <span class="fp-scroll-navigator__item-count">${cat.metricCount || ''}</span>
                <svg class="fp-scroll-navigator__item-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            `;
            
            item.addEventListener('click', () => {
                if (cat.element) {
                    cat.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // Expand the section if collapsed
                    if (!cat.element.classList.contains('fp-section--expanded')) {
                        const header = cat.element.querySelector('.fp-section__header');
                        if (header) header.click();
                    }
                }
                if (onCategoryClick) {
                    onCategoryClick(cat);
                }
            });
            
            listEl.appendChild(item);
        });
        
        // Update footer
        const totalRemaining = categories.length;
        if (totalRemaining === 0) {
            remainingTextEl.textContent = 'All categories viewed ✓';
            footerEl.classList.add('fp-scroll-navigator__footer--complete');
        } else if (totalRemaining === 1) {
            remainingTextEl.textContent = '1 category remaining';
            footerEl.classList.remove('fp-scroll-navigator__footer--complete');
        } else {
            remainingTextEl.textContent = `${totalRemaining} categories remaining`;
            if (hasMore) {
                remainingTextEl.textContent += ` (showing ${maxCategoriesToShow})`;
            }
            footerEl.classList.remove('fp-scroll-navigator__footer--complete');
        }
    }

    /**
     * Update scroll progress
     * @param {number} progress - Progress from 0 to 100
     */
    function updateProgress(progress) {
        scrollProgress = Math.min(100, Math.max(0, progress));
        if (progressFillEl) {
            progressFillEl.style.width = `${scrollProgress}%`;
        }
        if (progressTextEl) {
            progressTextEl.textContent = `${Math.round(scrollProgress)}%`;
        }
    }

    /**
     * Get sections below the current viewport
     * @param {HTMLElement} container - The sections container
     * @returns {Array} Array of section info objects
     */
    function getSectionsBelow(container) {
        if (!container) return [];
        
        const sections = container.querySelectorAll('.fp-section');
        const viewportBottom = window.innerHeight;
        const result = [];
        
        sections.forEach(section => {
            // Skip hidden sections
            if (section.style.display === 'none') return;
            
            const rect = section.getBoundingClientRect();
            const categoryKey = section.dataset.category;
            
            // Section is below viewport (or only partially visible at bottom)
            if (rect.top > viewportBottom * visibleThreshold) {
                const config = getCategoryConfig(categoryKey);
                const countEl = section.querySelector('.fp-section__count');
                const metricCount = countEl ? countEl.textContent : '';
                
                result.push({
                    key: categoryKey,
                    label: config.label,
                    icon: config.icon,
                    iconType: config.iconType,
                    element: section,
                    top: rect.top,
                    metricCount
                });
            }
        });
        
        // Sort by position
        result.sort((a, b) => a.top - b.top);
        
        return result;
    }

    /**
     * Calculate scroll progress
     * @param {HTMLElement} container - The sections container
     * @returns {number} Progress from 0 to 100
     */
    function calculateProgress(container) {
        if (!container) return 0;
        
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight;
        const winHeight = window.innerHeight;
        const scrollableHeight = docHeight - winHeight;
        
        if (scrollableHeight <= 0) return 100;
        
        return (scrollTop / scrollableHeight) * 100;
    }

    /**
     * Handle scroll events
     */
    function handleScroll() {
        if (!sectionsContainer) return;
        
        // Debounce rapid scrolling
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        
        // Clear any pending hide
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
        
        scrollTimeout = setTimeout(() => {
            const currentScrollY = window.scrollY;
            const isScrollingDown = currentScrollY > lastScrollY;
            lastScrollY = currentScrollY;
            
            // Get remaining sections
            const sectionsBelow = getSectionsBelow(sectionsContainer);
            
            // Calculate progress
            const progress = calculateProgress(sectionsContainer);
            updateProgress(progress);
            
            // Show navigator if scrolling and there are sections below
            if (sectionsBelow.length > 0 && currentScrollY > 100) {
                show();
                updateCategories(sectionsBelow);
            } else if (sectionsBelow.length === 0) {
                // All sections viewed - show completion state briefly
                updateCategories([]);
                // Hide after delay if at bottom
                hideTimeout = setTimeout(() => {
                    if (progress > 95) {
                        hide();
                    }
                }, 3000);
            }
        }, 100);
    }

    /**
     * Initialize scroll listener
     */
    function init() {
        if (!sectionsContainer) {
            console.warn('ScrollNavigator: No sections container provided');
            return;
        }
        
        // Add scroll listener
        window.addEventListener('scroll', handleScroll, { passive: true });
        
        // Initial check after DOM settles
        setTimeout(() => {
            handleScroll();
        }, 500);
    }

    /**
     * Cleanup
     */
    function destroy() {
        window.removeEventListener('scroll', handleScroll);
        if (scrollTimeout) clearTimeout(scrollTimeout);
        if (hideTimeout) clearTimeout(hideTimeout);
        hide();
    }

    /**
     * Reset user preference (allow showing again)
     */
    function reset() {
        sessionStorage.removeItem('fp-scroll-nav-hidden');
        handleScroll();
    }

    return {
        init,
        show,
        hide,
        destroy,
        reset,
        updateCategories,
        updateProgress,
        element: navigator
    };
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default createScrollNavigator;
