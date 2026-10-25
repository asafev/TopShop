/**
 * Browser Use engine checks: is this browser the machine it claims to be, and if not, is it Browser Use's?
 *
 * A cloud agent dresses a Linux browser as a Windows or macOS desktop (the persona: platform, GPU name, WebGL
 * limits, cores). The persona is a set of answers; the engine underneath still behaves like itself. Each rule here
 * compares one claim with something the engine does, never with the user agent, a client hint or a version:
 *
 *   graphics   the WebGL / WebGPU limits a persona claims vs what the backend enforces, and GPU speed vs CPU speed
 *   os-build   things a browser takes from the OS it was built for (AAC encoder, audio buffer arithmetic, text AA)
 *   cpu        the CPU an Apple-silicon or Intel-iGPU claim implies vs how WebAssembly SIMD actually lowers
 *   attribution  which agent cloud the engine belongs to (its rendering backend's build markers)
 *
 * Which rules run depends on the persona (device.em.plat): a macOS claim gets the macOS rules, a Windows claim the
 * Windows rules, anything else the persona-free graphics rules. The attribution markers run for every persona.
 * Each rule has a level for each persona it runs on:
 *
 *   strong       one firing is enough to call the persona spoofed
 *   supporting   rare on genuine devices, not alone: two of them call the persona spoofed, one is "suspicious"
 *   context      shown with its reading, never counted (a known false-positive class, or too little data)
 *
 * Verdict: 'browser-use' (BU-L3-1, or a spoofed persona plus one attribution marker, or two markers), 'agent-persona'
 * (spoofed, no attribution), 'suspicious', 'clean' (checked, nothing fired) or 'n/a' (nothing could be checked).
 *
 * Retired rules (no separation from real visitors, or killed for recall) are still evaluated and shown, never
 * counted, so a new actor's values stay visible. Attribution markers are stored as salted hashes of the exact value:
 * a match is checked without the value appearing in this file.
 *
 * Input is the browser-data record ({ device, page }) as fingerprint-data.json.html writes it: device from
 * detectors/envCollect.js, device.cap (capacityProbes.js), device.osx (platformProbes.js), device.sys
 * (systemProbes.js), page.jsEnvironment from browserFingerprint.js. Every rule reads only its own fields and answers
 * true (fired), false (checked, quiet) or null (not applicable / not measured). Pure: evaluate() touches no DOM.
 *
 *   evaluateBrowserUse(record) -> { verdict, persona, rules, markers, retired, checks, ... }
 *   engineChecks(record)       -> raw rows for display, every visitor, whatever the verdict
 *   collectEngineRecord()      -> Promise<record>: runs the four collector stages once per page (cached)
 *   provideEngineRecord(rec)   -> hand over a record a page already collected (no second collection)
 *   getEngineRecord()          -> the record when one is ready, else null (synchronous)
 */

export const ENGINE_VERSION = 'bu-engine/1';

// ---- reading the record ------------------------------------------------------------------------------------------

const NO_VALUE = new Set(['', 'null', 'none', 'undefined', 'unknown']);
const GL_CODES = new Set(['t', '-', 'e', 'x']);               // the page's probe codes: timeout, absent, error, unsupported
const STAGE_CODES = new Set(['t', '-', 'e', 'x', 'u']);
const EXT_CODES = new Set(['-', 'u', 'x', 't', 'n', 'c', 'v']);
const GECKO_UNCLAMPED = '100000x100000';
const ERROR_NAME = /^[A-Za-z]*Error$/;

function get(rec, path) {
  let cur = rec;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur) || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** The value as text, or null when nothing was written there (null, empty, 'undefined', 'Unknown'). */
function present(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return NO_VALUE.has(s.toLowerCase()) ? null : s;
}

function int(v) {
  const s = present(v);
  return s !== null && /^-?[0-9]+$/.test(s) ? parseInt(s, 10) : null;
}

