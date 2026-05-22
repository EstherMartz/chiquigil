# Market Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a treemap visualization of market activity where cell size = velocity, cell color = profit margin (craftable) or velocity intensity (non-craftable), with "Top Movers" and "By Category" browsing modes.

**Architecture:** A new `/heatmap` route renders a scan-style view (mode toggle + run button) that fetches Universalis data, computes margin for craftable items, and renders a squarified treemap as positioned `<div>`s. Pure functions for layout and data transform are unit-tested independently.

**Tech Stack:** React, React Router, TanStack Query (useMutation), Universalis API, existing item/recipe snapshots.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/features/heatmap/squarify.ts` | Squarified treemap layout algorithm |
| `src/features/heatmap/squarify.test.ts` | Layout tests |
| `src/features/heatmap/buildHeatmapData.ts` | Transform market+recipe data into cell descriptors |
| `src/features/heatmap/buildHeatmapData.test.ts` | Data pipeline tests |
| `src/features/heatmap/HeatmapChart.tsx` | Treemap renderer (positioned divs) |
| `src/features/heatmap/HeatmapView.tsx` | Main view: mode toggle, category picker, run button, results |
| `src/routes/Heatmap.tsx` | Route wrapper |
| `src/App.tsx` | Register route |
| `src/components/layout/Header.tsx` | Add nav link |

---

### Task 1: Squarify layout algorithm

**Files:**
- Create: `src/features/heatmap/squarify.ts`
- Create: `src/features/heatmap/squarify.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/features/heatmap/squarify.test.ts
import { describe, it, expect } from 'vitest';
import { squarify, type SquarifyInput, type SquarifyRect } from './squarify';

