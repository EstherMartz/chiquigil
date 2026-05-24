import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ToolDefinition } from './openrouter';
import type { BotSnapshots } from '../loadSnapshots';
import type { NameIndex } from './nameIndex';
import { searchItems } from './nameIndex';
import { fetchMarketForOutputs } from '../fetchMarketForOutputs';
import type { MarketBundle } from '../../../src/features/watchlist/useMarketData';
import { runCraftFlip } from '../../../src/features/queries/runCraftFlip';
import { findBestDeals } from '../../../src/features/insights/bestDeals';
import { runVendorFlip } from '../../../src/features/queries/runVendorFlip';
import { defaultVendorFlipFilter } from '../../../src/features/queries/types';
import type { QueryFilter } from '../../../src/features/queries/types';
import type { TrackedItem } from '../../../src/features/items/types';

export interface ToolContext {
  snapshots: BotSnapshots;
  nameIndex: NameIndex;
  cfg: { world: string; dc: string; region: string };
}

// --- Market data cache (1-hour TTL, auto-refreshed, disk-backed) ---
const CACHE_TTL_MS = 60 * 60_000;
const WARMUP_INTERVAL_MS = 60 * 60_000;
const CACHE_FILE = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../../.cache/market.json');
const marketCache = new Map<string, { data: MarketBundle; ts: number }>();

interface DiskCache {
  entries: Array<{ key: string; data: MarketBundle; ts: number }>;
}

export async function saveCacheToDisk(): Promise<void> {
  const entries = [...marketCache.entries()].map(([key, v]) => ({ key, data: v.data, ts: v.ts }));
  await mkdir(dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify({ entries } satisfies DiskCache));
  console.log(`[cache] saved to disk (${entries.length} entries)`);
}

export async function loadCacheFromDisk(): Promise<boolean> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf8');
    const disk = JSON.parse(raw) as DiskCache;
    let loaded = 0;
    for (const entry of disk.entries) {
      if (Date.now() - entry.ts < CACHE_TTL_MS) {
        marketCache.set(entry.key, { data: entry.data, ts: entry.ts });
        loaded++;
      }
    }
    if (loaded > 0) {
      console.log(`[cache] loaded ${loaded} entries from disk`);
      return true;
    }
    console.log('[cache] disk cache expired, will fetch fresh');
    return false;
  } catch {
    console.log('[cache] no disk cache found');
    return false;
  }
}

export function pushToCache(ids: number[], data: MarketBundle): void {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  marketCache.set(key, { data, ts: Date.now() });
}

export function invalidateCache(): void {
  marketCache.clear();
  console.log('[cache] invalidated');
}

