import { loadSnapshots } from '../bot/loadSnapshots';
import { buildBreakdown } from '../bot/craftSourcing';
import type { MarketBundle } from '../features/watchlist/useMarketData';
import type { Recipe } from '../lib/recipes';
import type { ResolveDeps } from '../features/craftLists/resolveList';
import { validateBreakdownItems, buildListBreakdown } from './_list-breakdown-core';
import { loadMarketBundle } from '../lib/marketBundle';

async function handler(req: any, res: any) {
  // ── POST: whole-list breakdown (plugin Crafting Lists) ─────────────────────
  if (req.method === 'POST') {
    const items = validateBreakdownItems((req.body ?? {}).items);
    if (!items) {
      return res.status(400).json({ error: 'items must be a 1–200 entry array of { itemId, qty, hq? }' });
    }
    const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
    const snapshots = await loadSnapshots(baseUrl);
    const deps: ResolveDeps = {
      recipes: snapshots.recipes as Map<number, Recipe | null>,
      gathering: snapshots.gatheringCatalog,
      vendorMap: snapshots.vendorMap,
      specialShop: snapshots.specialShop,
      itemsById: snapshots.itemsById,
    };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(buildListBreakdown(items, deps));
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const itemIdStr = req.query.id;
  const qtyStr = req.query.qty;

  if (!itemIdStr || !qtyStr) {
    return res.status(400).json({ error: 'Missing id or qty query params' });
  }

  const itemId = parseInt(itemIdStr);
  const qty = parseInt(qtyStr);

  if (isNaN(itemId) || isNaN(qty) || qty < 1) {
    return res.status(400).json({ error: 'Invalid item id or qty' });
  }

  if (qty > 99999) {
    return res.status(400).json({ error: 'Quantity too large (max 99999)' });
  }

  const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
  const snapshots = await loadSnapshots(baseUrl);

  const itemName = snapshots.namesById.get(itemId) ?? `Item #${itemId}`;

  // Build a minimal market bundle (plugin doesn't need full market data)
  const market: MarketBundle = {
    dc: 'Unknown',
    world: 'Unknown',
    updated: Date.now(),
    prices: new Map(),
  };

  try {
    // Shared cold+hot loader (hourly cold + ~5-min hot, hot wins). See marketBundle.ts.
    const cache = await loadMarketBundle(process.env, {
      defaultColdUrl: `${baseUrl}/data/market-cache-cold.json`,
      defaultHotUrl: `${baseUrl}/data/market-cache-hot.json`,
    });
    const marketData = cache?.phantom ?? {};
    for (const [itemIdStr, entry] of Object.entries(marketData)) {
      const id = parseInt(itemIdStr);
      market.prices.set(id, {
        minNQ: (entry as any).minNQ,
        velocity: (entry as any).velocity,
      });
    }
  } catch {
    // Market cache is optional
  }

  const breakdown = buildBreakdown(itemId, qty, market, {
    recipes: snapshots.recipes,
    namesById: snapshots.namesById,
    vendorMap: snapshots.vendorMap,
    specialShop: snapshots.specialShop,
    gatheringCatalog: snapshots.gatheringCatalog,
    companyCraft: snapshots.companyCraft,
  });

  // Calculate total cost
  let totalCost = 0;
  for (const acquire of breakdown.acquire) {
    const price = market.prices.get(acquire.itemId);
    if (price) {
      totalCost += (price.minNQ || 0) * acquire.qtyNeeded;
    } else if (acquire.meta.price) {
      totalCost += acquire.meta.price * acquire.qtyNeeded;
    }
  }

  res.setHeader('Cache-Control', 'public, max-age=600');
  return res.status(200).json({
    itemId,
    itemName,
    quantity: qty,
    crafts: breakdown.crafts.map(c => ({
      itemId: c.itemId,
      itemName: c.itemName,
      qty: c.qtyNeeded,
      source: c.source,
    })),
    acquire: breakdown.acquire.map(a => ({
      itemId: a.itemId,
      itemName: a.itemName,
      qtyNeeded: a.qtyNeeded,
      source: a.source,
      meta: a.meta || {},
    })),
    totalCost: totalCost > 0 ? totalCost : undefined,
  });
}

export { handler as default };
