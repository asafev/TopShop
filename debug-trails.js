/**
 * Mouse Trail Debugging Utilities
 * Helper functions to debug and verify trail line positioning
 */

// Enable debug mode for trails
window.debugTrails = {
    enabled: false,
    highlightDots: false,
    highlightLines: false,
    showCoordinates: false,
    
    /**
     * Enable debug mode with visual indicators
     */
    enable() {
        this.enabled = true;
        console.log('🐛 Trail debugging enabled');
        console.log('Use debugTrails.highlightDots() to highlight dots');
        console.log('Use debugTrails.highlightLines() to highlight lines');
        console.log('Use debugTrails.showCoordinates() to display coordinates');
    },
    
    /**
     * Disable debug mode
     */
    disable() {
        this.enabled = false;
        this.removeHighlights();
        console.log('🐛 Trail debugging disabled');
    },
    
    /**
     * Highlight all trail dots with numbers
     */
    highlightDots() {
        if (!window.lab) {
            console.error('Lab instance not found');
            return;
        }
        
        window.lab.mouseTrail.trails.forEach((trail, index) => {
            const element = trail.element;
            if (element) {
                element.style.border = '2px solid red';
                element.style.zIndex = '10000';
                element.title = `Dot ${index}: (${trail.x}, ${trail.y}) -> (${trail.absoluteX}, ${trail.absoluteY})`;
                
                // Add number label
                const label = document.createElement('div');
                label.className = 'debug-trail-label';
                label.textContent = index;
                label.style.position = 'absolute';
                label.style.left = '50%';
                label.style.top = '-20px';
                label.style.transform = 'translateX(-50%)';
                label.style.backgroundColor = 'red';
                label.style.color = 'white';
                label.style.padding = '2px 6px';
                label.style.borderRadius = '3px';
                label.style.fontSize = '10px';
                label.style.fontWeight = 'bold';
                label.style.pointerEvents = 'none';
                label.style.zIndex = '10001';
                element.appendChild(label);
            }
        });
        
        console.log(`✅ Highlighted ${window.lab.mouseTrail.trails.length} dots`);
    },
    
    /**
     * Highlight all trail lines with debugging info
     */
    highlightLines() {
        if (!window.lab) {
            console.error('Lab instance not found');
            return;
        }
        
        window.lab.mouseTrail.lines.forEach((line, index) => {
            const element = line.element;
            if (element) {
                element.style.border = '1px solid blue';
                element.style.backgroundColor = 'rgba(0, 0, 255, 0.5)';
                element.style.opacity = '0.8';
                element.style.zIndex = '9999';
                element.title = `Line ${index}: (${line.x1},${line.y1}) -> (${line.x2},${line.y2})\nLength: ${line.length.toFixed(2)}px, Angle: ${line.angle.toFixed(2)}°`;
                
                // Add info label at start point
                const label = document.createElement('div');
                label.className = 'debug-line-label';
                label.textContent = `L${index}`;
                label.style.position = 'absolute';
                label.style.left = '0px';
                label.style.top = '-15px';
                label.style.backgroundColor = 'blue';
                label.style.color = 'white';
                label.style.padding = '2px 4px';
                label.style.borderRadius = '3px';
                label.style.fontSize = '9px';
                label.style.fontWeight = 'bold';
                label.style.pointerEvents = 'none';
                label.style.zIndex = '10001';
                label.style.whiteSpace = 'nowrap';
                element.appendChild(label);
            }
        });
        
        console.log(`✅ Highlighted ${window.lab.mouseTrail.lines.length} lines`);
    },
    
    /**
     * Show coordinate grid overlay
     */
    showGrid() {
        const grid = document.createElement('div');
        grid.id = 'debug-grid';
        grid.style.position = 'fixed';
        grid.style.top = '0';
        grid.style.left = '0';
        grid.style.width = '100vw';
        grid.style.height = '100vh';
        grid.style.pointerEvents = 'none';
        grid.style.zIndex = '9995';
        grid.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)';
        grid.style.backgroundSize = '50px 50px';
        
        document.body.appendChild(grid);
        console.log('✅ Grid overlay enabled (50px spacing)');
    },
    
    /**
     * Remove all highlights and overlays
     */
    removeHighlights() {
        document.querySelectorAll('.debug-trail-label, .debug-line-label').forEach(el => el.remove());
        const grid = document.getElementById('debug-grid');
        if (grid) grid.remove();
        
        if (window.lab) {
            window.lab.mouseTrail.trails.forEach(trail => {
                if (trail.element) {
                    trail.element.style.border = '';
                    trail.element.title = '';
                }
            });
            
            window.lab.mouseTrail.lines.forEach(line => {
                if (line.element) {
                    line.element.style.border = '';
                    line.element.title = '';
                }
            });
        }
        
        console.log('🧹 Removed all debug highlights');
    },
    
    /**
     * Verify line-to-dot connections
     */
    verifyConnections() {
        if (!window.lab) {
            console.error('Lab instance not found');
            return;
        }
        
        const trails = window.lab.mouseTrail.trails;
        const lines = window.lab.mouseTrail.lines;
        
        console.group('🔍 Connection Verification');
        console.log(`Total dots: ${trails.length}`);
        console.log(`Total lines: ${lines.length}`);
        console.log(`Expected lines: ${Math.max(0, trails.length - 1)}`);
        
        // Check each line connects to the right dots
        let errors = 0;
        lines.forEach((line, index) => {
            if (index < trails.length - 1) {
                const dot1 = trails[index];
                const dot2 = trails[index + 1];
                
                // Verify viewport coordinates match
                const viewport1Match = Math.abs(line.x1 - dot1.x) < 1 && Math.abs(line.y1 - dot1.y) < 1;
                const viewport2Match = Math.abs(line.x2 - dot2.x) < 1 && Math.abs(line.y2 - dot2.y) < 1;
                
                // Verify document coordinates match
                const doc1Match = Math.abs(line.absoluteX1 - dot1.absoluteX) < 1 && Math.abs(line.absoluteY1 - dot1.absoluteY) < 1;
                const doc2Match = Math.abs(line.absoluteX2 - dot2.absoluteX) < 1 && Math.abs(line.absoluteY2 - dot2.absoluteY) < 1;
                
                if (!viewport1Match || !viewport2Match || !doc1Match || !doc2Match) {
                    console.error(`❌ Line ${index} connection mismatch:`);
                    console.log('  Line:', { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 });
                    console.log('  Dot1:', { x: dot1.x, y: dot1.y });
                    console.log('  Dot2:', { x: dot2.x, y: dot2.y });
                    errors++;
                } else {
                    console.log(`✅ Line ${index} connects correctly`);
                }
            }
        });
        
        console.log(`\n${errors === 0 ? '✅' : '❌'} Verification complete: ${errors} errors found`);
        console.groupEnd();
        
        return errors === 0;
    },
    
    /**
     * Test trail creation with known coordinates
     */
    testTrail() {
        if (!window.lab) {
            console.error('Lab instance not found');
            return;
        }
        
        console.log('🧪 Creating test trail...');
        
        // Clear existing trails
        window.lab.clearAllTrails();
        
        // Create a simple test pattern: square
        const testPoints = [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 200, y: 200 },
            { x: 100, y: 200 },
            { x: 100, y: 100 }
        ];
        
        const timestamp = performance.now();
        testPoints.forEach((point, index) => {
            setTimeout(() => {
                window.lab.createTrailPoint(point.x, point.y, timestamp + (index * 100));
                console.log(`Created point ${index}: (${point.x}, ${point.y})`);
                
                if (index === testPoints.length - 1) {
                    console.log('✅ Test trail created (should form a square)');
                    setTimeout(() => {
                        this.highlightDots();
                        this.highlightLines();
                        this.verifyConnections();
                    }, 100);
                }
            }, index * 50);
        });
    },
    
    /**
     * Log current trail state
     */
    logState() {
        if (!window.lab) {
            console.error('Lab instance not found');
            return;
        }
        
        const data = window.lab.getMouseTrailData();
        console.group('📊 Mouse Trail State');
        console.log('Enabled:', data.enabled);
        console.log('Persist:', data.persist);
        console.log('Dots:', data.totalTrails, '/', data.maxTrails);
        console.log('Lines:', data.totalLines, '/', data.maxLines);
        console.log('Sampling:', data.samplingParams);
        console.log('Summary:', data.summary);
        console.groupEnd();
        
        return data;
    }
};

// Auto-attach to window for easy console access
console.log('🐛 Trail debugging utilities loaded');
console.log('Type "debugTrails.enable()" to start debugging');
console.log('Commands: highlightDots(), highlightLines(), verifyConnections(), testTrail(), logState()');
