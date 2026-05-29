import { loadSnapshots } from '../bot/loadSnapshots';
import { cheapestWorld } from '../lib/cheapestWorld';

// ── Resolved category group IDs ────────────────────────────────────────────
const HOUSING_CATS = [56, 65, 66, 67, 68, 69, 70, 71, 72, 81, 82];
const MATERIAL_CATS = [7, 47, 48, 49, 50, 51, 52, 53, 54, 57, 58, 59, 61, 79, 80];

// ── Preset definitions (mirrors src/features/queries/presets.ts) ──────────
interface QueryFilter {
  searchCategories: number[];
  hq: 'hq' | 'nq' | 'either';
  minDealPct: number;
  minVelocity: number;
  minPrice: number | null;
  maxPrice: number | null;
  sort: 'discount' | 'gilFlow' | 'velocity' | 'unitPrice';
  limit: number;
  scope: 'home' | 'dc';
  maxListings: number | null;
  mode: 'standard' | 'craft' | 'repost';
  minGap: number | null;
  /** Restrict to items that are actually gatherable (intersect gatheringCatalog). */
  gatherableOnly?: boolean;
  /** Restrict to items that have a recipe (crafted intermediates). */
  craftableOnly?: boolean;
}

interface Preset {
  id: string;
  label: string;
  category: 'trading' | 'craft' | 'gathering' | 'crafting';
  filter: QueryFilter;
}

