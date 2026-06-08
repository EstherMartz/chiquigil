import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { HqMode, QueryFilter, QueryResultRow, QuerySort } from './types';

function pickTier(m: MarketItem, hq: HqMode): { unit: number; avg: number; isHq: boolean } | null {
  const hqUnit = m.minHQ, hqAvg = m.averagePriceHQ;
  const nqUnit = m.minNQ, nqAvg = m.averagePriceNQ;

  function tierFor(unit: number | null, avg: number | null, isHq: boolean) {
    if (avg == null || avg <= 0) return null;
    // Out-of-stock fallback: use historical avg as the "unit" so the row survives.
    return { unit: unit ?? avg, avg, isHq };
  }

  if (hq === 'hq') return tierFor(hqUnit, hqAvg, true);
  if (hq === 'nq') return tierFor(nqUnit, nqAvg, false);

  const candidates = [tierFor(hqUnit, hqAvg, true), tierFor(nqUnit, nqAvg, false)]
    .filter((c): c is { unit: number; avg: number; isHq: boolean } => c !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.unit <= b.unit ? a : b));
}

function compare(a: QueryResultRow, b: QueryResultRow, sort: QuerySort): number {
  switch (sort) {
    case 'discount':  return b.dealPct - a.dealPct;
    case 'gilFlow':   return b.gilFlow - a.gilFlow;
    case 'velocity':  return b.velocity - a.velocity;
    case 'unitPrice': return b.unitPrice - a.unitPrice;
    default:          return 0; // selfSourceGilFlow is craft-mode only
  }
}

export function runQuery(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  filter: QueryFilter,
): QueryResultRow[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: QueryResultRow[] = [];

  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === 'hq' && !item.canHq) continue;
    const m = priceMap[item.id];
    if (!m) continue;
    const tier = pickTier(m, filter.hq);
    if (!tier) continue;

    const dealPct = Math.round(((tier.avg - tier.unit) / tier.avg) * 100);
    const gilFlow = tier.unit * m.velocity;

    if (dealPct < filter.minDealPct) continue;
    if (m.velocity < filter.minVelocity) continue;
    if (filter.minPrice != null && tier.unit < filter.minPrice) continue;
    if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;
    if (filter.maxListings != null && m.listingCount > filter.maxListings) continue;

    out.push({
      id: item.id, name: item.name, sc: item.sc,
      unitPrice: tier.unit, averagePrice: tier.avg,
      dealPct, velocity: m.velocity, gilFlow, hq: tier.isHq,
    });
  }

  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
