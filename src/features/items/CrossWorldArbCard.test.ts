import { describe, it, expect } from 'vitest';
import { crossWorldArbStats, prepare, type PreparedRow } from './crossWorld';
import type { WorldListing } from '../../lib/universalis';

describe('crossWorldArbStats', () => {
  it('returns empty stats when no rows', () => {
    const stats = crossWorldArbStats([], null);
    expect(stats.top).toEqual([]);
    expect(stats.bestDiffPct).toBeNull();
    expect(stats.worldCount).toBe(0);
    expect(stats.maxTopPrice).toBe(0);
  });

  it('selects top 4 cheapest rows', () => {
    // Note: prepare() returns rows sorted by price ascending, then world name
    const rows: PreparedRow[] = [
      { world: 'Lich', price: 100, hq: false, dc: 'Light', isHome: false, diffPct: -50 },
      { world: 'Odin', price: 150, hq: false, dc: 'Light', isHome: false, diffPct: -25 },
      { world: 'Ragnarok', price: 180, hq: false, dc: 'Chaos', isHome: false, diffPct: -10 },
      { world: 'Phantom', price: 200, hq: false, dc: 'Chaos', isHome: true, diffPct: null },
      { world: 'Cerberus', price: 250, hq: false, dc: 'Chaos', isHome: false, diffPct: 25 },
    ];

    const stats = crossWorldArbStats(rows, null);
    expect(stats.top).toHaveLength(4);
    expect(stats.top[0].world).toBe('Lich'); // 100
    expect(stats.top[1].world).toBe('Odin'); // 150
    expect(stats.top[2].world).toBe('Ragnarok'); // 180
    expect(stats.top[3].world).toBe('Phantom'); // 200
  });

  it('counts unique worlds', () => {
    const rows: PreparedRow[] = [
      { world: 'Lich', price: 100, hq: false, dc: 'Light', isHome: false, diffPct: -50 },
      { world: 'Lich', price: 110, hq: true, dc: 'Light', isHome: false, diffPct: -45 },
      { world: 'Phantom', price: 200, hq: false, dc: 'Chaos', isHome: true, diffPct: null },
    ];

    const stats = crossWorldArbStats(rows, null);
    expect(stats.worldCount).toBe(2); // Lich + Phantom
  });

  it('returns bestDiffPct from cheapest row if not home', () => {
    const rows: PreparedRow[] = [
      { world: 'Lich', price: 100, hq: false, dc: 'Light', isHome: false, diffPct: -60 },
      { world: 'Phantom', price: 200, hq: false, dc: 'Chaos', isHome: true, diffPct: null },
    ];

    const stats = crossWorldArbStats(rows, null);
    expect(stats.bestDiffPct).toBe(-60);
  });

  it('returns null bestDiffPct when cheapest is home world', () => {
    // Note: prepare() returns rows sorted by price ascending, then world name
    const rows: PreparedRow[] = [
      { world: 'Lich', price: 100, hq: false, dc: 'Light', isHome: false, diffPct: -50 },
      { world: 'Phantom', price: 200, hq: false, dc: 'Chaos', isHome: true, diffPct: null },
    ];

    const stats = crossWorldArbStats(rows, null);
    // Since rows are pre-sorted by prepare(), Lich (100) comes before Phantom (200)
    expect(stats.top[0].world).toBe('Lich');
    expect(stats.bestDiffPct).toBe(-50);
  });

  it('calculates maxTopPrice from top 4', () => {
    const rows: PreparedRow[] = [
      { world: 'Lich', price: 100, hq: false, dc: 'Light', isHome: false, diffPct: -50 },
      { world: 'Odin', price: 150, hq: false, dc: 'Light', isHome: false, diffPct: -25 },
      { world: 'Ragnarok', price: 180, hq: false, dc: 'Chaos', isHome: false, diffPct: -10 },
      { world: 'Phantom', price: 200, hq: false, dc: 'Chaos', isHome: true, diffPct: null },
      { world: 'Cerberus', price: 250, hq: false, dc: 'Chaos', isHome: false, diffPct: 25 },
    ];

    const stats = crossWorldArbStats(rows, null);
    expect(stats.maxTopPrice).toBe(200); // max of top 4
  });

  it('handles single row', () => {
    const rows: PreparedRow[] = [
      { world: 'Lich', price: 100, hq: false, dc: 'Light', isHome: false, diffPct: -50 },
    ];

    const stats = crossWorldArbStats(rows, null);
    expect(stats.top).toHaveLength(1);
    expect(stats.worldCount).toBe(1);
    expect(stats.maxTopPrice).toBe(100);
    expect(stats.bestDiffPct).toBe(-50);
  });

  it('handles less than 4 rows', () => {
    const rows: PreparedRow[] = [
      { world: 'Lich', price: 100, hq: false, dc: 'Light', isHome: false, diffPct: -50 },
      { world: 'Odin', price: 150, hq: false, dc: 'Light', isHome: false, diffPct: -25 },
    ];

    const stats = crossWorldArbStats(rows, null);
    expect(stats.top).toHaveLength(2);
    expect(stats.maxTopPrice).toBe(150);
  });
});

