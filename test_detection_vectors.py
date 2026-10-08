#!/usr/bin/env python3

import asyncio
import json
from playwright.async_api import async_playwright

async def test_detection_vectors():
    """Test all 6 detection vectors on the Copilot browser"""
    
    async with async_playwright() as p:
        try:
            browser = await p.chromium.connect_over_cdp('http://localhost:9222')
            page = browser.contexts[0].pages[0]  # Use the first page
            
            print(f"Connected to page: {await page.url()}")
            
            # Navigate to copilot-detector page if needed
            current_url = await page.url()
            if 'copilot-detector.html' not in current_url:
                await page.goto('http://localhost:8000/copilot-detector.html')
                print(f"Navigated to: {await page.url()}")
            
            result = await page.evaluate('''async () => {
                const results = {};
                
                // === 1. WebGL in Sandboxed iFrame ===
                try {
                    const iframe = document.createElement('iframe');
                    iframe.sandbox = 'allow-scripts';
                    iframe.style.display = 'none';
                    document.body.appendChild(iframe);
                    
                    const iframeDoc = iframe.contentWindow.document;
                    iframeDoc.write('<script>' +
                        'parent.postMessage({' +
                        'type: "webgl_test",' +
                        'webglSupported: !!window.WebGLRenderingContext,' +
                        'canvas: (() => {' +
                        'try {' +
                        'const canvas = document.createElement("canvas");' +
                        'const gl = canvas.getContext("webgl");' +
                        'if (!gl) return { error: "No WebGL context" };' +
                        'const vendor = gl.getParameter(gl.VENDOR);' +
                        'const renderer = gl.getParameter(gl.RENDERER);' +
                        'return { vendor, renderer, success: true };' +
                        '} catch(e) {' +
                        'return { error: e.message };' +
                        '}' +
                        '})()' +
                        '}, "*");' +
                        '</script>');
                    iframeDoc.close();
                    
                    // Wait for iframe result
                    const webglResult = await new Promise(resolve => {
                        const handler = (e) => {
                            if (e.data && e.data.type === 'webgl_test') {
                                window.removeEventListener('message', handler);
                                resolve(e.data);
                            }
                        };
                        window.addEventListener('message', handler);
                        setTimeout(() => resolve({ timeout: true }), 2000);
                    });
                    
                    document.body.removeChild(iframe);
                    results.webglSandboxedIframe = webglResult;
                } catch(e) {
                    results.webglSandboxedIframe = { error: e.message };
                }
                
                // === 2. ServiceWorker Registration ===
                try {
                    results.serviceWorker = {
                        available: 'serviceWorker' in navigator,
                        ready: navigator.serviceWorker ? !!navigator.serviceWorker.ready : false
                    };
                    
                    if (navigator.serviceWorker) {
                        try {
                            const registration = await navigator.serviceWorker.register(
                                'data:text/javascript;base64,' + btoa('// Empty SW'), 
                                { scope: './' }
                            );
                            results.serviceWorker.registrationSuccess = true;
                            results.serviceWorker.scope = registration.scope;
                            await registration.unregister();
                        } catch(e) {
                            results.serviceWorker.registrationError = e.message;
                            results.serviceWorker.registrationSuccess = false;
                        }
                    }
                } catch(e) {
                    results.serviceWorker = { error: e.message };
                }
                
                // === 3. SharedWorker Availability ===
                try {
                    results.sharedWorker = {
                        constructorExists: typeof SharedWorker !== 'undefined'
                    };
                    
                    if (typeof SharedWorker !== 'undefined') {
                        try {
                            const worker = new SharedWorker(
                                'data:text/javascript;base64,' + btoa('// Empty shared worker')
                            );
                            results.sharedWorker.constructionSuccess = true;
                            results.sharedWorker.port = !!worker.port;
                            worker.port.close();
                        } catch(e) {
                            results.sharedWorker.constructionError = e.message;
                            results.sharedWorker.constructionSuccess = false;
                        }
                    }
                } catch(e) {
                    results.sharedWorker = { error: e.message };
                }
                
                // === 4. WebRTC ICE Candidates ===
                try {
                    const pc = new RTCPeerConnection({
                        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                    });
                    
                    const candidates = [];
                    const iceCandidatePromise = new Promise(resolve => {
                        pc.onicecandidate = (event) => {
                            if (event.candidate) {
                                candidates.push({
                                    type: event.candidate.type,
                                    protocol: event.candidate.protocol,
                                    address: event.candidate.address,
                                    port: event.candidate.port
                                });
                            } else {
                                resolve();
                            }
                        };
                        setTimeout(resolve, 3000); // 3 second timeout
                    });
                    
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    await iceCandidatePromise;
                    
                    pc.close();
                    
                    results.webrtc = {
                        offerCreated: true,
                        candidateCount: candidates.length,
                        candidates: candidates.slice(0, 3), // First 3 candidates
                        candidateTypes: [...new Set(candidates.map(c => c.type))]
                    };
                } catch(e) {
                    results.webrtc = { error: e.message };
                }
                
                // === 5. Performance Resource Entries ===
                try {
                    const resourceEntries = performance.getEntriesByType('resource');
                    results.performanceResources = {
                        count: resourceEntries.length,
                        types: [...new Set(resourceEntries.map(e => e.initiatorType))],
                        domains: [...new Set(resourceEntries.map(e => new URL(e.name).hostname))],
                        firstEntry: resourceEntries[0] ? {
                            name: resourceEntries[0].name,
                            type: resourceEntries[0].initiatorType,
                            duration: resourceEntries[0].duration
                        } : null
                    };
                } catch(e) {
                    results.performanceResources = { error: e.message };
                }
                
                // === 6. Credential Management API ===
                try {
                    results.credentials = {
                        available: 'credentials' in navigator,
                        publicKeyExists: 'PublicKeyCredential' in window
                    };
                    
                    if (navigator.credentials) {
                        try {
                            // Test conditional mediation availability
                            if (window.PublicKeyCredential && PublicKeyCredential.isConditionalMediationAvailable) {
                                results.credentials.conditionalMediationAvailable = 
                                    await PublicKeyCredential.isConditionalMediationAvailable();
                            }
                            
                            // Test get() with minimal options - this will likely fail but gives us info
                            const getResult = await navigator.credentials.get({
                                publicKey: {
                                    challenge: new Uint8Array(32),
                                    timeout: 1000,
                                    userVerification: 'discouraged'
                                }
                            }).catch(e => ({ error: e.name, message: e.message }));
                            
                            results.credentials.getResult = getResult;
                        } catch(e) {
                            results.credentials.testError = e.message;
                        }
                    }
                } catch(e) {
                    results.credentials = { error: e.message };
                }
                
                return results;
            }''')
            
            print("=== COPILOT DETECTION VECTOR TEST RESULTS ===")
            print(json.dumps(result, indent=2, default=str))
            
            await browser.close()
            return result
            
        except Exception as e:
            print(f"Error connecting to browser: {e}")
            return None

if __name__ == '__main__':
    asyncio.run(test_detection_vectors())