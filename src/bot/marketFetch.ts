import { parseMarketResponse, LISTINGS_CAP, marketFields, type MarketData } from '../lib/universalis';

const BATCH_SIZE = 100;
const MAX_CONCURRENT = 8;

async function fetchBatch(scope: string, ids: number[]): Promise<MarketData> {
  // Fetch up to LISTINGS_CAP listings so Universalis' listingsCount is the true
  // total (it only counts returned rows); the parser keeps just the cheapest few.
  const url = `https://universalis.app/api/v2/${scope}/${ids.join(',')}?listings=${LISTINGS_CAP}&entries=15&fields=${marketFields(ids.length)}`;
  let res = await fetch(url);
  if (!res.ok) {
    await new Promise(r => setTimeout(r, 400));
    res = await fetch(url);
  }
  if (!res.ok) return {};
  // Universalis sometimes returns 200 with a non-JSON body (a rate-limit / Cloudflare
  // page). res.json() then throws; without this guard the rejection propagates through
  // the worker pool and 500s the whole refresh. Treat a bad body as an empty batch.
  let raw: unknown;
  try {
    raw = await res.json();
  } catch (e) {
    console.warn(`[marketFetch] ${scope}: non-JSON body for ${ids.length}-id batch — ${e instanceof Error ? e.message : String(e)}`);
    return {};
  }
  return parseMarketResponse(raw as Parameters<typeof parseMarketResponse>[0]);
}

async function fetchScope(scope: string, batches: number[][]): Promise<MarketData> {
  const merged: MarketData = {};
  const queue = [...batches];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const idx = cursor++;
      const result = await fetchBatch(scope, queue[idx]);
      Object.assign(merged, result);
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () => worker());
  await Promise.all(workers);
  return merged;
}

export interface MarketBundle {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
}

export async function fetchMarketForOutputs(
  ids: number[],
  world: string,
  dc: string,
  region: string,
): Promise<MarketBundle> {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  const batches: number[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    batches.push(unique.slice(i, i + BATCH_SIZE));
  }

  const [phantom, dcData, regionData] = await Promise.all([
    fetchScope(world, batches),
    fetchScope(dc, batches),
    fetchScope(region, batches),
  ]);

  return { phantom, dc: dcData, region: regionData };
}
