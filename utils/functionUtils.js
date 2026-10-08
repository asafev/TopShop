/**
 * Function Utilities Module
 * Utility functions for analyzing and validating JavaScript functions
 */

/**
 * Check if a function string represents a native browser function
 * Accounts for cross-browser differences in native code formatting
 * 
 * @param {string} functionString - The function.toString() result
 * @param {string} functionName - Expected function name (optional, for validation)
 * @returns {boolean} True if the function appears to be native
 * 
 * @example
 * isNativeFunction(Date.now.toString(), 'now') // true for native implementations
 * isNativeFunction(Math.random.toString()) // true for native implementations
 */
export function isNativeFunction(functionString, functionName = null) {
    if (!functionString || typeof functionString !== 'string') {
        return false;
    }

    // Normalize whitespace and remove extra newlines for cross-browser compatibility
    const normalized = functionString.replace(/\s+/g, ' ').trim();

    // Check for various native code patterns across browsers:
    // Chrome: "function query() { [native code] }"
    // Firefox: "function query() {\n    [native code]\n}"
    // Safari: "function query() { [native code] }"
    const nativePatterns = [
        /function\s+\w*\(\)\s*\{\s*\[native code\]\s*\}/i,  // Standard pattern
        /\[native code\]/i,  // Fallback - just check for native code marker
        /\{\s*\[native code\]\s*\}/i  // Just the native code block
    ];

    // Additional validation: if function name provided, ensure it matches
    if (functionName) {
        const functionNamePattern = new RegExp(`function\\s+${functionName}\\s*\\(`, 'i');
        if (!functionNamePattern.test(normalized)) {
            // Function name doesn't match expected - likely overridden
            return false;
        }
    }

    // Check if any native pattern matches
    return nativePatterns.some(pattern => pattern.test(normalized));
}

/**
 * Check if multiple APIs have been overridden (not native)
 * 
 * @param {Array<{name: string, api: Function}>} apis - Array of API objects to check
 * @returns {Array<{name: string, isNative: boolean, signature: string}>} Results for each API
 * 
 * @example
 * checkAPIOverrides([
 *   { name: 'Date.now', api: Date.now },
 *   { name: 'Math.random', api: Math.random }
 * ]);
 */
export function checkAPIOverrides(apis) {
    return apis.map(({ name, api }) => {
        if (!api || typeof api !== 'function') {
            return {
                name,
                isNative: false,
                signature: 'Not available',
                error: 'API is not a function or not available'
            };
        }

        try {
            const signature = api.toString();
            const isNative = isNativeFunction(signature);
            
            return {
                name,
                isNative,
                signature: isNative ? '[Native Code]' : signature
            };
        } catch (error) {
            return {
                name,
                isNative: false,
                signature: 'Error',
                error: error.message
            };
        }
    });
}

/**
 * Get a safe string representation of a function
 * Truncates long function signatures to prevent memory issues
 * 
 * @param {Function} fn - The function to stringify
 * @param {number} maxLength - Maximum length of the returned string (default: 200)
 * @returns {string} Truncated function string
 */
export function getSafeFunctionString(fn, maxLength = 200) {
    if (!fn || typeof fn !== 'function') {
        return 'Not a function';
    }

    try {
        const fnString = fn.toString();
        if (fnString.length <= maxLength) {
            return fnString;
        }
        return fnString.substring(0, maxLength) + '...';
    } catch (error) {
        return `Error: ${error.message}`;
    }
}
