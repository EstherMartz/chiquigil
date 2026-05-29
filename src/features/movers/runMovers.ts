import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';

export interface MoverFilter {
  minVelocity: number;
  minDevPct: number;
  minPrice: number;
}

export interface MoverRow {
  id: number;
  name: string;
  sc: number;
  /** Current cheapest NQ listing. */
  price: number;
  /** Recent average NQ sale price. */
  avg: number;
  /** (price − avg) / avg × 100, signed. */
  devPct: number;
  velocity: number;
  gilPerDay: number;
  direction: 'up' | 'down';
}

/**
 * "Market movers" — items whose current price deviates sharply from their recent
 * average, weighted by velocity. Computed entirely from bulk market fields
 * (minNQ vs avgNQ + velocity); no per-item history needed.
 */
export function runMovers(
  items: SnapshotItem[],
  priceMap: MarketData,
  filter: MoverFilter,
): MoverRow[] {
  const out: MoverRow[] = [];
  for (const item of items) {
    if (item.sc <= 0) continue; // tradeable only
    const m = priceMap[String(item.id)];
    if (!m) continue;
    const price = m.minNQ;
    const avg = m.avgNQ;
    if (price == null || avg == null || avg <= 0) continue;
    if (price < filter.minPrice) continue;
    if (m.velocity < filter.minVelocity) continue;
    const devPct = ((price - avg) / avg) * 100;
    if (Math.abs(devPct) < filter.minDevPct) continue;

    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      price,
      avg,
      devPct,
      velocity: m.velocity,
      gilPerDay: price * m.velocity,
      direction: devPct >= 0 ? 'up' : 'down',
    });
  }
  // Most abnormal + liquid first (default order; the view can re-sort by column).
  out.sort((a, b) => Math.abs(b.devPct) * b.velocity - Math.abs(a.devPct) * a.velocity);
  return out;
}
