import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SpecialShopSnapshot, ShopEntry } from '../../lib/specialShopSnapshot';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import type { HqMode, CurrencyFlipFilter, CurrencyFlipRow, CurrencyFlipSort } from './types';

interface SaleTier { unit: number; isHq: boolean }

function pickTrustedSaleTier(m: MarketItem, hq: HqMode, canHq: boolean): SaleTier | null {
  const candidates: Array<{ rawMin: number | null; median: number | null; recent: number; isHq: boolean }> = [];
  if ((hq === 'hq' || hq === 'either') && canHq) {
    candidates.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  }
  if (hq === 'nq' || hq === 'either') {
    candidates.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  }
  // For 'either', score each candidate and pick the higher trusted price.
  let best: SaleTier | null = null;
  for (const c of candidates) {
    if (c.rawMin == null) continue;
    if (c.recent < MIN_RECENT_SALES) continue;
    if (c.median == null) continue;
    if (c.rawMin > c.median * MAX_LISTING_RATIO) continue;
    const unit = Math.min(c.rawMin, c.median);
    if (!best || unit > best.unit) best = { unit, isHq: c.isHq };
  }
  return best;
}

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
    const tier = pickTrustedSaleTier(market, effectiveHq, item.canHq);
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
