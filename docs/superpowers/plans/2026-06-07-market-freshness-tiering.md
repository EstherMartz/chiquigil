# Market Freshness — Tier 1 + Tier 2 (Cadence, `fields=`, Hot/Cold Tiering) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bulk market scans up to ~12× fresher by splitting the hourly refresh into a fast hot tier and an hourly cold tier (two blobs), trimming Universalis payloads with `fields=`, and raising cron cadence.

**Architecture:** The stateless `/api/refresh-cache` lambda gains a `tier` query param. The cold run fetches all tracked items, writes `market-cache-cold.json`, and derives the hot ID set (high-velocity items) into `hot-ids.json`. The hot run fetches only those IDs and writes `market-cache-hot.json`. The client loads both blobs and merges with hot overriding cold, falling back to the legacy single blob during rollout. Hot-set selection is a pure, tested function so the future Tier-3 diff and #4 WebSocket worker reuse it.

**Tech Stack:** TypeScript, Vitest, `@vercel/blob`, esbuild (`build:api`), external cron (cron-job.org).

**Design:** `docs/superpowers/specs/2026-06-07-market-freshness-design.md`

---

### Task 1: `selectHotIds` pure function

**Files:**
- Create: `src/bot/hotSet.ts`
- Test: `src/bot/hotSet.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/bot/hotSet.test.ts
import { describe, it, expect } from 'vitest';
import { selectHotIds } from './hotSet';
import type { MarketItem, MarketData } from '../lib/universalis';
import type { MarketBundle } from './marketFetch';

function item(velocity: number): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0,
    velocity, lastUploadTime: 0, listingCount: 0, worldListings: [],
    averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null,
  };
}
function data(entries: Record<number, number>): MarketData {
  const out: MarketData = {};
  for (const [id, v] of Object.entries(entries)) out[id] = item(v);
  return out;
}

describe('selectHotIds', () => {
  it('selects ids at or above the threshold in any scope, sorted & deduped', () => {
    const bundle: MarketBundle = {
      phantom: data({ 1: 12, 2: 3 }),
      dc: data({ 2: 11, 3: 0 }),
      region: data({ 1: 1, 4: 50 }),
    };
    expect(selectHotIds(bundle, 10)).toEqual([1, 2, 4]);
  });

  it('returns empty when nothing clears the threshold', () => {
    const bundle: MarketBundle = { phantom: data({ 1: 1 }), dc: {}, region: {} };
    expect(selectHotIds(bundle, 10)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bot/hotSet.test.ts`
Expected: FAIL — cannot find module `./hotSet`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/bot/hotSet.ts
import type { MarketBundle } from './marketFetch';

/**
 * Items worth refreshing on the fast (hot) cadence: anything actively selling.
 * `velocity` is Universalis' regularSaleVelocity (sales/day). An item is hot if it
 * clears `velocityThreshold` in ANY scope (home / dc / region). Pure + sorted so the
 * output is deterministic and diffable; reused by the Tier-3 diff and the future
 * WebSocket worker.
 */
