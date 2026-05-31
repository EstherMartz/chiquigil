# Live Plugin Sync v2 — Design

**Date:** 2026-05-31
**Status:** Proposed
**Builds on:** `2026-05-28-dalamud-plugin-design.md` (QiqirnCompanion / ChiquigilBridge)

## Context

The web app already has a **direct, real-time link** to the in-game plugin: the plugin
hosts a WebSocket server at `ws://127.0.0.1:7331/sync?token=…`, and the web connects as a
client (`src/features/plugin/usePluginConnection.ts`). Today that link carries exactly **one
message in one direction** — the plugin pushes `playerSnapshot` (`world`, `dc`,
`crafterLevels`) and the web auto-applies it to settings. The entire wire contract is one
small file: `src/features/plugin/protocol.ts`.

We want to grow this link — staying **same-machine / no-backend** — to carry four new
capabilities:

1. **Live inventory push** — kill the CSV import behind Craft-from-Inventory, Cleanup, Shopping List.
2. **Web→plugin actions** — open the in-game marketboard, search an item, set a gathering map flag, copy to clipboard, push a shopping list into the plugin window.
3. **Live gil + your own listings** — auto-fill the Planner treasury; flag when you've been undercut.
4. **Better pairing UX** — replace pasting a long token with a one-click deep link.

The transport stays the local WebSocket. The real design work is (a) a versioned, extensible
**message protocol** that supports request/response and capability negotiation, and (b) the
**web-side plumbing + UI** that feeds the new data into existing features. The actual Dalamud
plugin is a **separate C# repo**; this doc defines the contract it must implement.

## Goal

A backward-compatible **protocol v2** over the existing local WebSocket that supports event
pushes *and* request/response, with capability negotiation so old/new plugin versions degrade
gracefully — plus the web-side hooks, stores, and UI that turn the new data into value, and a
**fake-plugin test server** so the whole web side can be built and verified before the C#
side exists.

---

## 1. Connection model (unchanged transport, hardened)

- Plugin = local WS server `ws://127.0.0.1:7331/sync?token=…`; web = client. Same as today.
- Stays same-machine (no cloud relay). Works in Chrome/Edge/Firefox; Safari still unsupported.
- **Threat model** (a malicious web page or local app probing `127.0.0.1:7331`). Plugin-side
  requirements to document in the contract — the web side just supplies the token:
  1. **Unguessable token** in the query string; reject upgrades without a valid one.
  2. **Origin allowlist** on the WS upgrade — accept only `https://qiqirn.tools` (+ configurable
     localhost dev origin). Browsers always send `Origin`; this blocks drive-by pages.
  3. **Bind to `127.0.0.1`** only (never `0.0.0.0`) so it's not reachable from the LAN.
  4. v2 actions are all **benign/read-only-ish** (open MB, search, map flag, clipboard, show
     list). No action spends gil or lists items — deliberately out of scope.

---

## 2. Protocol v2 (`src/features/plugin/protocol.ts`)

A versioned envelope supporting three shapes: **handshake**, **events** (plugin→web pushes),
and **request/response** (web→plugin, correlated by `id`). All messages carry `v: 2`. Requests
carry an `id`; the matching reply echoes it as `reqId`.

### Handshake (capability negotiation)
```ts
// web → plugin
{ type: 'hello', v: 2, client: 'chiquigil-web', capabilities: Capability[] }
// plugin → web
{ type: 'welcome', v: 2, plugin: 'qiqirn-companion', pluginVersion: string,
  character: { name: string, world: string, dc: string },
  capabilities: Capability[] }

type Capability = 'playerSnapshot' | 'inventory' | 'gil' | 'listings' | 'actions';
```
The web records the plugin's `capabilities` and only shows/enables features the plugin
advertises. A v1 plugin (no `welcome`) is treated as `['playerSnapshot']`.

