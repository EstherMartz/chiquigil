# Planner Sales Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV sales import to the Crafting Plan page with auto-matching to plan items, duplicate detection, and a sales insights section with suggestions for untracked items.

**Architecture:** New `parseSalesCsv.ts` pure module handles parsing, dedup key generation, and name-matching. The planner store gains an `importCsv` mutation and `importedSaleKeys` persistence. Two new UI components (`SalesImport`, `SalesInsights`) slot into the existing `PlannerView` layout.

**Tech Stack:** React, Zustand (persist), Vitest, Tailwind CSS (Gilipichi design tokens)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/features/planner/parseSalesCsv.ts` | Create | Parse CSV text → typed rows, generate dedup keys, match against plan items |
| `src/features/planner/parseSalesCsv.test.ts` | Create | Unit tests for parsing, dedup, matching |
| `src/features/planner/plannerStats.ts` | Modify | Extend `LogEntry` with optional `retainer`, `source`, `csvName` fields |
| `src/features/planner/plannerStore.ts` | Modify | Add `importedSaleKeys`, `importCsv` mutation |
| `src/features/planner/plannerStore.test.ts` | Modify | Add tests for `importCsv` |
| `src/features/planner/SalesImport.tsx` | Create | File upload button + import result summary |
| `src/features/planner/SalesInsights.tsx` | Create | Recent sales table + unmatched-item suggestions |
| `src/features/planner/PlannerView.tsx` | Modify | Add SalesInsights section between Hero and lanes |
| `src/features/planner/HeroBlock.tsx` | Modify | Add SalesImport trigger in the log-gil form row |

---

### Task 1: CSV Parser — Types & Parsing

**Files:**
- Create: `src/features/planner/parseSalesCsv.ts`
- Create: `src/features/planner/parseSalesCsv.test.ts`

- [ ] **Step 1: Write failing tests for CSV parsing**

In `src/features/planner/parseSalesCsv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseSalesCsv, type ParsedSale } from './parseSalesCsv';

const SAMPLE_CSV = `Icon,Name,Quantity,Unit Price,World,Retainer,Sold At
,Open Book,1,89989,Phantom,El'jonah,24/05/2026 19:38:26
,Grade 4 Gemdraught of Dexterity,15,3997,Phantom,La'vane,24/05/2026 19:38:22
,Plain Hooded Tunic,1,2799998,Phantom,La'vane,24/05/2026 18:33:10`;

