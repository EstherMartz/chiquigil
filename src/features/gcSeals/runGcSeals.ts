import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import { isEquippable, gcSealsYield } from '../../lib/gcSealsYield';

export interface GcSealRow {
  id: number;
  name: string;
  ilvl: number;
  sc: number;
  world: string;          // 'best world' for cheapest NQ listing
  price: number;          // cheapest NQ listing on the chosen scope
  seals: number;          // gcSealsYield(ilvl)
  sealsPerGil: number;    // seals / price
}

export interface GcSealsFilter {
  maxPrice: number;       // default 2000
  scope: 'home' | 'dc';   // 'home' = home world only; 'dc' = all DC
}

export function runGcSeals(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  homeWorld: string,
  filter: GcSealsFilter,
): GcSealRow[] {
  const out: GcSealRow[] = [];
  for (const item of snapshot) {
    if (!isEquippable(item.sc)) continue;
    if (item.ilvl < 45) continue;
    const m = priceMap[item.id];
    if (!m) continue;

    // Find cheapest NQ listing (HQ is rare on cheap gear and not useful for delivery).
    let nqListings = m.worldListings.filter((l) => !l.hq);
    if (nqListings.length === 0) continue;

    // For 'home' scope, filter to only home-world listings.
    if (filter.scope === 'home') {
      nqListings = nqListings.filter((l) => l.world === homeWorld);
      if (nqListings.length === 0) continue;
    }

    const cheapest = nqListings.reduce((a, b) => (a.price <= b.price ? a : b));
    if (cheapest.price > filter.maxPrice) continue;

    const seals = gcSealsYield(item.ilvl);
    if (seals === 0) continue;

    out.push({
      id: item.id, name: item.name, ilvl: item.ilvl, sc: item.sc,
      world: cheapest.world, price: cheapest.price,
      seals, sealsPerGil: seals / cheapest.price,
    });
  }
  // Default sort: seals/gil descending (best deals first)
  out.sort((a, b) => b.sealsPerGil - a.sealsPerGil);
  return out;
}
