/**
 * System-integration witnesses (device record key `sys`, its own version `rv`).
 *
 * Facts a browser build takes from the operating system it was compiled for, or from the machine it runs on, read
 * through ordinary page APIs: font-family alias resolution, CSS system colours, the audio service's buffer arithmetic,
 * the platform audio encoder, the video decode paths, the keyboard layout, English hyphenation, and CPU behaviour seen
 * through WebAssembly. Raw values only. Every step is silent (no permission, no prompt, no sound, nothing visible), is
 * bounded in time, cleans up after itself, and leaves a code on failure.
 *
 *   sys.rv    1
 *   sys.ff    computed font-family of hidden elements styled 'BlinkMacSystemFont, serif' and '-apple-system, serif'
 *   sys.sc    computed colours of Highlight, HighlightText, ButtonFace, LinkText, GrayText, Canvas (color-scheme light)
 *   sys.au    { i, p, f }: [sampleRate, round(baseLatency * sampleRate)] of an AudioContext with latencyHint
 *             'interactive', 'playback' and 0.05, created with sinkId { type: 'none' } (no output stream; nothing plays)
 *   sys.ae    { mr: [audio/mp4 AAC, audio/mp4 Opus], cfg, n, sz, err }: MediaRecorder type support, AudioEncoder AAC
 *             support, and an encode of three frames of silence (packets out, their sizes, the error name)
 *   sys.vd    { mc: [H.264, HEVC, VP9, AV1] as supported+smooth+powerEfficient bits for 1080p MSE, mse, cpt,
 *             wc: [HEVC any, H.264 / VP9 / AV1 prefer-hardware] WebCodecs decode support,
 *             fn: { n, fmt, err } one embedded H.264 key frame decoded with prefer-hardware }
 *   sys.kb    { n, k }: keyboard layout map size and the characters of selected physical keys
 *   sys.hy    English hyphenation: per word, the widths of its lines (in monospace characters) in a 1 px wide box
 *   sys.wa    { op: hex of 16 result bytes } for eleven WebAssembly relaxed-SIMD instructions on fixed inputs
 *   sys.rs    { n, c }: WebGL2 sub-pixel vertex snapping (rows still covered as an edge moves 1/16 px; interior pixel)
 *   sys.fw    { d, e }: WebGL2 bilinear filtering of a 2-texel half-float texture at 2048 positions (distinct outputs,
 *             max error x 1e6)
 *   sys.ms    { step: ms }
 *   codes     '-' API missing, 'u' could not run, 'x' threw, 't' not finished in time
 */
const _wait = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('t'), Math.max(0, ms)))]);
const _ms = t => Math.round((performance.now() - t) * 10) / 10;
const _nm = e => (e && e.name) || 'x';

function _hidden(tag) {
  const e = document.createElement(tag || 'div');
  e.setAttribute('aria-hidden', 'true');
  e.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;color-scheme:light;';
  return e;
}

function _fonts() {
  const out = {}, host = _hidden();
  try {
    (document.body || document.documentElement).appendChild(host);
    for (const [k, v] of [['bm', 'BlinkMacSystemFont, serif'], ['ap', '-apple-system, serif']]) {
      const e = document.createElement('span');
      e.style.fontFamily = v;
      e.textContent = 'x';
      host.appendChild(e);
      out[k] = getComputedStyle(e).fontFamily;
    }
  } catch (e) { out.err = _nm(e); } finally { host.remove(); }
  return out;
}

function _colours() {
  const out = {}, host = _hidden();
  try {
    (document.body || document.documentElement).appendChild(host);
    for (const c of ['Highlight', 'HighlightText', 'ButtonFace', 'LinkText', 'GrayText', 'Canvas']) {
      const e = document.createElement('span');
      e.style.color = c;
      host.appendChild(e);
      out[c] = getComputedStyle(e).color;
    }
  } catch (e) { out.err = _nm(e); } finally { host.remove(); }
  return out;
}

