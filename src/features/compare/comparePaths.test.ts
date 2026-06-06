import { describe, it, expect } from 'vitest';
import { buildStackProfile } from './comparePaths';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });
const ls = (quantity: number, price: number, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller: '' });

describe('buildStackProfile', () => {
  it('returns null when there is no demand data', () => {
    expect(buildStackProfile([], [], false, 5)).toBeNull();
  });

  it('picks the dominant stack by units sold and flags a supply gap', () => {
    const history = [
      sale(1, 100, 10), sale(1, 100, 20),
      sale(5, 90, 30), sale(5, 90, 40), sale(5, 90, 50),
    ];
    const listings = [ls(1, 100), ls(1, 110)];
    const profile = buildStackProfile(history, listings, false, 10);
    expect(profile).not.toBeNull();
    expect(profile!.dominantStack).toBe(5);
    expect(profile!.volumeAtBest).toBe(15);
    expect(profile!.listedAtBest).toBe(0);
    expect(profile!.supplyGap).toBe(true);
    expect(profile!.listingEventsPerDay).toBeCloseTo(2);
  });

  it('no supply gap when the dominant stack has current listings', () => {
    const history = [sale(5, 90, 30), sale(5, 90, 40)];
    const listings = [ls(5, 95)];
    const profile = buildStackProfile(history, listings, false, 5);
    expect(profile!.dominantStack).toBe(5);
    expect(profile!.listedAtBest).toBe(1);
    expect(profile!.supplyGap).toBe(false);
  });
});
