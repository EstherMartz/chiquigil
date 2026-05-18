# Cross-World Listings Block on /item/:id — Design Spec

**Status:** Approved 2026-05-18
**Scope:** New section on `/item/:id` showing per-listing offers across Chaos + Light worlds (Europe region), sorted by price ascending.
**Depends on:** `useMarketData` already fetching `region: 'Europe'` (existing).

---

## Goal

Today `/item/:id` shows two summary price cards (home + DC) but the user can't see *which worlds in Europe* actually have the listings. Add a Universalis-style cross-world table fed by the region payload we already fetch, so the user can spot the cheapest listing across the region without leaving the page.

## Non-goals

- No per-listing quantity (we strip qty in `parseMarketResponse` today; adding it back touches the parser + every test fixture — YAGNI for gil flipping).
- No retainer names.
- No purchase history table (existing `SaleHistoryBlock` handles 30-day chart).
- No DC tabs — one flat price-sorted table.
- No NA/JP/OCE — explicitly Europe-only.

## Architecture

Pure render component fed by data the route already has loaded.

### Data source

`useMarketData(priceIds, world, dc, 'Europe')` already runs in `Item.tsx` and populates `market.data.region[itemId].worldListings: WorldListing[]`, where each entry is `{ world, price, hq }` (existing type in `src/lib/universalis.ts`). No new fetch, no parser change.

### New component

`src/features/items/CrossWorldListingsBlock.tsx`:

```ts
interface Props {
  listings: WorldListing[];
  homeWorld: string;
  homeMinNQ: number | null;
  homeMinHQ: number | null;
}
```

Render:
- Returns `null` when `listings.length === 0`.
- Sorts a copy of `listings` by `price ASC` (stable; tie-break by world for determinism).
- Renders a table with one row per listing.

### Table columns

| #  | DC      | Server     | HQ  | Price  | vs home |
|----|---------|------------|-----|--------|---------|
| 1  | Light   | Bismarck   |     | 489    | −51%    |
| 2  | Chaos   | Lich       | ✦   | 510    | −49%    |
| 3  | Phantom | (home)     |     | 989    | —       |

- **#** — index, mono, text-text-low.
- **DC** — `dcOf(world)` result. Color-coded: Chaos = `text-aether`, Light = `text-jade`. Unknown (shouldn't happen for EU data, defensive) = `text-text-low`.
- **Server** — plain. Home world rows get a `· home` chip (subtle text-low pill) for orientation.
- **HQ** — `<HqStar />` glyph (existing component at `src/components/HqStar.tsx`) when `hq === true`, else empty.
- **Price** — `fmtGil(price)`, mono, right-aligned.
- **vs home** — % diff vs the matching-HQ home minimum:
  - For an NQ row: compare to `homeMinNQ`. For an HQ row: compare to `homeMinHQ`.
  - Formula: `((price - home) / home) * 100`, rounded to integer with sign (`-51%`, `+12%`).
  - Colors: jade for negative (cheaper), crimson for positive (pricier), text-text-low for `—` (no comparable home tier).
  - Home-world own rows always render `—` (would be 0% by definition; less noise).

### Section header + container

Uses existing `<SectionHeader label="Cross-world listings" compact />`, then a `border border-border-base bg-bg-card overflow-x-auto` wrapper around a `w-full text-sm` table — same pattern as the existing tables in `Item.tsx` (`UsedInBlock`, `MaterialShoppingBlock`).

### Wire-up

In `src/routes/Item.tsx`, insert between the existing `PricesBlock` and the `vendorPrice` gated `VendorSourceCard`:

```tsx
{regionMarket && regionMarket.worldListings.length > 0 && (
  <CrossWorldListingsBlock
    listings={regionMarket.worldListings}
    homeWorld={world}
    homeMinNQ={phantomMarket?.minNQ ?? null}
    homeMinHQ={phantomMarket?.minHQ ?? null}
  />
)}
```

Where `regionMarket = market.data?.region[itemId]` (new local, mirrors existing `phantomMarket` / `dcMarket` locals).

## Edge cases

- **Empty listings:** component returns `null`. The `Item.tsx` gate also checks length, so the section disappears entirely.
- **Listing missing `worldName`:** raw API field is optional — parser already coerces to `''`. Skip rows with empty world during the render-prep step.
- **No home tier:** `homeMinNQ` / `homeMinHQ` null → render `—` in `vs home` for matching-HQ rows.
- **Mixed NQ + HQ in same table:** intentional. HQ column distinguishes; `vs home` compares against the matching tier.
- **Caching:** none. The data is already cached by `fetchMarketData` (30-min TTL); we just render what's there.

## Testing

New file `src/features/items/CrossWorldListingsBlock.test.tsx` with 4 tests:

1. Renders nothing when `listings` empty.
2. Renders rows sorted by price ASC, with DC labels and HQ glyph on the right rows.
3. `vs home` shows correct sign and color (jade for cheaper than home, crimson for pricier, `—` when home tier missing or this row IS home).
4. Home-world row is tagged `home` and its `vs home` is `—`.

One assertion added to existing `src/routes/Item.test.tsx`: when region data is populated, `Cross-world listings` heading appears.

Suite: 641 → ~648 (+7 tests).

## File list

**Create:**
- `src/features/items/CrossWorldListingsBlock.tsx`
- `src/features/items/CrossWorldListingsBlock.test.tsx`

**Modify:**
- `src/routes/Item.tsx` (one local + one JSX block)
- `src/routes/Item.test.tsx` (one assertion)

## Out of scope (deferred)

- Quantity / total / retainer columns — would need parser change.
- Sortable column headers — single sort (price ASC) is the gil-flipping default; user can scan visually.
- Cross-DC for NA/JP/OCE — current snapshot/fetch is Europe-only by design.
- Linking server names anywhere (e.g. to Universalis web) — no value beyond the existing "Open on Garland" link.
