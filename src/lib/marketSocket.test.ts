import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BSON } from 'bson';
import { openMarketSocket, type MarketWsEvent } from './marketSocket';

class MockWS {
  static last: MockWS | null = null;
  static instances = 0;
  url: string; binaryType = '';
  sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) { this.url = url; MockWS.last = this; MockWS.instances++; }
  send(data: Uint8Array) { this.sent.push(data); }
  close() { this.closed = true; this.onclose?.(); }
}

beforeEach(() => { MockWS.last = null; MockWS.instances = 0; vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('openMarketSocket', () => {
  it('subscribes to listings/add + sales/add for each world on open', () => {
    openMarketSocket({ worldIds: [71, 401], onEvent: () => {} });
    MockWS.last!.onopen!();
    const channels = MockWS.last!.sent.map((b) => (BSON.deserialize(b) as { channel: string }).channel);
    expect(channels).toEqual([
      'listings/add{world=71}', 'sales/add{world=71}',
      'listings/add{world=401}', 'sales/add{world=401}',
    ]);
  });

  it('decodes a BSON event and forwards listings/add', () => {
    const events: MarketWsEvent[] = [];
    openMarketSocket({ worldIds: [71], onEvent: (e) => events.push(e) });
    MockWS.last!.onopen!();
    const frame = BSON.serialize({ event: 'listings/add', item: 5, world: 71, listings: [{ pricePerUnit: 9, hq: false }] });
    const data = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as ArrayBuffer;
    MockWS.last!.onmessage!({ data });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'listings/add', item: 5, world: 71 });
  });

  it('reconnects after an unexpected close, but not after close()', () => {
    const handle = openMarketSocket({ worldIds: [71], onEvent: () => {} });
    MockWS.last!.onopen!();
    MockWS.last!.onclose!();
    vi.advanceTimersByTime(1000);
    expect(MockWS.instances).toBe(2);
    handle.close();
    MockWS.last!.onclose!();
    vi.advanceTimersByTime(60_000);
    expect(MockWS.instances).toBe(2);
  });
});