async function cachedMarketFetch(
  ids: number[],
  cfg: { world: string; dc: string; region: string },
): Promise<MarketBundle> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const key = sorted.join(',');
  const cached = marketCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[chat] market cache HIT (${sorted.length} ids)`);
    return cached.data;
  }
  console.log(`[chat] market cache MISS — fetching ${sorted.length} ids…`);
  const data = await fetchMarketForOutputs(sorted, cfg);
  marketCache.set(key, { data, ts: Date.now() });
  return data;
}

export function startCacheWarmup(ctx: ToolContext): void {
  const warmup = async () => {
    console.log('[cache] warming up market data…');
    const start = Date.now();
    try {
      // Try disk cache first
      const fromDisk = await loadCacheFromDisk();
      if (fromDisk) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[cache] warmup done in ${elapsed}s (from disk)`);
        return;
      }

      const snapshot = [...ctx.snapshots.itemsById.values()];
      const craftableIds = snapshot.filter((i) => ctx.snapshots.recipes.has(i.id)).map((i) => i.id);
      const vendorIds = [...ctx.snapshots.vendorMap.keys()];
      const allIds = [...new Set([...craftableIds, ...vendorIds])];
      await cachedMarketFetch(allIds, ctx.cfg);
      await saveCacheToDisk();

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[cache] warmup done in ${elapsed}s (${allIds.length} items fetched)`);
    } catch (e) {
      console.error('[cache] warmup failed:', e instanceof Error ? e.message : e);
    }
  };

  // Run immediately, then every hour
  warmup();
  const timer = setInterval(warmup, WARMUP_INTERVAL_MS);
  timer.unref?.();
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'price_check',
      description: 'Look up current market prices for an FFXIV item by name. Returns prices on Phantom (home world) and Chaos DC, plus velocity (sales/day).',
      parameters: {
        type: 'object',
        properties: {
          item_name: { type: 'string', description: 'Item name or partial match' },
        },
        required: ['item_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'craft_flip_search',
      description: 'Find the most profitable items to craft and sell on the market board. Returns items sorted by gil profit per day.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of results (default 5)' },
          sort: { type: 'string', enum: ['gilPerDay', 'profit'], description: 'Sort field (default gilPerDay)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'best_deals',
      description: 'Find items currently selling below their average price (good deals/discounts). Returns items with the highest discount percentage.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of results (default 5)' },
          min_deal_pct: { type: 'number', description: 'Minimum discount % (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vendor_flip_search',
      description: 'Find items that can be bought from NPC vendors and resold on the market board for profit.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of results (default 5)' },
          sort: { type: 'string', enum: ['profitPerDay', 'markup'], description: 'Sort field (default profitPerDay)' },
        },
      },
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case 'price_check': return await priceCheck(args, ctx);
      case 'craft_flip_search': return await craftFlipSearch(args, ctx);
      case 'best_deals': return await bestDealsSearch(args, ctx);
      case 'vendor_flip_search': return await vendorFlipSearch(args, ctx);
      default: return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function priceCheck(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const itemName = String(args.item_name ?? '');
  const matches = searchItems(ctx.nameIndex, itemName, 3);
  if (matches.length === 0) return JSON.stringify({ error: 'No items found matching that name' });

  const ids = matches.map((m) => m.id);
  const market = await cachedMarketFetch(ids, ctx.cfg);

  const results = matches.map((m) => {
    const ph = market.phantom[m.id];
    const dc = market.dc[m.id];
    return {
      name: m.name,
      id: m.id,
      phantomMinNQ: ph?.minNQ ?? null,
      phantomMinHQ: ph?.minHQ ?? null,
      dcMinNQ: dc?.minNQ ?? null,
      dcMinHQ: dc?.minHQ ?? null,
      velocity: ph?.velocity ?? dc?.velocity ?? 0,
      listings: ph?.listingCount ?? 0,
    };
  });
  return JSON.stringify(results);
}

async function craftFlipSearch(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const sortArg = String(args.sort ?? 'gilPerDay');
  const sort = sortArg === 'profit' ? 'unitPrice' as const : 'gilFlow' as const;

  const snapshot = [...ctx.snapshots.itemsById.values()];
  const craftableIds = snapshot.filter((i) => ctx.snapshots.recipes.has(i.id)).map((i) => i.id);
  const market = await cachedMarketFetch(craftableIds, ctx.cfg);

  const filter: QueryFilter = {
    searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0.3,
    minPrice: null, maxPrice: null, sort, limit, scope: 'home',
    maxListings: null, mode: 'craft', minGap: null, trainedEye: false,
  };

  const rows = runCraftFlip(snapshot, market.phantom, ctx.snapshots.recipes, filter);
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name, materialCost: r.materialCost, salePrice: r.unitPrice,
    profit: r.profit, velocity: r.velocity, gilPerDay: Math.round(r.gilPerDay), hq: r.hq,
  }));
  return JSON.stringify(results);
}

async function bestDealsSearch(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const minDealPct = Number(args.min_deal_pct) || 20;

  const snapshot = [...ctx.snapshots.itemsById.values()];
  const ids = snapshot.map((i) => i.id);
  const market = await cachedMarketFetch(ids, ctx.cfg);

  const tracked: TrackedItem[] = snapshot.map((i) => ({
    id: i.id, name: i.name, crafter: '' as TrackedItem['crafter'], lvl: 0, cat: 'other' as TrackedItem['cat'],
  }));

  const rows = findBestDeals(tracked, market.dc, { minDealPct });
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name, currentPrice: r.currentMin, averagePrice: r.averagePrice, dealPct: r.dealPct,
  }));
  return JSON.stringify(results);
}

async function vendorFlipSearch(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const sortArg = String(args.sort ?? 'profitPerDay');
  const sort = (sortArg === 'markup' ? 'markup' : 'profitPerDay') as 'markup' | 'profitPerDay';

  const snapshot = [...ctx.snapshots.itemsById.values()];
  const vendorIds = [...ctx.snapshots.vendorMap.keys()];
  const market = await cachedMarketFetch(vendorIds, ctx.cfg);

  const filter = { ...defaultVendorFlipFilter(), sort, limit };
  const rows = runVendorFlip(snapshot, ctx.snapshots.vendorMap, market.phantom, filter);
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name, vendorPrice: r.vendorPrice, salePrice: r.salePrice,
    profitPerUnit: r.profitPerUnit, markup: Math.round(r.markup * 100) / 100,
    velocity: r.velocity, profitPerDay: Math.round(r.profitPerDay),
  }));
  return JSON.stringify(results);
}
