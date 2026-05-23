# UI Polish Batch — Design Spec

**Date:** 2026-05-23
**Scope:** Sidebar navigation, determinate progress bars, rich empty states, searchable category multi-select, and a bundle of small UX fixes sourced from a UI audit.

---

## 1. Sidebar Navigation

Replace the two-row horizontal navbar with a persistent vertical sidebar.

### Layout

The app shell becomes a two-column layout:
- **Sidebar:** Fixed-width (220px), full viewport height, `bg-bg-card border-r border-border-base`. Scrollable if content overflows.
- **Content area:** Fills remaining width, scrollable independently.
- **Mobile (<768px):** Sidebar collapses. A hamburger button in a slim top bar toggles an overlay sidebar with a backdrop.

### Nav Groups

Section headers use `font-mono text-[10px] tracking-widest uppercase text-text-low`. Nav items use existing `text-text-dim hover:text-aether` with `text-gold` for the active route.

| Group | Items |
|-------|-------|
| **Dashboard** | What Now? |
| **Gil-Making** | Crafts, Trading, Gathering, Vendor Flip, Currencies |
| **Planning** | Watchlist, Batch, Shopping, Leves |
| **Grand Company** | GC Seals, GC Supply |
| **Tools** | Cleanup, Heatmap, History, Settings |

### Displaced Elements

GlobalItemSearch and AetheryteChip currently live in the header. They move to a slim bar at the top of the content area, above page headers. On mobile, AetheryteChip moves into the sidebar overlay header.

### Files Changed

- `src/components/layout/Header.tsx` — gut the NavLink rows, replace with a Sidebar component.
- New `src/components/layout/Sidebar.tsx` — sidebar shell, nav groups, mobile toggle.
- `src/App.tsx` — update layout wrapper from single-column to sidebar + content.
- Possibly `src/components/layout/ContentBar.tsx` — slim bar for GlobalItemSearch + AetheryteChip above page content.

---

## 2. Determinate Progress Bar

New shared component for long-running scans where item counts are known.

### Component API

```tsx
<ProgressBar current={1234} total={49830} label="Fetching prices…" />
```

**Props:**
- `current: number` — items processed so far.
- `total: number` — total items to process.
- `label?: string` — optional text shown below the bar.

### Visual Design

- **Track:** `bg-bg-card-hi`, 4px tall, full width, rounded.
- **Fill:** `bg-aether`, width = `(current / total) * 100%`, with a subtle pulse animation on the leading edge via a CSS pseudo-element.
- **Label:** Below the bar, `font-mono text-[10px] text-text-low`. Format: `"{current.toLocaleString()} / {total.toLocaleString()} items"`.
- When `current === total`, fill snaps to 100% and pulse stops.

### Integration Points

Replace `<Spinner>` with `<ProgressBar>` in these views when item-count totals are available:
- **WhatNowView** — total = candidate IDs length during Universalis fetch.
- **QueriesView** — total = filtered item IDs count during price fetch.
- **VendorFlipView** — total = candidateIds.length.
- **CurrencyFlipView** — total = candidateIds.length.
- **MaterialFlipView** — total = batch count (already has done/total).
- **GcSeals** — total = gear IDs count.

Keep `<Spinner>` for indeterminate waits: catalog loading, recipe resolution, snapshot hydration.

### Callback Pattern

Scan functions need an `onProgress` callback to report `{ current, total }`. Most already use `fetchInBatches` which can be augmented with a progress callback after each chunk completes.

### File

New `src/components/ProgressBar.tsx`.

---

## 3. Rich Empty States

New shared component replacing plain italic text empty states with icon + message + optional CTA.

### Component API

```tsx
<EmptyState
  icon="◇"
  message="No opportunities found at these thresholds."
  action={{ label: "Lower Threshold", onClick: () => ... }}
/>
```

**Props:**
- `icon: string` — a Unicode character displayed large and muted.
- `message: string` — explanation text.
- `action?: { label: string; onClick: () => void }` — optional CTA button.

### Visual Design

- Centered vertically and horizontally within the result area.
- **Icon:** `text-2xl text-text-low mb-2`, displayed as a block element.
- **Message:** `text-sm text-text-low`, max-width prose.
- **Button (if present):** Standard gold button styling (`border border-gold text-gold hover:bg-gold hover:text-bg-deep font-mono text-[10px] tracking-widest uppercase px-4 py-2 mt-3`).

### Icon Mapping

| Context | Icon | Message | CTA |
|---------|------|---------|-----|
| Pre-scan (no data yet) | ❖ | "Run a scan to find opportunities." | "Run Scan" (triggers scan) |
| No results after scan | ◇ | "No opportunities found at these thresholds." | none |
| No arbitrage | ⇄ | "No cross-world price gaps above threshold. Try lowering it or check back later." | none |
| Empty shopping list | ☐ | "No items yet. Add items from the watchlist, an item page, or the search box above." | none |
| Empty watchlist | ☐ | "No items watched yet. Use the search bar to find and add items." | none |
| Empty batch history | ☐ | "No saved batches yet. Generate a batch and click Save & Track." | none |
| No GC supply | ◇ | "No profitable GC supply turn-ins right now — try expanding your scope." | none |
| What Now card (no opportunities for a category) | — | Muted card with "No opportunities" in place of data. Grey border instead of normal border. | none |

