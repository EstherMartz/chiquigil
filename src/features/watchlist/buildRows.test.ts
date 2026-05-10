import { describe, it, expect } from 'vitest';
import { buildRows } from './buildRows';
import type { TrackedItem } from '../items/types';
import type { MarketData } from '../../lib/universalis';

const items: TrackedItem[] = [
  { id: 1, name: 'A', crafter: 'LTW', lvl: 100, cat: 'Raid' },
  { id: 2, name: 'B', crafter: 'WVR', lvl: 100, cat: 'Raid' },
];

const phantom: MarketData = {
  '1': { minNQ: 100, minHQ: 200, avgNQ: 110, avgHQ: 220, velocity: 1, lastUploadTime: Date.now(), listingCount: 1 },
  '2': { minNQ: 50,  minHQ: null, avgNQ: 55,  avgHQ: null, velocity: 0.2, lastUploadTime: Date.now(), listingCount: 1 },
};

const dc: MarketData = {
  '1': { minNQ: 90,  minHQ: 180, avgNQ: 95,  avgHQ: 200, velocity: 5, lastUploadTime: Date.now(), listingCount: 5 },
  '2': { minNQ: 40,  minHQ: null, avgNQ: 45,  avgHQ: null, velocity: 1, lastUploadTime: Date.now(), listingCount: 2 },
};

const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };

describe('buildRows', () => {
  it('produces one row per item with phantom + dc + score + craftStatus', () => {
    const rows = buildRows(items, phantom, dc, levels, Date.now());
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(1);
    expect(rows[0].dcMinHQ).toBe(180);
    expect(rows[0].pAvgHQ).toBe(220);
    expect(rows[0].dcSpd).toBe(5);
    expect(rows[0].craftStatus).toBe('ok');
  });

  it('refPrice prefers DC HQ → DC NQ → Phantom HQ avg → Phantom NQ avg', () => {
    const rows = buildRows(items, phantom, dc, levels, Date.now());
    expect(rows[0].refPrice).toBe(180);
    expect(rows[1].refPrice).toBe(40);
  });

  it('normalizes scores 0-100 against the max raw score', () => {
    const rows = buildRows(items, phantom, dc, levels, Date.now());
    // raw: row0 = 180*5 = 900, row1 = 40*1 = 40
    expect(rows[0].score).toBe(100);
    expect(rows[1].score).toBe(Math.round((40 / 900) * 100));
  });

  it('flags stale when last upload is > 3 days old', () => {
    const now = 10_000_000_000_000;
    const oldTs = now - (4 * 86_400_000);
    const stalePhantom: MarketData = { '1': { ...phantom['1'], lastUploadTime: oldTs }, '2': phantom['2'] };
    const staleDc: MarketData = { '1': { ...dc['1'], lastUploadTime: oldTs }, '2': dc['2'] };
    const rows = buildRows(items, stalePhantom, staleDc, levels, now);
    expect(rows[0].staleDays).toBeGreaterThan(3);
  });
});
