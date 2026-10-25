// Load test: N simulated SDK clients set callsigns and claim objects at random rates
// against a STAGING database, reporting claim ack latency, claim-to-visible latency
// (first other client to see the row, and all clients) and error counts by code.
//
// Usage:
//   tsx scripts/load.ts [--uri wss://maincloud.spacetimedb.com] [--db placex-staging]
//                       [--clients 150] [--seconds 300] [--synthetic 2000] [--reset]
//                       [--server maincloud]
//
// --synthetic N seeds N clearly labelled synthetic "Load Test Object" rows through the
//   admin CLI identity (spacetime call ... seed_objects) so 150 clients have enough to
//   claim. These are test fixtures, never real planets, and only ever go to staging.
// --reset calls admin_reset first (clears claims, events, auctions; resets credits).
//
// Refuses to run against the live database `placex`.
import { spawnSync } from 'node:child_process';
import { DbConnection, type EventContext } from '../client/src/bindings/index.ts';

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(k);

const uri = opt('--uri', 'wss://maincloud.spacetimedb.com');
const db = opt('--db', 'placex-staging');
const server = opt('--server', uri.includes('127.0.0.1') || uri.includes('localhost') ? 'local' : 'maincloud');
const nClients = Number(opt('--clients', '150'));
const seconds = Number(opt('--seconds', '300'));
const synthetic = Number(opt('--synthetic', '0'));

