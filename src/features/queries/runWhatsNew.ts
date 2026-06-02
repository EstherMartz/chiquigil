import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { WhatsNewFilter, WhatsNewRow, WhatsNewSort } from './types';

const DAY_MS = 86_400_000;

/** Pick the sale-side price tier, preferring whichever tier sold more recently. */
function pickPrice(m: MarketItem): { price: number; isHq: boolean } | null {
  const nq = m.medianNQ ?? m.averagePriceNQ;
  const hq = m.medianHQ ?? m.averagePriceHQ;
  const nqTier = nq != null && nq > 0 ? { price: nq, isHq: false } : null;
  const hqTier = hq != null && hq > 0 ? { price: hq, isHq: true } : null;
  if (nqTier && hqTier) return m.recentSalesHQ > m.recentSalesNQ ? hqTier : nqTier;
  return nqTier ?? hqTier;
}

function compare(a: WhatsNewRow, b: WhatsNewRow, sort: WhatsNewSort): number {
  switch (sort) {
    case 'velocity': return b.velocity - a.velocity;
    case 'price':    return (b.price ?? -1) - (a.price ?? -1);
    case 'name':     return a.name.localeCompare(b.name);
    case 'freshness': {
      const ad = a.daysSinceLastSale, bd = b.daysSinceLastSale;
      if (ad == null && bd == null) return 0;
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad - bd;
    }
  }
}

export function runWhatsNew(
  ids: number[],
  items: Map<number, SnapshotItem>,
  market: MarketData,
  recipeKeys: Set<number>,
  filter: WhatsNewFilter,
  nowMs: number,
): WhatsNewRow[] {
  const out: WhatsNewRow[] = [];
  for (const id of ids) {
    const it = items.get(id);
    if (!it) continue; // ID no longer in catalog
    if (filter.categories.length > 0 && !filter.categories.includes(it.sc)) continue;
    const m = market[id];
    if (filter.tradeableOnly && !m) continue;
    if (m && m.velocity < filter.minVelocity) continue;

    const tier = m ? pickPrice(m) : null;
    const lastSaleMs = m?.lastSaleMs ?? null;
    out.push({
      id: it.id,
      name: it.name,
      sc: it.sc,
      craftable: recipeKeys.has(it.id),
      hq: tier?.isHq ?? false,
      price: tier ? Math.round(tier.price) : null,
      velocity: m?.velocity ?? 0,
      recentSales: m ? m.recentSalesNQ + m.recentSalesHQ : 0,
      lastSaleMs,
      daysSinceLastSale: lastSaleMs != null ? (nowMs - lastSaleMs) / DAY_MS : null,
    });
  }
  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
