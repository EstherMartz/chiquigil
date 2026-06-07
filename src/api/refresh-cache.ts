import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchMarketForOutputs } from '../bot/marketFetch';
import { writeMarketCache, writeBlobJson, readBlobJson } from '../bot/marketCache';
import { loadItemIds } from '../bot/loadSnapshots';
import { selectHotIds } from '../bot/hotSet';
import { diffMarket, mergeOpportunities, type Opportunity, type OpportunitiesFile } from '../bot/marketDiff';

const WORLD = process.env.HOME_WORLD ?? 'Phantom';
const DC = process.env.HOME_DC ?? 'Chaos';
const REGION = process.env.REGION ?? 'Europe';
const SECRET = process.env.REFRESH_SECRET ?? '';
const VELOCITY_THRESHOLD = Number(process.env.HOT_VELOCITY_THRESHOLD ?? 10);
const OPP_TTL_MS = 2 * 60 * 60 * 1000; // 2h rolling window for the opportunity feed

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SECRET || req.query.token !== SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const tier = req.query.tier === 'hot' ? 'hot' : 'cold';
  const t0 = Date.now();
  try {
    const proto = req.headers['x-forwarded-proto'] ?? 'https';
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
    const baseUrl = `${proto}://${host}`;

    // Hot tier fetches only the previously-derived hot set; cold fetches everything.
    const ids = tier === 'hot'
      ? (await readBlobJson<number[]>('hot-ids.json')) ?? (await loadItemIds(baseUrl))
      : await loadItemIds(baseUrl);

    console.log(`[refresh:${tier}] fetching ${ids.length} items across 3 scopes...`);
    const bundle = await fetchMarketForOutputs(ids, WORLD, DC, REGION);

    const blobName = tier === 'hot' ? 'market-cache-hot.json' : 'market-cache-cold.json';
    // Read the previous same-tier blob BEFORE overwriting it, to diff against.
    const prev = await readBlobJson<{ dc: typeof bundle.dc }>(blobName);

    const cache = { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts: Date.now() };
    const blobUrl = await writeMarketCache(cache, blobName);

    // Detect "what just changed" on the DC scope and merge into the rolling feed.
    let oppCount: number | undefined;
    if (prev) {
      const fresh: Opportunity[] = diffMarket(prev.dc, cache.dc, cache.ts);
      const existing = (await readBlobJson<OpportunitiesFile>('opportunities.json'))?.opportunities ?? [];
      const merged = mergeOpportunities(existing, fresh, OPP_TTL_MS, cache.ts);
      await writeBlobJson('opportunities.json', { ts: cache.ts, opportunities: merged } satisfies OpportunitiesFile);
      oppCount = merged.length;
    }

    // The cold (full) run re-derives the hot ID set for the next hot run.
    let hotCount: number | undefined;
    if (tier === 'cold') {
      const hotIds = selectHotIds(bundle, VELOCITY_THRESHOLD);
      await writeBlobJson('hot-ids.json', hotIds);
      hotCount = hotIds.length;
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[refresh:${tier}] done in ${elapsed}s, ${ids.length} items, blob: ${blobUrl}`);
    return res.status(200).json({ ok: true, tier, items: ids.length, hotCount, oppCount, elapsed: `${elapsed}s`, blobUrl });
  } catch (e) {
    console.error(`[refresh:${tier}] error:`, e);
    return res.status(500).json({ error: (e as Error).message });
  }
}