### Events (plugin → web pushes)
```ts
{ type: 'playerSnapshot', v: 2, world, dc, crafterLevels }                 // existing, bumped
{ type: 'inventorySnapshot', v: 2, reqId?, source: 'bags'|'saddlebag'|'retainers'|'all',
  capturedAt: number, items: { id: number, qty: number, hq: boolean }[] }
{ type: 'gilSnapshot', v: 2, reqId?, capturedAt: number,
  gil: number, retainerGil?: number, fcCredits?: number }
{ type: 'listingsSnapshot', v: 2, reqId?, capturedAt: number,
  listings: { itemId: number, hq: boolean, unitPrice: number, qty: number, retainer?: string }[] }
```
Pushes are emitted on change (plugin debounces) and/or in answer to a request (`reqId` set).

### Requests (web → plugin) + responses
```ts
// requests (web → plugin), each with a unique id
{ type: 'requestInventory', v: 2, id, source: 'bags'|'saddlebag'|'retainers'|'all' }
{ type: 'requestGil', v: 2, id }
{ type: 'requestListings', v: 2, id }
{ type: 'action', v: 2, id, action: ActionKind, payload: object }

type ActionKind =
  | 'openMarketboard'    // payload: { itemId }
  | 'searchItem'         // payload: { query }
  | 'setMapFlag'         // payload: { zoneId, x, y } | { gatheringNodeId }
  | 'copyToClipboard'    // payload: { text }
  | 'showShoppingList';  // payload: { items: { name, qty }[] }

// responses (plugin → web)
{ type: 'actionResult', v: 2, reqId, ok: boolean, error?: string }
// requestInventory/Gil/Listings are answered by the matching *Snapshot with reqId set.
```

`protocol.ts` exports: the message interfaces, a `Capability` set, strict `parseInbound()`
(discriminated union, validates every field as the current v1 parser does), and small
`build*()` helpers for outbound messages. Keep accepting v1 `playerSnapshot` for back-compat.

---

## 3. Web-side architecture

**Modify `src/features/plugin/usePluginConnection.ts`:**
- Run the v2 handshake (send `hello` with web capabilities; store `welcome`).
- Add a **request/response correlator**: `Map<id, { resolve, reject, timer }>`; `sendRequest(msg, timeoutMs)` returns a Promise resolved when a reply with matching `reqId` arrives (or rejects on timeout / disconnect).
- Route inbound events into a new runtime store; keep the existing `playerSnapshot`→settings auto-apply.

**New `src/features/plugin/pluginDataStore.ts`** (Zustand, **not** persisted — live runtime):
- `capabilities`, `character`, latest `inventory`, `gil`, `listings` (+ their `capturedAt`).

**New `src/features/plugin/usePluginBridge.ts`** — the single surface other features call:
```ts
const { connected, has, openMarketboard, searchItem, setMapFlag,
        copyToClipboard, pushShoppingList, requestInventory, requestGil, requestListings }
  = usePluginBridge();
```
`has('inventory')` etc. gate UI on advertised capabilities. Action methods wrap `sendRequest`
and surface `{ ok, error }`. Plus thin selectors `usePluginInventory()`, `usePluginGil()`,
`usePluginListings()` reading `pluginDataStore`.

**Update `src/features/plugin/PluginPanel.tsx`:**
- Capability badges (what the connected plugin supports), character name/world.
- "Pull inventory now" / "Pull gil now" buttons; last-snapshot timestamps per stream.
- Pairing via deep link (below) with manual token paste kept as fallback.

**Pairing (better UX):** plugin command (e.g. `/qiqirn pair`) opens the default browser to
`https://qiqirn.tools/settings#pair=<token>` (token in the URL **fragment**, never sent to the
server). A small handler on the Settings route reads `location.hash`, stores the token via
`pluginStore.setToken`, enables the connection, and strips the hash. Add a "Copy pairing link"
affordance documented for the plugin. Strong token preserved; zero copy-paste.

---

## 4. Where the new data plugs into existing features

