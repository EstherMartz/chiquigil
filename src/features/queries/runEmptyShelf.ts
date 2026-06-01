import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { EmptyShelfFilter, EmptyShelfRow, EmptyShelfSort, HqMode } from './types';

const DAY_MS = 86_400_000;

function pickTier(m: MarketItem, hq: HqMode): { price: number; isHq: boolean } | null {
  const nq = m.medianNQ ?? m.averagePriceNQ;
  const hqp = m.medianHQ ?? m.averagePriceHQ;
  const nqTier = nq != null && nq > 0 ? { price: nq, isHq: false } : null;
  const hqTier = hqp != null && hqp > 0 ? { price: hqp, isHq: true } : null;
  if (hq === 'nq') return nqTier;
  if (hq === 'hq') return hqTier;
  if (nqTier && hqTier) return m.recentSalesHQ > m.recentSalesNQ ? hqTier : nqTier;
  return nqTier ?? hqTier;
}

function compare(a: EmptyShelfRow, b: EmptyShelfRow, sort: EmptyShelfSort): number {
  switch (sort) {
    case 'freshness': {
      const ad = a.daysSinceLastSale, bd = b.daysSinceLastSale;
      if (ad == null && bd == null) return 0;
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad - bd;
    }
    case 'velocity':       return b.velocity - a.velocity;
    case 'estGilPerDay':   return b.estGilPerDay - a.estGilPerDay;
    case 'suggestedPrice': return b.suggestedPrice - a.suggestedPrice;
  }
}

export function runEmptyShelf(
  snapshot: SnapshotItem[],
  market: MarketData,
  filter: EmptyShelfFilter,
  nowMs: number,
): EmptyShelfRow[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: EmptyShelfRow[] = [];

  for (const it of snapshot) {
    if (catSet && !catSet.has(it.sc)) continue;
    if (filter.hq === 'hq' && !it.canHq) continue;
    const m = market[it.id];
    if (!m) continue;
    if (m.listingCount > filter.maxListings) continue;
    if (m.velocity < filter.minVelocity) continue;
    const tier = pickTier(m, filter.hq);
    if (!tier) continue;

    const daysSinceLastSale = m.lastSaleMs != null ? (nowMs - m.lastSaleMs) / DAY_MS : null;
    if (filter.maxDaysSinceSale != null && daysSinceLastSale != null && daysSinceLastSale > filter.maxDaysSinceSale) continue;

    out.push({
      id: it.id, name: it.name, sc: it.sc, hq: tier.isHq,
      suggestedPrice: Math.round(tier.price),
      velocity: m.velocity,
      lastSaleMs: m.lastSaleMs ?? null,
      daysSinceLastSale,
      estGilPerDay: Math.round(tier.price * m.velocity),
    });
  }

  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
