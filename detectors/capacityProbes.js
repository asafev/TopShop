/**
 * Capacity and realm-coverage witnesses (device record key `cap`, its own version `rv`).
 *
 * The rest of the record reads what the browser reports. These measure what the machine does with fixed work, and
 * read the same facts from one more realm (a shared worker). Raw values only; every step is bounded in time and a
 * failure leaves a code, never an exception.
 *
 *   cap.rv    1
 *   cap.cpu   best of 3 runs of a fixed scalar loop, ms
 *   cap.fill  { ms, n, f }: WebGL2 fragment fill of a 512x512 target with a 64-step loop shader: best ms per draw over
 *             3 batches of n draws (each batch ends in a 1-pixel read-back), f = the first draw incl. shader compile
 *   cap.par   { hc, w, one, all }: counted busy-loop rounds of 1 worker, then of w workers together, 150 ms each
 *             (w = navigator.hardwareConcurrency capped at 16; workers start and answer before the timed window)
 *   cap.sw    { plat, hc, dm, lang, tz, gpu, glr, glvp, glve } read inside a shared worker
 *   cap.own   the same keys read in this window
 *   cap.ext   { n, miss, c, an }: advertised WebGL2 extensions, the ones getExtension refused, one 4x4 block upload
 *             per compressed format (format:glError, '-' not advertised), anisotropy claimed/applied/glError
 *   cap.mq    media-feature bits, in the order of MQ below
 *   codes     '-' API missing, 'u' could not run, 'x' threw, 't' not finished in time
 */

const MQ = ['(color-gamut: p3)', '(color-gamut: rec2020)', '(dynamic-range: high)', '(any-pointer: coarse)', '(any-hover: hover)',
            '(prefers-reduced-motion: reduce)', '(forced-colors: active)', '(inverted-colors: inverted)', '(update: fast)'];

const _nm = e => (e && e.name) || 'x';
const _wait = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('t'), Math.max(0, ms)))]);

function _cpu() {
  let best = Infinity, x = 0;
  for (let k = 0; k < 3; k++) {
    const t = performance.now();
    for (let i = 0; i < 5e5; i++) x += Math.sin(i * 0.001) * Math.cos(x * 1e-6);
    best = Math.min(best, performance.now() - t);
  }
  return x === 42 ? 'u' : +best.toFixed(2);
}

function _fill() {
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const gl = c.getContext('webgl2', { antialias: false, depth: false, stencil: false });
  if (!gl) return '-';
  try {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 v=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(v*2.-1.,0.,1.);}'));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;uniform float u;out vec4 o;void main(){vec2 q=gl_FragCoord.xy*0.01+u;float a=0.;for(int i=0;i<64;i++){a+=sin(q.x*float(i)+a)*cos(q.y-a);}o=vec4(a,a*.5,0.,1.);}'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return 'u';
    gl.useProgram(p);
    const S = 512, tex = gl.createTexture(), fb = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, S, S);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, S, S);
    const px = new Uint8Array(4), u = gl.getUniformLocation(p, 'u');
    const draw = n => { for (let i = 0; i < n; i++) { gl.uniform1f(u, i * 0.37); gl.drawArrays(gl.TRIANGLES, 0, 3); } gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    let t = performance.now(); draw(1); const f = performance.now() - t;
    t = performance.now(); draw(1); const one = performance.now() - t;
    const n = Math.max(1, Math.min(32, Math.floor(40 / Math.max(one, 0.05))));         // about 40 ms per batch
    let best = Infinity;
    for (let k = 0; k < 3; k++) { t = performance.now(); draw(n); best = Math.min(best, (performance.now() - t) / n); }
    return { ms: +best.toFixed(3), n, f: +f.toFixed(1) };
  } catch (e) { return 'x'; } finally {
    const l = gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
  }
}

async function _par(capMs) {
  if (typeof Worker !== 'function') return '-';
  const hc = navigator.hardwareConcurrency | 0, w = Math.max(1, Math.min(hc, 16)), MS = 150;
  const src = 'onmessage=e=>{if(e.data===0){postMessage(0);return;}const end=performance.now()+e.data;let n=0,x=1;' +
              'while(performance.now()<end){for(let i=0;i<20000;i++){x=(x*1103515245+12345)|0;}n++;}postMessage(n+(x===7?1:0));};';
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const ws = [];
  try {
    for (let i = 0; i < w; i++) ws.push(new Worker(url));
    const ask = (k, v) => Promise.all(ws.slice(0, k).map(x => new Promise(r => { x.onmessage = e => r(e.data); x.postMessage(v); })));
    const t0 = performance.now();
    if (await _wait(ask(w, 0), capMs) === 't') return 't';
    const one = await _wait(ask(1, MS), capMs - (performance.now() - t0));
    if (one === 't') return 't';
    const all = await _wait(ask(w, MS), capMs - (performance.now() - t0));
    if (all === 't') return 't';
    return { hc, w, one: one[0], all: all.reduce((a, b) => a + b, 0) };
  } catch (e) { return 'x'; } finally { ws.forEach(x => x.terminate()); URL.revokeObjectURL(url); }
}

