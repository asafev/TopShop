import { log as _log } from './utils/log.js';
/**
 * Function Integrity Detector
 * Detects modifications to native browser functions and APIs
 * Uses cross-realm comparison and signature analysis to identify tampering
 */

import { ContextAnalyzer } from './contextAnalyzer.js';

/**
 * Check if a function signature indicates native code
 * @param {string} signature - The function's toString output
 * @returns {boolean} True if the function appears native
 */
function isNativeSignature(signature) {
    if (!signature || typeof signature !== 'string') return false;
    return /\{\s*\[native code\]\s*\}/.test(signature);
}

/**
 * Check if a value should be displayed (i.e., is NOT a trivial native function)
 * @param {string} value - The function signature or value
 * @returns {boolean} True if value should be shown (is modified/non-native)
 */
function isModifiedFromNative(value) {
    if (!value || typeof value !== 'string') return true;
    
    // Show if it's an error
    if (value.startsWith('error:')) return true;
    
    // Hide if it's not available/supported (not a violation)
    if (value === 'not-supported' || value === 'not-available' || value === 'no-webgl' || value === 'webgl-error') return false;
    
    // Hide if toStringIntegrity check passed (returns 'native')
    if (value === 'native') return false;
    
    // Show if it does NOT contain native code (i.e., has been modified)
    return !isNativeSignature(value);
}

export class FunctionIntegrityDetector {
    constructor() {
        this.results = {};
        this.suspiciousIndicators = [];
        this.contextAnalyzer = new ContextAnalyzer();
    }

    /**
     * Main detection method - performs all function integrity checks
     */
    async detectIntegrityViolations() {
        try {
            // Core function integrity verification
            const integrityResults = await this.verifyFunctionIntegrity();
            this.results.functionIntegrity = integrityResults;

            // Analyze results for suspicious patterns
            this.analyzeForSuspiciousPatterns(integrityResults);

            return {
                success: true,
                results: this.results,
                suspiciousIndicators: this.suspiciousIndicators
            };
        } catch (error) {
            _log.error('Function integrity detection failed:', error);
            return {
                success: false,
                error: error.message,
                results: this.results,
                suspiciousIndicators: this.suspiciousIndicators
            };
        }
    }

