import { getCachedMarketScope } from './recipeCache';
import { trimmedMedian } from './priceTrust';

export type Scope = string; // world or DC name, e.g. 'Phantom' | 'Chaos'

export interface WorldListing { world: string; price: number; hq: boolean }

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
/** Listing rows actually kept in the cache (cheapest-first, for the cross-world view). */
const LISTINGS_KEPT = 10;

interface RawListing { hq: boolean; pricePerUnit: number; worldName?: string }
interface RawHistory { hq: boolean; pricePerUnit: number }
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

export function buildMarketUrl(scope: Scope, ids: number[]): string {
  return `https://universalis.app/api/v2/${scope}/${ids.join(',')}?listings=10&entries=15`;
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
      })),
      averagePriceNQ: item.averagePriceNQ ?? null,
      averagePriceHQ: item.averagePriceHQ ?? null,
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

// ---------- Bot shared cache pre-seeding ----------

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

let sharedCacheLoaded = false;

/**
 * Pre-seed the in-memory cache from the bot's hourly market-cache.json.
 * Call once at app startup. If the file is missing or stale (>90 min),
 * it's a no-op and the app falls through to live Universalis fetches.
 */
export async function loadSharedMarketCache(homeWorld: string, dc: string, region: string): Promise<void> {
  if (sharedCacheLoaded) return;
  sharedCacheLoaded = true;
  try {
    const cacheUrl = (import.meta as any).env?.VITE_CACHE_BLOB_URL || '/data/market-cache.json';
    // no-store: always fetch the latest blob, never serve browser-cached stale version
    const res = await fetch(cacheUrl, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as SharedCache;
    const age = Date.now() - data.ts;

    const scopes: [string, MarketData][] = [
      [homeWorld, data.phantom],
      [dc, data.dc],
      [region, data.region],
    ];
    let total = 0;
    for (const [scope, marketData] of scopes) {
      const cache: ScopeCache = memCache.get(scope) ?? new Map();
      for (const [idStr, item] of Object.entries(marketData)) {
        cache.set(Number(idStr), { ts: data.ts, data: item });
        total++;
      }
      memCache.set(scope, cache);
      hydrated.add(scope);
    }
    console.log(`[market] pre-seeded ${total} entries from bot cache (${Math.round(age / 60_000)}min old)`);
  } catch {
    // File not available — normal when bot hasn't run yet
  }
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
  return parsed;
}

/**
 * Return market data for `ids` on `scope` from cache only.
 * Stale/missing items get empty placeholders — bulk data comes from the bot's
 * hourly cache refresh (see `fetchMarketLive` for the per-item live path).
 */
export async function fetchMarketData(scope: Scope, ids: number[], opts: FetchMarketOpts = {}): Promise<MarketData> {
  if (ids.length === 0) return {};
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
  };
}

/** Test/dev helper: drop in-memory cache (does not clear IDB). */
export function _resetMarketCacheForTests(): void {
  memCache.clear();
  hydrated.clear();
}
