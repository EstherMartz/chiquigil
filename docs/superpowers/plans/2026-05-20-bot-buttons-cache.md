# Bot Interactive Buttons + Per-CSV Cache — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Marie Kondo cleanup reply into a navigable view — 4 buttons under the embed (3 list expansions + refresh), backed by a 30-min sliding-TTL per-user in-memory cache that powers a "refresh prices" path without re-uploading the CSV.

**Architecture:** All work is bot-side. New modules under `bot/src/`: a Map-based cache with TTL/LRU, a button row builder + customId codec, three expanded-bucket formatters bolted onto `formatDiscord.ts`, and an `InteractionCreate` handler that dispatches by `customId.action`. The existing `handleCsv` pipeline is untouched; the `index.ts` wiring layer changes to register the cache singleton, add the interaction handler, and pass the cache through.

**Tech Stack:** TypeScript + ESM, `discord.js@^14.16` (already a dep), Node `crypto.randomBytes` for `cacheId` nonces, `vitest` (new dev dep for the bot — matches the web's test toolchain).

**Spec:** [`docs/superpowers/specs/2026-05-20-bot-buttons-cache-design.md`](../specs/2026-05-20-bot-buttons-cache-design.md)

---

## Task 1: Bootstrap bot test infra + export `ParseResult`

**Files:**
- Modify: `bot/package.json`
- Create: `bot/vitest.config.ts`
- Modify: `src/features/cleanup/parseAllaganInventory.ts` (1-line export)
- Create: `bot/src/cleanupCache.test.ts` (placeholder smoke test)

The bot has no test runner today. Phase 1 adds vitest with the same conventions the web side already uses (`*.test.ts` next to source). The `ParseResult` interface inside `parseAllaganInventory.ts` is unexported today — the cache needs to type its `parsed` field against it, so we promote it to `export interface`.

- [ ] **Step 1: Add vitest to `bot/package.json`**

Edit `bot/package.json`. Add to `devDependencies`:

```json
"vitest": "^4.1.5"
```

Add a `test` script under `scripts`:

```json
"test": "vitest"
```

The final relevant slices of the file should look like:

```json
"scripts": {
  "dev": "tsx watch --env-file=.env src/index.ts",
  "build": "tsc -p tsconfig.json",
  "start": "node --env-file=.env dist/bot/src/index.js",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "test": "vitest"
},
"devDependencies": {
  "@types/node": "^20.16.10",
  "tsx": "^4.19.1",
  "typescript": "^5.6.2",
  "vitest": "^4.1.5"
}
```

- [ ] **Step 2: Create `bot/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

Bot is Node-only (no jsdom needed). The `include` glob restricts vitest to bot tests; the parent web suite is invoked separately from the repo root.

- [ ] **Step 3: Install the new dev dep**

Run (from `bot/`):

```
npm install
```

Expected: `vitest` lands in `bot/node_modules` and `bot/package-lock.json` is regenerated.

- [ ] **Step 4: Export `ParseResult` from `parseAllaganInventory.ts`**

Edit `src/features/cleanup/parseAllaganInventory.ts:101`. Change:

```typescript
interface ParseResult {
  entries: InventoryEntry[];
  unrecognized: InventoryEntry[];
}
```

to:

```typescript
export interface ParseResult {
  entries: InventoryEntry[];
  unrecognized: InventoryEntry[];
}
```

- [ ] **Step 5: Add a smoke test that confirms the runner works**

Create `bot/src/cleanupCache.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('bot test runner', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run tests, confirm pass**

Run (from `bot/`):

```
npm test -- --run
```

Expected: `1 passed`. (We use `--run` so vitest exits instead of entering watch mode.)

- [ ] **Step 7: Confirm typecheck still passes for both bot and web**

Run from `bot/`:

```
npm run typecheck
```

Run from repo root:

```
npx tsc --noEmit
```

Both expected to pass with no new errors. The `export` change on `ParseResult` is additive and should not break the web build.

- [ ] **Step 8: Commit**

```
git add bot/package.json bot/package-lock.json bot/vitest.config.ts bot/src/cleanupCache.test.ts src/features/cleanup/parseAllaganInventory.ts
git commit -m "chore(bot): add vitest, export ParseResult for downstream cache typing"
```

---

## Task 2: `cleanupCache.ts` — sliding TTL Map with LRU eviction

**Files:**
- Create: `bot/src/cleanupCache.ts`
- Modify: `bot/src/cleanupCache.test.ts` (replace the smoke test)

The cache is pure: a wrapper around a `Map<userId, CachedCleanup>` with `set` / `get` (touch-on-read) / `evictExpired` / soft-cap LRU on insertion. No timer management here — `index.ts` owns the sweep interval; the cache exposes the sweep function and gets called.

- [ ] **Step 1: Write failing tests**

Replace the entire contents of `bot/src/cleanupCache.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCleanupCache, type CachedCleanup } from './cleanupCache';

function fakeEntry(overrides: Partial<CachedCleanup> = {}): CachedCleanup {
  const now = Date.now();
  return {
    ownerId: 'u1',
    cacheId: 'abcdef012345',
    csv: '',
    parsed: { entries: [], unrecognized: [] },
    marketIds: [],
    result: { craft: [], sellMb: [], vendor: [], discard: [], unrecognized: [] },
    usesByItemId: new Map(),
    createdAt: now,
    lastTouchedAt: now,
    ...overrides,
  };
}

describe('cleanupCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores and retrieves entries by ownerId', () => {
    const cache = createCleanupCache({ ttlMs: 30 * 60_000, maxEntries: 100 });
    const entry = fakeEntry({ ownerId: 'u1' });
    cache.set('u1', entry);
    expect(cache.get('u1')).toBe(entry);
  });

  it('returns null for missing entries', () => {
    const cache = createCleanupCache({ ttlMs: 30 * 60_000, maxEntries: 100 });
    expect(cache.get('nobody')).toBeNull();
  });

  it('returns null and removes entry once TTL has elapsed', () => {
    const cache = createCleanupCache({ ttlMs: 1000, maxEntries: 100 });
    cache.set('u1', fakeEntry({ ownerId: 'u1' }));
    vi.advanceTimersByTime(1001);
    expect(cache.get('u1')).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it('get() bumps lastTouchedAt to extend the sliding TTL', () => {
    const cache = createCleanupCache({ ttlMs: 1000, maxEntries: 100 });
    cache.set('u1', fakeEntry({ ownerId: 'u1' }));
    vi.advanceTimersByTime(900);
    expect(cache.get('u1')).not.toBeNull(); // touch
    vi.advanceTimersByTime(900);
    expect(cache.get('u1')).not.toBeNull(); // still alive — first touch reset the clock
  });

  it('evicts the least-recently-touched entry when over soft cap', () => {
    const cache = createCleanupCache({ ttlMs: 30 * 60_000, maxEntries: 2 });
    cache.set('u1', fakeEntry({ ownerId: 'u1' }));
    vi.advanceTimersByTime(10);
    cache.set('u2', fakeEntry({ ownerId: 'u2' }));
    vi.advanceTimersByTime(10);
    cache.get('u1'); // bump u1
    vi.advanceTimersByTime(10);
    cache.set('u3', fakeEntry({ ownerId: 'u3' })); // size now 3 > cap 2 → evict oldest-touched, which is u2
    expect(cache.get('u1')).not.toBeNull();
    expect(cache.get('u2')).toBeNull();
    expect(cache.get('u3')).not.toBeNull();
  });

  it('evictExpired() removes only expired entries', () => {
    const cache = createCleanupCache({ ttlMs: 1000, maxEntries: 100 });
    cache.set('old', fakeEntry({ ownerId: 'old' }));
    vi.advanceTimersByTime(500);
    cache.set('fresh', fakeEntry({ ownerId: 'fresh' }));
    vi.advanceTimersByTime(600); // old has aged 1100ms (> 1000), fresh has aged 600ms
    cache.evictExpired();
    expect(cache.get('old')).toBeNull();
    expect(cache.get('fresh')).not.toBeNull();
  });

  it('delete() removes a specific entry', () => {
    const cache = createCleanupCache({ ttlMs: 30 * 60_000, maxEntries: 100 });
    cache.set('u1', fakeEntry({ ownerId: 'u1' }));
    cache.delete('u1');
    expect(cache.get('u1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail with "module not found"**

Run from `bot/`:

```
npm test -- --run
```

Expected: vitest fails to resolve `./cleanupCache`.

- [ ] **Step 3: Implement `bot/src/cleanupCache.ts`**

```typescript
import type { ParseResult } from '../../src/features/cleanup/parseAllaganInventory';
import type { CleanupResult, UsesEntry } from '../../src/features/cleanup/types';

export interface CachedCleanup {
  ownerId: string;
  cacheId: string;
  csv: string;
  parsed: ParseResult;
  marketIds: number[];
  result: CleanupResult;
  usesByItemId: Map<number, UsesEntry[]>;
  createdAt: number;
  lastTouchedAt: number;
}

export interface CleanupCacheOptions {
  ttlMs: number;
  maxEntries: number;
}

export interface CleanupCache {
  set(userId: string, entry: CachedCleanup): void;
  get(userId: string): CachedCleanup | null;
  delete(userId: string): void;
  evictExpired(): void;
  size(): number;
}

export function createCleanupCache(opts: CleanupCacheOptions): CleanupCache {
  const store = new Map<string, CachedCleanup>();

  function isExpired(entry: CachedCleanup, now: number): boolean {
    return now - entry.lastTouchedAt > opts.ttlMs;
  }

  function evictOldestTouched(): void {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [key, entry] of store) {
      if (entry.lastTouchedAt < oldestTs) {
        oldestTs = entry.lastTouchedAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) store.delete(oldestKey);
  }

  return {
    set(userId, entry) {
      store.set(userId, entry);
      while (store.size > opts.maxEntries) evictOldestTouched();
    },
    get(userId) {
      const entry = store.get(userId);
      if (!entry) return null;
      const now = Date.now();
      if (isExpired(entry, now)) {
        store.delete(userId);
        return null;
      }
      entry.lastTouchedAt = now;
      return entry;
    },
    delete(userId) {
      store.delete(userId);
    },
    evictExpired() {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (isExpired(entry, now)) store.delete(key);
      }
    },
    size() {
      return store.size;
    },
  };
}
```

- [ ] **Step 4: Run tests, confirm all pass**

Run from `bot/`:

```
npm test -- --run
```

Expected: `7 passed` (one per test in the file).

- [ ] **Step 5: Commit**

```
git add bot/src/cleanupCache.ts bot/src/cleanupCache.test.ts
git commit -m "feat(bot): per-user cleanup cache with sliding TTL + LRU eviction"
```

---

## Task 3: `buttons.ts` — customId codec + overview-row builder

**Files:**
- Create: `bot/src/buttons.ts`
- Create: `bot/src/buttons.test.ts`

The `customId` codec is a tiny pair of pure functions. The overview-row builder takes ownerId + cacheId + a `CleanupResult` and returns a single `ActionRowBuilder<ButtonBuilder>` with 4 buttons, with `disabled` set per bucket emptiness and labels showing live counts.

- [ ] **Step 1: Write failing tests**

Create `bot/src/buttons.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ButtonStyle } from 'discord.js';
import {
  buildOverviewButtons,
  encodeCustomId,
  decodeCustomId,
  type ButtonAction,
} from './buttons';
import type { CleanupResult } from '../../src/features/cleanup/types';

