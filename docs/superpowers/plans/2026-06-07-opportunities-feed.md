# Opportunity Feed (Tier 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A DC-wide "what just changed" market opportunity feed — the refresh cron diffs each new blob against the previous one, accumulates crossings into a rolling `opportunities.json`, and a new `/opportunities` page displays them.

**Architecture:** Pure `diffMarket`/`mergeOpportunities` functions (in `src/bot/marketDiff.ts`) run inside the existing `/api/refresh-cache` lambda after each tier fetch, comparing the new `dc` scope to the previous blob and merging results (2h TTL) into a public `opportunities.json` blob. The web app loads that blob and renders it as an insight page. No new lambda, no cron changes, no Discord.

**Tech Stack:** TypeScript, Vitest, React + react-query + react-router, `@vercel/blob`, esbuild (`build:api`).

**Design:** `docs/superpowers/specs/2026-06-07-opportunities-feed-design.md`

**Branch:** `feat/opportunities-feed` (off merged main; Tier 1+2 helpers `writeBlobJson`/`readBlobJson` already present).

---

### Task 1: `Opportunity` types + `diffMarket`

**Files:**
- Create: `src/bot/marketDiff.ts`
- Test: `src/bot/marketDiff.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/bot/marketDiff.test.ts
import { describe, it, expect } from 'vitest';
import { diffMarket } from './marketDiff';
import type { MarketItem, MarketData } from '../lib/universalis';

function item(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null, ...over,
  };
}
const NOW = 1_000_000;

describe('diffMarket', () => {
  it('emits crash when DC min drops >= 20%', () => {
    const prev: MarketData = { '5': item({ minNQ: 1000, listingCount: 10 }) };
    const next: MarketData = { '5': item({ minNQ: 800, listingCount: 10, velocity: 3, worldListings: [{ world: 'Moogle', price: 800, hq: false }] }) };
    const out = diffMarket(prev, next, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ itemId: 5, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 800, changePct: -20, gilPerDay: 2400, detectedAt: NOW });
  });

  it('does not emit for a -19% move', () => {
    const prev: MarketData = { '5': item({ minNQ: 1000, listingCount: 10 }) };
    const next: MarketData = { '5': item({ minNQ: 810, listingCount: 10 }) };
    expect(diffMarket(prev, next, NOW)).toEqual([]);
  });

  it('emits spike when DC min rises >= 20%', () => {
    const prev: MarketData = { '7': item({ minNQ: 1000, listingCount: 5 }) };
    const next: MarketData = { '7': item({ minNQ: 1200, listingCount: 5 }) };
    expect(diffMarket(prev, next, NOW)[0]).toMatchObject({ kind: 'spike', oldValue: 1000, newValue: 1200, changePct: 20 });
  });

  it('emits empty when listingCount drops to <= 2 from above', () => {
    const prev: MarketData = { '9': item({ minNQ: 100, listingCount: 5 }) };
    const next: MarketData = { '9': item({ minNQ: 100, listingCount: 2, velocity: 4 }) };
    expect(diffMarket(prev, next, NOW)[0]).toMatchObject({ kind: 'empty', world: '', oldValue: 5, newValue: 2, changePct: null, gilPerDay: 0 });
  });

  it('does not emit empty for 5 -> 3', () => {
    const prev: MarketData = { '9': item({ minNQ: 100, listingCount: 5 }) };
    const next: MarketData = { '9': item({ minNQ: 100, listingCount: 3 }) };
    expect(diffMarket(prev, next, NOW)).toEqual([]);
  });

  it('empty wins when an item both crashes and empties', () => {
    const prev: MarketData = { '9': item({ minNQ: 1000, listingCount: 5 }) };
    const next: MarketData = { '9': item({ minNQ: 500, listingCount: 1 }) };
    expect(diffMarket(prev, next, NOW)[0].kind).toBe('empty');
  });

  it('skips items with no prev baseline', () => {
    const next: MarketData = { '5': item({ minNQ: 800, listingCount: 10 }) };
    expect(diffMarket({}, next, NOW)).toEqual([]);
  });

  it('skips price kinds when prev minNQ is null but still allows empty', () => {
    const prev: MarketData = { '5': item({ minNQ: null, listingCount: 5 }) };
    const next: MarketData = { '5': item({ minNQ: 800, listingCount: 1 }) };
    expect(diffMarket(prev, next, NOW)[0].kind).toBe('empty');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bot/marketDiff.test.ts`
