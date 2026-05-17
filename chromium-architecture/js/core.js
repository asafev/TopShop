/**
 * Chromium Architecture Deep Dive — Core JavaScript
 * Handles navigation, onion layer switching, labs, and interactive diagrams
 */

// ========================
// Onion Layer System
// ========================
const OnionLayers = {
  currentDepth: 0,
  maxDepth: 4,
  
  init() {
    document.querySelectorAll('.depth-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const depth = parseInt(btn.dataset.depth);
        this.setDepth(depth);
      });
    });
    // Show layer 0 by default
    this.setDepth(0);
  },

  setDepth(depth) {
    this.currentDepth = depth;
    
    // Update buttons
    document.querySelectorAll('.depth-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.depth) === depth);
    });
    
    // Show all layers up to and including current depth
    document.querySelectorAll('.onion-layer').forEach(layer => {
      const layerDepth = parseInt(layer.dataset.depth);
      layer.classList.toggle('visible', layerDepth <= depth);
    });
    
    // Save to localStorage
    const moduleId = document.body.dataset.module;
    if (moduleId) {
      localStorage.setItem(`chromium-depth-${moduleId}`, depth);
    }
  },

  restore() {
    const moduleId = document.body.dataset.module;
    if (moduleId) {
      const saved = localStorage.getItem(`chromium-depth-${moduleId}`);
      if (saved !== null) {
        this.setDepth(parseInt(saved));
      }
    }
  }
};

// ========================
// Progress Tracking
// ========================
const Progress = {
  storageKey: 'chromium-arch-progress',
  
  getVisited() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    } catch { return []; }
  },
  
  markVisited(moduleId) {
    const visited = this.getVisited();
    if (!visited.includes(moduleId)) {
      visited.push(moduleId);
      localStorage.setItem(this.storageKey, JSON.stringify(visited));
    }
    this.updateUI();
  },
  
  updateUI() {
    const visited = this.getVisited();
    const total = document.querySelectorAll('.sidebar-nav a[data-module]').length;
    
    // Update sidebar items
    document.querySelectorAll('.sidebar-nav a[data-module]').forEach(link => {
      const mid = link.dataset.module;
      if (visited.includes(mid)) {
        link.classList.add('visited');
      }
    });
    
    // Update progress bar
    const progressFill = document.querySelector('.progress-fill');
    if (progressFill && total > 0) {
      progressFill.style.width = `${(visited.length / total) * 100}%`;
    }
  }
};

// ========================
// Lab System
// ========================
const Lab = {
  run(labId) {
    const lab = document.getElementById(labId);
    if (!lab) return;
    
    const codeArea = lab.querySelector('.lab-code-area');
    const output = lab.querySelector('.lab-output');
    
    if (!codeArea || !output) return;
    
    output.textContent = '';
    
    // Create a safe console.log replacement
    const logs = [];
    const safeConsole = {
      log: (...args) => logs.push(args.map(a => 
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ')),
      error: (...args) => logs.push('ERROR: ' + args.join(' ')),
      warn: (...args) => logs.push('WARN: ' + args.join(' ')),
      info: (...args) => logs.push('INFO: ' + args.join(' ')),
      table: (data) => {
        if (Array.isArray(data)) {
          logs.push(data.map((row, i) => `[${i}] ${JSON.stringify(row)}`).join('\n'));
        } else {
          logs.push(JSON.stringify(data, null, 2));
        }
      }
    };
    
    try {
      const code = codeArea.value || codeArea.textContent;
      const fn = new Function('console', code);
      fn(safeConsole);
      output.textContent = logs.join('\n') || '(no output)';
      output.style.color = 'var(--success)';
    } catch (e) {
      output.textContent = `Error: ${e.message}`;
      output.style.color = 'var(--danger)';
    }
  },
  
  runAsync(labId) {
    const lab = document.getElementById(labId);
    if (!lab) return;
    
    const codeArea = lab.querySelector('.lab-code-area');
    const output = lab.querySelector('.lab-output');
    
    if (!codeArea || !output) return;
    
    output.textContent = 'Running...';
    
    const logs = [];
    const safeConsole = {
      log: (...args) => {
        logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
        output.textContent = logs.join('\n');
      },
      error: (...args) => {
        logs.push('ERROR: ' + args.join(' '));
        output.textContent = logs.join('\n');
      }
    };
    
    try {
      const code = codeArea.value || codeArea.textContent;
      const fn = new Function('console', `return (async () => { ${code} })()`);
      fn(safeConsole).then(() => {
        if (logs.length === 0) output.textContent = '(no output)';
      }).catch(e => {
        output.textContent = logs.join('\n') + '\nError: ' + e.message;
        output.style.color = 'var(--danger)';
      });
    } catch (e) {
      output.textContent = `Error: ${e.message}`;
      output.style.color = 'var(--danger)';
    }
  }
};

// ========================
// Scroll Reveal
// ========================
const ScrollReveal = {
  init() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }
};

// ========================
// Keyboard Navigation
// ========================
const KeyNav = {
  init() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      
      if (e.key === 'ArrowLeft') {
        const prev = document.querySelector('.module-nav .nav-prev');
        if (prev) prev.click();
      } else if (e.key === 'ArrowRight') {
        const next = document.querySelector('.module-nav .nav-next');
        if (next) next.click();
      } else if (e.key >= '0' && e.key <= '4') {
        OnionLayers.setDepth(parseInt(e.key));
      }
    });
  }
};

// ========================
// Sidebar Toggle (responsive)
// ========================
const Sidebar = {
  init() {
    const toggle = document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (toggle && sidebar) {
      toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    }
  }
};

// ========================
// Process Diagram Interactivity
// ========================
const DiagramInteraction = {
  init() {
    document.querySelectorAll('.process-box[data-detail]').forEach(box => {
      box.addEventListener('click', () => {
        const detailId = box.dataset.detail;
        const detail = document.getElementById(detailId);
        if (detail) {
          detail.open = !detail.open;
          detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  }
};

// ========================
// Initialize Everything
// ========================
document.addEventListener('DOMContentLoaded', () => {
  OnionLayers.init();
  OnionLayers.restore();
  Progress.updateUI();
  ScrollReveal.init();
  KeyNav.init();
  Sidebar.init();
  DiagramInteraction.init();
  
  // Mark current module as visited
  const moduleId = document.body.dataset.module;
  if (moduleId) {
    Progress.markVisited(moduleId);
  }
});
