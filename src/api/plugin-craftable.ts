import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadSnapshots } from '../bot/loadSnapshots';
import type { MarketData } from '../lib/universalis';

interface InventoryEntry { id: number; qty: number }

interface CraftableResult {
  itemId: number;
  name: string;
  qty: number;
  minNQ: number | null;
  velocity: number;
}

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse inventory from ?inv= query param (URL-encoded JSON array)
  let inventory: InventoryEntry[];
  try {
    const raw = req.query.inv;
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'Missing inv query param' });
    }
    inventory = JSON.parse(raw) as InventoryEntry[];
    if (!Array.isArray(inventory)) throw new Error('Not an array');
  } catch {
    return res.status(400).json({ error: 'inv must be a URL-encoded JSON array of {id, qty} objects' });
  }

  // Build a lookup map: itemId → qty in inventory
  const invMap = new Map<number, number>();
  for (const entry of inventory) {
    invMap.set(entry.id, (invMap.get(entry.id) ?? 0) + entry.qty);
  }

  // Load recipe snapshot
  const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
  const snapshots = await loadSnapshots(baseUrl);

  // Check each recipe: can we fully cover all ingredients?
  const craftable: CraftableResult[] = [];

  for (const [outputItemId, recipe] of snapshots.recipes) {
    const amountResult = recipe.amountResult ?? 1;

    // Find the minimum number of batches we can craft
    let canMake = Infinity;
    for (const ing of recipe.ingredients) {
      const have = invMap.get(ing.itemId) ?? 0;
      const batchesFromThis = Math.floor(have / ing.amount);
      if (batchesFromThis < canMake) canMake = batchesFromThis;
    }

    // Skip if we can't make even one batch
    if (!isFinite(canMake) || canMake === 0) continue;

    const totalQty = canMake * amountResult;
    const name = snapshots.namesById.get(outputItemId) ?? `Item #${outputItemId}`;

    craftable.push({
      itemId: outputItemId,
      name,
      qty: totalQty,
      minNQ: null,
      velocity: 0,
    });
  }

  if (craftable.length === 0) {
    return res.status(200).json({ craftable: [] });
  }

  // Fetch market prices from the hourly bot cache blob
  try {
    const cacheUrl = process.env.MARKET_CACHE_BLOB_URL ?? `${baseUrl}/data/market-cache.json`;
    const cacheRes = await fetch(cacheUrl, { cache: 'no-store' } as RequestInit);
    if (cacheRes.ok) {
      const cache = (await cacheRes.json()) as SharedCache;
      // Use phantom (home world) prices — client can send ?scope= in v2 if needed
      const market = cache.phantom;
      for (const item of craftable) {
        const entry = market[String(item.itemId)];
        if (entry) {
          item.minNQ = entry.minNQ;
          item.velocity = entry.velocity;
        }
      }
    }
  } catch {
    // Cache unavailable — return items without prices rather than failing
  }

  // Sort by estimated gil opportunity (minNQ × qty), descending
  craftable.sort((a, b) => {
    const aVal = (a.minNQ ?? 0) * a.qty;
    const bVal = (b.minNQ ?? 0) * b.qty;
    return bVal - aVal;
  });

  return res.status(200).json({ craftable });
}
