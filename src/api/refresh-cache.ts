import type { VercelRequest, VercelResponse } from '@vercel/node';
import { refreshHot } from '../bot/refreshMarket';

// The heavy marketable sweep (cold cache + hot-ids + opportunities) runs in the
// refresh-market GitHub Action — it cannot fit Vercel's 300s limit. This lambda
// only runs the cheap 5-min hot tier: refresh the pre-derived hot-ids set.
const WORLD = process.env.HOME_WORLD ?? 'Phantom';
const DC = process.env.HOME_DC ?? 'Chaos';
const REGION = process.env.REGION ?? 'Europe';
const SECRET = process.env.REFRESH_SECRET ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SECRET || req.query.token !== SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const t0 = Date.now();
  try {
    const result = await refreshHot({ world: WORLD, dc: DC, region: REGION });
    if (!result.seeded) {
      console.warn('[refresh:hot] hot-ids.json not seeded — run the refresh-market GitHub Action first');
      return res.status(503).json({ error: 'hot-ids.json not seeded — run the refresh-market GitHub Action first' });
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[refresh:hot] done in ${elapsed}s, ${result.items} items, blob: ${result.blobUrl}`);
    return res.status(200).json({ ok: true, items: result.items, elapsed: `${elapsed}s`, blobUrl: result.blobUrl });
  } catch (e) {
    console.error('[refresh:hot] error:', e);
    return res.status(500).json({ error: (e as Error).message });
  }
}
