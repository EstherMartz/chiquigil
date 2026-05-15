# Trading Presets Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three trading presets (`treasure-maps`, `glamour-gear`, `glamour-housing`) to `src/features/queries/presets.ts` so they appear one-click in the preset picker.

**Architecture:** Single production-file change. Each preset is one entry appended to the `PRESETS` array, using existing `QueryFilter` fields only — no new types, no new filter mechanisms. Test coverage is one focused per-preset test for the load-bearing shape plus a one-line update to the existing `'categorizes trading presets correctly'` roster check.

**Tech Stack:** TypeScript, Vitest 4. No runtime dependencies introduced.

**Spec:** [docs/superpowers/specs/2026-05-15-trading-presets-bundle-design.md](../specs/2026-05-15-trading-presets-bundle-design.md)

---

## File Structure

**Modify:**
- `src/features/queries/presets.ts` — append 3 entries to `PRESETS` array. No other changes.
- `src/features/queries/presets.test.ts` — update one existing test (`'categorizes trading presets correctly'`) and add three new per-preset assertions.

**No new files. No imports added. No type changes.**

---

## Conventions

- Run tests with: `npx vitest run src/features/queries/presets.test.ts`
- Commit with prefix `feat(trading):` for code changes, `test(trading):` for test-only commits.
- Each task is its own commit. Stage only the two files this plan touches — do not `git add -A`.

---

## Task 1: Add `treasure-maps` preset

**Files:**
- Modify: `src/features/queries/presets.ts` (append to `PRESETS` array)
- Modify: `src/features/queries/presets.test.ts` (add new `it(...)`, update existing roster check)

- [ ] **Step 1: Write the failing per-preset test**

In `src/features/queries/presets.test.ts`, add this `it(...)` block inside the `describe('PRESETS', () => { ... })`, anywhere after `it('reposts preset is home-scope mode=repost with minGap 10k', ...)`:

```ts
it('treasure-maps targets category 64 (Other)', () => {
  const p = getPreset('treasure-maps')!;
  expect(p.filter.searchCategories).toEqual([64]);
  expect(p.filter.sort).toBe('gilFlow');
  expect(p.filter.scope).toBe('dc');
  expect(p.filter.minVelocity).toBe(0.5);
});
```

- [ ] **Step 2: Update the trading-roster test to include `treasure-maps`**

In `src/features/queries/presets.test.ts`, find the existing `it('categorizes trading presets correctly', ...)`. Update its `toEqual([...])` to include `'treasure-maps'` in alphabetical position:

```ts
it('categorizes trading presets correctly', () => {
  const tradingIds = PRESETS.filter((p) => p.category === 'trading').map((p) => p.id).sort();
  expect(tradingIds).toEqual([
    'fast-sellers-hq',
    'food-potions',
    'furnishings',
    'high-value-materials',
    'mega-value-hq',
    'minions-quick-sell',
    'reposts',
    'treasure-maps',
  ]);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/queries/presets.test.ts`

Expected: two failures.
- `'treasure-maps targets category 64 (Other)'` fails because `getPreset('treasure-maps')` returns `undefined` and `.filter` is read off `undefined`.
- `'categorizes trading presets correctly'` fails because the actual array is missing `'treasure-maps'`.

- [ ] **Step 4: Add the preset entry**

In `src/features/queries/presets.ts`, append this entry to the `PRESETS` array (before the closing `]` on line 118):

```ts
{
  id: 'treasure-maps', label: 'Treasure maps', category: 'trading',
  desc: 'Current-tier timeworn maps ranked by gil/day.',
  // Category 64 (Other) is the bucket FFXIV files timeworn maps under.
  // The rest of category 64 is filtered out implicitly by gilFlow sort + minVelocity.
  filter: { searchCategories: [64], hq: 'either', minDealPct: 0, minVelocity: 0.5,
            minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
            scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/queries/presets.test.ts`

