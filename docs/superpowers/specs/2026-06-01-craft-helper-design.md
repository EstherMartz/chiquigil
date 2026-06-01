# Craft Helper — design

**Date:** 2026-06-01
**Status:** Approved, ready for planning
**Supersedes (evolves):** [2026-05-17-shopping-list-design.md](./2026-05-17-shopping-list-design.md)

## Summary

Evolve the existing **Shopping List** into a **Craft Helper**: instead of only
aggregating ingredients to buy, it takes the target items you want and proposes
**what to craft, what to gather, and what to buy** — a full make-vs-gather-vs-buy
plan. Along the way, fix a confirmed bug where adding items from an item's detail
page sometimes silently fails. Separately, hide the web "Plan" page (`/planner`)
from ordinary web visitors while keeping it available in the plugin context.

Three independent pieces of work, shipped together:

1. **Craft Helper** — rename + expand the shopping list into a 3-bucket planner.
2. **Add-to-list bug fix** — remove the recipe gate that blocks/drops adds.
3. **Hide Plan from web** — gate the `/planner` nav item on plugin connection.

## Background / current state

- Shopping list lives under `/shopping-list` (`src/routes/ShoppingList.tsx`),
  with a Zustand store persisted at `ffxiv-helper:shoppingList`
  (`src/features/shoppingList/shoppingListStore.ts`).
- Items are `{ id, qty, craftIntermediates }`. `aggregateIngredients` expands
  recipes **only ~2 levels deep** and produces a single ingredient-demand map.
- "Plan shopping" runs `surveyIngredients` → renders `ShoppingListPlan`
  (cheapest MB/NPC source per material, by-world breakdown, profit rollup).
- A cycle-safe, depth-limited recursive expander already exists:
  `explode()` in `src/bot/craftExplode.ts`, returning `{ crafts, leaves }`.
- Gathering data is available via `useGatheringCatalog()` →
  `Map<itemId, { level, timed, hidden }>`.
- Plugin connection state is exposed via `usePluginBridge().connected`
  (true when `usePluginStore.status === 'open'`).

## The add-to-list bug (confirmed)

`AddToShoppingListButton` (`src/features/shoppingList/AddToShoppingListButton.tsx:14`)
renders a **disabled "Not craftable" button whenever `hasRecipe` is false**.
`hasRecipe` is `recipe != null`, and `recipe` is read from the recipe snapshot at
`src/routes/Item.tsx:84`: `valid && recipes.data ? recipes.data.get(itemId) : undefined`.

Two real failure modes result:

1. **Loading race (the "sometimes")** — while the recipe snapshot is still
   loading (`recipes.data` undefined), `recipe` is `undefined` → the button shows
   "Not craftable" and refuses to add **even for craftable items**. Clicking
   before the snapshot resolves silently does nothing.
2. **By-design exclusion** — genuinely non-craftable items (gatherables,
   vendor/market-only) can never be added. Wrong for a Craft Helper.

The store mutation logic itself (`addItem`, dedup-by-id + qty increment) is clean
and synchronous — not the cause. The same dead gate also exists in the panel's
search-add (`ShoppingListPanel.tsx:44`, `"… is not craftable."`).

**Fix:** the add button stops gating on recipes entirely. Adding works for any
item; craft-vs-gather-vs-buy is decided later in the breakdown. The button shows a
brief disabled "…" only while the snapshot is *genuinely* loading, so it never
lies with "Not craftable." Remove the craftable check from panel search-add too.

## Naming / scope

- Relabel all user-facing strings "Shopping List" → **"Craft Helper"**: sidebar
  nav item, page heading + description, `PAGE_TITLES` entry.
- **Keep** the route `/shopping-list` and the persistence key
  `ffxiv-helper:shoppingList` so saved lists and bookmarks survive.
- Add a `/craft-helper` → `/shopping-list` redirect alias for the new name.

## Core engine: `buildCraftPlan`

New module `src/features/shoppingList/buildCraftPlan.ts` replaces the role of the
shallow `aggregateIngredients`. Signature (illustrative):

```ts
type SourceKind = 'craft' | 'gather' | 'buy';

interface CraftPlan {
  craft: Map<number, { qty: number; craftCount: number; job: string }>;
  gather: Map<number, { qty: number; level: number; timed: boolean }>;
  buy: Map<number, number>; // itemId → qty (feeds surveyIngredients)
}

function buildCraftPlan(
  items: ShoppingListItem[],
  recipeMap: Map<number, Recipe | null>,
  gathering: GatheringCatalog,
  overrides: Map<number, SourceKind>,
): CraftPlan;
```

Behavior:

1. **Full recursive expansion** — for each target item, run `explode(target.id,
   target.qty, recipeMap, { craftIntermediates: true })` (cycle-safe,
   `maxDepth` default). Merge each target's `crafts` and `leaves` maps across all
   targets (summing quantities). This replaces the old ~2-level expansion with a
   complete tree down to raw mats.
2. **Bucketing**:
   - **Craft** = merged `crafts` (every node with a recipe: targets +
     craftable intermediates), carrying craft-count and job.
   - **Gather** = leaves whose id is in the gathering catalog (carry level/timed).
   - **Buy** = remaining leaves (not gatherable).
