// Shared cold+hot market-cache loader — the ONE place that knows the cache's
// blob layout (which tiers exist, their URLs, how they merge). Both the web
// client (src/lib/universalis.ts) and every server endpoint (src/api/*) consume
// this so a backend cache change is a one-file edit, not a seven-file hunt.
//
// Pure & isomorphic: no `import.meta.env`, no direct `process.env`, no IDB, no
// DOM. The caller passes an env dict, so the same code runs in the browser and
// in a Vercel function. Keep it that way.
import type { MarketData } from './universalis';

/** A single market-cache blob: the three scopes plus the bake timestamp. */
export interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

/**
 * Env vars that influence cache-URL resolution. All optional — every field can
 * be absent. Browsers only ever see the `VITE_`-prefixed ones (Vite strips the
 * rest); servers additionally see `R2_PUBLIC_URL` / `MARKET_CACHE_BLOB_URL`.
 */
export interface CacheEnv {
  /** Explicit cold-blob URL (highest precedence). */
  VITE_CACHE_COLD_URL?: string;
  /** Explicit hot-blob URL. */
  VITE_CACHE_HOT_URL?: string;
  /** Legacy single-blob URL (pre cold/hot split). Cold fallback only. */
  VITE_CACHE_BLOB_URL?: string;
  /** Even-older legacy single-blob URL. Cold fallback only. */
  MARKET_CACHE_BLOB_URL?: string;
  /** R2 bucket public base — server-only; cold/hot URLs are derived from it. */
  R2_PUBLIC_URL?: string;
}

/** Per-runtime defaults for the cold/hot URLs (last resort before failing). */
export interface CacheUrlOpts {
  /** Used when nothing else resolves a cold URL. Web omits → relative path. */
  defaultColdUrl?: string;
  /** Used when nothing else resolves a hot URL. Web omits → relative path. */
  defaultHotUrl?: string;
}

// The canonical blob names the refresh jobs write (see src/bot/refreshMarket.ts).
const COLD_BLOB = 'market-cache-cold.json';
const HOT_BLOB = 'market-cache-hot.json';

/**
 * Resolve the cold + hot blob URLs from env. This is the logic that drifted and
 * caused the plugin endpoints to read a dead blob — it now lives in exactly one
 * place.
 *
 * Cold precedence: explicit cold URL → R2-derived → legacy single blob(s) →
 * caller default → relative static path. The R2-derived URL sits ABOVE the
 * legacy single-blob vars on purpose: a stale `VITE_CACHE_BLOB_URL` left over
 * from the pre-split era must not shadow the live R2 cold blob.
 *
 * Browsers never set `R2_PUBLIC_URL` (it isn't `VITE_`-prefixed), so for the web
 * this collapses to `VITE_CACHE_COLD_URL || VITE_CACHE_BLOB_URL || default` —
 * identical to the prior behavior. Servers get the R2-derived URLs for free.
 */
export function resolveCacheUrls(
  env: CacheEnv,
  opts: CacheUrlOpts = {},
): { coldUrl: string; hotUrl: string } {
  const r2 = (env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
  const coldUrl =
    env.VITE_CACHE_COLD_URL ||
    (r2 ? `${r2}/${COLD_BLOB}` : '') ||
    env.VITE_CACHE_BLOB_URL ||
    env.MARKET_CACHE_BLOB_URL ||
    opts.defaultColdUrl ||
    `/data/${COLD_BLOB}`;
  const hotUrl =
    env.VITE_CACHE_HOT_URL ||
    (r2 ? `${r2}/${HOT_BLOB}` : '') ||
    opts.defaultHotUrl ||
    `/data/${HOT_BLOB}`;
  return { coldUrl, hotUrl };
}

/**
 * Fetch + parse one cache blob, or null on any miss/parse error. `cache`
 * defaults to `'default'` so the browser honours the blob's Cache-Control
 * headers (cold ~1h, hot ~5m); the option is a no-op under Node's fetch.
 */
export async function fetchCacheBlob(
  url: string,
  cache: RequestCache = 'default',
): Promise<SharedCache | null> {
  try {
    const res = await fetch(url, { cache });
    if (!res.ok) return null;
    return (await res.json()) as SharedCache;
  } catch {
    return null;
  }
}

/** Overlay hot rows on cold rows for one scope (hot wins on id collision). */
function overlayScope(cold: MarketData | undefined, hot: MarketData | undefined): MarketData {
  return { ...(cold ?? {}), ...(hot ?? {}) };
}

/**
 * Server-side loader: fetch cold + hot in parallel and merge them into one
 * bundle, hot overriding cold per item id (fresher wins). Returns null only when
 * BOTH blobs are unavailable, so callers can fall back to an empty bundle.
 *
 * The web client does NOT use this — it keeps its own per-row, timestamp-guarded
 * overlay into IndexedDB (so just-fetched live prices aren't clobbered by a
 * stale blob). Both paths share `resolveCacheUrls` + `fetchCacheBlob`, which is
 * the part that actually drifts.
 */
export async function loadMarketBundle(
  env: CacheEnv,
  opts: CacheUrlOpts = {},
): Promise<SharedCache | null> {
  const { coldUrl, hotUrl } = resolveCacheUrls(env, opts);
  const [cold, hot] = await Promise.all([
    fetchCacheBlob(coldUrl, 'no-store'),
    fetchCacheBlob(hotUrl, 'no-store'),
  ]);
  if (!cold && !hot) return null;
  return {
    phantom: overlayScope(cold?.phantom, hot?.phantom),
    dc: overlayScope(cold?.dc, hot?.dc),
    region: overlayScope(cold?.region, hot?.region),
    ts: Math.max(cold?.ts ?? 0, hot?.ts ?? 0),
  };
}