| Capability | Feeds | How |
|---|---|---|
| **Inventory** | Craft-from-Inventory (`/craft-from-inventory`), Cleanup (`/cleanup`), Shopping List | Add a "Use live inventory (plugin)" source that fills the inventory array from `usePluginInventory()` instead of CSV. Reuse existing `findCraftableFromInventory` / `runCleanup` unchanged. |
| **Gil** | Planner HeroBlock (`/planner`) | Auto-fill current treasury from `usePluginGil()`, with manual override preserved. |
| **Listings** | New "Your listings / undercut" panel | Compare `listingsSnapshot` unit prices against the live market floor (existing `buildRows`/market data) to flag "undercut on X by Yg". Surface on Watchlist/Dashboard or a dedicated small panel. |
| **Actions** | Item page, Dashboard/Watchlist rows, Shopping List | When `has('actions')`: "Open in-game MB", "Copy name", "Set waypoint" buttons; Shopping List gets "Send to plugin". All call `usePluginBridge()` and no-op/hide when disconnected. |

All four degrade gracefully: every surface checks `connected && has(capability)` and falls
back to today's behavior (CSV import, manual gil, no buttons) when the plugin is absent.

---

## 5. Phasing

1. **Protocol v2 foundation** — `protocol.ts` rewrite (+ tests), handshake + capability
   negotiation, request/response correlator in `usePluginConnection`, `pluginDataStore`,
   `usePluginBridge`. Backward-compatible with the v1 `playerSnapshot`.
2. **Pairing + panel** — deep-link pairing, capability badges, per-stream timestamps/buttons.
3. **Inventory** — wire `usePluginInventory()` into Craft-from-Inventory, Cleanup, Shopping
   List (highest payoff). 
4. **Gil + Listings** — Planner auto-treasury; undercut panel.
5. **Actions** — Open-MB / Copy / Set-flag / Send-shopping-list buttons across the app.

---

## 6. Verification

- **Unit:** extend `src/features/plugin/protocol.test.ts` — parse/build round-trips and
  malformed-input rejection for every new message type (pure functions, mirrors current style).
- **Fake plugin server (key enabler):** `docs/plugin-examples/fake-plugin-server.mjs` — a tiny
  Node `ws` server implementing the v2 contract (random token, `welcome` with capabilities,
  canned inventory/gil/listings, echoes actions as `actionResult`). Lets the **entire web side
  be developed and tested end-to-end before the C# plugin exists**: run it, paste the token,
  exercise every feature.
- **Connection logic:** test `usePluginConnection`'s handshake, request/response resolution,
  and timeout against the fake server (or an in-test mock WS).
- **Manual:** `npm run dev`, start the fake server, pair via the deep link, confirm inventory
  fills Craft-from-Inventory, gil fills the Planner, an undercut shows in the listings panel,
  and "Open in-game MB" returns `actionResult ok`.
- **Contract doc:** update `docs/plugin-browsing-api.md` (or a new `docs/plugin-live-sync.md`)
  with the v2 message reference + the security requirements (token, Origin allowlist,
  127.0.0.1 bind) so the C# repo implements to spec.

## Files at a glance

**Modify:** `src/features/plugin/protocol.ts`, `usePluginConnection.ts`, `PluginPanel.tsx`,
`pluginStore.ts`; `src/routes/Settings.tsx` (pairing handler); integration points in
`src/routes/CraftFromInventory.tsx`, `src/routes/Cleanup.tsx`, the Shopping List feature, and
`src/features/planner/*` (HeroBlock).

**Create:** `src/features/plugin/pluginDataStore.ts`, `usePluginBridge.ts`, an undercut/listings
panel component; `docs/plugin-examples/fake-plugin-server.mjs`; `docs/plugin-live-sync.md`.

**Reuse (do not reinvent):** `findCraftableFromInventory`, `runCleanup`, `buildRows`/market
data, the existing `pluginStore`/`PluginPanel`, and the strict-validation style already in
`protocol.ts`.
