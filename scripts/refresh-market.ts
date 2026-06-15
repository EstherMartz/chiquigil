/**
 * Heavy market sweep for the scheduled GitHub Action (.github/workflows/refresh-market.yml).
 * Runs the full marketable sweep with no 300s limit and writes the cold cache, hot-ids,
 * and opportunities blobs to Cloudflare R2. Run: `npx tsx scripts/refresh-market.ts`.
 *
 * `||` (not `??`) on every env read: GitHub Actions passes an UNSET repo var as an
 * empty string, and Number('') === 0 — which would make the hot threshold 0 and pull
 * the entire marketable set into hot-ids. `|| default` handles both '' and undefined.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { refreshFull } from '../src/bot/refreshMarket';

const WORLD = process.env.HOME_WORLD || 'Phantom';
const DC = process.env.HOME_DC || 'Chaos';
const REGION = process.env.REGION || 'Europe';
const VELOCITY_THRESHOLD = Number(process.env.HOT_VELOCITY_THRESHOLD || 10);
const OPP_DEAL_PCT = Number(process.env.OPP_DEAL_PCT || 25);

async function main() {
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET) {
    throw new Error('R2 credentials missing (R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) — required to write cache blobs');
  }
  const path = join(process.cwd(), 'public', 'data', 'snapshots', 'marketable-ids.json');
  const { ids } = JSON.parse(await readFile(path, 'utf-8')) as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('marketable-ids.json missing or empty — run `npm run bake:marketable` first');
  }
  process.stdout.write(`[refresh-market] sweeping ${ids.length} marketable items across 3 scopes…\n`);
  const result = await refreshFull({
    ids, world: WORLD, dc: DC, region: REGION,
    velocityThreshold: VELOCITY_THRESHOLD, dealPct: OPP_DEAL_PCT,
  });
  process.stdout.write(`[refresh-market] done: ${JSON.stringify(result)}\n`);
}

main().catch((err) => {
  process.stderr.write(`refresh-market failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
