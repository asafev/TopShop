/**
 * Fingerprint UI - Components Index
 * Re-exports all UI components for easy importing
 */

export { createSection, createSectionManager } from './Section.js';
export { createMetricsTable, setRawResults } from './MetricsTable.js';
export { createSummaryCards, updateSummaryCards } from './SummaryCards.js';
export { 
    createSuspiciousIndicatorsSection, 
    createBehavioralIndicatorsSection,
    createFakeDevicesSection,
    createKnownAgentsSection,
    updateKnownAgentsSection
} from './AlertSection.js';
export { createLoadingState, createBehavioralLoadingState, updateLoadingProgress, updateBehavioralStats, updateLoadingContent, createErrorState } from './Loading.js';
export { createExportBar, exportFingerprintData } from './Export.js';
export { showDetailModal, hideDetailModal } from './DetailModal.js';
export { FingerprintConsole, createFingerprintConsole } from './Console.js';

// Diff View Components
export { 
    createDiffToggleBar, 
    createDiffMetricsTable, 
    createDiffSection, 
    createNoDifferencesState, 
    createDiffOverviewCard,
    updateDiffSummary,
    getDiffConfig
} from './DiffView.js';

// Search and Customization Components
export { createSearchBar, createSearchFilter } from './SearchBar.js';
export { createMetricsCustomizer } from './MetricsCustomizer.js';

// Agent Detection Overlay
export { AgentDetectionOverlay } from './AgentDetectionOverlay.js';

// Scroll Navigator - Floating category navigation hint (legacy)
export { createScrollNavigator } from './ScrollNavigator.js';

// Category Sidebar - Persistent left navigation panel
export { createCategorySidebar } from './CategorySidebar.js';

// Research Workspace - Focus-driven two-panel interface
export { createResearchWorkspace } from './ResearchWorkspace.js';

// Research Workspace v2.0 - Enterprise Analysis Interface
export { createResearchWorkspace as createResearchWorkspaceV2 } from './ResearchWorkspaceV2.js';

// Advanced Metrics Renderer - Organized grouped view for complex detectors
export { 
    hasAdvancedRenderer,
    createViewModeToggle,
    renderAdvancedMetrics,
    DETECTOR_CONFIGS,
    BATTERY_STORAGE_GROUPS,
    WEBGL_FINGERPRINT_GROUPS
} from './AdvancedMetricsRenderer.js';