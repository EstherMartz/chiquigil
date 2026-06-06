import { loadSnapshots } from '../bot/loadSnapshots';
import { buildBreakdown } from '../bot/craftSourcing';
import type { MarketBundle } from '../features/watchlist/useMarketData';

async function handler(req: any, res: any) {
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
    // Fetch market prices for cost calculation
    const cacheUrl = process.env.MARKET_CACHE_BLOB_URL ?? `${baseUrl}/data/market-cache.json`;
    const cacheRes = await fetch(cacheUrl, { cache: 'no-store' });
    if (cacheRes.ok) {
      const cache = await cacheRes.json();
      const marketData = cache.phantom;
      for (const [itemIdStr, entry] of Object.entries(marketData)) {
        const id = parseInt(itemIdStr);
        market.prices.set(id, {
          minNQ: (entry as any).minNQ,
          velocity: (entry as any).velocity,
        });
      }
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