function pos(v) {
  const s = present(v);
  if (s === null || !/^[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(s)) return null;
  const f = parseFloat(s);
  return f > 0 ? f : null;
}

function glValue(v) {
  const s = present(v);
  return s === null || GL_CODES.has(s) ? null : s;
}

const isInt = (x) => typeof x === 'number' && Number.isInteger(x);
const isDict = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

/** Round half to even, as the reference implementation rounds. */
function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

const plat = (rec) => get(rec, 'device.em.plat');

/** The system stage, when it is the version these rules were written for. */
function sys(rec) {
  const s = get(rec, 'device.sys');
  return isDict(s) && s.rv === 1 ? s : null;
}

function osx(rec) {
  const o = get(rec, 'device.osx');
  return isDict(o) && o.rv === 1 ? o : null;
}

/** Chromium gate: the claimed renderer is ANGLE's and the enforced viewport is clamped (Gecko leaves 100000). */
function chromium_(rec) {
  const ren = present(get(rec, 'device.gts.r')), vp = get(rec, 'device.gle.vp');
  if (ren === null || vp === undefined || vp === null) return null;
  return ren.startsWith('ANGLE') && vp !== GECKO_UNCLAMPED;
}

/** The same gate where the viewport must be a real reading, not a probe code. */
function chromiumStrict(rec) {
  const ren = get(rec, 'device.gts.r'), vp = get(rec, 'device.gle.vp');
  if (typeof ren !== 'string' || typeof vp !== 'string' || STAGE_CODES.has(vp)) return null;
  return ren.startsWith('ANGLE') && vp !== GECKO_UNCLAMPED;
}

/** The record carries the probe extension the WebGPU and MAX_SAMPLES rules were registered on. */
const ext1 = (rec) => present(get(rec, 'device.x')) === '1';

// an honest claim of no hardware GPU (software rasterizers, VM display adapters): hardware rules are n/a for these
const SOFT_RENDERER = /SwiftShader|llvmpipe|softpipe|lavapipe|Basic Render|Microsoft Basic|Software|VMware|VirtualBox|Parallels|Mesa OffScreen|Chromium/i;
const SOFT_RENDERER_R5 = /SwiftShader|llvmpipe|softpipe|lavapipe|Basic Render|Microsoft Basic|Software|VMware|VirtualBox|Parallels|Mesa OffScreen|Chromium|Paravirtual/i;
// a GPU only Apple silicon has (M/A series, or Apple's paravirtual GPU, which runs macOS guests on Apple silicon only)
const APPLE_SILICON_GPU = /Apple (M\d+|A\d+|Paravirtual)/;
// Intel iGPUs whose CPUs (same die) predate AVX-VNNI: HD 4xxx/5xxx/6000, HD 5xx/6xx, UHD 6xx, Iris Plus 6xx, Iris Pro 5200/6200
const OLD_INTEL_IGPU = /Intel\(R\) (HD Graphics (4[0-9]{3}|5[0-9]{3}|6000|5[0-9]{2}|6[0-9]{2})|UHD Graphics 6[0-9]{2}|Iris\(R\) Plus Graphics 6[0-9]{2}|Iris\(R\) Pro Graphics (5200|6200))\b/;
// relaxed-SIMD results (16 bytes, hex) as x86-64 and as ARM64 lower them
const SIMD_X86 = { swz: 'a0afa0a1afa0afa0a0af000000000000', trs: '000000800000008000000080ffffffff',
  ls8: 'ff0000ffff0000ffff0000ffff0000ff', min: '0000803f0000c07f0000000000000080' };
const SIMD_ARM = { swz: 'a0af0000000000000000000000000000', trs: '00000000ffffff7f00000080ffffffff',
  ls8: '807f01fe807f01fe807f01fe807f01fe', min: '0000c07f0000c07f0000008000000080' };
const DOT_VNNI = '04fa0100'.repeat(4), DOT_NO_VNNI = 'feff0000'.repeat(4);
const X86_NAN = 'fff8000000000000', ARM_NAN = '7ff8000000000000';
const GL_PERF_MAX = 1.0;   // fill ms / CPU reference ms: genuine GPUs stay far below, software rasterizers far above
const CPU_PAR_MIN = 0.2;   // delivered parallelism / claimed cores, for claims of at least 8 cores

// ---- attribution markers (salted FNV-1a of the exact value) ----------------------------------------------------

const SALT = ENGINE_VERSION;
function mark(kind, value) {
  const s = SALT + '|' + kind + '|' + value;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}

const MARKS = {
  backend: ['6ed6cf4b'],                 // enforced viewport | GL error of renderbufferStorageMultisample(MAX_SAMPLES + 1)
  render: ['8f88441f'],                  // hash of the WebGL test render (the real rasterizer underneath the persona)
  audio: ['2dd10048', '19c93e31'],       // [sampleRate, frames] the persona reports for a 0.05 s latency hint
  text: ['8f23c98e', 'ac1bfd85'],        // the worker canvas text render of a Linux text stack
  highlight: ['9268fb2f'],               // CSS Highlight colour of the Windows persona (retired: genuine Windows shares it)
};
const markedIn = (table, kind, value) => value !== null && value !== undefined
  && (table[kind] || []).indexOf(mark(kind, String(value))) >= 0;
const matches = (kind, value) => markedIn(MARKS, kind, value);

/** The GL error of the last device.gms.r row (renderbufferStorageMultisample at MAX_SAMPLES + 1). */
function maxPlusOneError(rec) {
  const rows = present(get(rec, 'device.gms.r'));
  if (rows === null) return null;
  const last = rows.split(' ').pop().split(':');
  return last.length >= 3 ? int(last[1]) : null;
}

function backendValue(rec) {
  const vp = glValue(get(rec, 'device.gle.vp')), err = maxPlusOneError(rec);
  return vp === null || err === null ? null : vp + '|' + err;
}

function audioValue(rec) {
  const f = get(sys(rec) || {}, 'au.f');
  return Array.isArray(f) && f.length === 2 && f.every(isInt) ? f[0] + '/' + f[1] : null;
}

// ---- active rules ------------------------------------------------------------------------------------------------

function glVp1(rec) {
  const vp = glValue(get(rec, 'device.gle.vp')), claim = glValue(get(rec, 'device.gbk.VIEWPORT'));
  if (vp === null || claim === null || chromium_(rec) !== true) return null;
  return vp !== claim;
}

function glUov1(rec) {
  const uov = glValue(get(rec, 'device.gle.uov'));
  if (uov === null || chromium_(rec) !== true) return null;
  const parts = uov.split('/');
  const links = parts.filter((p) => /^[01]{3}$/.test(p)).map((p) => p[2]);
  if (links.indexOf('1') >= 0) return true;
  return parts.length === 2 && links.length === 2 ? false : null;
}

function gnSg1(rec) {
  if (!ext1(rec)) return null;
  const x = get(rec, 'device.gn.sg.x');
  const xi = int(x), lo = int(get(rec, 'device.gn.sg.n')), hi = int(get(rec, 'device.gn.sg.m'));
  if (xi !== null) return lo === null || hi === null ? null : (xi < lo || xi > hi);
  const name = present(x), feats = get(rec, 'device.gn.f.n');
  if (name === null || EXT_CODES.has(name) || !ERROR_NAME.test(name) || typeof feats !== 'string' || present(feats) === null) return null;
  let listed;
  try { listed = feats.trim().startsWith('[') ? JSON.parse(feats) : feats.trim().split(','); } catch (e) { return null; }
  return Array.isArray(listed) && listed.indexOf('subgroups') >= 0 ? true : null;
}

function glPerf1(rec) {
  if (present(get(rec, 'device.cap.rv')) !== '1') return null;
  const ren = present(get(rec, 'device.gts.r'));
  if (ren === null || !ren.startsWith('ANGLE') || SOFT_RENDERER.test(ren)) return null;
  const ms = pos(get(rec, 'device.cap.fill.ms')), cpu = pos(get(rec, 'device.cap.cpu'));
  if (ms === null || cpu === null) return null;
  return ms / cpu > GL_PERF_MAX;
}

function txtWin1(rec) {
  if (plat(rec) !== 'Win32') return null;
  const ofr = int(get(rec, 'device.wft.ofr'));
  if (ofr === null || ofr < 0) return null;
  return ofr === 0;
}

function aac1(rec) {
  if (['Win32', 'MacIntel'].indexOf(plat(rec)) < 0 || chromiumStrict(rec) !== true) return null;
  const a = get(sys(rec) || {}, 'ae');
  if (!isDict(a) || a.cfg === '-' || a.cfg === null || a.cfg === undefined || !isInt(a.n)) return null;
  return a.n === 0;
}

function audHint1(rec) {
  if (['Win32', 'MacIntel'].indexOf(plat(rec)) < 0 || chromiumStrict(rec) !== true) return null;
  const f = get(sys(rec) || {}, 'au.f');
  if (!(Array.isArray(f) && f.length === 2 && f.every((x) => isInt(x) && x > 0))) return null;
  return f[1] < roundHalfEven(0.05 * f[0]);
}

function macMsl1(rec) {
  const ren = get(rec, 'device.gts.r');
  if (plat(rec) !== 'MacIntel' || chromiumStrict(rec) !== true || typeof ren !== 'string' || ren.indexOf('ANGLE Metal Renderer') < 0) return null;
  const head = get(rec, 'device.gts.fhd');
  if (typeof head !== 'string' || !head.startsWith('#include <metal_stdlib>')) return null;
  return !/^#include <metal_stdlib>\s+#define ANGLE_/.test(head);
}

function claimedRenderer(rec) {
  return get(rec, 'device.gts.r') || get(rec, 'device.g1.renderer');
}

function archWasm1(rec) {
  const ren = claimedRenderer(rec);
  if (plat(rec) !== 'MacIntel' || typeof ren !== 'string' || !APPLE_SILICON_GPU.test(ren)) return null;
  const wa = get(sys(rec) || {}, 'wa');
  if (!isDict(wa)) return null;
  if (Object.keys(SIMD_X86).every((k) => wa[k] === SIMD_X86[k])) return true;
  return Object.keys(SIMD_ARM).every((k) => wa[k] === SIMD_ARM[k]) ? false : null;
}

function archMac1(rec) {
  const ren = claimedRenderer(rec);
  if (plat(rec) !== 'MacIntel' || typeof ren !== 'string' || !APPLE_SILICON_GPU.test(ren)) return null;
  const b = int(get(rec, 'page.jsEnvironment.architecture.nanSignByte'));
  const div = get(rec, 'device.osx.vm.nan.div');
  const noDiv = div === undefined || div === null;
  if (b === 255 && (noDiv || div === X86_NAN)) return true;
  if (b === 127 && (noDiv || div === ARM_NAN)) return false;
  return null;
}

function isaIgpu1(rec) {
  const ren = get(rec, 'device.gts.r');
  if (plat(rec) !== 'Win32' || chromiumStrict(rec) !== true || typeof ren !== 'string' || !OLD_INTEL_IGPU.test(ren)) return null;
  const dota = get(sys(rec) || {}, 'wa.dota');
  return dota === DOT_VNNI ? true : dota === DOT_NO_VNNI ? false : null;
}

function cpuPar1(rec) {
  if (present(get(rec, 'device.cap.rv')) !== '1') return null;
  const hc = pos(get(rec, 'device.cap.par.hc')), one = pos(get(rec, 'device.cap.par.one')), all = pos(get(rec, 'device.cap.par.all'));
  if (hc === null || one === null || all === null || hc < 8) return null;
  return (all / one) / hc < CPU_PAR_MIN;
}

function buL31(rec) {
  if (!ext1(rec)) return null;
  if (glVp1(rec) !== true && gnSg1(rec) !== true) return null;
  const v = backendValue(rec);
  return v === null ? null : matches('backend', v);
}

const ACTIVE = [
  { id: 'GL-VP-1', name: 'Viewport limit: claimed vs enforced', family: 'graphics', test: glVp1,
    fields: ['device.gbk.VIEWPORT', 'device.gle.vp', 'device.gts.r'],
    why: 'The persona claims a MAX_VIEWPORT_DIMS; viewport(0,0,1e5,1e5) read back shows the limit the backend really clamps to.' },
  { id: 'GL-UOV-1', name: 'Over-limit uniform shader still links', family: 'graphics', test: glUov1,
    fields: ['device.gle.uov', 'device.gbk.MAX_VERTEX_UNIFORM_VECTORS', 'device.gbk.MAX_FRAGMENT_UNIFORM_VECTORS'],
    why: 'A program with more vec4 uniforms than the claimed limit must fail to link; it links when the claim is lower than the real GPU.' },
  { id: 'GN-SG-1', name: 'WebGPU subgroup size outside its own range', family: 'graphics', test: gnSg1,
    fields: ['device.gn.sg.x', 'device.gn.sg.n', 'device.gn.sg.m', 'device.gn.f.n', 'device.x'],
    why: 'A compute shader executes with a subgroup_size outside the adapter\'s reported min..max, or "subgroups" is advertised and fails.' },
  { id: 'GL-PERF-1', name: 'Hardware GPU claim renders at software speed', family: 'graphics', test: glPerf1,
    fields: ['device.gts.r', 'device.cap.fill.ms', 'device.cap.cpu'],
    why: 'A fixed WebGL2 fill takes longer than a fixed CPU loop in the same visit: a CPU rasterizer under a hardware GPU name.' },
  { id: 'TXT-WIN-1', name: 'Windows claim, greyscale-only canvas text', family: 'os-build', test: txtWin1,
    fields: ['device.em.plat', 'device.wft.ofr'],
    why: 'Windows Chromium draws coloured sub-pixel edges for text on an opaque worker canvas; other OS builds draw greyscale only.' },
  { id: 'AAC-1', name: 'Desktop claim, no AAC packet out', family: 'os-build', test: aac1,
    fields: ['device.em.plat', 'device.sys.ae'],
    why: 'Windows and macOS builds encode AAC with the OS encoder; a Linux build claims support and produces no packet.' },
  { id: 'AUD-HINT-1', name: 'Audio buffer shorter than the latency asked for', family: 'os-build', test: audHint1,
    fields: ['device.em.plat', 'device.sys.au.f'],
    why: 'Chromium never returns fewer frames than requested for a 0.05 s hint (2205 at 44.1 kHz); fewer means the latency is written.' },
  { id: 'MAC-MSL-1', name: 'Metal claim, shader not translated by ANGLE Metal', family: 'graphics', test: macMsl1,
    fields: ['device.gts.r', 'device.gts.fhd'],
    why: 'Under an ANGLE Metal Renderer claim the translated shader source must start the way ANGLE\'s Metal translator writes it.' },
  { id: 'ARCH-WASM-1', name: 'Apple-silicon claim, x86 SIMD results', family: 'cpu', test: archWasm1,
    fields: ['device.gts.r', 'device.sys.wa'],
    why: 'WebAssembly relaxed-SIMD answers the way the real CPU lowers it; an Apple M-series claim answering as x86-64 runs on x86.' },
  { id: 'ARCH-MAC-1', name: 'Apple-silicon claim, x86 NaN sign', family: 'cpu', test: archMac1,
    fields: ['device.gts.r', 'page.jsEnvironment.architecture.nanSignByte', 'device.osx.vm.nan.div'],
    why: 'Infinity - Infinity has the x86 sign on x86 CPUs. Context only: an x64 browser under Rosetta 2 shows the same.' },
  { id: 'ISA-IGPU-1', name: 'Pre-2021 Intel iGPU claim on an AVX-VNNI CPU', family: 'cpu', test: isaIgpu1,
    fields: ['device.gts.r', 'device.sys.wa.dota'],
    why: 'The claimed GPU shares a die with a CPU that has no AVX-VNNI, yet the relaxed dot product lowers with AVX-VNNI.' },
  { id: 'CPU-PAR-1', name: 'Fewer parallel cores than claimed', family: 'compute', test: cpuPar1,
    fields: ['device.cap.par.hc', 'device.cap.par.one', 'device.cap.par.all'],
    why: 'Workers on all claimed cores deliver under a fifth of the claim. Context only: busy genuine machines can do the same.' },
  { id: 'BU-L3-1', name: 'Spoofed GPU persona on Browser Use\'s rendering backend', family: 'attribution', test: buL31,
    fields: ['device.gle.vp', 'device.gms.r', 'device.x'],
    why: 'A persona already caught by GL-VP-1 or GN-SG-1, whose backend enforces the viewport and MAX_SAMPLES+1 error of Browser Use\'s build.' },
];

/** The rules each persona runs, with their level. Anything not a macOS or Windows claim runs the persona-free set. */
export const PERSONA_PLANS = {
  macOS: { 'GL-VP-1': 'strong', 'GN-SG-1': 'strong', 'AAC-1': 'strong', 'AUD-HINT-1': 'strong', 'GL-UOV-1': 'supporting',
    'GL-PERF-1': 'supporting', 'MAC-MSL-1': 'supporting', 'ARCH-WASM-1': 'supporting', 'ARCH-MAC-1': 'context',
    'CPU-PAR-1': 'context', 'BU-L3-1': 'attribution' },
  Windows: { 'GL-VP-1': 'strong', 'AAC-1': 'strong', 'AUD-HINT-1': 'strong', 'GL-UOV-1': 'supporting', 'GN-SG-1': 'supporting',
    'GL-PERF-1': 'supporting', 'TXT-WIN-1': 'supporting', 'ISA-IGPU-1': 'supporting', 'CPU-PAR-1': 'context',
    'BU-L3-1': 'attribution' },
  other: { 'GL-VP-1': 'strong', 'GL-UOV-1': 'supporting', 'GN-SG-1': 'supporting', 'GL-PERF-1': 'supporting',
    'CPU-PAR-1': 'context', 'BU-L3-1': 'attribution' },
};

// ---- retired rules: evaluated and shown, never counted -------------------------------------------------------------

const BLOB_LF = '410a420a430a44', BLOB_CRLF = '410d0a420d0a430d0a44', BLOB_KEPT = '410a420d430d0a44';
const BLOB_CONTROLS = ['st', 'sd', 'bn', 'nn'];
const LINUX_RANGE = 'rgb(157, 150, 142)';
const MAC_EDIT_SHAPE = { ac: [6, 6], gb: [0, 9], nd: [9, 3] };
const US_CORE = { Backquote: '`', Backslash: '\\', Quote: "'", Semicolon: ';', BracketLeft: '[', KeyQ: 'q', KeyY: 'y',
  KeyZ: 'z', Minus: '-', Equal: '=', Slash: '/', Digit2: '2' };
const INTL_BACKSLASH = { Win32: '\\', MacIntel: '§' };
const HYPH_WORDS = [11, 16, 14, 13, 22];

function blobCase(rec, c) {
  const h = get(rec, 'device.bm.m.' + c + '.h'), s = int(get(rec, 'device.bm.m.' + c + '.s')), x = get(rec, 'device.bm.m.' + c + '.x');
  if (typeof h !== 'string' || typeof x !== 'string' || s === null || h.length % 2 || !/^[0-9a-fA-F]*$/.test(h)) return null;
  let text = '';
  for (let i = 0; i < h.length; i += 2) text += String.fromCharCode(parseInt(h.substr(i, 2), 16));
  return h.length / 2 === s && text === x ? h : null;
}

function t1(rec) {
  const nos = get(rec, 'device.nos');
  const p = present(get(rec, 'page.navigator.platform')) || present(plat(rec));
  if ((nos !== 'lf' && nos !== 'crlf') || p === null || !p.toLowerCase().startsWith('win')) return null;
  return nos === 'lf';
}

function rBlobWin001(rec) {
  if (plat(rec) !== 'Win32') return null;
  const sn = blobCase(rec, 'sn');
  if (sn === null || BLOB_CONTROLS.some((c) => blobCase(rec, c) !== BLOB_KEPT)) return null;
  return sn === BLOB_LF ? true : sn === BLOB_CRLF ? false : null;
}

function edWin1(rec) {
  if (!ext1(rec) || plat(rec) !== 'Win32' || chromium_(rec) !== true) return null;
  const f = present(get(rec, 'device.ed.f'));
  if (f === null) return null;
  return f.startsWith('3,') ? true : f.startsWith('4,') ? false : null;
}

// VM-WIN-1 references, one per radian platformProbes.js rotates by: the informative component (0 cos, 1 sin), its
// correctly rounded bits, and the delta Windows' C runtime (statically linked into Windows Chrome) gives there,
// with and without FMA
const VM_UCRT = [
  [1, '3fe60325c789ba65', -1, -1], [1, '3fe840274fd2fde4', -1, -1], [1, '3fe73417c5bef95a', -1, -1],
  [0, '3fe6e462725febec', -1, -1], [1, '3fe6c4bc2f0fc3f9', -1, -1], [1, '3fe72c13849bf943', -1, -1],
  [1, '3fe84309f4a4baa0', -1, -1], [1, '3fe5e792d16376bd', -1, -1], [1, '3fe8211a540a5e1a', -1, -1],
  [1, '3fe7e757046ca155', -1, -1], [0, 'bfe7b6857c5699dc', -1, -1], [0, 'bfe820318a7109ff', 1, 1],
  [0, 'bfe6fa057cfae680', 1, 1], [0, '3fe624b0777cc70b', -1, -1],
];

/** [informative components, matching the Windows UCRT deltas, correctly rounded] over the published radians. */
function vmScores(o) {
  const cv = isDict(o.vm) ? o.vm.cv : null;
  if (!Array.isArray(cv) || cv.length !== VM_UCRT.length) return null;
  const signed = (h) => BigInt.asIntN(64, BigInt('0x' + h));
  let inf = 0, ucrt = 0, cr = 0;
  for (let i = 0; i < VM_UCRT.length; i++) {
    const pair = cv[i], [k, ref, dFma, dNoFma] = VM_UCRT[i];
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    if (typeof pair[k] !== 'string' || !/^[0-9a-f]{16}$/.test(pair[k])) return null;
    const d = signed(pair[k]) - signed(ref);
    inf += 1;
    if (d === BigInt(dFma) || d === BigInt(dNoFma)) ucrt += 1;
    if (d === BigInt(0)) cr += 1;
  }
  return [inf, ucrt, cr];
}

function vmWin1(rec) {
  const o = osx(rec);
  if (o === null || plat(rec) !== 'Win32' || chromium_(rec) !== true) return null;
  const vm = o.vm;
  if (int(get(rec, 'page.jsEnvironment.architecture.nanSignByte')) !== 255 || !isDict(vm) || !isDict(vm.nan) || vm.nan.div !== X86_NAN) return null;
  const s = vmScores(o);
  if (s === null || s[0] < 10) return null;
  return s[1] <= 4 && s[2] >= 10;
}

function chr1(rec) {
  const o = osx(rec);
  if (o === null || ['Win32', 'MacIntel'].indexOf(plat(rec)) < 0 || chromium_(rec) !== true) return null;
  const u = o.uas;
  if (!isDict(u) || !['rng', 'rngI'].every((k) => typeof u[k] === 'string' && u[k].startsWith('rgb'))) return null;
  const mtp = int(get(rec, 'device.em.mtp'));
  if (u.sbw === 0 && mtp !== null && mtp > 0) return null;
  return u.rng === LINUX_RANGE && u.rngI === LINUX_RANGE;
}

function chr2(rec) {
  const o = osx(rec), ren = present(get(rec, 'device.gts.r'));
  if (o === null || plat(rec) !== 'MacIntel' || chromium_(rec) !== true || !ren || ren.indexOf('ANGLE Metal Renderer') < 0) return null;
  const e = o.edm;
  if (!isDict(e) || !sameList(e.ac1, [6, 4]) || !Array.isArray(e.wm) || !e.wm.length || [3, 4].indexOf(e.wm[0]) < 0) return null;
  if (sameList(e.gb, [4, 0]) && (sameList(e.ac, [6, 9]) || sameList(e.ac, [6, 10])) && sameList(e.nd, [4, 8])) return true;
  return Object.keys(MAC_EDIT_SHAPE).every((k) => sameList(e[k], MAC_EDIT_SHAPE[k])) ? false : null;
}

function macFont1(rec) {
  if (plat(rec) !== 'MacIntel' || chromiumStrict(rec) !== true) return null;
  const s = sys(rec);
  let v = s ? get(s, 'ff.bm') : undefined;
  if (typeof v === 'string') return v.startsWith('BlinkMacSystemFont') ? true : v.startsWith('"system-ui"') ? false : null;
  v = get(rec, 'page.cssComputedStyle.cssBodyFontFamily');
  if (typeof v !== 'string') return null;
  return v.indexOf('BlinkMacSystemFont') >= 0 ? true : v.indexOf('"system-ui"') >= 0 ? false : null;
}

function hyphMac1(rec) {
  if (plat(rec) !== 'MacIntel' || chromiumStrict(rec) !== true) return null;
  const h = get(sys(rec) || {}, 'hy');
  if (typeof h !== 'string') return null;
  const parts = h.split(' ');
  if (parts.length !== HYPH_WORDS.length) return null;
  if (parts.every((p, i) => p === String(HYPH_WORDS[i]))) return true;
  return parts.every((p) => p.indexOf('.') >= 0) ? false : null;
}

function kbd1(rec) {
  const p = plat(rec);
  if (!(p in INTL_BACKSLASH) || chromiumStrict(rec) !== true) return null;
  const k = get(sys(rec) || {}, 'kb.k');
  if (typeof k !== 'string') return null;
  const m = {};
  for (const x of k.split(' ')) { const i = x.indexOf('='); if (i >= 0) m[x.slice(0, i)] = x.slice(i + 1); }
  if (Object.keys(US_CORE).some((key) => m[key] !== US_CORE[key])) return null;
  return m.IntlBackslash === '<' ? true : m.IntlBackslash === INTL_BACKSLASH[p] ? false : null;
}

function audWin1(rec) {
  if (plat(rec) !== 'Win32' || chromiumStrict(rec) !== true) return null;
  const au = get(sys(rec) || {}, 'au') || {}, i = au.i, p = au.p;
  if (!(Array.isArray(i) && Array.isArray(p) && i.length === 2 && p.length === 2 && i[0] === p[0])) return null;
  const sr = i[0], fi = i[1], fp = p[1];
  if (![sr, fi, fp].every((x) => isInt(x) && x > 0) || sr > 48000) return null;
  const pow2 = (n) => (n & (n - 1)) === 0;
  if (pow2(fi) && pow2(fp) && fi >= 512) return true;
  return fp % fi === 0 && !pow2(fp) ? false : null;
}

function hwClaim(rec) {
  const ren = get(rec, 'device.gts.r');
  return chromiumStrict(rec) === true && typeof ren === 'string' && !SOFT_RENDERER_R5.test(ren);
}

function vidHw1(rec) {
  if (!hwClaim(rec)) return null;
  const fn = get(sys(rec) || {}, 'vd.fn');
  if (!isDict(fn) || !isInt(fn.n)) return null;
  if (fn.n >= 1) return fn.fmt === 'I420' ? true : fn.fmt === 'NV12' ? false : null;
  return fn.err !== undefined && fn.err !== null && fn.err !== 't' ? true : null;
}

function ras1(rec) {
  if (!hwClaim(rec)) return null;
  const rs = get(sys(rec) || {}, 'rs');
  if (!isDict(rs) || rs.c !== 255 || !isInt(rs.n)) return null;
  return rs.n >= 65 ? true : rs.n <= 17 ? false : null;
}

function flt1(rec) {
  if (!hwClaim(rec)) return null;
  const fw = get(sys(rec) || {}, 'fw');
  if (!isDict(fw) || !isInt(fw.d) || !isInt(fw.e)) return null;
  if (fw.d === 2048 && fw.e === 0) return true;
  return fw.d <= 512 && fw.e > 0 ? false : null;
}

function winHl1(rec) {
  if (plat(rec) !== 'Win32' || chromiumStrict(rec) !== true) return null;
  const h = get(sys(rec) || {}, 'sc.Highlight') || get(rec, 'page.cssComputedStyle.cssSystemColor_Highlight');
  if (typeof h !== 'string' || !h.startsWith('rgb')) return null;
  return matches('highlight', h);
}

const NO_SEPARATION = 'retired: real visitors show the same reading';
const NO_RECALL = 'retired: Browser Use sessions stopped firing it';

const RETIRED = [
  { id: 'T1', name: 'Windows claim, LF line endings', family: 'os-build', test: t1, fields: ['device.nos'], status: NO_SEPARATION },
  { id: 'R-BLOB-WIN-001', name: 'Windows claim, native Blob writes LF', family: 'os-build', test: rBlobWin001, fields: ['device.bm.m.sn.h'], status: NO_SEPARATION },
  { id: 'ED-WIN-1', name: 'Windows claim, non-Windows word steps', family: 'os-build', test: edWin1, fields: ['device.ed.f'], status: NO_SEPARATION },
  { id: 'VM-WIN-1', name: 'Windows claim, non-Windows math library', family: 'os-build', test: vmWin1, fields: ['device.osx.vm.cv'], status: NO_SEPARATION },
  { id: 'CHR-2', name: 'macOS claim, non-Mac editing rules', family: 'os-build', test: chr2, fields: ['device.osx.edm'], status: NO_SEPARATION },
  { id: 'MAC-FONT-1', name: 'macOS claim, BlinkMacSystemFont not resolved', family: 'os-build', test: macFont1, fields: ['device.sys.ff.bm'], status: NO_SEPARATION },
  { id: 'VID-HW-1', name: 'Hardware GPU claim, no hardware H.264 decode', family: 'graphics', test: vidHw1, fields: ['device.sys.vd.fn'], status: NO_SEPARATION },
  { id: 'RAS-1', name: 'Hardware GPU claim, 4-bit sub-pixel raster', family: 'graphics', test: ras1, fields: ['device.sys.rs'], status: NO_SEPARATION },
  { id: 'FLT-1', name: 'Hardware GPU claim, exact software sampler', family: 'graphics', test: flt1, fields: ['device.sys.fw'], status: NO_SEPARATION },
  { id: 'CHR-1', name: 'Desktop claim, Linux range-input colour', family: 'os-build', test: chr1, fields: ['device.osx.uas'], status: NO_RECALL },
  { id: 'KBD-1', name: 'Desktop claim, Linux 102nd key', family: 'os-build', test: kbd1, fields: ['device.sys.kb.k'], status: NO_RECALL },
  { id: 'HYPH-MAC-1', name: 'macOS claim, no English hyphenation', family: 'os-build', test: hyphMac1, fields: ['device.sys.hy'], status: NO_RECALL },
  { id: 'AUD-WIN-1', name: 'Windows claim, Linux audio buffer arithmetic', family: 'os-build', test: audWin1, fields: ['device.sys.au.i', 'device.sys.au.p'], status: NO_RECALL },
  { id: 'WIN-HL-1', name: 'Windows persona Highlight colour', family: 'attribution', test: winHl1, fields: ['device.sys.sc.Highlight'], status: NO_SEPARATION },
];

// ---- markers that run on every persona -----------------------------------------------------------------------------

const MARKERS = [
  { id: 'backend', name: 'Rendering backend build (viewport + MAX_SAMPLES+1 error)', kind: 'attribution',
    read: backendValue, fields: ['device.gle.vp', 'device.gms.r'] },
  { id: 'render', name: 'WebGL test render of the real rasterizer', kind: 'attribution',
    read: (rec) => present(get(rec, 'device.grh')), fields: ['device.grh'] },
  { id: 'audio', name: 'Audio latency constant of the persona', kind: 'attribution', read: audioValue, fields: ['device.sys.au.f'] },
  { id: 'text', name: 'Linux text stack under a desktop claim', kind: 'engine', read: textValue,
    fields: ['device.wft.oh', 'device.wft.th'] },
];

/** The worker text hash that matches (opaque first, then transparent), else whichever was measured. Desktop claims only. */
function textValue(rec) {
  if (['Win32', 'MacIntel'].indexOf(plat(rec)) < 0) return null;
  const oh = present(get(rec, 'device.wft.oh')), th = present(get(rec, 'device.wft.th'));
  return [oh, th].find((v) => matches('text', v)) || oh || th;
}

// ---- evaluation ----------------------------------------------------------------------------------------------------

function fieldValues(rec, fields) {
  const o = {};
  for (const f of fields) { const v = get(rec, f); o[f] = v === undefined ? null : v; }
  return o;
}

function run(rule, rec) {
  if (!rule.test) return { result: null, error: null };
  try {
    const v = rule.test(rec);
    return { result: v === true || v === false ? v : null, error: null };
  } catch (e) {
    return { result: null, error: String((e && e.message) || e) };   // one broken rule never hides the others
  }
}

/** The persona the browser claims, from its main-realm navigator.platform. */
export function personaOf(record) {
  const p = present(plat(record)) || present(get(record, 'page.navigator.platform'));
  if (p === 'MacIntel') return { key: 'macOS', label: 'macOS', platform: p };
  if (p === 'Win32') return { key: 'Windows', label: 'Windows', platform: p };
  return { key: 'other', label: p ? 'other (' + p + ')' : 'unknown', platform: p };
}

const LEVEL_ORDER = { attribution: 0, strong: 1, supporting: 2, context: 3 };

/**
 * Every check on one record, and the verdict. Never throws.
 * @param {{device?: object, page?: object}} record
 */
export function evaluateBrowserUse(record) {
  const rec = isDict(record) ? record : {};
  const persona = personaOf(rec);
  const plan = PERSONA_PLANS[persona.key];

  const rules = ACTIVE.map((r) => {
    const level = plan[r.id] || null;
    const o = level ? run(r, rec) : { result: null, error: null };
    return { id: r.id, name: r.name, family: r.family, level, inPlan: !!level, result: o.result, error: o.error,
      why: r.why, values: fieldValues(rec, r.fields) };
  }).sort((a, b) => (a.inPlan === b.inPlan ? 0 : a.inPlan ? -1 : 1) || (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9));

  const markers = MARKERS.map((m) => {
    let value = null, matched = null;
    try { value = m.read(rec); matched = value === null ? null : matches(m.id, value); } catch (e) { /* not measured */ }
    return { id: m.id, name: m.name, kind: m.kind, matched, value, values: fieldValues(rec, m.fields) };
  });

  const retired = RETIRED.map((r) => {
    const o = run(r, rec);
    return { id: r.id, name: r.name, family: r.family, status: r.status, result: o.result, error: o.error, values: fieldValues(rec, r.fields) };
  });

  const fired = rules.filter((r) => r.inPlan && r.result === true);
  const strong = fired.filter((r) => r.level === 'strong');
  const supporting = fired.filter((r) => r.level === 'supporting').map((r) => r.id)
    .concat(markers.filter((m) => m.kind === 'engine' && m.matched).map((m) => 'marker:' + m.id));
  const attribution = markers.filter((m) => m.kind === 'attribution' && m.matched).map((m) => m.id);
  const l3 = rules.some((r) => r.id === 'BU-L3-1' && r.inPlan && r.result === true);
  const spoofed = strong.length >= 1 || supporting.length >= 2;
  const checked = rules.some((r) => r.inPlan && r.result !== null) || markers.some((m) => m.matched !== null);

  let verdict, confidence;
  if (l3 || (spoofed && attribution.length >= 1) || attribution.length >= 2) {
    verdict = 'browser-use';
    confidence = l3 || attribution.length >= 2 ? 0.97 : 0.93;
  } else if (spoofed) {
    verdict = 'agent-persona';
    confidence = strong.length ? 0.85 : 0.75;
  } else if (supporting.length === 1 || attribution.length === 1) {
    verdict = 'suspicious';
    confidence = 0.4;
  } else {
    verdict = checked ? 'clean' : 'n/a';
    confidence = 0;
  }

  const stages = {
    env: isDict(get(rec, 'device.em')), cap: isDict(get(rec, 'device.cap')),
    osx: isDict(get(rec, 'device.osx')), sys: isDict(get(rec, 'device.sys')),
  };
  return {
    version: ENGINE_VERSION,
    verdict,
    label: VERDICT_LABELS[verdict],
    confidence,
    persona,
    chromium: chromium_(rec),
    summary: summarize(persona, strong, supporting, attribution, l3, rules),
    fired: { strong: strong.map((r) => r.id), supporting, attribution, l3 },
    rules,
    markers,
    retired,
    stages,
    checks: engineChecks(rec),
  };
}

export const VERDICT_LABELS = {
  'browser-use': 'Browser Use',
  'agent-persona': 'Spoofed persona (agent cloud)',
  suspicious: 'Suspicious',
  clean: 'No contradiction',
  'n/a': 'Not measured',
};

function summarize(persona, strong, supporting, attribution, l3, rules) {
  const planned = rules.filter((r) => r.inPlan);
  const measured = planned.filter((r) => r.result !== null).length;
  const parts = [persona.label + ' persona: ' + measured + '/' + planned.length + ' rules measured'];
  if (strong.length) parts.push(strong.length + ' strong (' + strong.map((r) => r.id).join(', ') + ')');
  if (supporting.length) parts.push(supporting.length + ' supporting (' + supporting.join(', ') + ')');
  if (l3) parts.push('BU-L3-1 fired');
  if (attribution.length) parts.push('Browser Use markers: ' + attribution.join(', '));
  return parts.join('; ');
}

// ---- Instinct: an agent cloud that does NOT dress its browser as anything else ------------------------------------

/**
 * Instinct's platform, keyboard, line endings, fonts and codecs all agree with the Linux build it really runs, so the
 * persona rules above have nothing to contradict: a honest Linux claim cannot be caught lying about itself. What
 * identifies it is its own infrastructure (a fixed VM shape and a GPU slice) plus one injected component.
 *
 * The Linux gate is therefore not "it says Linux": it is "it says Linux AND the engine facts a Linux build must carry
 * are all there". That keeps these rules off a Windows or macOS persona dressed as Linux, which belongs to the
 * persona rules above, and off a genuine Linux desktop, which fails every evidence rule below.
 *
 * Rates measured 2026-10-25 against 346,646 real devices (8 customer sites, our own network left out) and the 241-capture
 * research corpus; each rule carries its own. Only ONE Instinct session has page-side data so far, so every rule here
 * is a candidate: the next session is its held-out test, not more evidence.
 *
 * Counting is by FAMILY, not by rule. The heap ceiling and the display geometry are both the VM's size; the renderer,
 * the allocation ceiling and the multisample limit are all the same GPU slice. Three rules of one family are one fact.
 */
const INSTINCT_MARKS = {
  global: ['7a5ae1a4'],   // a captcha-interception global injected into every frame: 0 of 241 corpus captures
  heap: ['cb46df64'],     // the container's JS heap ceiling: 0 of 346,646 real devices
  geom: ['cd483f1f'],     // screen | work area | viewport | window as one string: 0 of 346,646 real devices
};
const INSTINCT_GPU = /NVIDIA L40S-\d+Q\b/;   // an NVIDIA vGPU profile; the digit is the slice's frame buffer in GB

/** The Linux engine facts a genuine Linux Chromium carries. A Linux claim without them is a persona, not a build. */
const LINUX_FACTS = [
  ['line endings', (rec) => get(rec, 'device.nos'), (v) => v === 'lf'],
  ['102nd key', (rec) => get(sys(rec) || {}, 'kb.k'), (v) => typeof v === 'string' && / IntlBackslash=<|^IntlBackslash=</.test(' ' + v)],
  ['range input colour', (rec) => get(osx(rec) || {}, 'uas.rng'), (v) => v === 'rgb(157, 150, 142)'],
  ['BlinkMacSystemFont', (rec) => get(sys(rec) || {}, 'ff.bm'), (v) => typeof v === 'string' && v.startsWith('BlinkMacSystemFont')],
  ['OS core fonts', (rec) => get(rec, 'device.ofn'), (v) => isDict(v) && v.windows === 0 && v.macos === 0 && Number(v.linux) > 0],
  ['no AAC encoder', (rec) => get(rec, 'device.wcd.aen'), (v) => v === 0],
];
const LINUX_FACTS_MIN = 3;   // of the six; the stages that carry them are optional, so a few may simply be missing

/** { ok, platform, facts: [{name, value, holds}], held, measured, why } */
function linuxBuild(rec) {
  const p = present(plat(rec)) || present(get(rec, 'page.navigator.platform'));
  const uad = present(get(rec, 'device.em.uadPlat'));
  const facts = LINUX_FACTS.map(([name, read, ok]) => {
    let value = null;
    try { value = read(rec); } catch (e) { /* stage absent */ }
    const seen = value !== null && value !== undefined;
    return { name, value: seen ? value : null, holds: seen ? !!ok(value) : null };
  });
  const measured = facts.filter((f) => f.holds !== null).length;
  const held = facts.filter((f) => f.holds === true).length;
  const claims = p !== null && /^Linux/i.test(p) && (uad === null || /^Linux$/i.test(uad));
  const chromium = chromium_(rec);
  let why = '';
  if (!claims) why = 'not a Linux claim' + (p ? ' (' + p + ')' : '');
  else if (chromium !== true) why = 'not a Chromium engine';
  else if (measured < LINUX_FACTS_MIN) why = 'too few Linux engine facts measured (' + measured + ' of ' + LINUX_FACTS.length + ')';
  else if (held < LINUX_FACTS_MIN) why = 'the Linux claim is not backed by its engine facts (' + held + '/' + measured + '): a persona, not a Linux build';
  return { ok: claims && chromium === true && measured >= LINUX_FACTS_MIN && held >= LINUX_FACTS_MIN,
    platform: p, uadPlatform: uad, chromium, facts, held, measured, why };
}

/** screen | work area | viewport | window, from the page record (the device record carries no geometry). */
function geometry(rec) {
  const d = get(rec, 'page.display'), w = get(rec, 'page.window');
  if (!isDict(d) || !isDict(w)) return null;
  const pairs = [[d.width, d.height], [d.availWidth, d.availHeight], [w.innerWidth, w.innerHeight], [w.outerWidth, w.outerHeight]];
  if (pairs.some((pr) => !pr.every((x) => isInt(x) && x >= 0))) return null;
  return pairs.map((pr) => pr[0] + 'x' + pr[1]).join('|');
}

const INSTINCT_RULES = [
  { id: 'INS-M1', name: 'Captcha-interception global injected into every frame', family: 'injected', level: 'attribution',
    fields: ['device.ei.extra', 'device.ei.extraCount'],
    why: 'A fresh same-origin frame carries a global this page never defines, whose name is a reCAPTCHA interception hook. '
      + '0 of 241 corpus captures carry it (4 carry any extra frame global at all). It most likely names a captcha-solving '
      + 'component, which other operators could license too, so it is attribution with a caveat, not proof of Instinct.',
    test: (rec) => {
      const e = get(rec, 'device.ei.extra');
      if (!Array.isArray(e)) return null;
      return e.some((n) => markedIn(INSTINCT_MARKS, 'global', String(n)));
    } },
  { id: 'INS-S1', name: 'Container heap ceiling', family: 'vm-shape', level: 'strong',
    fields: ['device.lhm.limit'],
    why: "V8's heap limit follows the container's memory. This exact ceiling is on 0 of 346,646 real devices; real "
      + 'Linux visitors cluster on much larger ones. Cheap for the operator to change by resizing the VM.',
    test: (rec) => {
      const v = get(rec, 'device.lhm.limit');
      return isInt(v) ? markedIn(INSTINCT_MARKS, 'heap', v) : null;
    } },
  { id: 'INS-S2', name: 'Fixed VM display with a window of no size', family: 'vm-shape', level: 'strong',
    fields: ['page.display', 'page.window'],
    why: 'Screen, work area, viewport and window together. 0 of 346,646 real devices show this combination. The window '
      + 'being 0x0 on its own is NOT rare (3.1% of real devices), so only the four together count.',
    test: (rec) => {
      const g = geometry(rec);
      return g === null ? null : markedIn(INSTINCT_MARKS, 'geom', g);
    } },
  { id: 'INS-S3', name: 'NVIDIA data-centre vGPU slice', family: 'gpu-slice', level: 'strong',
    fields: ['device.gts.r'],
    why: 'The claimed renderer names an NVIDIA vGPU profile, which only exists on virtualised data-centre hardware. '
      + '0 of 346,646 real devices. Infrastructure, not a build: it changes when the operator changes GPU fleet.',
    test: (rec) => {
      const r = present(get(rec, 'device.gts.r')) || present(get(rec, 'device.g1.renderer'));
      return r === null ? null : INSTINCT_GPU.test(r);
    } },
  { id: 'INS-P1', name: 'Allocation fails at the GPU limit it reports', family: 'gpu-slice', level: 'supporting',
    fields: ['device.gle.toa', 'device.gle.roa'],
    why: 'A texture and a renderbuffer AT the reported maximum both fail with INVALID_VALUE, not just above it: the '
      + "slice cannot allocate what the physical card's driver advertises. 0 of 95 genuine captures.",
    test: (rec) => {
      const toa = int(get(rec, 'device.gle.toa')), roa = int(get(rec, 'device.gle.roa'));
      if (toa === null || roa === null) return null;
      return toa === 1281 && roa === 1281;
    } },
  { id: 'INS-P2', name: 'Multisample limit it cannot use', family: 'gpu-slice', level: 'supporting',
    fields: ['device.gbk.MAX_SAMPLES', 'device.gle.smp'],
    why: 'MAX_SAMPLES is reported far above the sample counts that actually work, the same frame-buffer ceiling seen '
      + 'from another side. Genuine devices report 4, 8 or 16 and can use them.',
    test: (rec) => {
      const claimed = int(get(rec, 'device.gbk.MAX_SAMPLES')), smp = glValue(get(rec, 'device.gle.smp'));
      if (claimed === null || smp === null) return null;
      const usable = smp.split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0);
      return usable.length > 0 && claimed >= 4 * Math.max.apply(null, usable);
    } },
  { id: 'INS-C1', name: 'Window geometry delta (outer minus inner)', family: 'vm-shape', level: 'context',
    fields: ['page.window'],
    why: 'Shown for the record only. It is outer minus inner, so a 0x0 window over this viewport forces it: the same '
      + 'fact as the geometry rule, never counted twice.',
    test: (rec) => {
      const w = get(rec, 'page.window');
      if (!isDict(w) || ![w.outerWidth, w.outerHeight, w.innerWidth, w.innerHeight].every(isInt)) return null;
      return w.outerWidth - w.innerWidth < 0 && w.outerHeight - w.innerHeight < 0;
    } },
];

