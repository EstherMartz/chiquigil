# Currency Optimizer — Design Spec

**Date:** 2026-05-17
**Status:** Approved (in conversation)

## Goal

Help the user spend earned special currencies (tomestones, scrips, MGP, Wolf Marks, Bicolor Gemstones) on vendor items that yield the highest gil per currency-unit when sold on their home-world marketboard. Inverse of `/gc-seals` (which spends gil on MB items to convert to seals); this view spends earned currency to acquire MB-resellable items.

v1 ships a generic scaffold supporting 10 currencies via a single picker. Future iterations slot new currencies in without reworking the data layer.

## Non-goals

- **Weekly cap awareness.** Some currencies cap weekly (Causality, purple scrips). v1 just shows gil/unit; the user does the "weekly cap × gil/unit = total potential" math.
- **Currency cap tracking.** No store for "how much of each currency the user currently holds." Out of scope; the user knows their own balance.
- **Per-item drill on `/item/:id`.** A "Currency source" card would duplicate the existing `VendorSourceCard` scaffolding. Deferred follow-up; users can navigate to `/item/:id` via the Item link in the table for prices/recipe.
- **GC seal subsumption.** `/gc-seals` does the inverse direction (MB → seals) and keeps its dedicated route. Adding seals to the currency picker would conflate two opposite flows.
- **Cross-region sale scope.** Sale baseline is the user's home world only (FFXIV rule: items only list on home-world MB). Matches Vendor Flip.
- **Travel-cost modeling.** Currency vendors live in fixed cities; user travels there once per session. Not a meaningful cost.
- **Special vendor variants (e.g., RNG drops, currency-only crafting recipes).** Only items with a deterministic `cost → item` mapping in `SpecialShop` are surfaced.

## Architecture

```
SpecialShop sheet (XIVAPI v2)
        │  fetch once, cache in IDB v9 store 'specialShop' (~5k entries)
        ▼
SpecialShopSnapshot: { byCurrency: Map<CurrencyId, ShopEntry[]> }
        where ShopEntry = { itemId, receiveQty, costPerUnit, isHq }
        │
        ▼ user picks a currency
entries = snapshot.byCurrency.get(selectedCurrency)
        │
        ▼ filter by item-snapshot membership + filter.hq policy
candidate ids
        │
        ▼ chunked Universalis fetch with scope = settings.world
homeSaleMap: id → MarketItem
        │
        ▼ for each entry:
        │    effectiveHq = entry.isHq ? 'hq' : filter.hq
        │    tier = pickTrustedSaleTier(market, effectiveHq, item.canHq)
        │    gilPerUnit = tier.unit / entry.costPerUnit
        │  drop if {tier null, gilPerUnit < minGilPerUnit, velocity < minVelocity,
        │           listingCount > maxListings}
        ▼
runCurrencyFlip → CurrencyFlipRow[]   (sorted by filter.sort, sliced to filter.limit)
```

`pickTrustedSaleTier` is inline-copied from `runVendorFlip.ts` (same "higher trusted tier wins for `either`" semantics). Extraction stays on the deferred-cleanup list — vendor's variant picks the higher tier; material/craft pick the first match.

## Currency catalog

Curated, hard-coded list of 10 currencies. The `itemId` values **MUST be verified against XIVAPI at implementation time** — placeholder values shown for illustration only:

