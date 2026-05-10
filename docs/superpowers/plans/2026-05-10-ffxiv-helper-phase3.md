# FFXIV Helper Phase 3 Implementation Plan — Time-Budgeted Session Recommender

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Home page the primary screen. User enters "I have N minutes," app proposes which items to craft and how many of each to maximize gil within the budget. Strategy toggle (Quick Win / Patient / Balanced), optional crafter lock, optional min-profit threshold. Diversity rule from the legacy artifact stays.

**Architecture:** Two new pure modules — `craftTime.ts` (heuristic seconds-per-craft from recipe level) and `packSession.ts` (greedy knapsack ranked by gil/minute, capped by velocity × batch-cap-days, diversified). One Zustand setter on watchlistStore (per-item `craftTimeSeconds` override). Settings adds two fields: `batchCapDays` (default 3) and `defaultCraftTimeSeconds` (default 60). RecipeModal gets a craft-time number input. Home page becomes the SessionPlanner view.

**Tech Stack:** No new deps. Pure TS, React, Tailwind, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-10-ffxiv-helper-rebuild-design.md` — Phase 3 appendix.

**Decisions (from brainstorming):**
- **Batch cap is configurable** — default 3 days × velocity, slider in Settings.
- **Per-item craft time override lives in the RecipeModal** — same modal as craft-intermediates toggle.

---

## Conventions

- TDD for pure functions.
- Each task ends in a clean commit.
- `npm test -- --run` and `npm run build` must stay green throughout.
- Run from `c:/Users/esthe/Documents/Dev/ffxiv-helper`.

---

## Task 1: Settings — batch cap + default craft time

**Files:**
- Modify: `src/features/settings/store.ts`
- Modify: `src/features/settings/store.test.ts`

Extend the settings store. `overheadMinutes` already exists from Phase 1 (default 5). Add two new fields.

- [ ] **Step 1: Extend `SettingsState`**

In `src/features/settings/store.ts`:
```ts
export interface SettingsState {
  _v: 1;
  world: string;
  dc: string;
  retainerLevels: CrafterLevels;
  overheadMinutes: number;
  batchCapDays: number;             // NEW
  defaultCraftTimeSeconds: number;  // NEW
  setWorld: (w: string) => void;
  setDc: (d: string) => void;
  setRetainerLevel: (c: keyof CrafterLevels, lvl: number) => void;
  setOverheadMinutes: (n: number) => void;
  setBatchCapDays: (n: number) => void;             // NEW
  setDefaultCraftTimeSeconds: (n: number) => void;  // NEW
}
```

Update `defaultSettings()`:
```ts
export function defaultSettings() {
  return {
    _v: 1,
    world: 'Phantom',
    dc: 'Chaos',
    retainerLevels: { CRP: 93, BSM: 33, ARM: 42, GSM: 83, LTW: 100, WVR: 100, ALC: 90, CUL: 100 },
    overheadMinutes: 5,
    batchCapDays: 3,
    defaultCraftTimeSeconds: 60,
  };
}
```

Add the setters in the `create` body:
```ts
setBatchCapDays: (batchCapDays) => set({ batchCapDays }),
setDefaultCraftTimeSeconds: (defaultCraftTimeSeconds) => set({ defaultCraftTimeSeconds }),
```

- [ ] **Step 2: Extend tests**

Append to `src/features/settings/store.test.ts`:
```ts
it('starts with batchCapDays = 3 and defaultCraftTimeSeconds = 60', () => {
  const s = useSettingsStore.getState();
  expect(s.batchCapDays).toBe(3);
  expect(s.defaultCraftTimeSeconds).toBe(60);
});

it('setBatchCapDays clamps user input via simple assignment (no validation in store)', () => {
  useSettingsStore.getState().setBatchCapDays(7);
  expect(useSettingsStore.getState().batchCapDays).toBe(7);
});

it('setDefaultCraftTimeSeconds updates default time', () => {
  useSettingsStore.getState().setDefaultCraftTimeSeconds(90);
  expect(useSettingsStore.getState().defaultCraftTimeSeconds).toBe(90);
});
```

- [ ] **Step 3: Run + pass + commit**

```
git add -A
git commit -m "feat(settings): batchCapDays + defaultCraftTimeSeconds"
```

---

## Task 2: Watchlist store — per-item `craftTimeSeconds` override

**Files:**
- Modify: `src/features/items/watchlistStore.ts`
- Modify: `src/features/items/watchlistStore.test.ts`

Add to the existing `perItemFlags` map (introduced in Phase 2 Task 7) a new optional field. Same map, same setter pattern.

- [ ] **Step 1: Extend `PerItemFlags` in `src/features/profit/computeProfit.ts`**

```ts
export interface PerItemFlags {
  craftIntermediates?: boolean;
  craftTimeSeconds?: number;  // NEW
}
```

(No other code in `computeProfit.ts` uses this field; the profit math doesn't care about time.)

- [ ] **Step 2: Add setter to `watchlistStore.ts`**

```ts
export interface WatchlistState {
  // ... existing
  setCraftTime: (itemId: number, seconds: number | undefined) => void;
}
```

Implementation:
```ts
setCraftTime: (itemId, seconds) => set((s) => {
  const next = { ...s.perItemFlags };
  const existing = next[itemId];
  if (seconds == null || seconds <= 0) {
    if (existing) {
      const { craftTimeSeconds: _drop, ...rest } = existing;
      next[itemId] = Object.keys(rest).length ? rest : undefined;
    }
  } else {
    next[itemId] = { ...existing, craftTimeSeconds: seconds };
  }
  return { perItemFlags: next };
}),
```

(That's a touch fiddly: if user sets a number, store it; if user clears it, remove the field but keep `craftIntermediates` if present. Avoids leaving a dangling `craftTimeSeconds: undefined`.)

- [ ] **Step 3: Tests**

Append to `watchlistStore.test.ts`:
```ts
it('setCraftTime stores per-item override', () => {
  useWatchlistStore.getState().setCraftTime(42, 90);
  expect(useWatchlistStore.getState().perItemFlags[42]?.craftTimeSeconds).toBe(90);
});

