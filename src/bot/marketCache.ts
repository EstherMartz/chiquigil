import { AwsClient } from 'aws4fetch';
import type { MarketData } from '../lib/universalis';

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

const DEFAULT_MAX_AGE = 2592000; // 30 days (matches the prior Vercel Blob default)

// Read R2 config lazily (at call time, not module load) so env is always available
// in the lambda/CI runtime and so tests can set process.env before calling.
function r2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicUrl = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
  return { accountId, bucket, accessKeyId, secretAccessKey, publicUrl };
}

/** Write any JSON value to R2 under `name` (public-read); returns its public url. */
export async function writeBlobJson(name: string, data: unknown, cacheControlMaxAge: number = DEFAULT_MAX_AGE): Promise<string> {
  const { accountId, bucket, accessKeyId, secretAccessKey, publicUrl } = r2();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials missing (need R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }
  const client = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' });
  const res = await client.fetch(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${name}`, {
    method: 'PUT',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${cacheControlMaxAge}`,
    },
  });
  if (!res.ok) {
    throw new Error(`R2 put ${name} failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  return `${publicUrl}/${name}`;
}

/** Read + parse a named JSON blob from R2's public url, or null if missing/unparseable. */
export async function readBlobJson<T>(name: string): Promise<T | null> {
  const { publicUrl } = r2();
  if (!publicUrl) return null;
  try {
    const res = await fetch(`${publicUrl}/${name}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Write a market bundle to `name` (default keeps the legacy single-blob path). */
export async function writeMarketCache(cache: SharedCache, name = 'market-cache.json', cacheControlMaxAge?: number): Promise<string> {
  return writeBlobJson(name, cache, cacheControlMaxAge);
}