```ts
// src/lib/currencies.ts
export type CurrencyId =
  | 'poetics' | 'mathematics' | 'causality'
  | 'whiteCrafter' | 'purpleCrafter'
  | 'whiteGatherer' | 'purpleGatherer'
  | 'mgp' | 'wolfMarks' | 'bicolor';

export interface CurrencyDef {
  id: CurrencyId;
  label: string;       // full name for picker display
  shortLabel: string;  // compact label for table cell (e.g., "Poetics")
  itemId: number;      // Item sheet row_id for this currency
}

export const CURRENCIES: readonly CurrencyDef[] = [
  // VERIFY itemIds against https://v2.xivapi.com/api/sheet/Item before shipping.
  { id: 'poetics',         label: "Allagan Tomestone of Poetics",     shortLabel: 'Poetics',     itemId: 28 },
  { id: 'mathematics',     label: "Allagan Tomestone of Mathematics", shortLabel: 'Mathematics', itemId: 47 },
  { id: 'causality',       label: "Allagan Tomestone of Causality",   shortLabel: 'Causality',   itemId: 48 },
  { id: 'whiteCrafter',    label: "White Crafters' Scrip",            shortLabel: 'W-Craft',     itemId: 25199 },
  { id: 'purpleCrafter',   label: "Purple Crafters' Scrip",           shortLabel: 'P-Craft',     itemId: 33913 },
  { id: 'whiteGatherer',   label: "White Gatherers' Scrip",           shortLabel: 'W-Gather',    itemId: 25200 },
  { id: 'purpleGatherer',  label: "Purple Gatherers' Scrip",          shortLabel: 'P-Gather',    itemId: 33914 },
  { id: 'mgp',             label: "MGP",                              shortLabel: 'MGP',         itemId: 29 },
  { id: 'wolfMarks',       label: "Wolf Marks",                       shortLabel: 'Wolf',        itemId: 25 },
  { id: 'bicolor',         label: "Bicolor Gemstone",                 shortLabel: 'Bicolor',     itemId: 26807 },
];
```

The parser only emits a `ShopEntry` if a row's `ItemCost` matches one of these curated `itemId`s. Unknown currencies in `SpecialShop` are silently ignored.

## UI

### Route `/currency-flip`

`max-w-7xl mx-auto px-4 space-y-4` container.

**Header strip:** `<h2>Currency Optimizer</h2>` + sub-line "Spend earned currency on vendor items, sell on home MB for the best gil/currency-unit ratio." + "Refresh ⟳" button (re-fetches both catalog + prices).

**Top strip:**
- Currency dropdown (10 options from `CURRENCIES`, displayed by `label`).
- "Run scan" button (primary, gold).
- "⟳ Catalog" button (re-fetches `SpecialShop` snapshot only).

**Filter strip** (rendered after first scan):
- Min gil/unit (number input)
- Min sales/day (number input, step 0.1)
- Max listings (number input, blank = no cap)
- HQ mode (3-button group: NQ / HQ / Either)
- Sort (dropdown: Gil/unit / Sale price / Velocity / Cost per unit)

**Status banners:** snapshot loading spinner, snapshot-fetch-fail error banner, Universalis-fetch-fail error banner, partial-skipped sub-line.

**Results table** (sortable headers, `▼` indicator on active column):

| # | Item | Cost | Sale | Gil/unit | Sales/day | Listings |
|---|------|-----:|-----:|---------:|----------:|---------:|
| 1 | `<Link>` | `12 Poetics` | `4,200g + HQ★` | `350g` | `1.4` | `3` |

- **Item** — clickable via `ItemNameLinks`.
- **Cost** — `<costPerUnit.toFixed(2)> <shortLabel>` (non-sortable column header is plain `<th>`).
- **Sale** — `fmtGil(tier.unit)` + `HqStar` glyph when `hq=true`.
- **Gil/unit** — `fmtGil(gilPerUnit)` in jade.
- **Sales/day** — `velocity.toFixed(1)`, hidden on mobile.
- **Listings** — raw count, hidden on mobile.

Default sort: **Gil/unit desc**. Limit: 200 rows.

**Empty state:** italic "No items match these filters for `<currency.label>`. Try lowering the gil/unit floor or switching currencies."

### URL state

Currency choice persists in `?currency=poetics`. React-local state for filter shape (not URL-persisted) — matches `MaterialFlipView` / `VendorFlipView`.

Invalid `?currency=` values fall back to default (`poetics`) silently; optional `StatusBanner kind="info"` "Unknown currency, defaulted to Poetics" if implementation finds it useful.

## Data layer

### `src/lib/specialShopSnapshot.ts`

