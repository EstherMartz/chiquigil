# Craft From Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Craft From Inventory" feature — a standalone page where users upload inventory CSV and see what they can craft, plus a Discord `/craftable` command.

**Architecture:** Pure function `findCraftableFromInventory` matches inventory against all recipes and computes completeness. Web page reuses existing `AllaganPasteBox` for CSV input and displays results in the standard table pattern. Bot command downloads the CSV attachment, runs the same function, and returns top 10 results.

**Tech Stack:** React, vitest, Allagan CSV parser (existing), recipe snapshot (existing), market cache (existing)

**Spec:** `docs/superpowers/specs/2026-05-26-craft-from-inventory-design.md`

---

## File Structure

### New files

```
src/features/craftFromInventory/
  findCraftable.ts              <- Pure matching logic
  findCraftable.test.ts         <- Tests
  CraftFromInventoryView.tsx    <- Page component
src/routes/CraftFromInventory.tsx  <- Route wrapper
```

### Modified files

```
src/App.tsx                           <- Add route
src/components/layout/Sidebar.tsx     <- Add nav link
scripts/register-commands.ts          <- Add /craftable command
src/api/discord.ts                    <- Add /craftable handler
```

---

## Task 1: Core matching logic (`findCraftable.ts`)

**Files:**
- Create: `src/features/craftFromInventory/findCraftable.ts`
- Create: `src/features/craftFromInventory/findCraftable.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/craftFromInventory/findCraftable.test.ts
import { describe, it, expect } from 'vitest';
import { findCraftableFromInventory, type CraftableFilter } from './findCraftable';
import type { Recipe } from '../../lib/recipes';

function recipe(itemResultId: number, ingredients: Array<{ itemId: number; amount: number }>, classJob = 'BSM' as const, recipeLevel = 50): Recipe {
  return { itemResultId, classJob, recipeLevel, ingredients };
}

describe('findCraftableFromInventory', () => {
  const namesById = new Map([[1, 'Iron Ingot'], [10, 'Iron Ore'], [11, 'Fire Crystal'], [12, 'Wind Crystal'], [20, 'Steel Ingot'], [30, 'Mythril Ingot']]);

  it('returns 100% craftable recipe when all ingredients are owned', () => {
    const inventory = new Map([[10, 5], [11, 3]]);
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 3 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipeItemId).toBe(1);
    expect(rows[0].missingCount).toBe(0);
    expect(rows[0].completeness).toBe(1);
    expect(rows[0].ingredients[0].fulfilled).toBe(true);
    expect(rows[0].ingredients[1].fulfilled).toBe(true);
  });

  it('returns recipe missing 1 ingredient when maxMissing >= 1', () => {
    const inventory = new Map([[10, 5]]); // has ore, no crystal
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 3 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].missingCount).toBe(1);
    expect(rows[0].completeness).toBe(0.5);
  });

  it('excludes recipe when missing exceeds maxMissing', () => {
    const inventory = new Map<number, number>(); // empty
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 3 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 1 });
    expect(rows).toHaveLength(0);
  });

  it('sorts by completeness desc then recipeLevel desc', () => {
    const inventory = new Map([[10, 5], [11, 3]]);
    const recipes = new Map([
      [1, recipe(1, [{ itemId: 10, amount: 1 }, { itemId: 11, amount: 1 }], 'BSM', 30)],  // 100% complete, lvl 30
      [20, recipe(20, [{ itemId: 10, amount: 1 }, { itemId: 11, amount: 1 }], 'BSM', 50)], // 100% complete, lvl 50
      [30, recipe(30, [{ itemId: 10, amount: 1 }, { itemId: 12, amount: 1 }], 'BSM', 90)], // 50% complete, lvl 90
    ]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 1 });
    expect(rows[0].recipeItemId).toBe(20); // 100%, lvl 50
    expect(rows[1].recipeItemId).toBe(1);  // 100%, lvl 30
    expect(rows[2].recipeItemId).toBe(30); // 50%, lvl 90
  });

  it('counts ingredient types not quantities for missingCount', () => {
    // Has 1 ore but needs 10 — this is NOT a missing type, just insufficient qty
    // Wait, spec says missing = where have < need. So this IS missing.
    // Actually no: "Count missing ingredient types (where have < need)"
    // So if you have 1 but need 10, that type IS missing.
    const inventory = new Map([[10, 1]]);
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 10 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0].missingCount).toBe(2); // both types are short
  });

  it('marks ingredient as fulfilled when have >= need', () => {
    const inventory = new Map([[10, 3], [11, 1]]);
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 3 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 0 });
    expect(rows[0].ingredients.every(i => i.fulfilled)).toBe(true);
  });

  it('filters marketable only when velocity data is provided', () => {
    const inventory = new Map([[10, 5], [11, 3]]);
    const recipes = new Map([
      [1, recipe(1, [{ itemId: 10, amount: 1 }])],
      [20, recipe(20, [{ itemId: 10, amount: 1 }])],
    ]);
    // Item 1 has velocity, item 20 does not
    const velocityMap = new Map<number, number>([[1, 5.0]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 0, marketableOnly: true, velocityMap });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipeItemId).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/features/craftFromInventory/findCraftable.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement findCraftable.ts**

```typescript
// src/features/craftFromInventory/findCraftable.ts
import type { Recipe } from '../../lib/recipes';
import type { CrafterCode } from '../items/types';