3. **Overrides** (`Map<itemId, SourceKind>`, default auto):
   - A craftable node overridden to `buy` (or `gather`) is **treated as a leaf** —
     recursion stops there and it drops into the Buy (or Gather) bucket.
   - A gatherable leaf overridden to `buy` moves to the Buy bucket.
   - This is implemented by consulting `overrides` inside the expansion walk
     (stop descending when an otherwise-craftable node is overridden away from
     `craft`) and during leaf classification.

Notes:
- `explode` accepts `Map<number, Recipe>`; the snapshot is `Map<number, Recipe |
  null>`. `explode` already truthy-checks `recipes.get(id)`, so null entries are
  safe; adjust the type/cast at the call site.
- The **Buy** bucket's demand map is passed into the **existing** untouched
  `surveyIngredients` + `ShoppingListPlan` stack — cheapest MB/NPC source,
  by-world breakdown, profit rollup all preserved, just scoped to true purchases.

## Page layout (`/shopping-list`, titled "Craft Helper")

Top to bottom:

1. **Item panel** — unchanged add/qty/remove behavior, relabeled; the
   "not craftable" search-add gate removed (accepts any catalog item).
2. **Craft** section — items to synthesize (targets + intermediates) with
   craft-count and job. New display component.
3. **Gather** section — gatherable leaves with level/timed flags; links to the
   Gathering Plan (`/gathering/plan`). New display component.
4. **Buy** section — the existing `ShoppingListPlan` rendering (rollup, by-world,
   per-ingredient MB/NPC source cells), fed the Buy bucket only.

Each Craft/Gather/Buy row carries a per-row **source override** selector:
- Craftable intermediate rows: **Craft ↔ Buy** (Buy stops recursion → Buy bucket).
- Gatherable leaf rows: **Gather ↔ Buy**.
- Buy rows keep the existing MB/NPC sub-choice.

Sections follow the established insight-page idioms (FilterBar/ResultTableScaffold/
SortableHeader/ItemNameLinks where they fit). The plugin push
(`PluginShoppingSend`) keeps sending the acquisition list (gather + buy leaves) to
the in-game window.

## Hide "Plan" from web

- In `Sidebar.tsx`, compute nav groups dynamically and **omit** the
  `{ label: 'Plan', path: '/planner' }` item when `usePluginBridge().connected` is
  false. When the plugin websocket is open (game + plugin running), it reappears —
  keeping the feature "in the plugin" context.
- Leave the `/planner` **route registered** in `App.tsx` as a reachable escape
  hatch (direct URL still works). Reversible — true to "for now."

## Testing (TDD)

- `buildCraftPlan` — full recursion depth; three-bucket categorization;
  override flips (craft→buy stops recursion, gather→buy moves bucket);
  multi-target quantity merge; cycle safety inherited from `explode`.
- `AddToShoppingListButton` — adds any item; renders addable vs loading "…" vs
  on-list states; never shows a false "Not craftable."
- `ShoppingListPanel` search-add — accepts a non-craftable catalog item.
- `Sidebar` — Plan item hidden when disconnected, shown when connected.

## Files

**New**
- `src/features/shoppingList/buildCraftPlan.ts` (+ test)
- `src/features/shoppingList/CraftSection.tsx` (Craft bucket display)
- `src/features/shoppingList/GatherSection.tsx` (Gather bucket display)

**Modified**
- `src/features/shoppingList/AddToShoppingListButton.tsx` — drop recipe gate; add
  loading state; relabel.
- `src/features/shoppingList/ShoppingListPanel.tsx` — remove "not craftable"
  search-add gate; relabel.
- `src/routes/ShoppingList.tsx` — orchestrate Craft/Gather/Buy sections via
  `buildCraftPlan`; wire gathering catalog + overrides; relabel heading/desc.
- `src/components/layout/Sidebar.tsx` — relabel "Shopping" → "Craft Helper";
  dynamic Plan gating on plugin connection.
- `src/App.tsx` — `PAGE_TITLES` relabel; `/craft-helper` redirect alias.
- `src/routes/Item.tsx` — update `AddToShoppingListButton` props (no `hasRecipe`).

**Reused untouched**
- `src/bot/craftExplode.ts` (`explode`)
- `src/features/shoppingList/shoppingListSurvey.ts` (`surveyIngredients`)
- `src/features/shoppingList/ShoppingListPlan.tsx` (Buy rendering)
- `src/features/queries/useGatheringCatalog.ts`

**Possibly removed/retired**
- `src/features/shoppingList/aggregateIngredients.ts` — superseded by
  `buildCraftPlan` (keep only if another caller depends on it; verify before
  deleting).

## Non-goals / deferred

- Cost-optimized auto-sourcing (compare craft vs gather vs buy by gil and pick the
  cheapest automatically). This version auto-categorizes by game data with manual
  per-row override; cost optimization is a later enhancement.
- Renaming the route `/shopping-list` → `/craft-helper` (kept stable; only an
  alias added).
- Any changes to the plugin's own native planning windows (separate repo).
