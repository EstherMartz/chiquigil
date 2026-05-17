import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import type { HqMode, VendorFlipFilter, VendorFlipRow, VendorFlipSort } from './types';

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

function compareRows(a: VendorFlipRow, b: VendorFlipRow, sort: VendorFlipSort): number {
  switch (sort) {
    case 'profitPerDay':  return b.profitPerDay - a.profitPerDay;
    case 'markup':        return b.markup - a.markup;
    case 'profitPerUnit': return b.profitPerUnit - a.profitPerUnit;
    case 'salePrice':     return b.salePrice - a.salePrice;
    case 'velocity':      return b.velocity - a.velocity;
  }
}

export function runVendorFlip(
  snapshot: SnapshotItem[],
  vendorMap: Map<number, number>,
  saleMap: MarketData,
  filter: VendorFlipFilter,
): VendorFlipRow[] {
  const out: VendorFlipRow[] = [];
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;

  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    const vendorPrice = vendorMap.get(item.id);
    if (vendorPrice == null) continue;

    const market = saleMap[item.id];
    if (!market) continue;
    if (market.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && market.listingCount > filter.maxListings) continue;

    const tier = pickTrustedSaleTier(market, filter.hq, item.canHq);
    if (!tier) continue;

    const profitPerUnit = tier.unit - vendorPrice;
    if (profitPerUnit < filter.minProfit) continue;
    const markup = tier.unit / vendorPrice;
    if (markup < filter.minMarkup) continue;

    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      vendorPrice,
      salePrice: tier.unit,
      hq: tier.isHq,
      profitPerUnit,
      markup,
      profitPerDay: profitPerUnit * market.velocity,
      velocity: market.velocity,
      listingCount: market.listingCount,
    });
  }

  out.sort((a, b) => {
    const cmp = compareRows(a, b, filter.sort);
    return cmp !== 0 ? cmp : a.id - b.id;  // stable tie-break by id asc
  });
  return out.slice(0, filter.limit);
}