it('setCraftTime preserves craftIntermediates flag when updating time', () => {
  useWatchlistStore.getState().setCraftIntermediates(42, true);
  useWatchlistStore.getState().setCraftTime(42, 75);
  expect(useWatchlistStore.getState().perItemFlags[42]).toEqual({ craftIntermediates: true, craftTimeSeconds: 75 });
});

it('setCraftTime with 0 or undefined removes the override but keeps other flags', () => {
  useWatchlistStore.getState().setCraftIntermediates(42, true);
  useWatchlistStore.getState().setCraftTime(42, 75);
  useWatchlistStore.getState().setCraftTime(42, 0);
  expect(useWatchlistStore.getState().perItemFlags[42]).toEqual({ craftIntermediates: true });
});
```

- [ ] **Step 4: Pass + commit**

```
git add -A
git commit -m "feat(items): per-item craftTimeSeconds override in watchlist store"
```

---

## Task 3: Default craft-time heuristic (pure)

**Files:**
- Create: `src/features/session/craftTime.ts`
- Create: `src/features/session/craftTime.test.ts`

Heuristic for craft duration: `60s + 1s per recipe level over 50`, capped at 180s. The user can override per-item.

- [ ] **Step 1: Failing test `src/features/session/craftTime.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { defaultCraftSeconds, resolveCraftSeconds } from './craftTime';

describe('defaultCraftSeconds', () => {
  it('returns the base for low-level recipes', () => {
    expect(defaultCraftSeconds(30, 60)).toBe(60);
    expect(defaultCraftSeconds(50, 60)).toBe(60);
  });
  it('adds 1s per recipe level over 50', () => {
    expect(defaultCraftSeconds(70, 60)).toBe(80);
    expect(defaultCraftSeconds(100, 60)).toBe(110);
  });
  it('caps at 180s regardless of recipe level', () => {
    expect(defaultCraftSeconds(770, 60)).toBe(180);
  });
});

describe('resolveCraftSeconds', () => {
  it('uses user override when provided', () => {
    expect(resolveCraftSeconds(100, 60, 90)).toBe(90);
  });
  it('falls back to default heuristic when no override', () => {
    expect(resolveCraftSeconds(100, 60, undefined)).toBe(110);
  });
  it('treats 0 or negative override as no override', () => {
    expect(resolveCraftSeconds(100, 60, 0)).toBe(110);
  });
});
```

- [ ] **Step 2: Run + fail.**

- [ ] **Step 3: Implement `src/features/session/craftTime.ts`**

```ts
const MAX_SECONDS = 180;
const SOFT_FLOOR_LEVEL = 50;

export function defaultCraftSeconds(recipeLevel: number, baseSeconds: number): number {
  const extra = Math.max(0, recipeLevel - SOFT_FLOOR_LEVEL);
  return Math.min(MAX_SECONDS, baseSeconds + extra);
}

export function resolveCraftSeconds(
  recipeLevel: number,
  baseSeconds: number,
  override: number | undefined,
): number {
  if (override && override > 0) return override;
  return defaultCraftSeconds(recipeLevel, baseSeconds);
}
```

- [ ] **Step 4: Pass + commit**

```
git add -A
git commit -m "feat(session): defaultCraftSeconds heuristic + resolver"
```

---

## Task 4: Session candidate builder (pure)

**Files:**
- Create: `src/features/session/buildCandidates.ts`
- Create: `src/features/session/buildCandidates.test.ts`

Transforms `WatchlistRow[]` (post-buildRows) into `SessionCandidate[]` ready for the packer. Filters out non-craftable items (sale-only or unresolved), items without profit data, items below a min-profit threshold, and items locked-out by crafter filter. Computes per-item craft time and gil/minute.

- [ ] **Step 1: Failing test**

Write `src/features/session/buildCandidates.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildCandidates } from './buildCandidates';
import type { WatchlistRow } from '../watchlist/buildRows';

const baseRow: WatchlistRow = {
  id: 0, name: '', crafter: 'LTW', lvl: 100, cat: 'Raid',
  pMinNQ: null, pMinHQ: null, pAvgNQ: null, pAvgHQ: null, pSpd: 0, pListings: 0,
  dcMinNQ: null, dcMinHQ: null, dcSpd: 5,
  refPrice: 0, rawScore: 0, score: 0, staleDays: null, craftStatus: 'ok',
  craftable: true, materialCost: 100, salePrice: 1000, profit: 900, gilPerDay: 4500,
};

