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
import { ITEM_SEARCH_CATEGORIES } from '../../../src/lib/itemSearchCategories';

// Category keywords the LLM can use → search category IDs
const CATEGORY_MAP: Record<string, number[]> = {
  meals: [45, 46],
  food: [45, 46],
  medicine: [43],
  potions: [43],
  materials: [47, 48, 49, 50, 51, 52, 53],
  cloth: [50],
  leather: [51],
  metal: [48],
  lumber: [49],
  stone: [47],
  dyes: [54],
  materia: [57],
  furnishings: [56, 65, 66, 67, 68, 69, 70, 71, 72, 81, 82],
  housing: [56, 65, 66, 67, 68, 69, 70, 71, 72, 81, 82],
  minions: [75],
  weapons: [1, 9, 10, 11, 12, 13, 14, 15, 16, 73, 76, 77, 78, 83, 84, 85, 86, 87, 88, 89, 91, 92],
  armor: [31, 32, 33, 34, 35, 36, 37, 38],
  accessories: [39, 40, 41, 42],
  gear: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
};

function resolveCategory(cat: unknown): number[] {
  if (!cat || typeof cat !== 'string') return [];
  const key = cat.toLowerCase().trim();
  return CATEGORY_MAP[key] ?? [];
}

export interface ToolContext {
  snapshots: BotSnapshots;
  nameIndex: NameIndex;
  cfg: { world: string; dc: string; region: string };
}

// --- Global market data cache (single MarketBundle, disk-backed) ---
const CACHE_TTL_MS = 60 * 60_000;
const WARMUP_INTERVAL_MS = 60 * 60_000;
const CACHE_FILE = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../../.cache/market.json');

interface GlobalCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  fetchedIds: Set<number>;
  ts: number;
}

import type { MarketData } from '../../../src/lib/universalis';

let globalCache: GlobalCache | null = null;
let refreshing = false;

interface DiskCache {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;
  fetchedIds?: number[];
  ts: number;
}

export async function saveCacheToDisk(): Promise<void> {
  if (!globalCache) return;
  await mkdir(dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify({
    phantom: globalCache.phantom,
    dc: globalCache.dc,
    region: globalCache.region,
    fetchedIds: [...globalCache.fetchedIds],
    ts: globalCache.ts,
  } satisfies DiskCache));
  const itemCount = Object.keys(globalCache.phantom).length;
  console.log(`[cache] saved to disk (${itemCount} items)`);
}

export async function loadCacheFromDisk(): Promise<{ loaded: boolean; fresh: boolean }> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf8');
    const disk = JSON.parse(raw) as DiskCache;
    const itemCount = Object.keys(disk.phantom).length;
    if (itemCount === 0) {
      console.log('[cache] disk cache empty');
      return { loaded: false, fresh: false };
    }
    const fetchedIds = disk.fetchedIds ? new Set(disk.fetchedIds) : new Set([
      ...Object.keys(disk.phantom).map(Number),
      ...Object.keys(disk.dc).map(Number),
    ]);
    globalCache = { phantom: disk.phantom, dc: disk.dc, region: disk.region, fetchedIds, ts: disk.ts };
    const age = Math.round((Date.now() - disk.ts) / 60_000);
    const fresh = Date.now() - disk.ts < CACHE_TTL_MS;
    console.log(`[cache] loaded ${itemCount} items from disk (${age}min old${fresh ? '' : ', stale — will refresh in background'})`);
    return { loaded: true, fresh };
  } catch {
    console.log('[cache] no disk cache found');
    return { loaded: false, fresh: false };
  }
}

export function pushToCache(ids: number[], data: MarketBundle): void {
  globalCache = { phantom: data.phantom, dc: data.dc, region: data.region, fetchedIds: new Set(ids), ts: Date.now() };
}

export function invalidateCache(): void {
  globalCache = null;
  console.log('[cache] invalidated');
}

function mergeMarketData(target: MarketData, source: MarketData): void {
  for (const key of Object.keys(source)) {
    target[+key] = source[+key];
  }
}

