# Live Item Prices via Universalis WebSocket — Design

**Date:** 2026-06-08
**Status:** Approved (design)

## Overview

While an item's page is open, stream **live** marketboard updates for that item from the
Universalis WebSocket instead of relying on the cache + a manual refresh. When someone
lists or sells the item on any world in the player's data center, the page's cross-world
listings and DC-cheapest update in real time, with no polling and no server cost (the
socket lives in the browser, only while the page is open).

This is the first consumer of a **reusable** WebSocket + patch layer: the same
`marketSocket` and `marketPatch` modules will later power a live Watchlist and the
eventual always-on `$5/mo` worker (which flushes to the shared blob). Building them here,
generic, is deliberate.

## Verified protocol (live-tested 2026-06-08)

Connected to `wss://universalis.app/api/ws` and captured real traffic:

- **Encoding: BSON** for both the subscribe message and the pushed events
  (the `bson` npm package; works in the browser).
- **Subscribe:** send `BSON.serialize({ event: "subscribe", channel: "<channel>{<filter>}" })`.
- **Channels used:** `listings/add`, `sales/add`. (`*/remove` exist but are unreliable and
  unnecessary — see below.)
- **Filtering:** `{world=<ID>}` **works** (delivers only that world's events). `{dcName=<Name>}`
  is **broken upstream** (delivered 0 events on busy DCs — matches Universalis issue #1346).
  So we subscribe **per world ID**, one subscribe message per DC world.
- **Event shapes (real):**
  - `sales/add` → `{ event, item: <id>, world: <id>, sales: [{ hq, pricePerUnit, quantity, timestamp, buyerName, total, ... }] }`
  - `listings/add` → `{ event, item: <id>, world: <id>, listings: [ <full current listings for that item on that world> ] }`
  - `world` is a **numeric world ID**; `listings/add` carries the item's **complete current
    listings** on that world (so each event is a clean *replace* of that world's slice — we
    never need `listings/remove`).
- **World IDs:** `GET https://universalis.app/api/v2/worlds` → `[{ id, name }]` for all 128
  worlds (e.g. Chaos: Omega=39, Moogle=71, Cerberus=80, Louisoix=83, Spriggan=85,
  Ragnarok=97, Sagittarius=400, Phantom=401). Fetched once, cached, → `Map<id, name>`.

## Scope (v1)

- **Item page only.** DC scope (all the home DC's worlds). `listings/add` + `sales/add`.
- The DC-scope `MarketItem` (which the cross-world / DC-cheapest UI already uses) is what we
  patch live. Home-world-only (`phantom` scope) and region stay cache+manual for v1 — note
  the DC item already includes the home world's listings, so the cross-world view covers it.
- **Out of scope:** Watchlist (next consumer), the server worker, `*/remove` channels,
  region scope. `marketSocket` + `marketPatch` are built generic so those reuse them.

## Architecture & data flow

```
Item page mounts (itemId; dc = Chaos → world IDs [39,71,80,83,85,97,400,401])
  → useMarketData(..., { live:true })  seeds prices over REST (existing)
  → useWorldsMap()                     resolves id→name (cached fetch of /api/v2/worlds)
  → useItemSocket(itemId, dcWorldIds, baseDcItem):
        openMarketSocket({ worldIds, onEvent })
          → for each world id w: send subscribe BSON for `listings/add{world=w}` and `sales/add{world=w}`
        on event where event.item === itemId:
          worldName = worldsMap.get(event.world)
          listings/add → liveItem = applyListingUpdate(liveItem, event.listings, worldName)
          sales/add    → liveItem = applySaleUpdate(liveItem, event.sales[0], now)
          set liveItem + liveAt
  → Item page renders the DC-scope display from (liveItem ?? market.data.dc[itemId])
     and shows a "● Live" chip that pulses on each update
  → unmount / itemId change: socket.close()
```

The hook returns a **patched overlay** (`liveItem`), and the page reads
`liveItem ?? market.data.dc[itemId]` — decoupled from react-query internals, easy to test.
When a manual `LiveRefreshBar` pull or a fresh `market.data` arrives, the overlay re-seeds
from the new base.

## Components / files

1. **`bson`** — add to `package.json` (browser BSON encode/decode).

2. **`src/lib/worldsMap.ts`**
   - `useWorldsMap(): { data?: Map<number,string>, ... }` — react-query fetch of
     `https://universalis.app/api/v2/worlds`, `staleTime: Infinity`, cached; parses to
     `Map<id,name>`.
   - `dcWorldIds(dc: EuDc, map: Map<number,string>): number[]` — the IDs whose names are in
     that DC (cross-reference `europeWorlds` `CHAOS_WORLDS`/`LIGHT_WORLDS`).

3. **`src/lib/marketSocket.ts`** — generic, framework-agnostic WS client.
   ```ts
   export interface MarketWsEvent {
     event: 'listings/add' | 'sales/add';
     item: number; world: number;
     listings?: WsListing[]; sales?: WsSale[];
   }
   export function openMarketSocket(opts: {
     worldIds: number[];
     channels?: Array<'listings/add' | 'sales/add'>; // default both
     onEvent: (e: MarketWsEvent) => void;
     onStatus?: (s: 'connecting' | 'open' | 'closed') => void;
   }): { close(): void };
   ```
   - Opens `wss://universalis.app/api/ws` (browser `WebSocket`, `binaryType='arraybuffer'`).
   - On open: BSON-subscribe each `channel{world=id}` combination; `onStatus('open')`.
   - On message: `BSON.deserialize(new Uint8Array(data))` → `onEvent`.
   - Reconnect: exponential backoff (1s→2s→4s…cap 30s) with resubscribe; stops on `close()`.
   - All decode/connect errors are caught and surfaced via `onStatus`, never thrown.

4. **`src/lib/marketPatch.ts`** — pure functions (the reusable seam; also for the worker).
   ```ts
   export function applyListingUpdate(item: MarketItem, listings: WsListing[], world: string): MarketItem
   export function applySaleUpdate(item: MarketItem, sale: WsSale, now: number): MarketItem
   ```
   - `applyListingUpdate`: drop existing `worldListings` for `world`, add the event's listings
     (mapped to `WorldListing`: `{ world, price: pricePerUnit, hq, quantity }`), re-sort
     cheapest-first, recompute `minNQ`/`minHQ` (cheapest NQ/HQ across all worlds) and
     `listingCount`. Returns a new `MarketItem` (immutable).
   - `applySaleUpdate`: set `lastSaleMs = max(item.lastSaleMs, sale.timestamp*1000)`, bump
     `recentSalesNQ`/`recentSalesHQ` by 1 for the sale's quality. (Velocity/averages are
     server-computed windows we can't fully recompute — left as-is; sales mainly drive the
     "just sold" pulse + freshness.)

5. **`src/features/items/useItemSocket.ts`**
   ```ts
   export function useItemSocket(itemId: number, dcWorldIds: number[], base: MarketItem | undefined):
     { liveItem: MarketItem | undefined; liveAt: number | null; status: 'connecting'|'open'|'closed'|'off' }
   ```
   - Needs the worlds map (id→name) ready; if `dcWorldIds` is empty or the map isn't ready,
     `status: 'off'` and it doesn't open a socket.
   - Seeds `liveItem` from `base`; opens `openMarketSocket({ worldIds: dcWorldIds })`; on a
     matching-item event patches `liveItem` via the pure fns and sets `liveAt`.
   - Re-seeds `liveItem` when `base` identity changes (manual refresh / new REST data).
   - Closes the socket on unmount and when `itemId` changes.

6. **`src/features/items/LiveStreamChip.tsx`** — small indicator near `LiveRefreshBar`:
   `● Live · just now` (jade, pulses on `liveAt` change), `● connecting…`, or hidden/`off`
   when unavailable. Reuses the existing jade live styling.

7. **`src/routes/Item.tsx`** — derive `dcWorldIds` from `useWorldsMap()` + the home `dc`;
   call `useItemSocket(itemId, dcWorldIds, market.data?.dc[itemId])`; render `LiveStreamChip`;
   feed `liveItem ?? market.data.dc[itemId]` into the DC-scope display (a small merged
   `dc` map passed to the cross-world / snapshot components).

## Coexistence with the existing live refresh

`LiveRefreshBar` (manual full 3-scope pull + opt-in Auto) stays unchanged. The WebSocket is
**additive** passive streaming for the DC scope. A manual pull re-seeds the overlay. No
conflict — both ultimately reflect the same DC `MarketItem`.

## Error handling

- WS connect/decode failure, or `/api/v2/worlds` fetch failure → `status: 'off'`, the page
  silently falls back to cache + manual refresh; the chip shows nothing or "off". Never
  blocks the page or throws.
- Reconnect with capped exponential backoff + resubscribe on every (re)open.
- Tab hidden / unmount → `close()` (no background socket).

## Testing

- **`marketPatch`** (pure, primary coverage): `applyListingUpdate` replaces only the target
  world's slice and recomputes the DC-cheapest (NQ vs HQ; cheaper world wins; listingCount);
  `applySaleUpdate` bumps `lastSaleMs` and the right recent-sales counter; immutability.
- **`marketSocket`** with a mock `WebSocket`: emits the correct per-world BSON subscribe
  messages on open; decodes a BSON event buffer → `MarketWsEvent`; reconnect/backoff fires
  and resubscribes; `close()` stops reconnection.
- **`useItemSocket`**: a matching-item event updates `liveItem`/`liveAt`; a different item is
  ignored; unmount closes the socket; re-seeds when `base` changes. (Mock `openMarketSocket`.)
- **`worldsMap`**: parses `/api/v2/worlds` to the id→name map; `dcWorldIds` returns the DC's IDs.

## Build sequence

1. `bson` dep + `worldsMap` (foundation).
2. `marketPatch` pure fns (TDD).
3. `marketSocket` client (TDD with mock WebSocket).
4. `useItemSocket` hook (TDD with mock socket).
5. `LiveStreamChip` + wire into `Item.tsx`.
6. Manual smoke test against live Universalis on an active item.