describe('squarify', () => {
  it('returns empty array for empty input', () => {
    expect(squarify([], 800, 600)).toEqual([]);
  });

  it('single item fills the entire container', () => {
    const rects = squarify([{ id: 1, area: 100 }], 800, 600);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ id: 1, x: 0, y: 0, w: 800, h: 600 });
  });

  it('total area of rects equals container area', () => {
    const items: SquarifyInput[] = [
      { id: 1, area: 60 },
      { id: 2, area: 30 },
      { id: 3, area: 10 },
    ];
    const rects = squarify(items, 800, 600);
    const totalArea = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    expect(totalArea).toBeCloseTo(800 * 600, 0);
  });

  it('no rects overlap', () => {
    const items: SquarifyInput[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      area: 100 - i * 8,
    }));
    const rects = squarify(items, 800, 600);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
        const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlapX && overlapY, `rects ${a.id} and ${b.id} overlap`).toBe(false);
      }
    }
  });

  it('all rects are inside the container', () => {
    const items: SquarifyInput[] = [
      { id: 1, area: 50 },
      { id: 2, area: 30 },
      { id: 3, area: 20 },
    ];
    const rects = squarify(items, 800, 600);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(800 + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(600 + 0.01);
    }
  });

  it('preserves all input IDs', () => {
    const items: SquarifyInput[] = [
      { id: 10, area: 40 },
      { id: 20, area: 30 },
      { id: 30, area: 20 },
      { id: 40, area: 10 },
    ];
    const rects = squarify(items, 800, 600);
    expect(rects.map((r) => r.id).sort()).toEqual([10, 20, 30, 40]);
  });

  it('skips items with zero or negative area', () => {
    const items: SquarifyInput[] = [
      { id: 1, area: 50 },
      { id: 2, area: 0 },
      { id: 3, area: -5 },
    ];
    const rects = squarify(items, 800, 600);
    expect(rects).toHaveLength(1);
    expect(rects[0].id).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/heatmap/squarify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement squarify**

```ts
// src/features/heatmap/squarify.ts
export interface SquarifyInput {
  id: number;
  area: number;
}

export interface SquarifyRect {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap layout. Returns positioned rectangles that fill
 * the container (width × height) with areas proportional to input.
 */
export function squarify(
  items: SquarifyInput[],
  width: number,
  height: number,
): SquarifyRect[] {
  const valid = items.filter((i) => i.area > 0);
  if (valid.length === 0) return [];

  const totalArea = valid.reduce((s, i) => s + i.area, 0);
  const containerArea = width * height;
  // Normalize areas so they sum to containerArea.
  const sorted = valid
    .map((i) => ({ id: i.id, area: (i.area / totalArea) * containerArea }))
    .sort((a, b) => b.area - a.area);

  const rects: SquarifyRect[] = [];
  layoutStrip(sorted, 0, 0, width, height, rects);
  return rects;
}

function layoutStrip(
  items: { id: number; area: number }[],
  x: number,
  y: number,
  w: number,
  h: number,
  out: SquarifyRect[],
): void {
  if (items.length === 0) return;
  if (items.length === 1) {
    out.push({ id: items[0].id, x, y, w, h });
    return;
  }

  const totalArea = items.reduce((s, i) => s + i.area, 0);
  const horizontal = w >= h;

  // Greedily add items to the current row until the worst aspect ratio
  // would increase.
  let rowArea = 0;
  let bestWorst = Infinity;
  let split = 1;

  for (let i = 0; i < items.length; i++) {
    rowArea += items[i].area;
    const worst = worstAspect(items.slice(0, i + 1), rowArea, horizontal ? h : w, totalArea, horizontal ? w : h);
    if (worst <= bestWorst) {
      bestWorst = worst;
      split = i + 1;
    } else {
      break;
    }
  }

  // Lay out the row.
  const rowItems = items.slice(0, split);
  const restItems = items.slice(split);
  const rowTotal = rowItems.reduce((s, i) => s + i.area, 0);

  if (horizontal) {
    const rowW = (rowTotal / totalArea) * w;
    let cy = y;
    for (const item of rowItems) {
      const cellH = (item.area / rowTotal) * h;
      out.push({ id: item.id, x, y: cy, w: rowW, h: cellH });
      cy += cellH;
    }
    layoutStrip(restItems, x + rowW, y, w - rowW, h, out);
  } else {
    const rowH = (rowTotal / totalArea) * h;
    let cx = x;
    for (const item of rowItems) {
      const cellW = (item.area / rowTotal) * w;
      out.push({ id: item.id, x: cx, y, w: cellW, h: rowH });
      cx += cellW;
    }
    layoutStrip(restItems, x, y + rowH, w, h - rowH, out);
  }
}

function worstAspect(
  row: { area: number }[],
  rowArea: number,
  side: number,
  totalArea: number,
  fullSide: number,
): number {
  const stripLen = (rowArea / totalArea) * fullSide;
  if (stripLen === 0) return Infinity;
  let worst = 0;
  for (const item of row) {
    const cellSide = (item.area / rowArea) * side;
    const aspect = cellSide > stripLen ? cellSide / stripLen : stripLen / cellSide;
    if (aspect > worst) worst = aspect;
  }
  return worst;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/heatmap/squarify.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/heatmap/squarify.ts src/features/heatmap/squarify.test.ts
git commit -m "feat(heatmap): squarified treemap layout algorithm"
```

---

### Task 2: Build heatmap data pipeline

**Files:**
- Create: `src/features/heatmap/buildHeatmapData.ts`
- Create: `src/features/heatmap/buildHeatmapData.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/features/heatmap/buildHeatmapData.test.ts
import { describe, it, expect } from 'vitest';
import { buildHeatmapCells, type HeatmapCell } from './buildHeatmapData';
import type { MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { Recipe } from '../../lib/recipes';

function mkMarket(overrides: Partial<MarketItem> = {}): MarketItem {
  return {
    minNQ: 1000, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: 1000, medianHQ: null,
    recentSalesNQ: 10, recentSalesHQ: 0,
    velocity: 2, lastUploadTime: 0, listingCount: 5,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...overrides,
  };
}

function mkItem(id: number, name: string, sc = 7): SnapshotItem {
  return { id, name, sc, ui: 0, ilvl: 1, canHq: false };
}

describe('buildHeatmapCells', () => {
  it('returns cell with velocity as area', () => {
    const items = [mkItem(100, 'Iron Ore')];
    const market = { '100': mkMarket({ velocity: 5.5 }) };
    const cells = buildHeatmapCells(items, market, new Map());
    expect(cells).toHaveLength(1);
    expect(cells[0].area).toBe(5.5);
    expect(cells[0].name).toBe('Iron Ore');
  });

  it('filters out items with no market data', () => {
    const items = [mkItem(100, 'Iron Ore')];
    const cells = buildHeatmapCells(items, {}, new Map());
    expect(cells).toEqual([]);
  });

  it('filters out items with velocity below threshold', () => {
    const items = [mkItem(100, 'Iron Ore')];
    const market = { '100': mkMarket({ velocity: 0.05 }) };
    const cells = buildHeatmapCells(items, market, new Map());
    expect(cells).toEqual([]);
  });

  it('computes margin for craftable items', () => {
    const items = [mkItem(200, 'Iron Ingot')];
    const market = {
      '200': mkMarket({ medianNQ: 500, velocity: 3 }),
      '100': mkMarket({ minNQ: 100 }),
    };
    const recipes = new Map<number, Recipe>([
      [200, { itemResultId: 200, classJob: 'BSM', recipeLevel: 10, ingredients: [{ itemId: 100, amount: 3 }] }],
    ]);
    const cells = buildHeatmapCells(items, market, recipes);
    expect(cells).toHaveLength(1);
    // margin = (500 - 300) / 500 = 0.4
    expect(cells[0].margin).toBeCloseTo(0.4);
    expect(cells[0].craftable).toBe(true);
  });

  it('sets margin to null for non-craftable items', () => {
    const items = [mkItem(100, 'Iron Ore')];
    const market = { '100': mkMarket({ velocity: 2 }) };
    const cells = buildHeatmapCells(items, market, new Map());
    expect(cells[0].margin).toBeNull();
    expect(cells[0].craftable).toBe(false);
  });

  it('handles recipe with missing ingredient prices gracefully', () => {
    const items = [mkItem(200, 'Iron Ingot')];
    const market = {
      '200': mkMarket({ medianNQ: 500, velocity: 3 }),
      // ingredient 100 NOT in market data
    };
    const recipes = new Map<number, Recipe>([
      [200, { itemResultId: 200, classJob: 'BSM', recipeLevel: 10, ingredients: [{ itemId: 100, amount: 3 }] }],
    ]);
    const cells = buildHeatmapCells(items, market, recipes);
    // Can't compute margin without ingredient prices — treat as non-craftable
    expect(cells[0].margin).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/heatmap/buildHeatmapData.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement buildHeatmapData**

```ts
// src/features/heatmap/buildHeatmapData.ts
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { Recipe } from '../../lib/recipes';

const MIN_VELOCITY = 0.1;

export interface HeatmapCell {
  id: number;
  name: string;
  area: number;         // velocity
  salePrice: number;
  velocity: number;
  margin: number | null; // null = non-craftable or can't compute
  craftable: boolean;
}

function salePrice(m: MarketItem): number {
  return m.medianNQ ?? m.medianHQ ?? m.minNQ ?? m.minHQ ?? 0;
}

function ingredientCost(recipe: Recipe, market: MarketData): number | null {
  let total = 0;
  for (const ing of recipe.ingredients) {
    const m = market[String(ing.itemId)];
    if (!m) return null;
    const price = m.minNQ ?? m.minHQ ?? 0;
    if (price === 0) return null;
    total += price * ing.amount;
  }
  return total;
}

export function buildHeatmapCells(
  items: SnapshotItem[],
  market: MarketData,
  recipes: Map<number, Recipe>,
): HeatmapCell[] {
  const out: HeatmapCell[] = [];
  for (const item of items) {
    const m = market[String(item.id)];
    if (!m || m.velocity < MIN_VELOCITY) continue;
    const price = salePrice(m);
    if (price <= 0) continue;

    const recipe = recipes.get(item.id);
    let margin: number | null = null;
    let craftable = false;
    if (recipe) {
      const matCost = ingredientCost(recipe, market);
      if (matCost != null && matCost > 0) {
        margin = (price - matCost) / price;
        craftable = true;
      }
    }

    out.push({
      id: item.id,
      name: item.name,
      area: m.velocity,
      salePrice: price,
      velocity: m.velocity,
      margin,
      craftable,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/heatmap/buildHeatmapData.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/heatmap/buildHeatmapData.ts src/features/heatmap/buildHeatmapData.test.ts
git commit -m "feat(heatmap): data pipeline — cells with margin and velocity"
```

---

### Task 3: Treemap chart renderer

**Files:**
- Create: `src/features/heatmap/HeatmapChart.tsx`

- [ ] **Step 1: Implement the chart component**

```tsx
// src/features/heatmap/HeatmapChart.tsx
import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { squarify } from './squarify';
import type { HeatmapCell } from './buildHeatmapData';
import { fmtGil } from '../../lib/format';

const CHART_HEIGHT = 520;

function marginColor(margin: number): string {
  // red (≤0%) → yellow (~25%) → green (≥50%)
  const clamped = Math.max(0, Math.min(1, (margin + 0.1) / 0.6));
  if (clamped < 0.5) {
    // red → yellow
    const t = clamped * 2;
    const r = 200;
    const g = Math.round(80 + t * 140);
    const b = Math.round(40 + t * 10);
    return `rgb(${r},${g},${b})`;
  }
  // yellow → green
  const t = (clamped - 0.5) * 2;
  const r = Math.round(200 - t * 140);
  const g = Math.round(220 - t * 30);
  const b = Math.round(50 + t * 50);
  return `rgb(${r},${g},${b})`;
}

function velocityColor(velocity: number, maxVelocity: number): string {
  const t = maxVelocity > 0 ? Math.min(1, velocity / maxVelocity) : 0;
  const r = Math.round(60 + t * 10);
  const g = Math.round(80 + t * 40);
  const b = Math.round(120 + t * 100);
  return `rgb(${r},${g},${b})`;
}

export function HeatmapChart({ cells }: { cells: HeatmapCell[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const maxVelocity = useMemo(() => Math.max(...cells.map((c) => c.velocity), 1), [cells]);

  const rects = useMemo(() => {
    const w = containerRef.current?.clientWidth ?? 900;
    return squarify(
      cells.map((c) => ({ id: c.id, area: c.area })),
      w,
      CHART_HEIGHT,
    );
  }, [cells]);

  // Build a lookup for cell data by id.
  const cellById = useMemo(() => {
    const m = new Map<number, HeatmapCell>();
    for (const c of cells) m.set(c.id, c);
    return m;
  }, [cells]);

  return (
    <div
      ref={containerRef}
      className="relative border border-border-base bg-bg-deep overflow-hidden"
      style={{ height: CHART_HEIGHT }}
    >
      {rects.map((r) => {
        const cell = cellById.get(r.id);
        if (!cell) return null;
        const bg = cell.craftable && cell.margin != null
          ? marginColor(cell.margin)
          : velocityColor(cell.velocity, maxVelocity);
        const showLabel = r.w > 50 && r.h > 28;
        const showPrice = r.w > 70 && r.h > 44;
        return (
          <div
            key={r.id}
            className="absolute cursor-pointer border border-bg-deep/40 overflow-hidden flex flex-col justify-center px-1.5 hover:brightness-125 transition-[filter]"
            style={{
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              backgroundColor: bg,
            }}
            onClick={() => navigate(`/item/${r.id}`)}
            title={`${cell.name}\n${fmtGil(cell.salePrice)} · ${cell.velocity.toFixed(1)}/day${cell.margin != null ? ` · ${(cell.margin * 100).toFixed(0)}% margin` : ''}`}
          >
            {showLabel && (
              <span className="text-[10px] font-mono leading-tight text-white/90 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                {cell.name}
              </span>
            )}
            {showPrice && (
              <span className="text-[9px] font-mono text-white/60 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                {fmtGil(cell.salePrice)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/heatmap/HeatmapChart.tsx
git commit -m "feat(heatmap): treemap chart renderer with color-coded cells"
```

---

### Task 4: Heatmap view with mode toggle and scan

**Files:**
- Create: `src/features/heatmap/HeatmapView.tsx`

- [ ] **Step 1: Implement the view component**

```tsx
// src/features/heatmap/HeatmapView.tsx
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData, type MarketItem } from '../../lib/universalis';
import { buildHeatmapCells, type HeatmapCell } from './buildHeatmapData';
import { HeatmapChart } from './HeatmapChart';
import { ITEM_SEARCH_CATEGORIES, type ItemSearchCategoryEntry } from '../../lib/itemSearchCategories';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

type HeatmapMode = 'topMovers' | 'category';

const TOP_MOVERS_LIMIT = 200;

const GROUPS: ItemSearchCategoryEntry['group'][] = [
  'Medicines & Meals', 'Materials', 'Armor', 'Weapons', 'Accessories', 'Tools', 'Housing', 'Other',
];

interface RunResult {
  cells: HeatmapCell[];
  skipped: number;
}

export function HeatmapView() {
  const { world, hideCrystals } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot();

  const [mode, setMode] = useState<HeatmapMode>('topMovers');
  const [group, setGroup] = useState<ItemSearchCategoryEntry['group']>('Medicines & Meals');

  const groupCategoryIds = useMemo(() => {
    return new Set(ITEM_SEARCH_CATEGORIES.filter((c) => c.group === group).map((c) => c.id));
  }, [group]);

  const candidateItems = useMemo(() => {
    if (!snapshot.data) return [];
    return snapshot.data.items.filter((item) => {
      if (item.sc === 0) return false; // not tradeable
      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) return false;
      if (mode === 'category' && !groupCategoryIds.has(item.sc)) return false;
      return true;
    });
  }, [snapshot.data, mode, groupCategoryIds, hideCrystals]);

  const candidateIds = useMemo(() => candidateItems.map((i) => i.id), [candidateItems]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !recipes.data) throw new Error('Snapshots not ready');
      // Fetch market data for all candidates.
      const sale = await fetchInBatches<MarketItem>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      // For craftable items, also fetch ingredient prices.
      const ingredientIds = new Set<number>();
      for (const item of candidateItems) {
        const recipe = recipes.data.get(item.id);
        if (recipe) {
          for (const ing of recipe.ingredients) {
            if (!(String(ing.itemId) in sale.data)) ingredientIds.add(ing.itemId);
          }
        }
      }
      let skipped = sale.errors.length;
      if (ingredientIds.size > 0) {
        const ingResult = await fetchInBatches<MarketItem>(
          [...ingredientIds],
          (chunk) => fetchMarketData(world, chunk),
          { chunkSize: 100, concurrency: 4 },
        );
        Object.assign(sale.data, ingResult.data);
        skipped += ingResult.errors.length;
      }

      let cells = buildHeatmapCells(candidateItems, sale.data, recipes.data);
      // For top movers, sort by velocity and take the top N.
      if (mode === 'topMovers') {
        cells.sort((a, b) => b.velocity - a.velocity);
        cells = cells.slice(0, TOP_MOVERS_LIMIT);
      }
      return { cells, skipped };
    },
  });

  const notReady = !snapshot.data || !recipes.data;

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
        <div className="flex gap-2">
          {(['topMovers', 'category'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
                mode === m ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              {m === 'topMovers' ? 'Top movers' : 'By category'}
            </button>
          ))}
        </div>

        {mode === 'category' && (
          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Group</span>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as ItemSearchCategoryEntry['group'])}
              className="mt-1 block bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
            >
              {GROUPS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={() => { run.reset(); run.mutate(); }}
          disabled={run.isPending || notReady}
          title={notReady ? 'Loading catalogs…' : undefined}
          className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {run.isPending ? 'Scanning…' : 'Run scan'}
        </button>
      </div>

      {/* Status line */}
      <div className="font-mono text-[10px] text-text-low">
        {notReady
          ? 'Loading catalogs…'
          : `${candidateIds.length.toLocaleString()} candidate items`}
        {run.data && <> · {run.data.cells.length.toLocaleString()} results</>}
      </div>

      {/* Loading / error */}
      {run.isPending && <Spinner label={`Fetching ${world} prices for ${candidateIds.length} items…`} />}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}
      {run.data && run.data.skipped > 0 && (
        <StatusBanner kind="error">{run.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {/* Legend */}
      {run.data && run.data.cells.length > 0 && (
        <>
          <div className="flex items-center gap-4 font-mono text-[10px] text-text-low">
            <span>Size = velocity</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3" style={{ backgroundColor: 'rgb(200,80,40)' }} /> low margin
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3" style={{ backgroundColor: 'rgb(200,220,50)' }} /> mid
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3" style={{ backgroundColor: 'rgb(60,190,100)' }} /> high margin
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3" style={{ backgroundColor: 'rgb(70,120,220)' }} /> non-craftable
            </span>
          </div>
          <HeatmapChart cells={run.data.cells} />
        </>
      )}

      {/* Empty state */}
      {run.data && run.data.cells.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-center text-text-low text-sm italic">
          No items with market activity found.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/heatmap/HeatmapView.tsx
git commit -m "feat(heatmap): main view with mode toggle, category picker, scan"
```

---

### Task 5: Route, nav link, and wiring

**Files:**
- Create: `src/routes/Heatmap.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Create the route wrapper**

```tsx
// src/routes/Heatmap.tsx
import { HeatmapView } from '../features/heatmap/HeatmapView';

export default function Heatmap() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Market Heatmap</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Treemap of market activity. Size = sales velocity, color = profit margin (craftable) or velocity (non-craftable).
        </p>
      </div>
      <HeatmapView />
    </div>
  );
}
```

- [ ] **Step 2: Register the route in App.tsx**

Add import at the top of `src/App.tsx`:
```tsx
import Heatmap from './routes/Heatmap';
```

Add route before the `/item/:id` route:
```tsx
<Route path="/heatmap" element={<Heatmap />} />
```

- [ ] **Step 3: Add nav link in Header.tsx**

In `src/components/layout/Header.tsx`, add after the Quest items link:
```tsx
<NavLink to="/heatmap" className={navClass}>Heatmap</NavLink>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: all tests pass (existing + new squarify + buildHeatmapData tests).

- [ ] **Step 6: Commit**

```bash
git add src/routes/Heatmap.tsx src/App.tsx src/components/layout/Header.tsx
git commit -m "feat(heatmap): route, nav link, and page wiring"
```

---

### Task 6: Layout responsiveness fix

The `HeatmapChart` uses `containerRef.current?.clientWidth` inside `useMemo`, but the ref isn't populated on first render. Fix this with a resize-aware approach.

**Files:**
- Modify: `src/features/heatmap/HeatmapChart.tsx`

- [ ] **Step 1: Add width state with ResizeObserver**

Replace the `containerRef` and `rects` useMemo in `HeatmapChart.tsx` with:

```tsx
export function HeatmapChart({ cells }: { cells: HeatmapCell[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const navigate = useNavigate();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxVelocity = useMemo(() => Math.max(...cells.map((c) => c.velocity), 1), [cells]);

  const rects = useMemo(
    () => squarify(cells.map((c) => ({ id: c.id, area: c.area })), containerWidth, CHART_HEIGHT),
    [cells, containerWidth],
  );
```

Add `useEffect` and `useState` to the imports at the top:
```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/heatmap/HeatmapChart.tsx
git commit -m "fix(heatmap): use ResizeObserver for responsive treemap width"
```