export const INSTINCT_VERDICT_LABELS = {
  instinct: 'Instinct (agent cloud)',
  'instinct-like': 'Instinct-like infrastructure',
  clean: 'No Instinct evidence',
  'n/a': 'Not applicable',
};

/**
 * The Instinct rules on one record. Never throws.
 * @param {{device?: object, page?: object}} record
 */
export function evaluateInstinct(record) {
  const rec = isDict(record) ? record : {};
  const gate = linuxBuild(rec);
  const rules = INSTINCT_RULES.map((r) => {
    const o = gate.ok ? run(r, rec) : { result: null, error: null };
    return { id: r.id, name: r.name, family: r.family, level: r.level, result: o.result, error: o.error,
      why: r.why, values: fieldValues(rec, r.fields) };
  });
  const fired = rules.filter((r) => r.result === true && r.level !== 'context');
  const families = new Set(fired.map((r) => r.family));
  const attribution = fired.some((r) => r.level === 'attribution');
  const corroborating = new Set([...families].filter((f) => f !== 'injected')).size;
  const measured = rules.filter((r) => r.result !== null).length;

  let verdict, confidence;
  if (!gate.ok || measured === 0) {
    verdict = 'n/a';
    confidence = 0;
  } else if (attribution && corroborating >= 1) {
    verdict = 'instinct';
    confidence = 0.95;
  } else if (attribution) {
    verdict = 'instinct';
    confidence = 0.9;
  } else if (corroborating >= 2) {
    verdict = 'instinct';
    confidence = 0.85;
  } else if (corroborating === 1) {
    verdict = 'instinct-like';
    confidence = 0.5;
  } else {
    verdict = 'clean';
    confidence = 0;
  }
  const parts = [];
  if (!gate.ok) parts.push('gate: ' + gate.why);
  else parts.push('Linux build confirmed (' + gate.held + '/' + gate.measured + ' engine facts), '
    + measured + '/' + rules.length + ' rules measured');
  if (attribution) parts.push('the injected captcha hook is present');
  if (corroborating) parts.push(corroborating + ' corroborating famil' + (corroborating === 1 ? 'y' : 'ies')
    + ' (' + [...families].filter((f) => f !== 'injected').join(', ') + ')');
  return {
    version: ENGINE_VERSION,
    verdict,
    label: INSTINCT_VERDICT_LABELS[verdict],
    confidence,
    gate,
    summary: parts.join('; '),
    fired: { attribution, families: [...families], ids: fired.map((r) => r.id) },
    rules,
  };
}

