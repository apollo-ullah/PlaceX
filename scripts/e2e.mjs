// End-to-end UI test through headless Chrome (CDP): land, enter a callsign, fly to an object,
// tap Claim, confirm the card shows it as yours. Usage: node scripts/e2e.mjs <url> [objectId]
// The URL must include ?debug=1 so the scene exposes window.__placex.
import { spawn } from 'node:child_process';
const [url = 'http://localhost:5173/?debug=1', objectId = 'wasp-76-b'] = process.argv.slice(2);
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9334;
const chrome = spawn(CH, ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=390,844', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/e2e-profile-' + Date.now(), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 30 && targets.length === 0; i++) { await sleep(300); try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
const call = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const errors = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); };
const evalJs = async expr => (await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
await call('Runtime.enable'); await call('Page.enable');
await call('Page.navigate', { url });
const fail = msg => { console.error('E2E FAIL:', msg, errors.length ? '\nexceptions:\n' + errors.join('\n') : ''); chrome.kill(); process.exit(1); };
// 1. wait for connection
let ok = false; for (let i = 0; i < 40; i++) { await sleep(500); if (await evalJs(`!!document.querySelector('button[type=submit]') && !document.querySelector('button[type=submit]').disabled`)) { ok = true; break; } }
if (!ok) fail('landing never connected');
console.log('connected, landing ready');
// 2. callsign + enter
const callsign = 'e2e' + Date.now().toString(36).slice(-5);
await evalJs(`(() => { const i = document.querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '${callsign}'); i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('button[type=submit]').click(); })()`);
ok = false; for (let i = 0; i < 20; i++) { await sleep(500); if (!(await evalJs(`!!document.querySelector('button[type=submit]')`))) { ok = true; break; } }
if (!ok) fail('profile not accepted');
console.log('profile set as', callsign);
// 3. fly to object, wait for card with a Claim button
await evalJs(`window.__placex && window.__placex.api.flyTo('${objectId}')`);
ok = false; for (let i = 0; i < 20; i++) { await sleep(500); if (await evalJs(`[...document.querySelectorAll('button')].some(b => /^claim/i.test(b.textContent.trim()))`)) { ok = true; break; } }
if (!ok) { const txt = await evalJs('document.body.innerText.slice(0,400)'); fail('no Claim button on card. body: ' + txt); }
const price = await evalJs(`(document.body.innerText.match(/([0-9][0-9,]*)\\s*cr/) || [])[1]`);
console.log('card open for', objectId, 'price', price);
// 4. claim
await evalJs(`[...document.querySelectorAll('button')].find(b => /^claim/i.test(b.textContent.trim())).click()`);
ok = false; let body = '';
for (let i = 0; i < 20; i++) { await sleep(500); body = await evalJs('document.body.innerText'); if (/yours|claimed/i.test(body) && !/^claim$/im.test(body)) { ok = true; break; } }
if (!ok) fail('claim did not register. body: ' + body.slice(0, 400));
console.log('claim registered:', (body.match(/yours[^\n]*|claimed[^\n]*/i) || [''])[0].slice(0, 80));
if (errors.length) fail('page exceptions');
console.log('E2E PASS');
chrome.kill(); process.exit(0);
