import { parseMarketResponse, type MarketData } from '../lib/universalis.js';

const BATCH_SIZE = 100;
const MAX_CONCURRENT = 8;

async function fetchBatch(scope: string, ids: number[]): Promise<MarketData> {
  const url = `https://universalis.app/api/v2/${scope}/${ids.join(',')}?listings=10&entries=15`;
  let res = await fetch(url);
  if (!res.ok) {
    await new Promise(r => setTimeout(r, 400));
    res = await fetch(url);
  }
  if (!res.ok) return {};
  const raw = await res.json();
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