// ---- raw values for display ----------------------------------------------------------------------------------------

const CHECK_ROWS = [
  ['Claim', 'Platform (navigator.platform)', 'device.em.plat'],
  ['Claim', 'Client-hint platform', 'device.em.uadPlat'],
  ['Claim', 'WebGL renderer (claimed)', 'device.gts.r'],
  ['Claim', 'Logical cores (claimed)', 'device.em.hc'],
  ['Claim', 'Probe extension', 'device.x'],
  ['Graphics', 'Viewport limit claimed', 'device.gbk.VIEWPORT'],
  ['Graphics', 'Viewport enforced', 'device.gle.vp'],
  ['Graphics', 'Over-limit uniform programs (compile/compile/link)', 'device.gle.uov'],
  ['Graphics', 'MAX_VERTEX_UNIFORM_VECTORS', 'device.gbk.MAX_VERTEX_UNIFORM_VECTORS'],
  ['Graphics', 'MAX_FRAGMENT_UNIFORM_VECTORS', 'device.gbk.MAX_FRAGMENT_UNIFORM_VECTORS'],
  ['Graphics', 'MAX_SAMPLES rows (samples:error:ok:got)', 'device.gms.r'],
  ['Graphics', 'Translated fragment shader head', 'device.gts.fhd'],
  ['Graphics', 'Translated shader hashes (vertex / fragment)', ['device.gts.vh', 'device.gts.fh']],
  ['Graphics', 'WebGL test render hash', 'device.grh'],
  ['WebGPU', 'Subgroup size executed', 'device.gn.sg.x'],
  ['WebGPU', 'Subgroup range reported (min / max)', ['device.gn.sg.n', 'device.gn.sg.m']],
  ['WebGPU', 'Adapter features', 'device.gn.f.n'],
  ['Capacity', 'WebGL2 fill ms', 'device.cap.fill.ms'],
  ['Capacity', 'CPU reference ms', 'device.cap.cpu'],
  ['Capacity', 'Parallel rounds (cores / one worker / all workers)', ['device.cap.par.hc', 'device.cap.par.one', 'device.cap.par.all']],
  ['Text', 'Opaque worker text coloured pixels', 'device.wft.ofr'],
  ['Text', 'Worker text hashes (opaque / transparent)', ['device.wft.oh', 'device.wft.th']],
  ['Text', 'Native Blob line endings', 'device.nos'],
  ['Audio & media', 'AudioContext [rate, frames]: interactive', 'device.sys.au.i'],
  ['Audio & media', 'AudioContext [rate, frames]: playback', 'device.sys.au.p'],
  ['Audio & media', 'AudioContext [rate, frames]: 0.05 s hint', 'device.sys.au.f'],
  ['Audio & media', 'AAC encode (support, packets, error)', 'device.sys.ae'],
  ['Audio & media', 'H.264 key frame decode', 'device.sys.vd.fn'],
  ['CPU', 'WebAssembly relaxed SIMD', 'device.sys.wa'],
  ['CPU', 'Float32 NaN sign byte', 'page.jsEnvironment.architecture.nanSignByte'],
  ['CPU', 'Float64 NaN bits', 'device.osx.vm.nan.div'],
  ['Agent infrastructure', 'Extra globals in a fresh frame', 'device.ei.extra'],
  ['Agent infrastructure', 'JS heap ceiling', 'device.lhm.limit'],
  ['Agent infrastructure', 'Screen / work area', ['page.display.width', 'page.display.height', 'page.display.availWidth', 'page.display.availHeight']],
  ['Agent infrastructure', 'Viewport / window', ['page.window.innerWidth', 'page.window.innerHeight', 'page.window.outerWidth', 'page.window.outerHeight']],
  ['Agent infrastructure', 'Allocation at the reported max (texture / renderbuffer)', ['device.gle.toa', 'device.gle.roa']],
  ['Agent infrastructure', 'Multisample: reported / usable', ['device.gbk.MAX_SAMPLES', 'device.gle.smp']],
  ['Agent infrastructure', 'OS core fonts (win / mac / linux)', ['device.ofn.windows', 'device.ofn.macos', 'device.ofn.linux']],
  ['Retired inputs', 'Blob native endings (main realm)', 'device.bm.m.sn.h'],
  ['Retired inputs', 'Word-step caret offsets', 'device.ed.f'],
  ['Retired inputs', 'BlinkMacSystemFont alias', 'device.sys.ff.bm'],
  ['Retired inputs', 'English hyphenation widths', 'device.sys.hy'],
  ['Retired inputs', 'Keyboard layout keys', 'device.sys.kb.k'],
  ['Retired inputs', 'Sub-pixel raster (rows, interior)', 'device.sys.rs'],
  ['Retired inputs', 'Bilinear filter (distinct, error)', 'device.sys.fw'],
  ['Retired inputs', 'CSS Highlight colour', 'device.sys.sc.Highlight'],
  ['Retired inputs', 'Range input UA colours', 'device.osx.uas'],
  ['Retired inputs', 'Mac editing shapes', 'device.osx.edm'],
  ['Retired inputs', 'Canvas rotate() bits', 'device.osx.vm.cv'],
];

