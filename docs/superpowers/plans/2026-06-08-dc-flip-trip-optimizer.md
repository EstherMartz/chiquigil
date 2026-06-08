# DC Flip Trip Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the flat DC Flip list into a destination-world trip planner — grouped results with per-world trip economics, a freshness/stability signal per opportunity, and a max-capital filter — plus a grouped dashboard widget.

**Architecture:** Three layers, built to avoid colliding with another agent's in-flight rewrite of `refresh-cache.ts`/`marketCache.ts`:
1. **Pure client logic** (new, fully unit-tested): net-spread + world-grouping in `dcFlipGroups.ts`; freshness state-machine + label/age derivation in `spreadHistory.ts`.
2. **Client UI**: `DcFlipView.tsx` re-rendered as collapsible world groups with a WINDOW column, capital filter, URL state, single-world flat fallback; dashboard `SpreadBars.tsx` grouped with deep-links.
3. **Server freshness persistence** (LAST task, deferred): fold the rolling 20-cycle state inside the existing `refresh-cache.ts` run and persist a `spread-history.json` blob, consumed read-only by the client. This task depends on the `writeBlobJson`/`readBlobJson` helpers the other agent is adding to `marketCache.ts`; do it only after their hot/cold tiering lands.

**Tech Stack:** React 18 + TypeScript, Vite, Zustand (`uiStore`, `settings/store`), TanStack Query, react-router-dom `useSearchParams`, Vitest + Testing Library, Vercel Blob (`@vercel/blob`), Universalis market data.

**Key design decisions (locked):**
- **Net spread everywhere in DC Flip.** Net per-unit spread = `applyTax(homePrice) - dcPrice` (seller pays the 5% MB tax on the home sale; buyer pays raw `dcPrice`). `applyTax`/`MB_TAX` live in `src/features/items/verdict/pricing.ts`. The existing `minSpread` filter keeps comparing against **gross** `spread` (no behavior change / no test churn); only **display + grouping totals** use net.
- **GIL/M INVESTED** = `totalNetSpread / (totalCapital / 1_000_000)`. Default group sort: gil/M desc, tie-break totalNetSpread desc.
- **"Scan cycle" = one server market-refresh run.** `cycleCount` is a consecutive-cycles counter (capped at 20): a single missed cycle drops the entry, so the next detection restarts at `New`. Labels: `1 → New`, `2–4 → Volatile`, `≥5 → Stable`. This collapses the PRD's "5+ of last 20 consecutively" + "reset on one gap" into one clean counter.
- **Freshness is Phantom-centric** (single home world = `HOME_WORLD` env, default `Phantom`). The store is keyed `(item_id, world)`; home world is implicit.
- **Coverage caveat (documented, acceptable):** the server tracks freshness only for the refresh-cache item set (hot/cold). DC Flip rows whose `(item, world)` pair isn't tracked render as `New` (no history). This is a graceful degrade, not a bug.

---

## File Structure

**New files:**
- `src/lib/spreadHistory.ts` — pure, shared by client + bot. Types `SpreadHistoryEntry`, `SpreadHistoryMap`; `spreadKey()`, `foldSpreadCycle()`, `stabilityLabel()`, `fmtAge()`, `deriveWindow()`.
- `src/lib/spreadHistory.test.ts`
- `src/features/insights/dcFlipGroups.ts` — pure. `netSpread()`, `groupByWorld()` → sorted `DcFlipGroup[]` with capital/totalNetSpread/gilPerMillion + per-item budget flags.
- `src/features/insights/dcFlipGroups.test.ts`
- `src/features/queries/useSpreadHistory.ts` — react-query hook that fetches the read-only `spread-history.json` blob (returns empty map until the server task ships).
- `src/bot/spreadHistoryStore.ts` — server compute + blob IO (used only by the final refresh-cache task).
- `src/bot/spreadHistoryStore.test.ts`

**Modified files:**
- `src/features/insights/dcFlip.ts` — add `netSpread` to `DcFlipRow`.
- `src/features/insights/dcFlip.test.ts` — assert `netSpread`.
- `src/features/insights/DcFlipView.tsx` — grouped layout, WINDOW column, capital filter, URL state, collapse-all, flat fallback, disclaimer, world deep-link filter, spread-history join.
- `src/features/dashboard/aggregate.ts` — add `groupSpreadsByWorld()` + `WorldSpreadGroup` type.
- `src/features/dashboard/aggregate.test.ts` — test the grouping (create if absent).
- `src/features/dashboard/tiles/SpreadBars.tsx` — grouped rendering with deep-links.
- `src/routes/Trading.tsx` — default to the `dcFlip` tab when `?world=` is present.
- `src/api/refresh-cache.ts` — **final task**: wire spread-history fold + persist.

**Test command (all tasks):** `npx vitest run <path>` for a single file; `npm test -- --run` for the suite. Lint gate: `npm run lint`.

---

## Task 1: Net spread on DcFlipRow

**Files:**
- Modify: `src/features/insights/dcFlip.ts`
- Test: `src/features/insights/dcFlip.test.ts`

- [ ] **Step 1: Add the failing assertion**

Append a new test to the `describe('runDcFlip', …)` block in `src/features/insights/dcFlip.test.ts`:

```ts
  it('computes netSpread = applyTax(home) - dcPrice', () => {
    const items = [mkItem(1, 'Iron Ore')];
    const dc = mkDcMarket(1, [
      { world: 'Moogle', price: 800, hq: false },
      { world: 'Phantom', price: 2400, hq: false },
    ]);
    const home = mkHomeMarket(1, 45);
    const rows = runDcFlip(items, dc, home, { homeWorld: 'Phantom', minSpread: 100, minVelocity: 0 });
    // applyTax(2400) = 2280; net = 2280 - 800 = 1480
    expect(rows[0].netSpread).toBe(1480);
    expect(rows[0].spread).toBe(1600); // gross unchanged
  });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/features/insights/dcFlip.test.ts`
Expected: FAIL — `netSpread` is `undefined` / not on type.

- [ ] **Step 3: Implement**

In `src/features/insights/dcFlip.ts`, import `applyTax` and add the field:

```ts
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { applyTax } from '../items/verdict/pricing';

export interface DcFlipRow {
  id: number;
  name: string;
  buyWorld: string;
  dcPrice: number;
  phantomPrice: number;
  spread: number;      // gross: phantomPrice - dcPrice (used by the minSpread filter)
  netSpread: number;   // after 5% MB tax on the home sale: applyTax(phantomPrice) - dcPrice
  velocity: number;
}
```

In the `out.push({…})` inside `runDcFlip`, add `netSpread`:

```ts
    out.push({
      id: item.id,
      name: item.name,
      buyWorld: cheapest.world,
      dcPrice: cheapest.price,
      phantomPrice: phantomMin,
      spread,
      netSpread: Math.round(applyTax(phantomMin) - cheapest.price),
      velocity,
    });
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/features/insights/dcFlip.test.ts`
Expected: PASS (all cases, including the existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/dcFlip.ts src/features/insights/dcFlip.test.ts
git commit -m "feat(dc-flip): add net-of-tax spread to DcFlipRow"
```

---

## Task 2: Freshness state machine + labels (`spreadHistory.ts`)

**Files:**
- Create: `src/lib/spreadHistory.ts`
- Test: `src/lib/spreadHistory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/spreadHistory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  spreadKey, foldSpreadCycle, stabilityLabel, fmtAge, deriveWindow,
  type SpreadHistoryEntry,
} from './spreadHistory';

const H = 3_600_000; // ms per hour

describe('spreadKey', () => {
  it('joins item id and world', () => {
    expect(spreadKey(5057, 'Omega')).toBe('5057|Omega');
  });
});

describe('foldSpreadCycle', () => {
  it('first detection starts at cycle 1 and stamps firstSeenAt', () => {
    const next = foldSpreadCycle(undefined, true, 1000);
    expect(next).toEqual({ firstSeenAt: 1000, cycleCount: 1 });
  });

  it('consecutive detection increments and keeps firstSeenAt', () => {
    const prev: SpreadHistoryEntry = { firstSeenAt: 1000, cycleCount: 1 };
    expect(foldSpreadCycle(prev, true, 9999)).toEqual({ firstSeenAt: 1000, cycleCount: 2 });
  });

  it('caps cycleCount at 20', () => {
    const prev: SpreadHistoryEntry = { firstSeenAt: 1000, cycleCount: 20 };
    expect(foldSpreadCycle(prev, true, 9999).cycleCount).toBe(20);
  });

  it('a missed cycle drops the entry (resets to New on next detection)', () => {
    const prev: SpreadHistoryEntry = { firstSeenAt: 1000, cycleCount: 8 };
    expect(foldSpreadCycle(prev, false, 9999)).toBeUndefined();
    // next detection after the gap starts fresh
    expect(foldSpreadCycle(undefined, true, 12000)).toEqual({ firstSeenAt: 12000, cycleCount: 1 });
  });
});

describe('stabilityLabel', () => {
  it('1 cycle → New', () => expect(stabilityLabel(1)).toBe('New'));
  it('2 cycles → Volatile', () => expect(stabilityLabel(2)).toBe('Volatile'));
  it('4 cycles → Volatile', () => expect(stabilityLabel(4)).toBe('Volatile'));
  it('5 cycles → Stable', () => expect(stabilityLabel(5)).toBe('Stable'));
  it('20 cycles → Stable', () => expect(stabilityLabel(20)).toBe('Stable'));
});

describe('fmtAge', () => {
  it('under a minute → just now', () => expect(fmtAge(0, 30_000)).toBe('just now'));
  it('minutes', () => expect(fmtAge(0, 5 * 60_000)).toBe('5m ago'));
  it('hours', () => expect(fmtAge(0, 4 * H)).toBe('4h ago'));
  it('days', () => expect(fmtAge(0, 50 * H)).toBe('2d ago'));
});