function emptyResult(overrides: Partial<CleanupResult> = {}): CleanupResult {
  return { craft: [], sellMb: [], vendor: [], discard: [], unrecognized: [], ...overrides };
}

describe('customId codec', () => {
  it('round-trips ownerId, cacheId, action', () => {
    const encoded = encodeCustomId({ ownerId: '123456789012345678', cacheId: 'abcdef012345', action: 'craft' });
    const decoded = decodeCustomId(encoded);
    expect(decoded).toEqual({ ownerId: '123456789012345678', cacheId: 'abcdef012345', action: 'craft' });
  });

  it('returns null for unparseable customId', () => {
    expect(decodeCustomId('totally-unrelated')).toBeNull();
    expect(decodeCustomId('cleanup:abc')).toBeNull();
    expect(decodeCustomId('cleanup:abc:user:bogus')).toBeNull();
  });

  it('rejects unknown actions', () => {
    expect(decodeCustomId('cleanup:abcdef012345:user1:somethingelse')).toBeNull();
  });

  it('stays under Discord 100-char customId limit', () => {
    const encoded = encodeCustomId({ ownerId: '999999999999999999', cacheId: 'ffffffffffff', action: 'refresh' });
    expect(encoded.length).toBeLessThan(100);
  });
});

describe('buildOverviewButtons', () => {
  it('emits exactly 4 buttons in a single row', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult({ craft: [{} as any] }));
    expect(row.components).toHaveLength(4);
  });

  it('disables craft button when craft bucket is empty', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult());
    const craftBtn = row.components[0].toJSON();
    expect(craftBtn.disabled).toBe(true);
  });

  it('enables craft button when craft bucket has rows', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult({ craft: [{} as any, {} as any] }));
    const craftBtn = row.components[0].toJSON();
    expect(craftBtn.disabled).toBe(false);
  });

  it('combines vendor + discard count on the vendor button label', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult({ vendor: [{} as any, {} as any], discard: [{} as any] }));
    const vendorBtn = row.components[2].toJSON();
    expect(vendorBtn.label).toContain('(3)');
  });

  it('refresh button is always enabled and uses Secondary style', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult());
    const refreshBtn = row.components[3].toJSON();
    expect(refreshBtn.disabled).toBeFalsy();
    expect(refreshBtn.style).toBe(ButtonStyle.Secondary);
  });

  it('encodes the right action in each button customId', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult({ craft: [{} as any], sellMb: [{} as any], vendor: [{} as any] }));
    const actions: ButtonAction[] = ['craft', 'sell', 'vendor', 'refresh'];
    row.components.forEach((btn, i) => {
      const decoded = decodeCustomId(btn.toJSON().custom_id!);
      expect(decoded?.action).toBe(actions[i]);
    });
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

