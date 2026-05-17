# NPC Vendor Flip — Design Spec

**Date:** 2026-05-17
**Status:** Approved (in conversation)

## Goal

Surface gil-shop items where the NPC vendor price is meaningfully below what the same item sells for on the user's home-world marketboard. The user can dial filters from "lazy gil-maker" (high markup, decent profit/unit, regular sales) to "comprehensive scanner" (any positive margin).

Two integration points ship together:

1. **Discovery scan** — standalone `/vendor-flip` route, ranked by profit/day (or four other sort modes), filter strip on top, sortable table below.
2. **Per-item drill** — small "Vendor source" card on `/item/:id` showing vendor cost + comparison to current home MB tier when the item is in the gil-shop snapshot.

## Non-goals

- **Cross-region sale comparison.** Sale baseline is always the user's home world (Phantom). FFXIV rules: items can only be listed on home-world MB.
- **NPC name / zone enrichment.** v1 shows only "Sold by NPC: N gil." A future enrichment via Garland's `useGarlandItem` could attach vendor names — out of scope here.
- **Special-currency vendors.** Only gil shops (`GilShopItem` sheet). Tomestone / scrip / GC seal vendors are a different system; they have their own currency-optimizer phase in the roadmap (deferred).
- **Travel-cost modeling.** Vendor items have a fixed gil price game-wide; the user travels to a city via aetheryte. No special handling beyond surfacing the opportunity.
- **HQ-only crafted variants of vendor items.** Some vendor NQ items can be processed into HQ form externally — the scan ignores that pipeline and only compares vendor NQ price vs. MB NQ/HQ tier directly.
- **Region parametrization.** Same as Material Flip — hard-coded to the user's `world` from `useSettingsStore`. The flow is region-agnostic (any world works), only the snapshot scope is "home world."

## Architecture

```
GilShopItem sheet (XIVAPI v2)
        │  fetch once, cache in IDB v8 store 'gilShop' (~2k entries)
        ▼
VendorSnapshot: Map<itemId, vendorPrice>
        │
        ▼ join with itemSnapshot, filter by filter.searchCategories + filter.hq policy
candidate ids
        │
        ▼ chunked Universalis fetch with scope = settings.world
homeSaleMap: id → MarketItem
        │
        ▼ for each id:
        │    tier = pickTrustedSaleTier(market, filter.hq, item.canHq)
        │    profitPerUnit = tier.unit − vendorPrice
        │    markup        = tier.unit / vendorPrice
        │    profitPerDay  = profitPerUnit × velocity
        │  drop if any of {tier == null, profit < minProfit, markup < minMarkup,
        │    velocity < minVelocity, listingCount > maxListings}
        ▼
runVendorFlip → VendorFlipRow[]   (sorted by filter.sort, sliced to filter.limit)
```

`pickTrustedSaleTier` already exists in `src/features/queries/runMaterialFlip.ts`. v1 inline-copies the helper into `runVendorFlip.ts`. Extraction to a shared util stays on the deferred-cleanup list (alongside the existing `findBestSingleStop` deferral).

## UI

### Discovery route `/vendor-flip`

`max-w-7xl mx-auto px-4 space-y-4` container, matching existing trading views.

**Header strip:** `<h2>Vendor Flip</h2>` + sub-line "Flip NPC gil-shop items on your home MB" + "Refresh ⟳" button.

**Filter strip** (horizontal flex, wraps on mobile):
- Category dropdown (multi-select of `ItemSearchCategory`)
- Min profit (gil/unit, number input)
- Min markup (×, number input)
- Min sales/day (number input, step 0.1)
- Max listings (number input, blank = no cap)
- HQ mode (radio: NQ / HQ / Either — default Either)
- Sort dropdown (Profit/day / Markup / Profit/unit / Sale price / Velocity)

**Status banners:**
- Snapshot loading spinner ("Loading vendor catalog…") when first fetch in flight.
- `StatusBanner kind="error"` for snapshot fail (with retry button).
- `StatusBanner kind="error"` for Universalis fetch fail; partial results render if some chunks succeeded ("`N` batch(es) skipped" sub-line).

**Results table** (sortable headers, `▲`/`▼` arrow indicator on active column):