describe('buildCandidates', () => {
  it('drops sale-only and unresolved rows', () => {
    const rows: WatchlistRow[] = [
      { ...baseRow, id: 1 },
      { ...baseRow, id: 2, craftable: false },  // sale-only
      { ...baseRow, id: 3, craftable: null },   // unresolved
    ];
    const candidates = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {} });
    expect(candidates.map((c) => c.id)).toEqual([1]);
  });

  it('drops rows below the min profit threshold', () => {
    const rows: WatchlistRow[] = [
      { ...baseRow, id: 1, profit: 500 },
      { ...baseRow, id: 2, profit: 50_000 },
    ];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {}, minProfit: 1000 });
    expect(c.map((x) => x.id)).toEqual([2]);
  });

  it('locks to a single crafter when crafterLock is set', () => {
    const rows: WatchlistRow[] = [
      { ...baseRow, id: 1, crafter: 'LTW' },
      { ...baseRow, id: 2, crafter: 'WVR' },
    ];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {}, crafterLock: 'LTW' });
    expect(c.map((x) => x.id)).toEqual([1]);
  });

  it('drops rows whose craft status is not ok (locked items)', () => {
    const rows: WatchlistRow[] = [
      { ...baseRow, id: 1, craftStatus: 'ok' },
      { ...baseRow, id: 2, craftStatus: 'short' },
      { ...baseRow, id: 3, craftStatus: 'no' },
    ];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {} });
    expect(c.map((x) => x.id)).toEqual([1]);
  });

  it('uses defaultCraftSeconds when no per-item override', () => {
    const rows = [{ ...baseRow, id: 1, lvl: 100 }];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {} });
    // 60 + (100 - 50) = 110
    expect(c[0].craftSeconds).toBe(110);
    expect(c[0].gilPerMinute).toBe(900 / (110 / 60));
  });

  it('uses per-item override when present', () => {
    const rows = [{ ...baseRow, id: 1, lvl: 100, profit: 900 }];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: { 1: { craftTimeSeconds: 30 } } });
    expect(c[0].craftSeconds).toBe(30);
    expect(c[0].gilPerMinute).toBe(900 / 0.5);
  });

  it('drops rows with zero or negative profit', () => {
    const rows: WatchlistRow[] = [
      { ...baseRow, id: 1, profit: 100 },
      { ...baseRow, id: 2, profit: 0 },
      { ...baseRow, id: 3, profit: -500 },
    ];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {} });
    expect(c.map((x) => x.id)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Implement `src/features/session/buildCandidates.ts`**

```ts
import type { WatchlistRow } from '../watchlist/buildRows';
import type { CrafterCode } from '../items/types';
import type { FlagMap } from '../profit/computeProfit';
import { resolveCraftSeconds } from './craftTime';

export interface SessionCandidate {
  id: number;
  name: string;
  crafter: CrafterCode;
  lvl: number;
  profit: number;
  velocity: number;
  craftSeconds: number;
  gilPerMinute: number;
  setKey: string;
}

export interface CandidateOpts {
  baseSeconds: number;
  perItemFlags: FlagMap;
  minProfit?: number;
  crafterLock?: CrafterCode;
}

function setKeyFor(name: string): string {
  // Strip "<set name>'s" or " of <stat>" so all gear pieces in one set share a key
  return name.split(' of ')[0].split("'s")[0].trim();
}

export function buildCandidates(rows: WatchlistRow[], opts: CandidateOpts): SessionCandidate[] {
  const out: SessionCandidate[] = [];
  for (const r of rows) {
    if (r.craftable !== true) continue;
    if (r.craftStatus !== 'ok') continue;
    if (r.profit == null || r.profit <= 0) continue;
    if (opts.minProfit != null && r.profit < opts.minProfit) continue;
    if (opts.crafterLock && r.crafter !== opts.crafterLock) continue;
    const override = opts.perItemFlags[r.id]?.craftTimeSeconds;
    const craftSeconds = resolveCraftSeconds(r.lvl, opts.baseSeconds, override);
    const gilPerMinute = r.profit / (craftSeconds / 60);
    out.push({
      id: r.id,
      name: r.name,
      crafter: r.crafter,
      lvl: r.lvl,
      profit: r.profit,
      velocity: r.dcSpd,
      craftSeconds,
      gilPerMinute,
      setKey: setKeyFor(r.name),
    });
  }
  return out;
}
```

- [ ] **Step 3: Pass + commit**

```
git add -A
git commit -m "feat(session): buildCandidates filters + scores craftable rows"
```

---

## Task 5: Greedy session packer (pure)

**Files:**
- Create: `src/features/session/packSession.ts`
- Create: `src/features/session/packSession.test.ts`

Given candidates, a time budget (in minutes), and options (`batchCapDays`, `overheadMinutes`, strategy), return a list of `SessionPick`s with chosen `batch` quantities, plus a summary.

Algorithm:
1. Subtract `overheadMinutes × 60` from the budget (in seconds). Floor at 0.
2. Score each candidate by strategy:
   - `balanced` → `gilPerMinute` (default).
   - `quickwin` → `gilPerMinute × min(1, velocity / 3)` — favors items that move fast.
   - `patient` → `gilPerMinute × log10(profit + 1) / 6` — favors high-margin items.
3. Sort candidates by score desc.
4. Walk the sorted list. For each candidate: max batch = min(`floor(budget_remaining / craftSeconds)`, `ceil(velocity × batchCapDays)`, 99). Skip if max ≤ 0.
5. Diversity rule: track `setKey` already added. If 3+ items share a set already in the picks, allow no more from that set. (Looser than Phase 1's "after 3 picks total"; keyed per set.)
6. Decrement budget by `batch × craftSeconds`. Stop when budget too small for the next candidate's single craft.

- [ ] **Step 1: Failing test `src/features/session/packSession.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { packSession } from './packSession';
import type { SessionCandidate } from './buildCandidates';

function mk(partial: Partial<SessionCandidate> & { id: number; profit: number; craftSeconds: number; velocity: number }): SessionCandidate {
  return {
    name: `Item ${partial.id}`,
    crafter: 'LTW',
    lvl: 100,
    setKey: `set-${partial.id}`,
    gilPerMinute: partial.profit / (partial.craftSeconds / 60),
    ...partial,
  } as SessionCandidate;
}

describe('packSession', () => {
  it('picks the highest gil/minute first and respects the time budget', () => {
    const cands = [
      mk({ id: 1, profit: 1000, craftSeconds: 60, velocity: 10 }),  // 1000 gil/min
      mk({ id: 2, profit: 100,  craftSeconds: 60, velocity: 10 }),  //  100 gil/min
    ];
    const out = packSession(cands, { budgetMinutes: 5, overheadMinutes: 0, batchCapDays: 7, strategy: 'balanced' });
    // 5 minutes = 300s, item1 60s each = up to 5 crafts, but velocity 10 × 7 = 70 cap, so 5 crafts of item1 fit
    expect(out.picks[0].id).toBe(1);
    expect(out.picks[0].batch).toBe(5);
    expect(out.totalSeconds).toBe(300);
  });

  it('caps batch by velocity × batchCapDays', () => {
    const cands = [mk({ id: 1, profit: 1000, craftSeconds: 60, velocity: 1 })];
    const out = packSession(cands, { budgetMinutes: 60, overheadMinutes: 0, batchCapDays: 3, strategy: 'balanced' });
    // velocity 1 × 3 = 3 cap; 60min / 60s = 60 possible by time
    expect(out.picks[0].batch).toBe(3);
  });

  it('subtracts overhead from the budget', () => {
    const cands = [mk({ id: 1, profit: 100, craftSeconds: 60, velocity: 10 })];
    const out = packSession(cands, { budgetMinutes: 10, overheadMinutes: 5, batchCapDays: 7, strategy: 'balanced' });
    // 10 - 5 = 5 minutes effective = 5 crafts
    expect(out.picks[0].batch).toBe(5);
  });

  it('quickwin strategy prefers high-velocity items', () => {
    const cands = [
      mk({ id: 1, profit: 1000, craftSeconds: 60, velocity: 10 }),  // base 1000 gil/min, vel 10 → quickwin same
      mk({ id: 2, profit: 1500, craftSeconds: 60, velocity: 1 }),   // base 1500 gil/min, but velocity penalty
    ];
    const out = packSession(cands, { budgetMinutes: 1, overheadMinutes: 0, batchCapDays: 7, strategy: 'quickwin' });
    expect(out.picks[0].id).toBe(1);
  });

  it('patient strategy prefers high-margin items', () => {
    const cands = [
      mk({ id: 1, profit: 1_000,    craftSeconds: 60, velocity: 10 }), // 1000 gil/min, low margin
      mk({ id: 2, profit: 200_000,  craftSeconds: 600, velocity: 10 }), // 20000 gil/min, very high margin
    ];
    // even though id=2 has way higher gil/min, patient should also like it (it's a margin amplifier).
    // But for a tie-on-gil/min scenario, patient prefers the higher-profit item.
    const cands2 = [
      mk({ id: 3, profit: 100,      craftSeconds: 6, velocity: 10 }),  // 1000 gil/min, low margin
      mk({ id: 4, profit: 100_000,  craftSeconds: 6_000, velocity: 10 }), // 1000 gil/min, fat margin
    ];
    const out = packSession(cands2, { budgetMinutes: 1000, overheadMinutes: 0, batchCapDays: 7, strategy: 'patient' });
    expect(out.picks[0].id).toBe(4);
  });

  it('limits to 3 picks per setKey (diversity rule)', () => {
    const cands = Array.from({ length: 6 }, (_, i) => mk({
      id: i + 1, profit: 1000, craftSeconds: 60, velocity: 10,
      setKey: 'shared-set',
    }));
    const out = packSession(cands, { budgetMinutes: 30, overheadMinutes: 0, batchCapDays: 7, strategy: 'balanced' });
    expect(out.picks).toHaveLength(3);
  });

  it('returns empty picks when budget is zero after overhead', () => {
    const cands = [mk({ id: 1, profit: 1000, craftSeconds: 60, velocity: 10 })];
    const out = packSession(cands, { budgetMinutes: 5, overheadMinutes: 5, batchCapDays: 7, strategy: 'balanced' });
    expect(out.picks).toEqual([]);
    expect(out.totalSeconds).toBe(0);
  });

  it('summary totals expected gil and minutes', () => {
    const cands = [mk({ id: 1, profit: 1000, craftSeconds: 60, velocity: 10 })];
    const out = packSession(cands, { budgetMinutes: 3, overheadMinutes: 0, batchCapDays: 7, strategy: 'balanced' });
    expect(out.totalGil).toBe(3000); // 3 crafts × 1000
    expect(out.totalSeconds).toBe(180);
  });
});
```

- [ ] **Step 2: Implement `src/features/session/packSession.ts`**

```ts
import type { SessionCandidate } from './buildCandidates';

export type SessionStrategy = 'balanced' | 'quickwin' | 'patient';

export interface SessionPick {
  id: number;
  name: string;
  crafter: string;
  batch: number;
  craftSeconds: number;
  profit: number;
  totalSeconds: number;
  totalGil: number;
}

export interface SessionResult {
  picks: SessionPick[];
  totalGil: number;
  totalSeconds: number;
}

export interface PackOpts {
  budgetMinutes: number;
  overheadMinutes: number;
  batchCapDays: number;
  strategy: SessionStrategy;
}

function strategyScore(c: SessionCandidate, strategy: SessionStrategy): number {
  switch (strategy) {
    case 'quickwin':
      return c.gilPerMinute * Math.min(1, c.velocity / 3);
    case 'patient':
      return c.gilPerMinute * (Math.log10(c.profit + 1) / 6);
    case 'balanced':
    default:
      return c.gilPerMinute;
  }
}

const SET_DIVERSITY_LIMIT = 3;

export function packSession(candidates: SessionCandidate[], opts: PackOpts): SessionResult {
  const budgetSeconds = Math.max(0, (opts.budgetMinutes - opts.overheadMinutes) * 60);
  if (budgetSeconds === 0) {
    return { picks: [], totalGil: 0, totalSeconds: 0 };
  }
  const ranked = [...candidates].sort((a, b) => strategyScore(b, opts.strategy) - strategyScore(a, opts.strategy));

  let remaining = budgetSeconds;
  const setCounts: Record<string, number> = {};
  const picks: SessionPick[] = [];

  for (const c of ranked) {
    if (remaining < c.craftSeconds) continue;
    const setSoFar = setCounts[c.setKey] ?? 0;
    if (setSoFar >= SET_DIVERSITY_LIMIT) continue;

    const velocityCap = Math.max(1, Math.ceil(c.velocity * opts.batchCapDays));
    const timeCap = Math.floor(remaining / c.craftSeconds);
    const batch = Math.min(velocityCap, timeCap, 99);
    if (batch <= 0) continue;

    const totalSeconds = batch * c.craftSeconds;
    const totalGil = batch * c.profit;
    picks.push({
      id: c.id,
      name: c.name,
      crafter: c.crafter,
      batch,
      craftSeconds: c.craftSeconds,
      profit: c.profit,
      totalSeconds,
      totalGil,
    });
    setCounts[c.setKey] = setSoFar + 1;
    remaining -= totalSeconds;
  }

  return {
    picks,
    totalGil: picks.reduce((acc, p) => acc + p.totalGil, 0),
    totalSeconds: picks.reduce((acc, p) => acc + p.totalSeconds, 0),
  };
}
```

- [ ] **Step 3: Pass + commit**

```
git add -A
git commit -m "feat(session): greedy packer with strategy + diversity + caps"
```

---

## Task 6: Session UI components

**Files:**
- Create: `src/features/session/SessionPlanner.tsx`
- Create: `src/features/session/SessionResults.tsx`

The planner is the input panel: time budget, strategy chips, optional crafter lock, optional min-profit threshold. The results component renders the picks table.

- [ ] **Step 1: SessionResults component**

Write `src/features/session/SessionResults.tsx`:
```tsx
import { fmtGil } from '../../lib/format';
import type { SessionResult } from './packSession';

export function SessionResults({ result }: { result: SessionResult | null }) {
  if (!result) return null;
  if (result.picks.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
        No items fit your budget — try a longer time, lower min-profit, or different strategy.
      </div>
    );
  }
  return (
    <div className="border border-border-base bg-bg-card">
      <div className="px-4 py-3 border-b border-border-base flex justify-between items-baseline">
        <div className="font-mono text-[10px] tracking-widest text-text-low uppercase">
          {result.picks.length} items · {Math.round(result.totalSeconds / 60)} min
        </div>
        <div className="font-display text-xl text-gold-hi">
          ~{fmtGil(result.totalGil)} <span className="text-xs text-text-dim">expected</span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
            <th className="text-left px-3 py-2">Item</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2 hidden md:table-cell">Time</th>
            <th className="text-right px-3 py-2 hidden md:table-cell">Profit ea</th>
            <th className="text-right px-3 py-2">Total gil</th>
          </tr>
        </thead>
        <tbody>
          {result.picks.map((p) => (
            <tr key={p.id} className="border-t border-border-base">
              <td className="px-3 py-2.5">
                <div className="text-text-cream">{p.name}</div>
                <div className="font-mono text-[10px] text-text-low">{p.crafter}</div>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-gold">×{p.batch}</td>
              <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">
                {Math.round(p.totalSeconds / 60)} min
              </td>
              <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">
                {fmtGil(p.profit)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-jade">{fmtGil(p.totalGil)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: SessionPlanner component**

Write `src/features/session/SessionPlanner.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useWatchlistStore } from '../items/watchlistStore';
import { useUiStore } from '../ui/uiStore'; // unused for now but available
import { useMarketData } from '../watchlist/useMarketData';
import { useRecipes } from '../profit/useRecipes';
import { allItemsFromEnabledPacks } from '../items/starterPacks';
import { buildRows } from '../watchlist/buildRows';
import { buildCandidates } from './buildCandidates';
import { packSession, type SessionStrategy } from './packSession';
import { SessionResults } from './SessionResults';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import type { CrafterCode } from '../items/types';

const STRATEGIES: { id: SessionStrategy; label: string; tag: string }[] = [
  { id: 'balanced',  label: 'Balanced',    tag: 'mix of margin and movement' },
  { id: 'quickwin',  label: 'Quick Win',   tag: 'favor items that move fast' },
  { id: 'patient',   label: 'Patient',     tag: 'favor fat-margin items' },
];

const CRAFTERS: (CrafterCode | 'ANY')[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'];

export default function SessionPlanner() {
  const settings = useSettingsStore();
  const { starterPacks, customItems, perItemFlags } = useWatchlistStore();
  // useUiStore intentionally not bound here; the planner uses its own filters
  void useUiStore;

  const [minutes, setMinutes] = useState(60);
  const [strategy, setStrategy] = useState<SessionStrategy>('balanced');
  const [crafterLock, setCrafterLock] = useState<CrafterCode | undefined>(undefined);
  const [minProfit, setMinProfit] = useState<number | undefined>(undefined);

  const items = useMemo(() => {
    const fromPacks = allItemsFromEnabledPacks(starterPacks);
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id))];
  }, [starterPacks, customItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, settings.world, settings.dc);
  const recipes = useRecipes(ids);

  const result = useMemo(() => {
    if (!market.data || !recipes.data) return null;
    const rows = buildRows(items, market.data.phantom, market.data.dc, settings.retainerLevels, recipes.data, perItemFlags, Date.now());
    const candidates = buildCandidates(rows, {
      baseSeconds: settings.defaultCraftTimeSeconds,
      perItemFlags,
      crafterLock,
      minProfit,
    });
    return packSession(candidates, {
      budgetMinutes: minutes,
      overheadMinutes: settings.overheadMinutes,
      batchCapDays: settings.batchCapDays,
      strategy,
    });
  }, [items, market.data, recipes.data, settings.retainerLevels, settings.defaultCraftTimeSeconds, settings.overheadMinutes, settings.batchCapDays, perItemFlags, minutes, strategy, crafterLock, minProfit]);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-6">
      <section className="border border-border-base bg-bg-card p-5 space-y-5">
        <h2 className="font-display text-xl text-gold tracking-wide">Plan a session</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Time budget (min)</span>
            <input
              type="number" min={1} max={600}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 0))}
              className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono"
            />
            <span className="block mt-1 font-mono text-[10px] text-text-low">
              minus {settings.overheadMinutes} min overhead = {Math.max(0, minutes - settings.overheadMinutes)} min crafting
            </span>
          </label>

          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Lock to crafter</span>
            <select
              value={crafterLock ?? ''}
              onChange={(e) => setCrafterLock(e.target.value === '' ? undefined : (e.target.value as CrafterCode))}
              className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono"
            >
              <option value="">Any</option>
              {CRAFTERS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min profit (gil)</span>
            <input
              type="number" min={0}
              value={minProfit ?? ''}
              placeholder="any"
              onChange={(e) => setMinProfit(e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono"
            />
          </label>
        </div>

        <div>
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase block mb-2">Strategy</span>
          <div className="flex flex-wrap gap-2">
            {STRATEGIES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStrategy(s.id)}
                className={`px-4 py-2 border font-mono text-xs tracking-wider uppercase ${
                  strategy === s.id ? 'border-gold text-gold bg-bg-card-hi' : 'border-border-base text-text-dim hover:text-aether'
                }`}
              >
                {s.label} <span className="text-[10px] text-text-low ml-2 normal-case">{s.tag}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {(market.isLoading || recipes.isLoading) && <Spinner label="Loading market + recipe data…" />}
      {market.isError && <StatusBanner kind="error">Universalis fetch failed.</StatusBanner>}
      {recipes.isError && <StatusBanner kind="error">XIVAPI fetch failed.</StatusBanner>}

      <SessionResults result={result} />
    </div>
  );
}
```

NOTE: `useUiStore` import + `void useUiStore` is a workaround; remove that line and the import — it's unused. Cleanup before committing.

- [ ] **Step 3: Replace the Home route**

Edit `src/routes/Home.tsx`:
```tsx
import SessionPlanner from '../features/session/SessionPlanner';

export default function Home() {
  return <SessionPlanner />;
}
```

- [ ] **Step 4: Build clean. Tests green. Manual sanity check via `npm run dev`.**

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(session): SessionPlanner UI on Home route"
```

---

## Task 7: Settings — expose batch cap + default craft time inputs

**Files:**
- Modify: `src/routes/Settings.tsx`

A small new section between "Retainer levels" and "Starter packs". Two number inputs.

- [ ] **Step 1: Add a "Session defaults" section**

In `src/routes/Settings.tsx`, before the `<section>` for Starter packs, add:

```tsx
<section>
  <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Session defaults</h2>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
    <label className="block">
      <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Overhead (min)</span>
      <input
        type="number" min={0} max={60}
        value={useSettingsStore.getState().overheadMinutes}
        onChange={(e) => useSettingsStore.getState().setOverheadMinutes(Math.max(0, Number(e.target.value) || 0))}
        className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
      />
      <span className="block mt-1 font-mono text-[10px] text-text-low">subtracted from time budget</span>
    </label>
    <label className="block">
      <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Default craft (sec)</span>
      <input
        type="number" min={5} max={600}
        value={useSettingsStore.getState().defaultCraftTimeSeconds}
        onChange={(e) => useSettingsStore.getState().setDefaultCraftTimeSeconds(Math.max(5, Number(e.target.value) || 0))}
        className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
      />
      <span className="block mt-1 font-mono text-[10px] text-text-low">heuristic baseline; +1s per recipe level over 50</span>
    </label>
    <label className="block">
      <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Batch cap (days)</span>
      <input
        type="number" min={1} max={30}
        value={useSettingsStore.getState().batchCapDays}
        onChange={(e) => useSettingsStore.getState().setBatchCapDays(Math.max(1, Number(e.target.value) || 0))}
        className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
      />
      <span className="block mt-1 font-mono text-[10px] text-text-low">qty cap = velocity × this</span>
    </label>
  </div>
</section>
```

NOTE: those inputs use `useSettingsStore.getState().setX(...)` directly. Better React: subscribe via `const { overheadMinutes, batchCapDays, defaultCraftTimeSeconds, setOverheadMinutes, setBatchCapDays, setDefaultCraftTimeSeconds } = useSettingsStore()` so the inputs re-render when state changes from elsewhere. Use the destructure.

Replacement (cleaner, drop in place of the snippet above):
```tsx
function SessionDefaults() {
  const {
    overheadMinutes, batchCapDays, defaultCraftTimeSeconds,
    setOverheadMinutes, setBatchCapDays, setDefaultCraftTimeSeconds,
  } = useSettingsStore();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Overhead (min)</span>
        <input
          type="number" min={0} max={60}
          value={overheadMinutes}
          onChange={(e) => setOverheadMinutes(Math.max(0, Number(e.target.value) || 0))}
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
        <span className="block mt-1 font-mono text-[10px] text-text-low">subtracted from time budget</span>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Default craft (sec)</span>
        <input
          type="number" min={5} max={600}
          value={defaultCraftTimeSeconds}
          onChange={(e) => setDefaultCraftTimeSeconds(Math.max(5, Number(e.target.value) || 0))}
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
        <span className="block mt-1 font-mono text-[10px] text-text-low">heuristic baseline</span>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Batch cap (days)</span>
        <input
          type="number" min={1} max={30}
          value={batchCapDays}
          onChange={(e) => setBatchCapDays(Math.max(1, Number(e.target.value) || 0))}
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
        <span className="block mt-1 font-mono text-[10px] text-text-low">qty cap = velocity × this</span>
      </label>
    </div>
  );
}
```

Then use `<section><h2>Session defaults</h2><SessionDefaults /></section>` in the Settings JSX.

- [ ] **Step 2: Build clean. Manual: change values, watch SessionPlanner update.**

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "feat(settings): expose session-default inputs (overhead, default craft, batch cap)"
```

---

## Task 8: RecipeModal — craft-time override input

**Files:**
- Modify: `src/features/profit/RecipeModal.tsx`
- Modify: caller in `src/routes/Watchlist.tsx` (pass new prop)

The modal already takes `craftIntermediates` + `onToggleCraftIntermediates`. Add `craftTimeSeconds` (number | undefined) + `onChangeCraftTime` (number | undefined) and a number input next to the checkbox.

- [ ] **Step 1: Update `RecipeModal.tsx` props**

Read the file. Then change `Props`:
```tsx
interface Props {
  // ... existing
  craftTimeSeconds: number | undefined;
  defaultCraftTimeSeconds: number;
  recipeLevel: number; // for showing the heuristic default in placeholder
  onChangeCraftTime: (seconds: number | undefined) => void;
}
```

(Recipe level is already in the `recipe` prop — `recipe.recipeLevel`. We don't need a separate `recipeLevel` prop. Drop that and use `recipe.recipeLevel` directly.)

Below the existing checkbox label, add:
```tsx
<label className="flex items-center gap-2 text-sm mb-4">
  <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Craft time (sec)</span>
  <input
    type="number"
    min={0}
    placeholder={`auto: ${Math.min(180, defaultCraftTimeSeconds + Math.max(0, recipe.recipeLevel - 50))}`}
    value={craftTimeSeconds ?? ''}
    onChange={(e) => {
      const v = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0);
      onChangeCraftTime(v);
    }}
    className="bg-bg-card border border-border-base px-2 py-1 font-mono text-sm w-24"
  />
  <span className="text-text-low text-xs">empty = use heuristic</span>
