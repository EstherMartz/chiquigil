import { put } from '@vercel/blob';
import type { MarketData } from '../lib/universalis';

interface SharedCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  ts: number;
}

export async function writeMarketCache(cache: SharedCache): Promise<string> {
  const blob = await put('market-cache.json', JSON.stringify(cache), {
    access: 'public',
    addRandomSuffix: false,
  });
  return blob.url;
}
