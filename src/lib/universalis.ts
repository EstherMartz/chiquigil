import { getCachedMarketScope, putCachedMarketScope, type MarketScopeBlob } from './recipeCache';
import { trimmedMedian } from './priceTrust';

export type Scope = string; // world or DC name, e.g. 'Phantom' | 'Chaos'

export interface WorldListing { world: string; price: number; hq: boolean; quantity?: number; seller?: string }

export interface MarketItem {
  minNQ: number | null;
  minHQ: number | null;
  avgNQ: number | null;
  avgHQ: number | null;
  medianNQ: number | null;
  medianHQ: number | null;
  recentSalesNQ: number;
  recentSalesHQ: number;
  velocity: number;
  lastUploadTime: number;
  listingCount: number;
  worldListings: WorldListing[];
  averagePriceNQ: number | null;
  averagePriceHQ: number | null;
  /**
   * Newest recorded sale time in ms (max recentHistory timestamp ×1000), or null when no dated history.
   * Optional so the ~50 test/builder sites that construct MarketItem literals don't all need updating;
   * the parser always emits it (null when unknown). Consumers should treat a missing value as null.
   */
  lastSaleMs?: number | null;
}

export type MarketData = Record<string, MarketItem>;

/**
 * How many listings the bot fetches per item. Universalis only counts the
 * listings it returns (`listingsCount` is capped by this), so this is also the
 * ceiling on the "true" listing count we can show — items at/above it read as
 * "{cap}+". We keep only the cheapest few rows in the cache; the bump is just
 * so the count is accurate.
 */
export const LISTINGS_CAP = 50;
/** Listing rows kept in the cache (cheapest-first) for the cross-world + depth views. */
const LISTINGS_KEPT = LISTINGS_CAP;

interface RawListing { hq: boolean; pricePerUnit: number; worldName?: string; quantity?: number; retainerName?: string }
interface RawHistory { hq: boolean; pricePerUnit: number; timestamp?: number }
interface RawItem {
  listings?: RawListing[];
  recentHistory?: RawHistory[];
  regularSaleVelocity?: number;
  lastUploadTime?: number;
  averagePriceNQ?: number;
  averagePriceHQ?: number;
  listingsCount?: number;
}
interface RawResponse {
  items?: Record<string, RawItem>;
  itemID?: number;
  unresolvedItems?: number[];
}

type SingleItemRawResponse = RawItem & { itemID: number };

/**
 * Field paths the parser actually reads — used as Universalis' `fields` whitelist to
 * trim response payloads. The path form differs by request shape (verified live, and
 * the WRONG form returns an empty response, so this matters): the single-item endpoint
 * returns a flat object (bare paths like `listings.pricePerUnit`), while the multi-item
 * endpoint nests every item under `items` (paths must be `items.`-prefixed). Pick by
 * id count via `marketFields`.
 */
const MARKET_FIELD_PATHS = [
  'itemID',
  'listings.pricePerUnit', 'listings.hq', 'listings.worldName', 'listings.quantity', 'listings.retainerName',
  'recentHistory.pricePerUnit', 'recentHistory.hq', 'recentHistory.timestamp',
  'regularSaleVelocity', 'lastUploadTime', 'averagePriceNQ', 'averagePriceHQ', 'listingsCount',
];

/** Build the Universalis `fields` value for a request of `idCount` items. */
export function marketFields(idCount: number): string {
  const prefix = idCount > 1 ? 'items.' : '';
  return MARKET_FIELD_PATHS.map((p) => prefix + p).join(',');
}

export function buildMarketUrl(scope: Scope, ids: number[]): string {
  return `https://universalis.app/api/v2/${scope}/${ids.join(',')}?listings=10&entries=15&fields=${marketFields(ids.length)}`;
}

function minPrice(arr: RawListing[], hq: boolean): number | null {
  const v = arr.filter((l) => l.hq === hq).map((l) => l.pricePerUnit);
  return v.length ? Math.min(...v) : null;
}