```
npm test -- --run
```

Expected: vitest fails to resolve `./buttons`.

- [ ] **Step 3: Implement `bot/src/buttons.ts`**

```typescript
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { CleanupResult } from '../../src/features/cleanup/types';

export type ButtonAction = 'craft' | 'sell' | 'vendor' | 'refresh';

const ACTIONS: ReadonlySet<ButtonAction> = new Set(['craft', 'sell', 'vendor', 'refresh']);

export interface DecodedCustomId {
  ownerId: string;
  cacheId: string;
  action: ButtonAction;
}

export function encodeCustomId(parts: DecodedCustomId): string {
  return `cleanup:${parts.cacheId}:${parts.ownerId}:${parts.action}`;
}

export function decodeCustomId(customId: string): DecodedCustomId | null {
  const parts = customId.split(':');
  if (parts.length !== 4) return null;
  const [prefix, cacheId, ownerId, action] = parts;
  if (prefix !== 'cleanup') return null;
  if (!ACTIONS.has(action as ButtonAction)) return null;
  return { cacheId, ownerId, action: action as ButtonAction };
}

export function buildOverviewButtons(
  ownerId: string,
  cacheId: string,
  result: CleanupResult,
): ActionRowBuilder<ButtonBuilder> {
  const vendorAndDiscardCount = result.vendor.length + result.discard.length;

  const craft = new ButtonBuilder()
    .setCustomId(encodeCustomId({ ownerId, cacheId, action: 'craft' }))
    .setLabel(`🔨 Todas las recetas (${result.craft.length})`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(result.craft.length === 0);

  const sell = new ButtonBuilder()
    .setCustomId(encodeCustomId({ ownerId, cacheId, action: 'sell' }))
    .setLabel(`🛒 Todo el Mercado (${result.sellMb.length})`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(result.sellMb.length === 0);

  const vendor = new ButtonBuilder()
    .setCustomId(encodeCustomId({ ownerId, cacheId, action: 'vendor' }))
    .setLabel(`🗑️ Vendedor & Descartar (${vendorAndDiscardCount})`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(vendorAndDiscardCount === 0);

  const refresh = new ButtonBuilder()
    .setCustomId(encodeCustomId({ ownerId, cacheId, action: 'refresh' }))
    .setLabel('🔄 Refrescar precios')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(craft, sell, vendor, refresh);
}
```

- [ ] **Step 4: Run tests, confirm pass**

```
npm test -- --run
```

Expected: all tests in `buttons.test.ts` pass alongside the cache tests.

- [ ] **Step 5: Commit**

```
git add bot/src/buttons.ts bot/src/buttons.test.ts
git commit -m "feat(bot): button row builder + customId codec for cleanup interactions"
```

---

## Task 4: `formatDiscord.ts` — three expanded-bucket formatters + attach buttons

**Files:**
- Modify: `bot/src/formatDiscord.ts`
- Create: `bot/src/formatDiscord.test.ts`