- `interface ShopEntry { itemId: number; receiveQty: number; costPerUnit: number; isHq: boolean }`
- `interface SpecialShopSnapshot { byCurrency: Map<CurrencyId, ShopEntry[]> }`
- `parseSpecialShopPage(raw, currencyByItemId)` — walks each row's sub-rows; for each sub-row, checks if `ItemCost[i]` matches a curated currency; if yes, emits `{ itemId: ItemReceive[i], receiveQty: CountReceive[i], costPerUnit: CountCost[i] / CountReceive[i], isHq: HqItemReceive[i] === true }`. Drops sub-rows where `CountReceive <= 0` or `CountCost <= 0`. Iterates all sub-rows generically (no hard-coded 0..7).
- `fetchSpecialShopSnapshot(opts)` — paginated fetcher, `row_id` cursor, mirrors `fetchVendorSnapshot` / `fetchLeveSnapshot` shape. Returns the fully-built `SpecialShopSnapshot`.
- Cache helpers in `recipeCache.ts`: dedicated `specialShop` store with single-key blob (matches gilShop pattern).

### `src/lib/recipeCache.ts`

- Bump `DB_VERSION` 8 → 9.
- Add `specialShop` to the store creation block.
- Add 4 helpers: `getCachedSpecialShop`, `putCachedSpecialShop`, `clearSpecialShopCache`, `getSpecialShopUpdatedAt`. Serialize `Map<CurrencyId, ShopEntry[]>` as an array of `[CurrencyId, ShopEntry[]]` tuples.

### `src/features/queries/useSpecialShopSnapshot.ts`

TanStack Query hook, IDB-first, fetch on miss, 24h staleTime. Same shape as `useVendorShopSnapshot`.

### `src/features/queries/types.ts`

```ts
export type CurrencyFlipSort =
  | 'gilPerUnit' | 'salePrice' | 'velocity' | 'costPerUnit';

export interface CurrencyFlipFilter {
  currency: CurrencyId;
  minGilPerUnit: number;
  minVelocity: number;
  maxListings: number | null;
  hq: HqMode;
  sort: CurrencyFlipSort;
  limit: number;
}

export interface CurrencyFlipRow {
  id: number;
  name: string;
  sc: number;
  costPerUnit: number;
  salePrice: number;
  hq: boolean;
  gilPerUnit: number;
  velocity: number;
  listingCount: number;
}

export function defaultCurrencyFlipFilter(): CurrencyFlipFilter {
  return {
    currency: 'poetics',
    minGilPerUnit: 0,
    minVelocity: 0,
    maxListings: null,
    hq: 'either',
    sort: 'gilPerUnit',
    limit: 200,
  };
}
```

### `src/features/queries/runCurrencyFlip.ts`

```ts
export function runCurrencyFlip(
  snapshot: SnapshotItem[],
  shopSnapshot: SpecialShopSnapshot,
  saleMap: MarketData,
  filter: CurrencyFlipFilter,
): CurrencyFlipRow[]
```

Per the row computation in Section 3 of the brainstorm. Inline-copies `pickTrustedSaleTier`. Stable tie-break by `id` asc, slice to `filter.limit`.

### View

- `src/features/insights/CurrencyFlipView.tsx` — orchestration (snapshot + market fetch via `useMutation` + `fetchInBatches` from `universalisBulk.ts`), currency picker, filter strip, results table.
- `src/features/insights/CurrencyFlipResults.tsx` — sortable table, mirrors `VendorFlipResults` structure.
- `src/routes/CurrencyFlip.tsx` — thin route wrapper.

### Nav + route wiring

- `src/App.tsx` — register `<Route path="/currency-flip" element={<CurrencyFlip />} />`.
- `src/components/layout/Header.tsx` — NavLink "Currencies" between "Vendor flip" and "GC Seals" (gil-making cluster).

## Edge cases