| Item | Vendor cost | Sale tier | Profit/u | Markup % | Sales/day | Profit/day |
|------|------------:|-----------|---------:|---------:|----------:|-----------:|
| `<Link to=/item/:id>` | gil | gil + HQ★ glyph when `hq` | gil (jade) | × | velocity | gil/day |

Default sort: **Profit/day desc**. Limit: 200 rows. Empty result → italic "No vendor flips match the current filters."

### Per-item card on `/item/:id`

Slots between `PricesBlock` and `SaleHistoryBlock` in `src/routes/Item.tsx`. Renders only when item is in the vendor snapshot:

```
┌─ Vendor source ─────────────
│  Sold by NPC: 108 gil
│  (vs. Phantom HQ 4,200g · profit 4,092g/unit)
└─────────────────────────────
```

- Comparison sub-line only when a trusted home-world tier exists; otherwise just the "Sold by NPC: N gil" line.
- Profit shown jade if positive, crimson if negative, text-low if zero/missing.

## Data layer

### `src/lib/vendorShopSnapshot.ts`

- `interface VendorSnapshotEntry { itemId: number; price: number }`
- `fetchGilShopPage(after, pageSize) → RawGilShopPage` (paginated XIVAPI v2 `/api/sheet/GilShopItem` fetch, fields = `Item.PriceMid`)
- `parseGilShopPage(raw) → VendorSnapshotEntry[]` — drops rows where `price <= 0`; dedupes by `itemId` (last write wins, all writes guaranteed identical price).
- `fetchVendorSnapshot(opts) → Map<itemId, price>` — loops pagination via `last row_id` cursor (mirrors `fetchItemSnapshot` pattern in `itemSnapshot.ts`).
- Cache layer in `recipeCache.ts`: `getCachedVendorSnapshot()` / `putCachedVendorSnapshot(map)` writing to a new dedicated `gilShop` store (matching the Leve / Recipe-snapshot pattern), with single-key persistence (the entire `Map<itemId, price>` serialized under one key).

### `src/lib/recipeCache.ts`

- Bump `DB_VERSION` from 7 → 8.
- Add `gilShop` to the store creation block in `upgrade()`.
- No destructive migration; existing v7 stores survive.

### `src/features/queries/useVendorShopSnapshot.ts`

TanStack Query hook, IDB-first read, network on miss, 24h staleTime (vendor catalog is patch-stable).

### `src/features/queries/types.ts`

```ts
export interface VendorFlipFilter {
  searchCategories: number[];
  minProfit: number;
  minMarkup: number;
  minVelocity: number;
  maxListings: number | null;
  hq: HqMode;                   // already exists: 'either' | 'nq' | 'hq'
  sort: VendorFlipSort;
  limit: number;
}

export type VendorFlipSort =
  | 'profitPerDay' | 'markup' | 'profitPerUnit' | 'salePrice' | 'velocity';

export interface VendorFlipRow {
  id: number;
  name: string;
  sc: number;
  vendorPrice: number;
  salePrice: number;
  hq: boolean;
  profitPerUnit: number;
  markup: number;
  profitPerDay: number;
  velocity: number;
  listingCount: number;
}

export function defaultVendorFlipFilter(): VendorFlipFilter {
  return {
    searchCategories: [],
    minProfit: 500,
    minMarkup: 2.0,
    minVelocity: 0.5,
    maxListings: null,
    hq: 'either',
    sort: 'profitPerDay',
    limit: 200,
  };
}
```

### `src/features/queries/runVendorFlip.ts`

Pure compute. Signature:

```ts
export function runVendorFlip(
  snapshot: SnapshotItem[],
  vendorMap: Map<number, number>,
  saleMap: MarketData,
  filter: VendorFlipFilter,
): VendorFlipRow[]
```

Implementation per the row computation in the brainstorm Section 3. Sorted, then sliced.

### View components

- `src/features/insights/VendorFlipView.tsx` — orchestration (snapshot + market fetch via mutation pattern matching `GcSeals`).
- `src/features/insights/VendorFlipResults.tsx` — sortable table (mirrors `MaterialFlipResults` structure).
- `src/routes/VendorFlip.tsx` — thin route wrapper.

### Per-item integration