if (db === 'placex') {
  console.error('Refusing to load test the live database `placex`. Use --db placex-staging.');
  process.exit(2);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const now = () => performance.now();

// ---------------------------------------------------------------------------
// Optional admin steps through the CLI (the logged-in CLI identity is the publisher)
// ---------------------------------------------------------------------------

function cli(args: string[]) {
  const r = spawnSync('spacetime', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`spacetime ${args.slice(0, 3).join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
}

if (flag('--reset')) {
  console.log(`admin_reset on ${db} (${server})`);
  cli(['call', db, 'admin_reset', '--server', server, '--no-config']);
}

if (synthetic > 0) {
  console.log(`seeding ${synthetic} synthetic load-test objects into ${db} (${server})`);
  const classes = ['rocky', 'iron', 'water', 'sub_neptune', 'ice_giant', 'gas_giant', 'hot_jupiter', 'lava'];
  const rows = [];
  for (let i = 0; i < synthetic; i++) {
    const n = String(i + 1).padStart(5, '0');
    rows.push({
      id: `load-${n}`,
      name: `Load Test Object ${n}`,
      system: `Load System ${Math.floor(i / 5)}`,
      x: (i % 100) * 10, y: Math.floor(i / 100) * 10, z: (i % 7) * 3,
      cls: classes[i % classes.length],
      price_credits: 400 + ((i * 7919) % 1100),
      value_usd: 1e20,
      auction_only: false,
      habitable_zone: i % 9 === 0,
    });
  }
  for (let i = 0; i < rows.length; i += 400) {
    cli(['call', db, 'seed_objects', JSON.stringify(rows.slice(i, i + 400)), '--server', server, '--no-config']);
    process.stdout.write(`\r${Math.min(i + 400, rows.length)}/${rows.length}`);
  }
  console.log('\nsynthetic seed complete');
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface Pending { t0: number; claimer: number; seenBy: Set<number>; firstSeen?: number; allSeen?: number }
const pending = new Map<string, Pending>();
const ackMs: number[] = [];
const firstVisibleMs: number[] = [];
const allVisibleMs: number[] = [];
const errors = new Map<string, number>();
let attempts = 0, successes = 0, connected = 0, connectFailures = 0;

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
const fmt = (n: number) => (Number.isNaN(n) ? 'n/a' : `${n.toFixed(1)} ms`);

function bump(code: string) { errors.set(code, (errors.get(code) ?? 0) + 1); }

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

interface Client { idx: number; conn: DbConnection; stop: boolean }

function connect(idx: number): Promise<Client> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('connect timeout')), 30_000);
    const conn = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(db)
      .onConnect(c => {
        c.subscriptionBuilder()
          .onApplied(() => { clearTimeout(timeout); resolve({ idx, conn: c, stop: false }); })
          .onError((_ctx, e) => { clearTimeout(timeout); reject(e); })
          .subscribe(['SELECT * FROM player', 'SELECT * FROM claim', 'SELECT * FROM celestial_object']);
      })
      .onConnectError((_ctx, e) => { clearTimeout(timeout); reject(e); })
      .onDisconnect(() => { /* counted via stop flag */ })
      .build();
    void conn;
  });
}

function watchClaims(c: Client) {
  c.conn.db.claim.onInsert((_ctx: EventContext, row) => {
    const p = pending.get(row.objectId);
    if (!p || p.claimer === c.idx || p.seenBy.has(c.idx)) return;
    p.seenBy.add(c.idx);
    const dt = now() - p.t0;
    if (p.firstSeen === undefined) { p.firstSeen = dt; firstVisibleMs.push(dt); }
    if (p.allSeen === undefined && p.seenBy.size >= connected - 1) { p.allSeen = dt; allVisibleMs.push(dt); }
  });
}

async function runClient(c: Client, deadline: number) {
  const { conn } = c;
  const tag = `load${String(c.idx).padStart(3, '0')}`;
  try {
    await conn.reducers.setProfile({ callsign: tag, crew: ['red', 'blue', 'green', 'purple', 'cyan', 'orange'][c.idx % 6] });
  } catch (e) {
    bump(`set_profile:${String((e as Error).message)}`);
    return;
  }
  // Each client has its own mean claim interval between 4 and 20 seconds.
  const meanMs = 4000 + Math.random() * 16000;
  await sleep(Math.random() * meanMs);
  while (!c.stop && now() < deadline) {
    const me = conn.identity ? conn.db.player.identity.find(conn.identity) : undefined;
    const credits = me ? Number(me.credits) : 0;
    const claimed = new Set([...conn.db.claim.iter()].map(r => r.objectId));
    const candidates = [...conn.db.celestialObject.iter()].filter(o => !o.auctionOnly && !claimed.has(o.id) && Number(o.priceCredits) <= credits);
    if (candidates.length === 0) {
      // Out of credits or out of objects: idle until the end, still observing claims.
      bump(credits < 400 ? 'idle:out_of_credits' : 'idle:nothing_left');
      await sleep(Math.max(1000, deadline - now()));
      break;
    }
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    attempts++;
    const t0 = now();
    pending.set(target.id, { t0, claimer: c.idx, seenBy: new Set() });
    try {
      await conn.reducers.claimObject({ objectId: target.id });
      ackMs.push(now() - t0);
      successes++;
    } catch (e) {
      pending.delete(target.id);
      const msg = String((e as Error).message ?? e);
      const code = msg.match(/[A-Z_]{4,}/)?.[0] ?? msg.slice(0, 40);
      bump(code);
    }
    // Exponential-ish jitter around the client's mean rate.
    await sleep(meanMs * (0.5 + Math.random()));
  }
}

async function main() {
  console.log(`load test: ${nClients} clients, ${seconds}s, ${uri} / ${db}`);
  const clients: Client[] = [];
  const tStart = now();
  // Stagger connects so the server does not take 150 handshakes in the same instant.
  const connects: Promise<void>[] = [];
  for (let i = 0; i < nClients; i++) {
    connects.push((async () => {
      await sleep(i * 40);
      try {
        const c = await connect(i);
        watchClaims(c);
        clients.push(c);
        connected++;
      } catch (e) {
        connectFailures++;
        bump(`connect:${String((e as Error).message).slice(0, 40)}`);
      }
    })());
  }
  await Promise.all(connects);
  console.log(`connected ${connected}/${nClients} in ${((now() - tStart) / 1000).toFixed(1)}s (${connectFailures} failures)`);
  const objects = clients[0]?.conn.db.celestialObject.count() ?? 0;
  console.log(`catalog: ${objects} objects visible`);

  const deadline = now() + seconds * 1000;
  const ticker = setInterval(() => {
    const left = Math.max(0, Math.round((deadline - now()) / 1000));
    console.log(`[${left}s left] attempts ${attempts} ok ${successes} ack p50 ${fmt(pct(ackMs, 50))} first-visible p50 ${fmt(pct(firstVisibleMs, 50))}`);
  }, 30_000);

  await Promise.all(clients.map(c => runClient(c, deadline)));
  clearInterval(ticker);
  // Let the last claims propagate.
  await sleep(2000);
  for (const c of clients) { c.stop = true; try { c.conn.disconnect(); } catch { /* ignore */ } }

  console.log('\n===== LOAD TEST REPORT =====');
  console.log(`database            ${db} (${uri})`);
  console.log(`clients             ${connected}/${nClients} connected, ${connectFailures} connect failures`);
  console.log(`duration            ${seconds}s`);
  console.log(`claims attempted    ${attempts}`);
  console.log(`claims succeeded    ${successes}`);
  console.log(`ack latency         p50 ${fmt(pct(ackMs, 50))}  p95 ${fmt(pct(ackMs, 95))}  max ${fmt(Math.max(...ackMs))}`);
  console.log(`claim-to-visible    p50 ${fmt(pct(firstVisibleMs, 50))}  p95 ${fmt(pct(firstVisibleMs, 95))}  max ${fmt(Math.max(...firstVisibleMs))}   (first other client)`);
  console.log(`visible everywhere  p50 ${fmt(pct(allVisibleMs, 50))}  p95 ${fmt(pct(allVisibleMs, 95))}  max ${fmt(Math.max(...allVisibleMs))}   (all ${connected} clients, ${allVisibleMs.length} samples)`);
  const unseen = [...pending.values()].filter(p => p.firstSeen === undefined).length;
  console.log(`never seen by peers ${unseen}`);
  console.log('errors / idle reasons:');
  for (const [k, v] of [...errors.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(40)} ${v}`);
  process.exit(0);
}

main().catch(e => { console.error('LOAD FAIL', e); process.exit(1); });
