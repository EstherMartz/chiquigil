import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import { descBy } from '../../lib/sort';
import type { VendorFlipFilter, VendorFlipRow, VendorFlipSort } from './types';

const COMPARATORS: Record<VendorFlipSort, (a: VendorFlipRow, b: VendorFlipRow) => number> = {
  profitPerDay:  descBy((r) => r.profitPerDay),
  markup:        descBy((r) => r.markup),
  profitPerUnit: descBy((r) => r.profitPerUnit),
  salePrice:     descBy((r) => r.salePrice),
  velocity:      descBy((r) => r.velocity),
};

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

    const tier = pickHighestTrustedTier(market, filter.hq, item.canHq);
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
    const cmp = COMPARATORS[filter.sort](a, b);
    return cmp !== 0 ? cmp : a.id - b.id;  // stable tie-break by id asc
  });
  return out.slice(0, filter.limit);
}