- New `src/features/items/VendorSourceCard.tsx` — props `{ itemId, vendorPrice, homeMarket: MarketItem | undefined, canHq, worldLabel }`. Renders the small "Sold by NPC: N gil" card.
- `src/routes/Item.tsx` reads `useVendorShopSnapshot()` and renders the card when `vendorSnapshot.data?.get(itemId) != null`, passing the snapshot price + the `phantomMarket` already in scope.

### Nav + route wiring

- `src/App.tsx` — register `<Route path="/vendor-flip" element={<VendorFlip />} />`.
- `src/components/layout/Header.tsx` — NavLink "Vendor flip" between "Trading" and "Gathering" (gil-making cluster).

## Edge cases

- **Snapshot first load** — spinner; results hidden.
- **Snapshot fetch fail** — error banner + retry; view inert.
- **Universalis fetch fail (partial)** — render what succeeded, banner reports skipped batch count (same pattern as `GcSeals.tsx`).
- **Item in snapshot but no trusted home-world tier** — row excluded silently (no flip opportunity).
- **vendorPrice = 0** — dropped at parse time; never enters snapshot.
- **Duplicate gil-shop entries for same item** — dedupe by `itemId` in `parseGilShopPage` (all duplicates guaranteed equal price).
- **IDB v7 → v8** — additive migration; no data loss.
- **Per-item card during snapshot load** — card doesn't render; appears once snapshot resolves.
- **Stale Universalis listings (>3d)** — no special handling in v1; row still included if velocity meets filter.

## Testing

Vitest + RTL, colocated `.test.ts(x)`.

**Unit:**
- `vendorShopSnapshot.test.ts` — `parseGilShopPage` correctness (parse, drop zero-price, dedupe).
- `runVendorFlip.test.ts` — empty snapshot; item-not-in-snapshot exclusion; null trusted tier exclusion; `hq:'either'` picks max(NQ, HQ); each filter excludes when violated and includes when satisfied; `profitPerDay = profit × velocity`; five sort modes; stable tie-break by id asc; limit slice.

**Component:**
- `VendorFlipResults.test.tsx` — column rendering, HQ★ glyph, sortable header click changes sort direction + reorders rows.
- `VendorFlipView.test.tsx` — loading state, snapshot error banner, default filter produces expected rows from fixtures, refresh button refetches.
- `VendorSourceCard.test.tsx` — three modes: not in snapshot → null render; in snapshot + trusted tier → full card with profit line; in snapshot + no trusted tier → bare "Sold by NPC: N gil".

**Integration (light):**
- `VendorFlip.test.tsx` (route) — mounts route, mocks snapshot+market hooks, default filter renders ≥1 row from fixture.

Skip: full Universalis network, cross-route navigation, Garland NPC enrichment.

## Files (anticipated)

**Create:**
- `src/lib/vendorShopSnapshot.ts` + test
- `src/features/queries/useVendorShopSnapshot.ts`
- `src/features/queries/runVendorFlip.ts` + test
- `src/features/insights/VendorFlipView.tsx` + test
- `src/features/insights/VendorFlipResults.tsx` + test
- `src/features/items/VendorSourceCard.tsx` + test
- `src/routes/VendorFlip.tsx` + test

**Modify:**
- `src/lib/recipeCache.ts` — DB v8 + `gilShop` store
- `src/features/queries/types.ts` — `VendorFlipFilter`, `VendorFlipRow`, `VendorFlipSort`, `defaultVendorFlipFilter`
- `src/App.tsx` — route registration
- `src/components/layout/Header.tsx` — NavLink
- `src/routes/Item.tsx` — render `<VendorSourceCard />` when in snapshot

## Phased delivery

v1 ships everything above. Follow-ups:
- After v1: extract `pickTrustedSaleTier` into a shared util consumed by `runVendorFlip`, `runMaterialFlip`, `runCraftFlip`.
- After v1: add "Source" column to the Shopping List detail table now that vendor data exists (the deferred follow-up from P2-4).
- Future: enrich the per-item card with NPC name + zone via `useGarlandItem` (cheap once user already on `/item/:id`).
- Future: special-currency vendors (tomestone / scrip / GC seal) as part of Phase 4 currency optimizer.
