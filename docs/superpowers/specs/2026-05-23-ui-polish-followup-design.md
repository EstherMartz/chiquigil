# UI Polish Follow-up Fixes — Design Spec

**Date:** 2026-05-23
**Scope:** Six targeted follow-up fixes from second audit pass — empty states, sparse pages, minor UI cleanup.

---

## Fix 1: What Now — Hide Empty Opportunity Cards

Currently empty-pick cards render a muted placeholder with a diamond icon, creating an asymmetric grid (e.g., 3 cards top row, 1 bottom row + 1 muted placeholder). Instead, filter the cards to only render picks that have results.

**Change:** In `WhatNowView.tsx`, filter the cards array before rendering. Only render `<OpportunityCard>` for categories where `pick !== null`. This collapses the grid naturally — 4 results = 2×2, 3 results = 3×1, etc.

**File:** `src/features/whatnow/WhatNowView.tsx`

---

## Fix 2: Leves — Hide Table Headers Before First Run

The Leves planner shows column headers (Name, Job, Lvl, City, Gross, Mat Cost, Net Gil, EXP) even before a query runs, with a text message inside the table body. This looks like a broken/empty table.

**Change:** In `LevePlanner.tsx`, wrap the entire `<table>` in a conditional: only render it when `rows.length > 0`. When no data exists (pre-run state), render `<EmptyState icon="❖" message="Click Run Query to populate this plan." />` instead.

**File:** `src/features/leves/LevePlanner.tsx`

---

## Fix 3: Settings — Add Page Heading

Every other page has a heading (`<h2 className="font-display text-lg text-gold tracking-wide">`). Settings skips straight to section headers.

**Change:** Add `<h2 className="font-display text-lg text-gold tracking-wide">Settings</h2>` as the first child of the outer container div.

**File:** `src/routes/Settings.tsx`

---

## Fix 4: GC Supply — Ensure Search Placeholder Reads as Placeholder

The "Maple, Linseed…" text is technically a `placeholder` attribute, but it may not be visually distinct enough from filled input text. The input uses `font-mono text-sm` with `text-text-cream` inherited for the filled state — the placeholder may render similarly.

**Change:** Add `placeholder:text-text-low` to the input's className so the placeholder is visually muted compared to actual typed text.

**File:** `src/features/insights/QuestItemFlipView.tsx`

---

## Fix 5: Pre-Scan EmptyState for Sparse Pages

Four pages show just a run button and blank space before a scan runs: GC Seals, Vendor Flip, Currencies, and Heatmap. Add an `<EmptyState>` below the controls when no scan has run and no scan is pending.

**Messages:**

| Page | Icon | Message |
|------|------|---------|
| GC Seals | ❖ | "Find equippable gear to buy cheaply and trade in for Grand Company seals." |
| Vendor Flip | ❖ | "Scan for NPC vendor items you can flip on the marketboard for profit." |
| Currencies | ❖ | "Find the best gil return for your earned currency (scrips, poetics, etc.)." |
| Heatmap | ❖ | "Visualize market activity — size shows velocity, color shows margin." |

**Condition:** Show when `!run.data && !run.isPending` (no results yet and not currently scanning).

**Files:**
- `src/routes/GcSeals.tsx`
- `src/features/insights/VendorFlipView.tsx`
- `src/features/insights/CurrencyFlipView.tsx`
- `src/features/heatmap/HeatmapView.tsx`

---

## Fix 6: Shopping List — Hide Clear List When Empty

The "Clear list" button is visible but dimmed when the list has 0 items. Hide it entirely.

**Change:** Replace `disabled={items.length === 0}` with a conditional render: `{items.length > 0 && <button ...>Clear list</button>}`.

**File:** `src/features/shoppingList/ShoppingListPanel.tsx`