`formatCleanupReply` keeps current truncation but now also returns a `components` array containing the buttons row (passed in via a new optional param so unit tests can call the formatter without a cacheId). Three new exported builders produce `EmbedBuilder[]` per bucket, capped at 25 fields per embed (Discord's hard limit) up to 3 embeds.

- [ ] **Step 1: Write failing tests**

Create `bot/src/formatDiscord.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatExpandedCraftReply,
  formatExpandedSellReply,
  formatExpandedVendorDiscardReply,
  formatCleanupReply,
} from './formatDiscord';
import type { CleanupResult, CleanupRow, InventoryEntry } from '../../src/features/cleanup/types';

function entry(id: number, name: string, qty = 1): InventoryEntry {
  return { itemId: id, name, qty, isHq: false, locations: ['bag'] };
}

function craftRow(id: number): CleanupRow {
  return {
    entry: entry(id, `Item ${id}`, 5),
    vendorRevenue: 0,
    mbRevenue: 0,
    mbListingCount: 0,
    mbScope: 'world',
    bucket: 'craft',
    bestCraft: {
      outputItemId: id + 1000,
      outputName: `Output ${id}`,
      outputPrice: 5000,
      netProfit: 1000,
      usedFromInventory: [],
      missingIngredients: [],
    },
    otherCrafts: [],
    runnerUp: null,
  };
}

function sellRow(id: number): CleanupRow {
  return {
    entry: entry(id, `Sell ${id}`, 3),
    vendorRevenue: 0,
    mbRevenue: 30000,
    mbListingCount: 5,
    mbScope: 'world',
    bucket: 'sellMb',
    bestCraft: null,
    otherCrafts: [],
    runnerUp: null,
  };
}

function vendorRow(id: number): CleanupRow {
  return {
    entry: entry(id, `Vendor ${id}`, 10),
    vendorRevenue: 500,
    mbRevenue: 0,
    mbListingCount: 0,
    mbScope: 'world',
    bucket: 'vendor',
    bestCraft: null,
    otherCrafts: [],
    runnerUp: null,
  };
}

function discardRow(id: number): CleanupRow {
  return {
    entry: entry(id, `Discard ${id}`, 1),
    vendorRevenue: 0,
    mbRevenue: 0,
    mbListingCount: 0,
    mbScope: 'world',
    bucket: 'discard',
    bestCraft: null,
    otherCrafts: [],
    runnerUp: null,
  };
}

function emptyResult(overrides: Partial<CleanupResult> = {}): CleanupResult {
  return { craft: [], sellMb: [], vendor: [], discard: [], unrecognized: [], ...overrides };
}

describe('formatExpandedCraftReply', () => {
  it('returns 1 embed for ≤25 craft rows', () => {
    const rows = Array.from({ length: 20 }, (_, i) => craftRow(i + 1));
    const embeds = formatExpandedCraftReply(emptyResult({ craft: rows }), new Map());
    expect(embeds).toHaveLength(1);
    expect(embeds[0].data.fields).toHaveLength(20);
  });

  it('splits into multiple embeds when over 25 rows', () => {
    const rows = Array.from({ length: 60 }, (_, i) => craftRow(i + 1));
    const embeds = formatExpandedCraftReply(emptyResult({ craft: rows }), new Map());
    expect(embeds).toHaveLength(3);
    expect(embeds[0].data.fields).toHaveLength(25);
    expect(embeds[1].data.fields).toHaveLength(25);
    expect(embeds[2].data.fields).toHaveLength(10);
  });

  it('hard-caps at 75 rows and footer-links the rest to cleanup.md', () => {
    const rows = Array.from({ length: 120 }, (_, i) => craftRow(i + 1));
    const embeds = formatExpandedCraftReply(emptyResult({ craft: rows }), new Map());
    expect(embeds).toHaveLength(3);
    const lastFooter = embeds[2].data.footer?.text ?? '';
    expect(lastFooter).toContain('cleanup.md');
    expect(lastFooter).toContain('45');
  });
});

describe('formatExpandedSellReply', () => {
  it('returns 1 embed for small lists', () => {
    const rows = Array.from({ length: 10 }, (_, i) => sellRow(i + 1));
    const embeds = formatExpandedSellReply(emptyResult({ sellMb: rows }));
    expect(embeds).toHaveLength(1);
    expect(embeds[0].data.fields).toHaveLength(10);
  });

  it('caps at 75 rows', () => {
    const rows = Array.from({ length: 200 }, (_, i) => sellRow(i + 1));
    const embeds = formatExpandedSellReply(emptyResult({ sellMb: rows }));
    expect(embeds.flatMap((e) => e.data.fields ?? []).length).toBe(75);
  });
});

describe('formatExpandedVendorDiscardReply', () => {
  it('renders vendor and discard rows together, vendor first', () => {
    const vendors = [vendorRow(1), vendorRow(2)];
    const discards = [discardRow(10), discardRow(11)];
    const embeds = formatExpandedVendorDiscardReply(emptyResult({ vendor: vendors, discard: discards }));
    expect(embeds).toHaveLength(1);
    const labels = (embeds[0].data.fields ?? []).map((f) => f.name);
    expect(labels[0]).toContain('Vendor 1');
    expect(labels[1]).toContain('Vendor 2');
    expect(labels[2]).toContain('Discard 10');
    expect(labels[3]).toContain('Discard 11');
  });

  it('respects the 75-row cap across vendor + discard combined', () => {
    const vendors = Array.from({ length: 50 }, (_, i) => vendorRow(i + 1));
    const discards = Array.from({ length: 50 }, (_, i) => discardRow(i + 100));
    const embeds = formatExpandedVendorDiscardReply(emptyResult({ vendor: vendors, discard: discards }));
    expect(embeds.flatMap((e) => e.data.fields ?? []).length).toBe(75);
  });
});

describe('formatCleanupReply with buttons param', () => {
  it('attaches a components row when cacheId is provided', () => {
    const out = formatCleanupReply(
      { result: emptyResult({ craft: [craftRow(1)] }), usesByItemId: new Map(), totalRows: 1 },
      { ownerId: 'u1', cacheId: 'abcdef012345' },
    );
    expect(out.components).toHaveLength(1);
    expect(out.components![0].components).toHaveLength(4);
  });

  it('omits components when no ownerId/cacheId passed', () => {
    const out = formatCleanupReply({ result: emptyResult(), usesByItemId: new Map(), totalRows: 0 });
    expect(out.components).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

```
npm test -- --run
```

Expected: missing exports for `formatExpandedCraftReply`, `formatExpandedSellReply`, `formatExpandedVendorDiscardReply`, and the `components` field on `FormatOutput`.

- [ ] **Step 3: Extend `bot/src/formatDiscord.ts`**

At the top of the file, add the new imports next to the existing one:

```typescript
import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, type ButtonBuilder } from 'discord.js';
import { buildOverviewButtons } from './buttons';
```

Update the `FormatOutput` interface near the top:

```typescript
export interface FormatOutput {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
  summary: string;
  components?: ActionRowBuilder<ButtonBuilder>[];
}
```

Add a new optional second argument to `formatCleanupReply`. Find the existing signature and change it to:

```typescript
export interface ButtonContext {
  ownerId: string;
  cacheId: string;
}

