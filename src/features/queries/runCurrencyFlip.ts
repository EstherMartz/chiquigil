import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { SpecialShopSnapshot, ShopEntry } from '../../lib/specialShopSnapshot';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import { descBy } from '../../lib/sort';
import { passesMarketGate } from './commonFilters';
import type { HqMode, CurrencyFlipFilter, CurrencyFlipRow, CurrencyFlipSort } from './types';

const COMPARATORS: Record<CurrencyFlipSort, (a: CurrencyFlipRow, b: CurrencyFlipRow) => number> = {
  gilPerUnit:  descBy((r) => r.gilPerUnit),
  salePrice:   descBy((r) => r.salePrice),
  velocity:    descBy((r) => r.velocity),
  costPerUnit: descBy((r) => r.costPerUnit),
};

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
    if (!passesMarketGate(market, { minVelocity: filter.minVelocity, maxListings: filter.maxListings ?? null })) continue;

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
    const cmp = COMPARATORS[filter.sort](a, b);
    return cmp !== 0 ? cmp : a.id - b.id;
  });
  return out.slice(0, filter.limit);
}
