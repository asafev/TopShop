/**
 * Fingerprint UI - Utilities Index
 * Re-exports all utility functions
 */

export * from './helpers.js';
export { BaselineComparator, createBaselineComparator, DiffType } from './BaselineComparator.js';

// Icon Systems
export { getCategoryIcon } from './icons.js';
export { 
    getIcon, 
    getCategoryIcon as getCategoryIconV2, 
    ICONS, 
    CATEGORY_ICONS 
} from './icons-v2.js';