function avgPrice(arr: RawHistory[], hq: boolean): number | null {
  const v = arr.filter((l) => l.hq === hq).map((l) => l.pricePerUnit);
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

export function parseMarketResponse(raw: RawResponse): MarketData {
  const out: MarketData = {};
  // Universalis returns a flat shape when the request is for a single item ID.
  // Normalize it into the multi-item shape so the parser below can be uniform.
  const items: Record<string, RawItem> = raw.items ?? (
    typeof raw.itemID === 'number'
      ? { [String(raw.itemID)]: raw as SingleItemRawResponse }
      : {}
  );
  for (const [id, item] of Object.entries(items)) {
    const listings = item.listings ?? [];
    const history = item.recentHistory ?? [];
    const nqHist = history.filter((h) => !h.hq).map((h) => h.pricePerUnit);
    const hqHist = history.filter((h) => h.hq).map((h) => h.pricePerUnit);
    const saleTimes = history
      .map((h) => h.timestamp)
      .filter((t): t is number => typeof t === 'number' && t > 0);
    const lastSaleMs = saleTimes.length ? Math.max(...saleTimes) * 1000 : null;
    out[id] = {
      minNQ: minPrice(listings, false),
      minHQ: minPrice(listings, true),
      avgNQ: avgPrice(history, false),
      avgHQ: avgPrice(history, true),
      medianNQ: trimmedMedian(nqHist),
      medianHQ: trimmedMedian(hqHist),
      recentSalesNQ: nqHist.length,
      recentSalesHQ: hqHist.length,
      velocity: item.regularSaleVelocity ?? 0,
      lastUploadTime: item.lastUploadTime ?? 0,
      // True total listings (Universalis' count, capped at the fetch cap), not
      // just the rows we keep. Falls back to the row count if absent.
      listingCount: item.listingsCount ?? listings.length,
      // Keep only the cheapest rows (API returns cheapest-first) so the cache
      // stays small even when many listings are fetched for the count.
      worldListings: listings.slice(0, LISTINGS_KEPT).map((l) => ({
        world: l.worldName ?? '',
        price: l.pricePerUnit,
        hq: l.hq,
        quantity: l.quantity ?? 1,
        seller: l.retainerName ?? '',
      })),
      averagePriceNQ: item.averagePriceNQ ?? null,
      averagePriceHQ: item.averagePriceHQ ?? null,
      lastSaleMs,
    };
  }
  return out;
}

// ---------- Cache (in-memory mirror of per-scope IDB blob) ----------

type ScopeCache = Map<number, { ts: number; data: MarketItem }>;
const memCache = new Map<string, ScopeCache>();
const hydrated = new Set<string>();

async function ensureHydrated(scope: string): Promise<void> {
  if (hydrated.has(scope)) return;
  hydrated.add(scope);
  try {
    const blob = await getCachedMarketScope<MarketItem>(scope);
    if (blob) memCache.set(scope, new Map(blob));
  } catch {
    // IDB unavailable — operate in-memory only.
  }
}

// ---------- Durable persistence (mirror memCache → IDB) ----------
// The in-memory cache is seeded from the bot's network blob each load, but
// live-filled rows (fetchMarketLive, for items the cron blob doesn't carry)
// would otherwise be lost on reload. Mirror each touched scope back to IDB so
// those rows survive — and so getMarketCacheLastFetchedAt() reports real
// freshness. Writes are debounced + coalesced (one put per scope) and run off
// the user path; failures are swallowed (in-memory stays authoritative).
const dirtyScopes = new Set<string>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DEBOUNCE_MS = 1500;

function schedulePersist(scope: string): void {
  dirtyScopes.add(scope);
  if (persistTimer) return;
  persistTimer = setTimeout(() => { void flushPersist(); }, PERSIST_DEBOUNCE_MS);
}

async function flushPersist(): Promise<void> {
  persistTimer = null;
  const scopes = [...dirtyScopes];
  dirtyScopes.clear();
  for (const scope of scopes) {
    const cache = memCache.get(scope);
    if (!cache) continue;
    try {
      const blob = [...cache.entries()] as MarketScopeBlob<MarketItem>;
      await putCachedMarketScope(scope, blob);
    } catch {
      // IDB unavailable — keep operating in-memory only.
    }
  }
}

// ---------- Startup seed gate ----------
// loadSharedMarketCache runs in the background (non-blocking first paint). Market
// reads await this so they read a populated cache instead of triggering a
// thundering live-fill on a cold cache. Resolves (never rejects) once seeding
// settles — or immediately when no seed is in flight (tests, post-seed).
let seedPromise: Promise<void> | null = null;
function awaitSeed(): Promise<void> { return seedPromise ?? Promise.resolve(); }

// ---------- Bot shared cache pre-seeding ----------

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

let sharedCacheLoaded = false;

/** Test helper: allow re-running loadSharedMarketCache. */
export function _resetSharedCacheForTests(): void {
  sharedCacheLoaded = false;
  seedPromise = null;
}

async function fetchCacheBlob(url: string): Promise<SharedCache | null> {
  try {
    const res = await fetch(url, { cache: 'default' });
    if (!res.ok) return null;
    return (await res.json()) as SharedCache;
  } catch {
    return null;
  }
}

/**
 * Pre-seed the in-memory cache. First hydrates each scope from IDB (so live-filled
 * rows persisted in a prior session survive the reload), then overlays the bot's
 * hourly COLD blob and ~5-min HOT blob. Entries merge by timestamp — a blob row
 * only replaces what's cached when it's at least as fresh — so fresher persisted
 * live prices are kept while the blob refreshes stale rows. Falls back to the
 * legacy single blob (VITE_CACHE_BLOB_URL) when cold is absent. Runs in the
 * background (does not block first paint); market reads await it via awaitSeed().
 */
export function loadSharedMarketCache(homeWorld: string, dc: string, region: string): Promise<void> {
  if (sharedCacheLoaded) return awaitSeed();
  sharedCacheLoaded = true;
  seedPromise = (async () => {
    try {
      // Persisted (incl. live-filled) rows first; the network blob is overlaid on top.
      await Promise.all([homeWorld, dc, region].map((s) => ensureHydrated(s)));

      const env = (import.meta as any).env ?? {};
      const coldUrl = env.VITE_CACHE_COLD_URL || env.VITE_CACHE_BLOB_URL || '/data/market-cache-cold.json';
      const hotUrl = env.VITE_CACHE_HOT_URL || '/data/market-cache-hot.json';

      const [cold, hot] = await Promise.all([fetchCacheBlob(coldUrl), fetchCacheBlob(hotUrl)]);
      if (cold || hot) {
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
              const id = Number(idStr);
              const existing = cache.get(id);
              // Keep the fresher row: only overlay when the blob is at least as new
              // as what we hold (protects just-fetched live prices from a stale blob).
              if (!existing || data.ts >= existing.ts) cache.set(id, { ts: data.ts, data: item });
            }
            memCache.set(scope, cache);
            hydrated.add(scope);
          }
        }
        // Count final unique entries (hot overrides cold), not set operations.
        const total = [homeWorld, dc, region].reduce((n, s) => n + (memCache.get(s)?.size ?? 0), 0);
        console.log(`[market] pre-seeded ${total} entries (cold=${!!cold} hot=${!!hot})`);
      }

      // Mirror the merged result back to IDB so it survives the next reload and
      // Settings can report freshness.
      for (const s of [homeWorld, dc, region]) schedulePersist(s);
    } catch {
      // Blobs not available — normal before the cron has run.
    }
  })();
  return seedPromise;
}

