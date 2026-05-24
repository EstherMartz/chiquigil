import { loadSnapshots } from './loadSnapshots';
import { parseMarketResponse, type MarketData } from '../../src/lib/universalis';
import type { MarketBundle } from '../../src/features/watchlist/useMarketData';
import { invalidateCache } from './chat/tools';

const BATCH_SIZE = 100;
const MAX_CONCURRENT = 4;

const config = {
  world: process.env.HOME_WORLD ?? 'Phantom',
  dc: process.env.HOME_DC ?? 'Chaos',
  region: process.env.REGION ?? 'Europe',
  snapshotsDir: process.env.SNAPSHOTS_DIR ?? '../public/data/snapshots',
};

function progressBar(current: number, total: number, label: string): void {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round(pct / 2);
  const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
  process.stdout.write(`\r  ${label} [${bar}] ${pct}% (${current}/${total})`);
  if (current === total) process.stdout.write('\n');
}

async function fetchBatch(scope: string, batch: number[]): Promise<MarketData> {
  const url = `https://universalis.app/api/v2/${scope}/${batch.join(',')}?listings=10&entries=15`;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(url);
      if (res.status === 404) return {};
      if (!res.ok) continue;
      const raw = await res.json();
      return parseMarketResponse(raw as Parameters<typeof parseMarketResponse>[0]);
    } catch {
      // retry
    }
  }
  return {};
}

async function fetchScopeWithProgress(
  scope: string,
  ids: number[],
  label: string,
): Promise<MarketData> {
  const out: MarketData = {};
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE));

  let completed = 0;
  let cursor = 0;
  progressBar(0, batches.length, label);

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, batches.length) }, async () => {
    while (cursor < batches.length) {
      const idx = cursor++;
      Object.assign(out, await fetchBatch(scope, batches[idx]));
      completed++;
      progressBar(completed, batches.length, label);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchWithProgress(ids: number[]): Promise<MarketBundle> {
  const sorted = Array.from(new Set(ids)).filter((id) => id > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return { phantom: {}, dc: {}, region: {} };

  const batchCount = Math.ceil(sorted.length / BATCH_SIZE);
  console.log(`  ${sorted.length} items → ${batchCount} batches × 3 scopes\n`);

  const phantom = await fetchScopeWithProgress(config.world, sorted, 'Phantom ');
  const dc = await fetchScopeWithProgress(config.dc, sorted, 'Chaos DC');
  const region = await fetchScopeWithProgress(config.region, sorted, 'Europe  ');

  return { phantom, dc, region };
}

async function main() {
  const start = Date.now();
  console.log('\n🔄 Refreshing market cache…\n');

  console.log('Loading snapshots…');
  const snapshots = await loadSnapshots(config.snapshotsDir);
  console.log(`  ${snapshots.itemsById.size} items, ${snapshots.recipes.size} recipes, ${snapshots.vendorMap.size} vendor prices\n`);

  // Craftable items
  const snapshot = [...snapshots.itemsById.values()];
  const craftableIds = snapshot.filter((i) => snapshots.recipes.has(i.id)).map((i) => i.id);
  console.log(`📦 Craftable items (${craftableIds.length}):`);
  const craftMarket = await fetchWithProgress(craftableIds);

  // Vendor items
  const vendorIds = [...snapshots.vendorMap.keys()];
  console.log(`\n🏪 Vendor items (${vendorIds.length}):`);
  const vendorMarket = await fetchWithProgress(vendorIds);

  // Push into the in-memory cache used by the bot
  invalidateCache();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Cache refreshed in ${elapsed}s\n`);
  console.log('Note: This pre-fetched data. Restart the bot to pick up the fresh cache via auto-warmup.\n');
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
