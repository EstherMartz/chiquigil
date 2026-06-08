# Live Item Prices via Universalis WebSocket — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While an item's page is open, stream live Universalis marketboard updates for that item over a browser WebSocket and patch the DC-scope prices in real time.

**Architecture:** A generic browser WebSocket client (`marketSocket`) subscribes per DC world ID (`listings/add` + `sales/add`, BSON) and emits decoded events; pure functions (`marketPatch`) fold a listing/sale event into a `MarketItem`; a hook (`useItemSocket`) filters to the viewed item, patches an overlay, and the Item page renders `liveItem ?? cache`. `marketSocket`/`marketPatch` are generic so a future live Watchlist and the always-on worker reuse them.

**Tech Stack:** TypeScript, React + react-query, `bson`, Vitest, browser `WebSocket`.

**Design:** `docs/superpowers/specs/2026-06-08-live-item-websocket-design.md`

**Protocol (live-verified):** `wss://universalis.app/api/ws`, BSON. Subscribe `{ event:"subscribe", channel:"listings/add{world=<ID>}" }`. `{world=}` filter works; `{dcName=}` is broken. Events: `{ event, item, world:<id>, listings|sales:[...] }`; `listings/add` carries the item's full current listings on that world. World IDs from `GET /api/v2/worlds`.

---

### Task 1: `bson` dependency + worlds id→name map

**Files:**
- Modify: `package.json` (add `bson`)
- Create: `src/lib/worldsMap.ts`
- Test: `src/lib/worldsMap.test.ts`

- [ ] **Step 1: Add the dependency**

Run: `npm i bson`
Expected: `bson` appears in `package.json` dependencies; lockfile updates.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/worldsMap.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWorlds, dcWorldIds } from './worldsMap';

beforeEach(() => vi.unstubAllGlobals());