// Read in the window, and serialised (Function.prototype.toString) into the shared worker: the same code in both realms.
async function _facts() {
  const o = {};
  try {
    o.plat = navigator.platform; o.hc = navigator.hardwareConcurrency; o.dm = navigator.deviceMemory;
    o.lang = navigator.languages && navigator.languages.join(','); o.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (x) { o.plat = 'x'; }
  try {
    if (navigator.gpu) {
      const a = await navigator.gpu.requestAdapter();
      o.gpu = a ? [a.info.vendor, a.info.architecture, a.info.subgroupMinSize, a.info.subgroupMaxSize].join('/') : 'n';
    } else o.gpu = '-';
  } catch (x) { o.gpu = 'x'; }
  try {
    const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    const g = c.getContext('webgl');
    if (g) {
      const d = g.getExtension('WEBGL_debug_renderer_info');
      o.glr = d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '-';
      o.glvp = Array.from(g.getParameter(g.MAX_VIEWPORT_DIMS)).join('x');
      g.viewport(0, 0, 1e5, 1e5); o.glve = Array.from(g.getParameter(g.VIEWPORT)).slice(2).join('x');
      const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
    } else o.glr = 'u';
  } catch (x) { o.glr = 'x'; }
  return o;
}

async function _realms(capMs) {
  const own = await _wait(_facts(), capMs);
  if (typeof SharedWorker !== 'function') return { sw: '-', own };
  const src = 'const _facts=' + _facts.toString() + ';onconnect=async e=>{const p=e.ports[0];p.postMessage(await _facts());};';
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  try {
    const w = new SharedWorker(url);
    const sw = await _wait(new Promise(r => { w.port.onmessage = e => r(e.data); w.port.start(); }), capMs);
    try { w.port.close(); } catch (e) { /* closed already */ }
    return { sw, own };
  } catch (e) { return { sw: _nm(e) === 'SecurityError' ? 'u' : 'x', own }; } finally { URL.revokeObjectURL(url); }
}

function _ext() {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return '-';
  try {
    const sup = gl.getSupportedExtensions() || [];
    const out = { n: sup.length, miss: sup.filter(x => !gl.getExtension(x)).join(',') };
    const fmts = [['WEBGL_compressed_texture_s3tc', 'COMPRESSED_RGBA_S3TC_DXT1_EXT', 8, 's3tc'], ['EXT_texture_compression_bptc', 'COMPRESSED_RGBA_BPTC_UNORM_EXT', 16, 'bptc'],
                  ['EXT_texture_compression_rgtc', 'COMPRESSED_RED_RGTC1_EXT', 8, 'rgtc'], ['WEBGL_compressed_texture_etc', 'COMPRESSED_RGBA8_ETC2_EAC', 16, 'etc'],
                  ['WEBGL_compressed_texture_astc', 'COMPRESSED_RGBA_ASTC_4x4_KHR', 16, 'astc']];
    out.c = fmts.map(([name, f, bytes, k]) => {
      if (!sup.includes(name)) return k + ':-';
      const e = gl.getExtension(name); if (!e) return k + ':n';
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.getError();
      gl.compressedTexImage2D(gl.TEXTURE_2D, 0, e[f], 4, 4, 0, new Uint8Array(bytes));
      const r = gl.getError(); gl.deleteTexture(t); return k + ':' + r;
    }).join(' ');
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    if (an) {
      const m = gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT), t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, m);
      out.an = m + '/' + gl.getTexParameter(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT) + '/' + gl.getError(); gl.deleteTexture(t);
    } else out.an = '-';
    return out;
  } catch (e) { return 'x'; } finally {
    const l = gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
  }
}

/** Runs on an idle page (call it after the other probes). `budgetMs` bounds the asynchronous parts. */
export async function collectCapacity(budgetMs = 3000) {
  const cap = { rv: 1 }, t0 = performance.now(), left = () => Math.max(0, budgetMs - (performance.now() - t0));
  try { cap.cpu = _cpu(); } catch (e) { cap.cpu = 'x'; }
  try { cap.fill = _fill(); } catch (e) { cap.fill = 'x'; }
  try { cap.ext = _ext(); } catch (e) { cap.ext = 'x'; }
  try { cap.mq = typeof matchMedia === 'function' ? MQ.map(q => matchMedia(q).matches ? 1 : 0).join('') : '-'; } catch (e) { cap.mq = 'x'; }
  try { cap.par = await _par(Math.min(1500, left())); } catch (e) { cap.par = 'x'; }
  try { const r = await _realms(Math.min(2000, left())); cap.sw = r.sw; cap.own = r.own; } catch (e) { cap.sw = 'x'; }
  return cap;
}