function show(v) {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object') return v;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

/** Every input the rules read, as raw values, whatever the verdict: rows of { group, label, path, value }. */
export function engineChecks(record) {
  const rec = isDict(record) ? record : {};
  const rows = CHECK_ROWS.map(([group, label, path]) => {
    const paths = Array.isArray(path) ? path : [path];
    const vals = paths.map((p) => show(get(rec, p)));
    const value = paths.length === 1 ? vals[0] : (vals.every((v) => v === null) ? null : vals.map((v) => (v === null ? '-' : v)).join(' / '));
    return { group, label, path: paths.join(', '), value: value === undefined ? null : value };
  });
  const ms = pos(get(rec, 'device.cap.fill.ms')), cpu = pos(get(rec, 'device.cap.cpu'));
  rows.splice(rows.findIndex((r) => r.path === 'device.cap.cpu') + 1, 0,
    { group: 'Capacity', label: 'Fill / CPU ratio', path: 'device.cap.fill.ms / device.cap.cpu',
      value: ms !== null && cpu !== null ? Math.round((ms / cpu) * 1000) / 1000 : null });
  return rows;
}

// ---- collection (browser only) -------------------------------------------------------------------------------------

let _record = null;
let _pending = null;

/** A record the page already collected (for example the browser-data page's own), used instead of collecting again. */
export function provideEngineRecord(record) {
  if (isDict(record) && isDict(record.device)) { _record = record; _pending = Promise.resolve(record); }
  return _record;
}

/** The record when one is ready, else null. */
export function getEngineRecord() {
  return _record;
}

function nanSignByte() {
  try {
    const f = new Float32Array(1), u8 = new Uint8Array(f.buffer);
    f[0] = Infinity;
    f[0] = f[0] - f[0];
    return u8[3];
  } catch (e) { return null; }
}

/**
 * Collect the record once per page: the device record, then capacity, platform and system stages one after another
 * on an otherwise idle page (capacity times a GPU fill against a CPU loop: run it while nothing else is busy).
 * Resolves with the record; a stage that fails leaves its code ('x') and the others still run.
 * @param {{ timeoutMs?: number, budgetMs?: number }} [options]
 */
export function collectEngineRecord(options) {
  if (_pending) return _pending;
  const o = Object.assign({ timeoutMs: 2500, budgetMs: 3000 }, options || {});
  _pending = (async () => {
    const [{ collectEnv }, { collectCapacity }, { collectPlatform }, { collectSystem }] = await Promise.all([
      import('./envCollect.js'), import('./capacityProbes.js'), import('./platformProbes.js'), import('./systemProbes.js')]);
    const rec = { device: null, page: { jsEnvironment: { architecture: { nanSignByte: nanSignByte() } } } };
    try { rec.device = await collectEnv({ timeoutMs: o.timeoutMs }); } catch (e) { rec.device = {}; }
    if (!isDict(rec.device)) rec.device = {};
    try { rec.device.cap = await collectCapacity(o.budgetMs); } catch (e) { rec.device.cap = 'x'; }
    try { rec.device.osx = await collectPlatform(o.budgetMs); } catch (e) { rec.device.osx = 'x'; }
    try { rec.device.sys = await collectSystem(o.budgetMs); } catch (e) { rec.device.sys = 'x'; }
    _record = rec;
    return rec;
  })();
  return _pending;
}
