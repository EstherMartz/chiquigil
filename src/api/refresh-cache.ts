import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchMarketForOutputs } from '../bot/marketFetch';
import { writeMarketCache, writeBlobJson, readBlobJson } from '../bot/marketCache';
import { loadItemIds } from '../bot/loadSnapshots';
import { selectHotIds } from '../bot/hotSet';
import { scanDeals, mergeDeals, type Opportunity, type OpportunitiesFile } from '../bot/marketDiff';

const WORLD = process.env.HOME_WORLD ?? 'Phantom';
const DC = process.env.HOME_DC ?? 'Chaos';
const REGION = process.env.REGION ?? 'Europe';
const SECRET = process.env.REFRESH_SECRET ?? '';
const VELOCITY_THRESHOLD = Number(process.env.HOT_VELOCITY_THRESHOLD ?? 10);
// Items with at least this much sale velocity (in any scope) make up the "traded" set
// the hourly cold run fetches — a few thousand, vs all ~50k marketable items. Untraded
// items have no average/velocity so they never surface in a scan or the feed anyway.
const TRADED_THRESHOLD = Number(process.env.TRADED_VELOCITY_THRESHOLD ?? 1);
// How far the DC-cheapest must sit from an item's recent average to be a deal in the feed.
const OPP_DEAL_PCT = Number(process.env.OPP_DEAL_PCT ?? 25);

type Tier = 'hot' | 'cold' | 'full';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SECRET || req.query.token !== SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const tier: Tier = req.query.tier === 'hot' ? 'hot' : req.query.tier === 'full' ? 'full' : 'cold';
  const t0 = Date.now();
  try {
    const proto = req.headers['x-forwarded-proto'] ?? 'https';
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
    const baseUrl = `${proto}://${host}`;

    // Item set per tier:
    //   hot  → the small hot set (fast, every ~5 min)
    //   cold → the "traded" set (items with real velocity; hourly)
    //   full → the entire ~50k catalog (heavy; run occasionally to (re)discover the traded set)
    // hot/cold read a pre-seeded id blob and deliberately do NOT fall back to the full catalog:
    // that fallback ran the ~50k fetch on the frequent crons, pinning the function at its
    // timeout and silently burning the whole Fluid CPU budget. If the blob isn't seeded yet,
    // bail cheap (a one-off `?tier=full` run writes hot-ids.json + traded-ids.json).
    let ids: number[];
    if (tier === 'full') {
      ids = await loadItemIds(baseUrl);
    } else {
      const blobName = tier === 'hot' ? 'hot-ids.json' : 'traded-ids.json';
      const seeded = await readBlobJson<number[]>(blobName);
      if (!seeded || seeded.length === 0) {
        console.warn(`[refresh:${tier}] ${blobName} not seeded — run ?tier=full first`);
        return res.status(503).json({ error: `${blobName} not seeded — run ?tier=full first`, tier });
      }
      ids = seeded;
    }

    console.log(`[refresh:${tier}] fetching ${ids.length} items across 3 scopes...`);
    const bundle = await fetchMarketForOutputs(ids, WORLD, DC, REGION);

    // `full` and `cold` share the cold blob; `hot` has its own.
    const blobName = tier === 'hot' ? 'market-cache-hot.json' : 'market-cache-cold.json';

    const cache = { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts: Date.now() };
    const blobUrl = await writeMarketCache(cache, blobName);

    // Scan the current DC deals (cold + full only — both cover the same liquid universe;
    // the hot run sees just ~163 items, so letting it reconcile would wipe the feed every
    // 5 min). Still-present deals keep their first-seen time; stale ones drop off.
    let oppCount: number | undefined;
    if (tier !== 'hot') {
      const current: Opportunity[] = scanDeals(cache.dc, cache.ts, OPP_DEAL_PCT);
      const existing = (await readBlobJson<OpportunitiesFile>('opportunities.json'))?.opportunities ?? [];
      const merged = mergeDeals(existing, current);
      await writeBlobJson('opportunities.json', { ts: cache.ts, opportunities: merged } satisfies OpportunitiesFile);
      oppCount = merged.length;
    }

    // The full sweep (re)derives the traded set; full + cold refresh the hot set from
    // current velocities (the hot run itself only consumes it).
    let tradedCount: number | undefined;
    if (tier === 'full') {
      const tradedIds = selectHotIds(bundle, TRADED_THRESHOLD);
      await writeBlobJson('traded-ids.json', tradedIds);
      tradedCount = tradedIds.length;
    }
    let hotCount: number | undefined;
    if (tier !== 'hot') {
      const hotIds = selectHotIds(bundle, VELOCITY_THRESHOLD);
      await writeBlobJson('hot-ids.json', hotIds);
      hotCount = hotIds.length;
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[refresh:${tier}] done in ${elapsed}s, ${ids.length} items, blob: ${blobUrl}`);
    return res.status(200).json({ ok: true, tier, items: ids.length, tradedCount, hotCount, oppCount, elapsed: `${elapsed}s`, blobUrl });
  } catch (e) {
    console.error(`[refresh:${tier}] error:`, e);
    return res.status(500).json({ error: (e as Error).message });
  }
}
