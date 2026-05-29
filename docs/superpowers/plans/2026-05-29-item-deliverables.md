# Item Deliverables (Turn-Ins) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the item detail page, show whether the item is a required turn-in across Grand Company Supply, Levequests, and quests (with best-effort crafter/gatherer class-quest tagging).

**Architecture:** Two new pure reverse-index builders over the already-fetched GC-supply and Leve snapshots (mirroring `usedInIndex.ts`), exposed via cached hooks (mirroring `useUsedInIndex.ts`); the Garland per-item doc already loaded on the page is extended to surface its `usedInQuest` turn-in array. A new presentational `DeliverablesBlock` renders up to three independently-optional sub-blocks.

**Tech Stack:** React + Vite, TypeScript, `@tanstack/react-query`, Vitest, Tailwind. Data: Teamcraft `gc-supply.json`, XIVAPI v2 `Leve`/`CraftLeve`, Garland Tools per-item doc.

**Spec:** `docs/superpowers/specs/2026-05-29-item-deliverables-design.md`

**Test command:** `npx vitest run <path>` (single-run). Lint: `npm run lint`.

---

### Task 1: GC Supply reverse index

**Files:**
- Create: `src/lib/gcSupplyUsedInIndex.ts`
- Test: `src/lib/gcSupplyUsedInIndex.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/gcSupplyUsedInIndex.test.ts
import { describe, it, expect } from 'vitest';
import { buildGcSupplyUsedInIndex } from './gcSupplyUsedInIndex';
import type { SnapshotQuest } from './questSnapshot';

const quests: SnapshotQuest[] = [
  {
    questId: 4008, questName: 'GC Supply Lv.40', categoryName: 'BSM', level: 40,
    requiredItems: [
      { itemId: 100, itemName: '', qty: 1 },
      { itemId: 200, itemName: '', qty: 3 },
    ],
  },
  {
    questId: 5009, questName: 'GC Supply Lv.50', categoryName: 'GSM', level: 50,
    requiredItems: [{ itemId: 100, itemName: '', qty: 2 }],
  },
];

describe('buildGcSupplyUsedInIndex', () => {
  it('maps each required item id to its turn-in entries', () => {
    const idx = buildGcSupplyUsedInIndex(quests);
    expect(idx.get(100)).toEqual([
      { level: 40, categoryName: 'BSM', qty: 1 },
      { level: 50, categoryName: 'GSM', qty: 2 },
    ]);
    expect(idx.get(200)).toEqual([{ level: 40, categoryName: 'BSM', qty: 3 }]);
  });

  it('returns an empty map for no quests', () => {
    expect(buildGcSupplyUsedInIndex([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gcSupplyUsedInIndex.test.ts`
Expected: FAIL — `buildGcSupplyUsedInIndex` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/gcSupplyUsedInIndex.ts
import type { SnapshotQuest } from './questSnapshot';

export interface GcSupplyUsedInEntry {
  level: number;
  categoryName: string;
  qty: number;
}

/** Reverse index: itemId → Grand Company Supply turn-ins requiring it. */
export type GcSupplyUsedInIndex = Map<number, GcSupplyUsedInEntry[]>;

