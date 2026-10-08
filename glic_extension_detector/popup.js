const scanButton = document.getElementById('scan');
const detected = document.getElementById('detected');
const glicCount = document.getElementById('glicCount');
const geminiCount = document.getElementById('geminiCount');
const output = document.getElementById('output');

const GLIC_URL_RE = /^chrome-untrusted:\/\/glic(?:\/|$)/i;
const GEMINI_URL_RE = /^https:\/\/gemini\.google\.com\/app(?:[/?#]|$)/i;

function getTargets() {
  return new Promise((resolve, reject) => {
    chrome.debugger.getTargets(targets => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(targets || []);
    });
  });
}

async function scan() {
  scanButton.disabled = true;
  output.textContent = 'Scanning...';

  try {
    const targets = await getTargets();
    const glicTargets = targets.filter(target => GLIC_URL_RE.test(String(target.url || '')));
    const geminiTargets = targets.filter(target => GEMINI_URL_RE.test(String(target.url || '')));
    const interestingTargets = targets.filter(target => (
      GLIC_URL_RE.test(String(target.url || '')) ||
      GEMINI_URL_RE.test(String(target.url || '')) ||
      /glic|gemini|chrome-untrusted/i.test(String(target.url || '') + ' ' + String(target.title || ''))
    ));

    detected.textContent = String(glicTargets.length > 0 || geminiTargets.length > 0);
    glicCount.textContent = String(glicTargets.length);
    geminiCount.textContent = String(geminiTargets.length);
    output.textContent = JSON.stringify({
      detected: glicTargets.length > 0 || geminiTargets.length > 0,
      glicTargets,
      geminiTargets,
      interestingTargets,
      totalTargets: targets.length,
      note: 'This runs in an extension context with debugger permission. Normal page JavaScript cannot call chrome.debugger.getTargets().',
    }, null, 2);
  } catch (error) {
    detected.textContent = 'error';
    glicCount.textContent = '-';
    geminiCount.textContent = '-';
    output.textContent = JSON.stringify({
      error: {
        name: error.name,
        message: error.message,
      },
    }, null, 2);
  } finally {
    scanButton.disabled = false;
  }
}

scanButton.addEventListener('click', scan);
scan();