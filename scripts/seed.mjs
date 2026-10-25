#!/usr/bin/env node
// Seed celestial_object from client/public/data/objects.json in chunks via the CLI.
// Usage: node scripts/seed.mjs [--server local|maincloud] [--db placex-local] [--chunk 400]
// Uses the logged-in CLI identity, which must be the module publisher (admin).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const server = opt('--server', 'local');
const db = opt('--db', server === 'local' ? 'placex-local' : 'placex');
const chunkSize = Number(opt('--chunk', '400'));

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const objects = JSON.parse(readFileSync(resolve(root, 'client/public/data/objects.json'), 'utf8'));
console.log(`seeding ${objects.length} objects into ${db} on ${server} in chunks of ${chunkSize}`);

const rows = objects.map(o => ({
  id: o.id, name: o.name, system: o.system, x: o.x, y: o.y, z: o.z, cls: o.cls,
  price_credits: Math.round(o.priceCredits), value_usd: o.valueUsd,
  auction_only: !!o.auctionOnly, habitable_zone: !!o.habitableZone,
}));

let ok = 0;
for (let i = 0; i < rows.length; i += chunkSize) {
  const chunk = rows.slice(i, i + chunkSize);
  const r = spawnSync('spacetime', ['call', db, 'seed_objects', JSON.stringify(chunk), '--server', server, '--no-config'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) { console.error(`chunk ${i} failed:\n${r.stdout}\n${r.stderr}`); process.exit(1); }
  ok += chunk.length;
  process.stdout.write(`\r${ok}/${rows.length}`);
}
console.log('\nseed complete');
