# What's New — Item-Type Filter + Infinite Scroll

**Date:** 2026-06-02
**Status:** Design approved (user chose infinite-scroll = all insight tables)

## Goal

Two enhancements:
1. **Item-type filter** on the What's New page — quickly narrow the table to one
   or more item categories.
2. **Infinite scroll** — auto-load the next page as the user scrolls, replacing
   the click-to-load button. Applied to **all** insight tables (shared
   scaffold), per user decision.

## Feature 1 — Item-type filter (What's New only)

Reuse the existing multi-select `CategorySelect` (the same component QueryBuilder
uses) and `categoryLabel()` from `lib/itemSearchCategories`. The What's New rows
already carry `sc` (ItemSearchCategory).

- **Types:** add `categories: number[]` to `WhatsNewFilter` (default `[]`).
- **runWhatsNew:** after the existing per-row filters, when
  `filter.categories.length > 0`, keep only rows whose `sc` is in that set.
  Add a unit test (filter to one category; empty = all).
- **WhatsNewView:**
  - Derive the **present categories** for the active tab: the distinct `sc`
    values (`sc > 0`) among the resolved items, mapped to `{ id, name }` via
    `categoryLabel(sc)`, sorted by name. This keeps the dropdown to a short,
    relevant list (e.g. the patch's furnishings / materia / orchestrion).
  - Render `CategorySelect` in the TabBar, bound to `filter.categories`.
  - **Reset `categories` to `[]` when the tab changes** (categories differ
    between items/recipes tabs).
  - Pass `filter.categories` through to `runWhatsNew`.
- Items with `sc === 0` (currencies, not-yet-categorized new minions/rolls) have
  no category; they appear under "all" and drop out when any category is picked.
  This is expected, not a bug.

## Feature 2 — Infinite scroll (all insight tables)

Auto-load on scroll, baked into the shared load-more primitive so every
`ResultTableScaffold` consumer benefits.

- **`LoadMoreFooter`:** add an `IntersectionObserver` on a sentinel element. When
  the sentinel scrolls into view and `hasMore`, call `onLoadMore()`. Keep the
  "Showing X of Y" line and the end-of-list message.
  - The visible "Load more" button is **replaced** by the auto-trigger when
    `IntersectionObserver` is available; a subtle "Loading more…" affordance
    shows while more remain.
  - **Fallback:** if `IntersectionObserver` is unavailable (older/headless
    environments), render the existing manual button so paging still works.
  - Guard against repeated fires: the observer triggers `onLoadMore` once per
    intersection; `useLoadMore.loadMore` is idempotent at the list end
    (clamps to `rows.length`).
- No change to `useLoadMore` (paging state) or to per-page size (25).
- Applies everywhere `ResultTableScaffold`/`LoadMoreFooter` is used (Empty Shelf,
  Trading, Vendor Flip, Currencies, Repost, CraftFlip, What's New, etc.).

## Testing

- **runWhatsNew:** category-filter unit test (one category selected → only those
  rows; empty → unchanged).
- **LoadMoreFooter:** a test that stubs `IntersectionObserver`, triggers the
  observed callback with `isIntersecting: true`, and asserts `onLoadMore` is
  called when `hasMore` (and not when `!hasMore`); plus the fallback-button path
  when `IntersectionObserver` is absent.
- Full suite must stay green (the shared footer change touches many pages).

## Files

**Modify**
- `src/features/queries/types.ts` — `categories` on `WhatsNewFilter` + default.
- `src/features/queries/runWhatsNew.ts` — category filter.
- `src/features/queries/runWhatsNew.test.ts` — category-filter test.
- `src/features/insights/WhatsNewView.tsx` — present-categories derivation +
  `CategorySelect` in TabBar + reset-on-tab-change + pass-through.
- `src/components/LoadMoreFooter.tsx` — IntersectionObserver auto-load + fallback.
- `src/components/LoadMoreFooter.test.tsx` — new (observer + fallback tests).

**No change**
- `src/lib/useLoadMore.ts`, `src/features/queries/ResultTableScaffold.tsx`
  (footer is swapped behavior-wise but its props are unchanged), `CategorySelect`.

## Out of scope (YAGNI)

- No "jump to category" anchored sections (the filter covers navigation).
- No virtualization (page size 25 + infinite scroll is sufficient).
- No persistence of selected categories across visits.