### Files Changed

- New `src/components/EmptyState.tsx`.
- All views that currently render inline italic empty messages get updated to use `<EmptyState>`.

---

## 4. Searchable Category Multi-Select

Replace scrollable tag-cloud category boxes with a searchable dropdown with pills.

### Component API

```tsx
<CategorySelect
  categories={allCategories}    // { id: number; name: string }[]
  selected={selectedIds}        // number[]
  onChange={(ids: number[]) => ...}
  placeholder="Search categories…"
/>
```

### Visual Design

- **Input:** Matches existing filter inputs — `bg-bg-card border border-border-base text-text-cream font-mono text-xs p-2`. Placeholder in `text-text-low`.
- **Dropdown:** Positioned below input, `bg-bg-card-hi border border-border-hi`, max-height 240px with overflow scroll. Each row is a checkbox + category name. Rows highlight on hover (`bg-bg-card`). Visible only when input is focused and has matches (or all categories if input is empty).
- **Pills:** Below the input. Each pill: `inline-flex items-center bg-bg-card-hi border border-border-base text-text-dim font-mono text-[10px] px-2 py-0.5 rounded` with an `×` dismiss button (`hover:text-crimson`).
- **Clear all:** A small link (`text-text-low hover:text-aether text-[10px]`) shown when any categories are selected.

### Behavior

- Typing filters the category list (case-insensitive substring match).
- Clicking a checkbox toggles that category. Selected categories appear as pills.
- Clicking `×` on a pill deselects that category.
- Clicking outside the dropdown closes it.
- The dropdown shows all categories when input is empty and focused.

### Integration

Replaces the scrollable tag-cloud in:
- **QueriesView** — used by Crafts, Trading/Queries, and Gathering pages for `searchCategories` filter.
- Any other view that currently renders a scrollable category checkbox list.

### File

New `src/components/CategorySelect.tsx`.

---

## 5. Small Fixes Bundle

### 5a. Preset Button Tooltips

**Already implemented.** QueriesView already wraps each preset in `<InfoTooltip label={p.desc}>`, and each preset in `presets.ts` has a `desc` field with a full description. No changes needed.

### 5b. Cleanup Page Helper Text

- Rename the section label from "PASTE YOUR ALLAGAN TOOLS / INVENTORY TOOLS CSV" to "Inventory Analyzer".
- Add subtitle: "Paste your inventory CSV to find items worth selling."
- Add a small `<InfoTooltip>` or expandable helper explaining: "Export your inventory from the Allagan Tools or Inventory Tools FFXIV plugin as CSV, then paste it here."

### 5c. Label Casing

Change ALL CAPS form labels to sentence case across all filter bars:
- `"MIN DISCOUNT %"` → `"Min discount %"`
- `"MIN VELOCITY / DAY"` → `"Min velocity / day"`
- `"MIN PROFIT"` → `"Min profit"`
- `"MIN MARKUP"` → `"Min markup"`
- `"MAX LISTINGS"` → `"Max listings"`
- `"MIN SALES/DAY"` → `"Min sales / day"`
- And any other ALL CAPS filter labels.

### 5d. GC Supply Placeholder

Ensure the item search placeholder text ("Maple, Linseed…") is styled as proper HTML placeholder (`placeholder` attribute on the input, not rendered as text content).

### 5e. What Now Card Grid — No-Opportunity Cards

When a WhatNow category returns no opportunities, render a muted card instead of leaving a grid gap:
- Same card dimensions as result cards.
- `border border-border-base/50 bg-bg-card/50` (half opacity border and bg).
- Category title in `text-text-low`.
- Message: "No opportunities right now" in `text-text-low text-xs italic`.

### 5f. Gil Value Tooltips

Add `title` attributes to abbreviated gil displays so hovering shows the full value. In the `Gil` or `fmtGil` formatter, when a value is abbreviated (e.g., "1.3k", "1000k"), set `title` to the full comma-formatted number (e.g., "1,300", "1,000,000").

### 5g. Settings — Crafter Level Feedback

When a crafter level input value changes, briefly flash the input border gold (`border-gold`) with a 500ms transition back to default. CSS transition on border-color is sufficient.

### 5h. Settings — Backup Prominence

- Move the Backup & Restore section above Data Caches.
- Add a brief warning line above the Import button: "Importing will overwrite all current settings, watchlist, and saved data."

---

## Out of Scope

- **Mobile-first responsive redesign** — the sidebar handles mobile collapse, but a full responsive pass across all page content is deferred.
- **Typography size adjustments** — the audit suggested bumping muted labels from ~11px to ~13px. Deferring to avoid cascading layout changes.
- **Leves radio → pill buttons** — minor, deferring.
- **Shopping List sparse layout** — the page is functional as-is; empty state improvement covers the main issue.
