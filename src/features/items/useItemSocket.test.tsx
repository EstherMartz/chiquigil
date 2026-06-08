import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MarketWsEvent } from '../../lib/marketSocket';
import type { MarketItem } from '../../lib/universalis';

let captured: ((e: MarketWsEvent) => void) | null = null;
const closeSpy = vi.fn();
vi.mock('../../lib/marketSocket', () => ({
  openMarketSocket: vi.fn((opts: { onEvent: (e: MarketWsEvent) => void }) => {
    captured = opts.onEvent;
    return { close: closeSpy };
  }),
}));

import { useItemSocket } from './useItemSocket';

function base(): MarketItem {
  return {
    minNQ: 100, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 1,
    worldListings: [{ world: 'Moogle', price: 100, hq: false }],
    averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null,
  };
}
const worlds = new Map<number, string>([[71, 'Moogle'], [401, 'Phantom']]);

beforeEach(() => { captured = null; closeSpy.mockClear(); });

// NOTE: the hook's contract is that `base` and `dcWorldIds` are STABLE references across
// renders (in the app, `base` is market.data.dc[id] and dcIds is useMemo'd). Each test below
// creates them ONCE outside the renderHook callback — passing fresh objects every render would
// loop the re-seed effect. This mirrors real usage.

describe('useItemSocket', () => {
  it('patches the overlay on a matching-item listings event', () => {
    const b = base(); const dc = [71, 401];
    const { result } = renderHook(() => useItemSocket(5, dc, b, worlds));
    act(() => captured!({ event: 'listings/add', item: 5, world: 401, listings: [{ pricePerUnit: 80, hq: false }] }));
    expect(result.current.liveItem!.minNQ).toBe(80);
    expect(result.current.liveAt).not.toBeNull();
  });

  it('ignores events for a different item', () => {
    const b = base(); const dc = [71];
    const { result } = renderHook(() => useItemSocket(5, dc, b, worlds));
    act(() => captured!({ event: 'listings/add', item: 999, world: 71, listings: [{ pricePerUnit: 1, hq: false }] }));
    expect(result.current.liveItem!.minNQ).toBe(100);
  });

  it('bumps the sale counter on a matching-item sales event', () => {
    const b = base(); const dc = [71];
    const { result } = renderHook(() => useItemSocket(5, dc, b, worlds));
    act(() => captured!({ event: 'sales/add', item: 5, world: 71, sales: [{ pricePerUnit: 50, hq: false, timestamp: 9 }] }));
    expect(result.current.liveItem!.recentSalesNQ).toBe(1);
    expect(result.current.liveItem!.lastSaleMs).toBe(9000);
  });

  it('closes the socket on unmount', () => {
    const b = base(); const dc = [71];
    const { unmount } = renderHook(() => useItemSocket(5, dc, b, worlds));
    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('is off when there are no DC world ids', () => {
    const b = base(); const dc: number[] = [];
    const { result } = renderHook(() => useItemSocket(5, dc, b, worlds));
    expect(result.current.status).toBe('off');
  });
});