export interface IngredientStatus {
  itemId: number;
  name: string;
  needed: number;
  have: number;
  fulfilled: boolean;
  source: 'vendor' | 'market' | 'gather' | 'unknown';
  unitPrice: number | null;
}

export interface CraftableRow {
  recipeItemId: number;
  name: string;
  classJob: CrafterCode;
  recipeLevel: number;
  amountResult: number;
  totalIngredients: number;
  missingCount: number;
  completeness: number;
  ingredients: IngredientStatus[];
}

export interface CraftableFilter {
  maxMissing: number;
  marketableOnly?: boolean;
  velocityMap?: Map<number, number>;
  vendorMap?: Map<number, number>;
  gatheringSet?: Set<number>;
}

export function findCraftableFromInventory(
  inventory: Map<number, number>,
  recipes: Map<number, Recipe>,
  namesById: Map<number, string>,
  filter: CraftableFilter,
): CraftableRow[] {
  const { maxMissing, marketableOnly, velocityMap, vendorMap, gatheringSet } = filter;
  const rows: CraftableRow[] = [];

  for (const [itemId, recipe] of recipes) {
    const ingredients: IngredientStatus[] = [];
    let missingCount = 0;

    for (const ing of recipe.ingredients) {
      const have = inventory.get(ing.itemId) ?? 0;
      const fulfilled = have >= ing.amount;
      if (!fulfilled) missingCount++;

      let source: IngredientStatus['source'] = 'unknown';
      let unitPrice: number | null = null;
      if (!fulfilled) {
        if (vendorMap?.has(ing.itemId)) {
          source = 'vendor';
          unitPrice = vendorMap.get(ing.itemId)!;
        } else if (gatheringSet?.has(ing.itemId)) {
          source = 'gather';
        } else {
          source = 'market';
        }
      }

      ingredients.push({
        itemId: ing.itemId,
        name: namesById.get(ing.itemId) ?? `Item #${ing.itemId}`,
        needed: ing.amount,
        have,
        fulfilled,
        source,
        unitPrice,
      });
    }

    if (missingCount > maxMissing) continue;
    if (marketableOnly && velocityMap && !velocityMap.has(itemId)) continue;

    const totalIngredients = recipe.ingredients.length;
    const completeness = totalIngredients > 0 ? (totalIngredients - missingCount) / totalIngredients : 1;

    rows.push({
      recipeItemId: itemId,
      name: namesById.get(itemId) ?? `Item #${itemId}`,
      classJob: recipe.classJob,
      recipeLevel: recipe.recipeLevel,
      amountResult: recipe.amountResult ?? 1,
      totalIngredients,
      missingCount,
      completeness,
      ingredients,
    });
  }

  rows.sort((a, b) => b.completeness - a.completeness || b.recipeLevel - a.recipeLevel);
  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/features/craftFromInventory/findCraftable.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/craftFromInventory/findCraftable.ts src/features/craftFromInventory/findCraftable.test.ts
git commit -m "feat: add findCraftableFromInventory matching logic"
```

---

## Task 2: Web page (`CraftFromInventoryView.tsx`)

**Files:**
- Create: `src/features/craftFromInventory/CraftFromInventoryView.tsx`
- Create: `src/routes/CraftFromInventory.tsx`

- [ ] **Step 1: Create the route wrapper**

```typescript
// src/routes/CraftFromInventory.tsx
import { CraftFromInventoryView } from '../features/craftFromInventory/CraftFromInventoryView';

export default function CraftFromInventory() {
  return <CraftFromInventoryView />;
}
```

- [ ] **Step 2: Create the page component**

```typescript
// src/features/craftFromInventory/CraftFromInventoryView.tsx
import { useMemo, useState } from 'react';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { useSettingsStore } from '../settings/store';
import { fetchMarketData } from '../../lib/universalis';
import { AllaganPasteBox } from '../cleanup/AllaganPasteBox';
import { parseAllaganInventory, type ParseResult } from '../cleanup/parseAllaganInventory';
import { findCraftableFromInventory, type CraftableRow, type CraftableFilter } from './findCraftable';
import { SectionHeader } from '../../components/SectionHeader';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { fmtGil } from '../../lib/format';
import type { SnapshotItem } from '../../lib/itemSnapshot';

export function CraftFromInventoryView() {
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot();
  const vendors = useVendorShopSnapshot();
  const gathering = useGatheringCatalog();
  const { world } = useSettingsStore();

  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [maxMissing, setMaxMissing] = useState(1);
  const [marketableOnly, setMarketableOnly] = useState(false);

  const namesById = useMemo(() => {
    const m = new Map<number, string>();
    for (const item of snapshot.data?.items ?? []) m.set(item.id, item.name);
    return m;
  }, [snapshot.data]);

  const inventory = useMemo(() => {
    if (!parsed) return null;
    const m = new Map<number, number>();
    for (const e of parsed.entries) {
      if (e.itemId === 0) continue;
      m.set(e.itemId, (m.get(e.itemId) ?? 0) + e.qty);
    }
    return m;
  }, [parsed]);

  const rows = useMemo(() => {
    if (!inventory || !recipes.data) return [];

    // Build velocity map from market cache for marketable filter
    let velocityMap: Map<number, number> | undefined;
    if (marketableOnly) {
      // We'll compute this from cached market data asynchronously — for now
      // use a simple check: any item in the recipe snapshot is considered marketable
      // unless we have velocity data showing otherwise.
      velocityMap = undefined; // Will be enhanced when cache is available
    }

    const vendorMap = vendors.data?.snapshot
      ? new Map([...vendors.data.snapshot.entries()].map(([id, price]) => [id, price as number]))
      : undefined;

    const gatheringSet = gathering.data
      ? new Set(gathering.data.keys())
      : undefined;

    return findCraftableFromInventory(inventory, recipes.data, namesById, {
      maxMissing,
      marketableOnly,
      velocityMap,
      vendorMap,
      gatheringSet,
    });
  }, [inventory, recipes.data, namesById, maxMissing, marketableOnly, vendors.data, gathering.data]);

  function handleParse(csv: string) {
    setParseError(null);
    try {
      const result = parseAllaganInventory(csv, namesById);
      setParsed(result);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleClear() {
    setParsed(null);
    setParseError(null);
  }

  const parsedSummary = parsed ? `${parsed.entries.length} items parsed` : null;
  const ready = snapshot.data != null && recipes.data != null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <SectionHeader label="Craft From Inventory" />
        <p className="font-mono text-[11px] text-text-low max-w-prose mt-1">
          Upload your Allagan Tools inventory CSV to see what you can craft with items you already own.
        </p>
      </div>

      {!ready && <Spinner label="Loading snapshots..." />}

      {ready && (
        <AllaganPasteBox
          onParse={handleParse}
          onClear={handleClear}
          parseError={parseError}
          parsedSummary={parsedSummary}
        />
      )}

      {parsed && (
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 font-mono text-[11px] text-text-low">
            Max missing:
            <select
              value={maxMissing}
              onChange={(e) => setMaxMissing(Number(e.target.value))}
              className="bg-bg-card-hi border border-border-base text-text-cream px-2 py-1 text-xs"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n === 0 ? 'None (100% ready)' : `${n} ingredient${n > 1 ? 's' : ''}`}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 font-mono text-[11px] text-text-low cursor-pointer">
            <input
              type="checkbox"
              checked={marketableOnly}
              onChange={(e) => setMarketableOnly(e.target.checked)}
              className="accent-gold"
            />
            Marketable only
          </label>
          <span className="font-mono text-[11px] text-text-dim">
            {rows.length} recipe{rows.length !== 1 ? 's' : ''} found
          </span>
        </div>
      )}

      {parsed && rows.length === 0 && (
        <EmptyState>No craftable recipes found with current filters.</EmptyState>
      )}

      {rows.length > 0 && (
        <div className="border border-border-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-center px-3 py-2">Ready</th>
                <th className="text-left px-3 py-2">Ingredients</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((row) => (
                <tr key={row.recipeItemId} className="border-t border-border-base hover:bg-bg-card-hi transition-colors">
                  <td className="px-3 py-2">
                    <ItemNameLinks id={row.recipeItemId} name={row.name} crafter={row.classJob} />
                    <div className="font-mono text-[10px] text-text-dim mt-0.5">Lv {row.recipeLevel}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`font-mono text-xs ${row.completeness === 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {Math.round(row.completeness * 100)}%
                    </span>
                    <div className="font-mono text-[10px] text-text-dim">
                      {row.totalIngredients - row.missingCount}/{row.totalIngredients}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {row.ingredients.map((ing) => (
                        <span key={ing.itemId} className={`font-mono text-[11px] ${ing.fulfilled ? 'text-emerald-400' : 'text-crimson'}`}>
                          {ing.fulfilled ? '\u2713' : '\u2717'} {ing.name} {ing.have}/{ing.needed}
                          {!ing.fulfilled && ing.unitPrice != null && (
                            <span className="text-text-dim"> ({ing.source} {fmtGil(ing.unitPrice)})</span>
                          )}
                          {!ing.fulfilled && ing.source === 'gather' && (
                            <span className="text-text-dim"> (gather)</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/features/craftFromInventory/CraftFromInventoryView.tsx src/routes/CraftFromInventory.tsx
git commit -m "feat: add Craft From Inventory page component"
```

---

## Task 3: Wire route and navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add route to App.tsx**

Add import at the top with the other route imports:
```typescript
import CraftFromInventory from './routes/CraftFromInventory';
```

Add route after the `/cleanup` route:
```typescript
<Route path="/craft-from-inventory" element={<CraftFromInventory />} />
```

- [ ] **Step 2: Add nav link to Sidebar.tsx**

In the `NAV_GROUPS` array, in the "Tools" group (the one containing "Cleanup"), add after the Cleanup entry:
```typescript
{ label: 'Craft Inventory', path: '/craft-from-inventory' },
```

- [ ] **Step 3: Verify types compile and the app renders**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add route and nav for Craft From Inventory"
```

---

## Task 4: Discord `/craftable` command registration

**Files:**
- Modify: `scripts/register-commands.ts`

- [ ] **Step 1: Add the command to the commands array**

In `scripts/register-commands.ts`, add to the `commands` array after the `purge` entry:
```typescript
  {
    name: 'craftable',
    description: 'Qué puedes craftear con tu inventario',
    options: [{ type: 11, name: 'csv', description: 'Archivo CSV de inventario', required: true }],
  },
```

Type 11 = Attachment.

- [ ] **Step 2: Commit**

```bash
git add scripts/register-commands.ts
git commit -m "feat: register /craftable Discord command"
```

- [ ] **Step 3: Run registration**

```bash
npm run register-commands
```

Expected: `Registered 5 commands globally.`

---

## Task 5: Discord `/craftable` handler

**Files:**
- Modify: `src/api/discord.ts`

- [ ] **Step 1: Add /craftable handler in the command router**

In `src/api/discord.ts`, find the slash command routing section (where `commandName === 'oye'`, `commandName === 'craft'`, etc.) and add a new block:

```typescript
          } else if (commandName === 'craftable') {
            const attachment = interaction.data.resolved?.attachments;
            const attachmentId = interaction.data.options?.find((o: any) => o.name === 'csv')?.value;
            const file = attachment?.[attachmentId];
            if (!file?.url) {
              await editOriginalResponse(interaction.token, { content: 'No CSV file found.' });
              return;
            }

            // Download CSV from Discord CDN
            const csvRes = await fetch(file.url);
            if (!csvRes.ok) {
              await editOriginalResponse(interaction.token, { content: 'Failed to download CSV.' });
              return;
            }
            const csvText = await csvRes.text();

            // Parse inventory
            const { parseAllaganInventory } = await import('../bot/parseHelper');
            const parsed = parseAllaganInventory(csvText, snapshots.namesById);

            // Build inventory map
            const inv = new Map<number, number>();
            for (const e of parsed.entries) {
              if (e.itemId === 0) continue;
              inv.set(e.itemId, (inv.get(e.itemId) ?? 0) + e.qty);
            }

            // Find craftable recipes
            const { findCraftableFromInventory } = await import('../features/craftFromInventory/findCraftable');
            const vendorMap = snapshots.vendorMap;
            const gatheringSet = new Set(snapshots.gatheringCatalog.keys());
            const craftableRows = findCraftableFromInventory(inv, snapshots.recipes, snapshots.namesById, {
              maxMissing: 1,
              vendorMap,
              gatheringSet,
            });

            // Format top 10
            const top = craftableRows.slice(0, 10);
            if (top.length === 0) {
              await editOriginalResponse(interaction.token, {
                content: 'No hay nada que puedas craftear con tu inventario actual (max 1 ingrediente faltante).',
              });
              return;
            }

            const JOB_EMOJI: Record<string, string> = {
              CRP: '\u{1F6E0}', BSM: '\u2694', ARM: '\u{1F6E1}', GSM: '\u{1F48E}',
              LTW: '\u{1F9F5}', WVR: '\u{1F9F6}', ALC: '\u2697', CUL: '\u{1F373}',
            };
            let msg = '**What you can craft right now:**\n\n';
            for (const row of top) {
              const emoji = JOB_EMOJI[row.classJob] ?? '\u{1F528}';
              const pct = Math.round(row.completeness * 100);
              const status = pct === 100
                ? `${row.totalIngredients}/${row.totalIngredients} ingredients \u2713`
                : `${row.totalIngredients - row.missingCount}/${row.totalIngredients} ingredients`;
              msg += `${emoji} **${row.name}** (${row.classJob} ${row.recipeLevel}) — ${status}\n`;
              const missing = row.ingredients.filter(i => !i.fulfilled);
              if (missing.length > 0) {
                const parts = missing.map(i => {
                  const src = i.unitPrice != null ? ` (${i.source} ${i.unitPrice}g)` : i.source === 'gather' ? ' (gather)' : '';
                  return `${i.name} x${i.needed - i.have}${src}`;
                });
                msg += `  Missing: ${parts.join(', ')}\n`;
              }
            }

            if (craftableRows.length > 10) {
              msg += `\n_...and ${craftableRows.length - 10} more recipes._`;
            }

            await editOriginalResponse(interaction.token, { content: msg });
```

Note: `editOriginalResponse` is the existing helper function in the discord.ts file that PATCHes the deferred response. Check the file for the exact function name used.

Also note: the bot's `parseAllaganInventory` function is in `src/features/cleanup/parseAllaganInventory.ts`. The import path from `src/api/discord.ts` is `../features/cleanup/parseAllaganInventory`. Use dynamic import since this code path is only hit for `/craftable`.

- [ ] **Step 2: Rebuild API bundle**

```bash
npm run build:api
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/api/discord.ts api/discord.mjs
git commit -m "feat: add /craftable Discord command handler"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

All tests should pass including the new `findCraftable.test.ts`.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Verify in browser**

Start the dev server (`npm run dev`), navigate to `/craft-from-inventory`, paste a CSV, and confirm:
- CSV parses and shows item count
- Filters work (max missing slider, marketable toggle)
- Results table shows with completeness percentages
- Ingredient status shows green/red with source info
- Item names link to detail pages

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: craft-from-inventory final polish"
```