Expected: FAIL — cannot find module `./marketDiff`.

- [ ] **Step 3: Write the implementation**

```ts
// src/bot/marketDiff.ts
import type { MarketData } from '../lib/universalis';

export type OpportunityKind = 'crash' | 'spike' | 'empty';

export interface Opportunity {
  itemId: number;
  kind: OpportunityKind;
  /** World holding the DC-cheapest listing (crash/spike); '' for empty (DC-wide). */
  world: string;
  /** prev minNQ (crash/spike) or prev listingCount (empty). */
  oldValue: number | null;
  /** next minNQ (crash/spike) or next listingCount (empty). */
  newValue: number | null;
  /** Signed % move for crash/spike; null for empty. */
  changePct: number | null;
  velocity: number;
  /** next minNQ × velocity (rough liquidity weight); 0 for empty. */
  gilPerDay: number;
  detectedAt: number;
}

export interface OpportunitiesFile {
  ts: number;
  opportunities: Opportunity[];
}

// Thresholds mirror src/features/watchlist/alerts.ts (kept in sync intentionally).
const SPIKE_PCT = 20;
const CRASH_PCT = -20;
const EMPTY_MAX = 2; // shelf counts as "empty" at or below this many DC-wide listings

/**
 * Diff two DC-scope market snapshots, emitting one opportunity per item that crossed
 * a threshold this refresh. `prev`/`next` are the `dc` MarketData (cheapest aggregated
 * across all DC worlds). Items with no prev counterpart are skipped. `empty` wins when
 * an item both moved price AND emptied (the rarer, stronger signal).
 */
export function diffMarket(prev: MarketData, next: MarketData, now: number): Opportunity[] {
  const out: Opportunity[] = [];
  for (const [idStr, n] of Object.entries(next)) {
    const p = prev[idStr];
    if (!p) continue; // no baseline
    const itemId = Number(idStr);

    // empty: DC-wide supply dropped to <= EMPTY_MAX from above it
    if (p.listingCount > EMPTY_MAX && n.listingCount <= EMPTY_MAX) {
      out.push({
        itemId, kind: 'empty', world: '',
        oldValue: p.listingCount, newValue: n.listingCount,
        changePct: null, velocity: n.velocity, gilPerDay: 0, detectedAt: now,
      });
      continue; // empty wins over a price move
    }

    // crash/spike: needs a positive prev baseline and a next price
    if (p.minNQ != null && p.minNQ > 0 && n.minNQ != null) {
      const changePct = ((n.minNQ - p.minNQ) / p.minNQ) * 100;
      const kind: OpportunityKind | null =
        changePct <= CRASH_PCT ? 'crash' : changePct >= SPIKE_PCT ? 'spike' : null;
      if (kind) {
        out.push({
          itemId, kind,
          world: n.worldListings[0]?.world ?? '',
          oldValue: p.minNQ, newValue: n.minNQ,
          changePct: Math.round(changePct * 10) / 10,
          velocity: n.velocity,
          gilPerDay: Math.round(n.minNQ * n.velocity),
          detectedAt: now,
        });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/marketDiff.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bot/marketDiff.ts src/bot/marketDiff.test.ts
git commit -m "feat(opportunities): Opportunity types + diffMarket (DC-wide delta)"
```

---

### Task 2: `mergeOpportunities` (rolling TTL window)

**Files:**
- Modify: `src/bot/marketDiff.ts`
- Test: `src/bot/marketDiff.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/bot/marketDiff.test.ts`:

```ts
import { mergeOpportunities } from './marketDiff';
import type { Opportunity } from './marketDiff';

function opp(over: Partial<Opportunity>): Opportunity {
  return { itemId: 1, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 800,
    changePct: -20, velocity: 1, gilPerDay: 800, detectedAt: 0, ...over };
}
const TTL = 2 * 60 * 60 * 1000; // 2h

describe('mergeOpportunities', () => {
  it('fresh overrides existing for the same item+kind', () => {
    const existing = [opp({ itemId: 1, kind: 'crash', newValue: 900, detectedAt: 100 })];
    const fresh = [opp({ itemId: 1, kind: 'crash', newValue: 700, detectedAt: 200 })];
    const out = mergeOpportunities(existing, fresh, TTL, 200);
    expect(out).toHaveLength(1);
    expect(out[0].newValue).toBe(700);
  });

  it('keeps different kinds for the same item separately', () => {
    const existing = [opp({ itemId: 1, kind: 'crash', detectedAt: 100 })];
    const fresh = [opp({ itemId: 1, kind: 'empty', detectedAt: 200 })];
    expect(mergeOpportunities(existing, fresh, TTL, 200)).toHaveLength(2);
  });

  it('drops entries older than the TTL', () => {
    const now = 10 * 60 * 60 * 1000; // 10h
    const existing = [opp({ itemId: 1, detectedAt: now - TTL - 1 })]; // stale
    const fresh = [opp({ itemId: 2, detectedAt: now })];
    const out = mergeOpportunities(existing, fresh, TTL, now);
    expect(out.map((o) => o.itemId)).toEqual([2]);
  });

  it('sorts freshest first', () => {
    const fresh = [opp({ itemId: 1, detectedAt: 100 }), opp({ itemId: 2, detectedAt: 300 }), opp({ itemId: 3, detectedAt: 200 })];
    expect(mergeOpportunities([], fresh, TTL, 300).map((o) => o.itemId)).toEqual([2, 3, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bot/marketDiff.test.ts -t mergeOpportunities`
Expected: FAIL — `mergeOpportunities` not exported.

- [ ] **Step 3: Implement**

Append to `src/bot/marketDiff.ts`:

```ts
/**
 * Merge freshly-detected opportunities into the rolling feed: union keyed by
 * item+kind (fresh wins, since fresh.detectedAt >= existing), drop entries older than
 * `ttlMs`, return freshest-first.
 */
export function mergeOpportunities(
  existing: Opportunity[], fresh: Opportunity[], ttlMs: number, now: number,
): Opportunity[] {
  const byKey = new Map<string, Opportunity>();
  const keyOf = (o: Opportunity) => `${o.itemId}:${o.kind}`;
  for (const o of existing) byKey.set(keyOf(o), o);
  for (const o of fresh) byKey.set(keyOf(o), o);
  const cutoff = now - ttlMs;
  return [...byKey.values()]
    .filter((o) => o.detectedAt >= cutoff)
    .sort((a, b) => b.detectedAt - a.detectedAt);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/marketDiff.test.ts`
