/**
 * Agent-specific SVG icons for known AI agents
 * Premium, minimalistic icons matching 2026 design
 * Inspired by actual browser/app icons
 */

export const AGENT_ICONS = {
    'Manus': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
    </svg>`,
    
    'Comet': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Comet head (circle) -->
        <circle cx="8" cy="8" r="5" fill="currentColor" opacity="0.9"/>
        <!-- Comet tail (trailing path) -->
        <path d="M3 3 L8 8 L12 12 L16 16 L20 20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
        <path d="M5 5 L8 8 L11 11 L14 14 L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
        <!-- Sparkles -->
        <circle cx="14" cy="14" r="1.5" fill="currentColor" opacity="0.8"/>
        <circle cx="17" cy="17" r="1" fill="currentColor" opacity="0.6"/>
    </svg>`,
    
    'Genspark': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
        <polyline points="2 17 12 22 22 17"></polyline>
        <polyline points="2 12 12 17 22 12"></polyline>
    </svg>`,
    
    'Browser-Use': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Browser window -->
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
        <!-- Address bar -->
        <rect x="5" y="7" width="14" height="2" rx="1" fill="currentColor" opacity="0.3"/>
        <!-- Browser controls -->
        <circle cx="6" cy="8" r="0.8" fill="currentColor" opacity="0.6"/>
        <circle cx="8" cy="8" r="0.8" fill="currentColor" opacity="0.4"/>
        <circle cx="10" cy="8" r="0.8" fill="currentColor" opacity="0.4"/>
        <!-- Automation indicator (gear/automation symbol) -->
        <circle cx="12" cy="14" r="3" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.7"/>
        <path d="M12 11 L12 14 L14.5 15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
        <!-- Code brackets (automation) -->
        <path d="M7 13 L5 15 L7 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
        <path d="M17 13 L19 15 L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
    </svg>`,
    
    'Puppeteer': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Puppet/string icon -->
        <circle cx="12" cy="8" r="3" stroke="currentColor" stroke-width="2" fill="none"/>
        <path d="M12 11 L12 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <rect x="9" y="16" width="6" height="4" rx="1" stroke="currentColor" stroke-width="2" fill="none"/>
        <!-- Control strings -->
        <path d="M9 8 L7 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
        <path d="M15 8 L17 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
    </svg>`,
    
    'Playwright': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Play button triangle -->
        <path d="M8 6 L18 12 L8 18 Z" fill="currentColor" opacity="0.9"/>
        <!-- Stage/platform -->
        <rect x="4" y="18" width="16" height="2" rx="1" fill="currentColor" opacity="0.6"/>
        <!-- Curtains -->
        <path d="M4 4 L4 18" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
        <path d="M20 4 L20 18" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
    </svg>`,
    
    'Selenium': `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Selenium atom structure -->
        <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" fill="none" opacity="0.6"/>
        <circle cx="12" cy="12" r="2" fill="currentColor"/>
        <!-- Electron orbits -->
        <ellipse cx="12" cy="12" rx="8" ry="3" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.4" transform="rotate(45 12 12)"/>
        <ellipse cx="12" cy="12" rx="8" ry="3" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.4" transform="rotate(-45 12 12)"/>
        <!-- Electrons -->
        <circle cx="20" cy="12" r="1.5" fill="currentColor" opacity="0.8"/>
        <circle cx="4" cy="12" r="1.5" fill="currentColor" opacity="0.8"/>
        <circle cx="12" cy="20" r="1.5" fill="currentColor" opacity="0.8"/>
        <circle cx="12" cy="4" r="1.5" fill="currentColor" opacity="0.8"/>
    </svg>`,
    
    'default': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <circle cx="12" cy="5" r="2"></circle>
        <path d="M12 7v4"></path>
        <line x1="8" y1="16" x2="8" y2="16"></line>
        <line x1="16" y1="16" x2="16" y2="16"></line>
    </svg>`
};

/**
 * Agent image URLs (for using actual browser icons)
 * Fallback to SVG if images fail to load
 */
export const AGENT_IMAGE_URLS = {
    'Comet': 'https://static.vecteezy.com/system/resources/previews/073/108/103/non_2x/comet-browser-app-icon-on-a-transparent-background-free-png.png',
    'Browser-Use': 'https://cdn-1.webcatalog.io/catalog/browser-use/browser-use-icon-filled-256.png?v=1747122250563',
    'BrowserUse': 'https://cdn-1.webcatalog.io/catalog/browser-use/browser-use-icon-filled-256.png?v=1747122250563'
};

/**
 * Get icon for an agent by name
 * @param {string} agentName - Agent name
 * @param {boolean} useImage - Whether to use actual image URL instead of SVG
 * @returns {string} SVG markup or img tag
 */
export function getAgentIcon(agentName, useImage = false) {
    if (!agentName) return AGENT_ICONS.default;
    
    // Normalize agent name
    const normalizedName = agentName.trim();
    
    // If using images and URL exists, return img tag
    if (useImage && AGENT_IMAGE_URLS[normalizedName]) {
        return `<img src="${AGENT_IMAGE_URLS[normalizedName]}" alt="${normalizedName}" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
            <div style="display: none;">${AGENT_ICONS[normalizedName] || AGENT_ICONS.default}</div>`;
    }
    
    // Try exact match first
    if (AGENT_ICONS[normalizedName]) {
        return AGENT_ICONS[normalizedName];
    }
    
    // Try case-insensitive match
    const lowerName = normalizedName.toLowerCase();
    for (const [key, icon] of Object.entries(AGENT_ICONS)) {
        if (key.toLowerCase() === lowerName) {
            return icon;
        }
    }
    
    // Try partial match
    for (const [key, icon] of Object.entries(AGENT_ICONS)) {
        if (lowerName.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerName)) {
            return icon;
        }
    }
    
    return AGENT_ICONS.default;
}

/**
 * Get agent icon as image element (for Comet and Browser-Use)
 * @param {string} agentName - Agent name
 * @returns {string} img tag with fallback SVG
 */
export function getAgentIconAsImage(agentName) {
    const normalizedName = agentName.trim();
    
    // Only use images for Comet and Browser-Use
    if (AGENT_IMAGE_URLS[normalizedName]) {
        return `<img 
            src="${AGENT_IMAGE_URLS[normalizedName]}" 
            alt="${normalizedName}" 
            style="width: 100%; height: 100%; object-fit: contain;"
            onerror="this.outerHTML = '${AGENT_ICONS[normalizedName] || AGENT_ICONS.default}'"
        />`;
    }
    
    // Fallback to SVG for other agents
    return getAgentIcon(agentName, false);
}

