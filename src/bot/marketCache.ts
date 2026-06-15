import { put, head } from '@vercel/blob';
import type { MarketData } from '../lib/universalis';

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

/** Write any JSON value to a deterministically-named public blob; returns its url. */
export async function writeBlobJson(
  name: string,
  data: unknown,
  cacheControlMaxAge: number = 2592000
): Promise<string> {
  const blob = await put(name, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge,
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
export async function writeMarketCache(
  cache: SharedCache,
  name = 'market-cache.json',
  cacheControlMaxAge?: number
): Promise<string> {
  return writeBlobJson(name, cache, cacheControlMaxAge);
}
