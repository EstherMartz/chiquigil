# Shopping List "Source" Column — Design Spec

**Status:** Approved 2026-05-18
**Phase:** P2-4 follow-up (Shopping List source picker)
**Depends on:** Shopping List (shipped 2026-05-17), NPC Vendor Flip P2-3 (shipped 2026-05-17), Currency Optimizer P4 (shipped 2026-05-17)

---

## Goal

Extend `/shopping-list` so each ingredient compares three procurement sources — Marketboard (MB), NPC gil-shop vendor, and special-currency vendor — and auto-picks the cheapest gil source. Users can override MB↔NPC per ingredient via a small toggle; rollup and per-world summary cards reflect the chosen sources. Special-currency availability shows as a non-interactive info-line.

## Non-goals

- No auto-pick of currency vendors (currency cost isn't gil-comparable; player decides whether to spend currency).
- No multi-currency optimizer (e.g., "spend N Poetics + (M-Nq) gil to minimize total cost") — way out of scope.
- No re-architecture of `aggregateIngredients` or `useShoppingListStore`.
- No DC scope toggle; survey continues using EU (Chaos + Light) world data per existing `planShopping` behavior.

## Architecture

Two new pure-compute modules + a stateful refactor of one component:

```
              ┌──────────────────────────────┐
demand,prices │  surveyIngredients(...)      │
vendorMap,    │  → IngredientSurvey[]        │  pure, memoized
shopSnapshot  └──────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────────┐
overrides     │  applyShoppingOverrides(...)  │  pure, recomputes on override change
shoppingItems │  → ShoppingPlan               │
snapshot      └──────────────────────────────┘
prices                        │
                              ▼
              ┌──────────────────────────────┐
              │  ShoppingListPlan component   │
              │  (holds overrides state +     │
              │   renders Rollup + ByWorld +  │
              │   DetailTable with toggles)   │
              └──────────────────────────────┘
```

The existing `planShopping` function survives as a thin wrapper:
```ts
export function planShopping(demand, items, prices, snapshot): ShoppingPlan {
  const survey = surveyIngredients(demand, prices, new Map(), { byCurrency: new Map() });
  return applyShoppingOverrides(survey, items, snapshot, prices, new Map());
}
```
so callers that don't yet pass vendor/shop snapshots still work and the existing 6 planShopping tests stay green.

## Types

```ts
// shoppingListSurvey.ts
export interface IngredientSurvey {
  id: number;
  qty: number;
  mb: { world: string; price: number; count: number; isLightDc: boolean } | null;
  npc: { price: number } | null;
  currency: { id: CurrencyId; label: string; shortLabel: string; costPerUnit: number } | null;
  autoSource: 'mb' | 'npc' | null;  // null when neither MB nor NPC available
}

export function surveyIngredients(
  demand: Map<number, number>,
  prices: MarketData,
  vendorMap: Map<number, number>,
  shopSnapshot: SpecialShopSnapshot,
): IngredientSurvey[];

// applyShoppingOverrides.ts
export type ChosenSource = 'mb' | 'npc';

export function applyShoppingOverrides(
  survey: IngredientSurvey[],
  shoppingItems: ShoppingListItem[],
  snapshot: SnapshotItem[],
  prices: MarketData,
  overrides: Map<number, ChosenSource>,
): ShoppingPlan;  // existing type, unchanged shape
```

`ShoppingPlan` shape stays unchanged. The `WorldSummary.world` value `'NPC vendor'` is the sentinel for the NPC pseudo-world card.

## surveyIngredients behavior

For each `id` in `demand`:
1. Look up MB via existing `cheapestEuNq(prices[id])` helper (extracted to a shared util or re-inlined into the survey module — implementation choice).
2. Look up NPC via `vendorMap.get(id)` → `{ price } | null`.
3. Look up currency: iterate `shopSnapshot.byCurrency` for any entry where `entry.itemId === id`. If multiple matches across currencies, pick the one with the lowest `costPerUnit`; tiebreak by currency `id` lexically. (HQ-delivery entries are eligible — the info-line just states availability.)
4. Compute `autoSource`:
   - If both MB and NPC exist → `mb.price <= npc.price ? 'mb' : 'npc'` (MB wins on ties because it's the user's expected default).
   - If only one exists → that one.
   - If neither → `null`.

Order of output: sort by `id` ascending (matches existing `planShopping` behavior).

## applyShoppingOverrides behavior

For each survey row, resolve `effectiveSource: 'mb' | 'npc' | null`:
- Read `overrides.get(id)`. If present AND that source exists on the survey row → use it.
- Otherwise fall back to `autoSource` (silently — stale overrides are not error states).

Build `perIngredient` from effective source:
- `effectiveSource === 'mb'` → `{ id, qty, bestWorld: mb.world, bestPrice: mb.price, isLightDc: mb.isLightDc, listingCount: mb.count }`
- `effectiveSource === 'npc'` → `{ id, qty, bestWorld: 'NPC vendor', bestPrice: npc.price, isLightDc: false, listingCount: 0 }`
- `effectiveSource === null` → unchanged "no listings" shape; bumps `missingIngredients`.

`byWorldSummary` aggregates as today, keyed by `bestWorld` (so `'NPC vendor'` becomes its own card naturally). Sort still by `total` descending.

`rollup.spend` sums all chosen `bestPrice * qty`. `rollup.revenue` and `rollup.profit` computed identically to today (via `itemRevenueUnit`).

## ShoppingListPlan UI

**Detail table — Source column:**

Replace today's "Best world" column with "Source". Per row:

- **Both MB + NPC available:** render the source label followed by an inline 2-button mini-toggle:
  ```
  Phantom ✈  [ MB ◉ │ NPC ○ ]
  ```
  Button styling reuses the existing HQ-mode button pattern from filter strips: `font-mono text-[10px] tracking-widest uppercase px-2 py-1 border`, active = `border-gold text-gold`, inactive = `border-border-base text-text-dim hover:text-aether`.
- **Only one gil source:** plain label only, no toggle.
- **No gil source:** italic "No listings" (unchanged).

When the survey row has a `currency` entry, render a second line below the source cell, regardless of which source is auto-picked:
```
└─ 10 Poetics avail.
```
Style: `font-mono text-[10px] text-text-low`. Not interactive.

The "Price" and "Subtotal" cells reflect the **effective** source's price. The "Best world" header text becomes "Source".

**ByWorld summary cards:**

NPC ingredients aggregate into a `'NPC vendor'` card. Styling differences from real-world cards:
- `border-aether` instead of `border-border-base` (visual distinction)
- No `✈` glyph
- Heading text reads `NPC vendor` (no DC suffix)

**Rollup:**

`spend` already includes NPC purchases via `applyShoppingOverrides`. No new stat cards. Existing `missingIngredients` warning still applies to ingredients with no gil source.

**CSV export:**

Adds a `Source` column with values `mb` | `npc` | `none`. Existing columns unchanged.

## Component state

`ShoppingListPlan` adds:
```ts
const [overrides, setOverrides] = useState<Map<number, ChosenSource>>(new Map());
```

Toggle handler:
```ts
function setSource(id: number, source: ChosenSource) {
  setOverrides((prev) => { const next = new Map(prev); next.set(id, source); return next; });
}
```

The plan is recomputed via `useMemo([survey, items, snapshot, prices, overrides])`. Overrides are NOT persisted to IDB or URL — they're session-scoped to the current page view. Refreshing resets to autoSource.

## Route wiring

`src/routes/ShoppingList.tsx` adds:
```ts
const vendor = useVendorShopSnapshot();
const shop = useSpecialShopSnapshot();
const vendorMap = vendor.data ?? new Map();
const shopSnapshot = shop.data?.snapshot ?? { byCurrency: new Map() };
const survey = useMemo(
  () => surveyIngredients(demand, prices, vendorMap, shopSnapshot),
  [demand, prices, vendorMap, shopSnapshot]
);
```
Pass `survey` to `ShoppingListPlan` (replacing today's `plan` prop). `ShoppingListPlan` now owns the override state and the `applyShoppingOverrides` call internally — the route no longer hands it a pre-computed plan. Loading states on the new hooks are tolerated silently — survey just sees empty maps until they resolve.

## Edge cases

- **Snapshot hooks loading:** survey treats undefined catalogs as empty; no NPC sources or currency info-lines surface until ready. No spinner needed (consistent with existing route behavior — MB prices already drive the spinner).
- **Override targets unavailable source** (e.g., user toggled NPC, catalog refresh removed the entry): apply silently falls back to autoSource.
- **Same item in multiple currency buckets:** pick lowest `costPerUnit`; tiebreak by lexical `currency.id`.
- **NPC strictly cheaper than MB by 1 gil:** auto-pick is NPC. User can override to MB if they prefer convenience.
- **Item has only currency source (no MB, no NPC):** `autoSource: null`, row shows "No listings" but the currency info-line still appears below — letting the user see that the item is at least obtainable for currency.
- **Toggling an ingredient that was the only contributor to its world card:** world card disappears on re-aggregation. No empty cards in `byWorldSummary`.
- **`worldListings` ordering:** existing `cheapestEuNq` already iterates the array linearly and picks first-min; ordering matches today's behavior. No new tie-breaking guarantees needed.
- **NPC vendor card sorting:** sorted into `byWorldSummary` by `total` like any real world. If NPC purchases dominate spend, the NPC card appears first.

## Testing

**`shoppingListSurvey.test.ts` (~10 tests):**
1. Empty demand → []
2. MB-only ingredient → `mb` populated, `npc` & `currency` null, `autoSource: 'mb'`
3. NPC-only ingredient → `autoSource: 'npc'`
4. Currency-only ingredient → `autoSource: null`, currency populated
5. All three sources, MB cheapest → `autoSource: 'mb'`
6. All three, NPC cheapest by 1 gil → `autoSource: 'npc'`
7. MB === NPC price → `autoSource: 'mb'` (MB wins ties)
8. Currency item with multiple deals in one bucket → picks lowest costPerUnit
9. Item in multiple currency buckets → picks deterministic one (lowest costPerUnit, lexical currency.id tiebreak)
10. `isLightDc` flag propagates correctly from `cheapestEuNq`

**`applyShoppingOverrides.test.ts` (~8 tests):**
1. Empty survey → empty plan
2. No overrides → identical output to today's `planShopping` for the MB-only case
3. Override flips MB→NPC for one ingredient → spend updates, MB world card shrinks, NPC card appears
4. Override targets `'npc'` when survey row has no NPC → falls back to autoSource (MB if present, else missing)
5. Override pointing at `'mb'` when survey row has no MB → falls back to NPC
6. Rollup.spend sums both MB and NPC totals
7. `byWorldSummary` contains an `'NPC vendor'` card with correct totals when any NPC purchase occurs
8. Revenue computation unchanged (uses `itemRevenueUnit`, HQ-min-price preference still works)

**`ShoppingListPlan.test.tsx` extensions (~4 tests):**
1. Renders Source toggle when both MB + NPC exist on the survey row
2. Renders no toggle when only one source exists
3. Clicking the NPC button updates the displayed plan (price reflects NPC, world cell shows "NPC vendor")
4. Currency info-line renders below the source when `survey.currency` is present, with the `<costPerUnit> <shortLabel> avail.` text

**Existing tests** in `planShopping.test.ts` and `ShoppingListPlan.test.tsx` continue passing with no edits — `planShopping` keeps the same signature and behavior for the MB-only case.

**Total new tests:** ~22. Suite: 577 → ~599.

## File list

**Create:**
- `src/features/shoppingList/shoppingListSurvey.ts`
- `src/features/shoppingList/shoppingListSurvey.test.ts`
- `src/features/shoppingList/applyShoppingOverrides.ts`
- `src/features/shoppingList/applyShoppingOverrides.test.ts`

**Modify:**
- `src/features/shoppingList/planShopping.ts` (re-implement as thin wrapper around survey + apply)
- `src/features/shoppingList/ShoppingListPlan.tsx` (accept survey prop, hold overrides state, add toggle + info-line + NPC card styling)
- `src/features/shoppingList/ShoppingListPlan.test.tsx` (4 new tests)
- `src/routes/ShoppingList.tsx` (wire `useVendorShopSnapshot` + `useSpecialShopSnapshot`, compute survey, pass to ShoppingListPlan)

No changes to `aggregateIngredients`, `shoppingListStore`, `AddToShoppingListButton`, `ShoppingListPanel`, types, hooks, or any other feature.

## Phased delivery (single PR, 6 commits)

1. **`surveyIngredients`** + 10 tests
2. **`applyShoppingOverrides`** + 8 tests
3. **`planShopping` re-implementation** on top of (1)+(2); existing 6 planShopping tests stay green
4. **`ShoppingListPlan` rewire** — accept survey, add overrides state, Source toggle + currency info-line + 4 new tests
5. **Route wiring** — `ShoppingList.tsx` adds the two snapshot hooks + survey memo
6. **CSV column + NPC card styling + final verification** (suite + tsc)

Each commit ships independently passing tests + tsc clean. No interim breakages.
