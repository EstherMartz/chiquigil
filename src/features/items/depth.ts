import type { WorldListing } from '../../lib/universalis';

export interface DepthBucket {
  priceLow: number;
  priceHigh: number;
  units: number;
  sellers: number;
  listings: number;
}

const BUCKET_COUNT = 8;

/** Group listings of one quality tier into price buckets for a depth histogram. */
export function depthBuckets(listings: WorldListing[], hq: boolean): DepthBucket[] {
  const rows = listings.filter((l) => l.hq === hq && l.price > 0);
  if (rows.length === 0) return [];

  const prices = rows.map((l) => l.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const width = (max - min) / BUCKET_COUNT;

  interface Acc { units: number; sellers: Set<string>; listings: number }
  const buckets = new Map<number, Acc>();
  for (const l of rows) {
    const idx = width === 0 ? 0 : Math.min(BUCKET_COUNT - 1, Math.floor((l.price - min) / width));
    let acc = buckets.get(idx);
    if (!acc) { acc = { units: 0, sellers: new Set(), listings: 0 }; buckets.set(idx, acc); }
    acc.units += l.quantity ?? 1;
    acc.listings += 1;
    if (l.seller) acc.sellers.add(l.seller);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, acc]) => ({
      priceLow: Math.round(width === 0 ? min : min + idx * width),
      priceHigh: Math.round(width === 0 ? max : min + (idx + 1) * width),
      units: acc.units,
      sellers: acc.sellers.size,
      listings: acc.listings,
    }));
}
