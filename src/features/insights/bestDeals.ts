import type { TrackedItem } from '../items/types';
import type { MarketData } from '../../lib/universalis';

export interface BestDealRow {
  id: number;
  name: string;
  crafter: TrackedItem['crafter'];
  currentMin: number;
  averagePrice: number;
  dealPct: number;
}

export interface BestDealsOpts {
  minDealPct: number;
}

export function findBestDeals(items: TrackedItem[], dc: MarketData, opts: BestDealsOpts): BestDealRow[] {
  const out: BestDealRow[] = [];
  for (const item of items) {
    const m = dc[item.id];
    if (!m || m.minNQ == null || m.averagePriceNQ == null || m.averagePriceNQ <= 0) continue;
    const dealPct = Math.round(((m.averagePriceNQ - m.minNQ) / m.averagePriceNQ) * 100);
    if (dealPct < opts.minDealPct) continue;
    out.push({
      id: item.id,
      name: item.name,
      crafter: item.crafter,
      currentMin: m.minNQ,
      averagePrice: m.averagePriceNQ,
      dealPct,
    });
  }
  return out.sort((a, b) => b.dealPct - a.dealPct);
}
