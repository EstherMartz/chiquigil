import { describe, it, expect } from 'vitest';
import { findArbitrage } from './arbitrage';
import type { MarketData } from '../../lib/universalis';
import type { TrackedItem } from '../items/types';

const items: TrackedItem[] = [
  { id: 1, name: 'A', crafter: 'LTW', lvl: 100, cat: 'Raid' },
  { id: 2, name: 'B', crafter: 'LTW', lvl: 100, cat: 'Raid' },
];

function dcWith(listings: Record<number, { world: string; price: number; hq: boolean }[]>): MarketData {
  const out: MarketData = {};
  for (const [id, ls] of Object.entries(listings)) {
    out[id] = {
      minNQ: ls.find((l) => !l.hq)?.price ?? null,
      minHQ: ls.find((l) => l.hq)?.price ?? null,
      avgNQ: null, avgHQ: null,
      velocity: 0, lastUploadTime: Date.now(), listingCount: ls.length,
      worldListings: ls.map((l) => ({ world: l.world, price: l.price, hq: l.hq })),
      averagePriceNQ: null, averagePriceHQ: null,
    };
  }
  return out;
}

describe('findArbitrage', () => {
  it('finds items where another world is cheaper than home by the threshold', () => {
    const dc = dcWith({
      1: [
        { world: 'Phantom', price: 100_000, hq: false },
        { world: 'Lich',    price: 50_000, hq: false },
      ],
      2: [
        { world: 'Phantom', price: 10_000, hq: false },
        { world: 'Lich',    price: 9_500, hq: false },
      ],
    });
    const out = findArbitrage(items, dc, { homeWorld: 'Phantom', minSpread: 10_000 });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
    expect(out[0].homePrice).toBe(100_000);
    expect(out[0].cheapestOther.world).toBe('Lich');
    expect(out[0].cheapestOther.price).toBe(50_000);
    expect(out[0].spread).toBe(50_000);
  });

  it('returns empty when no item meets the threshold', () => {
    const dc = dcWith({
      1: [{ world: 'Phantom', price: 100, hq: false }],
    });
    expect(findArbitrage(items, dc, { homeWorld: 'Phantom', minSpread: 1000 })).toEqual([]);
  });

  it('skips items with no home listing', () => {
    const dc = dcWith({
      1: [{ world: 'Lich', price: 100, hq: false }],
    });
    expect(findArbitrage(items, dc, { homeWorld: 'Phantom', minSpread: 0 })).toEqual([]);
  });

  it('uses NQ-only price by default', () => {
    const dc = dcWith({
      1: [
        { world: 'Phantom', price: 100, hq: false },
        { world: 'Lich',    price: 50,  hq: true },
      ],
    });
    expect(findArbitrage(items, dc, { homeWorld: 'Phantom', minSpread: 1 })).toEqual([]);
  });

  it('sorts results by spread descending', () => {
    const dc = dcWith({
      1: [{ world: 'Phantom', price: 1_000, hq: false }, { world: 'Lich', price: 500, hq: false }],
      2: [{ world: 'Phantom', price: 5_000, hq: false }, { world: 'Lich', price: 1_000, hq: false }],
    });
    const out = findArbitrage(items, dc, { homeWorld: 'Phantom', minSpread: 100 });
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});
