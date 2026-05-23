# DC Flip Tab Rewrite — Design Spec

**Date:** 2026-05-23
**Scope:** Rewrite the Arbitrage tab as "DC Flip" — find items cheaper on other DC worlds than on Phantom, with a RUN SCAN button, velocity filter, and broader item pool.

---

## 1. Core Logic

### `runDcFlip` Function

New file `src/features/insights/dcFlip.ts` replacing `arbitrage.ts`.

**Input:**
- `items: SnapshotItem[]` — full catalog items (not just watchlist)
- `dcMarket: MarketData` — DC-scope market data with `worldListings`
- `homeMarket: MarketData` — home-world market data (for velocity)
- `opts: { homeWorld: string; minSpread: number; minVelocity: number }`

**Output:** `DcFlipRow[]` sorted by spread descending.

```ts
interface DcFlipRow {
  id: number;
  name: string;
  buyWorld: string;
  dcPrice: number;
  phantomPrice: number;
  spread: number;
  velocity: number;
}
```

**Logic per item:**
1. Get DC listings for this item. Find `phantomMin` = cheapest listing where `world === homeWorld`. Find `dcMin` = cheapest listing where `world !== homeWorld`, along with its `world` name.
2. Both must exist. Compute `spread = phantomMin - dcMin`. Skip if `spread < minSpread`.
3. Get velocity from `homeMarket[id].velocity` (regularSaleVelocity). Skip if `velocity < minVelocity`.
4. Emit row with `buyWorld`, `dcPrice: dcMin`, `phantomPrice: phantomMin`, `spread`, `velocity`.

**Files:**
- Create: `src/features/insights/dcFlip.ts`
- Create: `src/features/insights/dcFlip.test.ts`
- Delete: `src/features/insights/arbitrage.ts` (replaced)

---

## 2. View Rewrite

Replace `ArbitrageView.tsx` with `DcFlipView.tsx`.

**Pattern:** Same as VendorFlipView — RUN SCAN button, filter bar, batch-fetch, results table.

### Candidate ID Selection

Collect item IDs to scan:
1. Start with user's watchlist IDs (prioritized).
2. Fill with top-velocity items from the item catalog (tradeable, sc > 0), up to a reasonable limit (e.g., 500 total candidates).
3. Deduplicate.

### Fetching

Use `fetchInBatches` to fetch DC-scope market data for all candidate IDs. Also need home-world data for velocity — use a parallel `fetchInBatches` call for the home world, or reuse existing cached data if available.

Actually, the existing `fetchMarketData(dc, ids)` returns DC-scope data which includes `worldListings` AND `velocity` (DC-wide velocity). For home-world velocity specifically, need `fetchMarketData(world, ids)`. Fetch both in parallel.

### Filter Bar

```
[Min spread (gil): 10000] [Min velocity / day: 1] [RUN SCAN]
```

Description line below:
> "Finds items cheaper on other Chaos worlds than on Phantom. Travel to buy, relist at home."

### Results Table

Columns (all sortable via header click):

| Column | Key | Align | Notes |
|--------|-----|-------|-------|
| Item | `name` | left | ItemNameLinks + CopyButton |
| Buy on | `buyWorld` | left | World name in aether colour |
| DC Price | `dcPrice` | right | fmtGil |
| Phantom Price | `phantomPrice` | right | fmtGil |
| Spread | `spread` | right | fmtGil in jade (always positive) |
| Velocity | `velocity` | right | X.X/day, hideOnMobile |

Default sort: spread descending.

### Empty State

```tsx
<EmptyState icon="⇄" message={`No items found with a spread above ${fmtGil(minSpread)}. Try lowering the threshold or running again after the market updates.`} />
```

**Files:**
- Create: `src/features/insights/DcFlipView.tsx`
- Delete: `src/features/insights/ArbitrageView.tsx` (replaced)

---

## 3. Tab Rename

In `src/routes/Trading.tsx`:
- Change tab ID from `'arbitrage'` to `'dcFlip'`
- Change label from `'Arbitrage'` to `'DC Flip'`
- Import `DcFlipView` instead of `ArbitrageView`

---

## 4. Files

### New Files
| File | Purpose |
|------|---------|
| `src/features/insights/dcFlip.ts` | `runDcFlip` pure function + `DcFlipRow` type |
| `src/features/insights/dcFlip.test.ts` | Tests for `runDcFlip` |
| `src/features/insights/DcFlipView.tsx` | View component with scan button + filters + results |

### Deleted Files
| File | Reason |
|------|--------|
| `src/features/insights/arbitrage.ts` | Replaced by dcFlip.ts |
| `src/features/insights/ArbitrageView.tsx` | Replaced by DcFlipView.tsx |

### Modified Files
| File | Changes |
|------|---------|
| `src/routes/Trading.tsx` | Tab rename + import swap |

### Test Cleanup
- Any tests importing `arbitrage.ts` or `ArbitrageView.tsx` need updating to reference new files.
