/**
 * Fingerprint UI - Category Sidebar Component
 * Enterprise-grade persistent left navigation panel
 * Shows all categories with active state tracking and click-to-navigate
 */

import { getCategoryConfig } from '../utils/helpers.js';

/**
 * Create a persistent sidebar navigation showing all categories
 * @param {object} options - Configuration options
 * @param {HTMLElement} options.sectionsContainer - The container with all sections
 * @param {boolean} options.showProgress - Show scroll progress indicator
 * @param {boolean} options.collapsible - Allow sidebar to collapse
 * @param {boolean} options.showMetricCounts - Show metric counts next to categories
 * @param {Function} options.onCategoryClick - Callback when category is clicked
 * @returns {object} Sidebar controller
 */
export function createCategorySidebar(options = {}) {
    const {
        sectionsContainer = null,
        showProgress = true,
        collapsible = true,
        showMetricCounts = true,
        onCategoryClick = null
    } = options;

    // State
    let isCollapsed = false;
    let allCategories = [];
    let activeCategory = null;
    let scrollProgress = 0;
    let scrollTimeout = null;
    let isInitialized = false;

    // Create sidebar container
    const sidebar = document.createElement('aside');
    sidebar.className = 'fp-category-sidebar';
    sidebar.setAttribute('role', 'navigation');
    sidebar.setAttribute('aria-label', 'Category navigation');
    
    sidebar.innerHTML = `
        <div class="fp-category-sidebar__header">
            <div class="fp-category-sidebar__brand">
                <svg class="fp-category-sidebar__logo" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                </svg>
                <span class="fp-category-sidebar__title">Categories</span>
            </div>
            ${collapsible ? `
            <button class="fp-category-sidebar__toggle" title="Toggle sidebar" aria-label="Toggle sidebar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </button>
            ` : ''}
        </div>
        ${showProgress ? `
        <div class="fp-category-sidebar__progress">
            <div class="fp-category-sidebar__progress-bar">
                <div class="fp-category-sidebar__progress-fill"></div>
            </div>
            <span class="fp-category-sidebar__progress-text">0%</span>
        </div>
        ` : ''}
        <div class="fp-category-sidebar__content">
            <nav class="fp-category-sidebar__nav">
                <ul class="fp-category-sidebar__list" role="list"></ul>
            </nav>
        </div>
        <div class="fp-category-sidebar__footer">
            <span class="fp-category-sidebar__count">0 categories</span>
        </div>
    `;

    // Cache DOM elements
    const listEl = sidebar.querySelector('.fp-category-sidebar__list');
    const countEl = sidebar.querySelector('.fp-category-sidebar__count');
    const progressFillEl = sidebar.querySelector('.fp-category-sidebar__progress-fill');
    const progressTextEl = sidebar.querySelector('.fp-category-sidebar__progress-text');
    const toggleBtn = sidebar.querySelector('.fp-category-sidebar__toggle');

    // Toggle collapse handler
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            toggleCollapse();
        });
    }

    /**
     * Toggle collapsed state
     */
    function toggleCollapse() {
        isCollapsed = !isCollapsed;
        sidebar.classList.toggle('fp-category-sidebar--collapsed', isCollapsed);
        
        if (toggleBtn) {
            toggleBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
            toggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
        }
        
        // Save preference
        localStorage.setItem('fp-sidebar-collapsed', isCollapsed ? 'true' : 'false');
        
        // Dispatch event for layout adjustment
        window.dispatchEvent(new CustomEvent('fp-sidebar-toggle', { detail: { collapsed: isCollapsed } }));
    }

    /**
     * Load collapse preference
     */
    function loadCollapsePreference() {
        const saved = localStorage.getItem('fp-sidebar-collapsed');
        if (saved === 'true') {
            isCollapsed = true;
            sidebar.classList.add('fp-category-sidebar--collapsed');
            if (toggleBtn) {
                toggleBtn.title = 'Expand sidebar';
                toggleBtn.setAttribute('aria-label', 'Expand sidebar');
            }
        }
    }

    /**
     * Build the category list from sections
     */
    function buildCategoryList() {
        if (!sectionsContainer) return;

        const sections = sectionsContainer.querySelectorAll('.fp-section');
        allCategories = [];
        listEl.innerHTML = '';

        sections.forEach((section, index) => {
            // Skip hidden sections
            if (section.style.display === 'none') return;

            const categoryKey = section.dataset.category;
            if (!categoryKey) return;

            const config = getCategoryConfig(categoryKey);
            const countBadge = section.querySelector('.fp-section__count');
            const metricCount = countBadge ? countBadge.textContent : '';

            const categoryData = {
                key: categoryKey,
                label: config.label,
                icon: config.icon,
                iconType: config.iconType,
                color: config.color,
                element: section,
                metricCount
            };

            allCategories.push(categoryData);

            // Create list item
            const li = document.createElement('li');
            li.className = 'fp-category-sidebar__item';
            li.dataset.category = categoryKey;

            const button = document.createElement('button');
            button.className = 'fp-category-sidebar__link';
            button.setAttribute('role', 'link');
            button.setAttribute('aria-label', `Navigate to ${config.label}`);
            button.style.setProperty('--category-color', config.color);

            // Icon
            const iconHtml = config.iconType === 'svg'
                ? `<span class="fp-category-sidebar__icon fp-category-sidebar__icon--svg">${config.icon}</span>`
                : `<span class="fp-category-sidebar__icon">${config.icon}</span>`;

            button.innerHTML = `
                ${iconHtml}
                <span class="fp-category-sidebar__label">${escapeHtml(config.label)}</span>
                ${showMetricCounts && metricCount ? `<span class="fp-category-sidebar__badge">${metricCount}</span>` : ''}
            `;

            button.addEventListener('click', () => {
                navigateToCategory(categoryData);
            });

            li.appendChild(button);
            listEl.appendChild(li);
        });

        // Update footer count
        countEl.textContent = `${allCategories.length} categories`;
    }

    /**
     * Navigate to a category
     * @param {object} category - Category data
     */
    function navigateToCategory(category) {
        if (!category.element) return;

        // Smooth scroll to section
        const headerOffset = 80; // Account for fixed header if any
        const elementPosition = category.element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });

        // Expand the section if collapsed
        if (!category.element.classList.contains('fp-section--expanded')) {
            const header = category.element.querySelector('.fp-section__header');
            if (header) {
                setTimeout(() => header.click(), 300);
            }
        }

        // Update active state
        setActiveCategory(category.key);

        // Callback
        if (onCategoryClick) {
            onCategoryClick(category);
        }
    }

    /**
     * Set active category (highlighted in sidebar)
     * @param {string} categoryKey - The category key to activate
     */
    function setActiveCategory(categoryKey) {
        activeCategory = categoryKey;

        // Update UI
        const items = listEl.querySelectorAll('.fp-category-sidebar__item');
        items.forEach(item => {
            const isActive = item.dataset.category === categoryKey;
            item.classList.toggle('fp-category-sidebar__item--active', isActive);
        });
    }

    /**
     * Detect which category is currently in viewport
     */
    function detectActiveCategory() {
        if (!sectionsContainer) return;

        const sections = sectionsContainer.querySelectorAll('.fp-section');
        const viewportTop = window.scrollY + 120; // Offset for header
        const viewportMiddle = window.scrollY + (window.innerHeight / 3);

        let currentActive = null;

        sections.forEach(section => {
            if (section.style.display === 'none') return;

            const rect = section.getBoundingClientRect();
            const sectionTop = rect.top + window.scrollY;
            const sectionBottom = sectionTop + rect.height;

            // Check if section is in the upper third of viewport
            if (sectionTop <= viewportMiddle && sectionBottom > viewportTop) {
                currentActive = section.dataset.category;
            }
        });

        if (currentActive && currentActive !== activeCategory) {
            setActiveCategory(currentActive);
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
     * Calculate scroll progress
     */
    function calculateProgress() {
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
        // Debounce
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }

        scrollTimeout = setTimeout(() => {
            detectActiveCategory();
            updateProgress(calculateProgress());
        }, 50);
    }

    /**
     * Handle resize events
     */
    function handleResize() {
        // On mobile, auto-collapse
        if (window.innerWidth < 1024 && !isCollapsed) {
            toggleCollapse();
        }
    }

    /**
     * Refresh the sidebar (rebuild categories)
     */
    function refresh() {
        buildCategoryList();
        detectActiveCategory();
        updateProgress(calculateProgress());
    }

    /**
     * Initialize the sidebar
     */
    function init() {
        if (isInitialized) return;
        
        if (!sectionsContainer) {
            console.warn('CategorySidebar: No sections container provided');
            return;
        }

        // Load preferences
        loadCollapsePreference();

        // Build initial list
        buildCategoryList();

        // Add scroll listener
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleResize, { passive: true });

        // Initial state
        setTimeout(() => {
            detectActiveCategory();
            updateProgress(calculateProgress());
        }, 100);

        isInitialized = true;
    }

    /**
     * Mount sidebar to DOM
     * @param {HTMLElement} container - Where to mount (or document.body)
     */
    function mount(container = document.body) {
        if (!sidebar.parentNode) {
            container.insertBefore(sidebar, container.firstChild);
        }
    }

    /**
     * Unmount sidebar from DOM
     */
    function unmount() {
        if (sidebar.parentNode) {
            sidebar.parentNode.removeChild(sidebar);
        }
    }

    /**
     * Cleanup
     */
    function destroy() {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
        if (scrollTimeout) clearTimeout(scrollTimeout);
        unmount();
        isInitialized = false;
    }

    return {
        init,
        mount,
        unmount,
        destroy,
        refresh,
        setActiveCategory,
        toggleCollapse,
        element: sidebar,
        get isCollapsed() { return isCollapsed; },
        get activeCategory() { return activeCategory; }
    };
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default createCategorySidebar;
