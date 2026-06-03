# Design-System Refinement — Phase 3 (Data-viz & Forms) Implementation Plan

> **For agentic workers:** Execute task-by-task; each ends in a commit. Small, low-risk Tailwind edits to enumerated components.

**Goal:** The safe, clearly-beneficial data-viz/affordance polish from the critique: scannable spread bars, more legible sparklines, and real affordance for dismiss buttons + text-only toggles.

**Architecture:** Tailwind class edits in a handful of components. No logic/structural changes.

**Spec:** `docs/superpowers/specs/2026-06-03-design-system-refinement-design.md` (Phase 3).

**Already done in the codebase (verified via component map — do NOT redo):**
- MarginHistogram already shows a single-band confirmation message when items concentrate in one band.
- HeatmapChart already encodes category=hue + margin-tier=brightness.
- `tabular-nums` is already applied across data tables.

**Deferred to user review (NOT in this plan — need visual iteration, controller decision while user away):**
- Custom `<select>` arrow / heavier form-control restyle (native arrow works; restyle risks misalignment unverified).
- Watchlist heatmap "monochrome when all one category" — inherent to hue=category encoding; needs a design call.

---

## Task 1: Spread bars — encode magnitude by intensity

`SpreadBars` fills every bar the same `bg-aether`, so an 88% spread and a 50% spread look
identical until you read the number. Encode magnitude with teal INTENSITY (stays on-brand,
avoids reintroducing gold which is now brand-only): faint teal for low, full teal for high.

**Files:**
- `src/features/dashboard/tiles/SpreadBars.tsx`

- [ ] **Step 1:** Find the bar fill `<div className="h-full bg-aether" style={{ width: … }} />`. The component already computes a ratio against the max spread for the width (`(s.spread / max) * 100`). Reuse that ratio to pick an intensity class:
  - ratio ≥ 0.66 → `bg-aether`
  - 0.33 ≤ ratio < 0.66 → `bg-aether/70`
  - ratio < 0.33 → `bg-aether/45`

Compute the class per row (a small helper or inline ternary) and apply it to the fill div in place of the static `bg-aether`. Keep the existing width logic and the `Math.max(6, …)` minimum.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run src/features/dashboard` → green (update a SpreadBars test only if one asserts the exact `bg-aether` class; otherwise leave tests).

- [ ] **Step 3: Commit**

```bash
git add src/features/dashboard/tiles/SpreadBars.tsx
git commit -m "style: encode cross-world spread magnitude by bar intensity"
```

---

## Task 2: More legible sparklines

The shared `Sparkline` defaults are small/thin against the dark cards.

**Files:**
- `src/components/Sparkline.tsx`

- [ ] **Step 1:** In `src/components/Sparkline.tsx`, raise the default `height` prop from `28` to `32`, and the `strokeWidth` from `1.5` to `1.75`. Do NOT change the `width` default or the color logic. Only change the two numeric defaults (and the SVG `height`/viewBox if it's derived from the prop — keep it consistent).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run src/components/Sparkline.test.tsx` → green (the tests assert polyline structure + color, not exact height; if any asserts height `28`, update to `32`).

- [ ] **Step 3: Commit**

```bash
git add src/components/Sparkline.tsx
git commit -m "style: larger, slightly bolder sparklines for legibility"
```

---

## Task 3: Real affordance for dismiss buttons + text-only toggles

**Part A — dismiss buttons (plain `✕` text → small bordered chip):**
Give these a subtle pill so they read as controls. Use:
`font-mono text-[9px] tracking-widest uppercase text-text-low hover:text-crimson border border-border-base hover:border-crimson/40 rounded-sm px-1.5 py-0.5 transition-colors`
(adapt the existing text-size class already present; keep the existing onClick/title/aria).
- `src/features/dashboard/tiles/KpiStrip.tsx` — the "got it ✕" button.
- `src/features/watchlist/SuggestionRow.tsx` — the `✕` dismiss button.
- `src/features/craftBatch/CraftBatchView.tsx` — the `✕` dismiss button (same treatment).

**Part B — text-only active toggles get a surface (match the density/filter toggles which already use `bg-bg-card-hi` on active):**
For these, add `bg-bg-card-hi` to the ACTIVE branch (keep the `text-aether` set in Phase 2):
- `src/features/watchlist/ModeToggle.tsx` — active: `text-aether` → `bg-bg-card-hi text-aether`.
- `src/features/dashboard/tiles/GilLeaderboard.tsx` — active tab: `text-aether` → `bg-bg-card-hi text-aether`.
- `src/features/dashboard/tiles/WatchlistHeatmapTile.tsx` — BOTH toggles' active branch (`text-aether`) → `bg-bg-card-hi text-aether`.

- [ ] **Step 1:** Apply Part A to the three dismiss buttons. Use Grep to locate each (`got it`, `Dismiss`, `✕`). Keep all behavior; only change className.

- [ ] **Step 2:** Apply Part B to the three toggle components' active branch.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green (update any test asserting a toggle's exact active class, only if it breaks).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "style: give dismiss buttons + active toggles clearer affordance"
```

---

## Final verification
- `npx tsc --noEmit` → clean.
- `npx vitest run` → all green.
- `npm run build` → succeeds. (Discard any `api/*.mjs` line-ending noise: `git checkout -- api/`.)
- Note for user review: spread bars now vary in teal intensity by magnitude; sparklines a touch larger; dismiss buttons + active toggles have visible chrome.