export function selectHotIds(bundle: MarketBundle, velocityThreshold: number): number[] {
  const hot = new Set<number>();
  for (const scope of [bundle.phantom, bundle.dc, bundle.region]) {
    for (const [id, item] of Object.entries(scope)) {
      if (item.velocity >= velocityThreshold) hot.add(Number(id));
    }
  }
  return [...hot].sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/hotSet.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bot/hotSet.ts src/bot/hotSet.test.ts
git commit -m "feat(market): selectHotIds — velocity-based hot-set picker"
```

---

### Task 2: Generalize blob writer + add JSON blob read/write helpers

**Files:**
- Modify: `src/bot/marketCache.ts`
- Test: `src/bot/marketCache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/bot/marketCache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const put = vi.fn();
const head = vi.fn();
vi.mock('@vercel/blob', () => ({ put: (...a: unknown[]) => put(...a), head: (...a: unknown[]) => head(...a) }));

import { writeMarketCache, writeBlobJson, readBlobJson } from './marketCache';

beforeEach(() => { put.mockReset(); head.mockReset(); vi.unstubAllGlobals(); });

describe('blob helpers', () => {
  it('writeMarketCache defaults to market-cache.json and returns the url', async () => {
    put.mockResolvedValue({ url: 'https://blob/market-cache.json' });
    const url = await writeMarketCache({ phantom: {}, dc: {}, region: {}, ts: 1 });
    expect(put).toHaveBeenCalledWith('market-cache.json', expect.any(String), expect.objectContaining({ access: 'public' }));
    expect(url).toBe('https://blob/market-cache.json');
  });

  it('writeMarketCache honours an explicit blob name', async () => {
    put.mockResolvedValue({ url: 'https://blob/market-cache-hot.json' });
    await writeMarketCache({ phantom: {}, dc: {}, region: {}, ts: 1 }, 'market-cache-hot.json');
    expect(put).toHaveBeenCalledWith('market-cache-hot.json', expect.any(String), expect.anything());
  });

  it('readBlobJson resolves the url via head and parses it', async () => {
    head.mockResolvedValue({ url: 'https://blob/hot-ids.json' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [1, 2, 3] }));
    expect(await readBlobJson<number[]>('hot-ids.json')).toEqual([1, 2, 3]);
  });

  it('readBlobJson returns null when the blob is missing', async () => {
    head.mockRejectedValue(new Error('not found'));
    expect(await readBlobJson('missing.json')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bot/marketCache.test.ts`
Expected: FAIL — `writeBlobJson`/`readBlobJson` not exported.

- [ ] **Step 3: Write the implementation**

Replace the contents of `src/bot/marketCache.ts` with:

```ts
import { put, head } from '@vercel/blob';
import type { MarketData } from '../lib/universalis';

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

/** Write any JSON value to a deterministically-named public blob; returns its url. */
export async function writeBlobJson(name: string, data: unknown): Promise<string> {
  const blob = await put(name, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}

/** Read + parse a named JSON blob, or null if it doesn't exist / fails. */
export async function readBlobJson<T>(name: string): Promise<T | null> {
  try {
    const meta = await head(name);
    const res = await fetch(meta.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Write a market bundle to `name` (default keeps the legacy single-blob path). */
export async function writeMarketCache(cache: SharedCache, name = 'market-cache.json'): Promise<string> {
  return writeBlobJson(name, cache);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/marketCache.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bot/marketCache.ts src/bot/marketCache.test.ts
git commit -m "feat(market): generalized blob write + readBlobJson helper"
```

---

### Task 3: Tier-aware refresh handler (hot/cold)

**Files:**
- Modify: `src/api/refresh-cache.ts`

> Vercel handler — verified by build + live curl, not a unit test (it imports blob IO and reads request state). Pure logic it depends on (`selectHotIds`) is already tested in Task 1.

- [ ] **Step 1: Rewrite the handler body**

Replace `src/api/refresh-cache.ts` with:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchMarketForOutputs } from '../bot/marketFetch';
import { writeMarketCache, writeBlobJson, readBlobJson } from '../bot/marketCache';
import { loadItemIds } from '../bot/loadSnapshots';
import { selectHotIds } from '../bot/hotSet';

const WORLD = process.env.HOME_WORLD ?? 'Phantom';
const DC = process.env.HOME_DC ?? 'Chaos';
const REGION = process.env.REGION ?? 'Europe';
const SECRET = process.env.REFRESH_SECRET ?? '';
const VELOCITY_THRESHOLD = Number(process.env.HOT_VELOCITY_THRESHOLD ?? 10);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SECRET || req.query.token !== SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const tier = req.query.tier === 'hot' ? 'hot' : 'cold';
  const t0 = Date.now();
  try {
    const proto = req.headers['x-forwarded-proto'] ?? 'https';
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
    const baseUrl = `${proto}://${host}`;

    // Hot tier fetches only the previously-derived hot set; cold fetches everything.
    const ids = tier === 'hot'
      ? (await readBlobJson<number[]>('hot-ids.json')) ?? (await loadItemIds(baseUrl))
      : await loadItemIds(baseUrl);

    console.log(`[refresh:${tier}] fetching ${ids.length} items across 3 scopes...`);
    const bundle = await fetchMarketForOutputs(ids, WORLD, DC, REGION);

    const cache = { phantom: bundle.phantom, dc: bundle.dc, region: bundle.region, ts: Date.now() };
    const blobName = tier === 'hot' ? 'market-cache-hot.json' : 'market-cache-cold.json';
    const blobUrl = await writeMarketCache(cache, blobName);

    // The cold (full) run re-derives the hot ID set for the next hot run.
    let hotCount: number | undefined;
    if (tier === 'cold') {
      const hotIds = selectHotIds(bundle, VELOCITY_THRESHOLD);
      await writeBlobJson('hot-ids.json', hotIds);
      hotCount = hotIds.length;
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[refresh:${tier}] done in ${elapsed}s, ${ids.length} items, blob: ${blobUrl}`);
    return res.status(200).json({ ok: true, tier, items: ids.length, hotCount, elapsed: `${elapsed}s`, blobUrl });
  } catch (e) {
    console.error(`[refresh:${tier}] error:`, e);
    return res.status(500).json({ error: (e as Error).message });
  }
}
```

- [ ] **Step 2: Build the API bundle**

Run: `npm run build:api`
Expected: regenerates `api/refresh-cache.mjs` with no errors.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/api/refresh-cache.ts api/refresh-cache.mjs
git commit -m "feat(market): tier-aware refresh (hot/cold two-blob)"
```

---

### Task 4: Client loads + merges hot over cold

**Files:**
- Modify: `src/lib/universalis.ts` (`loadSharedMarketCache`, lines ~160-190)
- Test: `src/lib/universalis.test.ts` (add cases)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/universalis.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSharedMarketCache, fetchMarketData, _resetMarketCacheForTests } from './universalis';

function blob(ts: number, min: number) {
  const item = { minNQ: min, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null };
  return { phantom: { 100: item }, dc: {}, region: {}, ts };
}

describe('loadSharedMarketCache hot/cold merge', () => {
  beforeEach(() => { _resetMarketCacheForTests(); vi.unstubAllGlobals(); (loadSharedMarketCache as any)._loaded = false; });

  it('hot blob overrides cold for the same id', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) =>
      Promise.resolve({ ok: true, json: async () => url.includes('hot') ? blob(2000, 999) : blob(1000, 111) })));
    await loadSharedMarketCache('Phantom', 'Chaos', 'Europe');
    const got = await fetchMarketData('Phantom', [100]);
    expect(got['100'].minNQ).toBe(999); // hot wins
  });
});
```

> Note: `loadSharedMarketCache` guards re-entry with a module flag. If the existing
> test file already imports/uses it, reset that flag the same way the file's other
> tests do; the `(… as any)._loaded` line above is a placeholder — match the actual
> reset helper (`_resetMarketCacheForTests` plus the module's `sharedCacheLoaded`
> reset if one exists). Add a `_resetSharedCacheForTests()` export if none exists
> (see Step 3).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/universalis.test.ts -t "hot blob overrides"`
Expected: FAIL — only one blob fetched / hot not applied.

- [ ] **Step 3: Implement the two-blob loader**

In `src/lib/universalis.ts`, replace the `loadSharedMarketCache` function (and its
`sharedCacheLoaded` guard) with:

```ts
let sharedCacheLoaded = false;

/** Test helper: allow re-running loadSharedMarketCache. */
export function _resetSharedCacheForTests(): void {
  sharedCacheLoaded = false;
}

async function fetchCacheBlob(url: string): Promise<SharedCache | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as SharedCache;
  } catch {
    return null;
  }
}

/**
 * Pre-seed the in-memory cache from the bot's blobs. Loads the hourly COLD blob and
 * the ~5-min HOT blob, applying cold first then hot so the fresher hot entries win.
 * Falls back to the legacy single blob (VITE_CACHE_BLOB_URL) when cold is absent,
 * so prod keeps working during rollout. Call once at startup.
 */
export async function loadSharedMarketCache(homeWorld: string, dc: string, region: string): Promise<void> {
  if (sharedCacheLoaded) return;
  sharedCacheLoaded = true;
  try {
    const env = (import.meta as any).env ?? {};
    const coldUrl = env.VITE_CACHE_COLD_URL || env.VITE_CACHE_BLOB_URL || '/data/market-cache-cold.json';
    const hotUrl = env.VITE_CACHE_HOT_URL || '/data/market-cache-hot.json';

    const [cold, hot] = await Promise.all([fetchCacheBlob(coldUrl), fetchCacheBlob(hotUrl)]);
    if (!cold && !hot) return;

    let total = 0;
    // Apply cold first, then hot, so overlapping ids take the hot (fresher) row.
    for (const data of [cold, hot]) {
      if (!data) continue;
      const scopes: [string, MarketData][] = [
        [homeWorld, data.phantom],
        [dc, data.dc],
        [region, data.region],
      ];
      for (const [scope, marketData] of scopes) {
        const cache: ScopeCache = memCache.get(scope) ?? new Map();
        for (const [idStr, item] of Object.entries(marketData)) {
          cache.set(Number(idStr), { ts: data.ts, data: item });
          total++;
        }
        memCache.set(scope, cache);
        hydrated.add(scope);
      }
    }
    console.log(`[market] pre-seeded ${total} entries (cold=${!!cold} hot=${!!hot})`);
  } catch {
    // Blobs not available — normal before the cron has run.
  }
}
```

Then update the test from Step 1 to import and call `_resetSharedCacheForTests()` in
`beforeEach` instead of the `(… as any)._loaded` placeholder.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/universalis.test.ts`
Expected: PASS (existing cases + the new hot-override case).

- [ ] **Step 5: Commit**

```bash
git add src/lib/universalis.ts src/lib/universalis.test.ts
git commit -m "feat(market): client merges hot blob over cold (legacy fallback)"
```

---

### Task 5: `fields=` payload trim (with live verification gate)

> **EXECUTED 2026-06-07 — plan corrected after live verification.** The naive single
> `MARKET_FIELDS` constant below was wrong: Universalis needs **`items.`-prefixed**
> paths for the multi-item endpoint and **bare** paths for the single-item endpoint
> (the wrong form returns an EMPTY response). Both `buildMarketUrl` and `fetchBatch`
> can emit either shape, so the shipped implementation uses a
> `marketFields(idCount: number)` helper that prefixes with `items.` when `idCount > 1`.
> See commit `16cd33d`. The steps below are kept for history; the shipped code differs
> as described in this note.

**Files:**
- Modify: `src/lib/universalis.ts` (`buildMarketUrl`), `src/bot/marketFetch.ts`
- Test: `src/lib/universalis.test.ts`

- [ ] **Step 1: Write the failing test (URL shape only)**

Add to `src/lib/universalis.test.ts`:

```ts
import { buildMarketUrl, MARKET_FIELDS } from './universalis';

describe('buildMarketUrl fields', () => {
  it('appends the MARKET_FIELDS whitelist', () => {
    const url = buildMarketUrl('Phantom', [1, 2]);
    expect(url).toContain('/api/v2/Phantom/1,2');
    expect(url).toContain(`fields=${MARKET_FIELDS}`);
    expect(MARKET_FIELDS).toContain('listings.pricePerUnit');
    expect(MARKET_FIELDS).toContain('lastUploadTime');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/universalis.test.ts -t "fields"`
Expected: FAIL — `MARKET_FIELDS` not exported.

- [ ] **Step 3: Implement**

In `src/lib/universalis.ts`, add above `buildMarketUrl`:

```ts
/** Whitelist of response fields the parser actually reads — trims Universalis
 * payloads. Paths are relative to each item in the multi-item response. */
export const MARKET_FIELDS = [
  'itemID',
  'listings.pricePerUnit', 'listings.hq', 'listings.worldName', 'listings.quantity', 'listings.retainerName',
  'recentHistory.pricePerUnit', 'recentHistory.hq', 'recentHistory.timestamp',
  'regularSaleVelocity', 'lastUploadTime', 'averagePriceNQ', 'averagePriceHQ', 'listingsCount',
].join(',');
```

Replace `buildMarketUrl`:

```ts
export function buildMarketUrl(scope: Scope, ids: number[]): string {
  return `https://universalis.app/api/v2/${scope}/${ids.join(',')}?listings=10&entries=15&fields=${MARKET_FIELDS}`;
}
```

In `src/bot/marketFetch.ts`, update the URL in `fetchBatch`:

```ts
import { parseMarketResponse, LISTINGS_CAP, MARKET_FIELDS, type MarketData } from '../lib/universalis';
// ...
  const url = `https://universalis.app/api/v2/${scope}/${ids.join(',')}?listings=${LISTINGS_CAP}&entries=15&fields=${MARKET_FIELDS}`;
```

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run src/lib/universalis.test.ts src/lib/universalisBulk.test.ts`
Expected: PASS.

- [ ] **Step 5: LIVE parity verification (REQUIRED gate before relying on the trim)**

Run (PowerShell, hits Universalis directly — confirms the `fields` paths are correct
and no parsed field went null):

```bash
node -e "const f='itemID,listings.pricePerUnit,listings.hq,listings.worldName,listings.quantity,listings.retainerName,recentHistory.pricePerUnit,recentHistory.hq,recentHistory.timestamp,regularSaleVelocity,lastUploadTime,averagePriceNQ,averagePriceHQ,listingsCount'; (async()=>{const a=await (await fetch('https://universalis.app/api/v2/Phantom/5057?listings=10&entries=15')).json(); const b=await (await fetch('https://universalis.app/api/v2/Phantom/5057?listings=10&entries=15&fields='+f)).json(); const pick=x=>({v:x.regularSaleVelocity,lut:x.lastUploadTime,lc:x.listingsCount,l0:x.listings?.[0]?.pricePerUnit,w0:x.listings?.[0]?.worldName,h0:x.recentHistory?.[0]?.pricePerUnit,t0:x.recentHistory?.[0]?.timestamp}); console.log('full',pick(a)); console.log('trim',pick(b)); console.log('MATCH',JSON.stringify(pick(a))===JSON.stringify(pick(b)));})()"
```

Expected: `MATCH true` and no `undefined` in the `trim` line.

- If MATCH is **false** or any field is `undefined`: the `fields` paths need the
  `items.` prefix or a different path. **Do not commit the trim.** Revert
  `buildMarketUrl` / `fetchBatch` to the no-`fields` URL, keep `MARKET_FIELDS`
  exported but unused, and note in the commit that cadence (Tier 1) ships without
  the payload trim pending a fix. (Cadence alone still delivers the 6× win.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/universalis.ts src/bot/marketFetch.ts src/lib/universalis.test.ts
git commit -m "perf(market): trim Universalis payloads with fields= whitelist"
```

---

### Task 6: Rebuild API + document cron + env config

**Files:**
- Modify: `api/refresh-cache.mjs` (regenerated), `bot/README.md` or `README.md` (cron notes)

- [ ] **Step 1: Rebuild the API bundle (picks up Task 5 changes)**

Run: `npm run build:api`
Expected: `api/refresh-cache.mjs` regenerated.

- [ ] **Step 2: Run the full test + typecheck gate**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 3: Document the cron + env changes**

Append to `README.md` a "Market cache refresh" note:

```markdown
### Market cache refresh (hot/cold tiers)

Two external cron jobs (cron-job.org) hit the same lambda:

- **Cold (full):** `GET /api/refresh-cache?token=$REFRESH_SECRET` — hourly. Fetches
  all tracked items, writes `market-cache-cold.json`, and re-derives `hot-ids.json`.
- **Hot (active items):** `GET /api/refresh-cache?token=$REFRESH_SECRET&tier=hot` —
  every 5 min. Fetches only `hot-ids.json` items, writes `market-cache-hot.json`.

Env:
- `HOT_VELOCITY_THRESHOLD` (default `10`) — min `regularSaleVelocity` for the hot set.
- `VITE_CACHE_COLD_URL` / `VITE_CACHE_HOT_URL` — client blob URLs (fall back to
  `VITE_CACHE_BLOB_URL` legacy single blob, then `/data/*`).
```

- [ ] **Step 4: Commit**

```bash
git add api/refresh-cache.mjs README.md
git commit -m "docs(market): hot/cold cron + env configuration"
```

---

## Manual rollout (post-merge, by the user)

1. Deploy. Client uses legacy fallback until the new blobs exist — no breakage.
2. Set Vercel env `VITE_CACHE_COLD_URL` / `VITE_CACHE_HOT_URL` to the blob URLs once
   the first cold/hot runs have written them (or leave unset to use `/data/*`).
3. Repoint the existing cron to the **cold** URL (hourly) and add the **hot** cron
   (5 min, `&tier=hot`).
4. Confirm `selectHotIds` is picking a sane count (the cold response JSON logs
   `hotCount`).

## Self-review notes

- **Spec coverage:** Tier 1 cadence = Task 6 docs (config); Tier 1 `fields=` = Task 5;
  Tier 2 two-blob + tiering = Tasks 1–4. Tier 3 + #4 are deliberately out of this
  plan (separate subsystems; pure `selectHotIds` seam landed in Task 1).
- **Types:** `MarketBundle` (from `marketFetch.ts`), `SharedCache`/`MarketData`/
  `ScopeCache` (from `universalis.ts`), `MarketItem` reused consistently across tasks.
- **No placeholders** except the explicitly-flagged test-reset line in Task 4 Step 1,
  resolved in Step 3.