</label>
```

- [ ] **Step 2: Update caller in `src/routes/Watchlist.tsx`**

```tsx
const { setCraftIntermediates, setCraftTime } = useWatchlistStore();
const { defaultCraftTimeSeconds } = useSettingsStore();

// inside the modal render:
<RecipeModal
  // ... existing props
  craftTimeSeconds={perItemFlags[selected.id]?.craftTimeSeconds}
  defaultCraftTimeSeconds={defaultCraftTimeSeconds}
  onChangeCraftTime={(v) => setCraftTime(selected.id, v ?? 0)}
/>
```

(`setCraftTime` from Task 2 treats 0/undefined as "remove override" — pass `v ?? 0`.)

- [ ] **Step 3: Build clean. Tests green. Manual: open modal, set craft time, verify SessionPlanner respects it.**

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(profit): RecipeModal craft-time override input"
```

---

## Task 9: Smoke test for SessionPlanner

**Files:**
- Create: `src/features/session/SessionPlanner.test.tsx`

Render the planner with mocked Universalis + XIVAPI. Confirm a pick appears.

- [ ] **Step 1: Test**

Write `src/features/session/SessionPlanner.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SessionPlanner from './SessionPlanner';
import { useSettingsStore, defaultSettings } from '../settings/store';
import { useWatchlistStore, defaultWatchlist } from '../items/watchlistStore';
import { useUiStore, defaultUi } from '../ui/uiStore';
import { clearRecipeCache } from '../../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useWatchlistStore.setState(defaultWatchlist());
  useUiStore.setState(defaultUi());
  await clearRecipeCache();
  vi.restoreAllMocks();
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SessionPlanner', () => {
  it('renders an item suggestion when market + recipe data resolve', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('universalis.app')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: {
              '49281': { listings: [{ hq: false, pricePerUnit: 250000 }], recentHistory: [], regularSaleVelocity: 4, lastUploadTime: Date.now() },
              '7': { listings: [{ hq: false, pricePerUnit: 1000 }], recentHistory: [], regularSaleVelocity: 0, lastUploadTime: Date.now() },
            },
          }),
        });
      }
      const isFor49281 = url.includes('ItemResult%3D49281');
      return Promise.resolve({
        ok: true,
        json: async () => isFor49281
          ? {
            results: [{
              fields: {
                ItemResult: { value: 49281 },
                CraftType: { fields: { Name: 'Leatherworker' } },
                RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
                Ingredient0: { value: 7 }, AmountIngredient0: 5,
              },
            }],
          }
          : { results: [] },
      });
    }));

    render(withProviders(<SessionPlanner />));

    await waitFor(() => {
      expect(screen.getByText(/Courtly Lover's Temple Chain of Striking/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
```

