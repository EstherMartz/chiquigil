export type HqMode = 'hq' | 'nq' | 'either';
export type QuerySort = 'discount' | 'gilFlow' | 'velocity' | 'unitPrice';
export type QueryScope = 'home' | 'dc';
export type QueryMode = 'standard' | 'craft' | 'repost';
export type PresetCategory = 'craft' | 'trading' | 'gathering';

export interface QueryFilter {
  searchCategories: number[];
  hq: HqMode;
  minDealPct: number;
  minVelocity: number;
  minPrice: number | null;
  maxPrice: number | null;
  sort: QuerySort;
  limit: number;
  scope: QueryScope;
  maxListings: number | null;
  mode: QueryMode;
  minGap: number | null;
}

export interface QueryPreset {
  id: string;
  label: string;
  desc: string;
  category: PresetCategory;
  filter: QueryFilter;
}

export interface QueryResultRow {
  id: number;
  name: string;
  sc: number;
  unitPrice: number;
  averagePrice: number;
  dealPct: number;
  velocity: number;
  gilFlow: number;
  hq: boolean;
}

export interface CraftFlipRow {
  id: number;
  name: string;
  sc: number;
  unitPrice: number;
  materialCost: number;
  profit: number;
  velocity: number;
  gilPerDay: number;
  hq: boolean;
}

export interface RepostRow {
  id: number;
  name: string;
  sc: number;
  cheapest: number;
  wall: number;
  gap: number;
  gapPct: number;
  taxedProfit: number;
  velocity: number;
  gilPerDay: number;
  hq: boolean;
}

export function filterHash(f: QueryFilter): string {
  return JSON.stringify({
    sc: [...f.searchCategories].sort((a, b) => a - b),
    hq: f.hq,
    d: f.minDealPct,
    v: f.minVelocity,
    p: [f.minPrice, f.maxPrice],
    s: f.sort,
    l: f.limit,
    scope: f.scope,
    ml: f.maxListings,
    m: f.mode,
    g: f.minGap,
  });
}

export type MaterialFlipSort =
  | 'gilSavedPerDay'
  | 'savePerCraft'
  | 'pctDiscount'
  | 'salePrice'
  | 'velocity';

export interface MaterialFlipFilter {
  searchCategories: number[];
  hq: HqMode;
  minVelocity: number;
  maxListings: number | null;
  minSavings: number;       // gil — drop rows whose perIngredientSavings is below this
  includeLightDc: boolean;  // when false, restrict to Chaos worlds
  sort: MaterialFlipSort;
  limit: number;
}

export interface MaterialFlipRow {
  id: number;
  name: string;
  sc: number;
  hq: boolean;              // sale-side tier chosen by pickTrustedTier
  salePrice: number;
  velocity: number;

  homeMatCost: number;
  bestPerIngredientCost: number;
  perIngredientSavings: number;

  bestSingleWorld: string;
  singleStopCost: number;
  singleStopSavings: number;
  needsDcTravel: boolean;

  gilSavedPerDay: number;
  pctDiscount: number;      // 0..1
}

export function defaultMaterialFlipFilter(): MaterialFlipFilter {
  return {
    searchCategories: [], hq: 'either', minVelocity: 1, maxListings: 20,
    minSavings: 1000, includeLightDc: true, sort: 'gilSavedPerDay', limit: 200,
  };
}