async function _audio() {
  const AC = globalThis.AudioContext;
  if (typeof AC !== 'function') return '-';
  const out = {};
  for (const [k, hint] of [['i', 'interactive'], ['p', 'playback'], ['f', 0.05]]) {
    let c = null;
    try {
      c = new AC({ latencyHint: hint, sinkId: { type: 'none' } });
      out[k] = [c.sampleRate, Math.round(c.baseLatency * c.sampleRate)];
    } catch (e) { out[k] = _nm(e); } finally { try { if (c) await _wait(c.close(), 300); } catch (e) { /* closed */ } }
  }
  return out;
}

async function _aac(capMs) {
  const out = {};
  try {
    out.mr = typeof MediaRecorder === 'function'
      ? [MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2'), MediaRecorder.isTypeSupported('audio/mp4;codecs=opus')] : '-';
  } catch (e) { out.mr = _nm(e); }
  if (typeof AudioEncoder !== 'function' || typeof AudioData !== 'function') { out.cfg = '-'; return out; }
  const cfg = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 };
  try { out.cfg = (await _wait(AudioEncoder.isConfigSupported(cfg), capMs)).supported === true ? 1 : 0; } catch (e) { out.cfg = _nm(e); }
  const sz = [];
  let err = null, enc = null;
  try {
    enc = new AudioEncoder({ output: c => sz.push(c.byteLength), error: e => { err = _nm(e); } });
    enc.configure(cfg);
    for (let k = 0; k < 3; k++) {
      enc.encode(new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: 1024, numberOfChannels: 2,
                                 timestamp: k * 21333, data: new Float32Array(2048) }));
    }
    if (await _wait(enc.flush().then(() => 'ok', e => { err = err || _nm(e); }), capMs) === 't') err = err || 't';
  } catch (e) { err = err || _nm(e); } finally { try { if (enc && enc.state !== 'closed') enc.close(); } catch (e) { /* closed */ } }
  out.n = sz.length; out.sz = sz.join(','); out.err = err;
  return out;
}