export function buildGcSupplyUsedInIndex(quests: SnapshotQuest[]): GcSupplyUsedInIndex {
  const out: GcSupplyUsedInIndex = new Map();
  for (const quest of quests) {
    for (const req of quest.requiredItems) {
      const entry: GcSupplyUsedInEntry = {
        level: quest.level,
        categoryName: quest.categoryName,
        qty: req.qty,
      };
      const list = out.get(req.itemId);
      if (list) list.push(entry);
      else out.set(req.itemId, [entry]);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gcSupplyUsedInIndex.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gcSupplyUsedInIndex.ts src/lib/gcSupplyUsedInIndex.test.ts
git commit -m "feat: add GC supply reverse index for item turn-ins"
```

---

### Task 2: Leve reverse index

**Files:**
- Create: `src/lib/leveUsedInIndex.ts`
- Test: `src/lib/leveUsedInIndex.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/leveUsedInIndex.test.ts
import { describe, it, expect } from 'vitest';
import { buildLeveUsedInIndex } from './leveUsedInIndex';
import type { SnapshotLeve } from './leveSnapshot';

function leve(over: Partial<SnapshotLeve>): SnapshotLeve {
  return {
    id: 1, name: 'L', level: 20, type: 'doh', classJob: 15, city: 'X',
    baseGil: 0, baseExp: 0, hqGilMultiplier: 2, targetItemId: null, targetItemQty: null,
    ...over,
  };
}

describe('buildLeveUsedInIndex', () => {
  it('indexes only leves with a target item, mapping target id to entries', () => {
    const leves = [
      leve({ id: 100, name: 'Bake Sale', classJob: 15, level: 20, type: 'doh', targetItemId: 500, targetItemQty: 3 }),
      leve({ id: 101, name: 'No Target', targetItemId: null }),
      leve({ id: 102, name: 'Forge Ahead', classJob: 9, level: 50, type: 'doh', targetItemId: 500, targetItemQty: 1 }),
    ];
    const idx = buildLeveUsedInIndex(leves);
    expect(idx.get(500)).toEqual([
      { leveId: 100, name: 'Bake Sale', level: 20, type: 'doh', jobCode: 'CUL', qty: 3 },
      { leveId: 102, name: 'Forge Ahead', level: 50, type: 'doh', jobCode: 'BSM', qty: 1 },
    ]);
    expect(idx.size).toBe(1);
  });

  it('defaults qty to 1 when targetItemQty is null', () => {
    const idx = buildLeveUsedInIndex([
      leve({ id: 1, targetItemId: 7, targetItemQty: null }),
    ]);
    expect(idx.get(7)?.[0].qty).toBe(1);
  });

  it('returns an empty map for no leves', () => {
    expect(buildLeveUsedInIndex([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/leveUsedInIndex.test.ts`
Expected: FAIL — `buildLeveUsedInIndex` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/leveUsedInIndex.ts
import type { SnapshotLeve } from './leveSnapshot';

const CLASS_JOB_TO_CODE: Record<number, string> = {
  8: 'CRP', 9: 'BSM', 10: 'ARM', 11: 'GSM',
  12: 'LTW', 13: 'WVR', 14: 'ALC', 15: 'CUL',
  16: 'MIN', 17: 'BTN', 18: 'FSH',
  99: 'GC',
};

export interface LeveUsedInEntry {
  leveId: number;
  name: string;
  level: number;
  type: SnapshotLeve['type'];
  jobCode: string;
  qty: number;
}

/** Reverse index: itemId → craft-leves that deliver it. */
export type LeveUsedInIndex = Map<number, LeveUsedInEntry[]>;

export function buildLeveUsedInIndex(leves: SnapshotLeve[]): LeveUsedInIndex {
  const out: LeveUsedInIndex = new Map();
  for (const leve of leves) {
    if (leve.targetItemId == null) continue;
    const entry: LeveUsedInEntry = {
      leveId: leve.id,
      name: leve.name,
      level: leve.level,
      type: leve.type,
      jobCode: CLASS_JOB_TO_CODE[leve.classJob] ?? '',
      qty: leve.targetItemQty ?? 1,
    };
    const list = out.get(leve.targetItemId);
    if (list) list.push(entry);
    else out.set(leve.targetItemId, [entry]);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/leveUsedInIndex.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leveUsedInIndex.ts src/lib/leveUsedInIndex.test.ts
git commit -m "feat: add leve reverse index for item deliverables"
```

---

### Task 3: Extend Garland parsing to surface `usedInQuest`

**Files:**
- Modify: `src/lib/garlandData.ts`
- Modify: `src/lib/garlandData.test.ts`

- [ ] **Step 1: Write the failing test (append to existing describe block)**

Add these tests inside the existing `describe('parseGarlandItem', ...)` in `src/lib/garlandData.test.ts`:

```ts
  it('extracts usedInQuests with names/genre resolved from quest partials', () => {
    const raw = {
      item: { id: 13099, name: "Witch's Hat", ilvl: 1, usedInQuest: [67686, 99999] },
      partials: [
        { type: 'quest', id: 67686, obj: { n: 'Joining the Circus', g: 248 } },
        { type: 'item', id: 1, obj: { n: 'Other', i: 1 } },
      ],
    };
    const out = parseGarlandItem(raw);
    expect(out?.usedInQuests).toEqual([
      { id: 67686, name: 'Joining the Circus', genre: 248 },
      { id: 99999, name: '#99999' },
    ]);
  });

  it('defaults usedInQuests to [] when field absent', () => {
    const raw = { item: { id: 1, name: 'Plain', ilvl: 1 }, partials: [] };
    expect(parseGarlandItem(raw)?.usedInQuests).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/garlandData.test.ts`
Expected: FAIL — `usedInQuests` is `undefined` on the result.

- [ ] **Step 3: Implement — add type, raw fields, and parsing**

In `src/lib/garlandData.ts`:

(a) Add the exported ref type and `usedInQuests` field. After the `GarlandTradeShopNpc` interface (around line 55), add:

```ts
export interface GarlandQuestRef {
  id: number;
  name: string;
  genre?: number;
}
```

In the `GarlandItem` interface, add the field after `tradeShopNpcs`:

```ts
  usedInQuests: GarlandQuestRef[];
```

(b) Extend the raw interfaces. Add `g` to the quest-bearing partial obj and `usedInQuest` to `RawItem`. Update `RawPartialItemObj` is item-only; add a quest obj shape. Change `RawNpcObj` block: add below it:

```ts
interface RawQuestObj { n?: string; g?: number }
```

Update `RawPartial.obj` union to include it:

```ts
interface RawPartial {
  type?: string;
  id?: number | string;
  obj?: (RawPartialItemObj & RawNpcObj & RawQuestObj);
}
```

Add to `RawItem`:

```ts
  usedInQuest?: number[];
```

(c) In `parseGarlandItem`, build a quest-partial map alongside the existing `itemPartials`/`npcPartials`. In the partial loop (the `for (const p of partials)` block), add a third branch and a new map declared above the loop:

```ts
  const questPartials = new Map<number, RawQuestObj>();
```

```ts
    else if (p.type === 'quest' && p.obj) questPartials.set(id, p.obj);
```

Then, before the final `return`, build the list:

```ts
  const usedInQuests: GarlandQuestRef[] = [];
  for (const questId of item.usedInQuest ?? []) {
    const part = questPartials.get(questId);
    usedInQuests.push(
      part?.n != null
        ? { id: questId, name: part.n, ...(part.g != null ? { genre: part.g } : {}) }
        : { id: questId, name: `#${questId}` },
    );
  }
```

Add `usedInQuests` to the returned object literal:

```ts
    usedInQuests,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/garlandData.test.ts`
Expected: PASS (all existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/garlandData.ts src/lib/garlandData.test.ts
git commit -m "feat: surface Garland usedInQuest turn-ins in parseGarlandItem"
```

---

### Task 4: Best-effort genre → job tag helper

**Files:**
- Create: `src/features/items/deliverableGenres.ts`
- Test: `src/features/items/deliverableGenres.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/items/deliverableGenres.test.ts
import { describe, it, expect } from 'vitest';
import { jobTagForGenre } from './deliverableGenres';

describe('jobTagForGenre', () => {
  it('returns the class-quest tag for a known genre', () => {
    expect(jobTagForGenre(174)).toBe('BTN class quest');
  });

  it('returns null for an unknown genre', () => {
    expect(jobTagForGenre(9999)).toBeNull();
  });

  it('returns null when genre is undefined', () => {
    expect(jobTagForGenre(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/items/deliverableGenres.test.ts`
Expected: FAIL — `jobTagForGenre` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/items/deliverableGenres.ts
//
// Best-effort map of Garland quest JournalGenre id -> crafter/gatherer job code.
// The tag is DECORATIVE ONLY: the turn-in list's correctness never depends on it,
// and unknown genres yield null (no tag) so we never display a guessed job.
//
// Garland's genre ids proved unreliable across jobs during probing, so this map is
// intentionally conservative — seeded only with values confirmed against real Garland
// quest docs. Add more genre ids here as they are verified (DoH: CRP/BSM/ARM/GSM/LTW/
// WVR/ALC/CUL class quests; DoL: MIN/BTN/FSH class quests).
const GENRE_TO_JOB: Record<number, string> = {
  174: 'BTN', // "Way of the Botanist" line (verified)
};

export function jobTagForGenre(genre: number | undefined): string | null {
  if (genre == null) return null;
  const job = GENRE_TO_JOB[genre];
  return job ? `${job} class quest` : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/items/deliverableGenres.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/items/deliverableGenres.ts src/features/items/deliverableGenres.test.ts
git commit -m "feat: add best-effort genre to class-quest job tag helper"
```

---

### Task 5: Cached index hooks for GC supply and leves

**Files:**
- Create: `src/features/items/useGcSupplyUsedInIndex.ts`
- Create: `src/features/items/useLeveUsedInIndex.ts`

No unit tests — these are thin React Query adapters mirroring the existing untested `useUsedInIndex.ts`. They are exercised through the component test (Task 6) and at runtime.

- [ ] **Step 1: Create the GC supply hook**

```ts
// src/features/items/useGcSupplyUsedInIndex.ts
import { useMemo } from 'react';
import { useQuestSnapshot } from '../queries/useQuestSnapshot';
import { buildGcSupplyUsedInIndex, type GcSupplyUsedInIndex } from '../../lib/gcSupplyUsedInIndex';
import type { SnapshotQuest } from '../../lib/questSnapshot';

// Module-level cache so the reverse index isn't rebuilt for every consumer.
// Keyed by the snapshot array reference (stable across React Query reads).
// NOTE: useQuestSnapshot wraps the array as `data.snapshot`.
let cached: { source: SnapshotQuest[]; index: GcSupplyUsedInIndex } | null = null;

export function useGcSupplyUsedInIndex(): { data: GcSupplyUsedInIndex; isLoading: boolean; isError: boolean } {
  const quests = useQuestSnapshot();
  const source = quests.data?.snapshot;
  const index = useMemo<GcSupplyUsedInIndex>(() => {
    if (!source) return new Map();
    if (cached && cached.source === source) return cached.index;
    const built = buildGcSupplyUsedInIndex(source);
    cached = { source, index: built };
    return built;
  }, [source]);
  return { data: index, isLoading: quests.isLoading, isError: quests.isError };
}
```

- [ ] **Step 2: Create the leve hook**

```ts
// src/features/items/useLeveUsedInIndex.ts
import { useMemo } from 'react';
import { useLeveSnapshot } from '../queries/useLeveSnapshot';
import { buildLeveUsedInIndex, type LeveUsedInIndex } from '../../lib/leveUsedInIndex';
import type { SnapshotLeve } from '../../lib/leveSnapshot';

// NOTE: useLeveSnapshot wraps the array as `data.leves`.
let cached: { source: SnapshotLeve[]; index: LeveUsedInIndex } | null = null;

export function useLeveUsedInIndex(): { data: LeveUsedInIndex; isLoading: boolean; isError: boolean } {
  const leves = useLeveSnapshot();
  const source = leves.data?.leves;
  const index = useMemo<LeveUsedInIndex>(() => {
    if (!source) return new Map();
    if (cached && cached.source === source) return cached.index;
    const built = buildLeveUsedInIndex(source);
    cached = { source, index: built };
    return built;
  }, [source]);
  return { data: index, isLoading: leves.isLoading, isError: leves.isError };
}
```

- [ ] **Step 3: (Confirmed) snapshot hook shapes**

Already verified: `useQuestSnapshot().data` is `{ snapshot: SnapshotQuest[]; updatedAt } | undefined` and `useLeveSnapshot().data` is `{ leves: SnapshotLeve[]; updatedAt } | undefined`. The hooks above read `.snapshot` / `.leves` accordingly. No change needed; proceed to typecheck.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/useGcSupplyUsedInIndex.ts src/features/items/useLeveUsedInIndex.ts
git commit -m "feat: add cached GC supply and leve used-in index hooks"
```

---

### Task 6: DeliverablesBlock component

**Files:**
- Modify: `src/lib/format.ts` (add `garlandQuestUrl`)
- Create: `src/features/items/DeliverablesBlock.tsx`
- Test: `src/features/items/DeliverablesBlock.test.tsx`

- [ ] **Step 1: Add the quest URL helper**

Append to `src/lib/format.ts`:

```ts
export function garlandQuestUrl(id: number): string {
  return `https://www.garlandtools.org/db/#quest/${id}`;
}
```

- [ ] **Step 2: Write the failing component test**

```tsx
// src/features/items/DeliverablesBlock.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DeliverablesBlock } from './DeliverablesBlock';

function renderBlock(props: Parameters<typeof DeliverablesBlock>[0]) {
  return render(<MemoryRouter><DeliverablesBlock {...props} /></MemoryRouter>);
}

describe('DeliverablesBlock', () => {
  it('renders nothing when all sources are empty', () => {
    const { container } = renderBlock({ gcSupply: [], leves: [], quests: [] });
    expect(container.firstChild).toBeNull();
  });

  it('renders the GC supply sub-block with category and level', () => {
    renderBlock({
      gcSupply: [{ level: 40, categoryName: 'BSM', qty: 2 }],
      leves: [], quests: [],
    });
    expect(screen.getByText(/Grand Company Supply/i)).toBeInTheDocument();
    expect(screen.getByText(/BSM/)).toBeInTheDocument();
    expect(screen.getByText(/Lv\.40/)).toBeInTheDocument();
  });

  it('renders quest rows with a job tag when genre is known and a link', () => {
    renderBlock({
      gcSupply: [], leves: [],
      quests: [{ id: 65539, name: 'Way of the Botanist', genre: 174 }],
    });
    expect(screen.getByText('Way of the Botanist')).toBeInTheDocument();
    expect(screen.getByText(/BTN class quest/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Way of the Botanist/ });
    expect(link).toHaveAttribute('href', 'https://www.garlandtools.org/db/#quest/65539');
  });

  it('renders a leve row with job, level and quantity', () => {
    renderBlock({
      gcSupply: [], quests: [],
      leves: [{ leveId: 100, name: 'Bake Sale', level: 20, type: 'doh', jobCode: 'CUL', qty: 3 }],
    });
    expect(screen.getByText('Bake Sale')).toBeInTheDocument();
    expect(screen.getByText(/CUL Lv\.20/)).toBeInTheDocument();
    expect(screen.getByText(/×3/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/features/items/DeliverablesBlock.test.tsx`
Expected: FAIL — cannot find module `./DeliverablesBlock`.

- [ ] **Step 4: Implement the component**

```tsx
// src/features/items/DeliverablesBlock.tsx
import { Link } from 'react-router-dom';
import { SectionHeader } from '../../components/SectionHeader';
import { garlandQuestUrl } from '../../lib/format';
import { jobTagForGenre } from './deliverableGenres';
import type { GcSupplyUsedInEntry } from '../../lib/gcSupplyUsedInIndex';
import type { LeveUsedInEntry } from '../../lib/leveUsedInIndex';
import type { GarlandQuestRef } from '../../lib/garlandData';

interface Props {
  gcSupply: GcSupplyUsedInEntry[];
  leves: LeveUsedInEntry[];
  quests: GarlandQuestRef[];
}

const ROW = 'flex items-center justify-between gap-3 px-4 py-2 border-t border-border-base first:border-t-0';
const META = 'font-mono text-[10px] tracking-widest uppercase text-text-low shrink-0';

export function DeliverablesBlock({ gcSupply, leves, quests }: Props) {
  if (gcSupply.length === 0 && leves.length === 0 && quests.length === 0) return null;

  return (
    <section>
      <SectionHeader label="Turn-Ins & Deliverables" compact />
      <div className="space-y-3">
        {gcSupply.length > 0 && (
          <SubBlock title="Grand Company Supply">
            {gcSupply.map((e, i) => (
              <div key={i} className={ROW}>
                <span className="text-text-cream">{e.categoryName} provisioning</span>
                <span className={META}>Lv.{e.level} · ×{e.qty}</span>
              </div>
            ))}
          </SubBlock>
        )}

        {leves.length > 0 && (
          <SubBlock title="Levequests">
            {leves.map((e) => (
              <div key={e.leveId} className={ROW}>
                <Link to="/leves" className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 transition-colors">
                  {e.name}
                </Link>
                <span className={META}>{e.jobCode} Lv.{e.level} · ×{e.qty}</span>
              </div>
            ))}
          </SubBlock>
        )}

        {quests.length > 0 && (
          <SubBlock title="Quest Turn-Ins">
            {quests.map((q) => {
              const tag = jobTagForGenre(q.genre);
              return (
                <div key={q.id} className={ROW}>
                  <a
                    href={garlandQuestUrl(q.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 transition-colors"
                  >
                    {q.name}
                  </a>
                  {tag && <span className={META}>{tag}</span>}
                </div>
              );
            })}
          </SubBlock>
        )}
      </div>
    </section>
  );
}

function SubBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border-base bg-bg-card">
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-text-low px-4 py-2 border-b border-border-base">
        {title}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/items/DeliverablesBlock.test.tsx`
Expected: PASS (4 tests). (jest-dom matchers `toBeInTheDocument`/`toHaveAttribute` are globally enabled via `src/test/setup.ts` — confirmed, same style as `LevePlanner.test.tsx`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/format.ts src/features/items/DeliverablesBlock.tsx src/features/items/DeliverablesBlock.test.tsx
git commit -m "feat: add DeliverablesBlock component for item turn-ins"
```

---

### Task 7: Wire DeliverablesBlock into the item page

**Files:**
- Modify: `src/routes/Item.tsx`

- [ ] **Step 1: Add imports**

After the existing `import { useUsedInIndex } from '../features/items/useUsedInIndex';` (line 9), add:

```ts
import { useGcSupplyUsedInIndex } from '../features/items/useGcSupplyUsedInIndex';
import { useLeveUsedInIndex } from '../features/items/useLeveUsedInIndex';
import { DeliverablesBlock } from '../features/items/DeliverablesBlock';
```

- [ ] **Step 2: Call the hooks and compute per-item lists**

After `const usedInIdx = useUsedInIndex();` (line 64), add:

```ts
  const gcSupplyIdx = useGcSupplyUsedInIndex();
  const leveIdx = useLeveUsedInIndex();
```

After `const usedIn = valid ? (usedInIdx.data.get(itemId) ?? []) : [];` (line 73), add:

```ts
  const gcSupplyDeliverables = valid ? (gcSupplyIdx.data.get(itemId) ?? []) : [];
  const leveDeliverables = valid ? (leveIdx.data.get(itemId) ?? []) : [];
  const questDeliverables = garland.data?.usedInQuests ?? [];
```

- [ ] **Step 3: Render the block**

In the JSX, immediately after the existing `<UsedInBlock ... />` line (line 231) and before `<SourcesBlock`, add:

```tsx
      <DeliverablesBlock
        gcSupply={gcSupplyDeliverables}
        leves={leveDeliverables}
        quests={questDeliverables}
      />
```

- [ ] **Step 4: Typecheck, lint, and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors/warnings.

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, open an item known to be a GC supply / leve / class-quest turn-in (e.g. a low-level crafted item like Bronze Ingot, item id 5057), and confirm the "Turn-Ins & Deliverables" section appears with the expected sub-blocks. Confirm an item with no deliverables shows no section.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Item.tsx
git commit -m "feat: show turn-ins and deliverables on item detail page"
```

---

## Self-Review Notes

- **Spec coverage:** GC supply (Tasks 1,5,6,7), leves (Tasks 2,5,6,7), quest turn-ins via Garland `usedInQuest` (Tasks 3,6,7), best-effort job tag (Task 4,6), graceful degradation via independently-optional sub-blocks (Task 6), no new bulk fetches (Garland ride-along + existing snapshots). All spec sections map to tasks.
- **Type consistency:** `GcSupplyUsedInEntry` (level/categoryName/qty), `LeveUsedInEntry` (leveId/name/level/type/jobCode/qty), `GarlandQuestRef` (id/name/genre?) are defined once and consumed unchanged by hooks, component, and `Item.tsx`. `jobTagForGenre(genre?)` signature consistent across helper, test, and component.
- **Pre-verified during planning:** snapshot hooks wrap their arrays as `data.snapshot` / `data.leves` (Task 5 reads these); jest-dom matchers are global via `src/test/setup.ts` (Task 6 uses them directly).
