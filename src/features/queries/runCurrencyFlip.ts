import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { SpecialShopSnapshot, ShopEntry } from '../../lib/specialShopSnapshot';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import type { HqMode, CurrencyFlipFilter, CurrencyFlipRow, CurrencyFlipSort } from './types';

function compareRows(a: CurrencyFlipRow, b: CurrencyFlipRow, sort: CurrencyFlipSort): number {
  switch (sort) {
    case 'gilPerUnit':  return b.gilPerUnit - a.gilPerUnit;
    case 'salePrice':   return b.salePrice - a.salePrice;
    case 'velocity':    return b.velocity - a.velocity;
    case 'costPerUnit': return b.costPerUnit - a.costPerUnit;
  }
}

export function runCurrencyFlip(
  snapshot: SnapshotItem[],
  shopSnapshot: SpecialShopSnapshot,
  saleMap: MarketData,
  filter: CurrencyFlipFilter,
): CurrencyFlipRow[] {
  const entries: ShopEntry[] = shopSnapshot.byCurrency.get(filter.currency) ?? [];
  if (entries.length === 0) return [];

  const itemById = new Map<number, SnapshotItem>();
  for (const item of snapshot) itemById.set(item.id, item);

  const out: CurrencyFlipRow[] = [];
  for (const entry of entries) {
    const item = itemById.get(entry.itemId);
    if (!item) continue;
    const market = saleMap[entry.itemId];
    if (!market) continue;
    if (market.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && market.listingCount > filter.maxListings) continue;

    const effectiveHq: HqMode = entry.isHq ? 'hq' : filter.hq;
    const tier = pickHighestTrustedTier(market, effectiveHq, item.canHq);
    if (!tier) continue;

    const gilPerUnit = tier.unit / entry.costPerUnit;
    if (gilPerUnit < filter.minGilPerUnit) continue;

    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      costPerUnit: entry.costPerUnit,
      salePrice: tier.unit,
      hq: tier.isHq,
      gilPerUnit,
      velocity: market.velocity,
      listingCount: market.listingCount,
    });
  }

  out.sort((a, b) => {
    const cmp = compareRows(a, b, filter.sort);
    return cmp !== 0 ? cmp : a.id - b.id;
  });
  return out.slice(0, filter.limit);
}