async function _video(capMs) {
  const out = {};
  const hevc = 'video/mp4; codecs="hvc1.1.6.L123.B0"';
  try { out.mse = typeof MediaSource === 'function' ? (MediaSource.isTypeSupported(hevc) ? 1 : 0) : '-'; } catch (e) { out.mse = _nm(e); }
  try { out.cpt = document.createElement('video').canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"'); } catch (e) { out.cpt = _nm(e); }
  const mc = async ct => {
    try {
      const r = await navigator.mediaCapabilities.decodingInfo({ type: 'media-source',
        video: { contentType: ct, width: 1920, height: 1080, bitrate: 8e6, framerate: 30 } });
      return '' + (+r.supported) + (+r.smooth) + (+r.powerEfficient);
    } catch (e) { return _nm(e); }
  };
  const wc = async (codec, hw) => {
    try {
      if (typeof VideoDecoder !== 'function') return '-';
      return (await VideoDecoder.isConfigSupported({ codec, codedWidth: 1920, codedHeight: 1080, hardwareAcceleration: hw })).supported ? 1 : 0;
    } catch (e) { return _nm(e); }
  };
  // one 128x128 H.264 constrained-baseline key frame (Annex B, 120 bytes), decoded with prefer-hardware: frames out and
  // their pixel format (a hardware decoder hands back NV12, the software path I420)
  const decode = async () => {
    if (typeof VideoDecoder !== 'function' || typeof EncodedVideoChunk !== 'function') return '-';
    let n = 0, fmt = null, err = null, d = null;
    try {
      const key = Uint8Array.from(atob('AAAAAWdCwAuMaCBEmoCGgIPCIRqAAAAAAWjOPIAAAAABZbgABBOTFZOTk5OTk5OuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuvA'),
                                c => c.charCodeAt(0));
      d = new VideoDecoder({ output: f => { n++; fmt = f.format; f.close(); }, error: e => { err = err || _nm(e); } });
      d.configure({ codec: 'avc1.42C00B', codedWidth: 128, codedHeight: 128, hardwareAcceleration: 'prefer-hardware' });
      d.decode(new EncodedVideoChunk({ type: 'key', timestamp: 0, data: key }));
      if (await _wait(d.flush().then(() => 'ok', e => { err = err || _nm(e); }), 400) === 't') err = err || 't';
    } catch (e) { err = err || _nm(e); } finally { try { if (d && d.state !== 'closed') d.close(); } catch (e) { /* closed */ } }
    return { n, fmt, err };
  };
  const r = await _wait(Promise.all([
    navigator.mediaCapabilities ? Promise.all([mc('video/mp4; codecs="avc1.640028"'), mc(hevc), mc('video/webm; codecs="vp09.00.40.08"'),
                                               mc('video/mp4; codecs="av01.0.08M.08"')]) : '-',
    Promise.all([wc('hvc1.1.6.L123.B0', 'no-preference'), wc('avc1.640028', 'prefer-hardware'), wc('vp09.00.40.08', 'prefer-hardware'),
                 wc('av01.0.08M.08', 'prefer-hardware')]),
    decode()]), capMs);
  if (r === 't') out.t = 1;
  else { out.mc = r[0]; out.wc = r[1]; out.fn = r[2]; }
  return out;
}

async function _keyboard(capMs) {
  const kb = navigator.keyboard;
  if (!kb || typeof kb.getLayoutMap !== 'function') return '-';
  try {
    const m = await _wait(kb.getLayoutMap(), capMs);
    if (m === 't') return 't';
    const keys = ['IntlBackslash', 'Backquote', 'Backslash', 'IntlRo', 'IntlYen', 'Quote', 'Semicolon', 'BracketLeft', 'KeyQ', 'KeyY',
                  'KeyZ', 'Minus', 'Equal', 'Slash', 'Digit2'];
    return { n: m.size, k: keys.map(k => k + '=' + (m.has(k) ? m.get(k) : '_')).join(' ') };
  } catch (e) { return _nm(e); }
}

function _hyphens() {
  const host = _hidden();
  try {
    (document.body || document.documentElement).appendChild(host);
    const probe = document.createElement('span');
    probe.style.cssText = 'font:16px/20px monospace;white-space:pre';
    probe.textContent = 'xxxxxxxxxx';
    host.appendChild(probe);
    const cw = probe.getBoundingClientRect().width / 10;
    const words = ['hyphenation', 'characterization', 'representative', 'accessibility', 'electroencephalography'];
    return words.map(w => {
      const e = document.createElement('div');
      e.lang = 'en-US';
      e.style.cssText = 'width:1px;font:16px/20px monospace;hyphens:auto;-webkit-hyphens:auto;';
      e.textContent = w;
      host.appendChild(e);
      const r = document.createRange();
      r.selectNodeContents(e);
      return Array.from(r.getClientRects()).map(q => Math.round(q.width / cw)).join('.');
    }).join(' ');
  } catch (e) { return _nm(e); } finally { host.remove(); }
}

/** Relaxed-SIMD instructions whose results the WebAssembly specification leaves to the implementation: one function per
 *  instruction, each storing its 16-byte result at address 0 for fixed inputs. Values: lowercase hex of those 16 bytes. */
async function _wasm() {
  if (typeof WebAssembly !== 'object') return '-';
  const OPS = [['swz', 0x80, 2], ['trs', 0x81, 1], ['trd', 0x83, 1], ['ls8', 0x89, 3], ['ls32', 0x8b, 3], ['min', 0x8d, 2],
               ['maxd', 0x90, 2], ['q15', 0x91, 2], ['dot', 0x92, 2], ['dota', 0x93, 3], ['madd', 0x85, 3]];
  const leb = n => { const b = []; do { let x = n & 0x7f; n >>>= 7; if (n) x |= 0x80; b.push(x); } while (n); return b; };
  const sec = (id, b) => [id, ...leb(b.length), ...b];
  const bodies = [], exps = [OPS.length + 1, 1, 0x6d, 2, 0];
  OPS.forEach(([n, op, ar], i) => {
    const b = [0x00, 0x41, 0x00];
    for (let k = 0; k < ar; k++) b.push(0x41, 16 * (k + 1), 0xfd, 0x00, 0x00, 0x00);
    b.push(0xfd, op, 0x02, 0xfd, 0x0b, 0x00, 0x00, 0x0b);
    bodies.push(...leb(b.length), ...b);
    const nm = [...n].map(c => c.charCodeAt(0));
    exps.push(nm.length, ...nm, 0, i);
  });
  const bin = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, ...sec(1, [1, 0x60, 0, 0]), ...sec(3, [OPS.length, ...OPS.map(() => 0)]),
                              ...sec(5, [1, 0, 1]), ...sec(7, exps), ...sec(10, [OPS.length, ...bodies])]);
  if (!WebAssembly.validate(bin)) return 'u';
  const { instance: I } = await WebAssembly.instantiate(bin);
  const dv = new DataView(I.exports.m.buffer), u8 = new Uint8Array(I.exports.m.buffer);
  const fills = {
    swz: () => { for (let i = 0; i < 16; i++) dv.setUint8(16 + i, 0xa0 + i);
      [0, 15, 16, 17, 31, 32, 63, 64, 112, 127, 128, 129, 143, 200, 240, 255].forEach((v, i) => dv.setUint8(32 + i, v)); },
    trs: () => { dv.setUint32(16, 0x7fc00000, true); dv.setFloat32(20, 3e9, true); dv.setFloat32(24, -3e9, true); dv.setFloat32(28, -1.5, true); },
    trd: () => { dv.setFloat64(16, NaN, true); dv.setFloat64(24, 3e9, true); },
    ls8: () => { for (let i = 0; i < 16; i++) { dv.setUint8(16 + i, 0xff); dv.setUint8(32 + i, 0); dv.setUint8(48 + i, [0x80, 0x7f, 0x01, 0xfe][i & 3]); } },
    ls32: () => { for (let i = 0; i < 16; i++) { dv.setUint8(16 + i, 0xff); dv.setUint8(32 + i, 0); }
      [0x80000000, 0x7fffffff, 0x0000ffff, 0xffff0000].forEach((v, i) => dv.setUint32(48 + 4 * i, v, true)); },
    min: () => { [NaN, 1, -0, 0].forEach((v, i) => dv.setFloat32(16 + 4 * i, v, true)); [1, NaN, 0, -0].forEach((v, i) => dv.setFloat32(32 + 4 * i, v, true)); },
    maxd: () => { dv.setFloat64(16, -0, true); dv.setFloat64(24, NaN, true); dv.setFloat64(32, 0, true); dv.setFloat64(40, 1, true); },
    q15: () => { for (let i = 0; i < 8; i++) { dv.setInt16(16 + 2 * i, -32768, true); dv.setInt16(32 + 2 * i, i ? 16384 : -32768, true); } },
    dot: () => { for (let i = 0; i < 16; i++) { dv.setInt8(16 + i, [1, 1, 127, 127][i & 3]); dv.setUint8(32 + i, 0xff); } },
    dota: () => { for (let i = 0; i < 16; i++) { dv.setInt8(16 + i, 127); dv.setUint8(32 + i, 0xff); } for (let i = 0; i < 4; i++) dv.setInt32(48 + 4 * i, 0, true); },
    madd: () => { for (let l = 0; l < 4; l++) { dv.setFloat32(16 + 4 * l, 1 + 2 ** -12, true); dv.setFloat32(32 + 4 * l, 1 + 2 ** -12, true);
                                                dv.setFloat32(48 + 4 * l, -(1 + 2 ** -11), true); } },
  };
  const out = {};
  for (const [n] of OPS) {
    try { u8.fill(0, 0, 64); fills[n](); I.exports[n](); out[n] = Array.from(u8.slice(0, 16), b => b.toString(16).padStart(2, '0')).join(''); }
    catch (e) { out[n] = 'x'; }
  }
  return out;
}

