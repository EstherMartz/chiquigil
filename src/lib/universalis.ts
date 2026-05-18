import { getCachedMarketScope, putCachedMarketScope, type MarketScopeBlob } from './recipeCache';
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

interface RawListing { hq: boolean; pricePerUnit: number; worldName?: string }
interface RawHistory { hq: boolean; pricePerUnit: number }
interface RawItem {
  listings?: RawListing[];
  recentHistory?: RawHistory[];
  regularSaleVelocity?: number;
  lastUploadTime?: number;
  averagePriceNQ?: number;
  averagePriceHQ?: number;
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
      listingCount: listings.length,
      worldListings: listings.map((l) => ({
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

// ---------- Cache (in-memory mirror of per-scope IDB blob, 30-min TTL) ----------

const MARKET_TTL_MS = 30 * 60 * 1000;
type ScopeCache = Map<number, { ts: number; data: MarketItem }>;
const memCache = new Map<string, ScopeCache>();
const hydrated = new Set<string>();
const pendingPersist = new Map<string, ReturnType<typeof setTimeout>>();

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

function schedulePersist(scope: string): void {
  const existing = pendingPersist.get(scope);
  if (existing) clearTimeout(existing);
  pendingPersist.set(scope, setTimeout(async () => {
    pendingPersist.delete(scope);
    const cache = memCache.get(scope);
    if (!cache) return;
    const blob: MarketScopeBlob<MarketItem> = [...cache.entries()].map(
      ([id, entry]) => [id, entry],
    );
    try { await putCachedMarketScope(scope, blob); } catch { /* swallow */ }
  }, 1500));
}

/**
 * Fetch market data for `ids` on `scope`. Returns cached entries when
 * fresh (within 30 minutes) and fetches the rest from Universalis. The
 * cache mirrors to IDB asynchronously (debounced 1.5s).
 */
export async function fetchMarketData(scope: Scope, ids: number[]): Promise<MarketData> {
  if (ids.length === 0) return {};
  await ensureHydrated(scope);
  const now = Date.now();
  const cache = memCache.get(scope) ?? new Map();
  memCache.set(scope, cache);

  const fresh: MarketData = {};
  const stale: number[] = [];
  for (const id of ids) {
    const entry = cache.get(id);
    if (entry && now - entry.ts < MARKET_TTL_MS) {
      fresh[String(id)] = entry.data;
    } else {
      stale.push(id);
    }
  }
  if (stale.length === 0) return fresh;

  const res = await fetch(buildMarketUrl(scope, stale));
  // Universalis returns 404 when *every* requested ID is unresolvable
  // (untradeable, never-listed, or invalid). Treat as "no data" so one bad
  // ID doesn't break the entire watchlist; cache empty placeholders so we
  // don't hammer the API on every refetch within TTL.
  if (res.status === 404) {
    const live: MarketData = {};
    for (const id of stale) {
      const empty = emptyMarketItem();
      live[String(id)] = empty;
      cache.set(id, { ts: now, data: empty });
    }
    schedulePersist(scope);
    return { ...fresh, ...live };
  }
  if (!res.ok) throw new Error(`Universalis ${res.status}`);
  const raw = (await res.json()) as RawResponse;
  const live = parseMarketResponse(raw);

  for (const [idStr, data] of Object.entries(live)) {
    cache.set(Number(idStr), { ts: now, data });
  }
  // Cache empty placeholders for IDs the server couldn't resolve (mixed batch
  // with some unknown items) — same TTL benefit as the all-404 case above.
  const resolved = new Set(Object.keys(live));
  for (const id of stale) {
    if (resolved.has(String(id))) continue;
    const empty = emptyMarketItem();
    live[String(id)] = empty;
    cache.set(id, { ts: now, data: empty });
  }
  schedulePersist(scope);

  return { ...fresh, ...live };
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

/** Test/dev helper: drop in-memory + scheduled persistence (does not clear IDB). */
export function _resetMarketCacheForTests(): void {
  memCache.clear();
  hydrated.clear();
  for (const t of pendingPersist.values()) clearTimeout(t);
  pendingPersist.clear();
}