Expected: PASS (8 + 4 = 12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bot/marketDiff.ts src/bot/marketDiff.test.ts
git commit -m "feat(opportunities): mergeOpportunities rolling TTL window"
```

---

### Task 3: Wire detection into the refresh cron

**Files:**
- Modify: `src/api/refresh-cache.ts`

> Vercel handler — verified by `build:api` + `tsc`, not a unit test. The pure logic
> (`diffMarket`/`mergeOpportunities`) is already tested in Tasks 1–2.

- [ ] **Step 1: Read the current handler**

Read `src/api/refresh-cache.ts` fully so you insert into the real structure (it already
imports `writeMarketCache`, `writeBlobJson`, `readBlobJson` and builds
`const cache = { phantom, dc, region, ts }`).

- [ ] **Step 2: Add imports + constant**

At the top with the other imports add:

```ts
import { diffMarket, mergeOpportunities, type Opportunity, type OpportunitiesFile } from '../bot/marketDiff';
```

Below the existing `const VELOCITY_THRESHOLD = ...` line add:

```ts
const OPP_TTL_MS = 2 * 60 * 60 * 1000; // 2h rolling window for the opportunity feed
```

- [ ] **Step 3: Read the previous blob before overwriting, then diff/merge/write**

In the handler, the current sequence is:

```ts
    const cache = { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts: Date.now() };
    const blobName = tier === 'hot' ? 'market-cache-hot.json' : 'market-cache-cold.json';
    const blobUrl = await writeMarketCache(cache, blobName);
```

Replace it with (reads prev BEFORE the write, then computes the feed):

```ts
    const blobName = tier === 'hot' ? 'market-cache-hot.json' : 'market-cache-cold.json';
    // Read the previous same-tier blob BEFORE overwriting it, to diff against.
    const prev = await readBlobJson<{ dc: typeof bundle.dc }>(blobName);

    const cache = { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts: Date.now() };
    const blobUrl = await writeMarketCache(cache, blobName);

    // Detect "what just changed" on the DC scope and merge into the rolling feed.
    let oppCount: number | undefined;
    if (prev) {
      const fresh: Opportunity[] = diffMarket(prev.dc, cache.dc, cache.ts);
      const existing = (await readBlobJson<OpportunitiesFile>('opportunities.json'))?.opportunities ?? [];
      const merged = mergeOpportunities(existing, fresh, OPP_TTL_MS, cache.ts);
      await writeBlobJson('opportunities.json', { ts: cache.ts, opportunities: merged } satisfies OpportunitiesFile);
      oppCount = merged.length;
    }
```

- [ ] **Step 4: Surface the count in the response**

In the final success `res.status(200).json({...})`, add `oppCount` to the payload object
(alongside the existing `items`, `hotCount`, `elapsed`, `blobUrl`).

- [ ] **Step 5: Build + typecheck**

Run: `npm run build:api`
Expected: regenerates `api/refresh-cache.mjs`, no errors.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit (source + only the refresh bundle)**

```bash
git add src/api/refresh-cache.ts api/refresh-cache.mjs
git commit -m "feat(opportunities): write rolling opportunities.json from the refresh cron"
```

> If `build:api` re-dirtied other `api/*.mjs` (pre-existing drift), `git restore` them
> first so the commit contains only `refresh-cache.mjs` + the source `.ts`.

---

### Task 4: Client loader for the feed

**Files:**
- Create: `src/lib/opportunities.ts`
- Test: `src/lib/opportunities.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/opportunities.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadOpportunities } from './opportunities';

beforeEach(() => vi.unstubAllGlobals());

describe('loadOpportunities', () => {
  it('returns the parsed feed on success', async () => {
    const file = { ts: 42, opportunities: [{ itemId: 5, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 800, changePct: -20, velocity: 1, gilPerDay: 800, detectedAt: 42 }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => file }));
    const out = await loadOpportunities();
    expect(out.ts).toBe(42);
    expect(out.opportunities).toHaveLength(1);
  });

  it('returns an empty feed on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await loadOpportunities()).toEqual({ ts: 0, opportunities: [] });
  });

  it('returns an empty feed on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await loadOpportunities()).toEqual({ ts: 0, opportunities: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/opportunities.test.ts`
Expected: FAIL — cannot find module `./opportunities`.

- [ ] **Step 3: Implement**

```ts
// src/lib/opportunities.ts
import type { OpportunitiesFile } from '../bot/marketDiff';
export type { Opportunity, OpportunityKind, OpportunitiesFile } from '../bot/marketDiff';

const EMPTY: OpportunitiesFile = { ts: 0, opportunities: [] };

/**
 * Load the rolling opportunity feed (public blob). Returns an empty feed on any
 * failure so the page renders an empty state instead of erroring.
 * `marketDiff` is pure (only a type import from universalis) — safe in the browser bundle.
 */
export async function loadOpportunities(): Promise<OpportunitiesFile> {
  try {
    const url = (import.meta as any).env?.VITE_OPPORTUNITIES_URL || '/data/opportunities.json';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as OpportunitiesFile;
    return { ts: data.ts ?? 0, opportunities: data.opportunities ?? [] };
  } catch {
    return EMPTY;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/opportunities.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/opportunities.ts src/lib/opportunities.test.ts
git commit -m "feat(opportunities): client loader for the rolling feed"
```

---

### Task 5: `/opportunities` insight page + route + nav

**Files:**
- Create: `src/features/opportunities/OpportunitiesView.tsx`
- Create: `src/routes/Opportunities.tsx`
- Create: `src/features/opportunities/OpportunitiesView.test.tsx`
- Modify: `src/App.tsx` (lazy import + route)
- Modify: `src/components/layout/Sidebar.tsx` (nav entry)

- [ ] **Step 1: Write the view**

Create `src/features/opportunities/OpportunitiesView.tsx`. It loads the feed with
react-query, resolves item names via `useSnapshotById`, lets the user filter by kind
and sort, and renders through `ResultTableScaffold` + `ItemNameLinks`. Match the
styling of `src/features/insights/EmptyShelfView.tsx` (filter buttons) and
`src/features/queries/QueryResults.tsx` (sortable table) — read both first.

```tsx
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadOpportunities, type Opportunity, type OpportunityKind } from '../../lib/opportunities';
import { useSnapshotById } from '../queries/useSnapshotById';
import { ResultTableScaffold, EmptyResults } from '../queries/ResultTableScaffold';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { FreshnessChip } from '../../components/FreshnessChip';
import { ALERT_CLASS, ALERT_LABEL } from '../watchlist/alerts';
import { Spinner } from '../../components/Spinner';

type Row = Opportunity & { name: string };
type SortKey = 'detectedAt' | 'gilPerDay' | 'changePct';
const KIND_FILTERS: Array<{ id: OpportunityKind | 'all'; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'crash', label: 'Crash' }, { id: 'spike', label: 'Spike' }, { id: 'empty', label: 'Empty' },
];

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export function OpportunitiesView() {
  const feed = useQuery({ queryKey: ['opportunities'], queryFn: loadOpportunities });
  const byId = useSnapshotById();
  const [kind, setKind] = useState<OpportunityKind | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('detectedAt');
  const now = Date.now();

  const rows = useMemo<Row[]>(() => {
    const opps = feed.data?.opportunities ?? [];
    const named = opps.map((o) => ({ ...o, name: byId.get(o.itemId)?.name ?? `#${o.itemId}` }));
    const filtered = kind === 'all' ? named : named.filter((o) => o.kind === kind);
    const dir = sortKey === 'changePct' ? 1 : -1; // changePct asc (biggest crash first); others desc
    return [...filtered].sort((a, b) => (((a[sortKey] ?? 0) as number) - ((b[sortKey] ?? 0) as number)) * dir);
  }, [feed.data, byId, kind, sortKey]);

  if (feed.isLoading) return <Spinner label="Loading opportunities…" />;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-2xl text-gold tracking-wide">Opportunities</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          What just changed across your data center since the last market refresh — fresh price crashes (buy),
          spikes (sell), and shelves that just emptied (craft). Rolling 2-hour window.
        </p>
        {feed.data && feed.data.ts > 0 && (
          <div className="opacity-70 scale-90 origin-left"><FreshnessChip ts={feed.data.ts} now={now} /></div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 border border-border-base bg-bg-card">
        {KIND_FILTERS.map((k) => (
          <button key={k.id} type="button" onClick={() => setKind(k.id)}
            className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${kind === k.id ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'}`}>
            {k.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">Sort</span>
          {(['detectedAt', 'gilPerDay', 'changePct'] as SortKey[]).map((s) => (
            <button key={s} type="button" onClick={() => setSortKey(s)}
              className={`font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 border ${sortKey === s ? 'border-aether text-aether' : 'border-border-base text-text-dim hover:text-aether'}`}>
              {s === 'detectedAt' ? 'Newest' : s === 'gilPerDay' ? 'Gil/day' : 'Move %'}
            </button>
          ))}
        </div>
      </div>

      <ResultTableScaffold
        rows={rows}
        totalCandidates={feed.data?.opportunities.length ?? 0}
        skippedChunks={0}
        emptyState={<EmptyResults>No fresh opportunities right now — check back after the next refresh.</EmptyResults>}
        renderTable={(visible) => (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] tracking-widest uppercase text-text-low border-b border-border-base">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Signal</th>
                <th className="px-3 py-2">World</th>
                <th className="px-3 py-2 text-right">Was → Now</th>
                <th className="px-3 py-2 text-right">Move</th>
                <th className="px-3 py-2 text-right">Gil/day</th>
                <th className="px-3 py-2 text-right">Seen</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.itemId}:${r.kind}`} className="border-b border-border-base/50 align-top">
                  <td className="px-3 py-2"><ItemNameLinks id={r.itemId} name={r.name} /></td>
                  <td className="px-3 py-2">
                    <span className={`font-mono text-[10px] tracking-widest uppercase px-1.5 py-0.5 border ${ALERT_CLASS[r.kind]}`}>{ALERT_LABEL[r.kind]}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-text-cream">{r.world || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[11px]">
                    {r.kind === 'empty' ? `${r.oldValue} → ${r.newValue} listings` : `${r.oldValue?.toLocaleString()} → ${r.newValue?.toLocaleString()}`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[11px]">{r.changePct != null ? `${r.changePct > 0 ? '+' : ''}${r.changePct}%` : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[11px]">{r.gilPerDay ? r.gilPerDay.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-[10px] text-text-low whitespace-nowrap">{ago(r.detectedAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      />
    </div>
  );
}
```

> Verify the import paths/exports before relying on them: `useSnapshotById` returns a
> `Map<number, SnapshotItem>` (`src/features/queries/useSnapshotById.ts`); `FreshnessChip`
> takes `{ ts, now }` (`src/components/FreshnessChip.tsx`); `ALERT_CLASS`/`ALERT_LABEL`
> are keyed by `'crashed' | 'spike' | 'stale'` in `alerts.ts` — our kinds are
> `'crash' | 'spike' | 'empty'`, so they will NOT line up. Define LOCAL label/class maps
> in this view keyed by `OpportunityKind` instead of importing `ALERT_LABEL`/`ALERT_CLASS`
> (use the same Tailwind classes: crash → `text-crimson border-crimson/40`,
> spike → `text-jade border-jade/40`, empty → `text-gold border-gold/40`). Fix the import
> accordingly.

- [ ] **Step 2: Write the route wrapper**

Read `src/routes/EmptyShelf.tsx` and mirror it exactly. Create `src/routes/Opportunities.tsx`:

```tsx
import { OpportunitiesView } from '../features/opportunities/OpportunitiesView';

export default function Opportunities() {
  return <OpportunitiesView />;
}
```

(If `src/routes/EmptyShelf.tsx` uses a different shape — e.g. a re-export — match that instead.)

- [ ] **Step 3: Wire the route in `src/App.tsx`**

Add the lazy/static import next to the others (mirror how `EmptyShelf` is imported at
`src/App.tsx:27`):

```ts
import Opportunities from './routes/Opportunities';
```

Add the route next to `/empty-shelf` (`src/App.tsx:142`):

```tsx
<Route path="/opportunities" element={<Opportunities />} />
```

- [ ] **Step 4: Add the nav entry**

In `src/components/layout/Sidebar.tsx`, in the **Gil-Making** group's `items` array, add
after the Empty Shelf entry:

```ts
{ label: 'Opportunities', path: '/opportunities' },
```

- [ ] **Step 5: Write the view test**

Create `src/features/opportunities/OpportunitiesView.test.tsx`. Mock the loader and the
snapshot map; render inside a `QueryClientProvider` + `MemoryRouter`. Assert rows render
and the kind filter narrows them.

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/opportunities', () => ({
  loadOpportunities: vi.fn().mockResolvedValue({
    ts: 1000, opportunities: [
      { itemId: 5, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 800, changePct: -20, velocity: 2, gilPerDay: 1600, detectedAt: 900 },
      { itemId: 9, kind: 'empty', world: '', oldValue: 5, newValue: 1, changePct: null, velocity: 4, gilPerDay: 0, detectedAt: 950 },
    ],
  }),
}));
vi.mock('../queries/useSnapshotById', () => ({
  useSnapshotById: () => new Map([[5, { id: 5, name: 'Iron Ore', ilvl: 1 }], [9, { id: 9, name: 'Onion', ilvl: 1 }]]),
}));

import { OpportunitiesView } from './OpportunitiesView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><OpportunitiesView /></MemoryRouter></QueryClientProvider>,
  );
}

describe('OpportunitiesView', () => {
  it('renders a row per opportunity', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Iron Ore')).toBeInTheDocument());
    expect(screen.getByText('Onion')).toBeInTheDocument();
  });

  it('filters by kind', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Iron Ore')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Empty'));
    expect(screen.queryByText('Iron Ore')).not.toBeInTheDocument();
    expect(screen.getByText('Onion')).toBeInTheDocument();
  });
});
```

> If `ItemNameLinks` pulls extra context (e.g. `RecipeHover`/snapshot hooks) that breaks
> rendering under the test harness, mock `../../components/ItemNameLinks` to a simple
> `({ name }) => <span>{name}</span>` in this test — the test verifies feed/filter
> behavior, not the link cell internals.

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/features/opportunities/OpportunitiesView.test.tsx`
Expected: PASS (2 tests).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/opportunities/ src/routes/Opportunities.tsx src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(opportunities): /opportunities insight page + route + nav"
```

---

### Task 6: Full gate + docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full test suite + typecheck**

Run: `npx vitest run` — Expected: all pass (existing + new).
Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 2: Document the feed**

Append to the "Market cache refresh" section of `README.md`:

```markdown
### Opportunity feed (Tier 3)