describe('worldsMap', () => {
  it('fetchWorlds parses the /api/v2/worlds list into an id→name map', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ id: 401, name: 'Phantom' }, { id: 71, name: 'Moogle' }],
    }));
    const map = await fetchWorlds();
    expect(map.get(401)).toBe('Phantom');
    expect(map.get(71)).toBe('Moogle');
  });

  it('fetchWorlds throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchWorlds()).rejects.toThrow();
  });

  it('dcWorldIds returns the (sorted) ids whose names are in that DC', () => {
    const map = new Map<number, string>([
      [401, 'Phantom'], [71, 'Moogle'], [21, 'Ravana' /* not EU */], [97, 'Ragnarok'],
    ]);
    expect(dcWorldIds('Chaos', map)).toEqual([71, 97, 401]);
    expect(dcWorldIds('NotADc', map)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/worldsMap.test.ts`
Expected: FAIL — cannot find module `./worldsMap`.

- [ ] **Step 4: Implement**

```ts
// src/lib/worldsMap.ts
import { useQuery } from '@tanstack/react-query';
import { CHAOS_WORLDS, LIGHT_WORLDS } from './europeWorlds';

export type WorldsMap = Map<number, string>;

/** Fetch Universalis' world list once → id→name map. Worlds rarely change. */
export async function fetchWorlds(): Promise<WorldsMap> {
  const res = await fetch('https://universalis.app/api/v2/worlds');
  if (!res.ok) throw new Error(`Universalis worlds ${res.status}`);
  const list = (await res.json()) as Array<{ id: number; name: string }>;
  return new Map(list.map((w) => [w.id, w.name]));
}

export function useWorldsMap() {
  return useQuery<WorldsMap>({ queryKey: ['universalis-worlds'], queryFn: fetchWorlds, staleTime: Infinity });
}

/** World IDs in a EU data center, derived from the id→name map. [] for unknown DCs. */
export function dcWorldIds(dc: string, map: WorldsMap): number[] {
  const names = dc === 'Chaos' ? CHAOS_WORLDS : dc === 'Light' ? LIGHT_WORLDS : null;
  if (!names) return [];
  const out: number[] = [];
  for (const [id, name] of map) if (names.has(name)) out.push(id);
  return out.sort((a, b) => a - b);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/worldsMap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/worldsMap.ts src/lib/worldsMap.test.ts
git commit -m "feat(live-ws): bson dep + worlds id→name map"
```

---

### Task 2: `marketPatch` pure fold functions

**Files:**
- Create: `src/lib/marketPatch.ts`
- Test: `src/lib/marketPatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/marketPatch.test.ts
import { describe, it, expect } from 'vitest';
import { applyListingUpdate, applySaleUpdate } from './marketPatch';
import type { MarketItem } from './universalis';

function item(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null, ...over,
  };
}

describe('applyListingUpdate', () => {
  it('replaces only the target world\'s listings and recomputes the cheapest', () => {
    const base = item({
      minNQ: 100, listingCount: 2,
      worldListings: [
        { world: 'Moogle', price: 100, hq: false },
        { world: 'Phantom', price: 120, hq: false },
      ],
    });
    const next = applyListingUpdate(base, [{ pricePerUnit: 90, hq: false, quantity: 3, retainerName: 'Bob' }], 'Phantom');
    expect(next.worldListings).toEqual([
      { world: 'Phantom', price: 90, hq: false, quantity: 3, seller: 'Bob' },
      { world: 'Moogle', price: 100, hq: false },
    ]);
    expect(next.minNQ).toBe(90);
    expect(next.listingCount).toBe(2);
    expect(base.minNQ).toBe(100); // immutable
  });

  it('tracks NQ and HQ cheapest separately', () => {
    const base = item({ worldListings: [{ world: 'Moogle', price: 100, hq: false }] });
    const next = applyListingUpdate(base, [{ pricePerUnit: 500, hq: true }], 'Phantom');
    expect(next.minNQ).toBe(100);
    expect(next.minHQ).toBe(500);
  });

  it('removes a world\'s listings when the update is empty', () => {
    const base = item({ worldListings: [{ world: 'Phantom', price: 90, hq: false }, { world: 'Moogle', price: 100, hq: false }] });
    const next = applyListingUpdate(base, [], 'Phantom');
    expect(next.worldListings).toEqual([{ world: 'Moogle', price: 100, hq: false }]);
    expect(next.minNQ).toBe(100);
  });
});

describe('applySaleUpdate', () => {
  it('advances lastSaleMs and bumps the matching recent-sales counter', () => {
    const base = item({ lastSaleMs: 1000, recentSalesNQ: 2, recentSalesHQ: 1 });
    const next = applySaleUpdate(base, { pricePerUnit: 50, hq: false, timestamp: 5 }, 9_999);
    expect(next.lastSaleMs).toBe(5000); // 5s * 1000
    expect(next.recentSalesNQ).toBe(3);
    expect(next.recentSalesHQ).toBe(1);
  });

  it('keeps the newer lastSaleMs and falls back to now when no timestamp', () => {
    const base = item({ lastSaleMs: 8000, recentSalesHQ: 0 });
    const next = applySaleUpdate(base, { pricePerUnit: 50, hq: true }, 9_999);
    expect(next.lastSaleMs).toBe(9_999); // now > existing
    expect(next.recentSalesHQ).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/marketPatch.test.ts`
Expected: FAIL — cannot find module `./marketPatch`.

- [ ] **Step 3: Implement**

```ts
// src/lib/marketPatch.ts
import type { MarketItem, WorldListing } from './universalis';

/** A listing as it arrives over the Universalis WebSocket (worldName is null there). */
export interface WsListing { pricePerUnit: number; hq: boolean; quantity?: number; retainerName?: string }
/** A sale as it arrives over the WebSocket. */
export interface WsSale { pricePerUnit: number; hq: boolean; quantity?: number; timestamp?: number }

function cheapest(listings: WorldListing[], hq: boolean): number | null {
  let min: number | null = null;
  for (const l of listings) if (l.hq === hq && (min == null || l.price < min)) min = l.price;
  return min;
}

/**
 * Fold a `listings/add` event into a DC-scope MarketItem: the event carries the item's full
 * current listings on `world`, so we drop that world's existing slice, add the new ones,
 * re-sort cheapest-first, and recompute minNQ/minHQ/listingCount. Pure (returns a new item).
 */
export function applyListingUpdate(item: MarketItem, listings: WsListing[], world: string): MarketItem {
  const others = item.worldListings.filter((l) => l.world !== world);
  const incoming: WorldListing[] = listings.map((l) => ({
    world, price: l.pricePerUnit, hq: l.hq, quantity: l.quantity ?? 1, seller: l.retainerName ?? '',
  }));
  const worldListings = [...others, ...incoming].sort((a, b) => a.price - b.price);
  return {
    ...item,
    worldListings,
    listingCount: worldListings.length,
    minNQ: cheapest(worldListings, false),
    minHQ: cheapest(worldListings, true),
  };
}

/** Fold a `sales/add` event into a MarketItem: advance lastSaleMs + bump the recent-sales count. */
export function applySaleUpdate(item: MarketItem, sale: WsSale, now: number): MarketItem {
  const saleMs = sale.timestamp ? sale.timestamp * 1000 : now;
  return {
    ...item,
    lastSaleMs: Math.max(item.lastSaleMs ?? 0, saleMs),
    recentSalesNQ: item.recentSalesNQ + (sale.hq ? 0 : 1),
    recentSalesHQ: item.recentSalesHQ + (sale.hq ? 1 : 0),
  };
}
```

> Note on `applyListingUpdate`: the base `worldListings` is the cron blob's cheapest-50 across
> the DC, so `listingCount` after a patch is a best-effort live count, not the authoritative
> DC-wide total. The cheapest (minNQ/minHQ) — the headline — is accurate.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/marketPatch.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketPatch.ts src/lib/marketPatch.test.ts
git commit -m "feat(live-ws): pure marketPatch fold functions (listing/sale → MarketItem)"
```

---

### Task 3: `marketSocket` WebSocket client

**Files:**
- Create: `src/lib/marketSocket.ts`
- Test: `src/lib/marketSocket.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/marketSocket.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BSON } from 'bson';
import { openMarketSocket, type MarketWsEvent } from './marketSocket';

// Minimal mock WebSocket that records sent frames and lets the test drive lifecycle.
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
    MockWS.last!.onmessage!({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'listings/add', item: 5, world: 71 });
  });

  it('reconnects after an unexpected close, but not after close()', () => {
    const handle = openMarketSocket({ worldIds: [71], onEvent: () => {} });
    MockWS.last!.onopen!();
    MockWS.last!.onclose!();           // unexpected drop
    vi.advanceTimersByTime(1000);
    expect(MockWS.instances).toBe(2);  // reconnected
    handle.close();                    // intentional
    MockWS.last!.onclose!();
    vi.advanceTimersByTime(60_000);
    expect(MockWS.instances).toBe(2);  // no further reconnect
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/marketSocket.test.ts`
Expected: FAIL — cannot find module `./marketSocket`.

- [ ] **Step 3: Implement**

```ts
// src/lib/marketSocket.ts
import { BSON } from 'bson';
import type { WsListing, WsSale } from './marketPatch';

export interface MarketWsEvent {
  event: 'listings/add' | 'sales/add';
  item: number;
  world: number;
  listings?: WsListing[];
  sales?: WsSale[];
}
export type WsStatus = 'connecting' | 'open' | 'closed';

const WS_URL = 'wss://universalis.app/api/ws';
const CHANNELS = ['listings/add', 'sales/add'] as const;
const MAX_BACKOFF = 30_000;

/**
 * Open a Universalis market WebSocket subscribed to listings/add + sales/add for the given
 * world IDs (the only filter Universalis honors). Decodes BSON frames to MarketWsEvent and
 * calls onEvent. Reconnects with exponential backoff until close(). Generic — reused by the
 * item hook now and a live watchlist / server worker later.
 */
export function openMarketSocket(opts: {
  worldIds: number[];
  onEvent: (e: MarketWsEvent) => void;
  onStatus?: (s: WsStatus) => void;
}): { close(): void } {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = 1000;

  const connect = () => {
    if (stopped) return;
    opts.onStatus?.('connecting');
    ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      backoff = 1000;
      opts.onStatus?.('open');
      for (const w of opts.worldIds) {
        for (const ch of CHANNELS) {
          ws!.send(BSON.serialize({ event: 'subscribe', channel: `${ch}{world=${w}}` }) as unknown as ArrayBufferLike as Uint8Array);
        }
      }
    };
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const doc = BSON.deserialize(new Uint8Array(ev.data as ArrayBuffer)) as MarketWsEvent;
        if (doc.event === 'listings/add' || doc.event === 'sales/add') opts.onEvent(doc);
      } catch { /* ignore malformed frame */ }
    };
    ws.onclose = () => {
      opts.onStatus?.('closed');
      if (stopped) return;
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    };
    ws.onerror = () => { try { ws?.close(); } catch { /* */ } };
  };
  connect();

  return { close() { stopped = true; try { ws?.close(); } catch { /* */ } } };
}
```

> If `tsc` objects to the `ws!.send(BSON.serialize(...))` cast, send `BSON.serialize(...)`
> directly — `BSON.serialize` returns a `Uint8Array`, which `WebSocket.send` accepts. Adjust
> the cast to whatever satisfies the lib DOM types (the test sends a `Uint8Array`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/marketSocket.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketSocket.ts src/lib/marketSocket.test.ts
git commit -m "feat(live-ws): browser marketSocket client (per-world subscribe, BSON, reconnect)"
```

---

### Task 4: `useItemSocket` hook

**Files:**
- Create: `src/features/items/useItemSocket.ts`
- Test: `src/features/items/useItemSocket.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/items/useItemSocket.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MarketWsEvent } from '../../lib/marketSocket';
import type { MarketItem } from '../../lib/universalis';

let captured: ((e: MarketWsEvent) => void) | null = null;
const closeSpy = vi.fn();
vi.mock('../../lib/marketSocket', () => ({
  openMarketSocket: vi.fn((opts: { onEvent: (e: MarketWsEvent) => void }) => { captured = opts.onEvent; return { close: closeSpy }; }),
}));

import { useItemSocket } from './useItemSocket';

function base(): MarketItem {
  return { minNQ: 100, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 1,
    worldListings: [{ world: 'Moogle', price: 100, hq: false }], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null };
}
const worlds = new Map<number, string>([[71, 'Moogle'], [401, 'Phantom']]);

beforeEach(() => { captured = null; closeSpy.mockClear(); });

describe('useItemSocket', () => {
  it('patches the overlay on a matching-item listings event', () => {
    const { result } = renderHook(() => useItemSocket(5, [71, 401], base(), worlds));
    act(() => captured!({ event: 'listings/add', item: 5, world: 401, listings: [{ pricePerUnit: 80, hq: false }] }));
    expect(result.current.liveItem!.minNQ).toBe(80);
    expect(result.current.liveAt).not.toBeNull();
  });

  it('ignores events for a different item', () => {
    const { result } = renderHook(() => useItemSocket(5, [71], base(), worlds));
    act(() => captured!({ event: 'listings/add', item: 999, world: 71, listings: [{ pricePerUnit: 1, hq: false }] }));
    expect(result.current.liveItem!.minNQ).toBe(100);
  });

  it('closes the socket on unmount', () => {
    const { unmount } = renderHook(() => useItemSocket(5, [71], base(), worlds));
    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('is off when there are no DC world ids', () => {
    const { result } = renderHook(() => useItemSocket(5, [], base(), worlds));
    expect(result.current.status).toBe('off');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/items/useItemSocket.test.tsx`
Expected: FAIL — cannot find module `./useItemSocket`.

- [ ] **Step 3: Implement**

```ts
// src/features/items/useItemSocket.ts
import { useEffect, useRef, useState } from 'react';
import { openMarketSocket, type MarketWsEvent, type WsStatus } from '../../lib/marketSocket';
import { applyListingUpdate, applySaleUpdate } from '../../lib/marketPatch';
import type { MarketItem } from '../../lib/universalis';
import type { WorldsMap } from '../../lib/worldsMap';

export type LiveStatus = WsStatus | 'off';

/**
 * Stream live updates for one item across its DC's worlds. Returns a patched overlay
 * (`liveItem`) the page renders in place of the cached DC item. Closes on unmount / itemId
 * change. `dcWorldIds` MUST be a memoized array (stable identity) — it keys the socket.
 */
export function useItemSocket(
  itemId: number,
  dcWorldIds: number[],
  base: MarketItem | undefined,
  worlds: WorldsMap | undefined,
): { liveItem: MarketItem | undefined; liveAt: number | null; status: LiveStatus } {
  const [liveItem, setLiveItem] = useState<MarketItem | undefined>(base);
  const [liveAt, setLiveAt] = useState<number | null>(null);
  const [status, setStatus] = useState<LiveStatus>('off');

  // Re-seed the overlay whenever fresh REST data arrives (manual refresh / first load).
  const liveRef = useRef<MarketItem | undefined>(base);
  useEffect(() => { liveRef.current = base; setLiveItem(base); }, [base]);

  useEffect(() => {
    if (!dcWorldIds.length || !worlds) { setStatus('off'); return; }
    const sock = openMarketSocket({
      worldIds: dcWorldIds,
      onStatus: setStatus,
      onEvent: (e: MarketWsEvent) => {
        if (e.item !== itemId) return;
        const world = worlds.get(e.world);
        const cur = liveRef.current;
        if (!world || !cur) return;
        const next =
          e.event === 'listings/add' && e.listings ? applyListingUpdate(cur, e.listings, world)
          : e.event === 'sales/add' && e.sales?.[0] ? applySaleUpdate(cur, e.sales[0], Date.now())
          : cur;
        if (next === cur) return;
        liveRef.current = next;
        setLiveItem(next);
        setLiveAt(Date.now());
      },
    });
    return () => sock.close();
    // base intentionally excluded: the socket persists across REST refreshes; the overlay
    // re-seeds via liveRef above. dcWorldIds must be memoized by the caller.
  }, [itemId, dcWorldIds, worlds]);

  return { liveItem, liveAt, status };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/items/useItemSocket.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/items/useItemSocket.ts src/features/items/useItemSocket.test.tsx
git commit -m "feat(live-ws): useItemSocket — overlay patched from the live stream"
```

---

### Task 5: `LiveStreamChip` + wire into the Item page

**Files:**
- Create: `src/features/items/LiveStreamChip.tsx`
- Modify: `src/routes/Item.tsx`

- [ ] **Step 1: Write the chip**

```tsx
// src/features/items/LiveStreamChip.tsx
import { useEffect, useState } from 'react';
import type { LiveStatus } from './useItemSocket';

function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

/** Tiny "live stream" indicator beside the item's LiveRefreshBar. */
export function LiveStreamChip({ status, liveAt }: { status: LiveStatus; liveAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'open') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  if (status === 'off') return null;
  if (status === 'connecting') {
    return <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">○ connecting…</span>;
  }
  if (status === 'closed') {
    return <span className="font-mono text-[10px] tracking-widest uppercase text-text-low/60">○ live off</span>;
  }
  return (
    <span className="font-mono text-[10px] tracking-widest uppercase text-jade inline-flex items-center gap-1">
      <span className="text-jade animate-pulse" aria-hidden>●</span>
      {liveAt ? `live · ${ago(liveAt, now)}` : 'live'}
    </span>
  );
}
```

- [ ] **Step 2: Wire the hook + chip + overlay into `src/routes/Item.tsx`**

Read `src/routes/Item.tsx` first. Make these edits:

(a) Add imports near the other `features/items` imports:
```ts
import { useWorldsMap, dcWorldIds } from '../lib/worldsMap';
import { useItemSocket } from '../features/items/useItemSocket';
import { LiveStreamChip } from '../features/items/LiveStreamChip';
```

(b) After the `const market = useMarketData(...)` line (~line 118), add:
```ts
  const worldsQ = useWorldsMap();
  const dcIds = useMemo(
    () => (worldsQ.data ? dcWorldIds(dc, worldsQ.data) : []),
    [worldsQ.data, dc],
  );
  const baseDcItem = market.data?.dc[itemId];
  const live = useItemSocket(itemId, dcIds, baseDcItem, worldsQ.data);
```

(c) Replace the existing `const dcMarket = market.data?.dc[itemId];` (~line 183) with the live overlay:
```ts
  const dcMarket = live.liveItem ?? market.data?.dc[itemId];
```

(d) Where the whole DC map is passed to the cross-world component (the `dc={market.data?.dc}` prop, ~line 368), pass a merged map so that component also sees the live item. Just above that JSX block, add:
```ts
  const dcMap = useMemo(
    () => (live.liveItem ? { ...(market.data?.dc ?? {}), [itemId]: live.liveItem } : market.data?.dc),
    [market.data?.dc, live.liveItem, itemId],
  );
```
and change `dc={market.data?.dc}` → `dc={dcMap}`.

(e) Render the chip next to `LiveRefreshBar` (the `<LiveRefreshBar ... />` block, ~line 269). Wrap them so the chip sits beside it, e.g.:
```tsx
        <div className="flex items-center justify-end gap-3 flex-wrap">
          <LiveStreamChip status={live.status} liveAt={live.liveAt} />
          <LiveRefreshBar
            /* ...existing props unchanged... */
          />
        </div>
```

> Verify against the real file: `dcMarket` is already consumed by `MarketSnapshotRow` and the
> cross-world blocks — switching it to the overlay is all that's needed for those to go live.
> Do not change `phantom`/`region` usages (v1 is DC-scope only).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Fix the `marketSocket` send cast here if tsc complains — see Task 3 note.)

- [ ] **Step 4: Run the Item page test if present**

Run: `npx vitest run src/routes/Item.test.tsx`
Expected: PASS (the additions are additive; if the test mounts the page it must not require a live socket — `useWorldsMap` returns no data in tests so `status` is `off` and no socket opens).

- [ ] **Step 5: Commit**

```bash
git add src/features/items/LiveStreamChip.tsx src/routes/Item.tsx
git commit -m "feat(live-ws): LiveStreamChip + wire live overlay into the Item page"
```

---

### Task 6: Full gate + live smoke test

**Files:** none (verification)

- [ ] **Step 1: Full suite + typecheck**

Run: `npx vitest run`
Expected: all pass (existing + new).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Live smoke test (manual)**

Run the app (`npm run dev`), open an **active** item's page (a fast-selling consumable on Chaos). Confirm:
- The chip shows `○ connecting…` then `● live`.
- Leaving the page open, when a listing/sale occurs on any Chaos world for that item, the
  cross-world block / DC-cheapest updates and the chip pulses to `live · just now`.
- Navigating away closes the socket (no console errors; check the Network/WS panel shows the
  socket closed).
- An item with no events still works (just no live ticks); the manual `↻ Live refresh` and
  `Auto` still function.

> Single items trade infrequently, so live ticks may be occasional — that's expected (the
> design notes this). The smoke test confirms wiring, not frequency.

- [ ] **Step 3: Commit any smoke-test fixes**, otherwise proceed to finish the branch.

---

## Self-review notes

- **Spec coverage:** protocol/subscribe = Task 3; worlds map = Task 1; pure patch seams = Task 2;
  hook/overlay = Task 4; chip + Item wiring = Task 5; error handling = `status:'off'` paths in
  Tasks 3–5; testing = each task's tests + Task 6 gate + smoke. Watchlist/worker reuse is served
  by `marketSocket`/`marketPatch` being generic (Tasks 2–3).
- **Types:** `WsListing`/`WsSale` (marketPatch) reused by `marketSocket` + hook; `MarketWsEvent`/
  `WsStatus` (marketSocket) reused by the hook; `LiveStatus`/`WorldsMap` consistent across hook +
  chip + Item wiring. `MarketItem`/`WorldListing` from `universalis.ts` unchanged.
- **Known approximations (intended):** `listingCount` after a listing patch is best-effort (base
  is the cheapest-50 blob); `applySaleUpdate` doesn't recompute server-windowed velocity/averages.
  Both flagged in Task 2.
