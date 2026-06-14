# Market-refresh CI-offload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore fresh bulk market data on Vercel Hobby by moving the heavy ~16,794-item marketable sweep to a scheduled GitHub Action, leaving Vercel cron with only the cheap 5-min hot tier.

**Architecture:** A shared `src/bot/refreshMarket.ts` module exposes `refreshFull` (heavy sweep → writes `market-cache-cold.json` + `hot-ids.json` + `opportunities.json`) and `refreshHot` (reads `hot-ids.json` → writes `market-cache-hot.json`). A new `scripts/refresh-market.ts` runs `refreshFull` from a GitHub Action (no 300s limit); the slimmed Vercel `api/refresh-cache` lambda runs `refreshHot`. The catalog is trimmed from 50,360 to the 16,794 marketable items via a baked `marketable-ids.json`. `fetchBatch` is hardened against Universalis 200-but-non-JSON throttle bodies (the confirmed `cold`-500 cause). The client read-contract (blob names, JSON shapes, `VITE_*` env vars) is unchanged.

**Tech Stack:** TypeScript, Vitest, esbuild (api bundling), `@vercel/blob`, `tsx`, GitHub Actions, Universalis API.

**Spec:** `docs/superpowers/specs/2026-06-14-market-refresh-ci-offload-design.md`

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/bot/marketFetch.ts` | Universalis batch fetch | Modify — harden `fetchBatch` JSON parse |
| `src/bot/marketFetch.test.ts` | fetch resilience tests | Create |
| `src/bot/refreshMarket.ts` | shared refresh orchestration (`refreshHot`/`refreshFull`) | Create |
| `src/bot/refreshMarket.test.ts` | orchestration tests | Create |
| `src/api/refresh-cache.ts` | Vercel lambda — hot tier only | Modify (slim) |
| `api/refresh-cache.mjs` | built lambda artifact | Regenerate via `build:api` |
| `scripts/refresh-market.ts` | CI entry — heavy marketable sweep | Create |
| `scripts/bake-marketable.ts` | bake `marketable-ids.json` from Universalis | Create |
| `public/data/snapshots/marketable-ids.json` | committed marketable id list | Create (generated) |
| `package.json` | npm scripts | Modify (add `bake:marketable`, chain into `snapshots`) |
| `.github/workflows/refresh-market.yml` | hourly sweep workflow | Create |

**Retired (no code keeps writing/reading them):** the Vercel `cold`/`full` cron tiers and `traded-ids.json`. Nothing outside the cron read `traded-ids.json`, so this is internal.

---

### Task 1: Harden `fetchBatch` against non-JSON Universalis responses

**Files:**
- Modify: `src/bot/marketFetch.ts:6-18`
- Test: `src/bot/marketFetch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/bot/marketFetch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchMarketForOutputs } from './marketFetch';

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchMarketForOutputs / fetchBatch resilience', () => {
  it('returns empty data (no throw) when Universalis responds 200 with a non-JSON body', async () => {
    // The rate-limit / Cloudflare page: ok:true but body is HTML, so res.json() throws.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
    }));
    const bundle = await fetchMarketForOutputs([1, 2, 3], 'Phantom', 'Chaos', 'Europe');
    expect(bundle).toEqual({ phantom: {}, dc: {}, region: {} });
  });

  it('returns empty data when Universalis responds non-OK (after retry)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    const bundle = await fetchMarketForOutputs([1], 'Phantom', 'Chaos', 'Europe');
    expect(bundle).toEqual({ phantom: {}, dc: {}, region: {} });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/bot/marketFetch.test.ts`
Expected: the first test FAILS — the unhandled `res.json()` rejection propagates out of `fetchMarketForOutputs` (test errors with the `SyntaxError`) instead of resolving to empty maps.

- [ ] **Step 3: Harden the implementation**

In `src/bot/marketFetch.ts`, replace the body of `fetchBatch` (currently lines 6-18) with:

```ts
async function fetchBatch(scope: string, ids: number[]): Promise<MarketData> {
  // Fetch up to LISTINGS_CAP listings so Universalis' listingsCount is the true
  // total (it only counts returned rows); the parser keeps just the cheapest few.
  const url = `https://universalis.app/api/v2/${scope}/${ids.join(',')}?listings=${LISTINGS_CAP}&entries=15&fields=${marketFields(ids.length)}`;
  let res = await fetch(url);
  if (!res.ok) {
    await new Promise(r => setTimeout(r, 400));
    res = await fetch(url);
  }
  if (!res.ok) return {};
  // Universalis sometimes returns 200 with a non-JSON body (a rate-limit / Cloudflare
  // page). res.json() then throws; without this guard the rejection propagates through
  // the worker pool and 500s the whole refresh. Treat a bad body as an empty batch.
  let raw: unknown;
  try {
    raw = await res.json();
  } catch (e) {
    console.warn(`[marketFetch] ${scope}: non-JSON body for ${ids.length}-id batch — ${e instanceof Error ? e.message : String(e)}`);
    return {};
  }
  return parseMarketResponse(raw as Parameters<typeof parseMarketResponse>[0]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/bot/marketFetch.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/bot/marketFetch.ts src/bot/marketFetch.test.ts
git commit -m "fix(marketFetch): treat 200-but-non-JSON Universalis bodies as empty batches

Universalis returns 200 with a rate-limit/Cloudflare HTML page under load; the
unguarded res.json() then threw and propagated out of fetchMarketForOutputs,
500-ing the whole refresh (the confirmed cold-500 cause). Wrap the parse and
degrade to an empty batch instead.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Shared `refreshMarket` orchestration module

**Files:**
- Create: `src/bot/refreshMarket.ts`
- Test: `src/bot/refreshMarket.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/bot/refreshMarket.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMarketForOutputs = vi.fn();
vi.mock('./marketFetch', () => ({ fetchMarketForOutputs: (...a: unknown[]) => fetchMarketForOutputs(...a) }));

const writeMarketCache = vi.fn();
const writeBlobJson = vi.fn();
const readBlobJson = vi.fn();
vi.mock('./marketCache', () => ({
  writeMarketCache: (...a: unknown[]) => writeMarketCache(...a),
  writeBlobJson: (...a: unknown[]) => writeBlobJson(...a),
  readBlobJson: (...a: unknown[]) => readBlobJson(...a),
}));

import { refreshHot, refreshFull } from './refreshMarket';

const mkItem = (velocity: number) => ({
  minNQ: 100, minHQ: null, avgNQ: 120, avgHQ: null, medianNQ: 110, medianHQ: null,
  recentSalesNQ: 5, recentSalesHQ: 0, velocity, lastUploadTime: 0, listingCount: 5,
  worldListings: [{ world: 'Phantom', price: 100, hq: false }],
  averagePriceNQ: 120, averagePriceHQ: null, lastSaleMs: null,
});

beforeEach(() => {
  fetchMarketForOutputs.mockReset(); writeMarketCache.mockReset();
  writeBlobJson.mockReset(); readBlobJson.mockReset();
});

describe('refreshHot', () => {
  it('bails (seeded:false) when hot-ids.json is missing', async () => {
    readBlobJson.mockResolvedValue(null);
    const r = await refreshHot({ world: 'Phantom', dc: 'Chaos', region: 'Europe' });
    expect(r).toEqual({ seeded: false });
    expect(fetchMarketForOutputs).not.toHaveBeenCalled();
  });

  it('fetches the hot set and writes the hot cache when seeded', async () => {
    readBlobJson.mockResolvedValue([1, 2]);
    fetchMarketForOutputs.mockResolvedValue({ phantom: {}, dc: {}, region: {} });
    writeMarketCache.mockResolvedValue('https://blob/market-cache-hot.json');
    const r = await refreshHot({ world: 'Phantom', dc: 'Chaos', region: 'Europe' });
    expect(fetchMarketForOutputs).toHaveBeenCalledWith([1, 2], 'Phantom', 'Chaos', 'Europe');
    expect(writeMarketCache).toHaveBeenCalledWith(expect.objectContaining({ ts: expect.any(Number) }), 'market-cache-hot.json');
    expect(r).toMatchObject({ seeded: true, items: 2 });
  });
});

describe('refreshFull', () => {
  it('writes cold cache, hot-ids, and opportunities', async () => {
    fetchMarketForOutputs.mockResolvedValue({
      phantom: { '1': mkItem(50) }, dc: { '1': mkItem(50) }, region: { '1': mkItem(50) },
    });
    writeMarketCache.mockResolvedValue('https://blob/market-cache-cold.json');
    readBlobJson.mockResolvedValue(null); // no existing opportunities feed
    writeBlobJson.mockResolvedValue('https://blob/x.json');
    const r = await refreshFull({ ids: [1], world: 'Phantom', dc: 'Chaos', region: 'Europe', velocityThreshold: 10, dealPct: 25 });
    expect(writeMarketCache).toHaveBeenCalledWith(expect.objectContaining({ ts: expect.any(Number) }), 'market-cache-cold.json');
    expect(writeBlobJson).toHaveBeenCalledWith('hot-ids.json', [1]);
    expect(writeBlobJson).toHaveBeenCalledWith('opportunities.json', expect.objectContaining({ opportunities: expect.any(Array) }));
    expect(r).toMatchObject({ items: 1, hotCount: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/bot/refreshMarket.test.ts`
Expected: FAIL — `Cannot find module './refreshMarket'` (file does not exist yet).

- [ ] **Step 3: Write the module**

Create `src/bot/refreshMarket.ts`:

```ts
import { fetchMarketForOutputs } from './marketFetch';
import { writeMarketCache, writeBlobJson, readBlobJson } from './marketCache';
import { selectHotIds } from './hotSet';
import { scanDeals, mergeDeals, type Opportunity, type OpportunitiesFile } from './marketDiff';

export interface ScopeConfig {
  world: string;
  dc: string;
  region: string;
}

export interface FullConfig extends ScopeConfig {
  ids: number[];
  velocityThreshold: number;
  dealPct: number;
}

export type HotResult =
  | { seeded: false }
  | { seeded: true; items: number; blobUrl: string };

/**
 * Light sweep for the Vercel 5-min cron: reads the pre-derived hot-ids.json
 * (written by the heavy GitHub Action sweep) and refreshes only those items into
 * market-cache-hot.json. Returns { seeded: false } when the id blob is absent so
 * the caller can 503 cheaply instead of guessing at the universe.
 */
export async function refreshHot(cfg: ScopeConfig): Promise<HotResult> {
  const ids = await readBlobJson<number[]>('hot-ids.json');
  if (!ids || ids.length === 0) return { seeded: false };
  const bundle = await fetchMarketForOutputs(ids, cfg.world, cfg.dc, cfg.region);
  const ts = Date.now();
  const blobUrl = await writeMarketCache(
    { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts },
    'market-cache-hot.json',
  );
  return { seeded: true, items: ids.length, blobUrl };
}

/**
 * Heavy sweep for GitHub Actions (no 300s limit) or manual runs: fetches the full
 * marketable set, writes market-cache-cold.json, derives hot-ids.json from live
 * velocities, and refreshes the opportunities.json deal feed.
 */
export async function refreshFull(
  cfg: FullConfig,
): Promise<{ items: number; hotCount: number; oppCount: number; blobUrl: string }> {
  const bundle = await fetchMarketForOutputs(cfg.ids, cfg.world, cfg.dc, cfg.region);
  const ts = Date.now();
  const blobUrl = await writeMarketCache(
    { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts },
    'market-cache-cold.json',
  );

  const current: Opportunity[] = scanDeals(bundle.dc, ts, cfg.dealPct);
  const existing = (await readBlobJson<OpportunitiesFile>('opportunities.json'))?.opportunities ?? [];
  const merged = mergeDeals(existing, current);
  await writeBlobJson('opportunities.json', { ts, opportunities: merged } satisfies OpportunitiesFile);

  const hotIds = selectHotIds(bundle, cfg.velocityThreshold);
  await writeBlobJson('hot-ids.json', hotIds);

  return { items: cfg.ids.length, hotCount: hotIds.length, oppCount: merged.length, blobUrl };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/bot/refreshMarket.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/bot/refreshMarket.ts src/bot/refreshMarket.test.ts
git commit -m "feat(refresh): shared refreshMarket module (refreshHot + refreshFull)

One code path for both the Vercel lambda (refreshHot: reads hot-ids.json, writes
the hot cache) and the GitHub Action sweep (refreshFull: full marketable sweep ->
cold cache + hot-ids + opportunities), so the two pipelines never drift.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Slim the Vercel lambda to the hot tier and rebuild the artifact

**Files:**
- Modify: `src/api/refresh-cache.ts` (full replace)
- Regenerate: `api/refresh-cache.mjs`

- [ ] **Step 1: Replace the handler**

Replace the entire contents of `src/api/refresh-cache.ts` with:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { refreshHot } from '../bot/refreshMarket';

// The heavy marketable sweep (cold cache + hot-ids + opportunities) runs in the
// refresh-market GitHub Action — it cannot fit Vercel's 300s limit. This lambda
// only runs the cheap 5-min hot tier: refresh the pre-derived hot-ids set.
const WORLD = process.env.HOME_WORLD ?? 'Phantom';
const DC = process.env.HOME_DC ?? 'Chaos';
const REGION = process.env.REGION ?? 'Europe';
const SECRET = process.env.REFRESH_SECRET ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SECRET || req.query.token !== SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const t0 = Date.now();
  try {
    const result = await refreshHot({ world: WORLD, dc: DC, region: REGION });
    if (!result.seeded) {
      console.warn('[refresh:hot] hot-ids.json not seeded — run the refresh-market GitHub Action first');
      return res.status(503).json({ error: 'hot-ids.json not seeded — run the refresh-market GitHub Action first' });
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[refresh:hot] done in ${elapsed}s, ${result.items} items, blob: ${result.blobUrl}`);
    return res.status(200).json({ ok: true, items: result.items, elapsed: `${elapsed}s`, blobUrl: result.blobUrl });
  } catch (e) {
    console.error('[refresh:hot] error:', e);
    return res.status(500).json({ error: (e as Error).message });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output. (Confirms `refreshHot` import + types line up; `loadItemIds` is now unused by the lambda but remains exported in `loadSnapshots.ts` — that is fine.)

- [ ] **Step 3: Rebuild the lambda artifact**

Run: `npm run build:api`
Expected: esbuild prints output sizes, "Done in …ms". This regenerates all `api/*.mjs`; only `api/refresh-cache.mjs` has a real change — the others differ only by line endings.

- [ ] **Step 4: Drop the line-ending-only churn on the other artifacts**

Run: `git checkout -- api/auth.mjs api/discord.mjs api/plugin-claim.mjs api/plugin-cleanup.mjs api/plugin-craft-breakdown.mjs api/plugin-craftable.mjs api/plugin-item-sources.mjs api/plugin-items.mjs api/plugin-projects.mjs api/plugin-trading-query.mjs api/projects.mjs`
Then: `git status --short`
Expected: only `src/api/refresh-cache.ts` and `api/refresh-cache.mjs` show as modified.

- [ ] **Step 5: Verify the fix is in the artifact**

Run: `git grep -c "refreshHot\|hot-ids.json not seeded" -- api/refresh-cache.mjs`
Expected: a non-zero count (the slimmed handler is bundled in).

- [ ] **Step 6: Commit**

```bash
git add src/api/refresh-cache.ts api/refresh-cache.mjs
git commit -m "refactor(refresh-cache): slim the lambda to the hot tier via refreshMarket

The full/cold tiers can't fit Vercel's 300s limit; they move to the refresh-market
GitHub Action. The lambda now only runs refreshHot (reads hot-ids.json, writes
market-cache-hot.json) and 503s cheaply if the id blob isn't seeded yet. Rebuilt
api/refresh-cache.mjs.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: CI entry script for the heavy sweep

**Files:**
- Create: `scripts/refresh-market.ts`

- [ ] **Step 1: Write the script**

Create `scripts/refresh-market.ts`:

```ts
/**
 * Heavy market sweep for the scheduled GitHub Action (.github/workflows/refresh-market.yml).
 * Runs the full marketable sweep with no 300s limit and writes the cold cache, hot-ids,
 * and opportunities blobs to Vercel Blob. Run: `npx tsx scripts/refresh-market.ts`.
 *
 * `||` (not `??`) on every env read: GitHub Actions passes an UNSET repo var as an
 * empty string, and Number('') === 0 — which would make the hot threshold 0 and pull
 * the entire marketable set into hot-ids. `|| default` handles both '' and undefined.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { refreshFull } from '../src/bot/refreshMarket';

const WORLD = process.env.HOME_WORLD || 'Phantom';
const DC = process.env.HOME_DC || 'Chaos';
const REGION = process.env.REGION || 'Europe';
const VELOCITY_THRESHOLD = Number(process.env.HOT_VELOCITY_THRESHOLD || 10);
const OPP_DEAL_PCT = Number(process.env.OPP_DEAL_PCT || 25);

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not set — required to write cache blobs');
  }
  const path = join(process.cwd(), 'public', 'data', 'snapshots', 'marketable-ids.json');
  const { ids } = JSON.parse(await readFile(path, 'utf-8')) as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('marketable-ids.json missing or empty — run `npm run bake:marketable` first');
  }
  process.stdout.write(`[refresh-market] sweeping ${ids.length} marketable items across 3 scopes…\n`);
  const result = await refreshFull({
    ids, world: WORLD, dc: DC, region: REGION,
    velocityThreshold: VELOCITY_THRESHOLD, dealPct: OPP_DEAL_PCT,
  });
  process.stdout.write(`[refresh-market] done: ${JSON.stringify(result)}\n`);
}

main().catch((err) => {
  process.stderr.write(`refresh-market failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/refresh-market.ts
git commit -m "feat(refresh): CI entry script for the heavy marketable sweep

Reads the committed marketable-ids.json and runs refreshFull, writing the cold
cache + hot-ids + opportunities to Vercel Blob. Invoked by the refresh-market
GitHub Action; uses BLOB_READ_WRITE_TOKEN from env.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Bake `marketable-ids.json`

**Files:**
- Create: `scripts/bake-marketable.ts`
- Modify: `package.json` (scripts)
- Create (generated): `public/data/snapshots/marketable-ids.json`

- [ ] **Step 1: Write the bake script**

Create `scripts/bake-marketable.ts`:

```ts
/**
 * Bake public/data/snapshots/marketable-ids.json — the Universalis-authoritative
 * set of marketable item ids, intersected with our catalog. The refresh sweep uses
 * this instead of the full ~50k catalog (which is ~67% untradeable items that 404).
 * Run standalone: `npx tsx scripts/bake-marketable.ts` (also chained into
 * `npm run snapshots`). On a fetch failure it keeps the existing committed file
 * rather than overwriting it with a partial/empty list.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public', 'data', 'snapshots');
const MARKETABLE_URL = 'https://universalis.app/api/v2/marketable';

async function main() {
  const catalogRaw = JSON.parse(await readFile(join(OUT_DIR, 'items.json'), 'utf-8')) as {
    items: Array<{ id: number }>;
  };
  const catalog = new Set(catalogRaw.items.map((i) => i.id));

  let marketable: number[];
  try {
    const res = await fetch(MARKETABLE_URL);
    if (!res.ok) throw new Error(`Universalis ${res.status}`);
    marketable = (await res.json()) as number[];
    if (!Array.isArray(marketable) || marketable.length === 0) throw new Error('empty/invalid marketable list');
  } catch (err) {
    process.stdout.write(`[marketable] fetch failed (${err instanceof Error ? err.message : String(err)}); keeping existing marketable-ids.json\n`);
    return; // leave the committed file untouched
  }

  const ids = marketable.filter((id) => catalog.has(id)).sort((a, b) => a - b);
  await writeFile(join(OUT_DIR, 'marketable-ids.json'), JSON.stringify({ bakedAt: Date.now(), ids }));
  process.stdout.write(`[marketable] wrote ${ids.length} marketable ids (of ${marketable.length} from Universalis)\n`);
}

main().catch((err) => {
  process.stderr.write(`bake-marketable failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Wire the npm scripts**

In `package.json`, change the `snapshots` script and add `bake:marketable` so the two lines read:

```json
    "snapshots": "tsx scripts/bake-snapshots.ts && tsx scripts/bake-marketable.ts",
    "bake:marketable": "tsx scripts/bake-marketable.ts",
```

(The full bake writes `items.json` first, then `bake-marketable` reads it. `bake:marketable` alone reuses the already-committed `items.json`.)

- [ ] **Step 3: Generate the file (uses the committed items.json — no full re-bake)**

Run: `npm run bake:marketable`
Expected: `[marketable] wrote 16794 marketable ids (of 16794 from Universalis)` (the catalog count may differ by a few across patches). Confirm the file exists and looks right:

Run: `node -e "const d=require('./public/data/snapshots/marketable-ids.json');console.log('count',d.ids.length,'sample',d.ids.slice(0,3))"`
Expected: a count in the ~16–17k range and a small sample of ascending numeric ids.

- [ ] **Step 4: Commit**

```bash
git add scripts/bake-marketable.ts package.json public/data/snapshots/marketable-ids.json
git commit -m "feat(bake): emit marketable-ids.json (Universalis marketable set ∩ catalog)

Trims the refresh universe from ~50,360 catalog items to ~16,794 marketable ones
(the rest are untradeable and 404 on the market API). Chained into npm run
snapshots; on a Universalis fetch failure it keeps the committed file.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: GitHub Action for the hourly sweep

**Files:**
- Create: `.github/workflows/refresh-market.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/refresh-market.yml`:

```yaml
name: refresh-market

on:
  schedule:
    - cron: '7 * * * *'      # hourly at :07 UTC (off the top of the hour)
  workflow_dispatch: {}       # allow manual runs from the Actions tab

concurrency:
  group: refresh-market
  cancel-in-progress: false

jobs:
  sweep:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: npx tsx scripts/refresh-market.ts
        env:
          BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
          HOME_WORLD: ${{ vars.HOME_WORLD }}
          HOME_DC: ${{ vars.HOME_DC }}
          REGION: ${{ vars.REGION }}
          HOT_VELOCITY_THRESHOLD: ${{ vars.HOT_VELOCITY_THRESHOLD }}
          OPP_DEAL_PCT: ${{ vars.OPP_DEAL_PCT }}
```

- [ ] **Step 2: Lint the YAML locally (syntax sanity)**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/refresh-market.yml','utf8');if(!/npx tsx scripts\/refresh-market\.ts/.test(s))throw new Error('step missing');console.log('workflow ok')"`
Expected: `workflow ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/refresh-market.yml
git commit -m "ci(refresh-market): hourly GitHub Action runs the heavy marketable sweep

Scheduled hourly (+ manual dispatch); runs scripts/refresh-market.ts with no 300s
limit and writes the cold cache + hot-ids + opportunities blobs. Needs the
BLOB_READ_WRITE_TOKEN repo secret.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full verification (whole suite + lint + typecheck)

**Files:** none (gate before cut-over)

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: all suites pass, including the new `marketFetch` and `refreshMarket` tests; no regressions in `marketCache`/`hotSet`/`marketDiff`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: exit 0 (eslint `--max-warnings 0`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

If all three pass, the code is ready to merge and cut over (Task 8).

---

### Task 8: Deploy & cut over (operational — after merge to main)

**Not code.** Do these in order once the branch is merged to `main` and deployed.

- [ ] **Step 1:** In GitHub → repo Settings → Secrets and variables → Actions:
  - Add secret `BLOB_READ_WRITE_TOKEN` (copy from the Vercel project's env / Blob store).
  - Optionally add repo *variables* `HOME_WORLD=Phantom`, `HOME_DC=Chaos`, `REGION=Europe`, `HOT_VELOCITY_THRESHOLD`, `OPP_DEAL_PCT` (the script defaults to these if unset).
- [ ] **Step 2:** Actions tab → `refresh-market` → "Run workflow" (manual `workflow_dispatch`). Confirm it succeeds and the log prints `[refresh-market] done: {"items":~16794,"hotCount":N,...}`. **Note the `hotCount`.**
- [ ] **Step 3:** If `hotCount` is large (≳ 800), raise `HOT_VELOCITY_THRESHOLD` (e.g. 25) so the Vercel 5-min hot run stays cheap and fast, and re-run the workflow. (Goal: hot set small enough that the 5-min lambda run is well under ~30s.)
- [ ] **Step 4:** In cron-job.org: keep **only** the 5-min job hitting `/api/refresh-cache?token=SECRET` (it's hot-only now; the `tier` param is ignored). **Delete** the hourly `cold` and daily `full` jobs.
- [ ] **Step 5:** Verify in the browser: the site shows fresh cold + hot prices and `/opportunities` is populated. Spot-check a high-velocity item updates within ~5 min and the bulk pages within ~1 h.

---

## Self-review

- **Spec coverage:** fetch hardening (T1) ✓; shared module / no-drift (T2) ✓; slim lambda + hot-only cron (T3) ✓; CI script (T4) ✓; marketable-ids bake with fallback (T5) ✓; hourly GitHub Action (T6) ✓; read-contract preserved — blob names (`market-cache-cold/hot.json`, `hot-ids.json`, `opportunities.json`) and shapes (`SharedCache`, `OpportunitiesFile`, `number[]`) unchanged across T2/T3/T4 ✓; retire `traded-ids`/cold-cron (T3 slims the lambda; T8 deletes the crons) ✓; rollout runbook (T8) ✓; 12-lambda cap untouched (no new `api/*` file) ✓.
- **Placeholder scan:** none — every code/test/command step has complete content.
- **Type consistency:** `refreshHot`/`refreshFull` signatures and the `HotResult`/`FullConfig`/`ScopeConfig` types are defined in T2 and consumed identically in T3 (`refreshHot({world,dc,region})`, `.seeded`/`.items`/`.blobUrl`) and T4 (`refreshFull({ids,world,dc,region,velocityThreshold,dealPct})`). Blob names match the existing `marketCache` helpers. `marketable-ids.json` shape `{bakedAt, ids}` is written in T5 and read identically in T4.
- **Known follow-up (not blocking):** `loadItemIds` becomes unused after T3 — left in place (still exported from `loadSnapshots.ts`); `TRADED_VELOCITY_THRESHOLD` env var is no longer read. Both harmless.
