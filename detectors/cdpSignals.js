/**
 * CDP Signals Detection Module
 * Detects Chrome DevTools Protocol (CDP) automation signals
 * (Puppeteer, Playwright, Comet, etc.)
 */

// ============================================================================
// UTILITIES (unit-free helpers)
// ============================================================================

const now = () => performance.now();

const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const median = (arr) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
};

const mean = (arr) => {
    if (!arr.length) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));

const safeOrigin = (url) => {
    try {
        return new URL(url).origin;
    } catch {
        return '';
    }
};

// ============================================================================
// CDP SIGNALS DETECTOR
// ============================================================================

export function initCdpSignals({ report, bus }) {
    // State tracking
    const state = {
        pointerMoves: [],       // {t, x, y}
        clicks: [],             // {t, x, y, target, isTrusted}
        wheels: [],             // {t, deltaY, deltaX}
        keys: [],               // {t, type}
        focusChanges: [],       // {t, hasPointerBefore, hasKeyBefore}
        lastPointer: null,
        lastKey: null,
        listeners: []
    };

    // Metrics accumulator
    const metrics = {
        noMoveBeforeClickRatio: 0,
        hoverDwellAvgMs: 0,
        pointerJitterPxAvg: 0,
        clickCenterBias: 0,
        identicalClickCoordsPct: 0,
        scrollCadencePxPerMs: 0,
        scrollSmoothnessPct: 0,
        focusJumpWithoutMousePct: 0,
        isTrustedClickPct: 0,
        extFrames: 0,
        weakHints: {
            webdriver: false,
            pluginsZero: false,
            languagesSuspicious: false
        }
    };

    // ========================================================================
    // EVENT HANDLERS
    // ========================================================================

    const onPointerMove = (e) => {
        const pt = { t: now(), x: e.clientX, y: e.clientY };
        state.pointerMoves.push(pt);
        state.lastPointer = pt;

        // Keep only last 5 seconds
        const cutoff = pt.t - 5000;
        state.pointerMoves = state.pointerMoves.filter(p => p.t > cutoff);
    };

    const onMouseDown = (e) => {
        // Track for click analysis
    };

    const onMouseUp = (e) => {
        // Track for click analysis
    };

    const onClick = (e) => {
        const clickTime = now();
        const target = e.target;
        const rect = target.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        state.clicks.push({
            t: clickTime,
            x: e.clientX,
            y: e.clientY,
            centerX,
            centerY,
            target,
            isTrusted: e.isTrusted,
            rect: { w: rect.width, h: rect.height }
        });

        // Keep only last 100 clicks
        if (state.clicks.length > 100) {
            state.clicks.shift();
        }
    };

    const onKeyDown = (e) => {
        const keyTime = now();
        state.keys.push({ t: keyTime, type: 'keydown' });
        state.lastKey = keyTime;

        // Keep only last 5 seconds
        const cutoff = keyTime - 5000;
        state.keys = state.keys.filter(k => k.t > cutoff);
    };

    const onWheel = (e) => {
        const wheelTime = now();
        state.wheels.push({
            t: wheelTime,
            deltaY: e.deltaY,
            deltaX: e.deltaX
        });

        // Keep only last 5 seconds
        const cutoff = wheelTime - 5000;
        state.wheels = state.wheels.filter(w => w.t > cutoff);
    };

    const onFocusIn = (e) => {
        const focusTime = now();
        
        // Check if there was pointer/key activity in last 300ms
        const hasPointerBefore = state.lastPointer && (focusTime - state.lastPointer.t) < 300;
        const hasKeyBefore = state.lastKey && (focusTime - state.lastKey) < 300;

        state.focusChanges.push({
            t: focusTime,
            hasPointerBefore,
            hasKeyBefore
        });

        // Keep only last 50 focus changes
        if (state.focusChanges.length > 50) {
            state.focusChanges.shift();
        }
    };

    const onVisibilityChange = () => {
        // Track visibility changes (could indicate automation)
    };

    // ========================================================================
    // METRIC COMPUTATION
    // ========================================================================

    const computeMetrics = () => {
        // 1. noMoveBeforeClickRatio
        let noMoveCount = 0;
        state.clicks.forEach(click => {
            const recentMoves = state.pointerMoves.filter(p => 
                p.t >= click.t - 250 && p.t < click.t
            );
            
            if (recentMoves.length < 2) {
                noMoveCount++;
            } else {
                // Check if movement is < 12px total
                let totalDist = 0;
                for (let i = 1; i < recentMoves.length; i++) {
                    totalDist += dist(recentMoves[i - 1], recentMoves[i]);
                }
                if (totalDist < 12) {
                    noMoveCount++;
                }
            }
        });
        metrics.noMoveBeforeClickRatio = state.clicks.length > 0 
            ? noMoveCount / state.clicks.length 
            : 0;

        // 2. hoverDwellAvgMs
        const dwellTimes = [];
        state.clicks.forEach(click => {
            const hoverStart = state.pointerMoves.find(p => {
                const dx = Math.abs(p.x - click.centerX);
                const dy = Math.abs(p.y - click.centerY);
                return dx < click.rect.w / 2 && dy < click.rect.h / 2;
            });
            
            if (hoverStart) {
                dwellTimes.push(click.t - hoverStart.t);
            }
        });
        metrics.hoverDwellAvgMs = mean(dwellTimes);

        // 3. pointerJitterPxAvg
        const jitters = [];
        for (let i = 1; i < state.pointerMoves.length; i++) {
            const d = dist(state.pointerMoves[i - 1], state.pointerMoves[i]);
            jitters.push(d);
        }
        if (jitters.length > 1) {
            const jitterMean = mean(jitters);
            const variance = jitters.map(j => Math.abs(j - jitterMean));
            metrics.pointerJitterPxAvg = mean(variance);
        } else {
            metrics.pointerJitterPxAvg = 0;
        }

        // 4. clickCenterBias
        const centerDists = state.clicks.map(click => {
            const dx = click.x - click.centerX;
            const dy = click.y - click.centerY;
            return Math.sqrt(dx * dx + dy * dy);
        });
        metrics.clickCenterBias = median(centerDists);

        // 5. identicalClickCoordsPct
        const coordMap = {};
        state.clicks.forEach(click => {
            const key = `${Math.round(click.x)},${Math.round(click.y)}`;
            coordMap[key] = (coordMap[key] || 0) + 1;
        });
        const duplicates = Object.values(coordMap).filter(count => count > 1);
        const duplicateClicks = duplicates.reduce((sum, count) => sum + count, 0);
        metrics.identicalClickCoordsPct = state.clicks.length > 0
            ? (duplicateClicks / state.clicks.length) * 100
            : 0;

        // 6. scrollCadencePxPerMs & scrollSmoothnessPct
        if (state.wheels.length > 1) {
            const scrollDeltas = [];
            const scrollIntervals = [];
            
            for (let i = 1; i < state.wheels.length; i++) {
                const deltaTime = state.wheels[i].t - state.wheels[i - 1].t;
                const deltaScroll = Math.abs(state.wheels[i].deltaY);
                
                if (deltaTime > 0) {
                    scrollDeltas.push(deltaScroll);
                    scrollIntervals.push(deltaTime);
                }
            }
            
            const totalScroll = scrollDeltas.reduce((a, b) => a + b, 0);
            const totalTime = scrollIntervals.reduce((a, b) => a + b, 0);
            metrics.scrollCadencePxPerMs = totalTime > 0 ? totalScroll / totalTime : 0;
            
            // Smoothness = low variance in delta values
            const avgDelta = mean(scrollDeltas);
            if (avgDelta > 0) {
                const variance = scrollDeltas.map(d => Math.abs(d - avgDelta) / avgDelta);
                const avgVariance = mean(variance);
                metrics.scrollSmoothnessPct = Math.max(0, (1 - avgVariance) * 100);
            } else {
                metrics.scrollSmoothnessPct = 0;
            }
        }

        // 7. focusJumpWithoutMousePct
        const jumpsWithoutInput = state.focusChanges.filter(
            fc => !fc.hasPointerBefore && !fc.hasKeyBefore
        ).length;
        metrics.focusJumpWithoutMousePct = state.focusChanges.length > 0
            ? (jumpsWithoutInput / state.focusChanges.length) * 100
            : 0;

        // 8. isTrustedClickPct
        const trustedClicks = state.clicks.filter(c => c.isTrusted).length;
        metrics.isTrustedClickPct = state.clicks.length > 0
            ? (trustedClicks / state.clicks.length) * 100
            : 100; // Assume trusted if no data

        // 9. extFrames
        metrics.extFrames = 0;
        try {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                const src = iframe.src || '';
                if (safeOrigin(src).startsWith('chrome-extension://')) {
                    metrics.extFrames++;
                }
            });
        } catch (e) {
            // Ignore errors
        }

        // 10. weakHints
        metrics.weakHints.webdriver = !!navigator.webdriver;
        metrics.weakHints.pluginsZero = navigator.plugins.length === 0;
        
        const langs = navigator.languages || [];
        metrics.weakHints.languagesSuspicious = 
            langs.length === 0 || 
            (langs.length === 1 && langs[0] === 'en-US');
    };

    // ========================================================================
    // SCORING FUNCTION
    // ========================================================================

    const computeCdpLikelihood = () => {
        computeMetrics(); // Update metrics first

        const σ = (condition, value = null) => {
            if (typeof condition === 'boolean') {
                return condition ? 1 : 0;
            }
            // For numeric conditions, return the value normalized
            return value !== null ? clamp01(value) : 0;
        };

        const score = 
            0.25 * σ(true, metrics.noMoveBeforeClickRatio) +
            0.15 * σ(metrics.hoverDwellAvgMs < 120, metrics.hoverDwellAvgMs < 120 ? 1 : 0) +
            0.15 * σ(metrics.pointerJitterPxAvg < 2.5, metrics.pointerJitterPxAvg < 2.5 ? 1 : 0) +
            0.10 * σ(metrics.identicalClickCoordsPct > 10, metrics.identicalClickCoordsPct > 10 ? metrics.identicalClickCoordsPct / 100 : 0) +
            0.10 * σ(
                metrics.scrollSmoothnessPct > 70 && 
                metrics.scrollCadencePxPerMs >= 50 && 
                metrics.scrollCadencePxPerMs <= 400,
                (metrics.scrollSmoothnessPct > 70 && 
                 metrics.scrollCadencePxPerMs >= 50 && 
                 metrics.scrollCadencePxPerMs <= 400) ? 1 : 0
            ) +
            0.10 * σ(metrics.focusJumpWithoutMousePct > 20, metrics.focusJumpWithoutMousePct > 20 ? metrics.focusJumpWithoutMousePct / 100 : 0) +
            0.05 * σ(metrics.clickCenterBias < 6, metrics.clickCenterBias < 6 ? 1 : 0) +
            0.05 * σ(metrics.extFrames > 0, metrics.extFrames > 0 ? 1 : 0) +
            0.05 * σ(
                metrics.weakHints.webdriver || 
                metrics.weakHints.pluginsZero || 
                metrics.weakHints.languagesSuspicious,
                (metrics.weakHints.webdriver || 
                 metrics.weakHints.pluginsZero || 
                 metrics.weakHints.languagesSuspicious) ? 1 : 0
            );

        return clamp01(score) * 100;
    };

    // ========================================================================
    // INSTALL LISTENERS
    // ========================================================================

    const installListeners = () => {
        const listeners = [
            ['pointermove', onPointerMove, { passive: true }],
            ['mousedown', onMouseDown, { passive: true }],
            ['mouseup', onMouseUp, { passive: true }],
            ['click', onClick, { passive: true }],
            ['keydown', onKeyDown, { passive: true }],
            ['wheel', onWheel, { passive: true }],
            ['focusin', onFocusIn, { passive: true }]
        ];

        listeners.forEach(([event, handler, opts]) => {
            document.addEventListener(event, handler, opts);
            state.listeners.push({ event, handler, opts });
        });

        document.addEventListener('visibilitychange', onVisibilityChange);
        state.listeners.push({ 
            event: 'visibilitychange', 
            handler: onVisibilityChange, 
            opts: undefined 
        });

        console.log('🔍 CDP signals detector active');
    };

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    const snapshot = () => {
        const cdpLikelihood = computeCdpLikelihood();
        
        return {
            cdpLikelihood,
            noMoveBeforeClickRatio: metrics.noMoveBeforeClickRatio,
            hoverDwellAvgMs: metrics.hoverDwellAvgMs,
            pointerJitterPxAvg: metrics.pointerJitterPxAvg,
            clickCenterBias: metrics.clickCenterBias,
            identicalClickCoordsPct: metrics.identicalClickCoordsPct,
            scrollCadencePxPerMs: metrics.scrollCadencePxPerMs,
            scrollSmoothnessPct: metrics.scrollSmoothnessPct,
            focusJumpWithoutMousePct: metrics.focusJumpWithoutMousePct,
            isTrustedClickPct: metrics.isTrustedClickPct,
            extFrames: metrics.extFrames,
            weakHints: { ...metrics.weakHints }
        };
    };

    const stop = () => {
        state.listeners.forEach(({ event, handler }) => {
            document.removeEventListener(event, handler);
        });
        state.listeners = [];
        console.log('🛑 CDP signals detector stopped');
    };

    // Push metrics into report
    const pushToReport = () => {
        if (!report || !report.metrics) {
            report.metrics = {};
        }
        
        report.metrics.cdp = snapshot();
        console.log('📊 CDP metrics pushed to report:', report.metrics.cdp);
    };

    // Install listeners immediately
    installListeners();

    // Subscribe to bus events if available
    if (bus && typeof bus.on === 'function') {
        bus.on('test:complete', pushToReport);
        bus.on('report:generate', pushToReport);
    }

    // Return public API
    return {
        stop,
        snapshot,
        pushToReport
    };
}