Expected: all tests in the file pass. The full project test sweep (`npm test`) should also pass — if anything else breaks, stop and investigate before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/presets.ts src/features/queries/presets.test.ts
git commit -m "feat(trading): add treasure-maps preset"
```

---

## Task 2: Add `glamour-gear` preset

**Files:**
- Modify: `src/features/queries/presets.ts`
- Modify: `src/features/queries/presets.test.ts`

- [ ] **Step 1: Write the failing per-preset test**

In `src/features/queries/presets.test.ts`, add this `it(...)` block after the `'treasure-maps targets category 64 (Other)'` test added in Task 1:

```ts
it('glamour-gear targets armor + accessory categories (31–42) with a 20k floor', () => {
  const p = getPreset('glamour-gear')!;
  const expected = [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42];
  expect([...p.filter.searchCategories].sort((a, b) => a - b)).toEqual(expected);
  expect(p.filter.minPrice).toBe(20_000);
  expect(p.filter.sort).toBe('gilFlow');
});
```

- [ ] **Step 2: Update the trading-roster test to include `glamour-gear`**

In `src/features/queries/presets.test.ts`, update `'categorizes trading presets correctly'` to include `'glamour-gear'` in alphabetical position. The full roster is now:

```ts
expect(tradingIds).toEqual([
  'fast-sellers-hq',
  'food-potions',
  'furnishings',
  'glamour-gear',
  'high-value-materials',
  'mega-value-hq',
  'minions-quick-sell',
  'reposts',
  'treasure-maps',
]);
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/queries/presets.test.ts`

Expected: two failures (the new per-preset test + the roster check).

- [ ] **Step 4: Add the preset entry**

In `src/features/queries/presets.ts`, append this entry to the `PRESETS` array (after the `treasure-maps` entry added in Task 1):

```ts
{
  id: 'glamour-gear', label: 'Glamour gear', category: 'trading',
  desc: 'Old/rare armor & accessories likely to flip well.',
  // Categories 31–42: Head, Undershirts, Body, Undergarments, Legs, Hands, Feet,
  // Waist, Necklaces, Earrings, Bracelets, Rings — see itemSearchCategories.ts.
  filter: { searchCategories: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
            hq: 'either', minDealPct: 0, minVelocity: 0.5,
            minPrice: 20_000, maxPrice: null, sort: 'gilFlow', limit: 100,
            scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/queries/presets.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/presets.ts src/features/queries/presets.test.ts
git commit -m "feat(trading): add glamour-gear preset"
```

---

## Task 3: Add `glamour-housing` preset

**Files:**
- Modify: `src/features/queries/presets.ts`
- Modify: `src/features/queries/presets.test.ts`

- [ ] **Step 1: Write the failing per-preset test**

In `src/features/queries/presets.test.ts`, add this `it(...)` block after the `'glamour-gear targets armor + accessory categories ...'` test added in Task 2:

```ts
it('glamour-housing targets four housing categories with a 20k floor', () => {
  const p = getPreset('glamour-housing')!;
  expect([...p.filter.searchCategories].sort((a, b) => a - b)).toEqual([56, 65, 66, 67]);
  expect(p.filter.minPrice).toBe(20_000);
  expect(p.filter.sort).toBe('gilFlow');
});
```

- [ ] **Step 2: Update the trading-roster test to include `glamour-housing`**

In `src/features/queries/presets.test.ts`, update `'categorizes trading presets correctly'` to include `'glamour-housing'` in alphabetical position. The full roster is now (10 entries):

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

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/queries/presets.test.ts`

Expected: two failures (the new per-preset test + the roster check).

- [ ] **Step 4: Add the preset entry**

In `src/features/queries/presets.ts`, append this entry to the `PRESETS` array (after the `glamour-gear` entry added in Task 2):

```ts
{
  id: 'glamour-housing', label: 'Glamour housing', category: 'trading',
  desc: 'Old/rare housing items & fixtures likely to flip well.',
  // Categories 56, 65, 66, 67: Furnishings, Exterior Fixtures, Interior Fixtures,
  // Outdoor Furnishings — see itemSearchCategories.ts. Other housing sub-categories
  // (68–72, 82) are covered by the broader 'furnishings' preset.
  filter: { searchCategories: [56, 65, 66, 67],
            hq: 'either', minDealPct: 0, minVelocity: 0.5,
            minPrice: 20_000, maxPrice: null, sort: 'gilFlow', limit: 100,
            scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/queries/presets.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Run the full test suite + typecheck as a sanity sweep**

Run: `npx vitest run` (full vitest pass, all files)
Expected: all tests pass.

Run: `npx tsc --noEmit`
Expected: no errors.

If anything else fails, stop and investigate before committing.

- [ ] **Step 7: Commit**

```bash
git add src/features/queries/presets.ts src/features/queries/presets.test.ts
git commit -m "feat(trading): add glamour-housing preset"
```

---

## Done

After Task 3, the three new presets are live in the picker. No route changes, no store changes, no UI changes — they appear automatically in whichever component renders `PRESETS`.

**Smoke test (optional but recommended):** Start the dev server (`npm run dev`), open `/`, find the preset picker, confirm the three new presets appear in the "trading" group, run each one against live Universalis data, and eyeball whether the result quality looks reasonable. If `treasure-maps` returns mostly non-map noise, refer to the spec's "Treasure-map category caveat" section — the right move is to revert that preset (`git revert <task-1-commit>`) and brainstorm an id-allowlist mechanism in a future phase, not to extend `QueryFilter` here.