Each refresh diffs the new DC prices against the previous blob and accumulates
"what just changed" into a public `opportunities.json` (rolling 2-hour window):

- **crash** — DC-cheapest dropped ≥20% (buy, on the tagged world)
- **spike** — DC-cheapest rose ≥20% (sell)
- **empty** — DC-wide listings dropped to ≤2 (craft)

Surfaced at `/opportunities`. No new cron or lambda — it rides the existing hot/cold
runs. Optional env `VITE_OPPORTUNITIES_URL` points the client at the blob (falls back to
`/data/opportunities.json`).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(opportunities): document the Tier 3 feed"
```

---

## Self-review notes

- **Spec coverage:** detection model + kinds/thresholds = Task 1; rolling TTL = Task 2;
  cron wiring + public blob = Task 3; client loader = Task 4; `/opportunities` page +
  route + nav = Task 5; docs = Task 6. The `applyListingUpdate`/`applySaleUpdate` WS-worker
  seams are intentionally out of scope (spec says so).
- **Types:** `Opportunity`/`OpportunityKind`/`OpportunitiesFile` defined in Task 1,
  reused unchanged in Tasks 2–5. `diffMarket(prev, next, now)` / `mergeOpportunities(existing,
  fresh, ttlMs, now)` signatures stable across cron + tests.
- **Known sharp edge (flagged in Task 5):** `ALERT_LABEL`/`ALERT_CLASS` in `alerts.ts` are
  keyed `'crashed'|'spike'|'stale'`, NOT our `'crash'|'spike'|'empty'` — Task 5 Step 1
  note requires local maps instead. Do not import them keyed by our kinds.
