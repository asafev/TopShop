/**
 * AI Agent Detection Plugin
 * Advanced fingerprinting for AI agents, automation tools, and sandboxes
 * Focuses on monkey patches, proxy wrappers, and cross-realm inconsistencies
 */

import { ContextAnalyzer } from './contextAnalyzer.js';

export class AIAgentDetector {
    constructor() {
        this.results = {};
        this.suspiciousIndicators = [];
        this.contextAnalyzer = new ContextAnalyzer();
    }

    /**
     * Main detection method - performs all AI agent detection checks
     */
    async detectAIAgent() {
        try {
            // Core API override detection
            const apiOverrides = await this.detectApiOverrides();
            this.results.apiOverrides = apiOverrides;

            // Analyze results for suspicious patterns
            this.analyzeForSuspiciousPatterns(apiOverrides);

            return {
                success: true,
                results: this.results,
                suspiciousIndicators: this.suspiciousIndicators
            };
        } catch (error) {
            console.error('AI Agent detection failed:', error);
            return {
                success: false,
                error: error.message,
                results: this.results,
                suspiciousIndicators: this.suspiciousIndicators
            };
        }
    }

    /**
     * Enhanced API override detection with cross-realm checks
     */
    async detectApiOverrides() {
        const out = {};
        const T = (k, v) => (out[k] = v);

        // --- 1) Get "pristine" references from an inert iframe
        const iframe = document.createElement('iframe');
        iframe.setAttribute('style', 'display:none !important');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        document.documentElement.appendChild(iframe);
        
        let P;
        try {
            P = iframe.contentWindow; // pristine-ish world
            if (!P) throw new Error('Cannot access iframe contentWindow');
        } catch (e) {
            iframe.remove();
            throw new Error('Failed to create pristine iframe context');
        }

        // Helper: robust toString that bypasses patched fn.toString
        const pToString = P.Function.prototype.toString;
        const safeToString = (fn) => {
            try { 
                return P.Function.prototype.toString.call(fn); 
            } catch { 
                try { 
                    return Function.prototype.toString.call(fn); 
                } catch { 
                    return String(fn); 
                } 
            }
        };

        const isNativeLike = (fn) => /\{\s*\[native code\]\s*\}/.test(safeToString(fn));

        // Helper: compare property descriptors
        const sameDescriptor = (obj, key, pobj) => {
            try {
                const d1 = Object.getOwnPropertyDescriptor(obj, key);
                const d2 = Object.getOwnPropertyDescriptor(pobj, key);
                return JSON.stringify(d1) === JSON.stringify(d2);
            } catch {
                return false;
            }
        };

        // Helper: detect Proxy wrappers (improved, less false positives)
        const looksProxied = (fnOrObj) => {
            if (!fnOrObj || typeof fnOrObj !== 'function') return false;
            
            try {
                const s1 = safeToString(fnOrObj);
                
                // Check for obvious proxy indicators
                if (/Proxy\b/.test(s1)) return true;
                
                // Check for suspiciously empty or malformed toString
                if (!s1 || s1.length < 20) return true;
                
                // For non-native functions, don't assume they're proxies
                // Many legitimate polyfills exist
                if (!/\[native code\]/.test(s1)) {
                    return false;
                }
                
                // For native functions, do more conservative checks
                try {
                    const name = fnOrObj.name;
                    const length = fnOrObj.length;
                    
                    // Basic sanity checks for native functions
                    if (typeof length !== 'number' || length < 0 || !Number.isInteger(length)) {
                        return true;
                    }
                    
                    // Test function behavior - native functions should handle errors predictably
                    try {
                        // Try to access prototype property (most natives have one)
                        if (fnOrObj.prototype !== undefined) {
                            // Check if we can enumerate prototype properties
                            Object.getOwnPropertyNames(fnOrObj.prototype);
                        }
                    } catch (e) {
                        // Unusual error accessing prototype may indicate proxy
                        if (!(e instanceof TypeError)) {
                            return true;
                        }
                    }
                    
                    // Check for unusual property descriptors (more conservative)
                    const nameDesc = Object.getOwnPropertyDescriptor(fnOrObj, 'name');
                    const lengthDesc = Object.getOwnPropertyDescriptor(fnOrObj, 'length');
                    
                    // Only flag if descriptors have unusual getters/setters
                    if (nameDesc && (nameDesc.get || nameDesc.set)) return true;
                    if (lengthDesc && (lengthDesc.get || lengthDesc.set)) return true;
                    
                } catch (e) {
                    // If we can't access basic properties, might be a proxy
                    return true;
                }
                
            } catch (e) { 
                // Accessing the function caused an error - suspicious
                return true; 
            }
            
            return false;
        };

        // --- 2) Core function signature checks (extended)
        const apiChecks = {
            // Existing checks
            permissionsQuery: () => safeToString(navigator.permissions?.query),
            dateNow: () => safeToString(Date.now),
            mathRandom: () => safeToString(Math.random),
            performanceNow: () => safeToString(performance.now),
            jsonStringify: () => safeToString(JSON.stringify),
            objectDefineProperty: () => safeToString(Object.defineProperty),
            setTimeoutOverride: () => safeToString(setTimeout),
            setIntervalOverride: () => safeToString(setInterval),

            // NEW: High-leverage targets for AI agents
            funcToString: () => safeToString(Function.prototype.toString),
            errorToString: () => safeToString(Error.prototype.toString),
            addEventListener: () => safeToString(EventTarget.prototype.addEventListener),
            dispatchEvent: () => safeToString(EventTarget.prototype.dispatchEvent),
            querySelector: () => safeToString(Document.prototype.querySelector),
            querySelectorAll: () => safeToString(Document.prototype.querySelectorAll),
            getComputedStyle: () => safeToString(getComputedStyle),
            createElement: () => safeToString(Document.prototype.createElement),
            appendChild: () => safeToString(Node.prototype.appendChild),
            removeChild: () => safeToString(Node.prototype.removeChild),
            
            // Canvas and WebGL (often spoofed)
            canvasToDataURL: () => safeToString(HTMLCanvasElement.prototype.toDataURL),
            canvasGetContext: () => safeToString(HTMLCanvasElement.prototype.getContext),
            webglGetParameter: () => {
                try {
                    const c = document.createElement('canvas');
                    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
                    return gl ? safeToString(gl.getParameter) : 'no-webgl';
                } catch {
                    return 'webgl-error';
                }
            },
            
            // Network APIs
            fetchSig: () => safeToString(fetch),
            xmlHttpRequest: () => safeToString(XMLHttpRequest),
            websocketSig: () => safeToString(WebSocket),
            
            // Animation and timing
            requestAnimationFrame: () => safeToString(requestAnimationFrame),
            cancelAnimationFrame: () => safeToString(cancelAnimationFrame),
            
            // Navigator property getters (commonly spoofed)
            navigatorUAGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent')?.get),
            navigatorLangGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'languages')?.get),
            navigatorPlatformGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform')?.get),
            navigatorVendorGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'vendor')?.get),
            navigatorWebdriverGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver')?.get),
            
            // Geolocation (often mocked)
            geolocationGetCurrentPosition: () => navigator.geolocation?.getCurrentPosition ? safeToString(navigator.geolocation.getCurrentPosition) : 'not-supported',
            geolocationWatchPosition: () => navigator.geolocation?.watchPosition ? safeToString(navigator.geolocation.watchPosition) : 'not-supported',
            
            // Clipboard (automation target)
            clipboardRead: () => navigator.clipboard?.read ? safeToString(navigator.clipboard.read) : 'not-supported',
            clipboardWrite: () => navigator.clipboard?.write ? safeToString(navigator.clipboard.write) : 'not-supported',
            
            // Storage APIs
            localStorageSetItem: () => safeToString(Storage.prototype.setItem),
            localStorageGetItem: () => safeToString(Storage.prototype.getItem),
            
            // Media APIs
            getUserMedia: () => navigator.mediaDevices?.getUserMedia ? safeToString(navigator.mediaDevices.getUserMedia) : 'not-supported',
            
            // Crypto APIs (sometimes patched for deterministic behavior)
            cryptoGetRandomValues: () => crypto?.getRandomValues ? safeToString(crypto.getRandomValues) : 'not-supported',
            cryptoRandomUUID: () => crypto?.randomUUID ? safeToString(crypto.randomUUID) : 'not-supported',
            
            // Proxy and Reflection APIs (critical for detecting advanced monkey patches)
            proxyConstructor: () => safeToString(Proxy),
            reflectGet: () => safeToString(Reflect.get),
            reflectSet: () => safeToString(Reflect.set),
            objectGetOwnPropertyDescriptor: () => safeToString(Object.getOwnPropertyDescriptor),
            
            // Promise and Async APIs (commonly patched for control flow manipulation)
            promiseConstructor: () => safeToString(Promise),
            promiseThen: () => safeToString(Promise.prototype.then),
            promiseCatch: () => safeToString(Promise.prototype.catch),
            asyncFunctionConstructor: () => safeToString((async function(){}).constructor),
            
            // Evaluation and Function Construction APIs (high-risk for code injection detection)
            evalFunc: () => safeToString(eval),
            functionConstructor: () => safeToString(Function),
            asyncFunctionStringTag: () => safeToString((async function(){}).constructor.toString),
            
            // Event Constructor APIs (commonly spoofed in automation)
            mouseEventConstructor: () => safeToString(MouseEvent),
            keyboardEventConstructor: () => safeToString(KeyboardEvent),
            touchEventConstructor: () => safeToString(TouchEvent),
            pointerEventConstructor: () => safeToString(PointerEvent),
            inputEventConstructor: () => safeToString(InputEvent),
            
            // Observer APIs (critical for DOM manipulation detection)
            mutationObserver: () => safeToString(MutationObserver),
            intersectionObserver: () => safeToString(IntersectionObserver),
            resizeObserver: () => safeToString(ResizeObserver),
            
            // Notification APIs (extended detection)
            notificationConstructor: () => safeToString(Notification),
            permissionStatusOnchange: () => {
                try {
                    // Use descriptor inspection to avoid "Illegal invocation" error
                    // PermissionStatus.prototype.onchange is an accessor that requires a real instance
                    const descriptor = Object.getOwnPropertyDescriptor(PermissionStatus.prototype, 'onchange');
                    if (!descriptor) return 'not-found';
                    
                    // Inspect the getter/setter functions themselves (if they exist)
                    const parts = [];
                    if (descriptor.get) parts.push(`get:${safeToString(descriptor.get)}`);
                    if (descriptor.set) parts.push(`set:${safeToString(descriptor.set)}`);
                    if (parts.length === 0 && descriptor.value !== undefined) {
                        return safeToString(descriptor.value);
                    }
                    return parts.join('|') || 'no-accessor';
                } catch (e) {
                    return `error:${e.message}`;
                }
            },
            
            // Critical Navigator Property Getters (commonly spoofed for fingerprinting evasion)
            navigatorPluginsGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'plugins')?.get),
            navigatorMimeTypesGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'mimeTypes')?.get),
            navigatorDeviceMemoryGetter: () => {
                const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'deviceMemory');
                return descriptor?.get ? safeToString(descriptor.get) : 'not-supported';
            },
            navigatorHardwareConcurrencyGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency')?.get),
            navigatorMaxTouchPointsGetter: () => {
                const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'maxTouchPoints');
                return descriptor?.get ? safeToString(descriptor.get) : 'not-supported';
            },
            
            // Screen Property Getters (critical for display fingerprinting detection)
            screenWidthGetter: () => safeToString(Object.getOwnPropertyDescriptor(Screen.prototype, 'width')?.get),
            screenHeightGetter: () => safeToString(Object.getOwnPropertyDescriptor(Screen.prototype, 'height')?.get),
            screenColorDepthGetter: () => safeToString(Object.getOwnPropertyDescriptor(Screen.prototype, 'colorDepth')?.get),
            
            // Battery API (commonly spoofed for fingerprinting)
            batteryManager: () => navigator.getBattery ? safeToString(navigator.getBattery) : 'not-supported',
            
            // Message and Communication APIs (critical for cross-context manipulation)
            messageChannel: () => safeToString(MessageChannel),
            postMessage: () => {
                try {
                    // Try multiple approaches to get postMessage reliably
                    if (window.postMessage) {
                        return safeToString(window.postMessage);
                    } else if (Window.prototype.postMessage) {
                        return safeToString(Window.prototype.postMessage);
                    } else {
                        return 'not-available';
                    }
                } catch (e) {
                    return `error:${e.message}`;
                }
            },
            
            // Worker APIs (commonly patched for isolation bypass)
            workerConstructor: () => safeToString(Worker),
            sharedWorkerConstructor: () => typeof SharedWorker !== 'undefined' ? safeToString(SharedWorker) : 'not-supported',
            serviceWorkerRegister: () => navigator.serviceWorker?.register ? safeToString(navigator.serviceWorker.register) : 'not-supported',
            
            // CRITICAL: Function.prototype.toString integrity check (must be first line of defense)
            toStringIntegrity: () => {
                const original = Function.prototype.toString;
                const check = original.toString();
                return check.includes('[native code]') ? 'likely-native' : 'PATCHED';
            },
        };

        for (const [k, fn] of Object.entries(apiChecks)) {
            try {
                const val = fn();
                T(k, val);
                // Native-ness bit for quick scoring
                T(`${k}_native`, /\[native code\]/.test(String(val)));
            } catch (e) {
                T(k, `error:${e?.message || e}`);
                T(`${k}_native`, false);
            }
        }

        // --- 3) Cross-realm integrity checks
        const crossRealm = {};
        try {
            crossRealm.funcToString_diff = safeToString(Function.prototype.toString) !== pToString.call(P.Function.prototype.toString);
            crossRealm.JSON_stringify_diff = safeToString(JSON.stringify) !== pToString.call(P.JSON.stringify);
            crossRealm.Object_defineProperty_diff = safeToString(Object.defineProperty) !== pToString.call(P.Object.defineProperty);
            crossRealm.setTimeout_diff = safeToString(setTimeout) !== pToString.call(P.setTimeout);
            crossRealm.setInterval_diff = safeToString(setInterval) !== pToString.call(P.setInterval);
            crossRealm.navigator_userAgent_getter_diff = 
                safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent')?.get) !==
                pToString.call(P.Object.getOwnPropertyDescriptor(P.Navigator.prototype, 'userAgent')?.get);
            crossRealm.Date_now_diff = safeToString(Date.now) !== pToString.call(P.Date.now);
            crossRealm.Math_random_diff = safeToString(Math.random) !== pToString.call(P.Math.random);
            crossRealm.Proxy_constructor_diff = safeToString(Proxy) !== pToString.call(P.Proxy);
            crossRealm.Reflect_get_diff = safeToString(Reflect.get) !== pToString.call(P.Reflect.get);
            crossRealm.Reflect_set_diff = safeToString(Reflect.set) !== pToString.call(P.Reflect.set);
            crossRealm.Object_getOwnPropertyDescriptor_diff = safeToString(Object.getOwnPropertyDescriptor) !== pToString.call(P.Object.getOwnPropertyDescriptor);
            crossRealm.Promise_constructor_diff = safeToString(Promise) !== pToString.call(P.Promise);
            crossRealm.Promise_then_diff = safeToString(Promise.prototype.then) !== pToString.call(P.Promise.prototype.then);
            crossRealm.Promise_catch_diff = safeToString(Promise.prototype.catch) !== pToString.call(P.Promise.prototype.catch);
            crossRealm.AsyncFunction_constructor_diff = safeToString((async function(){}).constructor) !== pToString.call((P.eval('(async function(){})').constructor));
            crossRealm.eval_diff = safeToString(eval) !== pToString.call(P.eval);
            crossRealm.Function_constructor_diff = safeToString(Function) !== pToString.call(P.Function);
            crossRealm.navigator_plugins_getter_diff = 
                safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'plugins')?.get) !==
                pToString.call(P.Object.getOwnPropertyDescriptor(P.Navigator.prototype, 'plugins')?.get);
            crossRealm.navigator_mimeTypes_getter_diff = 
                safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'mimeTypes')?.get) !==
                pToString.call(P.Object.getOwnPropertyDescriptor(P.Navigator.prototype, 'mimeTypes')?.get);
            crossRealm.screen_width_getter_diff = 
                safeToString(Object.getOwnPropertyDescriptor(Screen.prototype, 'width')?.get) !==
                pToString.call(P.Object.getOwnPropertyDescriptor(P.Screen.prototype, 'width')?.get);
            crossRealm.screen_height_getter_diff = 
                safeToString(Object.getOwnPropertyDescriptor(Screen.prototype, 'height')?.get) !==
                pToString.call(P.Object.getOwnPropertyDescriptor(P.Screen.prototype, 'height')?.get);
            crossRealm.postMessage_diff = (() => {
                try {
                    const mainPostMessage = window.postMessage || Window.prototype.postMessage;
                    const iframePostMessage = P.window?.postMessage || P.Window?.prototype?.postMessage;
                    if (!mainPostMessage || !iframePostMessage) return false; // Skip if not available
                    return safeToString(mainPostMessage) !== pToString.call(iframePostMessage);
                } catch (e) {
                    return false; // Skip on error
                }
            })();
            crossRealm.Worker_constructor_diff = safeToString(Worker) !== pToString.call(P.Worker);
            crossRealm.MessageChannel_diff = safeToString(MessageChannel) !== pToString.call(P.MessageChannel);
            // CRITICAL: Check if Function.prototype.toString itself has been compromised
            crossRealm.toString_integrity_diff = 
                Function.prototype.toString.toString().includes('[native code]') !== 
                P.Function.prototype.toString.toString().includes('[native code]');
        } catch (e) {
            crossRealm.error = e.message;
        }
        T('crossRealm', crossRealm);

        // --- 4) Descriptor sanity checks
        const descChecks = {};
        try {
            descChecks.Navigator_userAgent_desc_unchanged = sameDescriptor(Navigator.prototype, 'userAgent', P.Navigator.prototype);
            descChecks.Navigator_languages_desc_unchanged = sameDescriptor(Navigator.prototype, 'languages', P.Navigator.prototype);
            descChecks.Navigator_platform_desc_unchanged = sameDescriptor(Navigator.prototype, 'platform', P.Navigator.prototype);
            descChecks.Function_toString_desc_unchanged = sameDescriptor(Function.prototype, 'toString', P.Function.prototype);
            descChecks.JSON_stringify_desc_unchanged = sameDescriptor(JSON, 'stringify', P.JSON);
            descChecks.Object_defineProperty_desc_unchanged = sameDescriptor(Object, 'defineProperty', P.Object);
            descChecks.Date_now_desc_unchanged = sameDescriptor(Date, 'now', P.Date);
            descChecks.Math_random_desc_unchanged = sameDescriptor(Math, 'random', P.Math);
            descChecks.Object_getOwnPropertyDescriptor_desc_unchanged = sameDescriptor(Object, 'getOwnPropertyDescriptor', P.Object);
            descChecks.Reflect_get_desc_unchanged = sameDescriptor(Reflect, 'get', P.Reflect);
            descChecks.Reflect_set_desc_unchanged = sameDescriptor(Reflect, 'set', P.Reflect);
            descChecks.Promise_then_desc_unchanged = sameDescriptor(Promise.prototype, 'then', P.Promise.prototype);
            descChecks.Promise_catch_desc_unchanged = sameDescriptor(Promise.prototype, 'catch', P.Promise.prototype);
            descChecks.eval_desc_unchanged = sameDescriptor(window, 'eval', P);
            descChecks.Function_desc_unchanged = sameDescriptor(window, 'Function', P);
            descChecks.Navigator_plugins_desc_unchanged = sameDescriptor(Navigator.prototype, 'plugins', P.Navigator.prototype);
            descChecks.Navigator_mimeTypes_desc_unchanged = sameDescriptor(Navigator.prototype, 'mimeTypes', P.Navigator.prototype);
            descChecks.Navigator_deviceMemory_desc_unchanged = sameDescriptor(Navigator.prototype, 'deviceMemory', P.Navigator.prototype);
            descChecks.Navigator_hardwareConcurrency_desc_unchanged = sameDescriptor(Navigator.prototype, 'hardwareConcurrency', P.Navigator.prototype);
            descChecks.Screen_width_desc_unchanged = sameDescriptor(Screen.prototype, 'width', P.Screen.prototype);
            descChecks.Screen_height_desc_unchanged = sameDescriptor(Screen.prototype, 'height', P.Screen.prototype);
        } catch (e) {
            descChecks.error = e.message;
        }
        T('descriptors', descChecks);

        // --- 5) Proxy suspicion checks (focused on high-value targets)
        const proxySuspicions = {};
        try {
            // Only check functions that are commonly proxied by automation tools
            const criticalFunctions = {
                'permissionsQuery_proxied': navigator.permissions?.query,
                'setTimeout_proxied': setTimeout,
                'funcToString_proxied': Function.prototype.toString,
                'fetch_proxied': fetch,
                'JSON_stringify_proxied': JSON.stringify,
                'addEventListener_proxied': EventTarget.prototype.addEventListener
            };
            
            Object.entries(criticalFunctions).forEach(([key, func]) => {
                if (func) {
                    proxySuspicions[key] = looksProxied(func);
                } else {
                    proxySuspicions[key] = false;
                }
            });
        } catch (e) {
            proxySuspicions.error = e.message;
        }
        T('proxySuspicions', proxySuspicions);

        // --- 6) Execution context consistency (Worker + iframe)
        const workerProbe = () =>
            new Promise((resolve) => {
                try {
                    const blob = new Blob([`
                        self.onmessage = () => {
                            try {
                                const data = {
                                    ua: navigator.userAgent,
                                    plat: navigator.platform,
                                    lang: navigator.languages ? Array.from(navigator.languages) : [],
                                    hw: navigator.hardwareConcurrency,
                                    cookieEnabled: navigator.cookieEnabled,
                                    onLine: navigator.onLine,
                                    funcToString: Function.prototype.toString.toString(),
                                    JSONStringify: JSON.stringify.toString(),
                                    mathRandom: Math.random.toString(),
                                    dateNow: Date.now.toString(),
                                    timezoneOffset: new Date().getTimezoneOffset(),
                                };
                                self.postMessage({ success: true, data });
                            } catch (e) {
                                self.postMessage({ success: false, error: e.message });
                            }
                        };
                    `], { type: 'application/javascript' });
                    
                    const url = URL.createObjectURL(blob);
                    const w = new Worker(url);
                    
                    w.onmessage = (e) => {
                        w.terminate();
                        URL.revokeObjectURL(url);
                        resolve({ ok: true, worker: e.data });
                    };
                    
                    w.onerror = (e) => {
                        w.terminate();
                        URL.revokeObjectURL(url);
                        resolve({ ok: false, reason: `worker-error: ${e.message}` });
                    };
                    
                    w.postMessage(0);
                    setTimeout(() => {
                        w.terminate();
                        URL.revokeObjectURL(url);
                        resolve({ ok: false, reason: 'timeout' });
                    }, 1000);
                } catch (e) { 
                    resolve({ ok: false, reason: String(e) }); 
                }
            });

        const iframeProbe = () => {
            try {
                return {
                    ua: P.navigator.userAgent,
                    plat: P.navigator.platform,
                    lang: P.navigator.languages ? Array.from(P.navigator.languages) : [],
                    hw: P.navigator.hardwareConcurrency,
                    cookieEnabled: P.navigator.cookieEnabled,
                    onLine: P.navigator.onLine,
                    funcToString: pToString.call(P.Function.prototype.toString),
                    JSONStringify: pToString.call(P.JSON.stringify),
                    mathRandom: pToString.call(P.Math.random),
                    dateNow: pToString.call(P.Date.now),
                    timezoneOffset: new P.Date().getTimezoneOffset(),
                };
            } catch (e) {
                return { error: e.message };
            }
        };

        const mainContext = {
            ua: navigator.userAgent,
            plat: navigator.platform,
            lang: navigator.languages ? Array.from(navigator.languages) : [],
            hw: navigator.hardwareConcurrency,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            funcToString: Function.prototype.toString.toString(),
            JSONStringify: JSON.stringify.toString(),
            mathRandom: Math.random.toString(),
            dateNow: Date.now.toString(),
            timezoneOffset: new Date().getTimezoneOffset(),
        };

        const [wres, ifr] = await Promise.all([
            workerProbe(), 
            Promise.resolve(iframeProbe())
        ]);
        
        T('contexts', { 
            main: mainContext, 
            iframe: ifr, 
            worker: wres 
        });

        // --- 7) Permissions API quirks
        try {
            const permissionTests = await Promise.allSettled([
                navigator.permissions?.query?.({ name: 'notifications' }),
                navigator.permissions?.query?.({ name: 'geolocation' }),
                navigator.permissions?.query?.({ name: 'camera' }),
                navigator.permissions?.query?.({ name: 'microphone' })
            ]);
            
            T('permissions_tests', {
                notifications: permissionTests[0].status === 'fulfilled' ? permissionTests[0].value?.state : 'error',
                geolocation: permissionTests[1].status === 'fulfilled' ? permissionTests[1].value?.state : 'error',
                camera: permissionTests[2].status === 'fulfilled' ? permissionTests[2].value?.state : 'error',
                microphone: permissionTests[3].status === 'fulfilled' ? permissionTests[3].value?.state : 'error'
            });
        } catch (e) { 
            T('permissions_tests', { error: e.message }); 
        }

        // Cleanup
        iframe.remove();
        return out;
    }

    /**
     * Analyze results for suspicious patterns and generate indicators
     */
    analyzeForSuspiciousPatterns(results) {
        const indicators = [];

        // CRITICAL: Check toString integrity first - if compromised, all other checks are suspect
        if (results.toStringIntegrity === 'PATCHED') {
            indicators.push({
                name: 'Function.prototype.toString COMPROMISED',
                description: 'The core Function.prototype.toString has been patched, compromising all signature detection',
                category: 'Critical Infrastructure',
                riskLevel: 'HIGH',
                confidence: 0.95,
                importance: 'CRITICAL',
                value: 'PATCHED',
                details: 'Function.prototype.toString does not appear native - ALL OTHER CHECKS ARE SUSPECT'
            });
        }

        // Check for non-native function signatures (with context-aware analysis)
        Object.keys(results).forEach(key => {
            if (key.endsWith('_native') && results[key] === false && !key.includes('error')) {
                const funcName = key.replace('_native', '');
                const funcValue = results[funcName];
                
                // Skip if the function errored out or is unavailable
                if (!funcValue || 
                    funcValue === 'undefined' || 
                    funcValue.startsWith('error:') || 
                    funcValue === 'no-webgl' || 
                    funcValue === 'webgl-error' || 
                    funcValue === 'not-available' || 
                    funcValue === 'not-supported') {
                    return;
                }
                
                // Special handling for toString integrity - only flag if explicitly PATCHED
                if (funcName === 'toStringIntegrity') {
                    if (funcValue === 'PATCHED') {
                        indicators.push({
                            name: 'Function.prototype.toString INTEGRITY FAILURE',
                            description: 'The core toString function has been compromised, invalidating signature-based detection',
                            category: 'Critical Infrastructure',
                            riskLevel: 'HIGH',
                            confidence: 0.95,
                            importance: 'CRITICAL',
                            value: funcValue,
                            details: 'Function.prototype.toString integrity check failed - all signature checks are now unreliable'
                        });
                    }
                    return; // Skip normal processing for toString integrity
                }
                
                // Only flag as suspicious if it's claiming to be native but isn't
                // Some APIs are legitimately polyfilled and that's not suspicious
                const criticalApis = [
                    'permissionsQuery', 'dateNow', 'mathRandom', 'performanceNow', 
                    'jsonStringify', 'objectDefineProperty', 'setTimeoutOverride', 
                    'setIntervalOverride', 'funcToString', 'evalFunc', 'functionConstructor',
                    'navigatorUAGetter', 'navigatorPluginsGetter', 'navigatorMimeTypesGetter',
                    'postMessage', 'workerConstructor'
                ];
                
                if (criticalApis.includes(funcName)) {
                    indicators.push({
                        name: `Modified core API: ${funcName}`,
                        description: `The ${funcName} function signature suggests modification of a core browser API`,
                        category: 'API Override',
                        riskLevel: 'MEDIUM',
                        confidence: 0.7,
                        importance: 'STRONG',
                        value: funcValue.substring(0, 100) + (funcValue.length > 100 ? '...' : ''),
                        details: 'Core API function does not contain expected [native code] pattern'
                    });
                } else {
                    // Less critical APIs get lower severity
                    indicators.push({
                        name: `Non-native API: ${funcName}`,
                        description: `The ${funcName} function appears to be polyfilled or modified`,
                        category: 'API Override',
                        riskLevel: 'LOW',
                        confidence: 0.5,
                        importance: 'WEAK',
                        value: funcValue.substring(0, 100) + (funcValue.length > 100 ? '...' : ''),
                        details: 'Function signature indicates polyfill or modification (may be normal)'
                    });
                }
            }
        });

        // Check cross-realm inconsistencies
        if (results.crossRealm) {
            Object.entries(results.crossRealm).forEach(([key, value]) => {
                if (value === true && key.endsWith('_diff')) {
                    const funcName = key.replace('_diff', '').replace('_', '.');
                    indicators.push({
                        name: `Cross-realm inconsistency: ${funcName}`,
                        description: `Function differs between main context and iframe, indicating potential modification`,
                        category: 'Cross-realm',
                        riskLevel: 'HIGH',
                        confidence: 0.9,
                        importance: 'CRITICAL',
                        value: 'inconsistent',
                        details: 'Function signature differs between execution contexts'
                    });
                }
            });
        }

        // Check descriptor modifications
        if (results.descriptors) {
            Object.entries(results.descriptors).forEach(([key, value]) => {
                if (value === false && key.endsWith('_unchanged')) {
                    const propName = key.replace('_desc_unchanged', '').replace('_', '.');
                    indicators.push({
                        name: `Modified descriptor: ${propName}`,
                        description: `Property descriptor has been modified, suggesting potential monkey patching`,
                        category: 'Descriptor Modification',
                        riskLevel: 'HIGH',
                        confidence: 0.8,
                        importance: 'STRONG',
                        value: 'modified',
                        details: 'Property descriptor differs from pristine iframe context'
                    });
                }
            });
        }

        // Check proxy suspicions (with higher confidence threshold)
        if (results.proxySuspicions) {
            Object.entries(results.proxySuspicions).forEach(([key, value]) => {
                if (value === true && key.endsWith('_proxied')) {
                    const funcName = key.replace('_proxied', '');
                    
                    // Only report proxy suspicions for high-value targets and with lower confidence
                    // since proxy detection can have false positives
                    indicators.push({
                        name: `Potential proxy wrapper: ${funcName}`,
                        description: `Function may be wrapped by a Proxy, sometimes used in stealth automation`,
                        category: 'Proxy Detection',
                        riskLevel: 'MEDIUM',  // Reduced from HIGH
                        confidence: 0.6,     // Reduced from 0.75
                        importance: 'WEAK',  // Reduced from STRONG
                        value: 'possibly-proxied',
                        details: 'Function exhibits some characteristics that may indicate Proxy wrapping (false positives possible)'
                    });
                }
            });
        }

        // Check context inconsistencies using the advanced context analyzer
        if (results.contexts) {
            const contextAnalysis = this.contextAnalyzer.analyzeContexts(results.contexts);
            
            // Add context analysis indicators to our suspicious indicators
            if (contextAnalysis.indicators && contextAnalysis.indicators.length > 0) {
                indicators.push(...contextAnalysis.indicators);
            }
        }

        // Check permissions anomalies
        if (results.permissions_tests) {
            const permStates = Object.values(results.permissions_tests);
            if (permStates.every(state => state === 'denied')) {
                indicators.push({
                    name: 'All permissions denied',
                    description: 'All permission queries return denied, typical of headless environments',
                    category: 'Permissions',
                    riskLevel: 'MEDIUM',
                    confidence: 0.6,
                    importance: 'WEAK',
                    value: 'all-denied',
                    details: 'Permissions API returns denied for all tested permissions'
                });
            }
        }

        this.suspiciousIndicators = indicators;
    }

    /**
     * Get formatted results for display
     */
    getFormattedResults() {
        const metrics = {};
        
        if (this.results.apiOverrides) {
            // Organize results by category
            metrics.aiAgentDetection = {};

            // API Signatures
            Object.keys(this.results.apiOverrides).forEach(key => {
                if (!key.endsWith('_native') && !['crossRealm', 'descriptors', 'proxySuspicions', 'contexts', 'permissions_tests'].includes(key)) {
                    metrics.aiAgentDetection[key] = {
                        value: this.results.apiOverrides[key],
                        description: this.getMetricDescription(key),
                        risk: this.calculateRiskLevel(key, this.results.apiOverrides[key])
                    };
                }
            });

            // Cross-realm checks
            if (this.results.apiOverrides.crossRealm) {
                Object.entries(this.results.apiOverrides.crossRealm).forEach(([key, value]) => {
                    metrics.aiAgentDetection[`crossRealm_${key}`] = {
                        value: value,
                        description: `Cross-realm check: ${key}`,
                        risk: value === true ? 'high' : 'low'
                    };
                });
            }

            // Proxy suspicions
            if (this.results.apiOverrides.proxySuspicions) {
                Object.entries(this.results.apiOverrides.proxySuspicions).forEach(([key, value]) => {
                    metrics.aiAgentDetection[`proxy_${key}`] = {
                        value: value,
                        description: `Proxy detection: ${key}`,
                        risk: value === true ? 'high' : 'low'
                    };
                });
            }

            // Context consistency
            if (this.results.apiOverrides.contexts) {
                const contextAnalysis = this.contextAnalyzer.analyzeContexts(this.results.apiOverrides.contexts);
                metrics.aiAgentDetection.contextConsistency = {
                    value: contextAnalysis.summary,
                    description: 'Advanced cross-context execution consistency analysis',
                    risk: contextAnalysis.risk
                };
            }

            // Permissions
            if (this.results.apiOverrides.permissions_tests) {
                metrics.aiAgentDetection.permissionsTests = {
                    value: JSON.stringify(this.results.apiOverrides.permissions_tests),
                    description: 'Permissions API behavior analysis',
                    risk: 'low'
                };
            }
        }

        return metrics;
    }

    /**
     * Get description for a metric
     */
    getMetricDescription(key) {
        const descriptions = {
            permissionsQuery: 'Signature of navigator.permissions.query function',
            dateNow: 'Signature of Date.now function',
            mathRandom: 'Signature of Math.random function',
            performanceNow: 'Signature of performance.now function',
            jsonStringify: 'Signature of JSON.stringify function',
            objectDefineProperty: 'Signature of Object.defineProperty function',
            setTimeoutOverride: 'Signature of setTimeout function',
            setIntervalOverride: 'Signature of setInterval function',
            funcToString: 'Signature of Function.prototype.toString',
            errorToString: 'Signature of Error.prototype.toString',
            addEventListener: 'Signature of EventTarget.prototype.addEventListener',
            dispatchEvent: 'Signature of EventTarget.prototype.dispatchEvent',
            querySelector: 'Signature of Document.prototype.querySelector',
            querySelectorAll: 'Signature of Document.prototype.querySelectorAll',
            getComputedStyle: 'Signature of getComputedStyle function',
            createElement: 'Signature of Document.prototype.createElement',
            appendChild: 'Signature of Node.prototype.appendChild',
            removeChild: 'Signature of Node.prototype.removeChild',
            canvasToDataURL: 'Signature of HTMLCanvasElement.prototype.toDataURL',
            canvasGetContext: 'Signature of HTMLCanvasElement.prototype.getContext',
            webglGetParameter: 'Signature of WebGL getParameter method',
            fetchSig: 'Signature of fetch function',
            xmlHttpRequest: 'Signature of XMLHttpRequest constructor',
            websocketSig: 'Signature of WebSocket constructor',
            requestAnimationFrame: 'Signature of requestAnimationFrame function',
            cancelAnimationFrame: 'Signature of cancelAnimationFrame function',
            navigatorUAGetter: 'Signature of Navigator.userAgent getter',
            navigatorLangGetter: 'Signature of Navigator.languages getter',
            navigatorPlatformGetter: 'Signature of Navigator.platform getter',
            navigatorVendorGetter: 'Signature of Navigator.vendor getter',
            navigatorWebdriverGetter: 'Signature of Navigator.webdriver getter',
            geolocationGetCurrentPosition: 'Signature of Geolocation.getCurrentPosition',
            geolocationWatchPosition: 'Signature of Geolocation.watchPosition',
            clipboardRead: 'Signature of Clipboard.read method',
            clipboardWrite: 'Signature of Clipboard.write method',
            localStorageSetItem: 'Signature of Storage.setItem method',
            localStorageGetItem: 'Signature of Storage.getItem method',
            getUserMedia: 'Signature of MediaDevices.getUserMedia',
            cryptoGetRandomValues: 'Signature of Crypto.getRandomValues',
            cryptoRandomUUID: 'Signature of Crypto.randomUUID',
            proxyConstructor: 'Signature of Proxy constructor',
            reflectGet: 'Signature of Reflect.get method',
            reflectSet: 'Signature of Reflect.set method',
            objectGetOwnPropertyDescriptor: 'Signature of Object.getOwnPropertyDescriptor method',
            promiseConstructor: 'Signature of Promise constructor',
            promiseThen: 'Signature of Promise.prototype.then method',
            promiseCatch: 'Signature of Promise.prototype.catch method',
            asyncFunctionConstructor: 'Signature of AsyncFunction constructor',
            evalFunc: 'Signature of eval function',
            functionConstructor: 'Signature of Function constructor',
            asyncFunctionStringTag: 'Signature of AsyncFunction toString method',
            mouseEventConstructor: 'Signature of MouseEvent constructor',
            keyboardEventConstructor: 'Signature of KeyboardEvent constructor',
            touchEventConstructor: 'Signature of TouchEvent constructor',
            pointerEventConstructor: 'Signature of PointerEvent constructor',
            inputEventConstructor: 'Signature of InputEvent constructor',
            mutationObserver: 'Signature of MutationObserver constructor',
            intersectionObserver: 'Signature of IntersectionObserver constructor',
            resizeObserver: 'Signature of ResizeObserver constructor',
            notificationConstructor: 'Signature of Notification constructor',
            permissionStatusOnchange: 'Signature of PermissionStatus.prototype.onchange',
            navigatorPluginsGetter: 'Signature of Navigator.plugins getter',
            navigatorMimeTypesGetter: 'Signature of Navigator.mimeTypes getter',
            navigatorDeviceMemoryGetter: 'Signature of Navigator.deviceMemory getter',
            navigatorHardwareConcurrencyGetter: 'Signature of Navigator.hardwareConcurrency getter',
            navigatorMaxTouchPointsGetter: 'Signature of Navigator.maxTouchPoints getter',
            screenWidthGetter: 'Signature of Screen.width getter',
            screenHeightGetter: 'Signature of Screen.height getter',
            screenColorDepthGetter: 'Signature of Screen.colorDepth getter',
            batteryManager: 'Signature of navigator.getBattery function',
            messageChannel: 'Signature of MessageChannel constructor',
            postMessage: 'Signature of Window.prototype.postMessage method',
            workerConstructor: 'Signature of Worker constructor',
            sharedWorkerConstructor: 'Signature of SharedWorker constructor',
            serviceWorkerRegister: 'Signature of ServiceWorker.register method',
            toStringIntegrity: 'Integrity check for Function.prototype.toString (critical security check)'
        };
        
        return descriptions[key] || `Analysis of ${key} function signature`;
    }

    /**
     * Calculate risk level for a metric
     */
    calculateRiskLevel(key, value) {
        // Check if it's a native function
        if (typeof value === 'string' && !/\[native code\]/.test(value)) {
            return 'high';
        }
        
        // Check for error states
        if (typeof value === 'string' && value.startsWith('error:')) {
            return 'medium';
        }
        
        return 'low';
    }

    /**
     * Get suspicious indicators
     */
    getSuspiciousIndicators() {
        return this.suspiciousIndicators;
    }

    /**
     * Get summary statistics
     */
    getSummary() {
        const totalIndicators = this.suspiciousIndicators.length;
        const riskCounts = {
            HIGH: this.suspiciousIndicators.filter(i => i.riskLevel === 'HIGH').length,
            MEDIUM: this.suspiciousIndicators.filter(i => i.riskLevel === 'MEDIUM').length,
            LOW: this.suspiciousIndicators.filter(i => i.riskLevel === 'LOW').length
        };

        // Calculate suspicion score (weighted by risk level and importance)
        let suspicionScore = 0;
        this.suspiciousIndicators.forEach(indicator => {
            let weight = 0;
            switch (indicator.riskLevel) {
                case 'HIGH': weight = 1.0; break;
                case 'MEDIUM': weight = 0.6; break;
                case 'LOW': weight = 0.3; break;
            }
            switch (indicator.importance) {
                case 'CRITICAL': weight *= 1.5; break;
                case 'STRONG': weight *= 1.0; break;
                case 'WEAK': weight *= 0.5; break;
            }
            suspicionScore += weight * indicator.confidence;
        });

        // Normalize score
        suspicionScore = Math.min(suspicionScore / 5, 1); // Cap at 1.0

        return {
            totalIndicators,
            riskCounts,
            suspicionScore,
            hasSuspiciousActivity: totalIndicators > 0,
            reasoning: totalIndicators > 0 
                ? `Detected ${totalIndicators} AI agent indicators with ${riskCounts.HIGH} high-risk patterns`
                : 'No significant AI agent patterns detected'
        };
    }
}