- [ ] **Step 2: Run + pass + commit**

```
git add -A
git commit -m "test(session): smoke render of SessionPlanner with mocked APIs"
```

---

## Task 10: README + nav rename

**Files:**
- Modify: `src/components/layout/Header.tsx` (rename "Home" → "Session" maybe; or keep Home)
- Modify: `README.md`

- [ ] **Step 1: Header — keep as `Home` (the spec said "Home becomes the primary screen"). No rename.**

(Skip step 1; explicitly do nothing.)

- [ ] **Step 2: README — append a Phase 3 section**

Append:
```markdown

## Phase 3 — Session recommender

The Home page is now a session planner. Tell it how many minutes you have, pick a strategy, optionally lock to a single crafter or a min-profit threshold — it picks 6–8 items from your watchlist that fit the time and maximize gil/min.

- **Time budget** is total wall-clock minutes. Overhead (default 5 min, configurable in Settings) is subtracted before packing.
- **Batch quantity** per item is capped at `velocity × batchCapDays` (default 3 days, configurable). Won't suggest crafting 30 of something that sells 1/day.
- **Diversity rule:** at most 3 items from the same gear set per session.
- **Per-item craft time** defaults to a heuristic (60s + 1s per recipe level over 50, capped at 180s). Override per item in the recipe modal.
- **Strategies:**
  - *Balanced* (default): pure gil/minute.
  - *Quick Win*: favors items that move fast (penalizes <3 sales/day).
  - *Patient*: favors fat-margin items.
- **Sale-only items** (Materia XII, dyes) are skipped — no recipe = no craft time = nothing to pack.

Items below your levels (`craftStatus !== 'ok'`) are excluded automatically.
```

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "docs: README Phase 3 section"
```

---

## Phase 3 ships when

- `npm test -- --run` green (count grows from 77 to ~92).
- `npm run build` clean.
- Home page is a working session planner: enter "60 min" → see 4–8 picks summing to a gil estimate.
- Strategy chips swap rankings.
- Crafter lock + min-profit filter results.
- Recipe modal lets you set a craft-time override; setting 30s on a profitable item makes it climb the picks.
- Settings inputs for overhead / default craft / batch cap reflect immediately on Home.
