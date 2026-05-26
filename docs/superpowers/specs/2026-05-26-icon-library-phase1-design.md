# Icon Library — Phase 1

## Overview

Introduce in-game icon imagery to the existing UI by bundling a curated subset of FFXIV icons under `public/icons/` and exposing them through a small set of typed React components. Phase 1 targets four categories: **class/job**, **currency**, **HQ marker**, and **quest-type**. Icons decorate existing text labels — they do not replace them — so search, copy, sort, and a11y behaviour all keep working.

Source of truth: a locally-saved copy of [gamerescape's Dictionary of Icons](https://ffxiv.gamerescape.com/wiki/Dictionary_of_Icons) (the public site 403s automated fetches). The local copy lives at the project root and is gitignored; filenames follow SE's 6-digit icon-ID scheme (e.g. `062001_hr1.png`), which matches XIVAPI's scheme.

## Goals

- Replace 3-letter abbreviations and naked currency names with visual reinforcement (icon + text).
- Build the shared primitive once so future categories (item types, status effects, etc.) are a thin wrapper away.
- Zero new runtime dependencies, no CORS / network risk — everything served from `public/`.

## Non-goals (V1)

- Replacing text labels entirely with icon-only renders.
- Item-type / item-search-category icons. The gamerescape page doesn't cover those cleanly; they live in XIVAPI sheets and need their own mapping pass. Punt to V2.
- Pet / role / FATE / mob / map / element / playstyle / community / experience / gear-color / journal / macro / number icons — not relevant to the gil-making surface today.
- Animated GIFs, hover effects, theme-aware tinting, custom recolouring.

## Architecture

### One primitive + four wrappers

```
src/lib/icons/
  GameIcon.tsx        // base <img> primitive
  JobIcon.tsx         // wrapper: <JobIcon job="CRP" />
  CurrencyIcon.tsx    // wrapper: <CurrencyIcon currencyItemId={28} />
  QuestTypeIcon.tsx   // wrapper: <QuestTypeIcon type="msq" />
  HqMark.tsx          // wrapper: <HqMark /> — special-cased, replaces the ⌑ glyph
  jobIcons.ts         // const map: { CRP: { file, alt }, BSM: { file, alt }, ... }
  currencyIcons.ts    // const map: keyed by currency item ID
  questIcons.ts       // const map: keyed by quest-type id
  index.ts            // re-exports
```

### Component API

```tsx
// Base primitive — accepts any path under /icons/
<GameIcon src="/icons/jobs/CRP.png" alt="Carpenter" size={16} />

// Wrappers — look up file + alt from the maps, hide the path detail
<JobIcon job="CRP" size={16} />
<CurrencyIcon currencyItemId={28} size={14} />
<HqMark />
<QuestTypeIcon type="msq" size={16} />
```

- `size` defaults to 16. Numeric only; rendered as `width={size} height={size}` plus a matching CSS `width/height` so layout doesn't jitter before image load.
- `className` is passed through for one-off adjustments.
- All wrappers degrade gracefully: unknown key → render `null` (not a broken-image glyph). A console warning is emitted in dev mode only.
- Alignment baked into `GameIcon`: `display: inline-block; vertical-align: -2px;` via Tailwind utilities. This sits the icon visually on the text baseline for inline use.

### Usage style — decorate, don't replace

Icons render **alongside** existing text labels, not in place of them:

```tsx
// Before
<span>CRP</span>

// After
<span><JobIcon job="CRP" /> CRP</span>
```

Reasons:
- Text stays grep-able, copy-pasteable, and screen-reader friendly without extra `aria-label`s.
- Existing sort keys, URL params, and snapshot tests keep working.
- Matches Garland Tools / Teamcraft convention.

The base `<GameIcon>` always renders an `alt`, but wrappers used in decoration mode pass `alt=""` (presentational) so the screen reader doesn't double-read the label that's already next to it. We expose `decorative?: boolean` defaulting to `true` on wrappers, and `false` when the icon is used standalone (e.g. inside an icon-only button).

## Asset pipeline

### Folder layout

```
public/icons/
  jobs/CRP.png  BSM.png  ARM.png  GSM.png  LTW.png  WVR.png  ALC.png  CUL.png
       BTN.png  MIN.png  FSH.png
  currency/<itemId>.png    // e.g. 28.png for Poetics
  quests/msq.png  side.png  feature.png  beast-tribe.png  ...
  hq/marker.png
```

Friendly filenames (`CRP.png`, not `062001.png`) — easier to grep in the codebase than 6-digit IDs. The original IDs are preserved as comments in the `.ts` maps so we can re-derive if needed.

### Extraction script

`scripts/extract-icon-mapping.ts` (one-off helper, committed but not part of the build):

- Reads the local gitignored HTML file.
- Locates each relevant section heading (`Disciple of Land/Hand Class Icons`, `Currency`, `Quest Types`, `Item Icons` → HQ marker).
- Walks the section's `<table>` rows, extracts `(label, imgFilename)` pairs.
- Prints a TypeScript object literal to stdout for me to copy into `jobIcons.ts` / `currencyIcons.ts` / etc.
- Also prints a `cp` shell snippet to copy the matching PNGs from the `_files/` folder into `public/icons/<category>/` with the friendly filename.

The script is run once per category; the outputs (the `.ts` maps + the copied PNGs) are what we commit. The script itself stays in `scripts/` for future re-runs if a new category gets added or the catalog updates.

### Manual fallback

If extraction misses something (e.g. the gamerescape label doesn't match XIVAPI's item name for a currency), we hand-edit the `.ts` map. Each map entry is human-reviewable: `{ file: 'Poetics.png', alt: 'Allagan Tomestone of Poetics', xivapiId: 28 }`.

## V1 call sites

### Job icons (~6 components)

- `RecipeModal` — job badge header
- `LevePlan` table — `Class` column
- `GatheringPlan` — BTN / MIN / FSH labels
- Watchlist `craftedBy` cell — `buildRows.ts` rendering output
- `QuestItemFlipResults` Category column when category resolves to a job
- `/craft-from-inventory` table — recipe job column (this page already has a placeholder for it per the recent spec)

### Currency icons (~4 components)

- `/currency-flip` currency picker dropdown — replace text-only options
- `CurrencySourceCard` on `/item/:id` — prefix each row's currency `shortLabel`
- `ShoppingListPlan` `SourceCell` — prefix the `└─ <cost> <shortLabel> avail.` info-line
- `/gc-seals` page header — show the active GC's seal icon

### HQ marker (~5–8 components)

A single `<HqMark />` component replaces the inline `⌑` text glyph in:

- `CrossWorldListingsBlock` — HQ column
- `PricesBlock` — NQ/HQ row prefix
- `VendorSourceCard` — when vendor sells HQ
- `MaterialFlipResults` — HQ tier indicator
- `CraftableView` / `craft-from-inventory` results — HQ output marker
- `RecipeModal` — HQ-only ingredient marker

We grep for `'⌑'` and `'HQ'` literal strings and audit each match before swapping.

### Quest icons (~1 component)

- `/quest-items` Category column — when the category resolves to a known quest type (MSQ, side, feature, beast tribe, etc.), prefix with the appropriate icon. Quest types not on the dictionary page (or our map) fall back to text-only.

## Mapping data

Concrete keys we'll need to populate:

### Jobs (11)

`CRP BSM ARM GSM LTW WVR ALC CUL BTN MIN FSH`

### Currencies (17, keyed by FFXIV item ID)

The 13 currencies already declared in `src/lib/currencies.ts`:

- Tomestones (4): Poetics (28), Mathematics (48), Heliometry (47), Mnemonics (49)
- Crafter Scrips (3): White (25199), Purple (33913), Orange (41784)
- Gatherer Scrips (3): White (25200), Purple (33914), Orange (41785)
- Misc (3): MGP (29), Wolf Marks (25), Bicolor Gemstone (26807)

Plus three GC seals (sourced from `src/lib/gcSealsYield.ts`, not currencies.ts): Maelstrom, Order of the Twin Adder, Immortal Flames.

Plus **gil** as a sentinel-keyed special case (we'll use `'gil'` rather than an item ID, since `currencyByItemId` doesn't model it).

### Quest types (~6)

MSQ, side, feature, beast tribe, repeatable, leve. (We currently only have raw category labels from XIVAPI's `JournalCategory.Name`; mapping that → quest-type-icon is a small lookup table.)

### HQ marker (1)

The in-game HQ glyph image, replacing the text `⌑`.

## Testing

- One render test per wrapper component (`JobIcon.test.tsx`, `CurrencyIcon.test.tsx`, `QuestTypeIcon.test.tsx`, `HqMark.test.tsx`) — verifies correct `src`, `alt`, and `size` for a representative input + correct `null` render for unknown keys.
- One smoke test on `extract-icon-mapping.ts` against a small inlined fixture HTML — verifies the parser doesn't silently regress when gamerescape's markup shifts.
- Updates to existing tests that snapshot affected components (e.g. `CurrencySourceCard.test.tsx`, `CrossWorldListingsBlock.test.tsx`) — re-record snapshots once visual changes land.
- No visual-regression / screenshot tests (no infra for that today).

## Risks & open questions

1. **HR1 vs base PNG.** The local files are all `_hr1.png` (64×64 high-DPI). Rendering at 16–24px is a 3–4× downsample. Crisp on retina, fine on standard displays — no fallback needed.
2. **HQ baseline alignment.** Swapping an inline text `⌑` for an `<img>` may shift baselines by 1–2px in tight cells. Manual eyeball pass on `/item/:id` and `CrossWorldListingsBlock` before merging.
3. **Currency label mismatch.** Gamerescape labels may not match XIVAPI item names exactly for niche currencies (Mnemonics, Heliometry, the Orange scrips added in 7.1). Map entries include explicit `xivapiId` so we can cross-check during extraction; failures fall back to text-only rendering at that call site.
4. **Bundle size.** 11 jobs + 17 currencies + ~6 quest types + 1 HQ marker ≈ 35 PNGs × ~10KB each ≈ 350 KB added to the Vercel deploy. Acceptable, well under our existing data-snapshot budgets. Lazy-loading not warranted at this size.
5. **Dark/light theme.** The app is dark-mode-only today, and SE's icons are designed for the in-game dark UI. No theme work needed.

## Out-of-scope follow-ups (V2+ candidates)

- Item-type / item-search-category icons (XIVAPI-sourced).
- Status-effect / buff icons (would let us decorate `priceTrust` or seasonal banners).
- Role icons (Tank / Healer / DPS) for any combat-content view we might add.
- Icon-only condensed mode for very dense tables.
- A `useIconWithTooltip` hook for hover-to-reveal larger preview.