- **Snapshot first load** — spinner, picker disabled, table hidden.
- **Snapshot fetch fails** — error banner + retry; view inert.
- **Selected currency has zero entries** — empty state, no fetch, no error.
- **`?currency=` URL param unknown** — fall back to default, optional info banner.
- **Item in shop snapshot but missing from item snapshot** — silent skip.
- **Universalis fetch fails (partial)** — render successful chunks; banner reports skipped batch count.
- **`pickTrustedSaleTier` null** — silent skip (no MB activity).
- **`CountReceive=0` or `CountCost=0`** — dropped at parse time (div-by-zero guard).
- **HQ-delivery row + `filter.hq='nq'`** — force `effectiveHq='hq'` per the row logic; vendor delivers HQ regardless of user filter.
- **Sub-row count > 8** — parser iterates generically, no hard-coded bound.
- **Currency itemId drift across patches** — runtime show-empty-for-that-currency; tests assert IDs are integers but don't validate against live data.
- **IDB v8 → v9** — additive migration; no destructive changes to existing stores.

## Testing

Vitest + RTL, colocated `.test.ts(x)`.

**Unit:**
- `specialShopSnapshot.test.ts` — `parseSpecialShopPage`: empty page, multi-subrow row produces multiple entries, drops sub-rows with `CountReceive=0` or `CountCost=0`, groups by currency, computes `costPerUnit = CountCost / CountReceive`, captures `isHq`, ignores sub-rows with non-curated `ItemCost`.
- `recipeCache.specialShop.test.ts` — IDB v9 round-trip + clear + timestamp (mirrors gilShop cache test).
- `runCurrencyFlip.test.ts` — empty snapshot, currency with no entries, item missing from snapshot, item missing from sale map, `pickTrustedSaleTier` null exclusion, `hq:'either'` picks higher tier, HQ-delivery forces HQ comparison, each filter exclusion (minGilPerUnit / minVelocity / maxListings), `gilPerUnit` arithmetic, all 4 sort modes with stable id tie-break, limit slice, cost-normalization sanity.

**Component:**
- `CurrencyFlipResults.test.tsx` — column rendering, HQ★ glyph, sortable headers, active sort indicator, empty state copy.
- `CurrencyFlipView.test.tsx` — picker + Run visible, currency dropdown change updates URL, scan calls `fetchMarketData` on home world, rows render, empty-state copy when zero entries, snapshot loading hides table.

**Integration (light):**
- `CurrencyFlip.test.tsx` (route) — mounts route, mocks snapshot + market hooks, default flow renders ≥1 row from fixture.

Skip: full Universalis network, currency-itemId validation against live data, Garland enrichment.

## Files (anticipated)

**Create:**
- `src/lib/currencies.ts`
- `src/lib/specialShopSnapshot.ts` + test
- `src/lib/recipeCache.specialShop.test.ts`
- `src/features/queries/useSpecialShopSnapshot.ts`
- `src/features/queries/runCurrencyFlip.ts` + test
- `src/features/queries/currencyFlipTypes.test.ts`
- `src/features/insights/CurrencyFlipView.tsx` + test
- `src/features/insights/CurrencyFlipResults.tsx` + test
- `src/routes/CurrencyFlip.tsx` + test

**Modify:**
- `src/lib/recipeCache.ts` — DB v9 + `specialShop` store + 4 helpers
- `src/features/queries/types.ts` — add `CurrencyFlipFilter` / `CurrencyFlipRow` / `CurrencyFlipSort` / `defaultCurrencyFlipFilter()`
- `src/App.tsx` — route registration
- `src/components/layout/Header.tsx` — NavLink "Currencies"

## Phased delivery

v1 ships everything above. Follow-ups:

- After v1: extract `pickTrustedSaleTier` into a shared util consumed by `runCurrencyFlip`, `runVendorFlip`, `runMaterialFlip`, `runCraftFlip`. Must expose a `'first' | 'higher'` strategy parameter to preserve material/craft-flip behavior.
- After v1: add a "Currency source" card on `/item/:id` (parallels `VendorSourceCard`) when an item is sold by a currency vendor.
- After v1: weekly-cap helper — per-currency cap table + "spending your full cap on this gets you N gil" callout.
- Future: subsume `/gc-seals` by adding GC seals as a currency, with the "earn-currency → spend-on-MB-flip" inverse direction toggle.
