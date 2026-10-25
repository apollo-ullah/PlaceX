// Browser smoke probe: loads a URL in headless Chrome and prints console messages, page
// errors, WebSocket lifecycle, and whether the landing connected. Usage: node scripts/probe.mjs <url> [seconds]
import { spawn } from 'node:child_process';
const [url, secs = '15'] = process.argv.slice(2);
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9333;
const chrome = spawn(CH, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/cdp-probe-profile-' + Date.now(), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 30 && targets.length === 0; i++) { await sleep(300); try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled') console.log(`[console.${m.params.type}]`, m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  if (m.method === 'Runtime.exceptionThrown') console.log('[exception]', m.params.exceptionDetails.text, m.params.exceptionDetails.exception?.description?.slice(0, 300));
  if (m.method === 'Network.webSocketCreated') console.log('[ws created]', m.params.url);
  if (m.method === 'Network.webSocketClosed') console.log('[ws closed]');
  if (m.method === 'Network.webSocketFrameError') console.log('[ws error]', m.params.errorMessage);
  if (m.method === 'Network.webSocketHandshakeResponseReceived') console.log('[ws handshake]', m.params.response.status);
  if (m.method === 'Network.loadingFailed' && m.params.type !== 'Image') console.log('[load failed]', m.params.type, m.params.errorText);
  if (m.id === 99) console.log('[dom]', m.result.result.value);
};
send('Runtime.enable'); send('Network.enable'); send('Page.enable');
send('Page.navigate', { url });
await sleep(Number(secs) * 1000);
ws.send(JSON.stringify({ id: 99, method: 'Runtime.evaluate', params: { expression: `(() => { const b = document.querySelector('button[type=submit]'); return JSON.stringify({ connecting: /Connecting/.test(document.body.innerText), submit: b ? (b.disabled ? 'disabled' : 'enabled') : 'none', text: document.body.innerText.slice(0, 160).replace(/\\n/g,' | ') }); })()`, returnByValue: true } }));
await sleep(1000);
chrome.kill(); process.exit(0);