async function cachedMarketFetch(
  ids: number[],
  cfg: { world: string; dc: string; region: string },
): Promise<MarketBundle> {
  // Check if global cache has data for these IDs
  if (globalCache) {
    const missing = ids.filter((id) => !globalCache!.fetchedIds.has(id));
    const fresh = Date.now() - globalCache.ts < CACHE_TTL_MS;

    if (missing.length === 0) {
      console.log(`[chat] market cache HIT (${ids.length} ids${fresh ? '' : ', stale'})`);

      // Trigger background refresh if stale
      if (!fresh && !refreshing) {
        refreshing = true;
        console.log('[chat] triggering background refresh…');
        fetchMarketForOutputs(ids, cfg).then((data) => {
          if (globalCache) {
            mergeMarketData(globalCache.phantom, data.phantom);
            mergeMarketData(globalCache.dc, data.dc);
            mergeMarketData(globalCache.region, data.region);
            for (const id of ids) globalCache.fetchedIds.add(id);
            globalCache.ts = Date.now();
          } else {
            globalCache = { phantom: data.phantom, dc: data.dc, region: data.region, fetchedIds: new Set(ids), ts: Date.now() };
          }
          refreshing = false;
          saveCacheToDisk().catch(() => {});
          console.log('[chat] background refresh done');
        }).catch((e) => { refreshing = false; console.error('[chat] background refresh failed:', e); });
      }

      return { phantom: globalCache.phantom, dc: globalCache.dc, region: globalCache.region };
    }

    // Partial hit — fetch only missing IDs
    console.log(`[chat] market cache PARTIAL (${ids.length - missing.length} hit, ${missing.length} missing)`);
    const fresh_data = await fetchMarketForOutputs(missing, cfg);
    mergeMarketData(globalCache.phantom, fresh_data.phantom);
    mergeMarketData(globalCache.dc, fresh_data.dc);
    mergeMarketData(globalCache.region, fresh_data.region);
    globalCache.ts = Date.now();
    return { phantom: globalCache.phantom, dc: globalCache.dc, region: globalCache.region };
  }

  // No cache at all — must wait
  console.log(`[chat] market cache MISS — fetching ${ids.length} ids…`);
  const data = await fetchMarketForOutputs(ids, cfg);
  globalCache = { phantom: data.phantom, dc: data.dc, region: data.region, fetchedIds: new Set(ids), ts: Date.now() };
  return data;
}

export function startCacheWarmup(ctx: ToolContext): void {
  const warmup = async () => {
    console.log('[cache] warming up market data…');
    const start = Date.now();
    try {
      const { loaded, fresh } = await loadCacheFromDisk();

      const snapshot = [...ctx.snapshots.itemsById.values()];
      const craftableIds = snapshot.filter((i) => ctx.snapshots.recipes.has(i.id)).map((i) => i.id);
      const vendorIds = [...ctx.snapshots.vendorMap.keys()];
      const allIds = [...new Set([...craftableIds, ...vendorIds])];

      if (loaded && fresh) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[cache] warmup done in ${elapsed}s (fresh disk cache)`);
        return;
      }

      if (loaded && !fresh) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[cache] warmup done in ${elapsed}s (stale disk cache, refreshing in background…)`);
        fetchMarketForOutputs(allIds, ctx.cfg).then(async (data) => {
          globalCache = { phantom: data.phantom, dc: data.dc, region: data.region, fetchedIds: new Set(allIds), ts: Date.now() };
          await saveCacheToDisk();
          console.log(`[cache] background refresh complete (${allIds.length} items)`);
        }).catch((e) => console.error('[cache] background refresh failed:', e));
        return;
      }

      // No disk cache — fetch synchronously
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
          category: { type: 'string', enum: ['meals', 'food', 'medicine', 'potions', 'materials', 'cloth', 'leather', 'metal', 'lumber', 'stone', 'dyes', 'materia', 'furnishings', 'housing', 'minions', 'weapons', 'armor', 'accessories', 'gear'], description: 'Filter by item category (optional)' },
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
          category: { type: 'string', enum: ['meals', 'food', 'medicine', 'potions', 'materials', 'cloth', 'leather', 'metal', 'lumber', 'stone', 'dyes', 'materia', 'furnishings', 'housing', 'minions', 'weapons', 'armor', 'accessories', 'gear'], description: 'Filter by item category (optional)' },
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
          category: { type: 'string', enum: ['meals', 'food', 'medicine', 'potions', 'materials', 'cloth', 'leather', 'metal', 'lumber', 'stone', 'dyes', 'materia', 'furnishings', 'housing', 'minions', 'weapons', 'armor', 'accessories', 'gear'], description: 'Filter by item category (optional)' },
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
  const searchCategories = resolveCategory(args.category);

  const snapshot = [...ctx.snapshots.itemsById.values()];
  const craftableIds = snapshot.filter((i) => ctx.snapshots.recipes.has(i.id)).map((i) => i.id);
  const market = await cachedMarketFetch(craftableIds, ctx.cfg);

  const filter: QueryFilter = {
    searchCategories, hq: 'either', minDealPct: 0, minVelocity: 0.3,
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
  const catFilter = new Set(resolveCategory(args.category));

  let snapshot = [...ctx.snapshots.itemsById.values()];
  if (catFilter.size > 0) snapshot = snapshot.filter((i) => catFilter.has(i.sc));
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
  const searchCategories = resolveCategory(args.category);

  const snapshot = [...ctx.snapshots.itemsById.values()];
  const vendorIds = [...ctx.snapshots.vendorMap.keys()];
  const market = await cachedMarketFetch(vendorIds, ctx.cfg);

  const filter = { ...defaultVendorFlipFilter(), sort, limit, searchCategories };
  const rows = runVendorFlip(snapshot, ctx.snapshots.vendorMap, market.phantom, filter);
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name, vendorPrice: r.vendorPrice, salePrice: r.salePrice,
    profitPerUnit: r.profitPerUnit, markup: Math.round(r.markup * 100) / 100,
    velocity: r.velocity, profitPerDay: Math.round(r.profitPerDay),
  }));
  return JSON.stringify(results);
}
