import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchMarketForOutputs } from '../bot/marketFetch';
import { writeMarketCache } from '../bot/marketCache';
import { loadSnapshots } from '../bot/loadSnapshots';

const WORLD = process.env.HOME_WORLD ?? 'Phantom';
const DC = process.env.HOME_DC ?? 'Chaos';
const REGION = process.env.REGION ?? 'Europe';
const SECRET = process.env.REFRESH_SECRET ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SECRET || req.query.token !== SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const t0 = Date.now();
  try {
    const proto = req.headers['x-forwarded-proto'] ?? 'https';
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
    const baseUrl = `${proto}://${host}`;

    const snapshots = await loadSnapshots(baseUrl);
    const ids = [...snapshots.itemsById.keys()];

    console.log(`[refresh] fetching ${ids.length} items across 3 scopes...`);
    const bundle = await fetchMarketForOutputs(ids, WORLD, DC, REGION);

    const cache = { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts: Date.now() };
    const blobUrl = await writeMarketCache(cache);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[refresh] done in ${elapsed}s, ${ids.length} items, blob: ${blobUrl}`);
    return res.status(200).json({ ok: true, items: ids.length, elapsed: `${elapsed}s`, blobUrl });
  } catch (e) {
    console.error('[refresh] error:', e);
    return res.status(500).json({ error: (e as Error).message });
  }
}