export function formatCleanupReply(
  input: FormatInput,
  buttons?: ButtonContext,
): FormatOutput {
  // ... existing body unchanged ...
```

Just before the existing `return { embeds, files: [file], summary };` line, splice in:

```typescript
  const components = buttons
    ? [buildOverviewButtons(buttons.ownerId, buttons.cacheId, result)]
    : undefined;
  return { embeds, files: [file], summary, components };
```

(Remove the old `return` line so the new one is the only one.)

Add the three new exported builders at the bottom of the file (after the existing `buildMarkdown` definition):

```typescript
const FIELDS_PER_EMBED = 25;       // Discord hard limit per embed
const MAX_EMBEDS_PER_REPLY = 3;    // ⇒ 75 rows hard cap
const ROW_CAP = FIELDS_PER_EMBED * MAX_EMBEDS_PER_REPLY;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function craftFieldsFor(row: CleanupRow): { name: string; value: string } {
  const lines: string[] = [];
  if (row.bestCraft) {
    const sign = row.bestCraft.netProfit >= 0 ? '+' : '−';
    lines.push(`→ ${row.bestCraft.outputName} ${sign}${fmtGil(Math.abs(row.bestCraft.netProfit))}g${craftAlt(row)}`);
    if (row.otherCrafts.length > 0) lines.push(`  +${row.otherCrafts.length} recetas más`);
    const missing = row.bestCraft.missingIngredients;
    if (missing.length > 0) {
      lines.push(`  comprar: ${missing.map((m) => `${m.amount}× ${m.name}`).join(', ').slice(0, 200)}`);
    }
  }
  return { name: rowLabel(row.entry), value: lines.join('\n').slice(0, EMBED_FIELD_MAX) || '—' };
}

function sellFieldsFor(row: CleanupRow): { name: string; value: string } {
  const perEa = Math.round(row.mbRevenue / Math.max(1, row.entry.qty));
  const scopeLabel = row.mbScope === 'dc' ? ' · DC' : row.mbScope === 'region' ? ' · entre DCs' : '';
  const thin = row.mbListingCount < 2 ? ' · mercado tímido' : ` · ${row.mbListingCount} anuncios`;
  return {
    name: rowLabel(row.entry),
    value: `${fmtFull(perEa)}g/ud · total ${fmtGil(row.mbRevenue)}g${thin}${scopeLabel}`.slice(0, EMBED_FIELD_MAX),
  };
}

function vendorFieldFor(row: CleanupRow): { name: string; value: string } {
  const perEa = Math.round(row.vendorRevenue / Math.max(1, row.entry.qty));
  return {
    name: rowLabel(row.entry),
    value: `${fmtFull(perEa)}g/ud · total ${fmtGil(row.vendorRevenue)}g`.slice(0, EMBED_FIELD_MAX),
  };
}

function discardFieldFor(row: CleanupRow): { name: string; value: string } {
  return { name: rowLabel(row.entry), value: 'gracias por tu servicio' };
}

function buildPagedEmbeds(
  title: (page: number, total: number) => string,
  color: number,
  rows: Array<{ name: string; value: string }>,
  totalRows: number,
): EmbedBuilder[] {
  const capped = rows.slice(0, ROW_CAP);
  const pages = chunk(capped, FIELDS_PER_EMBED);
  const overflow = totalRows - capped.length;
  return pages.map((page, idx) => {
    const embed = new EmbedBuilder()
      .setTitle(title(idx + 1, pages.length))
      .setColor(color)
      .addFields(page);
    if (idx === pages.length - 1 && overflow > 0) {
      embed.setFooter({ text: `…+${overflow} más en cleanup.md` });
    }
    return embed;
  });
}

export function formatExpandedCraftReply(
  result: CleanupResult,
  _usesByItemId: Map<number, UsesEntry[]>,
): EmbedBuilder[] {
  const fields = result.craft.map(craftFieldsFor);
  return buildPagedEmbeds(
    (p, t) => `▸ Crea con ellos algo nuevo · ${result.craft.length} (página ${p}/${t})`,
    0x82c8a0,
    fields,
    result.craft.length,
  );
}

export function formatExpandedSellReply(result: CleanupResult): EmbedBuilder[] {
  const fields = result.sellMb.map(sellFieldsFor);
  return buildPagedEmbeds(
    (p, t) => `▸ Que encuentren nuevo dueño · ${result.sellMb.length} (página ${p}/${t})`,
    0xa098dc,
    fields,
    result.sellMb.length,
  );
}

export function formatExpandedVendorDiscardReply(result: CleanupResult): EmbedBuilder[] {
  const fields = [
    ...result.vendor.map(vendorFieldFor),
    ...result.discard.map(discardFieldFor),
  ];
  return buildPagedEmbeds(
    (p, t) => `▸ Vendedor & Descartar · ${result.vendor.length + result.discard.length} (página ${p}/${t})`,
    0x6b6b6b,
    fields,
    result.vendor.length + result.discard.length,
  );
}
```

Note the `_usesByItemId` parameter in `formatExpandedCraftReply` is kept for symmetry with the existing handler signature even though we don't surface it in the embed; the per-recipe uses appendix is already in `cleanup.md`.

- [ ] **Step 4: Run tests, confirm all pass**

```
npm test -- --run
```

Expected: cache + button + format tests all pass (≈18–22 passing total).

- [ ] **Step 5: Confirm typecheck still clean**

```
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```
git add bot/src/formatDiscord.ts bot/src/formatDiscord.test.ts
git commit -m "feat(bot): expanded-bucket formatters + components on formatCleanupReply"
```

---

## Task 5: `interactions.ts` — ownership check, dispatch, refresh path

**Files:**
- Create: `bot/src/interactions.ts`
- Create: `bot/src/interactions.test.ts`

The handler decodes `customId`, checks ownership, dispatches by action. The refresh action re-runs the full cleanup pipeline against fresh Universalis prices for the cached `marketIds`. The `fetchMarketForOutputs` dependency is injected so tests can mock it cleanly.

- [ ] **Step 1: Write failing tests**

Create `bot/src/interactions.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { handleInteraction, type InteractionDeps } from './interactions';
import { createCleanupCache, type CachedCleanup } from './cleanupCache';
import { encodeCustomId } from './buttons';
import type { MarketBundle } from '../../src/features/watchlist/useMarketData';

interface FakeInteraction {
  customId: string;
  user: { id: string };
  isButton: () => boolean;
  reply: ReturnType<typeof vi.fn>;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
}

function fakeInteraction(customId: string, userId: string): FakeInteraction {
  return {
    customId,
    user: { id: userId },
    isButton: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeEntry(ownerId: string, cacheId: string): CachedCleanup {
  const now = Date.now();
  return {
    ownerId,
    cacheId,
    csv: 'fake-csv',
    parsed: { entries: [], unrecognized: [] },
    marketIds: [123],
    result: { craft: [], sellMb: [], vendor: [], discard: [], unrecognized: [] },
    usesByItemId: new Map(),
    createdAt: now,
    lastTouchedAt: now,
  };
}

function emptyMarket(): MarketBundle {
  return { phantom: {}, dc: {}, region: {} };
}

function fakeDeps(overrides: Partial<InteractionDeps> = {}): InteractionDeps {
  const cache = createCleanupCache({ ttlMs: 30 * 60_000, maxEntries: 100 });
  return {
    cache,
    snapshots: { itemsById: new Map(), namesById: new Map(), recipes: new Map() },
    cfg: { world: 'Phantom', dc: 'Chaos', region: 'Europe' },
    fetchMarket: vi.fn().mockResolvedValue(emptyMarket()),
    ...overrides,
  };
}

describe('handleInteraction', () => {
  it('ignores non-button interactions', async () => {
    const deps = fakeDeps();
    const i = fakeInteraction('cleanup:abc:user1:craft', 'user1');
    i.isButton = () => false;
    await handleInteraction(i as any, deps);
    expect(i.reply).not.toHaveBeenCalled();
  });

  it('ignores customIds that are not ours', async () => {
    const deps = fakeDeps();
    const i = fakeInteraction('unrelated-button', 'user1');
    await handleInteraction(i as any, deps);
    expect(i.reply).not.toHaveBeenCalled();
  });

  it('refuses owner-mismatched clicks', async () => {
    const deps = fakeDeps();
    const i = fakeInteraction(
      encodeCustomId({ ownerId: 'user1', cacheId: 'abcdef012345', action: 'craft' }),
      'user2',
    );
    await handleInteraction(i as any, deps);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('otro inventario'),
        ephemeral: true,
      }),
    );
  });

  it('returns cache-miss message when entry expired or evicted', async () => {
    const deps = fakeDeps();
    const i = fakeInteraction(
      encodeCustomId({ ownerId: 'user1', cacheId: 'abcdef012345', action: 'craft' }),
      'user1',
    );
    await handleInteraction(i as any, deps);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('descansa en paz'),
        ephemeral: true,
      }),
    );
  });

  it('returns cache-miss when cacheId does not match the cached entry', async () => {
    const deps = fakeDeps();
    deps.cache.set('user1', fakeEntry('user1', 'currentid0000'));
    const i = fakeInteraction(
      encodeCustomId({ ownerId: 'user1', cacheId: 'staleid000000', action: 'craft' }),
      'user1',
    );
    await handleInteraction(i as any, deps);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('descansa en paz'),
        ephemeral: true,
      }),
    );
  });

  it('craft action replies ephemerally with expanded craft embeds', async () => {
    const deps = fakeDeps();
    deps.cache.set('user1', fakeEntry('user1', 'abcdef012345'));
    const i = fakeInteraction(
      encodeCustomId({ ownerId: 'user1', cacheId: 'abcdef012345', action: 'craft' }),
      'user1',
    );
    await handleInteraction(i as any, deps);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
        embeds: expect.any(Array),
      }),
    );
  });

  it('refresh action re-fetches market, inserts a new cache entry with new cacheId, and edits the deferred reply', async () => {
    const fetchMarket = vi.fn().mockResolvedValue(emptyMarket());
    const deps = fakeDeps({ fetchMarket });
    deps.cache.set('user1', fakeEntry('user1', 'oldcacheid12'));
    const i = fakeInteraction(
      encodeCustomId({ ownerId: 'user1', cacheId: 'oldcacheid12', action: 'refresh' }),
      'user1',
    );
    await handleInteraction(i as any, deps);
    expect(i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(fetchMarket).toHaveBeenCalledWith([123], deps.cfg);
    expect(i.editReply).toHaveBeenCalled();
    const fresh = deps.cache.get('user1');
    expect(fresh).not.toBeNull();
    expect(fresh!.cacheId).not.toBe('oldcacheid12');
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

```
npm test -- --run
```

Expected: `./interactions` module missing.

- [ ] **Step 3: Implement `bot/src/interactions.ts`**

```typescript
import type { ButtonInteraction, Interaction } from 'discord.js';
import { randomBytes } from 'node:crypto';
import { decodeCustomId, type ButtonAction } from './buttons';
import type { CleanupCache, CachedCleanup } from './cleanupCache';
import type { BotSnapshots } from './loadSnapshots';
import type { MarketBundle } from '../../src/features/watchlist/useMarketData';
import {
  formatCleanupReply,
  formatExpandedCraftReply,
  formatExpandedSellReply,
  formatExpandedVendorDiscardReply,
} from './formatDiscord';
import { findCraftOpportunities } from '../../src/features/cleanup/findCraftOpportunities';
import { findInventoryUses } from '../../src/features/cleanup/findInventoryUses';
import { runCleanup } from '../../src/features/cleanup/runCleanup';

const OWNER_MISMATCH = 'Este botón pertenece a otro inventario ✨';
const CACHE_MISS = 'Tu inventario ya descansa en paz ✨ Súbelo otra vez si quieres seguir ordenando.';

export interface BotConfig {
  world: string;
  dc: string;
  region: string;
}

export interface InteractionDeps {
  cache: CleanupCache;
  snapshots: BotSnapshots;
  cfg: BotConfig;
  fetchMarket: (ids: number[], cfg: BotConfig) => Promise<MarketBundle>;
}

export function newCacheId(): string {
  return randomBytes(6).toString('hex');
}

export async function handleInteraction(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<void> {
  if (!interaction.isButton()) return;
  const btn = interaction as ButtonInteraction;
  const decoded = decodeCustomId(btn.customId);
  if (!decoded) return; // not one of ours

  if (decoded.ownerId !== btn.user.id) {
    await btn.reply({ content: OWNER_MISMATCH, ephemeral: true });
    return;
  }

  const cached = deps.cache.get(btn.user.id);
  if (!cached || cached.cacheId !== decoded.cacheId) {
    await btn.reply({ content: CACHE_MISS, ephemeral: true });
    return;
  }

  switch (decoded.action) {
    case 'craft': {
      const embeds = formatExpandedCraftReply(cached.result, cached.usesByItemId);
      await btn.reply({ embeds, ephemeral: true });
      return;
    }
    case 'sell': {
      const embeds = formatExpandedSellReply(cached.result);
      await btn.reply({ embeds, ephemeral: true });
      return;
    }
    case 'vendor': {
      const embeds = formatExpandedVendorDiscardReply(cached.result);
      await btn.reply({ embeds, ephemeral: true });
      return;
    }
    case 'refresh': {
      await btn.deferReply({ ephemeral: true });
      const market = await deps.fetchMarket(cached.marketIds, deps.cfg);
      const craftMap = findCraftOpportunities(
        cached.parsed.entries,
        deps.snapshots.recipes,
        market,
        deps.snapshots.itemsById,
      );
      const result = runCleanup({
        inventory: cached.parsed.entries,
        market,
        items: deps.snapshots.itemsById,
        craftOpportunities: craftMap,
        unrecognized: cached.parsed.unrecognized,
      });
      const usesByItemId = findInventoryUses(
        cached.parsed.entries,
        deps.snapshots.recipes,
        market,
        deps.snapshots.itemsById,
      );
      const cacheId = newCacheId();
      const next: CachedCleanup = {
        ...cached,
        cacheId,
        result,
        usesByItemId,
        lastTouchedAt: Date.now(),
      };
      deps.cache.set(btn.user.id, next);
      const totalRows = cached.parsed.entries.length + cached.parsed.unrecognized.length;
      const reply = formatCleanupReply(
        { result, usesByItemId, totalRows },
        { ownerId: btn.user.id, cacheId },
      );
      await btn.editReply({
        content: reply.summary,
        embeds: reply.embeds,
        files: reply.files,
        components: reply.components,
      });
      return;
    }
  }
}

export type { ButtonAction };
```

- [ ] **Step 4: Run tests, confirm all pass**

```
npm test -- --run
```

Expected: all interactions tests pass; full bot suite (~25+ tests) green.

- [ ] **Step 5: Commit**

```
git add bot/src/interactions.ts bot/src/interactions.test.ts
git commit -m "feat(bot): InteractionCreate handler — ownership, dispatch, refresh path"
```

---

## Task 6: Wire it all in `index.ts` + smoke test

**Files:**
- Modify: `bot/src/index.ts`
- Modify: `bot/src/handleCsv.ts`

`index.ts` now constructs the cache, registers a `setInterval` for sweep, registers the `InteractionCreate` handler, and passes `cacheId` + `ownerId` down to `handleCsv` so the reply includes buttons and the cache gets seeded. `handleCsv` gains output of `marketIds` + `parsed` so the caller can stash everything needed for a refresh.

- [ ] **Step 1: Extend `handleCsv.ts` to return cache-friendly artifacts**

Edit `bot/src/handleCsv.ts`. Replace the file contents with:

```typescript
import { parseAllaganInventory, type ParseResult } from '../../src/features/cleanup/parseAllaganInventory';
import { findCraftOpportunities } from '../../src/features/cleanup/findCraftOpportunities';
import { findInventoryUses } from '../../src/features/cleanup/findInventoryUses';
import { runCleanup } from '../../src/features/cleanup/runCleanup';
import { fetchMarketForOutputs } from './fetchMarketForOutputs';
import { formatCleanupReply, type FormatOutput } from './formatDiscord';
import type { BotSnapshots } from './loadSnapshots';
import type { CleanupResult, UsesEntry } from '../../src/features/cleanup/types';

interface Cfg {
  world: string;
  dc: string;
  region: string;
}

export interface HandleCsvOutput {
  reply: FormatOutput;
  parsed: ParseResult;
  marketIds: number[];
  result: CleanupResult;
  usesByItemId: Map<number, UsesEntry[]>;
}

export async function handleCsv(
  csv: string,
  snapshots: BotSnapshots,
  cfg: Cfg,
  buttons?: { ownerId: string; cacheId: string },
): Promise<HandleCsvOutput> {
  const parsed = parseAllaganInventory(csv, snapshots.namesById);

  const invItemIds = new Set<number>();
  for (const e of parsed.entries) if (e.itemId > 0) invItemIds.add(e.itemId);

  const marketIdSet = new Set<number>(invItemIds);
  for (const recipe of snapshots.recipes.values()) {
    const usesInv = recipe.ingredients.some((ing) => invItemIds.has(ing.itemId));
    if (!usesInv) continue;
    marketIdSet.add(recipe.itemResultId);
    for (const ing of recipe.ingredients) {
      if (!invItemIds.has(ing.itemId)) marketIdSet.add(ing.itemId);
    }
  }
  const marketIds = [...marketIdSet];

  const market = await fetchMarketForOutputs(marketIds, cfg);

  const craftMap = findCraftOpportunities(parsed.entries, snapshots.recipes, market, snapshots.itemsById);
  const result = runCleanup({
    inventory: parsed.entries,
    market,
    items: snapshots.itemsById,
    craftOpportunities: craftMap,
    unrecognized: parsed.unrecognized,
  });
  const usesByItemId = findInventoryUses(parsed.entries, snapshots.recipes, market, snapshots.itemsById);

  const reply = formatCleanupReply(
    {
      result,
      usesByItemId,
      totalRows: parsed.entries.length + parsed.unrecognized.length,
    },
    buttons,
  );

  return { reply, parsed, marketIds, result, usesByItemId };
}
```

- [ ] **Step 2: Wire cache + interaction handler into `index.ts`**

Replace the contents of `bot/src/index.ts` with:

```typescript
import { Client, Events, GatewayIntentBits, Partials, type Message } from 'discord.js';
import { config } from './config';
import { loadSnapshots } from './loadSnapshots';
import { handleCsv } from './handleCsv';
import { createCleanupCache, type CachedCleanup } from './cleanupCache';
import { handleInteraction, newCacheId } from './interactions';
import { fetchMarketForOutputs } from './fetchMarketForOutputs';

const TTL_MS = 30 * 60_000;       // 30-min sliding TTL
const MAX_ENTRIES = 100;
const SWEEP_MS = 5 * 60_000;      // sweep every 5 minutes

const GREETINGS = [
  'Gracias por confiarme tu inventario ✨ Voy a saludar a cada objeto y descubrir cuáles te traen alegría. Dame un par de minutos para ordenarlo todo con cariño.',
  '¡Qué tesoros tan bonitos! 🌸 Permíteme un momento para sentarme con cada uno y agradecerle su servicio antes de decidir su lugar.',
  'Hola, qué colección tan adorable ✨ Voy a tomar mi tiempo para saludar a cada objeto y preguntarle si aún chispea alegría en tu corazón.',
  'Gracias por compartir tus pertenencias conmigo 🌷 Voy a ordenar con cariño — dame un ratito mientras saludo a cada una y descubro cuáles te siguen dando alegría.',
];

function pickGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

async function main() {
  console.log('Loading snapshots…');
  const snapshots = await loadSnapshots(config.snapshotsDir);
  console.log(`Loaded ${snapshots.itemsById.size} items, ${snapshots.recipes.size} recipes.`);

  const cache = createCleanupCache({ ttlMs: TTL_MS, maxEntries: MAX_ENTRIES });
  const sweepTimer = setInterval(() => cache.evictExpired(), SWEEP_MS);
  sweepTimer.unref?.(); // don't keep the event loop alive solely for sweeps

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
  });

  client.on(Events.MessageCreate, async (msg: Message) => {
    if (msg.author.bot) return;
    if (!msg.guildId || !config.guildAllowlist.has(msg.guildId)) return;
    const attachment = msg.attachments.find((a) => a.name?.toLowerCase().endsWith('.csv'));
    if (!attachment) return;

    if (msg.channel.isTextBased() && 'sendTyping' in msg.channel) {
      await msg.channel.sendTyping();
    }
    await msg.reply(pickGreeting());

    try {
      const res = await fetch(attachment.url);
      if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
      const csv = await res.text();
      const cacheId = newCacheId();
      const out = await handleCsv(csv, snapshots, {
        world: config.world,
        dc: config.dc,
        region: config.region,
      }, { ownerId: msg.author.id, cacheId });
      await msg.reply({
        content: out.reply.summary,
        embeds: out.reply.embeds,
        files: out.reply.files,
        components: out.reply.components,
      });
      const entry: CachedCleanup = {
        ownerId: msg.author.id,
        cacheId,
        csv,
        parsed: out.parsed,
        marketIds: out.marketIds,
        result: out.result,
        usesByItemId: out.usesByItemId,
        createdAt: Date.now(),
        lastTouchedAt: Date.now(),
      };
      cache.set(msg.author.id, entry);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await msg.reply(`Couldn't process CSV: \`${m}\``);
    }
  });

  client.on(Events.InteractionCreate, (interaction) =>
    handleInteraction(interaction, {
      cache,
      snapshots,
      cfg: { world: config.world, dc: config.dc, region: config.region },
      fetchMarket: fetchMarketForOutputs,
    }).catch((err) => console.error('Interaction handler error:', err)),
  );

  await client.login(config.token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

From `bot/`:

```
npm test -- --run
```

Expected: all bot tests still pass.

- [ ] **Step 4: Typecheck both bot and web**

From `bot/`:

```
npm run typecheck
```

From repo root:

```
npx tsc --noEmit
```

Both pass.

- [ ] **Step 5: Commit**

```
git add bot/src/index.ts bot/src/handleCsv.ts
git commit -m "feat(bot): wire interactive buttons + cache into MessageCreate flow"
```

- [ ] **Step 6: Manual smoke test against a real Discord guild**

This step cannot be automated. From `bot/`:

```
npm run dev
```

In an allowlisted guild:

1. Drop a small Allagan CSV in the channel. Confirm bot replies with embeds + `cleanup.md` + a 4-button row.
2. Click "🔨 Todas las recetas" — confirm an ephemeral message lands with the full craft list (paginated if >25 rows).
3. Click "🛒 Todo el Mercado" — same pattern for sells.
4. Click "🗑️ Vendedor & Descartar" — confirm vendor and discard rows appear in that order.
5. Click "🔄 Refrescar precios" — confirm bot defers, then edits the ephemeral reply with a fresh overview + new buttons.
6. From a second Discord account in the same guild, click any of user 1's buttons — confirm "Este botón pertenece a otro inventario ✨" reply.
7. Wait 31 minutes (or temporarily lower `TTL_MS` for the test), then click a stale button from the original message — confirm "Tu inventario ya descansa en paz ✨" reply.

If any step fails or surprises (e.g., ephemeral + attachment rendering oddities, Discord embed-character limits triggered by Spanish text length), the implementer reports DONE_WITH_CONCERNS.

- [ ] **Step 7: Final commit if any smoke-test follow-ups were needed**

If step 6 surfaced bugs, fix and commit. Otherwise skip.

---

## Self-review

**Spec coverage:**
- 4-button row under reply → Task 3 + Task 4 (attach in `formatCleanupReply`).
- Ephemeral drill-downs → Task 5 (`reply({ ephemeral: true })` in all three list actions).
- Refresh path with new cacheId → Task 5 refresh case + Task 6 wiring.
- 30-min sliding TTL + LRU + soft cap → Task 2.
- 5-min sweep interval → Task 6 (`setInterval` in `index.ts`).
- Owner mismatch + cache-miss messages → Task 5 (constants `OWNER_MISMATCH`, `CACHE_MISS`).
- 25 fields × 3 embeds = 75 row cap with cleanup.md footer → Task 4 (`FIELDS_PER_EMBED`, `MAX_EMBEDS_PER_REPLY`, footer logic in `buildPagedEmbeds`).
- `cleanup.md` regenerated on refresh → Task 5 refresh case calls `formatCleanupReply` which always regenerates.
- `ParseResult` export prerequisite → Task 1.
- Bot test infra (vitest) → Task 1.

**Placeholder scan:** No TBD/TODO/placeholder language. Every step has the actual code or command.

**Type consistency:**
- `CachedCleanup` shape identical in Task 2 (definition), Task 5 (test fixtures + handler), Task 6 (insertion in `index.ts`).
- `formatCleanupReply` signature: gains optional `ButtonContext` arg in Task 4; called with the new arg in Task 5 refresh path and Task 6 wiring; called without the new arg in Task 4 backward-compat test.
- `handleCsv` return type changed in Task 6 to `HandleCsvOutput`; Task 6 wiring uses `.reply`, `.parsed`, `.marketIds`, `.result`, `.usesByItemId` accessors which all exist on `HandleCsvOutput`.
- `ButtonAction` type used in `buttons.ts` (Task 3) and re-exported from `interactions.ts` (Task 5) — same union.

No drift detected.