const PRESETS: Preset[] = [
  { id: 'mega-value-hq',       label: 'Mega Value HQ',          category: 'trading',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 30, minVelocity: 0, minPrice: 1_000_000, maxPrice: null, sort: 'unitPrice', limit: 100, scope: 'dc',   maxListings: null, mode: 'standard', minGap: null } },
  { id: 'fast-sellers-hq',     label: 'Fast Sellers HQ',        category: 'trading',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 15, minVelocity: 3, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc',   maxListings: null, mode: 'standard', minGap: null } },
  { id: 'food-potions',        label: 'Food & Potions',          category: 'trading',
    filter: { searchCategories: [43, 45], hq: 'either', minDealPct: 20, minVelocity: 0, minPrice: null, maxPrice: null, sort: 'discount', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'furnishings',         label: 'Furnishings discount',    category: 'trading',
    filter: { searchCategories: HOUSING_CATS, hq: 'nq', minDealPct: 30, minVelocity: 0, minPrice: null, maxPrice: null, sort: 'discount', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'out-of-stock',        label: 'Out of Stock',            category: 'trading',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0.14, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'home', maxListings: 0, mode: 'standard', minGap: null } },
  { id: 'out-of-stock-nq',     label: 'Out of Stock NQ',         category: 'trading',
    filter: { searchCategories: [], hq: 'nq', minDealPct: 0, minVelocity: 0.14, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'home', maxListings: 0, mode: 'standard', minGap: null } },
  { id: 'high-value-materials',label: 'High-value materials',    category: 'trading',
    filter: { searchCategories: MATERIAL_CATS, hq: 'either', minDealPct: 0, minVelocity: 0, minPrice: 100_000, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'minions-quick-sell',  label: 'Minions quick sell',      category: 'trading',
    filter: { searchCategories: [75], hq: 'either', minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: 50_000, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'treasure-maps',       label: 'Treasure Maps',           category: 'trading',
    filter: { searchCategories: [64], hq: 'either', minDealPct: 0, minVelocity: 0.5, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'glamour-gear',        label: 'Glamour Gear',            category: 'trading',
    filter: { searchCategories: [31,32,33,34,35,36,37,38,39,40,41,42], hq: 'either', minDealPct: 0, minVelocity: 0.5, minPrice: 20_000, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'top-food',            label: 'Top Food',                category: 'trading',
    filter: { searchCategories: [45], hq: 'hq', minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'top-fish',            label: 'Top Fish',                category: 'trading',
    filter: { searchCategories: [46], hq: 'either', minDealPct: 0, minVelocity: 0.5, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'top-tinctures',       label: 'Top Tinctures',           category: 'trading',
    filter: { searchCategories: [43], hq: 'hq', minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'top-dyes',            label: 'Top Dyes',                category: 'trading',
    filter: { searchCategories: [54], hq: 'nq', minDealPct: 0, minVelocity: 0.5, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'top-materia',         label: 'Top Materia',             category: 'trading',
    filter: { searchCategories: [57], hq: 'either', minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  { id: 'top-minions',         label: 'Top Minions',             category: 'trading',
    filter: { searchCategories: [75], hq: 'either', minDealPct: 0, minVelocity: 0.5, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null } },
  // ── Gathering (gatherableOnly intersects the gathering catalog) ──────────
  { id: 'gather-commodities',  label: 'Gatherer commodities',    category: 'gathering',
    filter: { searchCategories: [44,46,47,48,49,50,53,58,81], hq: 'nq', minDealPct: 0, minVelocity: 5, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null, gatherableOnly: true } },
  { id: 'mining-commodities',  label: 'Mining commodities',      category: 'gathering',
    filter: { searchCategories: [47,48,58], hq: 'nq', minDealPct: 0, minVelocity: 3, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'home', maxListings: null, mode: 'standard', minGap: null, gatherableOnly: true } },
  { id: 'botany-commodities',  label: 'Botany commodities',      category: 'gathering',
    filter: { searchCategories: [49,50,53,81], hq: 'nq', minDealPct: 0, minVelocity: 3, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'home', maxListings: null, mode: 'standard', minGap: null, gatherableOnly: true } },
  { id: 'fishing-commodities', label: 'Fishing commodities',     category: 'gathering',
    filter: { searchCategories: [46], hq: 'nq', minDealPct: 0, minVelocity: 3, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'home', maxListings: null, mode: 'standard', minGap: null, gatherableOnly: true } },

  // ── Crafting (craftableOnly intersects recipe outputs — crafted intermediates) ──
  { id: 'intermediate-materials', label: 'Intermediate Materials', category: 'crafting',
    filter: { searchCategories: MATERIAL_CATS, hq: 'either', minDealPct: 0, minVelocity: 1, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null, craftableOnly: true } },
  { id: 'craftable-housing',   label: 'Craftable Housing',       category: 'crafting',
    filter: { searchCategories: HOUSING_CATS, hq: 'either', minDealPct: 0, minVelocity: 0.5, minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100, scope: 'dc', maxListings: null, mode: 'standard', minGap: null, craftableOnly: true } },
];

const PRESET_MAP = new Map(PRESETS.map(p => [p.id, p]));

// ── Market cache loading ───────────────────────────────────────────────────
let marketCache: { phantom: Record<string, any>; dc: Record<string, any> } | null = null;
let marketCacheTs = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

async function loadMarketCache() {
  const now = Date.now();
  if (marketCache && now - marketCacheTs < CACHE_TTL_MS) return marketCache;
  const url = process.env.VITE_CACHE_BLOB_URL;
  if (!url) return { phantom: {}, dc: {} };
  try {
    const res = await fetch(url);
    if (!res.ok) return marketCache ?? { phantom: {}, dc: {} };
    marketCache = await res.json();
    marketCacheTs = now;
    return marketCache!;
  } catch {
    return marketCache ?? { phantom: {}, dc: {} };
  }
}

// ── runQuery (ported from src/features/queries/runQuery.ts) ───────────────
interface MarketItem {
  minNQ: number | null;
  minHQ: number | null;
  averagePriceNQ: number | null;
  averagePriceHQ: number | null;
  velocity: number;
  listingCount: number;
}

interface QueryRow {
  id: number;
  name: string;
  sc: number;
  unitPrice: number;
  averagePrice: number;
  dealPct: number;
  velocity: number;
  gilFlow: number;
  hq: boolean;
  cheapestWorld: string | null;
  cheapestPrice: number | null;
}

function pickTier(m: MarketItem, hq: QueryFilter['hq']) {
  function tierFor(unit: number | null, avg: number | null, isHq: boolean) {
    if (avg == null || avg <= 0) return null;
    return { unit: unit ?? avg, avg, isHq };
  }
  if (hq === 'hq') return tierFor(m.minHQ, m.averagePriceHQ, true);
  if (hq === 'nq') return tierFor(m.minNQ, m.averagePriceNQ, false);
  const candidates = [tierFor(m.minHQ, m.averagePriceHQ, true), tierFor(m.minNQ, m.averagePriceNQ, false)]
    .filter((c): c is { unit: number; avg: number; isHq: boolean } => c !== null);
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (a.unit <= b.unit ? a : b));
}

function runStandardQuery(
  snapshot: { id: number; name: string; sc: number; canHq: boolean }[],
  priceMap: Record<string, MarketItem>,
  filter: QueryFilter,
  gatherSet: Set<number> | null,
  recipeSet: Set<number> | null,
): QueryRow[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: QueryRow[] = [];

  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    // Source gates: only actually-gatherable / only craftable (crafted intermediates).
    if (filter.gatherableOnly && (!gatherSet || !gatherSet.has(item.id))) continue;
    if (filter.craftableOnly && (!recipeSet || !recipeSet.has(item.id))) continue;
    if (filter.hq === 'hq' && !item.canHq) continue;
    const m = priceMap[String(item.id)];
    if (!m) continue;
    const tier = pickTier(m, filter.hq);
    if (!tier) continue;

    const dealPct = Math.round(((tier.avg - tier.unit) / tier.avg) * 100);
    const gilFlow = tier.unit * m.velocity;

    if (dealPct < filter.minDealPct) continue;
    if (m.velocity < filter.minVelocity) continue;
    if (filter.minPrice != null && tier.unit < filter.minPrice) continue;
    if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;
    if (filter.maxListings != null && m.listingCount > filter.maxListings) continue;

    const best = cheapestWorld(m, tier.isHq);
    out.push({ id: item.id, name: item.name, sc: item.sc,
      unitPrice: tier.unit, averagePrice: tier.avg, dealPct,
      velocity: m.velocity, gilFlow, hq: tier.isHq,
      cheapestWorld: best?.world ?? null, cheapestPrice: best?.price ?? null });
  }

  out.sort((a, b) => {
    switch (filter.sort) {
      case 'discount':  return b.dealPct - a.dealPct;
      case 'gilFlow':   return b.gilFlow - a.gilFlow;
      case 'velocity':  return b.velocity - a.velocity;
      case 'unitPrice': return b.unitPrice - a.unitPrice;
    }
  });
  return out.slice(0, filter.limit);
}

// ── Handler ───────────────────────────────────────────────────────────────
async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { preset: presetId, world } = req.query;

  let filter: QueryFilter | null = null;

  if (presetId) {
    const p = PRESET_MAP.get(String(presetId));
    if (!p) return res.status(400).json({ error: `Unknown preset: ${presetId}` });
    filter = { ...p.filter };
  } else {
    // Custom filter from query params
    const hqRaw = req.query.hq ?? 'either';
    filter = {
      searchCategories: req.query.sc ? String(req.query.sc).split(',').map(Number).filter(Boolean) : [],
      hq: ['hq', 'nq', 'either'].includes(hqRaw) ? hqRaw as any : 'either',
      minDealPct: parseFloat(req.query.d) || 0,
      minVelocity: parseFloat(req.query.v) || 0,
      minPrice: req.query.pmin ? parseInt(req.query.pmin) : null,
      maxPrice: req.query.pmax ? parseInt(req.query.pmax) : null,
      sort: (['discount','gilFlow','velocity','unitPrice'].includes(req.query.s) ? req.query.s : 'gilFlow') as any,
      limit: Math.min(200, Math.max(1, parseInt(req.query.l) || 100)),
      scope: req.query.scope === 'home' ? 'home' : 'dc',
      maxListings: req.query.ml != null ? parseInt(req.query.ml) : null,
      mode: 'standard',
      minGap: null,
    };
  }

  // Only standard mode for now
  if (filter.mode !== 'standard') {
    return res.status(400).json({ error: 'Only standard mode is supported by the plugin API currently.' });
  }

  const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
  const [snapshots, market] = await Promise.all([
    loadSnapshots(baseUrl),
    loadMarketCache(),
  ]);

  const snapshot = [...snapshots.itemsById.values()];

  // Source sets (built once per request) for the gatherableOnly / craftableOnly gates.
  const gatherSet = filter.gatherableOnly ? new Set(snapshots.gatheringCatalog.keys()) : null;
  const recipeSet = filter.craftableOnly ? new Set(snapshots.recipes.keys()) : null;

  // For scope=home, require world param
  let priceMap: Record<string, MarketItem>;
  if (filter.scope === 'home') {
    if (!world) return res.status(400).json({ error: 'world param required for scope=home queries' });
    // The blob key for home-world data is the world name (lowercase)
    const worldKey = String(world).toLowerCase();
    priceMap = (market as any)[worldKey] ?? market.phantom ?? {};
  } else {
    priceMap = market.dc ?? {};
  }

  const rows = runStandardQuery(snapshot, priceMap, filter, gatherSet, recipeSet);

  return res.status(200).json({
    rows,
    total: rows.length,
    preset: presetId ?? null,
    scope: filter.scope === 'home' ? (world ?? 'home') : 'dc',
    mode: filter.mode,
  });
}

export { handler as default };
