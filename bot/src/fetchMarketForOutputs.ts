import { parseMarketResponse, type MarketData, type MarketItem } from '../../src/lib/universalis';
import type { MarketBundle } from '../../src/features/watchlist/useMarketData';

interface Config {
  world: string;
  dc: string;
  region: string;
}

const BATCH_SIZE = 100;
const MAX_CONCURRENT = 4;

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
      // retry on network error
    }
  }
  return {};
}

async function fetchScope(scope: string, ids: number[], onProgress?: (done: number, total: number) => void): Promise<MarketData> {
  const out: MarketData = {};
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE));

  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, batches.length) }, async () => {
    while (cursor < batches.length) {
      const idx = cursor++;
      Object.assign(out, await fetchBatch(scope, batches[idx]));
      done++;
      onProgress?.(done, batches.length);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function fetchMarketForOutputs(
  outputItemIds: number[],
  cfg: Config,
): Promise<MarketBundle> {
  const ids = Array.from(new Set(outputItemIds)).filter((id) => id > 0).sort((a, b) => a - b);
  if (ids.length === 0) return { phantom: {}, dc: {}, region: {} };

  const totalBatches = Math.ceil(ids.length / BATCH_SIZE);
  const scopeDone = { [cfg.world]: 0, [cfg.dc]: 0, [cfg.region]: 0 };
  let lastLog = 0;

  const logProgress = (scope: string, done: number, total: number) => {
    scopeDone[scope] = done;
    const allDone = Object.values(scopeDone).reduce((a, b) => a + b, 0);
    const allTotal = totalBatches * 3;
    const pct = Math.round((allDone / allTotal) * 100);
    // Log at most every 2 seconds to avoid spam
    const now = Date.now();
    if (now - lastLog >= 2000 || allDone === allTotal) {
      lastLog = now;
      const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
      console.log(`[cache] fetching: ${bar} ${pct}% (${allDone}/${allTotal} batches)`);
    }
  };

  const [phantom, dc, region] = await Promise.all([
    fetchScope(cfg.world, ids, (d, t) => logProgress(cfg.world, d, t)),
    fetchScope(cfg.dc, ids, (d, t) => logProgress(cfg.dc, d, t)),
    fetchScope(cfg.region, ids, (d, t) => logProgress(cfg.region, d, t)),
  ]);
  return { phantom, dc, region };
}

export type { MarketItem };
