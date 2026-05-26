# Craft From Inventory

## Overview

New feature that answers "What can I craft with what I already have?" User uploads an Allagan Tools inventory CSV, the app matches owned items against all recipes, and shows what they can craft sorted by ingredient completeness.

Two surfaces: a standalone web page at `/craft-from-inventory` and a Discord `/craftable` bot command.

## Web App

### Page: `/craft-from-inventory`

**Flow:**
1. User pastes CSV into `AllaganPasteBox` (existing component)
2. Parse with `parseAllaganInventory` → `InventoryEntry[]`
3. Build inventory map: `Map<itemId, totalQty>` (sum NQ+HQ per item — quality doesn't matter for crafting inputs)
4. For every recipe in the snapshot, compute completeness:
   - For each ingredient: `have = inventory.get(id) ?? 0`, `need = recipe.amount`
   - Count missing ingredient types (where `have < need`)
   - Completeness percentage: `fulfilledTypes / totalTypes`
5. Filter by `missingTypes <= N` (configurable, default 1, range 0-5)
6. Optional toggle filter: "marketable only" (output has `velocity > 0` in market cache)
7. Sort by completeness % descending, then recipe level descending
8. Display in `ResultTableScaffold` pattern (matches established insight-page idioms)

### Result Table Columns

| Column | Content |
|--------|---------|
| Item | Name (linked to detail page) + crafter job icon + recipe level |
| Completeness | `4/5 ingredients (80%)` |
| Ingredients | Compact list per ingredient: `checkmark Iron Ore 3/3` or `cross Fire Crystal 0/2 (vendor 5g)` |
| Missing source | For each missing ingredient: vendor price, MB price from cache, or "gather" |

### Filters

- **Max missing ingredients** — slider or dropdown, 0-5, default 1. Controls how many ingredient types can be missing.
- **Marketable only** — toggle, default off. When on, only shows recipes whose output has `velocity > 0` in the market cache.

### Key Design Decisions

- **No live market fetch** — completeness is purely inventory vs recipe ingredients. Market data for the "marketable" filter and "missing source" column comes from the pre-seeded cache (same as all other views).
- **All recipes checked** — not just GC supply items. This is the key difference from the existing cleanup craft opportunities which are profit-focused.
- **NQ+HQ summed** — inventory quantities are summed regardless of quality since crafting inputs don't distinguish.

## Core Logic

### `findCraftableFromInventory(inventory, recipes, opts)`

Pure function, no side effects. Lives in `src/features/craftFromInventory/findCraftable.ts`.

**Input:**
- `inventory: Map<number, number>` — itemId → total quantity owned
- `recipes: Map<number, Recipe>` — all recipes from snapshot
- `opts: { maxMissing: number; marketableOnly: boolean; marketData?: MarketData; vendorMap?: Map<number, number>; gatheringCatalog?: Map<number, unknown> }`

**Output:**
```typescript
interface CraftableRow {
  recipeItemId: number;         // output item ID
  name: string;                 // output item name
  classJob: CrafterCode;        // crafter class
  recipeLevel: number;
  amountResult: number;         // units produced per craft
  totalIngredients: number;     // count of ingredient types
  missingCount: number;         // count of missing ingredient types
  completeness: number;         // 0-1 ratio
  ingredients: IngredientStatus[];
}

interface IngredientStatus {
  itemId: number;
  name: string;
  needed: number;
  have: number;
  fulfilled: boolean;
  source: 'vendor' | 'market' | 'gather' | 'unknown';
  unitPrice: number | null;     // vendor or MB price for missing items
}
```

**Algorithm:**
1. Iterate all recipes
2. For each recipe, check each ingredient against inventory map
3. Count missing types, compute completeness
4. Filter by `missingCount <= maxMissing`
5. If `marketableOnly`, check output item's velocity in market cache
6. Sort by completeness desc, then recipeLevel desc
7. Return `CraftableRow[]`

## Discord Bot: `/craftable` Command

### Registration

New slash command:
```
/craftable
  csv: Attachment (required) — inventory CSV file
```

Registered alongside existing commands in `scripts/register-commands.ts`.

### Handler

1. Download CSV attachment from Discord CDN
2. Parse with `parseAllaganInventory`
3. Build inventory map
4. Run `findCraftableFromInventory` with `maxMissing: 1, marketableOnly: false`
5. Format top 10 results as Discord message

### Response Format

```
What you can craft right now:

crafthammer Raptorskin Gloves (LTW 45) — 5/5 ingredients
crafthammer Mythril Ingot (BSM 50) — 3/4 ingredients
  Missing: Fire Crystal x2 (vendor 5g)
crafthammer Linen Yarn (WVR 35) — 2/3 ingredients
  Missing: Lightning Crystal x3 (vendor 5g), Moko Grass x2 (28g MB)
...
```

Deferred response pattern (same as other commands): respond with type 5, process in background, PATCH result.

### API Route Changes

- Add `craftable` command handling in `src/api/discord.ts`
- Download attachment via `fetch(attachment.url)`
- Uses same `findCraftableFromInventory` function as the web app

## File Structure

### New files

```
src/features/craftFromInventory/
  findCraftable.ts              <- Pure matching logic
  findCraftable.test.ts         <- Tests
  CraftFromInventoryView.tsx    <- Page component with CSV input + results table
```

### Modified files

```
src/App.tsx                     <- Add /craft-from-inventory route + nav link
scripts/register-commands.ts    <- Add /craftable command
src/api/discord.ts              <- Add /craftable handler
api/discord.mjs                 <- Rebuilt bundle
```

## What Doesn't Change

- Existing cleanup flow (CSV parsing, buckets, craft opportunities)
- Existing recipe system
- Market cache system
- All other views and routes
