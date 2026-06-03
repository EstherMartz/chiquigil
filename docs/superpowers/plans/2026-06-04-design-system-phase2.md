# Design-System Refinement — Phase 2 (Typography & Navigation) Implementation Plan

> **For agentic workers:** Execute task-by-task; each task ends in a commit. Mostly mechanical class swaps grounded in an exact file:line map.

**Goal:** Establish a clear interactive-color convention (gold = brand/decorative, aether/teal = interactive/active), move headline data numbers to a monospaced face, and stop form controls from falling back to the system font.

**Architecture:** Tailwind utility-class edits across enumerated components + two test updates + one base CSS rule. No structural/logic changes.

**Spec:** `docs/superpowers/specs/2026-06-03-design-system-refinement-design.md` (Phase 2).

**Deferred to user review (NOT in this plan, by controller decision while user is away):** wholesale retirement of Fraunces / making all body text monospace; page-title vs section-label heading reconciliation; sidebar logo resize; label font-size bumps. These are subjective/hard-to-undo and will be confirmed with the user.

---

## Task 1: Gold → aether for interactive/active states

**Rule:** Wherever `gold` indicates an INTERACTIVE/ACTIVE affordance (active nav item, active sort header, active tab/mode/scope/density toggle, active filter category, active preset, selection outline), switch it to `aether`. **Keep gold** for brand/decorative/value: the logo/wordmark, `SectionHeader` labels, KPI/profit value numbers, HQ markers, status alerts. Only change the ACTIVE branch of each ternary — leave inactive/hover states (`hover:text-aether` stays).

**Files + exact edits** (change only the active-state class):
- `src/components/layout/Sidebar.tsx` (~line 8): active nav `text-gold border-l-gold` → `text-aether border-l-aether` (keep `bg-bg-card-hi/60`).
- `src/components/layout/Header.tsx` (~line 7): active nav `text-gold` → `text-aether`.
- `src/features/watchlist/FilterBar.tsx` (~line 17): active `bg-bg-card-hi text-gold` → `bg-bg-card-hi text-aether`.
- `src/features/queries/ResultTableScaffold.tsx` (~line 104): active density `bg-bg-card-hi text-gold` → `bg-bg-card-hi text-aether`.
- `src/features/queries/QueryResults.tsx` (~line 137): `sorted ? 'text-gold'` → `'text-aether'`.
- `src/features/watchlist/WatchlistTable.tsx` (~line 216): `sorted ? 'text-gold'` → `'text-aether'`.
- `src/features/watchlist/ModeToggle.tsx` (~line 17): active `text-gold` → `text-aether`.
- `src/features/dashboard/tiles/GilLeaderboard.tsx` (~line 42): active tab `text-gold` → `text-aether`.
- `src/features/dashboard/tiles/WatchlistHeatmapTile.tsx` (~line 71): active scope `text-gold` → `text-aether`.
- `src/features/queries/QueriesView.tsx` (~line 190): active preset `border-gold text-gold` → `border-aether text-aether`.
- `src/features/heatmap/HeatmapChart.tsx` (~line 100): selection `outline-gold` → `outline-aether` (keep `brightness-125`).
- **Other results tables with the same active-sort pattern** — grep for `sorted ? 'text-gold'` and `text-gold'\s*:\s*` across `src/features/queries/*Results.tsx` and apply the same active→aether swap (e.g. VendorFlipResults, CurrencyFlipResults, MaterialFlipResults, EmptyShelfResults, WhatsNewResults, CraftFlipResults, RepostResults, QuestItemFlipResults). Use the Grep tool to find every active-sort `text-gold` and switch it.

- [ ] **Step 1: Find every interactive gold usage**

Use Grep across `src/` for `text-gold` and `border-gold` / `border-l-gold` / `outline-gold`. For each hit, decide interactive (active state, usually inside a `? :` keyed on `sorted`/`active`/`mode`/`tab`/`scope`/`isActive`/`catFilter`/`density`/`activePresetId`) vs decorative (logo, SectionHeader, value numbers, HQ marker, status). Switch ONLY interactive ones to aether.

- [ ] **Step 2: Apply the swaps** per the list above + any additional interactive hits found.

- [ ] **Step 3: Update tests that assert the old active color**

These tests assert an active sort header is `text-gold` — update the expectation to `text-aether`:
- `src/features/queries/CurrencyFlipResults.test.tsx` (~line 93): `expect(header.className).toMatch(/text-gold/)` → `/text-aether/`.
- `src/features/queries/VendorFlipResults.test.tsx` (~line 76): same change.
Grep the test suite for `text-gold` to catch any other active-state assertions and update them to `text-aether` (only where the assertion is about an ACTIVE/sorted state).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run` → all green (the 2+ updated tests now expect aether).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: reserve gold for brand, use aether (teal) for interactive/active states"
```

---

## Task 2: Headline data numbers → monospace

The big KPI values render in `font-display` (Cinzel, a serif), which has loose numeral spacing for data. Switch the KPI numeric values to `font-mono` (they already carry `tabular-nums`). Leave prose headlines (e.g. the Verdict card's text headline) in `font-display`.

**Files:**
- `src/features/dashboard/tiles/KpiStrip.tsx` (~line 52): the KPI value `<div className="font-display text-xl tabular-nums …">{s.v}</div>` → change `font-display` to `font-mono` (keep `text-xl tabular-nums leading-none …` and the tone color).

- [ ] **Step 1:** Make the swap. If you find other large DATA NUMBER renders using `font-display` that are pure numerals (not prose), switch those to `font-mono` too — but do NOT touch text headlines (Verdict headline, page titles).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run src/features/dashboard` → green (update any KpiStrip test that asserts `font-display` on the value to `font-mono`; if none, fine).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: render headline KPI numbers in monospace for tabular alignment"
```

---

## Task 3: Form controls inherit the app font

A few native controls fall back to the system sans-serif. Make `button`/`input`/`select`/`textarea` inherit the surrounding font so nothing renders in the OS default.

**Files:**
- `src/styles/index.css`

- [ ] **Step 1:** In `src/styles/index.css`, inside the existing `@layer base { … }` block (the one added in Phase 1 with the focus ring), add a rule:

```css
  button, input, select, textarea, optgroup {
    font-family: inherit;
  }
```

(Place it alongside the `:focus-visible` rule in the same `@layer base` block.)

- [ ] **Step 2: Verify**

Run: `npm run build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/styles/index.css
git commit -m "style: form controls inherit app font (no system-sans fallback)"
```

---

## Final verification
- `npx tsc --noEmit` → clean.
- `npx vitest run` → all green.
- `npm run build` → succeeds. (If `api/*.mjs` show as modified afterward with no real content change, discard them: `git checkout -- api/`.)
- Note for the user's visual review: confirm active nav/tabs/sort-headers now read teal (not gold), gold is now reserved for brand + values, and KPI numbers align.
