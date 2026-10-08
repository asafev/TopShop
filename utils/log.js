/**
 * Quiet logger for the collector modules.
 * Silent by default so collection leaves nothing in the page console; add ?debug=1 to the page URL to
 * see the logs while developing.
 */
const ON = (() => {
    try { return /[?&]debug=1(&|$)/.test(location.search); } catch (e) { return false; }
})();

const noop = () => {};
const pick = (k) => (ON && typeof console !== 'undefined' && typeof console[k] === 'function') ? console[k].bind(console) : noop;

export const log = {
    log: pick('log'),
    info: pick('info'),
    warn: pick('warn'),
    error: pick('error'),
};

export default log;