describe('parseSalesCsv', () => {
  it('parses well-formed CSV into typed rows', () => {
    const rows = parseSalesCsv(SAMPLE_CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual<ParsedSale>({
      name: 'Open Book',
      quantity: 1,
      unitPrice: 89989,
      world: 'Phantom',
      retainer: "El'jonah",
      soldAt: new Date(2026, 4, 24, 19, 38, 26).getTime(),
    });
  });

  it('parses quantity and price as integers', () => {
    const rows = parseSalesCsv(SAMPLE_CSV);
    expect(rows[1].quantity).toBe(15);
    expect(rows[1].unitPrice).toBe(3997);
  });

  it('returns empty array for empty input', () => {
    expect(parseSalesCsv('')).toEqual([]);
  });

  it('skips rows with missing name', () => {
    const csv = `Icon,Name,Quantity,Unit Price,World,Retainer,Sold At
,,1,100,Phantom,Ret,24/05/2026 10:00:00`;
    expect(parseSalesCsv(csv)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/planner/parseSalesCsv.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement parseSalesCsv**

In `src/features/planner/parseSalesCsv.ts`:

```ts
export interface ParsedSale {
  name: string;
  quantity: number;
  unitPrice: number;
  world: string;
  retainer: string;
  soldAt: number; // epoch ms
}

/**
 * Parse the DD/MM/YYYY HH:mm:ss format from the sales CSV into epoch ms.
 */
function parseSoldAt(raw: string): number {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  return new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss).getTime();
}

export function parseSalesCsv(text: string): ParsedSale[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const rows: ParsedSale[] = [];
  for (let i = 1; i < lines.length; i++) {
    // Simple CSV split — these CSVs have no quoted commas in fields
    const cols = lines[i].split(',');
    // Columns: Icon(0), Name(1), Quantity(2), UnitPrice(3), World(4), Retainer(5), SoldAt(6)
    const name = cols[1]?.trim() ?? '';
    if (!name) continue;
    const quantity = parseInt(cols[2] ?? '0', 10) || 0;
    const unitPrice = parseInt(cols[3] ?? '0', 10) || 0;
    const world = cols[4]?.trim() ?? '';
    const retainer = cols[5]?.trim() ?? '';
    const soldAt = parseSoldAt(cols[6] ?? '');
    if (!soldAt) continue;
    rows.push({ name, quantity, unitPrice, world, retainer, soldAt });
  }
  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/planner/parseSalesCsv.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/planner/parseSalesCsv.ts src/features/planner/parseSalesCsv.test.ts
git commit -m "feat(planner): add CSV sales parser with tests"
```

---

### Task 2: Dedup Key Generation & Matching

**Files:**
- Modify: `src/features/planner/parseSalesCsv.ts`
- Modify: `src/features/planner/parseSalesCsv.test.ts`

- [ ] **Step 1: Write failing tests for dedup and matching**

Append to `parseSalesCsv.test.ts`:

```ts
import { dedupKey, matchSalesToPlan } from './parseSalesCsv';
import type { PlanItem } from './seedPlanner';

describe('dedupKey', () => {
  it('produces a stable composite key', () => {
    const key = dedupKey({ name: 'Open Book', quantity: 1, unitPrice: 89989, soldAt: 1716576000000 } as ParsedSale);
    expect(key).toBe('open book|1|89989|1716576000000');
  });

  it('is case-insensitive on name', () => {
    const a = dedupKey({ name: 'OPEN BOOK', quantity: 1, unitPrice: 89989, soldAt: 100 } as ParsedSale);
    const b = dedupKey({ name: 'open book', quantity: 1, unitPrice: 89989, soldAt: 100 } as ParsedSale);
    expect(a).toBe(b);
  });
});

function mkItem(name: string, id = 'i1'): PlanItem {
  return { id, name, src: '', price: 0, perDay: 0, supply: null, active: true, earned: 0, units: 0 };
}

describe('matchSalesToPlan', () => {
  it('matches sale to plan item by case-insensitive name', () => {
    const items = [mkItem('Open Book', 'i1'), mkItem('Vanya Silk', 'i2')];
    const sale: ParsedSale = { name: 'open book', quantity: 1, unitPrice: 89989, world: 'Phantom', retainer: 'R', soldAt: 100 };
    const result = matchSalesToPlan([sale], items);
    expect(result[0].matchedItemId).toBe('i1');
  });

  it('returns undefined matchedItemId for unmatched sales', () => {
    const items = [mkItem('Open Book')];
    const sale: ParsedSale = { name: 'Zabuton Cushion', quantity: 1, unitPrice: 38899, world: 'Phantom', retainer: 'R', soldAt: 100 };
    const result = matchSalesToPlan([sale], items);
    expect(result[0].matchedItemId).toBeUndefined();
  });

  it('handles partial name match within plan item name (contains)', () => {
    const items = [mkItem('Grade 4 Gemdraughts (filler)')];
    const sale: ParsedSale = { name: 'Grade 4 Gemdraught of Dexterity', quantity: 15, unitPrice: 3997, world: 'Phantom', retainer: 'R', soldAt: 100 };
    // Exact match only — no fuzzy matching. This should NOT match.
    const result = matchSalesToPlan([sale], items);
    expect(result[0].matchedItemId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/planner/parseSalesCsv.test.ts`
Expected: FAIL — `dedupKey` and `matchSalesToPlan` not exported

- [ ] **Step 3: Implement dedupKey and matchSalesToPlan**

Add to `src/features/planner/parseSalesCsv.ts`:

```ts
import type { PlanItem } from './seedPlanner';

export function dedupKey(sale: ParsedSale): string {
  return `${sale.name.toLowerCase()}|${sale.quantity}|${sale.unitPrice}|${sale.soldAt}`;
}

export interface MatchedSale extends ParsedSale {
  matchedItemId?: string;
}

export function matchSalesToPlan(sales: ParsedSale[], planItems: PlanItem[]): MatchedSale[] {
  const nameMap = new Map<string, string>();
  for (const item of planItems) {
    nameMap.set(item.name.toLowerCase().trim(), item.id);
  }
  return sales.map((sale) => {
    const itemId = nameMap.get(sale.name.toLowerCase().trim());
    return { ...sale, matchedItemId: itemId };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/planner/parseSalesCsv.test.ts`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/planner/parseSalesCsv.ts src/features/planner/parseSalesCsv.test.ts
git commit -m "feat(planner): add dedup key generation and plan-item matching"
```

---

### Task 3: Extend LogEntry & Store with importCsv

**Files:**
- Modify: `src/features/planner/plannerStats.ts` (line 1-6, LogEntry type)
- Modify: `src/features/planner/plannerStore.ts` (add state + mutation)
- Modify: `src/features/planner/plannerStore.test.ts`

- [ ] **Step 1: Extend LogEntry type**

In `src/features/planner/plannerStats.ts`, replace the LogEntry interface (lines 1-6):

```ts
export interface LogEntry {
  ts: number;
  amount: number;
  note: string;
  itemId?: string;
  retainer?: string;
  source?: 'manual' | 'csv-import';
  csvName?: string;
}
```

- [ ] **Step 2: Write failing tests for importCsv**

Append to `src/features/planner/plannerStore.test.ts`:

```ts
import type { ParsedSale } from './parseSalesCsv';

describe('importCsv', () => {
  it('imports sales, matches to plan items, and updates treasury', () => {
    const item = usePlannerStore.getState().lanes.craft[0]; // Plain Hooded Tunic
    const sale: ParsedSale = {
      name: item.name,
      quantity: 1,
      unitPrice: 2_799_998,
      world: 'Phantom',
      retainer: "La'vane",
      soldAt: new Date('2026-05-24T18:33:10Z').getTime(),
    };
    const startCurrent = usePlannerStore.getState().goal.current;
    const result = usePlannerStore.getState().importCsv([sale]);
    expect(result).toEqual({ imported: 1, matched: 1, skipped: 0 });

    const s = usePlannerStore.getState();
    const updatedItem = s.lanes.craft.find((i) => i.id === item.id)!;
    expect(updatedItem.units).toBe(1);
    expect(updatedItem.earned).toBe(2_799_998);
    expect(s.goal.current).toBe(startCurrent + 2_799_998);
    expect(s.log[s.log.length - 1].source).toBe('csv-import');
    expect(s.log[s.log.length - 1].retainer).toBe("La'vane");
  });

  it('logs unmatched sales to treasury without itemId', () => {
    const sale: ParsedSale = {
      name: 'Zabuton Cushion',
      quantity: 1,
      unitPrice: 38_899,
      world: 'Phantom',
      retainer: "La'vane",
      soldAt: new Date('2026-05-24T00:03:49Z').getTime(),
    };
    const result = usePlannerStore.getState().importCsv([sale]);
    expect(result).toEqual({ imported: 1, matched: 0, skipped: 0 });
    const entry = usePlannerStore.getState().log[usePlannerStore.getState().log.length - 1];
    expect(entry.itemId).toBeUndefined();
    expect(entry.csvName).toBe('Zabuton Cushion');
    expect(entry.source).toBe('csv-import');
  });

  it('skips duplicate rows on re-import', () => {
    const sale: ParsedSale = {
      name: 'Open Book',
      quantity: 1,
      unitPrice: 89_989,
      world: 'Phantom',
      retainer: "El'jonah",
      soldAt: new Date('2026-05-24T19:38:26Z').getTime(),
    };
    usePlannerStore.getState().importCsv([sale]);
    const logAfterFirst = usePlannerStore.getState().log.length;
    const result = usePlannerStore.getState().importCsv([sale]);
    expect(result).toEqual({ imported: 0, matched: 0, skipped: 1 });
    expect(usePlannerStore.getState().log.length).toBe(logAfterFirst);
  });

  it('deduplicates within a single batch (same-file duplicates)', () => {
    const sale: ParsedSale = {
      name: 'Bamboo Copse',
      quantity: 1,
      unitPrice: 41_994,
      world: 'Phantom',
      retainer: "La'rosalia",
      soldAt: new Date('2026-05-24T12:12:23Z').getTime(),
    };
    const result = usePlannerStore.getState().importCsv([sale, sale]);
    expect(result).toEqual({ imported: 1, matched: 0, skipped: 1 });
  });

  it('handles quantity > 1 by multiplying unitPrice × quantity for total', () => {
    const item = usePlannerStore.getState().lanes.craft[0];
    const sale: ParsedSale = {
      name: item.name,
      quantity: 5,
      unitPrice: 100_000,
      world: 'Phantom',
      retainer: 'Ret',
      soldAt: new Date('2026-05-24T10:00:00Z').getTime(),
    };
    usePlannerStore.getState().importCsv([sale]);
    const updatedItem = usePlannerStore.getState().lanes.craft.find((i) => i.id === item.id)!;
    expect(updatedItem.units).toBe(5);
    expect(updatedItem.earned).toBe(500_000);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/planner/plannerStore.test.ts`
Expected: FAIL — `importCsv` does not exist on PlannerState

- [ ] **Step 4: Implement importCsv in the store**

In `src/features/planner/plannerStore.ts`:

Add import at top:
```ts
import { dedupKey, matchSalesToPlan, type ParsedSale } from './parseSalesCsv';
import { LANE_ORDER } from './seedPlanner';
```

Add to `PlannerState` interface:
```ts
  importedSaleKeys: string[];
  importCsv: (sales: ParsedSale[]) => { imported: number; matched: number; skipped: number };
```

Add to `defaultState` return:
```ts
  return { _v: 1, importedSaleKeys: [], ...s };
```

Add the mutation inside `persist((set, get) => ({`:
```ts
      importCsv: (sales) => {
        const state = get();
        const existingKeys = new Set(state.importedSaleKeys);
        const batchKeys = new Set<string>();
        const allPlanItems = LANE_ORDER.flatMap((lane) => state.lanes[lane]);
        const matched = matchSalesToPlan(sales, allPlanItems);

        let importedCount = 0;
        let matchedCount = 0;
        let skippedCount = 0;
        const newLogEntries: LogEntry[] = [];
        const newKeys: string[] = [];
        // Track item increments: itemId → { units, earned }
        const itemIncrements = new Map<string, { units: number; earned: number }>();
        let treasuryDelta = 0;

        for (const sale of matched) {
          const key = dedupKey(sale);
          if (existingKeys.has(key) || batchKeys.has(key)) {
            skippedCount++;
            continue;
          }
          batchKeys.add(key);
          const total = sale.quantity * sale.unitPrice;
          treasuryDelta += total;
          importedCount++;

          if (sale.matchedItemId) {
            matchedCount++;
            const prev = itemIncrements.get(sale.matchedItemId) ?? { units: 0, earned: 0 };
            prev.units += sale.quantity;
            prev.earned += total;
            itemIncrements.set(sale.matchedItemId, prev);
          }

          newLogEntries.push({
            ts: sale.soldAt,
            amount: total,
            note: sale.matchedItemId ? `${sale.name} (csv)` : sale.name,
            itemId: sale.matchedItemId,
            retainer: sale.retainer,
            source: 'csv-import',
            csvName: sale.matchedItemId ? undefined : sale.name,
          });
          newKeys.push(key);
        }

        if (importedCount === 0) return { imported: 0, matched: 0, skipped: skippedCount };

        set((s) => {
          const lanes = structuredCloneLanes(s.lanes);
          for (const [itemId, inc] of itemIncrements) {
            for (const lane of LANE_ORDER) {
              const it = lanes[lane].find((x) => x.id === itemId);
              if (it) {
                it.units += inc.units;
                it.earned += inc.earned;
                break;
              }
            }
          }
          return {
            lanes,
            goal: { ...s.goal, current: s.goal.current + treasuryDelta },
            log: [...s.log, ...newLogEntries],
            importedSaleKeys: [...s.importedSaleKeys, ...newKeys],
          };
        });

        return { imported: importedCount, matched: matchedCount, skipped: skippedCount };
      },
```

Note: Change the `persist` callback from `(set) =>` to `(set, get) =>` since `importCsv` needs `get()`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/planner/plannerStore.test.ts`
Expected: all tests PASS (existing + 5 new)

- [ ] **Step 6: Commit**

```bash
git add src/features/planner/plannerStats.ts src/features/planner/plannerStore.ts src/features/planner/plannerStore.test.ts
git commit -m "feat(planner): importCsv mutation with dedup and auto-matching"
```

---

### Task 4: SalesImport Component (Upload UI)

**Files:**
- Create: `src/features/planner/SalesImport.tsx`

- [ ] **Step 1: Create SalesImport component**

In `src/features/planner/SalesImport.tsx`:

```tsx
import { useRef, useState } from 'react';
import { usePlannerStore } from './plannerStore';
import { parseSalesCsv } from './parseSalesCsv';

export function SalesImport() {
  const importCsv = usePlannerStore((s) => s.importCsv);
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ imported: number; matched: number; skipped: number } | null>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = parseSalesCsv(text);
      const res = importCsv(rows);
      setResult(res);
    };
    reader.readAsText(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={onInputChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-3 py-2 hover:text-gold hover:border-gold transition-colors"
      >
        Import Sales CSV
      </button>
      {result && (
        <span className="font-mono text-[11px] text-text-low">
          {result.imported > 0 ? (
            <>
              <span className="text-jade">+{result.imported}</span> imported
              {result.matched > 0 && <>{' · '}<span className="text-gold">{result.matched}</span> matched</>}
              {result.skipped > 0 && <>{' · '}<span className="text-text-low">{result.skipped}</span> skipped</>}
            </>
          ) : result.skipped > 0 ? (
            <span>All {result.skipped} rows already imported</span>
          ) : (
            <span>No valid rows found</span>
          )}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/planner/SalesImport.tsx
git commit -m "feat(planner): SalesImport upload component"
```

---

### Task 5: SalesInsights Component (Table + Suggestions)

**Files:**
- Create: `src/features/planner/SalesInsights.tsx`

- [ ] **Step 1: Create SalesInsights component**

In `src/features/planner/SalesInsights.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { usePlannerStore } from './plannerStore';
import { fmt, type LogEntry } from './plannerStats';
import { LANE_ORDER } from './seedPlanner';
import { AddItemModal } from './AddItemModal';

export function SalesInsights() {
  const log = usePlannerStore((s) => s.log);
  const lanes = usePlannerStore((s) => s.lanes);
  const addItem = usePlannerStore((s) => s.addItem);

  const [addModal, setAddModal] = useState<{ name: string; price: number } | null>(null);

  const csvEntries = useMemo(
    () => log.filter((l) => l.source === 'csv-import').sort((a, b) => b.ts - a.ts),
    [log],
  );

  const suggestions = useMemo(() => {
    const unmatched = csvEntries.filter((l) => !l.itemId && l.csvName);
    const agg = new Map<string, { name: string; qty: number; total: number }>();
    for (const entry of unmatched) {
      const key = entry.csvName!.toLowerCase();
      const prev = agg.get(key) ?? { name: entry.csvName!, qty: 0, total: 0 };
      prev.qty += 1;
      prev.total += entry.amount;
      agg.set(key, prev);
    }
    return [...agg.values()].sort((a, b) => b.total - a.total);
  }, [csvEntries]);

  if (csvEntries.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-display text-xl text-text-cream tracking-wide">Sales Insights</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-border-base to-transparent" />
        <span className="font-mono text-[11px] text-text-low uppercase tracking-widest">
          {csvEntries.length} imported
        </span>
      </div>

      {suggestions.length > 0 && (
        <div>
          <div className="font-mono text-[11px] tracking-widest uppercase text-text-low mb-2">
            Unplanned sales — consider adding
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {suggestions.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between gap-2 border border-border-base bg-bg-card-hi/40 px-3 py-2"
              >
                <div>
                  <div className="font-mono text-sm text-text-cream">{s.name}</div>
                  <div className="font-mono text-[11px] text-text-low">
                    {s.qty}× sold · <span className="text-gold">{fmt(s.total)}</span> gil
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAddModal({ name: s.name, price: Math.round(s.total / s.qty) })}
                  className="font-mono text-[10px] tracking-widest uppercase text-gold border border-gold/30 px-2 py-1 hover:bg-gold/10 transition-colors shrink-0"
                >
                  + Plan
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="font-mono text-[11px] tracking-widest uppercase text-text-low mb-2">
          Recent sales
        </div>
        <div className="border border-border-base bg-bg-deep/40 max-h-[400px] overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="font-mono text-[10px] tracking-widest uppercase text-text-low border-b border-border-base sticky top-0 bg-bg-deep">
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Retainer</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {csvEntries.map((entry, i) => (
                <SaleRow key={`${entry.ts}-${i}`} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addModal && (
        <AddItemModal
          lane="craft"
          onAdd={(partial) => addItem('craft', partial)}
          onClose={() => setAddModal(null)}
          prefill={{ name: addModal.name, price: addModal.price }}
        />
      )}
    </div>
  );
}

function SaleRow({ entry }: { entry: LogEntry }) {
  const d = new Date(entry.ts);
  const ds =
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const isPlanned = !!entry.itemId;

  return (
    <tr className="font-mono text-xs border-b border-border-base/50 last:border-b-0 hover:bg-bg-card-hi/30 transition-colors">
      <td className="px-3 py-2 text-text-cream">{entry.csvName ?? entry.note}</td>
      <td className="px-3 py-2 text-right text-text-dim">—</td>
      <td className="px-3 py-2 text-right text-gold">{fmt(entry.amount)}</td>
      <td className="px-3 py-2 text-text-dim">{entry.retainer ?? '—'}</td>
      <td className="px-3 py-2 text-text-low">{ds}</td>
      <td className="px-3 py-2">
        {isPlanned ? (
          <span className="text-jade bg-jade/10 border border-jade/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
            Planned
          </span>
        ) : (
          <span className="text-aether bg-aether/10 border border-aether/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
            Unplanned
          </span>
        )}
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Add prefill support to AddItemModal**

In `src/features/planner/AddItemModal.tsx`, add an optional `prefill` prop:

Change the `Props` interface to:
```ts
interface Props {
  lane: LaneKey;
  onAdd: (partial: { name: string; src: string; price: number; perDay: number; supply: number | null }) => void;
  onClose: () => void;
  prefill?: { name: string; price: number };
}
```

Change the component signature and initial state:
```ts
export function AddItemModal({ lane, onAdd, onClose, prefill }: Props) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [src, setSrc] = useState('');
  const [price, setPrice] = useState(prefill?.price ? String(prefill.price) : '');
  const [perDay, setPerDay] = useState('');
  const [supply, setSupply] = useState('');
```

- [ ] **Step 3: Commit**

```bash
git add src/features/planner/SalesInsights.tsx src/features/planner/AddItemModal.tsx
git commit -m "feat(planner): SalesInsights component with suggestions and prefill support"
```

---

### Task 6: Wire into PlannerView and HeroBlock

**Files:**
- Modify: `src/features/planner/HeroBlock.tsx`
- Modify: `src/features/planner/PlannerView.tsx`

- [ ] **Step 1: Add SalesImport to HeroBlock**

In `src/features/planner/HeroBlock.tsx`, add import at top:
```ts
import { SalesImport } from './SalesImport';
```

Insert `<SalesImport />` inside the form, after the "Ledger" button and before the "edit goal" button. Replace the `ml-auto` button group area:

Find the `<button` with text "Ledger" (around line 130-135) and add after it:
```tsx
        <SalesImport />
```

- [ ] **Step 2: Add SalesInsights to PlannerView**

In `src/features/planner/PlannerView.tsx`, add import:
```ts
import { SalesInsights } from './SalesInsights';
```

Insert `<SalesInsights />` between `<HeroBlock />` and the "The Plan" section (after line 29, before the plan `<div>`):

```tsx
      <SalesInsights />
```

- [ ] **Step 3: Run the dev server and verify manually**

Run: `npm run dev`
- Navigate to Crafting Plan page
- Upload the sample CSV file
- Verify: import summary shows counts
- Verify: Sales Insights section appears with table and suggestions
- Verify: Planned/Unplanned badges display correctly
- Verify: "+ Plan" button on suggestions opens AddItemModal with pre-filled name/price

- [ ] **Step 4: Commit**

```bash
git add src/features/planner/HeroBlock.tsx src/features/planner/PlannerView.tsx
git commit -m "feat(planner): wire SalesImport and SalesInsights into page layout"
```

---

### Task 7: Run Full Test Suite & Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all planner tests**

Run: `npx vitest run src/features/planner/`
Expected: all tests PASS

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: no regressions

- [ ] **Step 3: Final commit if any fixes needed**

If any test fixes were needed, commit them:
```bash
git add -A
git commit -m "fix(planner): test fixes for sales import integration"
```