describe('prepare', () => {
  it('builds PreparedRow from WorldListing', () => {
    const listings: WorldListing[] = [
      { world: 'Lich', price: 100, hq: false },
      { world: 'Phantom', price: 200, hq: false },
    ];

    const rows = prepare(listings, 'Phantom', 200, null);
    expect(rows).toHaveLength(2);
    expect(rows[0].world).toBe('Lich');
    expect(rows[0].price).toBe(100);
    expect(rows[0].hq).toBe(false);
    expect(rows[0].isHome).toBe(false);
  });

  it('marks home world as isHome', () => {
    const listings: WorldListing[] = [
      { world: 'Lich', price: 100, hq: false },
      { world: 'Phantom', price: 200, hq: false },
    ];

    const rows = prepare(listings, 'Phantom', 200, null);
    const phantom = rows.find((r) => r.world === 'Phantom');
    expect(phantom?.isHome).toBe(true);
  });

  it('computes diffPct correctly for NQ listings', () => {
    const listings: WorldListing[] = [
      { world: 'Lich', price: 100, hq: false },
      { world: 'Odin', price: 150, hq: false },
    ];

    const rows = prepare(listings, 'Phantom', 200, null);
    // Lich: (100 - 200) / 200 * 100 = -50%
    expect(rows[0].diffPct).toBe(-50);
    // Odin: (150 - 200) / 200 * 100 = -25%
    expect(rows[1].diffPct).toBe(-25);
  });

  it('computes diffPct using HQ home price for HQ listings', () => {
    const listings: WorldListing[] = [
      { world: 'Lich', price: 250, hq: true },
      { world: 'Odin', price: 300, hq: true },
    ];

    const rows = prepare(listings, 'Phantom', 200, 400);
    // Lich: (250 - 400) / 400 * 100 = -37.5 → -37% (Math.round rounds toward even in JS)
    expect(rows[0].diffPct).toBe(-37);
  });

  it('returns null diffPct for home world', () => {
    const listings: WorldListing[] = [
      { world: 'Phantom', price: 200, hq: false },
    ];

    const rows = prepare(listings, 'Phantom', 200, null);
    expect(rows[0].diffPct).toBeNull();
  });

  it('returns null diffPct when home price is null', () => {
    const listings: WorldListing[] = [
      { world: 'Lich', price: 100, hq: false },
    ];

    const rows = prepare(listings, 'Phantom', null, null);
    expect(rows[0].diffPct).toBeNull();
  });

  it('returns null diffPct when home price is 0', () => {
    const listings: WorldListing[] = [
      { world: 'Lich', price: 100, hq: false },
    ];

    const rows = prepare(listings, 'Phantom', 0, null);
    expect(rows[0].diffPct).toBeNull();
  });

  it('sorts rows by price ascending, then world name', () => {
    const listings: WorldListing[] = [
      { world: 'Ragnarok', price: 180, hq: false },
      { world: 'Lich', price: 100, hq: false },
      { world: 'Cerberus', price: 100, hq: false },
      { world: 'Odin', price: 150, hq: false },
    ];

    const rows = prepare(listings, 'Phantom', 200, null);
    expect(rows[0].world).toBe('Cerberus'); // 100, alphabetically first
    expect(rows[1].world).toBe('Lich'); // 100, alphabetically second
    expect(rows[2].world).toBe('Odin'); // 150
    expect(rows[3].world).toBe('Ragnarok'); // 180
  });

  it('filters out empty world names', () => {
    const listings: WorldListing[] = [
      { world: '', price: 100, hq: false },
      { world: 'Lich', price: 150, hq: false },
    ];

    const rows = prepare(listings, 'Phantom', 200, null);
    expect(rows).toHaveLength(1);
    expect(rows[0].world).toBe('Lich');
  });
});