describe('deriveWindow', () => {
  it('no entry → New, fresh tone', () => {
    const w = deriveWindow(undefined, 1000);
    expect(w.label).toBe('New');
    expect(w.ageText).toBe('just now');
    expect(w.tone).toBe('green');
  });
  it('fresh + stable → green', () => {
    const w = deriveWindow({ firstSeenAt: 0, cycleCount: 8 }, 4 * H);
    expect(w.label).toBe('Stable');
    expect(w.tone).toBe('green');
    expect(w.ageText).toBe('4h ago');
  });
  it('fresh + volatile → amber', () => {
    const w = deriveWindow({ firstSeenAt: 0, cycleCount: 3 }, 1 * H);
    expect(w.label).toBe('Volatile');
    expect(w.tone).toBe('amber');
  });
  it('old (>6h) → grey regardless of label', () => {
    const w = deriveWindow({ firstSeenAt: 0, cycleCount: 8 }, 14 * H);
    expect(w.label).toBe('Stable');
    expect(w.tone).toBe('grey');
  });
  it('tooltip reports cycles seen', () => {
    const w = deriveWindow({ firstSeenAt: 0, cycleCount: 8 }, 4 * H);
    expect(w.tooltip).toBe('First seen 4h ago · Stable (seen in 8 of last 20 scans)');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/spreadHistory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/spreadHistory.ts`:

```ts
/**
 * Freshness / stability tracking for DC-flip opportunities.
 *
 * A "scan cycle" is one server market-refresh run. `cycleCount` counts
 * CONSECUTIVE cycles in which a positive spread was seen for an (item, world)
 * pair, capped at MAX_CYCLES. A single missed cycle drops the entry, so the
 * next detection restarts as `New`. Labels: 1 → New, 2–4 → Volatile, ≥5 → Stable.
 *
 * Pure module — shared by the server (folds + persists) and the client
 * (derives the WINDOW cell). No IO here.
 */

export const MAX_CYCLES = 20;
export const STABLE_MIN_CYCLES = 5;
/** Spreads older than this read as "stale" (grey), even if Stable. */
export const OLD_AGE_MS = 6 * 3_600_000;

export interface SpreadHistoryEntry {
  /** ms epoch when the current unbroken run of positive spreads began. */
  firstSeenAt: number;
  /** consecutive cycles seen, capped at MAX_CYCLES. */
  cycleCount: number;
}

export type SpreadHistoryMap = Record<string, SpreadHistoryEntry>;

export function spreadKey(itemId: number, world: string): string {
  return `${itemId}|${world}`;
}

/**
 * Fold one cycle's observation into the prior entry.
 * `sawSpread` = a positive spread was detected this cycle.
 * Returns the next entry, or `undefined` when the entry should be dropped
 * (no spread this cycle → reset).
 */
export function foldSpreadCycle(
  prev: SpreadHistoryEntry | undefined,
  sawSpread: boolean,
  nowMs: number,
): SpreadHistoryEntry | undefined {
  if (!sawSpread) return undefined;
  if (!prev) return { firstSeenAt: nowMs, cycleCount: 1 };
  return { firstSeenAt: prev.firstSeenAt, cycleCount: Math.min(prev.cycleCount + 1, MAX_CYCLES) };
}

export type Stability = 'New' | 'Volatile' | 'Stable';

export function stabilityLabel(cycleCount: number): Stability {
  if (cycleCount >= STABLE_MIN_CYCLES) return 'Stable';
  if (cycleCount >= 2) return 'Volatile';
  return 'New';
}

export function fmtAge(firstSeenAt: number, nowMs: number): string {
  const ms = Math.max(0, nowMs - firstSeenAt);
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export type WindowTone = 'green' | 'amber' | 'grey';

export interface WindowCell {
  label: Stability;
  ageText: string;
  tone: WindowTone;
  /** full hover text */
  tooltip: string;
  /** raw cycle count for callers that want it */
  cycleCount: number;
}

/**
 * Derive the WINDOW cell for a row. `entry` is the persisted state for this
 * (item, world); `undefined` means no history → treated as New / just now.
 * Tone: grey when older than OLD_AGE_MS, else green when Stable/New, amber when Volatile.
 */
export function deriveWindow(entry: SpreadHistoryEntry | undefined, nowMs: number): WindowCell {
  const firstSeenAt = entry?.firstSeenAt ?? nowMs;
  const cycleCount = entry?.cycleCount ?? 1;
  const label = stabilityLabel(cycleCount);
  const ageText = fmtAge(firstSeenAt, nowMs);
  const old = nowMs - firstSeenAt > OLD_AGE_MS;
  const tone: WindowTone = old ? 'grey' : label === 'Volatile' ? 'amber' : 'green';
  const tooltip = `First seen ${ageText} · ${label} (seen in ${cycleCount} of last ${MAX_CYCLES} scans)`;
  return { label, ageText, tone, tooltip, cycleCount };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/spreadHistory.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/spreadHistory.ts src/lib/spreadHistory.test.ts
git commit -m "feat(dc-flip): freshness/stability state machine + WINDOW derivation"
```

---

## Task 3: World grouping + trip economics (`dcFlipGroups.ts`)

**Files:**
- Create: `src/features/insights/dcFlipGroups.ts`
- Test: `src/features/insights/dcFlipGroups.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/insights/dcFlipGroups.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupByWorld, gilPerMillion, type DcFlipGroup } from './dcFlipGroups';
import type { DcFlipRow } from './dcFlip';

function row(p: Partial<DcFlipRow> & { id: number; buyWorld: string; dcPrice: number; netSpread: number }): DcFlipRow {
  return {
    name: `item-${p.id}`,
    phantomPrice: p.dcPrice + p.netSpread,
    spread: p.netSpread,
    velocity: 1,
    ...p,
  } as DcFlipRow;
}

describe('gilPerMillion', () => {
  it('netSpread per million of capital', () => {
    expect(gilPerMillion(278_000, 637_000)).toBeCloseTo(436.4, 0);
  });
  it('zero capital → 0 (no divide-by-zero)', () => {
    expect(gilPerMillion(100, 0)).toBe(0);
  });
});

describe('groupByWorld', () => {
  it('groups rows by buyWorld and sums capital + net spread', () => {
    const rows = [
      row({ id: 1, buyWorld: 'Omega', dcPrice: 499_000, netSpread: 122_000 }),
      row({ id: 2, buyWorld: 'Omega', dcPrice: 138_000, netSpread: 147_000 }),
      row({ id: 3, buyWorld: 'Louisoix', dcPrice: 200_000, netSpread: 85_000 }),
    ];
    const groups = groupByWorld(rows, {});
    const omega = groups.find((g) => g.world === 'Omega')!;
    expect(omega.itemCount).toBe(2);
    expect(omega.totalCapital).toBe(637_000);
    expect(omega.totalNetSpread).toBe(269_000);
    expect(omega.fitCount).toBe(2);
    expect(omega.rows.every((r) => r.withinBudget)).toBe(true);
  });

  it('sorts groups by gil/M desc, tie-break net spread desc', () => {
    const rows = [
      // World A: 100k spread on 1M capital → 100 gil/M
      row({ id: 1, buyWorld: 'A', dcPrice: 1_000_000, netSpread: 100_000 }),
      // World B: 300k spread on 1M capital → 300 gil/M (higher)
      row({ id: 2, buyWorld: 'B', dcPrice: 1_000_000, netSpread: 300_000 }),
    ];
    const groups = groupByWorld(rows, {});
    expect(groups.map((g) => g.world)).toEqual(['B', 'A']);
  });

  it('orders rows within a group by net spread desc', () => {
    const rows = [
      row({ id: 1, buyWorld: 'Omega', dcPrice: 10, netSpread: 50 }),
      row({ id: 2, buyWorld: 'Omega', dcPrice: 10, netSpread: 200 }),
    ];
    const groups = groupByWorld(rows, {});
    expect(groups[0].rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it('maxCapital grays out rows once running buy total exceeds the cap', () => {
    const rows = [
      row({ id: 1, buyWorld: 'Omega', dcPrice: 800_000, netSpread: 200_000 }), // fits (running 800k)
      row({ id: 2, buyWorld: 'Omega', dcPrice: 300_000, netSpread: 150_000 }), // would push to 1.1M → over
      row({ id: 3, buyWorld: 'Omega', dcPrice: 150_000, netSpread: 100_000 }), // over
    ];
    const groups = groupByWorld(rows, { maxCapital: 1_000_000 });
    const omega = groups[0];
    expect(omega.itemCount).toBe(3);
    expect(omega.fitCount).toBe(1);
    expect(omega.rows.map((r) => r.withinBudget)).toEqual([true, false, false]);
    // header totals reflect only the fitting rows
    expect(omega.totalCapital).toBe(800_000);
    expect(omega.totalNetSpread).toBe(200_000);
  });

  it('no maxCapital → all rows within budget', () => {
    const rows = [row({ id: 1, buyWorld: 'Omega', dcPrice: 9_000_000, netSpread: 1 })];
    const groups = groupByWorld(rows, {});
    expect(groups[0].rows[0].withinBudget).toBe(true);
    expect(groups[0].fitCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/features/insights/dcFlipGroups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/insights/dcFlipGroups.ts`:

```ts
import type { DcFlipRow } from './dcFlip';

export interface GroupedRow extends DcFlipRow {
  /** false when maxCapital is set and this row's buy price pushes the running total over the cap. */
  withinBudget: boolean;
}

export interface DcFlipGroup {
  world: string;
  rows: GroupedRow[];        // ordered by netSpread desc
  itemCount: number;         // total matching items in the group
  fitCount: number;          // items within the capital cap (== itemCount when no cap)
  totalCapital: number;      // sum of dcPrice over the FITTING rows
  totalNetSpread: number;    // sum of netSpread over the FITTING rows
  gilPerMillion: number;     // totalNetSpread per 1M of totalCapital
}

export interface GroupOpts {
  /** Max gil to spend buying in one trip. Undefined/0 = no cap. */
  maxCapital?: number;
}

export function gilPerMillion(totalNetSpread: number, totalCapital: number): number {
  if (totalCapital <= 0) return 0;
  return totalNetSpread / (totalCapital / 1_000_000);
}

export function groupByWorld(rows: DcFlipRow[], opts: GroupOpts): DcFlipGroup[] {
  const cap = opts.maxCapital && opts.maxCapital > 0 ? opts.maxCapital : Infinity;

  const byWorld = new Map<string, DcFlipRow[]>();
  for (const r of rows) {
    const list = byWorld.get(r.buyWorld) ?? [];
    list.push(r);
    byWorld.set(r.buyWorld, list);
  }

  const groups: DcFlipGroup[] = [];
  for (const [world, list] of byWorld) {
    const ordered = [...list].sort((a, b) => b.netSpread - a.netSpread);

    let running = 0;
    let totalCapital = 0;
    let totalNetSpread = 0;
    let fitCount = 0;
    const groupedRows: GroupedRow[] = ordered.map((r) => {
      const within = running + r.dcPrice <= cap;
      if (within) {
        running += r.dcPrice;
        totalCapital += r.dcPrice;
        totalNetSpread += r.netSpread;
        fitCount += 1;
      }
      return { ...r, withinBudget: within };
    });

    groups.push({
      world,
      rows: groupedRows,
      itemCount: ordered.length,
      fitCount,
      totalCapital,
      totalNetSpread,
      gilPerMillion: gilPerMillion(totalNetSpread, totalCapital),
    });
  }

  return groups.sort((a, b) =>
    b.gilPerMillion - a.gilPerMillion || b.totalNetSpread - a.totalNetSpread,
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/features/insights/dcFlipGroups.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/dcFlipGroups.ts src/features/insights/dcFlipGroups.test.ts
git commit -m "feat(dc-flip): world grouping + trip economics (gil/M, capital cap)"
```

---

## Task 4: Read-only spread-history hook (`useSpreadHistory.ts`)

**Files:**
- Create: `src/features/queries/useSpreadHistory.ts`

This hook fetches the `spread-history.json` blob (written later by Task 9). Until that ships the blob is absent, so the hook resolves to an **empty map** and the WINDOW column degrades to `New` — no errors. This is the only place the client reads freshness; it is a static blob GET, not a lambda.

- [ ] **Step 1: Implement (no unit test — thin IO wrapper, exercised via DcFlipView)**

Create `src/features/queries/useSpreadHistory.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { SpreadHistoryMap } from '../../lib/spreadHistory';

/**
 * Read-only fetch of the server-built spread-freshness blob.
 * Resolves to {} when the blob is absent (before the server task ships, or in
 * dev), so the WINDOW column gracefully shows "New". Refetched every 5 min to
 * track the refresh cadence; failures are swallowed to {}.
 */
async function fetchSpreadHistory(): Promise<SpreadHistoryMap> {
  const env = (import.meta as any).env ?? {};
  const url: string = env.VITE_SPREAD_HISTORY_URL || '/data/spread-history.json';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return {};
    return (await res.json()) as SpreadHistoryMap;
  } catch {
    return {};
  }
}

export function useSpreadHistory() {
  return useQuery({
    queryKey: ['spread-history'],
    queryFn: fetchSpreadHistory,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/useSpreadHistory.ts
git commit -m "feat(dc-flip): read-only spread-history blob hook (degrades to empty)"
```

---

## Task 5: DcFlipView — capital filter + URL state

**Files:**
- Modify: `src/features/insights/DcFlipView.tsx`

Add the `Max trip capital` input alongside the existing filters, persist all three filters + the destination-world deep-link to the URL via `useSearchParams`, and read initial values from the URL. Grouping/WINDOW come in Tasks 6–7; this task only wires state + URL.

- [ ] **Step 1: Add imports and URL-backed state**

At the top of `src/features/insights/DcFlipView.tsx` add the router import:

```ts
import { useSearchParams } from 'react-router-dom';
```

Inside `DcFlipView`, replace the three `useState` filter lines (currently `minSpread`, `minVelocity`, and add capital) with URL-seeded state. After `const { world, dc } = useSettingsStore();` and the existing snapshot/density lines, insert:

```ts
  const [searchParams, setSearchParams] = useSearchParams();
  const numParam = (key: string, dflt: number) => {
    const v = Number(searchParams.get(key));
    return Number.isFinite(v) && v > 0 ? v : dflt;
  };
  const worldFilter = searchParams.get('world'); // destination deep-link from dashboard
```

Change the filter `useState` initializers to read from the URL:

```ts
  const [minSpread, setMinSpread] = useState(() => numParam('minSpread', 10_000));
  const [minVelocity, setMinVelocity] = useState(() => numParam('minVelocity', 1));
  const [maxCapital, setMaxCapital] = useState(() => {
    const v = Number(searchParams.get('maxCapital'));
    return Number.isFinite(v) && v > 0 ? v : 0; // 0 = no cap
  });
```

Add a helper to sync a filter to the URL (place above the `return`):

```ts
  function syncParam(key: string, value: number) {
    setSearchParams((p) => {
      if (value > 0) p.set(key, String(value));
      else p.delete(key);
      return p;
    }, { replace: true });
  }
```

- [ ] **Step 2: Wire the existing inputs to also sync the URL**

Update the Min spread input's `onChange`:

```tsx
              onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setMinSpread(v); syncParam('minSpread', v); }}
```

Update the Min velocity input's `onChange`:

```tsx
              onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setMinVelocity(v); syncParam('minVelocity', v); }}
```

- [ ] **Step 3: Add the Max trip capital input**

Inside the `<div className="flex flex-wrap items-end gap-3">` filter group, after the Min velocity `<label>`, add:

```tsx
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low">Max trip capital (gil)</span>
            <input
              type="number" inputMode="decimal" min={0} step={10000}
              value={maxCapital || ''}
              placeholder="no cap"
              onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setMaxCapital(v); syncParam('maxCapital', v); }}
              className="mt-1 block w-32 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
            />
          </label>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`maxCapital`, `worldFilter`, `syncParam` may be reported as unused until Task 6 — if lint blocks on unused vars, proceed directly to Task 6 in the same session and commit together. Otherwise commit now.)

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/DcFlipView.tsx
git commit -m "feat(dc-flip): max-capital filter + URL-persisted filters & world deep-link"
```

---

## Task 6: DcFlipView — grouped layout, flat fallback, collapse-all

**Files:**
- Modify: `src/features/insights/DcFlipView.tsx`

Render results as collapsible per-destination-world groups (matching the Discover card idiom: bordered `bg-bg-card`, full-width header button, left chevron). Keep the existing flat table as the **single-world-single-item** fallback. Add a global Collapse-all / Expand-all toggle (default expanded). Apply the `worldFilter` deep-link.

- [ ] **Step 1: Imports + grouped data**

Add imports:

```ts
import { groupByWorld } from './dcFlipGroups';
```

Replace the `lm`/`useLoadMore` section's *source* with grouped data. After `sortedRows` is computed, build groups and apply the world deep-link filter:

```ts
  const groups = useMemo(() => {
    const base = worldFilter ? sortedRows.filter((r) => r.buyWorld === worldFilter) : sortedRows;
    return groupByWorld(base, { maxCapital });
  }, [sortedRows, worldFilter, maxCapital]);

  // Flat fallback ONLY when exactly one world AND that world has exactly one item.
  const isFlat = groups.length === 1 && groups[0].itemCount === 1;
```

Add collapse state (a Set of collapsed world names; default = none collapsed = all expanded):

```ts
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleGroup(world: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(world) ? next.delete(world) : next.add(world);
      return next;
    });
  }
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.world));
  function toggleAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.world)));
  }
```

> Note: `useLoadMore` paged the flat list. Grouped view shows all groups (a single DC has ≤ ~10 worlds, each with bounded items). Keep `useLoadMore`/`lm` **only** for the flat-fallback branch; the grouped branch does not page. If `lm` becomes unused in the grouped path, that's fine — it stays referenced by the fallback.

- [ ] **Step 2: Add the Collapse/Expand-all toggle above results**

Immediately before the results block (after the disclaimer paragraph / status banners, before `{run.data && sortedRows.length > 0 && (…)}`), add:

```tsx
      {run.data && groups.length > 0 && !isFlat && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">
            {groups.length} destination world{groups.length === 1 ? '' : 's'}
            {worldFilter ? ` · filtered to ${worldFilter}` : ''}
          </span>
          <button
            type="button"
            onClick={toggleAll}
            className="font-mono text-[10px] tracking-widest uppercase text-text-dim hover:text-aether transition-colors"
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      )}
```

- [ ] **Step 3: Render the grouped table**

Replace the existing `{run.data && sortedRows.length > 0 && ( …flat table… )}` block with a branch: flat fallback when `isFlat`, else grouped. Extract a `WorldGroupCard` inline component in the same file (above `DcFlipView`) so each group renders its own table. The card header shows world name, item count, and trip economics; the body is the item table (columns wired in Task 7).

Add this component above `export function DcFlipView()`:

```tsx
import { fmtGil } from '../../lib/format';

function WorldGroupCard({
  group, collapsed, onToggle, rowY, world, children,
}: {
  group: import('./dcFlipGroups').DcFlipGroup;
  collapsed: boolean;
  onToggle: () => void;
  rowY: string;
  world: string;
  children: React.ReactNode;
}) {
  const overBudget = group.fitCount < group.itemCount;
  return (
    <div className="border border-border-base bg-bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg-card-hi transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="text-text-dim">{collapsed ? '▸' : '▾'}</span>
          <span className="font-display text-[15px] text-text-cream uppercase tracking-wide truncate">{group.world}</span>
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-low shrink-0">
            {group.itemCount} item{group.itemCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="font-mono text-[11px] text-text-low tabular-nums shrink-0 hidden sm:block">
          Capital <span className="text-text-cream">{fmtGil(group.totalCapital)}</span>
          {' · '}Spread <span className="text-jade">+{fmtGil(group.totalNetSpread)}</span>
          {' · '}<span className="text-aether">{Math.round(group.gilPerMillion)}</span> gil/M
        </div>
      </button>
      {overBudget && !collapsed && (
        <div className="px-4 py-1.5 border-t border-border-base font-mono text-[10px] tracking-widest uppercase text-gold/80">
          {group.fitCount} of {group.itemCount} items fit your budget — showing top {group.fitCount} by spread
        </div>
      )}
      {!collapsed && (
        <div className="border-t border-border-base overflow-x-auto">{children}</div>
      )}
    </div>
  );
}
```

Then render (replacing the old results block; `rowY`, `world` are already in scope, plus a `renderRows` helper added in Task 7):

```tsx
      {run.data && groups.length > 0 && isFlat && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          {/* flat fallback: single world, single item — reuse the grouped table body */}
          {renderGroupTable(groups[0])}
        </div>
      )}

      {run.data && groups.length > 0 && !isFlat && (
        <div className="space-y-3">
          {groups.map((g) => (
            <WorldGroupCard
              key={g.world}
              group={g}
              collapsed={collapsed.has(g.world)}
              onToggle={() => toggleGroup(g.world)}
              rowY={rowY}
              world={world}
            >
              {renderGroupTable(g)}
            </WorldGroupCard>
          ))}
        </div>
      )}
```

> `renderGroupTable(group)` is defined in Task 7 (it owns the columns incl. WINDOW). For this task, add a temporary stub right after the `WorldGroupCard` component so the file compiles:
>
> ```tsx
> function renderGroupTable(_group: import('./dcFlipGroups').DcFlipGroup): React.ReactNode { return null; }
> ```
> Task 7 replaces this stub with the real table.

Keep the existing empty-state (`sortedRows.length === 0`) block as-is.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (table renders empty via stub).

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/DcFlipView.tsx
git commit -m "feat(dc-flip): grouped world cards, collapse-all, single-item flat fallback"
```

---

## Task 7: DcFlipView — WINDOW column + group item table

**Files:**
- Modify: `src/features/insights/DcFlipView.tsx`

Implement `renderGroupTable(group)` (replacing the Task-6 stub): the per-group item table with columns `# · ITEM · BUY ON · DC · {world} · SPREAD(net) · VEL · WINDOW`. Net spread in the SPREAD column. Greyed rows when `!withinBudget`. WINDOW cell = COMFY text (`4h · Stable`) / COMPACT dot, colored by tone, tooltip on hover.

- [ ] **Step 1: Imports + spread-history join + clock**

Add imports:

```ts
import { useSpreadHistory } from '../queries/useSpreadHistory';
import { deriveWindow, spreadKey, type WindowTone } from '../../lib/spreadHistory';
```

Inside `DcFlipView`, after the groups memo, load history and stamp a render-time clock:

```ts
  const spreadHistory = useSpreadHistory();
  const nowMs = run.data ? Date.now() : 0; // stamped per scan render
```

> `Date.now()` is fine in component render here (not in a workflow script). The age only needs to be approximate.

- [ ] **Step 2: Tone → classes helper + WINDOW cell**

Above `DcFlipView`, add:

```tsx
const TONE_TEXT: Record<WindowTone, string> = {
  green: 'text-jade',
  amber: 'text-gold',
  grey: 'text-text-low',
};
const TONE_DOT: Record<WindowTone, string> = {
  green: 'bg-jade',
  amber: 'bg-gold',
  grey: 'bg-text-low',
};
```

- [ ] **Step 3: Replace the stub with the real table**

Because `renderGroupTable` needs `density`, `world`, `spreadHistory`, and `nowMs` from `DcFlipView`'s scope, define it as a closure **inside** `DcFlipView` (move it in, replacing the top-level stub). Place it after `nowMs`:

```tsx
  function renderGroupTable(group: import('./dcFlipGroups').DcFlipGroup): React.ReactNode {
    const histMap = spreadHistory.data ?? {};
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
            <th className="px-3 py-2 text-right w-8">#</th>
            <th className="px-3 py-2 text-left">Item</th>
            <th className="px-3 py-2 text-left">Buy on</th>
            <th className="px-3 py-2 text-right">DC</th>
            <th className="px-3 py-2 text-right">{world}</th>
            <th className="px-3 py-2 text-right">Spread</th>
            <th className="px-3 py-2 text-right hidden md:table-cell">Vel</th>
            <th className="px-3 py-2 text-left">Window</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r, i) => {
            const w = deriveWindow(histMap[spreadKey(r.id, r.buyWorld)], nowMs);
            const dim = r.withinBudget ? '' : 'opacity-40';
            return (
              <tr key={r.id} className={`border-t border-border-base hover:bg-bg-card-hi transition-colors ${dim}`}>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <div className="flex items-center gap-2">
                    <ItemNameLinks id={r.id} name={r.name} />
                    <CopyButton text={r.name} />
                  </div>
                </td>
                <td className={`px-3 ${rowY} text-aether`}>{r.buyWorld}</td>
                <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.dcPrice)}</td>
                <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.phantomPrice)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>+{fmtGil(r.netSpread)}</td>
                <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{r.velocity.toFixed(1)}/d</td>
                <td className={`px-3 ${rowY}`} title={w.tooltip}>
                  {density === 'compact' ? (
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${TONE_DOT[w.tone]}`} aria-label={w.tooltip} />
                  ) : (
                    <span className={`font-mono text-[11px] ${TONE_TEXT[w.tone]}`}>{w.ageText.replace(' ago', '')} · {w.label}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
```

Delete the top-level `renderGroupTable` stub from Task 6. Ensure the `density` value is in scope (it already is: `const density = useUiStore((s) => s.density);`).

- [ ] **Step 4: Add the disclaimer line below results**

After the grouped/flat results blocks (still inside the outer `<div className="space-y-4">`), add:

```tsx
      {run.data && groups.length > 0 && (
        <p className="font-mono text-[10px] text-text-low">
          Prices refresh every ~5 minutes. Verify listings on the destination MB before buying.
        </p>
      )}
```

- [ ] **Step 5: Typecheck, lint, run the file's tests**

Run: `npx tsc --noEmit && npm run lint && npx vitest run src/features/insights/`
Expected: no type/lint errors; insights tests pass.

- [ ] **Step 6: Manual smoke (optional but recommended)**

Run: `npm run dev`, open `/trading` (DC Flip tab). Verify: groups render with headers (Capital/Spread/gil/M), rows show `WINDOW` as `… · New` (history empty pre-server), collapse-all toggles, capital cap greys rows + shows the budget note, COMPACT mode shows dots. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/features/insights/DcFlipView.tsx
git commit -m "feat(dc-flip): WINDOW freshness column + net-spread group table + disclaimer"
```

---

## Task 8: Dashboard CROSS-WORLD SPREAD — group by world + deep-links

**Files:**
- Modify: `src/features/dashboard/aggregate.ts`
- Modify: `src/features/dashboard/tiles/SpreadBars.tsx`
- Test: `src/features/dashboard/aggregate.test.ts`

Group the existing `WorldSpread[]` by `bestWorld`, show per-world trip totals (item count, total net spread, gil/M), and link each world header to `/trading?world=<world>`.

- [ ] **Step 1: Write the failing test for the grouping helper**

Append to `src/features/dashboard/aggregate.test.ts` (create the file with this content if it does not exist — add `import { groupSpreadsByWorld } from './aggregate';` and any existing imports):

```ts
import { describe, it, expect } from 'vitest';
import { groupSpreadsByWorld, type WorldSpread } from './aggregate';

function sp(p: Partial<WorldSpread> & { id: number; bestWorld: string; spread: number; bestPrice: number }): WorldSpread {
  return { name: `i${p.id}`, homeFloor: p.bestPrice + p.spread, spreadPct: 0.1, velocity: 1, ...p };
}

describe('groupSpreadsByWorld', () => {
  it('groups by bestWorld with totals + gil/M, sorted by gil/M desc', () => {
    const rows = [
      sp({ id: 1, bestWorld: 'Omega', spread: 200_000, bestPrice: 500_000 }),
      sp({ id: 2, bestWorld: 'Omega', spread: 78_000, bestPrice: 137_000 }),
      sp({ id: 3, bestWorld: 'Louisoix', spread: 85_000, bestPrice: 200_000 }),
    ];
    const groups = groupSpreadsByWorld(rows);
    const omega = groups.find((g) => g.world === 'Omega')!;
    expect(omega.itemCount).toBe(2);
    expect(omega.totalSpread).toBe(278_000);
    expect(omega.totalCapital).toBe(637_000);
    expect(Math.round(omega.gilPerMillion)).toBe(436);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/features/dashboard/aggregate.test.ts`
Expected: FAIL — `groupSpreadsByWorld` not exported.

- [ ] **Step 3: Implement the helper**

In `src/features/dashboard/aggregate.ts`, after the `spreadByWorld` function, add:

```ts
export interface WorldSpreadGroup {
  world: string;
  items: WorldSpread[];
  itemCount: number;
  totalSpread: number;   // sum of per-item spread (already net? — see note)
  totalCapital: number;  // sum of bestPrice
  gilPerMillion: number;
}

/**
 * Group dashboard cross-world spreads by destination world for the trip-summary
 * widget. Sorted by gil/M invested desc, tie-break total spread desc.
 * Note: WorldSpread.spread here is the dashboard's gross gap (homeFloor-bestPrice);
 * the dashboard widget is a presentational summary, kept consistent with the
 * existing tile which already shows that figure.
 */
export function groupSpreadsByWorld(rows: WorldSpread[]): WorldSpreadGroup[] {
  const byWorld = new Map<string, WorldSpread[]>();
  for (const r of rows) {
    const list = byWorld.get(r.bestWorld) ?? [];
    list.push(r);
    byWorld.set(r.bestWorld, list);
  }
  const groups: WorldSpreadGroup[] = [];
  for (const [world, items] of byWorld) {
    const totalSpread = items.reduce((s, r) => s + r.spread, 0);
    const totalCapital = items.reduce((s, r) => s + r.bestPrice, 0);
    const gilPerMillion = totalCapital > 0 ? totalSpread / (totalCapital / 1_000_000) : 0;
    groups.push({ world, items, itemCount: items.length, totalSpread, totalCapital, gilPerMillion });
  }
  return groups.sort((a, b) => b.gilPerMillion - a.gilPerMillion || b.totalSpread - a.totalSpread);
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npx vitest run src/features/dashboard/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-render SpreadBars grouped**

Replace the body of `src/features/dashboard/tiles/SpreadBars.tsx` with a grouped version:

```tsx
import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import { groupSpreadsByWorld, type WorldSpread } from '../aggregate';

/** Items cheaper on another world in your DC — buy there, resell at home. Grouped by destination world. */
export function SpreadBars({ spreads, homeWorld }: { spreads: WorldSpread[]; homeWorld: string }) {
  const groups = groupSpreadsByWorld(spreads);
  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Cross-world spread</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">buy off-world · sell on {homeWorld}</div>
      </div>
      {groups.length === 0 ? (
        <div className="text-text-low text-sm italic py-6 text-center">
          No tracked item is currently cheaper on another {homeWorld} DC world.
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.world}>
              <Link
                to={`/trading?world=${encodeURIComponent(g.world)}`}
                className="group flex items-baseline justify-between gap-2"
              >
                <span className="font-display text-[13px] text-text-cream group-hover:text-aether group-hover:underline decoration-1 underline-offset-4 truncate min-w-0">
                  {g.world} <span className="font-mono text-[10px] text-text-low">({g.itemCount} item{g.itemCount === 1 ? '' : 's'})</span>
                </span>
                <span className="font-mono text-[11px] tabular-nums shrink-0">
                  <span className="text-jade">+{fmtGil(g.totalSpread)}</span>
                  <span className="text-text-low"> · {Math.round(g.gilPerMillion)} gil/M</span>
                </span>
              </Link>
              <ul className="mt-1 space-y-0.5 pl-2 border-l border-border-base">
                {g.items.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-2">
                    <Link to={`/item/${s.id}`} className="font-display text-[11px] text-text-dim hover:text-aether truncate min-w-0">{s.name}</Link>
                    <span className="font-mono text-[10px] text-text-low tabular-nums shrink-0">
                      {fmtGil(s.bestPrice)} → {fmtGil(s.homeFloor)} · +{fmtGil(s.spread)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npx vitest run src/features/dashboard/`
Expected: no errors; tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/dashboard/aggregate.ts src/features/dashboard/aggregate.test.ts src/features/dashboard/tiles/SpreadBars.tsx
git commit -m "feat(dashboard): group cross-world spread by world with trip totals + deep-links"
```

---

## Task 9: Trading route — land on DC Flip when deep-linked

**Files:**
- Modify: `src/routes/Trading.tsx`

When `?world=` is present (dashboard deep-link), default the active tab to `dcFlip` so `/trading?world=Omega` lands correctly.

- [ ] **Step 1: Read the world param and seed the tab**

Open `src/routes/Trading.tsx`. It uses `useState<Tab>` for the active tab and already reads a `preset` param. Add `useSearchParams` (if not already imported) and seed the initial tab:

```ts
import { useSearchParams } from 'react-router-dom';
```

Where the tab state is declared (currently `const [tab, setTab] = useState<Tab>(<default>)`), change the initializer to honor the deep-link:

```ts
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (searchParams.get('world') ? 'dcFlip' : <existing-default>));
```

> Replace `<existing-default>` with whatever the current default is (e.g. `'dcFlip'` or the first tab). If the default is already `'dcFlip'`, this task is a no-op verification — confirm and skip the commit.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`, open `/trading?world=Omega`. Verify the DC Flip tab is active and results are filtered to Omega with the "filtered to Omega" label. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Trading.tsx
git commit -m "feat(trading): deep-link ?world= lands on the DC Flip tab"
```

---

## Task 10: Server freshness persistence — compute module (`spreadHistoryStore.ts`)

**Files:**
- Create: `src/bot/spreadHistoryStore.ts`
- Test: `src/bot/spreadHistoryStore.test.ts`

Pure compute of "which (item, world) pairs have a positive net spread vs the home floor this cycle," folded into the prior `SpreadHistoryMap`. Blob IO is a thin wrapper deferred to Task 11 (so this is fully testable without `@vercel/blob`).

- [ ] **Step 1: Write the failing test**

Create `src/bot/spreadHistoryStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { foldCycleForBundle } from './spreadHistoryStore';
import type { MarketData } from '../lib/universalis';
import type { SpreadHistoryMap } from '../lib/spreadHistory';
import { spreadKey } from '../lib/spreadHistory';

function mkItem(listings: { world: string; price: number }[]): MarketData[string] {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: listings.map((l) => ({ world: l.world, price: l.price, hq: false })),
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

describe('foldCycleForBundle', () => {
  it('records a positive net spread vs the home floor as cycle 1', () => {
    const dc: MarketData = {
      100: mkItem([
        { world: 'Omega', price: 800 },
        { world: 'Phantom', price: 2400 },
      ]),
    };
    const next = foldCycleForBundle(dc, 'Phantom', {}, 1000);
    // applyTax(2400)=2280 > 800 → positive
    expect(next[spreadKey(100, 'Omega')]).toEqual({ firstSeenAt: 1000, cycleCount: 1 });
    // home world itself is never an entry
    expect(next[spreadKey(100, 'Phantom')]).toBeUndefined();
  });

  it('increments an existing consecutive entry', () => {
    const dc: MarketData = { 100: mkItem([{ world: 'Omega', price: 800 }, { world: 'Phantom', price: 2400 }]) };
    const prev: SpreadHistoryMap = { [spreadKey(100, 'Omega')]: { firstSeenAt: 500, cycleCount: 3 } };
    const next = foldCycleForBundle(dc, 'Phantom', prev, 9999);
    expect(next[spreadKey(100, 'Omega')]).toEqual({ firstSeenAt: 500, cycleCount: 4 });
  });

  it('drops an entry whose spread vanished this cycle', () => {
    const dc: MarketData = { 100: mkItem([{ world: 'Omega', price: 2500 }, { world: 'Phantom', price: 2400 }]) };
    const prev: SpreadHistoryMap = { [spreadKey(100, 'Omega')]: { firstSeenAt: 500, cycleCount: 3 } };
    const next = foldCycleForBundle(dc, 'Phantom', prev, 9999);
    expect(next[spreadKey(100, 'Omega')]).toBeUndefined();
  });

  it('ignores items lacking a home-world listing', () => {
    const dc: MarketData = { 100: mkItem([{ world: 'Omega', price: 800 }]) };
    const next = foldCycleForBundle(dc, 'Phantom', {}, 1000);
    expect(Object.keys(next)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/bot/spreadHistoryStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the compute (pure)**

Create `src/bot/spreadHistoryStore.ts`:

```ts
import type { MarketData } from '../lib/universalis';
import { applyTax } from '../features/items/verdict/pricing';
import { foldSpreadCycle, spreadKey, type SpreadHistoryMap } from '../lib/spreadHistory';

/**
 * Fold one refresh cycle into the prior spread-history map.
 *
 * For each item in the DC market data we find the home-world floor and, for every
 * OTHER world's cheapest listing, decide whether a positive NET spread exists
 * (applyTax(homeFloor) - otherPrice > 0). Pairs seen this cycle are incremented;
 * pairs in `prev` not seen this cycle are dropped (reset to New on next detection).
 *
 * Pure — no IO. Keyed (item_id, world); home world is implicit (`homeWorld`).
 */
export function foldCycleForBundle(
  dc: MarketData,
  homeWorld: string,
  prev: SpreadHistoryMap,
  nowMs: number,
): SpreadHistoryMap {
  const next: SpreadHistoryMap = {};
  const seen = new Set<string>();

  for (const [idStr, item] of Object.entries(dc)) {
    const id = Number(idStr);
    const listings = item.worldListings;
    if (!listings || listings.length === 0) continue;

    // home floor
    let homeFloor = Infinity;
    const cheapestByWorld = new Map<string, number>();
    for (const l of listings) {
      if (l.world === homeWorld) homeFloor = Math.min(homeFloor, l.price);
      else {
        const cur = cheapestByWorld.get(l.world);
        if (cur == null || l.price < cur) cheapestByWorld.set(l.world, l.price);
      }
    }
    if (!Number.isFinite(homeFloor)) continue;

    const netHome = applyTax(homeFloor);
    for (const [world, price] of cheapestByWorld) {
      if (netHome - price <= 0) continue;
      const key = spreadKey(id, world);
      seen.add(key);
      const folded = foldSpreadCycle(prev[key], true, nowMs);
      if (folded) next[key] = folded;
    }
  }

  // Pairs present in prev but not seen this cycle are intentionally dropped.
  return next;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/bot/spreadHistoryStore.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/bot/spreadHistoryStore.ts src/bot/spreadHistoryStore.test.ts
git commit -m "feat(dc-flip): server-side spread-history cycle fold (pure)"
```

---

## Task 11: Wire freshness into refresh-cache + persist blob (DEFERRED — do last)

> **⚠️ Coordination gate:** This task edits `src/api/refresh-cache.ts` and relies on `writeBlobJson`/`readBlobJson` in `src/bot/marketCache.ts` — both are being rewritten by another agent (hot/cold tiering). **Do not start this task until that work has landed** (those helpers exist on the branch and the working tree is clean). Until then, Tasks 1–10 ship a fully functional feature with the WINDOW column degrading to `New`.

**Files:**
- Modify: `src/api/refresh-cache.ts`
- (Depends on) `src/bot/marketCache.ts` exporting `writeBlobJson(name, data)` and `readBlobJson<T>(name)`.

**Precondition check (run first):**

```bash
git status --short            # working tree clean for refresh-cache.ts / marketCache.ts
grep -n "writeBlobJson\|readBlobJson" src/bot/marketCache.ts
```
Expected: both helpers present; `refresh-cache.ts` shows no uncommitted edits from the other agent.

- [ ] **Step 1: Import the fold + blob helpers**

In `src/api/refresh-cache.ts`, extend the imports:

```ts
import { writeMarketCache, writeBlobJson, readBlobJson } from '../bot/marketCache';
import { foldCycleForBundle } from '../bot/spreadHistoryStore';
import type { SpreadHistoryMap } from '../lib/spreadHistory';
```

- [ ] **Step 2: Fold + persist after the market cache write**

After the `writeMarketCache(...)` call (and after the existing hot-id derivation, if present), add:

```ts
    // Spread-freshness rolling state. Cycle = this refresh run.
    const prevHist = (await readBlobJson<SpreadHistoryMap>('spread-history.json')) ?? {};
    const nextHist = foldCycleForBundle(bundle.dc, WORLD, prevHist, Date.now());
    await writeBlobJson('spread-history.json', nextHist);
    console.log(`[refresh:${tier}] spread-history pairs: ${Object.keys(nextHist).length}`);
```

> `bundle` is the `MarketBundle` already in scope from `fetchMarketForOutputs`. `WORLD` is the existing home-world constant. Both hot and cold runs fold; the hot run's ~5-min cadence drives the `cycleCount` clock, so the disclaimer "~5 minutes" is accurate.

- [ ] **Step 3: Expose the blob URL to the client**

The client hook (`useSpreadHistory`) reads `VITE_SPREAD_HISTORY_URL` (falling back to `/data/spread-history.json`). After the first successful refresh, note the blob's public URL and set `VITE_SPREAD_HISTORY_URL` in the Vercel project env (mirroring how `VITE_CACHE_HOT_URL`/`VITE_CACHE_COLD_URL` are configured). Document this in the commit body. No code change needed if the deterministic blob name resolves under the existing blob host the client already uses.

- [ ] **Step 4: Build the API bundle (confirms esbuild picks up the new module)**

Run: `npm run build:api`
Expected: `refresh-cache.mjs` rebuilds with the folded module inlined (esbuild `--bundle`); no new lambda added — still 12 functions.

- [ ] **Step 5: Typecheck + full test suite**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/api/refresh-cache.ts
git commit -m "feat(dc-flip): persist spread-freshness blob during refresh-cache run

Folds positive net-spread (item,world) pairs vs the home floor into a rolling
20-cycle history each refresh run; client WINDOW column reads it read-only.
Set VITE_SPREAD_HISTORY_URL to the blob's public URL in Vercel env."
```

---

## Task 12: Final verification + branch wrap-up

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit && npm run lint && npm test -- --run`
Expected: types clean, lint clean (0 warnings), all tests pass.

- [ ] **Step 2: Acceptance-criteria walk-through (manual, `npm run dev`)**

Confirm each PRD acceptance criterion against `/trading` (DC Flip) and the dashboard:
1. Multi-world results group by destination; headers show capital, net spread, gil/M. ✅
2. Groups sorted by gil/M desc. ✅
3. Group collapse/expand + global toggle work. ✅
4. Every row has a WINDOW cell (age + stability). ✅
5. (Server-dependent) New→Volatile→Stable progression and gap-reset — verify via `spreadHistoryStore.test.ts` (cycle logic) since live progression needs ≥5 refresh runs. ✅ (logic), ⏳ (live, post-Task 11)
6. `maxCapital=1000000` greys rows over the running total + shows "N of M items fit" note. ✅
7. `maxCapital` is in the Copy Link URL. ✅
8. Single-world + single-item → flat list (no regression). ✅
9. Dashboard widget groups by world with per-world summaries + deep-links. ✅
10. All displayed spreads are net of 5% tax. ✅
11. No new API calls for grouping/score/capital (all client-side from the scan). ✅ (freshness uses one static blob GET, exempt per FR-3.)

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feature/dc-flip-trip-optimizer
```

- [ ] **Step 4: Open the PR (only if the user asks).** Summarize phases shipped (Tasks 1–10 client/dashboard; Task 11 server, gated on the other agent's cache rewrite).

---

## Self-Review Notes

- **Spec coverage:** FR-1 → Tasks 3,6,7. FR-2 → Tasks 3,5. FR-3 → Tasks 2,4,7,10,11. FR-4 → Task 3 (sort). FR-5 → Tasks 8,9. Data-persistence requirements → Tasks 10,11. Edge cases (single-item flat fallback, same item on multiple worlds via per-world rows, capital tie-break by net spread desc, New-lifecycle reset) → Tasks 3,6,7,2. Disclaimer line → Task 7.
- **Open question answered (GIL/M in per-item rows):** Not added as a per-row sortable column — the PRD makes it a trip-level (group) metric and rows already carry net spread + velocity. Revisit only if requested.
- **Type consistency:** `DcFlipRow.netSpread` (Task 1) is consumed by `groupByWorld` (Task 3), `WorldGroupCard`/`renderGroupTable` (Tasks 6–7). `SpreadHistoryEntry`/`SpreadHistoryMap`/`deriveWindow`/`spreadKey`/`foldSpreadCycle` (Task 2) are consumed by `useSpreadHistory` (Task 4), `renderGroupTable` (Task 7), `foldCycleForBundle` (Task 10), and `refresh-cache` (Task 11). `WorldSpreadGroup`/`groupSpreadsByWorld` (Task 8) consumed by `SpreadBars` (Task 8).
- **Coverage caveat is intentional:** freshness only covers refresh-cache's tracked item set; untracked pairs render `New`. Documented in the disclaimer + plan header.