export interface FetchMarketOpts {
  /** Fires after each batch completes. Always fires immediately with (0, 0)
   * since all data comes from cache. Kept for API compatibility. */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Live single-fetch straight from Universalis for `ids` on `scope`, bypassing
 * the hourly bot blob. Parsed rows are merged into the in-memory cache with a
 * fresh `ts`, so the next `fetchMarketData`/useMarketData refetch reads the new
 * prices. This is the "I want THIS item's prices right now" path — meant for a
 * single item at a time, not the bulk feed (which the hourly blob handles).
 */
export async function fetchMarketLive(scope: Scope, ids: number[]): Promise<MarketData> {
  if (ids.length === 0) return {};
  const res = await fetch(buildMarketUrl(scope, ids));
  if (!res.ok) throw new Error(`Universalis ${scope} returned ${res.status}`);
  const parsed = parseMarketResponse((await res.json()) as RawResponse);
  // Merge into the existing scope cache (hydrate first so we don't clobber the
  // blob's other entries), stamping each row fresh.
  await ensureHydrated(scope);
  const cache: ScopeCache = memCache.get(scope) ?? new Map();
  const ts = Date.now();
  for (const [idStr, item] of Object.entries(parsed)) {
    cache.set(Number(idStr), { ts, data: item });
  }
  memCache.set(scope, cache);
  hydrated.add(scope);
  // Persist so these live-only rows survive a reload (the cron blob won't carry them).
  schedulePersist(scope);
  return parsed;
}

/**
 * Return market data for `ids` on `scope` from cache only.
 * Stale/missing items get empty placeholders — bulk data comes from the bot's
 * hourly cache refresh (see `fetchMarketLive` for the per-item live path).
 */
export async function fetchMarketData(scope: Scope, ids: number[], opts: FetchMarketOpts = {}): Promise<MarketData> {
  if (ids.length === 0) return {};
  await awaitSeed();
  await ensureHydrated(scope);
  const cache = memCache.get(scope) ?? new Map();
  memCache.set(scope, cache);

  const result: MarketData = {};
  for (const id of ids) {
    const entry = cache.get(id);
    result[String(id)] = entry ? entry.data : emptyMarketItem();
  }
  opts.onProgress?.(0, 0);
  return result;
}

function emptyMarketItem(): MarketItem {
  return {
    minNQ: null, minHQ: null,
    avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [],
    averagePriceNQ: null, averagePriceHQ: null,
    lastSaleMs: null,
  };
}

/** Test/dev helper: drop in-memory cache (does not clear IDB). */
export function _resetMarketCacheForTests(): void {
  memCache.clear();
  hydrated.clear();
  dirtyScopes.clear();
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
}
