import { loadSnapshots } from './loadSnapshots';
import { parseMarketResponse, type MarketData } from '../../src/lib/universalis';
import type { MarketBundle } from '../../src/features/watchlist/useMarketData';
import { invalidateCache, pushToCache, saveCacheToDisk } from './chat/tools';

const BATCH_SIZE = 100;
const MAX_CONCURRENT = 8;

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
  batches: number[][],
  label: string,
  onBatch: () => void,
): Promise<MarketData> {
  const out: MarketData = {};
  let cursor = 0;

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, batches.length) }, async () => {
    while (cursor < batches.length) {
      const idx = cursor++;
      Object.assign(out, await fetchBatch(scope, batches[idx]));
      onBatch();
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const start = Date.now();
  console.log('\n🔄 Refreshing market cache…\n');

  console.log('Loading snapshots…');
  const snapshots = await loadSnapshots(config.snapshotsDir);
  console.log(`  ${snapshots.itemsById.size} items, ${snapshots.recipes.size} recipes, ${snapshots.vendorMap.size} vendor prices\n`);

  // Merge all IDs into one deduplicated set
  const snapshot = [...snapshots.itemsById.values()];
  const craftableIds = snapshot.filter((i) => snapshots.recipes.has(i.id)).map((i) => i.id);
  const vendorIds = [...snapshots.vendorMap.keys()];
  const allIds = [...new Set([...craftableIds, ...vendorIds])].filter((id) => id > 0).sort((a, b) => a - b);

  const batches: number[][] = [];
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) batches.push(allIds.slice(i, i + BATCH_SIZE));

  const totalBatches = batches.length * 3; // 3 scopes
  let completed = 0;
  const tick = () => { completed++; progressBar(completed, totalBatches, 'Total   '); };

  console.log(`  ${allIds.length} unique items → ${batches.length} batches × 3 scopes (${totalBatches} total)`);
  console.log(`  ${MAX_CONCURRENT} concurrent workers per scope, all 3 scopes in parallel\n`);

  progressBar(0, totalBatches, 'Total   ');

  // Fetch all 3 scopes in parallel
  const [phantom, dc, region] = await Promise.all([
    fetchScopeWithProgress(config.world, batches, 'Phantom', tick),
    fetchScopeWithProgress(config.dc, batches, 'DC', tick),
    fetchScopeWithProgress(config.region, batches, 'Europe', tick),
  ]);

  // Save to disk so the bot picks it up
  invalidateCache();
  const merged: MarketBundle = { phantom, dc, region };
  pushToCache(allIds, merged);
  await saveCacheToDisk();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Cache refreshed and saved to disk in ${elapsed}s — ${allIds.length} items across 3 scopes`);
  console.log('   The bot will load this cache automatically on next startup or warmup cycle.\n');
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
