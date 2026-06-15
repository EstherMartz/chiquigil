import { fetchMarketForOutputs } from './marketFetch';
import { writeMarketCache, writeBlobJson, readBlobJson } from './marketCache';
import { selectHotIds } from './hotSet';
import { scanDeals, mergeDeals, type Opportunity, type OpportunitiesFile } from './marketDiff';

export interface ScopeConfig {
  world: string;
  dc: string;
  region: string;
}

export interface FullConfig extends ScopeConfig {
  ids: number[];
  velocityThreshold: number;
  dealPct: number;
}

export type HotResult =
  | { seeded: false }
  | { seeded: true; items: number; blobUrl: string };

/**
 * Light sweep for the Vercel 5-min cron: reads the pre-derived hot-ids.json
 * (written by the heavy GitHub Action sweep) and refreshes only those items into
 * market-cache-hot.json. Returns { seeded: false } when the id blob is absent so
 * the caller can 503 cheaply instead of guessing at the universe.
 */
export async function refreshHot(cfg: ScopeConfig): Promise<HotResult> {
  const ids = await readBlobJson<number[]>('hot-ids.json');
  if (!ids || ids.length === 0) return { seeded: false };
  const bundle = await fetchMarketForOutputs(ids, cfg.world, cfg.dc, cfg.region);
  const ts = Date.now();
  const blobUrl = await writeMarketCache(
    { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts },
    'market-cache-hot.json',
    300  // 5 min: matches hot-cache refresh cadence
  );
  return { seeded: true, items: ids.length, blobUrl };
}

/**
 * Heavy sweep for GitHub Actions (no 300s limit) or manual runs: fetches the full
 * marketable set, writes market-cache-cold.json, derives hot-ids.json from live
 * velocities, and refreshes the opportunities.json deal feed.
 */
export async function refreshFull(
  cfg: FullConfig,
): Promise<{ items: number; hotCount: number; oppCount: number; blobUrl: string }> {
  const bundle = await fetchMarketForOutputs(cfg.ids, cfg.world, cfg.dc, cfg.region);
  const ts = Date.now();
  const blobUrl = await writeMarketCache(
    { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts },
    'market-cache-cold.json',
    3600  // 1 hour: matches cold-cache hourly refresh cadence
  );

  const current: Opportunity[] = scanDeals(bundle.dc, ts, cfg.dealPct);
  const existing = (await readBlobJson<OpportunitiesFile>('opportunities.json'))?.opportunities ?? [];
  const merged = mergeDeals(existing, current);
  await writeBlobJson(
    'opportunities.json',
    { ts, opportunities: merged } satisfies OpportunitiesFile,
    3600  // 1 hour: same as cold cache
  );

  const hotIds = selectHotIds(bundle, cfg.velocityThreshold);
  await writeBlobJson('hot-ids.json', hotIds, 3600);  // 1 hour: same as cold cache

  return { items: cfg.ids.length, hotCount: hotIds.length, oppCount: merged.length, blobUrl };
}
