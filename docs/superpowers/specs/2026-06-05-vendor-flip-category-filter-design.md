# Vendor Flip — Category Filter

**Date:** 2026-06-05
**Status:** Approved, ready for plan

## Goal

Let users narrow Vendor Flip results to specific item types (e.g. Furnishings) by
adding a category multi-select to the Vendor Flip FilterBar.

## Background

The Vendor Flip view scans NPC gil-shop items for marketboard flips. Users want to
focus on a single item type ("show me only furniture flips"). The original request
was to filter by *vendor*, but the vendor snapshot stores only `itemId → price`
([vendorShopSnapshot.ts](../../../src/lib/vendorShopSnapshot.ts)) — no NPC/shop
identity — so named-vendor filtering would require building an NPC↔shop reverse
index at bake time. Filtering by item *category* delivers the underlying intent
("focus the results") at near-zero cost, because the data layer already supports it.

## Scope — UI only

The data layer already consumes `filter.searchCategories`; the control to set it is
simply missing from the FilterBar:

- `candidateIds` already filters by the category set —
  [VendorFlipView.tsx:43-48](../../../src/features/insights/VendorFlipView.tsx)
- The runner already filters by it —
  [runVendorFlip.ts:23-26](../../../src/features/queries/runVendorFlip.ts)
- `scanParamsChanged` already tracks it (so changing it marks the scan stale) —
  [VendorFlipView.tsx:36-37](../../../src/features/insights/VendorFlipView.tsx)

**No changes** to `types.ts`, `runVendorFlip.ts`, fetch logic, or the snapshot.

## Changes

1. **Restructure `FilterBar`** ([VendorFlipView.tsx](../../../src/features/insights/VendorFlipView.tsx))
   into a stacked layout matching [QueryBuilder.tsx:43-55](../../../src/features/queries/QueryBuilder.tsx):
   - A full-width **"Categories (N | all)"** row at the top holding `CategorySelect`.
     It needs its own row because the control has a search dropdown plus selected
     pills and will not fit inline in the current `flex-wrap` row.
   - The existing numeric inputs (Min profit, Min markup, Min sales/day, Max
     listings), HQ-mode toggle, and the Vendors/Run-scan buttons remain below it.

2. **Wire `CategorySelect`** to `filter.searchCategories`:
   ```tsx
   <CategorySelect
     categories={ITEM_SEARCH_CATEGORIES.map((c) => ({ id: c.id, name: categoryLabel(c.id) }))}
     selected={value.searchCategories}
     onChange={(ids) => onChange({ ...value, searchCategories: ids })}
     placeholder="Search categories…"
   />
   ```
   New imports in VendorFlipView: `CategorySelect` from `../../components/CategorySelect`,
   and `ITEM_SEARCH_CATEGORIES` + `categoryLabel` from `../../lib/itemSearchCategories`.

## Behavior

- Category is a **scan parameter** (it changes which items prices are fetched for).
  Picking or clearing categories marks the scan stale via the existing
  `scanParamsChanged` check, so the existing *"Filters changed — Run scan to
  refresh"* prompt appears, identical to every other filter in this view. **No
  auto-rescan** on category change.
- The global **"hide crystals"** setting still applies on top, unchanged
  ([VendorFlipView.tsx:46](../../../src/features/insights/VendorFlipView.tsx)).
- Empty selection = all categories (current behavior).

## Testing

Extend [VendorFlipView.test.tsx](../../../src/features/insights/VendorFlipView.test.tsx):
- The category control renders in the FilterBar.
- Selecting a category marks the scan stale (the Run-scan / "Filters changed" prompt
  appears).

Runner-level category filtering is already covered by existing
`runVendorFlip` tests — not re-tested here.

## Out of scope (YAGNI)

- Grouping / sectioning the results table by category.
- Persisting category selection to URL or localStorage.
- Per-category profit summaries.
