# Trading presets bundle — design

Date: 2026-05-15

## Problem

The preset list in `src/features/queries/presets.ts` covers crafting, gathering, and a few trading angles (mega-value HQ, fast-sellers HQ, food, furnishings discount, minions quick-sell). It does not cover three trading angles the user wants surfaced as one-click queries:

- **Treasure maps** — current-tier timeworn maps churn fast and are a steady gil source.
- **Glamour gear** — old/rare armor & accessories that flip well on the market board.
- **Glamour housing** — old/rare furnishings & fixtures that flip well on the market board.

Today the user has to hand-build filters every time. That's friction.

## Goal

Add three new entries to `PRESETS` in `src/features/queries/presets.ts`, all `category: 'trading'`, all surfaced in the existing preset picker. No new UI, no new filter capabilities, no new categories — just data.

## Non-goals

- Materia preset. Materia trades via a family-pivot view (Phase 1b, separate brainstorm). Not in this bundle.
- Evolved-map expansion analysis. The preset surfaces timeworn maps; what to do with the contents is out of scope.
- Seasonal / minions reshuffle. Those have their own presets already.
- New filter mechanisms (item-id allowlists, name-pattern search). Anything not expressible with the current `QueryFilter` shape is deferred.

## What changes

Single production file: `src/features/queries/presets.ts`. Three new entries appended to `PRESETS`:

```ts
{
  id: 'treasure-maps',
  label: 'Treasure maps',
  category: 'trading',
  desc: 'Current-tier timeworn maps ranked by gil/day.',
  // Category 64 (Other) is the bucket FFXIV files timeworn maps under.
  // The rest of category 64 is filtered out implicitly by gilFlow sort + minVelocity.
  filter: {
    searchCategories: [64], hq: 'either', minDealPct: 0, minVelocity: 0.5,
    minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
    scope: 'dc', maxListings: null, mode: 'standard', minGap: null,
  },
},
{
  id: 'glamour-gear',
  label: 'Glamour gear',
  category: 'trading',
  desc: 'Old/rare armor & accessories likely to flip well.',
  // Categories 31–42: Head, Undershirts, Body, Undergarments, Legs, Hands, Feet,
  // Waist, Necklaces, Earrings, Bracelets, Rings — see itemSearchCategories.ts.
  filter: {
    searchCategories: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
    hq: 'either', minDealPct: 0, minVelocity: 0.5,
    minPrice: 20_000, maxPrice: null, sort: 'gilFlow', limit: 100,
    scope: 'dc', maxListings: null, mode: 'standard', minGap: null,
  },
},
{
  id: 'glamour-housing',
  label: 'Glamour housing',
  category: 'trading',
  desc: 'Old/rare housing items & fixtures likely to flip well.',
  // Categories 56, 65, 66, 67: Furnishings, Exterior Fixtures, Interior Fixtures,
  // Outdoor Furnishings — the four housing categories where glams typically live.
  // Other housing sub-categories (68–72 chairs/tables/etc., 82 paintings) are intentionally
  // omitted — they're niche and already covered by the broader 'furnishings' (Housing-group)
  // preset.
  filter: {
    searchCategories: [56, 65, 66, 67],
    hq: 'either', minDealPct: 0, minVelocity: 0.5,
    minPrice: 20_000, maxPrice: null, sort: 'gilFlow', limit: 100,
    scope: 'dc', maxListings: null, mode: 'standard', minGap: null,
  },
},
```

## Defaults rationale

- **`sort: 'gilFlow'`** — what the user actually cares about (gil/day). Confirmed in the brainstorm.
- **`minVelocity: 0.5`** — filters out items that haven't sold in two days, but doesn't kill slow-moving glamour pieces that still flip a few times a week.
- **`minPrice: 20_000`** on glamour presets — raises the floor above white-trash drops & low-value crafting waste, since glam value comes from rare/old pieces.
- **No `minPrice` on treasure-maps** — gilFlow sort + 0.5 velocity should naturally surface maps to the top of category 64. If practice says otherwise, see the caveat below.
- **`hq: 'either'`** — none of the three lines have HQ variants you'd care about; let the user see whatever's on the board.
- **`scope: 'dc'`** — these are flip targets, you'd often cross-world buy. Matches the other DC-scoped trading presets.
- **`mode: 'standard'`** — none of these need craftable filtering.

## Treasure-map category caveat

Category 64 ("Other") is the bucket maps live in, but it also holds a long tail of miscellaneous items (event currencies, key items, etc.). `minVelocity: 0.5` + `sort: 'gilFlow'` should push timeworn maps to the top in practice. If implementation testing on live data shows the preset is too noisy to be useful, the right move is to **not ship `treasure-maps`** and brainstorm a name-pattern or id-allowlist filter mechanism separately — do NOT extend `QueryFilter` inside this PR.

## Testing

Single test file: `src/features/queries/presets.test.ts`. The existing structural assertions cover most of what matters; we add three small per-preset checks and update the trading category roster:

**Update existing test** — `'categorizes trading presets correctly'`. The current array lists 7 trading ids; after this change it must list 10, in alphabetical order:

```ts
expect(tradingIds).toEqual([
  'fast-sellers-hq',
  'food-potions',
  'furnishings',
  'glamour-gear',
  'glamour-housing',
  'high-value-materials',
  'mega-value-hq',
  'minions-quick-sell',
  'reposts',
  'treasure-maps',
]);
```

**Add three new tests** — one per preset, asserting the load-bearing filter shape:

```ts
it('treasure-maps targets category 64 (Other)', () => {
  const p = getPreset('treasure-maps')!;
  expect(p.filter.searchCategories).toEqual([64]);
  expect(p.filter.sort).toBe('gilFlow');
  expect(p.filter.scope).toBe('dc');
  expect(p.filter.minVelocity).toBe(0.5);
});

it('glamour-gear targets armor + accessory categories (31–42) with a 20k floor', () => {
  const p = getPreset('glamour-gear')!;
  const expected = [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42];
  expect([...p.filter.searchCategories].sort((a, b) => a - b)).toEqual(expected);
  expect(p.filter.minPrice).toBe(20_000);
  expect(p.filter.sort).toBe('gilFlow');
});

it('glamour-housing targets four housing categories with a 20k floor', () => {
  const p = getPreset('glamour-housing')!;
  expect([...p.filter.searchCategories].sort((a, b) => a - b)).toEqual([56, 65, 66, 67]);
  expect(p.filter.minPrice).toBe(20_000);
  expect(p.filter.sort).toBe('gilFlow');
});
```

The existing structural tests (unique id, non-empty label/desc, legal sort, every preset has a category) automatically extend to the new entries — no extra work.

## What you get for free

All three presets show up immediately in the existing preset picker (rendered from `PRESETS` in `QueriesView`). No route changes, no store changes, no UI changes.

## Risks

- **Treasure-map category noise.** Covered above — if practice shows it's too noisy, drop the preset and revisit the filter shape later.
- **Glam minPrice floor is a guess.** 20k is a reasonable starting point for "this isn't crafting waste" but the user may want to tune up/down after using it. Trivial to adjust later.
- **Velocity floor 0.5 may be too high or too low.** Glam pieces sometimes sell only twice a week; a 0.5 floor means ~3.5 sales/week. If the user finds the preset too sparse, halving the floor is one number to change.

## Out of scope (future, if useful)

- Materia family-pivot view (Phase 1b — separate brainstorm).
- Per-expansion treasure-map breakdowns (Endwalker vs. Dawntrail tiers).
- Glamour curation by tier/expansion or by named "glam classic" item lists.
- A name-pattern or id-allowlist filter for cases category lookup can't handle.