    /**
     * Enhanced function integrity verification with cross-realm checks
     */
    async verifyFunctionIntegrity() {
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

        // --- 2) Function integrity checks organized by category
        const integrityChecks = {
            // ===== CORE JAVASCRIPT =====
            // Function infrastructure (most critical)
            funcToString: () => safeToString(Function.prototype.toString),
            functionConstructor: () => safeToString(Function),
            evalFunc: () => safeToString(eval),
            asyncFunctionConstructor: () => safeToString((async function(){}).constructor),
            
            // Object manipulation
            objectDefineProperty: () => safeToString(Object.defineProperty),
            objectGetOwnPropertyDescriptor: () => safeToString(Object.getOwnPropertyDescriptor),
            jsonStringify: () => safeToString(JSON.stringify),
            jsonParse: () => safeToString(JSON.parse),
            
            // Proxy and Reflection
            proxyConstructor: () => safeToString(Proxy),
            reflectGet: () => safeToString(Reflect.get),
            reflectSet: () => safeToString(Reflect.set),
            
            // Promise APIs
            promiseConstructor: () => safeToString(Promise),
            promiseThen: () => safeToString(Promise.prototype.then),
            promiseCatch: () => safeToString(Promise.prototype.catch),
            
            // Error handling
            errorToString: () => safeToString(Error.prototype.toString),
            
            // ===== TIMING FUNCTIONS =====
            dateNow: () => safeToString(Date.now),
            performanceNow: () => safeToString(performance.now),
            setTimeoutFunc: () => safeToString(setTimeout),
            setIntervalFunc: () => safeToString(setInterval),
            requestAnimationFrame: () => safeToString(requestAnimationFrame),
            cancelAnimationFrame: () => safeToString(cancelAnimationFrame),
            
            // ===== RANDOMNESS FUNCTIONS =====
            mathRandom: () => safeToString(Math.random),
            cryptoGetRandomValues: () => crypto?.getRandomValues ? safeToString(crypto.getRandomValues) : 'not-supported',
            cryptoRandomUUID: () => crypto?.randomUUID ? safeToString(crypto.randomUUID) : 'not-supported',
            
            // ===== CONSOLE FUNCTIONS =====
            // IMPORTANT: Use original native console methods if available
            // Our agentDetector.js hooks console for browser-use detection,
            // so we need to check the original methods to avoid false positives
            consoleLog: () => {
                // Check if our hook is installed and get original method
                if (window.__nativeConsoleMethods?.log) {
                    return safeToString(window.__nativeConsoleMethods.log);
                }
                // Check if current console.log is our own hook (has our signature)
                if (console.log.__agentDetectorConsoleHook__ && console.log.__originalNativeMethod) {
                    return safeToString(console.log.__originalNativeMethod);
                }
                return safeToString(console.log);
            },
            consoleWarn: () => {
                if (window.__nativeConsoleMethods?.warn) {
                    return safeToString(window.__nativeConsoleMethods.warn);
                }
                if (console.warn.__agentDetectorConsoleHook__ && console.warn.__originalNativeMethod) {
                    return safeToString(console.warn.__originalNativeMethod);
                }
                return safeToString(console.warn);
            },
            consoleError: () => {
                if (window.__nativeConsoleMethods?.error) {
                    return safeToString(window.__nativeConsoleMethods.error);
                }
                if (console.error.__agentDetectorConsoleHook__ && console.error.__originalNativeMethod) {
                    return safeToString(console.error.__originalNativeMethod);
                }
                return safeToString(console.error);
            },
            consoleDebug: () => {
                if (window.__nativeConsoleMethods?.debug) {
                    return safeToString(window.__nativeConsoleMethods.debug);
                }
                if (console.debug.__agentDetectorConsoleHook__ && console.debug.__originalNativeMethod) {
                    return safeToString(console.debug.__originalNativeMethod);
                }
                return safeToString(console.debug);
            },
            consoleInfo: () => {
                if (window.__nativeConsoleMethods?.info) {
                    return safeToString(window.__nativeConsoleMethods.info);
                }
                if (console.info.__agentDetectorConsoleHook__ && console.info.__originalNativeMethod) {
                    return safeToString(console.info.__originalNativeMethod);
                }
                return safeToString(console.info);
            },
            consoleTrace: () => {
                if (window.__nativeConsoleMethods?.trace) {
                    return safeToString(window.__nativeConsoleMethods.trace);
                }
                if (console.trace.__agentDetectorConsoleHook__ && console.trace.__originalNativeMethod) {
                    return safeToString(console.trace.__originalNativeMethod);
                }
                return safeToString(console.trace);
            },
            
            // ===== DOM MANIPULATION =====
            createElement: () => safeToString(Document.prototype.createElement),
            getElementById: () => safeToString(Document.prototype.getElementById),
            querySelector: () => safeToString(Document.prototype.querySelector),
            querySelectorAll: () => safeToString(Document.prototype.querySelectorAll),
            appendChild: () => safeToString(Node.prototype.appendChild),
            removeChild: () => safeToString(Node.prototype.removeChild),
            getComputedStyle: () => safeToString(getComputedStyle),
            
            // ===== EVENT HANDLING =====
            addEventListener: () => safeToString(EventTarget.prototype.addEventListener),
            removeEventListener: () => safeToString(EventTarget.prototype.removeEventListener),
            dispatchEvent: () => safeToString(EventTarget.prototype.dispatchEvent),
            
            // Event constructors
            mouseEventConstructor: () => safeToString(MouseEvent),
            keyboardEventConstructor: () => safeToString(KeyboardEvent),
            touchEventConstructor: () => safeToString(TouchEvent),
            pointerEventConstructor: () => safeToString(PointerEvent),
            inputEventConstructor: () => safeToString(InputEvent),
            
            // ===== NETWORK FUNCTIONS =====
            fetchFunc: () => safeToString(fetch),
            xmlHttpRequestConstructor: () => safeToString(XMLHttpRequest),
            xmlHttpRequestOpen: () => safeToString(XMLHttpRequest.prototype.open),
            xmlHttpRequestSend: () => safeToString(XMLHttpRequest.prototype.send),
            websocketConstructor: () => safeToString(WebSocket),
            sendBeacon: () => navigator.sendBeacon ? safeToString(navigator.sendBeacon) : 'not-supported',
            
            // ===== COMMUNICATION APIs =====
            postMessage: () => {
                try {
                    if (window.postMessage) {
                        return safeToString(window.postMessage);
                    } else if (Window.prototype.postMessage) {
                        return safeToString(Window.prototype.postMessage);
                    }
                    return 'not-available';
                } catch (e) {
                    return `error:${e.message}`;
                }
            },
            messageChannel: () => safeToString(MessageChannel),
            
            // ===== WORKER APIs =====
            workerConstructor: () => safeToString(Worker),
            sharedWorkerConstructor: () => typeof SharedWorker !== 'undefined' ? safeToString(SharedWorker) : 'not-supported',
            serviceWorkerRegister: () => navigator.serviceWorker?.register ? safeToString(navigator.serviceWorker.register) : 'not-supported',
            
            // ===== CANVAS AND WEBGL =====
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
            
            // ===== NAVIGATOR GETTERS =====
            navigatorUAGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent')?.get),
            navigatorLangGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'languages')?.get),
            navigatorPlatformGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform')?.get),
            navigatorVendorGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'vendor')?.get),
            navigatorWebdriverGetter: () => safeToString(Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver')?.get),
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
            
            // ===== SCREEN GETTERS =====
            screenWidthGetter: () => safeToString(Object.getOwnPropertyDescriptor(Screen.prototype, 'width')?.get),
            screenHeightGetter: () => safeToString(Object.getOwnPropertyDescriptor(Screen.prototype, 'height')?.get),
            screenColorDepthGetter: () => safeToString(Object.getOwnPropertyDescriptor(Screen.prototype, 'colorDepth')?.get),
            
            // ===== PERMISSIONS API =====
            permissionsQuery: () => safeToString(navigator.permissions?.query),
            
            // ===== GEOLOCATION =====
            geolocationGetCurrentPosition: () => navigator.geolocation?.getCurrentPosition ? safeToString(navigator.geolocation.getCurrentPosition) : 'not-supported',
            geolocationWatchPosition: () => navigator.geolocation?.watchPosition ? safeToString(navigator.geolocation.watchPosition) : 'not-supported',
            
            // ===== CLIPBOARD =====
            clipboardRead: () => navigator.clipboard?.read ? safeToString(navigator.clipboard.read) : 'not-supported',
            clipboardWrite: () => navigator.clipboard?.write ? safeToString(navigator.clipboard.write) : 'not-supported',
            
            // ===== STORAGE =====
            localStorageSetItem: () => safeToString(Storage.prototype.setItem),
            localStorageGetItem: () => safeToString(Storage.prototype.getItem),
            localStorageRemoveItem: () => safeToString(Storage.prototype.removeItem),
            
            // ===== MEDIA =====
            getUserMedia: () => navigator.mediaDevices?.getUserMedia ? safeToString(navigator.mediaDevices.getUserMedia) : 'not-supported',
            
            // ===== OBSERVERS =====
            mutationObserver: () => safeToString(MutationObserver),
            intersectionObserver: () => safeToString(IntersectionObserver),
            resizeObserver: () => safeToString(ResizeObserver),
            
            // ===== NOTIFICATIONS =====
            notificationConstructor: () => safeToString(Notification),
            
            // ===== BATTERY =====
            batteryManager: () => navigator.getBattery ? safeToString(navigator.getBattery) : 'not-supported',

            // ===== GLOBAL PARSING/ENCODING FUNCTIONS =====
            parseFloat: () => safeToString(parseFloat),
            parseInt: () => safeToString(parseInt),
            decodeURI: () => safeToString(decodeURI),
            decodeURIComponent: () => safeToString(decodeURIComponent),
            encodeURI: () => safeToString(encodeURI),
            encodeURIComponent: () => safeToString(encodeURIComponent),
            escape: () => safeToString(escape),
            unescape: () => safeToString(unescape),
            isFinite: () => safeToString(isFinite),
            isNaN: () => safeToString(isNaN),
            atob: () => safeToString(atob),
            btoa: () => safeToString(btoa),

            // ===== WINDOW/GLOBAL FUNCTIONS =====
            alert: () => safeToString(alert),
            confirm: () => safeToString(confirm),
            prompt: () => safeToString(prompt),
            open: () => safeToString(open),
            close: () => safeToString(window.close),
            print: () => safeToString(print),
            focus: () => safeToString(window.focus),
            blur: () => safeToString(window.blur),
            stop: () => safeToString(stop),
            find: () => safeToString(window.find),
            getSelection: () => safeToString(getSelection),
            matchMedia: () => safeToString(matchMedia),
            scroll: () => safeToString(scroll),
            scrollTo: () => safeToString(scrollTo),
            scrollBy: () => safeToString(scrollBy),
            moveBy: () => safeToString(moveBy),
            moveTo: () => safeToString(moveTo),
            resizeBy: () => safeToString(resizeBy),
            resizeTo: () => safeToString(resizeTo),
            requestIdleCallback: () => typeof requestIdleCallback !== 'undefined' ? safeToString(requestIdleCallback) : 'not-supported',
            cancelIdleCallback: () => typeof cancelIdleCallback !== 'undefined' ? safeToString(cancelIdleCallback) : 'not-supported',
            clearTimeout: () => safeToString(clearTimeout),
            clearInterval: () => safeToString(clearInterval),
            queueMicrotask: () => safeToString(queueMicrotask),
            structuredClone: () => typeof structuredClone !== 'undefined' ? safeToString(structuredClone) : 'not-supported',
            createImageBitmap: () => safeToString(createImageBitmap),
            reportError: () => typeof reportError !== 'undefined' ? safeToString(reportError) : 'not-supported',

            // ===== CONSTRUCTORS - CORE =====
            arrayConstructor: () => safeToString(Array),
            objectConstructor: () => safeToString(Object),
            mapConstructor: () => safeToString(Map),
            setConstructor: () => safeToString(Set),
            weakMapConstructor: () => safeToString(WeakMap),
            weakSetConstructor: () => safeToString(WeakSet),
            symbolConstructor: () => safeToString(Symbol),
            bigIntConstructor: () => safeToString(BigInt),
            regExpConstructor: () => safeToString(RegExp),
            dateConstructor: () => safeToString(Date),
            numberConstructor: () => safeToString(Number),
            stringConstructor: () => safeToString(String),
            booleanConstructor: () => safeToString(Boolean),

            // ===== TYPED ARRAYS =====
            arrayBufferConstructor: () => safeToString(ArrayBuffer),
            dataViewConstructor: () => safeToString(DataView),
            uint8ArrayConstructor: () => safeToString(Uint8Array),
            int8ArrayConstructor: () => safeToString(Int8Array),
            uint16ArrayConstructor: () => safeToString(Uint16Array),
            int16ArrayConstructor: () => safeToString(Int16Array),
            uint32ArrayConstructor: () => safeToString(Uint32Array),
            int32ArrayConstructor: () => safeToString(Int32Array),
            float32ArrayConstructor: () => safeToString(Float32Array),
            float64ArrayConstructor: () => safeToString(Float64Array),
            uint8ClampedArrayConstructor: () => safeToString(Uint8ClampedArray),
            bigUint64ArrayConstructor: () => safeToString(BigUint64Array),
            bigInt64ArrayConstructor: () => safeToString(BigInt64Array),

            // ===== STREAMS =====
            readableStreamConstructor: () => safeToString(ReadableStream),
            writableStreamConstructor: () => safeToString(WritableStream),
            transformStreamConstructor: () => safeToString(TransformStream),

            // ===== BLOB/FILE =====
            blobConstructor: () => safeToString(Blob),
            fileConstructor: () => safeToString(File),
            fileReaderConstructor: () => safeToString(FileReader),

            // ===== URL/FETCH =====
            urlConstructor: () => safeToString(URL),
            urlSearchParamsConstructor: () => safeToString(URLSearchParams),
            headersConstructor: () => safeToString(Headers),
            requestConstructor: () => safeToString(Request),
            responseConstructor: () => safeToString(Response),
            formDataConstructor: () => safeToString(FormData),

            // ===== ABORT =====
            abortControllerConstructor: () => safeToString(AbortController),
            abortSignalConstructor: () => safeToString(AbortSignal),

            // ===== TEXT ENCODING =====
            textEncoderConstructor: () => safeToString(TextEncoder),
            textDecoderConstructor: () => safeToString(TextDecoder),
            textEncoderStreamConstructor: () => typeof TextEncoderStream !== 'undefined' ? safeToString(TextEncoderStream) : 'not-supported',
            textDecoderStreamConstructor: () => typeof TextDecoderStream !== 'undefined' ? safeToString(TextDecoderStream) : 'not-supported',

            // ===== DOM PARSING =====
            domParserConstructor: () => safeToString(DOMParser),
            xmlSerializerConstructor: () => safeToString(XMLSerializer),
            xpathEvaluatorConstructor: () => safeToString(XPathEvaluator),

            // ===== RANGE/SELECTION =====
            rangeConstructor: () => safeToString(Range),
            selectionToString: () => safeToString(Selection.prototype.toString),

            // ===== EVENTS =====
            eventConstructor: () => safeToString(Event),
            customEventConstructor: () => safeToString(CustomEvent),
            messageEventConstructor: () => safeToString(MessageEvent),
            errorEventConstructor: () => safeToString(ErrorEvent),
            focusEventConstructor: () => safeToString(FocusEvent),
            wheelEventConstructor: () => safeToString(WheelEvent),
            dragEventConstructor: () => safeToString(DragEvent),
            clipboardEventConstructor: () => safeToString(ClipboardEvent),
            compositionEventConstructor: () => safeToString(CompositionEvent),
            uiEventConstructor: () => safeToString(UIEvent),
            animationEventConstructor: () => safeToString(AnimationEvent),
            transitionEventConstructor: () => safeToString(TransitionEvent),
            popStateEventConstructor: () => safeToString(PopStateEvent),
            hashChangeEventConstructor: () => safeToString(HashChangeEvent),
            storageEventConstructor: () => safeToString(StorageEvent),
            beforeUnloadEventConstructor: () => safeToString(BeforeUnloadEvent),
            progressEventConstructor: () => safeToString(ProgressEvent),

            // ===== ELEMENT PROTOTYPE METHODS =====
            getBoundingClientRect: () => safeToString(Element.prototype.getBoundingClientRect),
            getClientRects: () => safeToString(Element.prototype.getClientRects),
            getAttribute: () => safeToString(Element.prototype.getAttribute),
            setAttribute: () => safeToString(Element.prototype.setAttribute),
            removeAttribute: () => safeToString(Element.prototype.removeAttribute),
            hasAttribute: () => safeToString(Element.prototype.hasAttribute),
            toggleAttribute: () => safeToString(Element.prototype.toggleAttribute),
            closest: () => safeToString(Element.prototype.closest),
            matches: () => safeToString(Element.prototype.matches),
            insertAdjacentHTML: () => safeToString(Element.prototype.insertAdjacentHTML),
            insertAdjacentElement: () => safeToString(Element.prototype.insertAdjacentElement),
            insertAdjacentText: () => safeToString(Element.prototype.insertAdjacentText),
            scrollIntoView: () => safeToString(Element.prototype.scrollIntoView),
            attachShadow: () => safeToString(Element.prototype.attachShadow),
            animate: () => safeToString(Element.prototype.animate),
            focus_element: () => safeToString(HTMLElement.prototype.focus),
            blur_element: () => safeToString(HTMLElement.prototype.blur),
            click: () => safeToString(HTMLElement.prototype.click),

            // ===== NODE PROTOTYPE METHODS =====
            cloneNode: () => safeToString(Node.prototype.cloneNode),
            insertBefore: () => safeToString(Node.prototype.insertBefore),
            replaceChild: () => safeToString(Node.prototype.replaceChild),
            contains: () => safeToString(Node.prototype.contains),
            compareDocumentPosition: () => safeToString(Node.prototype.compareDocumentPosition),
            normalize: () => safeToString(Node.prototype.normalize),
            hasChildNodes: () => safeToString(Node.prototype.hasChildNodes),

            // ===== DOCUMENT METHODS =====
            createTextNode: () => safeToString(Document.prototype.createTextNode),
            createDocumentFragment: () => safeToString(Document.prototype.createDocumentFragment),
            createComment: () => safeToString(Document.prototype.createComment),
            createEvent: () => safeToString(Document.prototype.createEvent),
            createRange: () => safeToString(Document.prototype.createRange),
            createTreeWalker: () => safeToString(Document.prototype.createTreeWalker),
            createNodeIterator: () => safeToString(Document.prototype.createNodeIterator),
            importNode: () => safeToString(Document.prototype.importNode),
            adoptNode: () => safeToString(Document.prototype.adoptNode),
            execCommand: () => safeToString(Document.prototype.execCommand),
            getElementsByClassName: () => safeToString(Document.prototype.getElementsByClassName),
            getElementsByTagName: () => safeToString(Document.prototype.getElementsByTagName),
            getElementsByName: () => safeToString(Document.prototype.getElementsByName),
            elementFromPoint: () => safeToString(Document.prototype.elementFromPoint),
            elementsFromPoint: () => safeToString(Document.prototype.elementsFromPoint),
            getAnimations: () => safeToString(Document.prototype.getAnimations),

            // ===== HISTORY =====
            historyPushState: () => safeToString(History.prototype.pushState),
            historyReplaceState: () => safeToString(History.prototype.replaceState),
            historyBack: () => safeToString(History.prototype.back),
            historyForward: () => safeToString(History.prototype.forward),
            historyGo: () => safeToString(History.prototype.go),

            // ===== CANVAS 2D CONTEXT =====
            canvas2dFillRect: () => safeToString(CanvasRenderingContext2D.prototype.fillRect),
            canvas2dStrokeRect: () => safeToString(CanvasRenderingContext2D.prototype.strokeRect),
            canvas2dFillText: () => safeToString(CanvasRenderingContext2D.prototype.fillText),
            canvas2dStrokeText: () => safeToString(CanvasRenderingContext2D.prototype.strokeText),
            canvas2dMeasureText: () => safeToString(CanvasRenderingContext2D.prototype.measureText),
            canvas2dDrawImage: () => safeToString(CanvasRenderingContext2D.prototype.drawImage),
            canvas2dGetImageData: () => safeToString(CanvasRenderingContext2D.prototype.getImageData),
            canvas2dPutImageData: () => safeToString(CanvasRenderingContext2D.prototype.putImageData),
            canvas2dCreateLinearGradient: () => safeToString(CanvasRenderingContext2D.prototype.createLinearGradient),
            canvas2dCreateRadialGradient: () => safeToString(CanvasRenderingContext2D.prototype.createRadialGradient),
            canvas2dCreatePattern: () => safeToString(CanvasRenderingContext2D.prototype.createPattern),
            canvas2dSave: () => safeToString(CanvasRenderingContext2D.prototype.save),
            canvas2dRestore: () => safeToString(CanvasRenderingContext2D.prototype.restore),
            canvas2dTransform: () => safeToString(CanvasRenderingContext2D.prototype.transform),

            // ===== PERFORMANCE =====
            performanceMark: () => safeToString(Performance.prototype.mark),
            performanceMeasure: () => safeToString(Performance.prototype.measure),
            performanceGetEntries: () => safeToString(Performance.prototype.getEntries),
            performanceGetEntriesByType: () => safeToString(Performance.prototype.getEntriesByType),
            performanceGetEntriesByName: () => safeToString(Performance.prototype.getEntriesByName),
            performanceClearMarks: () => safeToString(Performance.prototype.clearMarks),
            performanceClearMeasures: () => safeToString(Performance.prototype.clearMeasures),
            performanceObserverConstructor: () => safeToString(PerformanceObserver),

            // ===== BROADCAST CHANNEL =====
            broadcastChannelConstructor: () => safeToString(BroadcastChannel),

            // ===== INDEXEDDB =====
            idbFactoryOpen: () => safeToString(IDBFactory.prototype.open),
            idbFactoryDeleteDatabase: () => safeToString(IDBFactory.prototype.deleteDatabase),

            // ===== CRYPTO =====
            subtleCryptoDigest: () => crypto?.subtle?.digest ? safeToString(crypto.subtle.digest) : 'not-supported',
            subtleCryptoEncrypt: () => crypto?.subtle?.encrypt ? safeToString(crypto.subtle.encrypt) : 'not-supported',
            subtleCryptoDecrypt: () => crypto?.subtle?.decrypt ? safeToString(crypto.subtle.decrypt) : 'not-supported',
            subtleCryptoSign: () => crypto?.subtle?.sign ? safeToString(crypto.subtle.sign) : 'not-supported',
            subtleCryptoVerify: () => crypto?.subtle?.verify ? safeToString(crypto.subtle.verify) : 'not-supported',
            subtleCryptoGenerateKey: () => crypto?.subtle?.generateKey ? safeToString(crypto.subtle.generateKey) : 'not-supported',
            subtleCryptoImportKey: () => crypto?.subtle?.importKey ? safeToString(crypto.subtle.importKey) : 'not-supported',
            subtleCryptoExportKey: () => crypto?.subtle?.exportKey ? safeToString(crypto.subtle.exportKey) : 'not-supported',

            // ===== WEBASSEMBLY =====
            webAssemblyInstantiate: () => typeof WebAssembly !== 'undefined' ? safeToString(WebAssembly.instantiate) : 'not-supported',
            webAssemblyCompile: () => typeof WebAssembly !== 'undefined' ? safeToString(WebAssembly.compile) : 'not-supported',
            webAssemblyValidate: () => typeof WebAssembly !== 'undefined' ? safeToString(WebAssembly.validate) : 'not-supported',

            // ===== INTL =====
            intlDateTimeFormat: () => safeToString(Intl.DateTimeFormat),
            intlNumberFormat: () => safeToString(Intl.NumberFormat),
            intlCollator: () => safeToString(Intl.Collator),
            intlPluralRules: () => safeToString(Intl.PluralRules),
            intlRelativeTimeFormat: () => typeof Intl.RelativeTimeFormat !== 'undefined' ? safeToString(Intl.RelativeTimeFormat) : 'not-supported',
            intlListFormat: () => typeof Intl.ListFormat !== 'undefined' ? safeToString(Intl.ListFormat) : 'not-supported',

            // ===== MEDIA/AUDIO =====
            audioContextConstructor: () => safeToString(AudioContext),
            offlineAudioContextConstructor: () => safeToString(OfflineAudioContext),
            mediaStreamConstructor: () => safeToString(MediaStream),
            mediaRecorderConstructor: () => typeof MediaRecorder !== 'undefined' ? safeToString(MediaRecorder) : 'not-supported',
            speechSynthesis_speak: () => speechSynthesis?.speak ? safeToString(speechSynthesis.speak) : 'not-supported',
            speechSynthesis_getVoices: () => speechSynthesis?.getVoices ? safeToString(speechSynthesis.getVoices) : 'not-supported',

            // ===== RTC =====
            rtcPeerConnectionConstructor: () => safeToString(RTCPeerConnection),
            rtcSessionDescriptionConstructor: () => safeToString(RTCSessionDescription),
            rtcIceCandidateConstructor: () => safeToString(RTCIceCandidate),

            // ===== IMAGE =====
            imageConstructor: () => safeToString(Image),
            imageDataConstructor: () => safeToString(ImageData),
            imageBitmapRenderingContextTransferFromImageBitmap: () => safeToString(ImageBitmapRenderingContext.prototype.transferFromImageBitmap),
            offscreenCanvasConstructor: () => typeof OffscreenCanvas !== 'undefined' ? safeToString(OffscreenCanvas) : 'not-supported',

            // ===== ANIMATION =====
            animationConstructor: () => safeToString(Animation),
            keyframeEffectConstructor: () => safeToString(KeyframeEffect),

            // ===== CSS/STYLE =====
            cssStyleDeclarationSetProperty: () => safeToString(CSSStyleDeclaration.prototype.setProperty),
            cssStyleDeclarationGetPropertyValue: () => safeToString(CSSStyleDeclaration.prototype.getPropertyValue),
            cssStyleDeclarationRemoveProperty: () => safeToString(CSSStyleDeclaration.prototype.removeProperty),

            // ===== FINALIZATION/WEAKREF =====
            finalizationRegistryConstructor: () => safeToString(FinalizationRegistry),
            weakRefConstructor: () => safeToString(WeakRef),
            
            // ===== INTEGRITY CHECK =====
            toStringIntegrity: () => {
                const original = Function.prototype.toString;
                const check = original.toString();
                return check.includes('[native code]') ? 'native' : 'MODIFIED';
            },
        };

        // Execute all checks and collect full toString for overridden (non-native) functions
        const overriddenFunctions = {};
        for (const [k, fn] of Object.entries(integrityChecks)) {
            try {
                const val = fn();
                T(k, val);
                // Native-ness bit for quick scoring
                const isNative = isNativeSignature(String(val));
                T(`${k}_native`, isNative);
                
                // Store full toString for non-native functions (for analysis)
                if (!isNative && typeof val === 'string' && val.length > 0 &&
                    !val.startsWith('error:') &&
                    val !== 'not-supported' && val !== 'not-available' && 
                    val !== 'no-webgl' && val !== 'webgl-error' &&
                    val !== 'native' && val !== 'MODIFIED') {
                    overriddenFunctions[k] = val;
                }
            } catch (e) {
                T(k, `error:${e?.message || e}`);
                T(`${k}_native`, false);
            }
        }
        
        // Store overridden functions with full toString for analysis
        T('overriddenFunctions', overriddenFunctions);

        // --- Error Stack Trace Analysis ---
        // Capture Error stack to detect modified Error constructors or stack manipulation
        let errorStackTrace = null;
        try {
            const err = new Error();
            errorStackTrace = err.stack || '';
        } catch (e) {
            errorStackTrace = `error:${e?.message || e}`;
        }
        T('errorStackTrace', errorStackTrace);

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
            
            // Console.log cross-realm check - use original native method if our hook is installed
            const consoleLogToCheck = window.__nativeConsoleMethods?.log || 
                (console.log.__agentDetectorConsoleHook__ ? console.log.__originalNativeMethod : console.log);
            crossRealm.console_log_diff = safeToString(consoleLogToCheck) !== pToString.call(P.console.log);
            
            crossRealm.Proxy_constructor_diff = safeToString(Proxy) !== pToString.call(P.Proxy);
            crossRealm.Reflect_get_diff = safeToString(Reflect.get) !== pToString.call(P.Reflect.get);
            crossRealm.fetch_diff = safeToString(fetch) !== pToString.call(P.fetch);
            crossRealm.XMLHttpRequest_diff = safeToString(XMLHttpRequest) !== pToString.call(P.XMLHttpRequest);
            crossRealm.Promise_constructor_diff = safeToString(Promise) !== pToString.call(P.Promise);
            crossRealm.eval_diff = safeToString(eval) !== pToString.call(P.eval);
            crossRealm.Function_constructor_diff = safeToString(Function) !== pToString.call(P.Function);
            crossRealm.Worker_constructor_diff = safeToString(Worker) !== pToString.call(P.Worker);
            
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
            
            // For console.log descriptor check, we skip if our own hook is installed
            // since we know we modified it intentionally for browser-use detection
            if (window.__browserUseDetectorInstalled && console.log.__agentDetectorConsoleHook__) {
                // Our hook is installed - mark as unchanged (not a violation)
                descChecks.console_log_desc_unchanged = true;
            } else {
                descChecks.console_log_desc_unchanged = sameDescriptor(console, 'log', P.console);
            }
            
            descChecks.Date_now_desc_unchanged = sameDescriptor(Date, 'now', P.Date);
            descChecks.Math_random_desc_unchanged = sameDescriptor(Math, 'random', P.Math);
        } catch (e) {
            descChecks.error = e.message;
        }
        T('descriptors', descChecks);

        // --- 5) Proxy suspicion checks (focused on high-value targets)
        const proxySuspicions = {};
        try {
            // Get original console.log if our hook is installed
            const consoleLogForProxyCheck = window.__nativeConsoleMethods?.log || 
                (console.log.__agentDetectorConsoleHook__ ? console.log.__originalNativeMethod : console.log);
            
            const criticalFunctions = {
                'setTimeout_proxied': setTimeout,
                'setInterval_proxied': setInterval,
                'funcToString_proxied': Function.prototype.toString,
                'fetch_proxied': fetch,
                'JSON_stringify_proxied': JSON.stringify,
                'addEventListener_proxied': EventTarget.prototype.addEventListener,
                'console_log_proxied': consoleLogForProxyCheck
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
                                    funcToString: Function.prototype.toString.toString(),
                                    JSONStringify: JSON.stringify.toString(),
                                    mathRandom: Math.random.toString(),
                                    dateNow: Date.now.toString(),
                                    consoleLog: typeof console.log === 'function' ? console.log.toString() : 'unavailable',
                                    fetch: typeof fetch === 'function' ? fetch.toString() : 'unavailable',
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
                    funcToString: pToString.call(P.Function.prototype.toString),
                    JSONStringify: pToString.call(P.JSON.stringify),
                    mathRandom: pToString.call(P.Math.random),
                    dateNow: pToString.call(P.Date.now),
                    consoleLog: pToString.call(P.console.log),
                    fetch: pToString.call(P.fetch),
                };
            } catch (e) {
                return { error: e.message };
            }
        };

        // Get original console.log for main context comparison (avoid our own hook)
        const mainContextConsoleLog = window.__nativeConsoleMethods?.log || 
            (console.log.__agentDetectorConsoleHook__ ? console.log.__originalNativeMethod : console.log);

        const mainContext = {
            ua: navigator.userAgent,
            plat: navigator.platform,
            lang: navigator.languages ? Array.from(navigator.languages) : [],
            hw: navigator.hardwareConcurrency,
            funcToString: Function.prototype.toString.toString(),
            JSONStringify: JSON.stringify.toString(),
            mathRandom: Math.random.toString(),
            dateNow: Date.now.toString(),
            consoleLog: mainContextConsoleLog.toString(),
            fetch: fetch.toString(),
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
        if (results.toStringIntegrity === 'MODIFIED') {
            indicators.push({
                name: 'Function.prototype.toString COMPROMISED',
                description: 'The core Function.prototype.toString has been modified, compromising all signature detection',
                category: 'Critical Infrastructure',
                riskLevel: 'HIGH',
                confidence: 0.95,
                importance: 'CRITICAL',
                value: 'MODIFIED',
                details: 'Function.prototype.toString does not appear native - ALL OTHER CHECKS ARE SUSPECT'
            });
        }

        // Check for non-native function signatures
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
                    funcValue === 'not-supported' ||
                    funcValue === 'native') {
                    return;
                }
                
                // Skip toStringIntegrity - handled separately
                if (funcName === 'toStringIntegrity') {
                    return;
                }
                
                // Critical APIs that should NEVER be modified
                const criticalApis = [
                    // Core infrastructure
                    'funcToString', 'functionConstructor', 'evalFunc', 
                    'objectConstructor', 'arrayConstructor', 'proxyConstructor', 
                    'reflectGet', 'reflectSet',
                    // Timing
                    'dateNow', 'performanceNow', 'setTimeoutFunc', 'setIntervalFunc',
                    'clearTimeout', 'clearInterval', 'requestAnimationFrame',
                    // Randomness
                    'mathRandom', 'cryptoGetRandomValues', 'cryptoRandomUUID',
                    // Console
                    'consoleLog', 'consoleWarn', 'consoleError',
                    // Network
                    'fetchFunc', 'xmlHttpRequestConstructor', 'xmlHttpRequestOpen', 
                    'xmlHttpRequestSend', 'websocketConstructor',
                    // Navigator getters
                    'navigatorUAGetter', 'navigatorPluginsGetter', 'navigatorWebdriverGetter',
                    'navigatorPlatformGetter', 'navigatorLangGetter',
                    // DOM critical
                    'createElement', 'getBoundingClientRect', 'getClientRects',
                    'querySelector', 'querySelectorAll', 'getElementById',
                    // Canvas (fingerprinting)
                    'canvasToDataURL', 'canvasGetContext', 'canvas2dGetImageData',
                    'canvas2dFillText', 'canvas2dMeasureText',
                    // WebGL
                    'webglGetParameter',
                    // Events
                    'addEventListener', 'dispatchEvent',
                    // History (navigation hijacking)
                    'historyPushState', 'historyReplaceState',
                    // Encoding (data exfil)
                    'atob', 'btoa',
                    // Crypto
                    'subtleCryptoDigest', 'subtleCryptoEncrypt', 'subtleCryptoDecrypt'
                ];
                
                if (criticalApis.includes(funcName)) {
                    indicators.push({
                        name: `Modified critical function: ${funcName}`,
                        description: `The ${funcName} function has been modified from its native implementation`,
                        category: 'Function Integrity',
                        riskLevel: 'HIGH',
                        confidence: 0.85,
                        importance: 'CRITICAL',
                        value: funcValue.substring(0, 100) + (funcValue.length > 100 ? '...' : ''),
                        details: 'Critical browser function does not contain expected [native code] pattern'
                    });
                } else {
                    // Less critical APIs
                    indicators.push({
                        name: `Modified function: ${funcName}`,
                        description: `The ${funcName} function appears to be polyfilled or modified`,
                        category: 'Function Integrity',
                        riskLevel: 'MEDIUM',
                        confidence: 0.6,
                        importance: 'STRONG',
                        value: funcValue.substring(0, 100) + (funcValue.length > 100 ? '...' : ''),
                        details: 'Function signature indicates polyfill or modification'
                    });
                }
            }
        });

        // Check cross-realm inconsistencies
        if (results.crossRealm) {
            Object.entries(results.crossRealm).forEach(([key, value]) => {
                if (value === true && key.endsWith('_diff')) {
                    const funcName = key.replace('_diff', '').replace(/_/g, '.');
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
                    const propName = key.replace('_desc_unchanged', '').replace(/_/g, '.');
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

        // Check proxy suspicions
        if (results.proxySuspicions) {
            Object.entries(results.proxySuspicions).forEach(([key, value]) => {
                if (value === true && key.endsWith('_proxied')) {
                    const funcName = key.replace('_proxied', '');
                    indicators.push({
                        name: `Potential proxy wrapper: ${funcName}`,
                        description: `Function may be wrapped by a Proxy`,
                        category: 'Proxy Detection',
                        riskLevel: 'MEDIUM',
                        confidence: 0.6,
                        importance: 'WEAK',
                        value: 'possibly-proxied',
                        details: 'Function exhibits characteristics that may indicate Proxy wrapping'
                    });
                }
            });
        }

        // Check context inconsistencies
        if (results.contexts) {
            const contextAnalysis = this.contextAnalyzer.analyzeContexts(results.contexts);
            
            if (contextAnalysis.indicators && contextAnalysis.indicators.length > 0) {
                indicators.push(...contextAnalysis.indicators);
            }
        }

        this.suspiciousIndicators = indicators;
    }

    /**
     * Get formatted results for display - ONLY showing modified functions
     */
    getFormattedResults() {
        const metrics = {};
        
        if (this.results.functionIntegrity) {
            metrics.functionIntegrity = {};

            // Only include metrics that show modification (not native)
            Object.keys(this.results.functionIntegrity).forEach(key => {
                // Skip internal keys
                if (key.endsWith('_native') || 
                    ['crossRealm', 'descriptors', 'proxySuspicions', 'contexts'].includes(key)) {
                    return;
                }
                
                const value = this.results.functionIntegrity[key];
                const isNative = this.results.functionIntegrity[`${key}_native`];
                
                // Special case: toStringIntegrity returns 'native' or 'MODIFIED', not a function signature
                if (key === 'toStringIntegrity') {
                    // Only show if MODIFIED (compromised)
                    if (value === 'MODIFIED') {
                        metrics.functionIntegrity[key] = {
                            value: value,
                            description: this.getMetricDescription(key),
                            risk: 'high'
                        };
                    }
                    return;
                }
                
                // Only show modified (non-native) functions
                if (isNative === false && isModifiedFromNative(value)) {
                    metrics.functionIntegrity[key] = {
                        value: value,
                        description: this.getMetricDescription(key),
                        risk: 'high'
                    };
                }
            });

            // Cross-realm checks - only show differences
            if (this.results.functionIntegrity.crossRealm) {
                Object.entries(this.results.functionIntegrity.crossRealm).forEach(([key, value]) => {
                    if (value === true) {
                        metrics.functionIntegrity[`crossRealm_${key}`] = {
                            value: 'MISMATCH',
                            description: `Cross-realm check: ${key.replace('_diff', '')} differs from pristine context`,
                            risk: 'high'
                        };
                    }
                });
            }

            // Proxy suspicions - only show positive detections
            if (this.results.functionIntegrity.proxySuspicions) {
                Object.entries(this.results.functionIntegrity.proxySuspicions).forEach(([key, value]) => {
                    if (value === true) {
                        metrics.functionIntegrity[`proxy_${key}`] = {
                            value: 'DETECTED',
                            description: `Proxy wrapper detected: ${key.replace('_proxied', '')}`,
                            risk: 'high'
                        };
                    }
                });
            }

            // Descriptor changes - only show modifications
            if (this.results.functionIntegrity.descriptors) {
                Object.entries(this.results.functionIntegrity.descriptors).forEach(([key, value]) => {
                    if (value === false) {
                        metrics.functionIntegrity[`descriptor_${key}`] = {
                            value: 'MODIFIED',
                            description: `Descriptor modified: ${key.replace('_desc_unchanged', '')}`,
                            risk: 'high'
                        };
                    }
                });
            }

            // Error stack trace - only show if non-trivial (not just a simple anonymous stack)
            if (this.results.functionIntegrity.errorStackTrace) {
                const stack = this.results.functionIntegrity.errorStackTrace;
                const isTrivialStack = this._isTrivialErrorStack(stack);
                
                if (!isTrivialStack && typeof stack === 'string' && !stack.startsWith('error:')) {
                    metrics.functionIntegrity.errorStackTrace = {
                        value: stack,
                        description: 'Error stack trace - may indicate modified Error constructor or execution context',
                        risk: 'medium'
                    };
                }
            }

            // Overridden functions with full toString - for detailed analysis
            if (this.results.functionIntegrity.overriddenFunctions) {
                const overridden = this.results.functionIntegrity.overriddenFunctions;
                const count = Object.keys(overridden).length;
                
                if (count > 0) {
                    metrics.functionIntegrity.overriddenFunctionsCount = {
                        value: count,
                        description: `Number of overridden (non-native) functions detected`,
                        risk: count > 5 ? 'high' : count > 0 ? 'medium' : 'low'
                    };
                    
                    // Store individual overridden function details
                    Object.entries(overridden).forEach(([funcName, fullToString]) => {
                        metrics.functionIntegrity[`override_${funcName}`] = {
                            value: fullToString.length > 200 ? fullToString.substring(0, 200) + '...[truncated]' : fullToString,
                            fullValue: fullToString, // Store full value for export/raw access
                            description: `Full toString() of overridden function: ${funcName}`,
                            risk: 'high'
                        };
                    });
                }
            }
        }

        return metrics;
    }

    /**
     * Check if an error stack trace is trivial (standard browser-generated stack)
     * Trivial stacks are those generated in normal execution contexts without modification
     * @param {string} stack - The error stack string
     * @returns {boolean} True if the stack is trivial and should be hidden
     */
    _isTrivialErrorStack(stack) {
        if (!stack || typeof stack !== 'string') return true;
        
        // Normalize the stack for comparison
        const normalizedStack = stack.trim();
        
        // Pattern 1: Simple anonymous stack (e.g., "Error\n    at <anonymous>:1:13")
        if (/^Error\s*\n\s*at\s+<anonymous>:\d+:\d+\s*$/i.test(normalizedStack)) {
            return true;
        }
        
        // Pattern 2: Chrome-style eval stack (trivial eval context)
        if (/^Error\s*\n\s*at\s+eval\s+\(eval\s+at\s+/i.test(normalizedStack)) {
            // Check if it's just a single-frame eval stack
            const lines = normalizedStack.split('\n').filter(l => l.trim().length > 0);
            if (lines.length <= 2) {
                return true;
            }
        }
        
        // Pattern 3: Firefox-style trivial stack (@:line:col or @debugger eval code:line:col)
        if (/^@(debugger\s+eval\s+code)?:\d+:\d+\s*$/i.test(normalizedStack)) {
            return true;
        }
        
        // Pattern 4: Very short stacks (just "Error" or similar)
        if (normalizedStack.length < 30 && !normalizedStack.includes('\n')) {
            return true;
        }
        
        // Pattern 5: Stack with only our own function integrity detector frames (self-generated)
        if (normalizedStack.includes('functionIntegrityDetector') && 
            !normalizedStack.includes('Proxy') && 
            normalizedStack.split('\n').length <= 5) {
            // Could be trivial internal stack - check if it has suspicious frames
            const suspiciousPatterns = [
                'puppeteer', 'playwright', 'selenium', 'webdriver',
                'ghost', 'phantom', 'zombie', 'nightmare',
                'cypress', 'testcafe', 'protractor'
            ];
            const hasNonSuspiciousStack = !suspiciousPatterns.some(p => 
                normalizedStack.toLowerCase().includes(p)
            );
            if (hasNonSuspiciousStack) {
                return true;
            }
        }
        
        // Not trivial - stack is interesting and should be shown
        return false;
    }

    /**
     * Get description for a metric
     */
    getMetricDescription(key) {
        const descriptions = {
            // Core JavaScript
            funcToString: 'Function.prototype.toString - critical for signature detection',
            functionConstructor: 'Function constructor - code execution',
            evalFunc: 'eval function - dynamic code execution',
            asyncFunctionConstructor: 'AsyncFunction constructor',
            objectDefineProperty: 'Object.defineProperty - property manipulation',
            objectGetOwnPropertyDescriptor: 'Object.getOwnPropertyDescriptor',
            jsonStringify: 'JSON.stringify - serialization',
            jsonParse: 'JSON.parse - deserialization',
            proxyConstructor: 'Proxy constructor - object interception',
            reflectGet: 'Reflect.get - property access',
            reflectSet: 'Reflect.set - property assignment',
            promiseConstructor: 'Promise constructor',
            promiseThen: 'Promise.prototype.then',
            promiseCatch: 'Promise.prototype.catch',
            errorToString: 'Error.prototype.toString',
            
            // Timing
            dateNow: 'Date.now - high-resolution time',
            performanceNow: 'performance.now - precise timing',
            setTimeoutFunc: 'setTimeout - timer function',
            setIntervalFunc: 'setInterval - interval timer',
            requestAnimationFrame: 'requestAnimationFrame - animation timing',
            cancelAnimationFrame: 'cancelAnimationFrame',
            
            // Randomness
            mathRandom: 'Math.random - random number generation',
            cryptoGetRandomValues: 'crypto.getRandomValues - secure random',
            cryptoRandomUUID: 'crypto.randomUUID - UUID generation',
            
            // Console
            consoleLog: 'console.log - logging function',
            consoleWarn: 'console.warn - warning output',
            consoleError: 'console.error - error output',
            consoleDebug: 'console.debug - debug output',
            consoleInfo: 'console.info - info output',
            consoleTrace: 'console.trace - stack trace',
            
            // DOM
            createElement: 'Document.prototype.createElement',
            getElementById: 'Document.prototype.getElementById',
            querySelector: 'Document.prototype.querySelector',
            querySelectorAll: 'Document.prototype.querySelectorAll',
            appendChild: 'Node.prototype.appendChild',
            removeChild: 'Node.prototype.removeChild',
            getComputedStyle: 'getComputedStyle function',
            
            // Events
            addEventListener: 'EventTarget.prototype.addEventListener',
            removeEventListener: 'EventTarget.prototype.removeEventListener',
            dispatchEvent: 'EventTarget.prototype.dispatchEvent',
            mouseEventConstructor: 'MouseEvent constructor',
            keyboardEventConstructor: 'KeyboardEvent constructor',
            touchEventConstructor: 'TouchEvent constructor',
            pointerEventConstructor: 'PointerEvent constructor',
            inputEventConstructor: 'InputEvent constructor',
            
            // Network
            fetchFunc: 'fetch API - network requests',
            xmlHttpRequestConstructor: 'XMLHttpRequest constructor',
            xmlHttpRequestOpen: 'XMLHttpRequest.prototype.open',
            xmlHttpRequestSend: 'XMLHttpRequest.prototype.send',
            websocketConstructor: 'WebSocket constructor',
            sendBeacon: 'navigator.sendBeacon - analytics beacon',
            
            // Communication
            postMessage: 'Window.postMessage - cross-origin messaging',
            messageChannel: 'MessageChannel constructor',
            workerConstructor: 'Worker constructor',
            sharedWorkerConstructor: 'SharedWorker constructor',
            serviceWorkerRegister: 'ServiceWorker.register',
            
            // Canvas/WebGL
            canvasToDataURL: 'HTMLCanvasElement.prototype.toDataURL',
            canvasGetContext: 'HTMLCanvasElement.prototype.getContext',
            webglGetParameter: 'WebGL getParameter method',
            
            // Navigator getters
            navigatorUAGetter: 'Navigator.userAgent getter',
            navigatorLangGetter: 'Navigator.languages getter',
            navigatorPlatformGetter: 'Navigator.platform getter',
            navigatorVendorGetter: 'Navigator.vendor getter',
            navigatorWebdriverGetter: 'Navigator.webdriver getter',
            navigatorPluginsGetter: 'Navigator.plugins getter',
            navigatorMimeTypesGetter: 'Navigator.mimeTypes getter',
            navigatorDeviceMemoryGetter: 'Navigator.deviceMemory getter',
            navigatorHardwareConcurrencyGetter: 'Navigator.hardwareConcurrency getter',
            navigatorMaxTouchPointsGetter: 'Navigator.maxTouchPoints getter',
            
            // Screen getters
            screenWidthGetter: 'Screen.width getter',
            screenHeightGetter: 'Screen.height getter',
            screenColorDepthGetter: 'Screen.colorDepth getter',
            
            // Storage
            localStorageSetItem: 'Storage.prototype.setItem',
            localStorageGetItem: 'Storage.prototype.getItem',
            localStorageRemoveItem: 'Storage.prototype.removeItem',
            
            // Other
            permissionsQuery: 'Permissions.query',
            geolocationGetCurrentPosition: 'Geolocation.getCurrentPosition',
            geolocationWatchPosition: 'Geolocation.watchPosition',
            clipboardRead: 'Clipboard.read',
            clipboardWrite: 'Clipboard.write',
            getUserMedia: 'MediaDevices.getUserMedia',
            mutationObserver: 'MutationObserver constructor',
            intersectionObserver: 'IntersectionObserver constructor',
            resizeObserver: 'ResizeObserver constructor',
            notificationConstructor: 'Notification constructor',
            batteryManager: 'navigator.getBattery',
            toStringIntegrity: 'Function.prototype.toString integrity check',
            
            // Error stack and overridden functions
            errorStackTrace: 'Error stack trace - reveals execution context and potential modifications',
            overriddenFunctionsCount: 'Count of overridden (non-native) functions detected',

            // ===== NEW ADDITIONS =====
            
            // Global parsing/encoding
            parseFloat: 'parseFloat - string to float conversion',
            parseInt: 'parseInt - string to integer conversion',
            decodeURI: 'decodeURI - URI decoding',
            decodeURIComponent: 'decodeURIComponent - URI component decoding',
            encodeURI: 'encodeURI - URI encoding',
            encodeURIComponent: 'encodeURIComponent - URI component encoding',
            escape: 'escape - legacy string encoding',
            unescape: 'unescape - legacy string decoding',
            isFinite: 'isFinite - finite number check',
            isNaN: 'isNaN - NaN check',
            atob: 'atob - base64 decoding',
            btoa: 'btoa - base64 encoding',

            // Window/global functions
            alert: 'alert - modal dialog',
            confirm: 'confirm - confirmation dialog',
            prompt: 'prompt - input dialog',
            open: 'window.open - new window/tab',
            close: 'window.close - close window',
            print: 'print - print dialog',
            focus: 'window.focus - focus window',
            blur: 'window.blur - blur window',
            stop: 'stop - stop page loading',
            find: 'window.find - text search',
            getSelection: 'getSelection - text selection',
            matchMedia: 'matchMedia - media query matching',
            scroll: 'scroll - scroll window',
            scrollTo: 'scrollTo - scroll to position',
            scrollBy: 'scrollBy - scroll by amount',
            moveBy: 'moveBy - move window',
            moveTo: 'moveTo - move window to position',
            resizeBy: 'resizeBy - resize window',
            resizeTo: 'resizeTo - resize window to size',
            requestIdleCallback: 'requestIdleCallback - idle callback',
            cancelIdleCallback: 'cancelIdleCallback - cancel idle callback',
            clearTimeout: 'clearTimeout - cancel timeout',
            clearInterval: 'clearInterval - cancel interval',
            queueMicrotask: 'queueMicrotask - queue microtask',
            structuredClone: 'structuredClone - deep clone',
            createImageBitmap: 'createImageBitmap - image bitmap creation',
            reportError: 'reportError - error reporting',

            // Core constructors
            arrayConstructor: 'Array constructor',
            objectConstructor: 'Object constructor',
            mapConstructor: 'Map constructor',
            setConstructor: 'Set constructor',
            weakMapConstructor: 'WeakMap constructor',
            weakSetConstructor: 'WeakSet constructor',
            symbolConstructor: 'Symbol constructor',
            bigIntConstructor: 'BigInt constructor',
            regExpConstructor: 'RegExp constructor',
            dateConstructor: 'Date constructor',
            numberConstructor: 'Number constructor',
            stringConstructor: 'String constructor',
            booleanConstructor: 'Boolean constructor',

            // Typed arrays
            arrayBufferConstructor: 'ArrayBuffer constructor',
            dataViewConstructor: 'DataView constructor',
            uint8ArrayConstructor: 'Uint8Array constructor',
            int8ArrayConstructor: 'Int8Array constructor',
            uint16ArrayConstructor: 'Uint16Array constructor',
            int16ArrayConstructor: 'Int16Array constructor',
            uint32ArrayConstructor: 'Uint32Array constructor',
            int32ArrayConstructor: 'Int32Array constructor',
            float32ArrayConstructor: 'Float32Array constructor',
            float64ArrayConstructor: 'Float64Array constructor',
            uint8ClampedArrayConstructor: 'Uint8ClampedArray constructor',
            bigUint64ArrayConstructor: 'BigUint64Array constructor',
            bigInt64ArrayConstructor: 'BigInt64Array constructor',

            // Streams
            readableStreamConstructor: 'ReadableStream constructor',
            writableStreamConstructor: 'WritableStream constructor',
            transformStreamConstructor: 'TransformStream constructor',

            // Blob/File
            blobConstructor: 'Blob constructor',
            fileConstructor: 'File constructor',
            fileReaderConstructor: 'FileReader constructor',

            // URL/Fetch
            urlConstructor: 'URL constructor',
            urlSearchParamsConstructor: 'URLSearchParams constructor',
            headersConstructor: 'Headers constructor',
            requestConstructor: 'Request constructor',
            responseConstructor: 'Response constructor',
            formDataConstructor: 'FormData constructor',

            // Abort
            abortControllerConstructor: 'AbortController constructor',
            abortSignalConstructor: 'AbortSignal constructor',

            // Text encoding
            textEncoderConstructor: 'TextEncoder constructor',
            textDecoderConstructor: 'TextDecoder constructor',
            textEncoderStreamConstructor: 'TextEncoderStream constructor',
            textDecoderStreamConstructor: 'TextDecoderStream constructor',

            // DOM parsing
            domParserConstructor: 'DOMParser constructor',
            xmlSerializerConstructor: 'XMLSerializer constructor',
            xpathEvaluatorConstructor: 'XPathEvaluator constructor',

            // Range/Selection
            rangeConstructor: 'Range constructor',
            selectionToString: 'Selection.prototype.toString',

            // Event constructors
            eventConstructor: 'Event constructor',
            customEventConstructor: 'CustomEvent constructor',
            messageEventConstructor: 'MessageEvent constructor',
            errorEventConstructor: 'ErrorEvent constructor',
            focusEventConstructor: 'FocusEvent constructor',
            wheelEventConstructor: 'WheelEvent constructor',
            dragEventConstructor: 'DragEvent constructor',
            clipboardEventConstructor: 'ClipboardEvent constructor',
            compositionEventConstructor: 'CompositionEvent constructor',
            uiEventConstructor: 'UIEvent constructor',
            animationEventConstructor: 'AnimationEvent constructor',
            transitionEventConstructor: 'TransitionEvent constructor',
            popStateEventConstructor: 'PopStateEvent constructor',
            hashChangeEventConstructor: 'HashChangeEvent constructor',
            storageEventConstructor: 'StorageEvent constructor',
            beforeUnloadEventConstructor: 'BeforeUnloadEvent constructor',
            progressEventConstructor: 'ProgressEvent constructor',

            // Element methods
            getBoundingClientRect: 'Element.prototype.getBoundingClientRect - geometry',
            getClientRects: 'Element.prototype.getClientRects - geometry',
            getAttribute: 'Element.prototype.getAttribute',
            setAttribute: 'Element.prototype.setAttribute',
            removeAttribute: 'Element.prototype.removeAttribute',
            hasAttribute: 'Element.prototype.hasAttribute',
            toggleAttribute: 'Element.prototype.toggleAttribute',
            closest: 'Element.prototype.closest - ancestor search',
            matches: 'Element.prototype.matches - selector matching',
            insertAdjacentHTML: 'Element.prototype.insertAdjacentHTML',
            insertAdjacentElement: 'Element.prototype.insertAdjacentElement',
            insertAdjacentText: 'Element.prototype.insertAdjacentText',
            scrollIntoView: 'Element.prototype.scrollIntoView',
            attachShadow: 'Element.prototype.attachShadow - shadow DOM',
            animate: 'Element.prototype.animate - Web Animations',
            focus_element: 'HTMLElement.prototype.focus',
            blur_element: 'HTMLElement.prototype.blur',
            click: 'HTMLElement.prototype.click - synthetic click',

            // Node methods
            cloneNode: 'Node.prototype.cloneNode',
            insertBefore: 'Node.prototype.insertBefore',
            replaceChild: 'Node.prototype.replaceChild',
            contains: 'Node.prototype.contains',
            compareDocumentPosition: 'Node.prototype.compareDocumentPosition',
            normalize: 'Node.prototype.normalize',
            hasChildNodes: 'Node.prototype.hasChildNodes',

            // Document methods
            createTextNode: 'Document.prototype.createTextNode',
            createDocumentFragment: 'Document.prototype.createDocumentFragment',
            createComment: 'Document.prototype.createComment',
            createEvent: 'Document.prototype.createEvent',
            createRange: 'Document.prototype.createRange',
            createTreeWalker: 'Document.prototype.createTreeWalker',
            createNodeIterator: 'Document.prototype.createNodeIterator',
            importNode: 'Document.prototype.importNode',
            adoptNode: 'Document.prototype.adoptNode',
            execCommand: 'Document.prototype.execCommand - deprecated editing',
            getElementsByClassName: 'Document.prototype.getElementsByClassName',
            getElementsByTagName: 'Document.prototype.getElementsByTagName',
            getElementsByName: 'Document.prototype.getElementsByName',
            elementFromPoint: 'Document.prototype.elementFromPoint',
            elementsFromPoint: 'Document.prototype.elementsFromPoint',
            getAnimations: 'Document.prototype.getAnimations',

            // History
            historyPushState: 'History.prototype.pushState - navigation',
            historyReplaceState: 'History.prototype.replaceState - navigation',
            historyBack: 'History.prototype.back',
            historyForward: 'History.prototype.forward',
            historyGo: 'History.prototype.go',

            // Canvas 2D
            canvas2dFillRect: 'CanvasRenderingContext2D.prototype.fillRect',
            canvas2dStrokeRect: 'CanvasRenderingContext2D.prototype.strokeRect',
            canvas2dFillText: 'CanvasRenderingContext2D.prototype.fillText - fingerprinting',
            canvas2dStrokeText: 'CanvasRenderingContext2D.prototype.strokeText',
            canvas2dMeasureText: 'CanvasRenderingContext2D.prototype.measureText - fingerprinting',
            canvas2dDrawImage: 'CanvasRenderingContext2D.prototype.drawImage',
            canvas2dGetImageData: 'CanvasRenderingContext2D.prototype.getImageData - fingerprinting',
            canvas2dPutImageData: 'CanvasRenderingContext2D.prototype.putImageData',
            canvas2dCreateLinearGradient: 'CanvasRenderingContext2D.prototype.createLinearGradient',
            canvas2dCreateRadialGradient: 'CanvasRenderingContext2D.prototype.createRadialGradient',
            canvas2dCreatePattern: 'CanvasRenderingContext2D.prototype.createPattern',
            canvas2dSave: 'CanvasRenderingContext2D.prototype.save',
            canvas2dRestore: 'CanvasRenderingContext2D.prototype.restore',
            canvas2dTransform: 'CanvasRenderingContext2D.prototype.transform',

            // Performance
            performanceMark: 'Performance.prototype.mark',
            performanceMeasure: 'Performance.prototype.measure',
            performanceGetEntries: 'Performance.prototype.getEntries',
            performanceGetEntriesByType: 'Performance.prototype.getEntriesByType',
            performanceGetEntriesByName: 'Performance.prototype.getEntriesByName',
            performanceClearMarks: 'Performance.prototype.clearMarks',
            performanceClearMeasures: 'Performance.prototype.clearMeasures',
            performanceObserverConstructor: 'PerformanceObserver constructor',

            // Broadcast/IDB
            broadcastChannelConstructor: 'BroadcastChannel constructor',
            idbFactoryOpen: 'IDBFactory.prototype.open - IndexedDB',
            idbFactoryDeleteDatabase: 'IDBFactory.prototype.deleteDatabase',

            // Crypto
            subtleCryptoDigest: 'SubtleCrypto.digest - hashing',
            subtleCryptoEncrypt: 'SubtleCrypto.encrypt',
            subtleCryptoDecrypt: 'SubtleCrypto.decrypt',
            subtleCryptoSign: 'SubtleCrypto.sign',
            subtleCryptoVerify: 'SubtleCrypto.verify',
            subtleCryptoGenerateKey: 'SubtleCrypto.generateKey',
            subtleCryptoImportKey: 'SubtleCrypto.importKey',
            subtleCryptoExportKey: 'SubtleCrypto.exportKey',

            // WebAssembly
            webAssemblyInstantiate: 'WebAssembly.instantiate',
            webAssemblyCompile: 'WebAssembly.compile',
            webAssemblyValidate: 'WebAssembly.validate',

            // Intl
            intlDateTimeFormat: 'Intl.DateTimeFormat constructor',
            intlNumberFormat: 'Intl.NumberFormat constructor',
            intlCollator: 'Intl.Collator constructor',
            intlPluralRules: 'Intl.PluralRules constructor',
            intlRelativeTimeFormat: 'Intl.RelativeTimeFormat constructor',
            intlListFormat: 'Intl.ListFormat constructor',

            // Media/Audio
            audioContextConstructor: 'AudioContext constructor - audio fingerprinting',
            offlineAudioContextConstructor: 'OfflineAudioContext constructor',
            mediaStreamConstructor: 'MediaStream constructor',
            mediaRecorderConstructor: 'MediaRecorder constructor',
            speechSynthesis_speak: 'SpeechSynthesis.speak',
            speechSynthesis_getVoices: 'SpeechSynthesis.getVoices - fingerprinting',

            // RTC
            rtcPeerConnectionConstructor: 'RTCPeerConnection constructor - WebRTC',
            rtcSessionDescriptionConstructor: 'RTCSessionDescription constructor',
            rtcIceCandidateConstructor: 'RTCIceCandidate constructor',

            // Image
            imageConstructor: 'Image constructor',
            imageDataConstructor: 'ImageData constructor',
            imageBitmapRenderingContextTransferFromImageBitmap: 'ImageBitmapRenderingContext.transferFromImageBitmap',
            offscreenCanvasConstructor: 'OffscreenCanvas constructor',

            // Animation
            animationConstructor: 'Animation constructor',
            keyframeEffectConstructor: 'KeyframeEffect constructor',

            // CSS/Style
            cssStyleDeclarationSetProperty: 'CSSStyleDeclaration.setProperty',
            cssStyleDeclarationGetPropertyValue: 'CSSStyleDeclaration.getPropertyValue',
            cssStyleDeclarationRemoveProperty: 'CSSStyleDeclaration.removeProperty',

            // Finalization/WeakRef
            finalizationRegistryConstructor: 'FinalizationRegistry constructor',
            weakRefConstructor: 'WeakRef constructor'
        };
        
        return descriptions[key] || `Integrity check for ${key}`;
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
        suspicionScore = Math.min(suspicionScore / 5, 1);

        return {
            totalIndicators,
            riskCounts,
            suspicionScore,
            hasSuspiciousActivity: totalIndicators > 0,
            reasoning: totalIndicators > 0 
                ? `Detected ${totalIndicators} function integrity violations with ${riskCounts.HIGH} high-risk modifications`
                : 'No function integrity violations detected'
        };
    }
}

// Export for backwards compatibility
export { FunctionIntegrityDetector as AIAgentDetector };
