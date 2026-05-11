import type { TrackedItem } from '../items/types';
import type { MarketData } from '../../lib/universalis';

export interface ArbitrageRow {
  id: number;
  name: string;
  crafter: TrackedItem['crafter'];
  homePrice: number;
  cheapestOther: { world: string; price: number };
  spread: number;
  spreadPct: number;
}

export interface ArbitrageOpts {
  homeWorld: string;
  minSpread: number;
  hq?: boolean;
}

export function findArbitrage(items: TrackedItem[], dc: MarketData, opts: ArbitrageOpts): ArbitrageRow[] {
  const hq = opts.hq ?? false;
  const out: ArbitrageRow[] = [];
  for (const item of items) {
    const m = dc[item.id];
    if (!m) continue;
    const candidates = m.worldListings.filter((l) => l.hq === hq);
    const home = candidates.find((l) => l.world === opts.homeWorld);
    if (!home) continue;
    const others = candidates.filter((l) => l.world !== opts.homeWorld);
    if (others.length === 0) continue;
    const cheapest = others.reduce((a, b) => (a.price <= b.price ? a : b));
    const spread = home.price - cheapest.price;
    if (spread < opts.minSpread) continue;
    out.push({
      id: item.id,
      name: item.name,
      crafter: item.crafter,
      homePrice: home.price,
      cheapestOther: { world: cheapest.world, price: cheapest.price },
      spread,
      spreadPct: Math.round((spread / home.price) * 100),
    });
  }
  return out.sort((a, b) => b.spread - a.spread);
}
