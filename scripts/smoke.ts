// Smoke test: two fresh identities connect, set callsigns, one claims an object,
// the other sees the claim. Measures claim-to-visible latency. Also checks that a
// second claim on the same object fails with ALREADY_CLAIMED.
// Usage: tsx scripts/smoke.ts <ws-uri> <db-name> [object-id]
import { DbConnection, tables, type EventContext } from '../client/src/bindings/index.ts';

const [uri = 'ws://127.0.0.1:3000', db = 'placex-local', wantedId] = process.argv.slice(2);

function connect(label: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    const conn = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(db)
      .onConnect((c, identity) => {
        console.log(`[${label}] connected ${identity.toHexString().slice(0, 12)}`);
        c.subscriptionBuilder()
          .onApplied(() => resolve(c))
          .onError((_ctx, e) => reject(e))
          .subscribe(['SELECT * FROM player', 'SELECT * FROM claim', 'SELECT * FROM celestial_object', 'SELECT * FROM event']);
      })
      .onConnectError((_ctx, e) => reject(e))
      .build();
    void conn;
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const tag = `smoke${Date.now().toString(36).slice(-4)}`;

async function main() {
  const a = await connect('A');
  const b = await connect('B');

  await a.reducers.setProfile({ callsign: `${tag}A`, crew: 'red' });
  await b.reducers.setProfile({ callsign: `${tag}B`, crew: 'blue' });
  console.log('profiles set');

  const objects = [...a.db.celestialObject.iter()];
  if (objects.length === 0) throw new Error('celestial_object is empty, run the seed first');
  const claimed = new Set([...a.db.claim.iter()].map(c => c.objectId));
  const target = wantedId
    ? objects.find(o => o.id === wantedId)
    : objects.find(o => !o.auctionOnly && !claimed.has(o.id));
  if (!target) throw new Error('no claimable object found (all claimed?). Run admin_reset.');
  console.log(`target ${target.id} @ ${target.priceCredits} credits`);

  // B waits for the claim to appear.
  const seen = new Promise<number>(resolve => {
    b.db.claim.onInsert((_ctx: EventContext, row) => { if (row.objectId === target.id) resolve(performance.now()); });
  });
  const t0 = performance.now();
  await a.reducers.claimObject({ objectId: target.id });
  const tAck = performance.now();
  const tSeen = await Promise.race([seen, sleep(5000).then(() => -1)]);
  if (tSeen < 0) throw new Error('B never saw the claim within 5 s');
  console.log(`claim ack ${Math.round(tAck - t0)} ms, visible on B ${Math.round(tSeen - t0)} ms`);

  // Race: B tries the same object, must fail with ALREADY_CLAIMED.
  let code = 'none';
  try { await b.reducers.claimObject({ objectId: target.id }); } catch (e) { code = String((e as Error).message); }
  console.log(`second claim rejected with: ${code}`);
  if (!code.includes('ALREADY_CLAIMED')) throw new Error('expected ALREADY_CLAIMED');

  // Auction-only guard.
  const earth = objects.find(o => o.auctionOnly);
  if (earth) {
    let c2 = 'none';
    try { await b.reducers.claimObject({ objectId: earth.id }); } catch (e) { c2 = String((e as Error).message); }
    console.log(`auction-only claim on ${earth.id} rejected with: ${c2}`);
    if (!c2.includes('AUCTION_ONLY')) throw new Error('expected AUCTION_ONLY');
  }

  const me = a.db.player.identity.find(a.identity!);
  console.log(`A credits ${me?.credits} portfolio ${me?.portfolioValue} claims ${me?.claimCount}`);
  const events = [...a.db.event.iter()].length;
  console.log(`events in table: ${events}`);
  console.log('SMOKE PASS');
  a.disconnect(); b.disconnect();
  process.exit(0);
}

main().catch(e => { console.error('SMOKE FAIL', e); process.exit(1); });
