import type { ToolDefinition } from './llm.js';
import type { BotSnapshots } from './loadSnapshots.js';
import type { NameIndex } from './nameIndex.js';
import { searchItems } from './nameIndex.js';
import type { MarketBundle } from './marketFetch.js';
import { runCraftFlip } from '../features/queries/runCraftFlip.js';
import { findBestDeals } from '../features/insights/bestDeals.js';
import { runVendorFlip } from '../features/queries/runVendorFlip.js';
import { defaultVendorFlipFilter } from '../features/queries/types.js';
import type { QueryFilter } from '../features/queries/types.js';
import type { TrackedItem } from '../features/items/types.js';

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

export interface ToolDeps {
  marketBundle: MarketBundle;
  snapshots: BotSnapshots;
  nameIndex: NameIndex;
}

export function sanitizeArgs(rawArgs: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawArgs)) {
    if (v === '' || v == null) continue;
    if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) {
      args[k] = Number(v);
      continue;
    }
    args[k] = v;
  }
  return args;
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
          sort: { type: 'string', description: 'Sort: gilPerDay or profit (default gilPerDay)' },
          category: { type: 'string', description: 'Filter by category: meals, food, medicine, potions, materials, cloth, leather, metal, lumber, stone, dyes, materia, furnishings, housing, minions, weapons, armor, accessories, gear (optional)' },
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
          category: { type: 'string', description: 'Filter by category: meals, food, medicine, potions, materials, cloth, leather, metal, lumber, stone, dyes, materia, furnishings, housing, minions, weapons, armor, accessories, gear (optional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vendor_flip_search',
      description: 'Find items that can be bought from NPC vendors and resold on the market board for profit. Does NOT require crafting — anyone can do this.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of results (default 5)' },
          sort: { type: 'string', description: 'Sort: profitPerDay or markup (default profitPerDay)' },
          category: { type: 'string', description: 'Filter by category: meals, food, medicine, potions, materials, cloth, leather, metal, lumber, stone, dyes, materia, furnishings, housing, minions, weapons, armor, accessories, gear (optional)' },
        },
      },
    },
  },
];

export async function executeTool(
  name: string,
  rawArgs: Record<string, unknown>,
  deps: ToolDeps,
): Promise<string> {
  const args = sanitizeArgs(rawArgs);
  try {
    switch (name) {
      case 'price_check':
        return await priceCheck(args, deps);
      case 'craft_flip_search':
        return await craftFlipSearch(args, deps);
      case 'best_deals':
        return await bestDealsSearch(args, deps);
      case 'vendor_flip_search':
        return await vendorFlipSearch(args, deps);
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function priceCheck(args: Record<string, unknown>, deps: ToolDeps): Promise<string> {
  const itemName = String(args.item_name ?? '');
  const matches = searchItems(deps.nameIndex, itemName, 3);
  if (matches.length === 0) return JSON.stringify({ error: 'No items found matching that name' });

  const results = matches.map((m) => {
    const ph = deps.marketBundle.phantom[m.id];
    const dc = deps.marketBundle.dc[m.id];
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

async function craftFlipSearch(args: Record<string, unknown>, deps: ToolDeps): Promise<string> {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const sortArg = String(args.sort ?? 'gilPerDay');
  const sort = sortArg === 'profit' ? ('unitPrice' as const) : ('gilFlow' as const);
  const searchCategories = resolveCategory(args.category);

  const snapshot = [...deps.snapshots.itemsById.values()];

  const filter: QueryFilter = {
    searchCategories,
    hq: 'either',
    minDealPct: 0,
    minVelocity: 0.3,
    minPrice: null,
    maxPrice: null,
    sort,
    limit,
    scope: 'home',
    maxListings: null,
    mode: 'craft',
    minGap: null,
    trainedEye: false,
  };

  const rows = runCraftFlip(snapshot, deps.marketBundle.phantom, deps.snapshots.recipes, filter);
  if (rows.length === 0) {
    const cat = args.category ? ` in category "${args.category}"` : '';
    return JSON.stringify({ message: `No profitable crafts found${cat}. Try removing the category filter.`, results: [] });
  }
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name,
    materialCost: r.materialCost,
    salePrice: r.unitPrice,
    profit: r.profit,
    velocity: r.velocity,
    gilPerDay: Math.round(r.gilPerDay),
    hq: r.hq,
  }));
  return JSON.stringify(results);
}

async function bestDealsSearch(args: Record<string, unknown>, deps: ToolDeps): Promise<string> {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const minDealPct = Number(args.min_deal_pct) || 20;
  const catFilter = new Set(resolveCategory(args.category));

  let snapshot = [...deps.snapshots.itemsById.values()];
  if (catFilter.size > 0) snapshot = snapshot.filter((i) => catFilter.has(i.sc));

  const tracked: TrackedItem[] = snapshot.map((i) => ({
    id: i.id,
    name: i.name,
    crafter: '' as TrackedItem['crafter'],
    lvl: 0,
    cat: 'other' as TrackedItem['cat'],
  }));

  const rows = findBestDeals(tracked, deps.marketBundle.dc, { minDealPct });
  if (rows.length === 0) {
    const cat = args.category ? ` in category "${args.category}"` : '';
    return JSON.stringify({
      message: `No deals found${cat} with at least ${minDealPct}% discount. Try lowering min_deal_pct or removing the category filter.`,
      results: [],
    });
  }
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name,
    currentPrice: r.currentMin,
    averagePrice: r.averagePrice,
    dealPct: r.dealPct,
  }));
  return JSON.stringify(results);
}

async function vendorFlipSearch(args: Record<string, unknown>, deps: ToolDeps): Promise<string> {
  const limit = Math.min(Number(args.limit) || 5, 15);
  const sortArg = String(args.sort ?? 'profitPerDay');
  const sort = (sortArg === 'markup' ? 'markup' : 'profitPerDay') as 'markup' | 'profitPerDay';
  const searchCategories = resolveCategory(args.category);

  const snapshot = [...deps.snapshots.itemsById.values()];

  const filter = { ...defaultVendorFlipFilter(), sort, limit, searchCategories };
  const rows = runVendorFlip(snapshot, deps.snapshots.vendorMap, deps.marketBundle.phantom, filter);
  if (rows.length === 0) {
    const cat = args.category ? ` in category "${args.category}"` : '';
    return JSON.stringify({ message: `No vendor flips found${cat}. Try removing the category filter.`, results: [] });
  }
  const results = rows.slice(0, limit).map((r) => ({
    name: r.name,
    vendorPrice: r.vendorPrice,
    salePrice: r.salePrice,
    profitPerUnit: r.profitPerUnit,
    markup: Math.round(r.markup * 100) / 100,
    velocity: r.velocity,
    profitPerDay: Math.round(r.profitPerDay),
  }));
  return JSON.stringify(results);
}
