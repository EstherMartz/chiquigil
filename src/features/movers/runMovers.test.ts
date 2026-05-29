import { describe, it, expect } from 'vitest';
import { runMovers } from './runMovers';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';

const item = (id: number, name: string, sc = 5): SnapshotItem =>
  ({ id, name, sc, ui: 0, ilvl: 1, canHq: false } as SnapshotItem);

const mk = (minNQ: number | null, avgNQ: number | null, velocity: number): MarketItem =>
  ({ minNQ, avgNQ, velocity } as MarketItem);

describe('runMovers', () => {
  const items = [
    item(1, 'Spiker'),    // +50% vs avg, liquid
    item(2, 'Crasher'),   // -40% vs avg
    item(3, 'Stable'),    // ~0%
    item(4, 'Illiquid'),  // big move but no velocity
    item(5, 'Cheap'),     // below min price
    item(6, 'Untradeable', 0),
  ];
  const market: MarketData = {
    '1': mk(150, 100, 5),
    '2': mk(120, 200, 3),   // -40% vs avg, still above minPrice
    '3': mk(101, 100, 10),
    '4': mk(300, 100, 0),
    '5': mk(3, 2, 9),
    '6': mk(500, 100, 5),
  };

  it('flags up/down movers and skips stable/illiquid/cheap/untradeable', () => {
    const rows = runMovers(items, market, { minVelocity: 1, minDevPct: 15, minPrice: 100 });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(1);          // spike
    expect(ids).toContain(2);          // crash
    expect(ids).not.toContain(3);      // stable (1% < 15%)
    expect(ids).not.toContain(4);      // velocity 0 < min
    expect(ids).not.toContain(5);      // price 3 < minPrice
    expect(ids).not.toContain(6);      // sc=0 untradeable

    const spike = rows.find((r) => r.id === 1)!;
    expect(spike.direction).toBe('up');
    expect(Math.round(spike.devPct)).toBe(50);
    expect(spike.gilPerDay).toBe(750);

    const crash = rows.find((r) => r.id === 2)!;
    expect(crash.direction).toBe('down');
    expect(Math.round(crash.devPct)).toBe(-40);
  });

  it('orders by abnormality × velocity', () => {
    const rows = runMovers(items, market, { minVelocity: 1, minDevPct: 15, minPrice: 100 });
    // Spiker: |50|*5 = 250 ; Crasher: |40|*3 = 120 → Spiker first
    expect(rows[0].id).toBe(1);
  });
});
