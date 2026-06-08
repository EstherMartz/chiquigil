import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { applyTax } from '../items/verdict/pricing';

export interface DcFlipRow {
  id: number;
  name: string;
  buyWorld: string;
  dcPrice: number;
  phantomPrice: number;
  spread: number;
  netSpread: number; // after 5% MB tax on the home sale
  velocity: number;
}

export interface DcFlipOpts {
  homeWorld: string;
  minSpread: number;
  minVelocity: number;
}

export function runDcFlip(
  items: SnapshotItem[],
  dcMarket: MarketData,
  homeMarket: MarketData,
  opts: DcFlipOpts,
): DcFlipRow[] {
  const out: DcFlipRow[] = [];

  for (const item of items) {
    const dc = dcMarket[item.id];
    if (!dc) continue;

    const listings = dc.worldListings;
    const phantomListings = listings.filter((l) => l.world === opts.homeWorld);
    const otherListings = listings.filter((l) => l.world !== opts.homeWorld);

    if (phantomListings.length === 0 || otherListings.length === 0) continue;

    const phantomMin = Math.min(...phantomListings.map((l) => l.price));
    const cheapest = otherListings.reduce((a, b) => (a.price <= b.price ? a : b));
    const spread = phantomMin - cheapest.price;

    if (spread < opts.minSpread) continue;

    const velocity = homeMarket[item.id]?.velocity ?? 0;
    if (velocity < opts.minVelocity) continue;

    out.push({
      id: item.id,
      name: item.name,
      buyWorld: cheapest.world,
      dcPrice: cheapest.price,
      phantomPrice: phantomMin,
      spread,
      netSpread: Math.round(applyTax(phantomMin) - cheapest.price),
      velocity,
    });
  }

  return out.sort((a, b) => b.spread - a.spread);
}