function _gl2(w, h) {
  const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return c.getContext('webgl2', { antialias: false });
}

function _program(gl, vs, fs) {
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

/** Sub-pixel vertex snapping: 256 one-row quads whose left edge passes column 10's pixel centre in 1/4096 px steps;
 *  { n: rows whose column-10 pixel is still covered, c: an interior pixel (must be 255) }. */
function _raster() {
  const R = 256, W = 64, gl = _gl2(W, R);
  if (!gl) return '-';
  try {
    const p = _program(gl, '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0,1);}',
                       '#version 300 es\nprecision highp float;out vec4 o;void main(){o=vec4(1);}');
    if (!p) return 'u';
    const v = [], X = x => x / (W / 2) - 1, Y = y => y / R * 2 - 1;
    for (let r = 0; r < R; r++) {
      const x0 = X(10.5 + r / 4096), x1 = X(40), y0 = Y(r), y1 = Y(r + 1);
      v.push(x0, y0, x1, y0, x0, y1, x1, y0, x1, y1, x0, y1);
    }
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, W, R);
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer()); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    gl.viewport(0, 0, W, R); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.useProgram(p); const l = gl.getAttribLocation(p, 'a'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, v.length / 2);
    const px = new Uint8Array(W * R * 4); gl.readPixels(0, 0, W, R, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let n = 0;
    for (let r = 0; r < R; r++) if (px[(r * W + 10) * 4]) n++;
    return { n, c: px[(5 * W + 20) * 4] };
  } finally { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
}

/** Bilinear filtering of a 2-texel R16F texture (0, 1) at 2048 positions: { d: distinct outputs, e: max error x 1e6 }. */
function _filter() {
  const N = 2048, gl = _gl2(1, 1);
  if (!gl) return '-';
  try {
    if (!gl.getExtension('EXT_color_buffer_float')) return 'u';
    const p = _program(gl, '#version 300 es\nvoid main(){vec2 q[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));gl_Position=vec4(q[gl_VertexID],0,1);}',
      '#version 300 es\nprecision highp float;uniform highp sampler2D t;out vec4 o;void main(){float f=(floor(gl_FragCoord.x)+0.5)/' + N +
      '.0;o=vec4(texture(t,vec2((0.5+f)/2.0,0.5)).r,0,0,1);}');
    if (!p) return 'u';
    const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, 2, 1, 0, gl.RED, gl.FLOAT, new Float32Array([0, 1]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    const ct = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, ct); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, N, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer()); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ct, 0);
    gl.viewport(0, 0, N, 1); gl.useProgram(p); gl.bindTexture(gl.TEXTURE_2D, tx); gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Float32Array(N * 4); gl.readPixels(0, 0, N, 1, gl.RGBA, gl.FLOAT, px);
    const s = new Set(); let e = 0;
    for (let i = 0; i < N; i++) { s.add(px[4 * i]); e = Math.max(e, Math.abs(px[4 * i] - (i + 0.5) / N)); }
    return { d: s.size, e: Math.round(e * 1e6) };
  } finally { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
}

/** Runs on an idle page (after the other stages). `budgetMs` bounds the asynchronous part. */
export async function collectSystem(budgetMs = 3000) {
  const sys = { rv: 1 }, ms = {}, t0 = performance.now();
  const left = () => Math.max(200, budgetMs - (performance.now() - t0));
  const step = async (k, fn) => {
    const t = performance.now();
    try { sys[k] = await _wait(Promise.resolve().then(fn), left()); } catch (e) { sys[k] = 'x'; }
    ms[k] = _ms(t);
  };
  await step('ff', _fonts);
  await step('sc', _colours);
  await step('hy', _hyphens);
  await step('kb', () => _keyboard(500));
  await step('wa', _wasm);
  await step('rs', _raster);
  await step('fw', _filter);
  await step('vd', () => _video(1500));
  await step('ae', () => _aac(800));
  await step('au', _audio);
  sys.ms = ms;
  return sys;
}
