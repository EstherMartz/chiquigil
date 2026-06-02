import type { CurrencyId } from '../../lib/currencies';

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
  trainedEye: boolean;
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
    te: f.trainedEye,
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

export type VendorFlipSort =
  | 'profitPerDay'
  | 'markup'
  | 'profitPerUnit'
  | 'salePrice'
  | 'velocity';

export interface VendorFlipFilter {
  searchCategories: number[];
  minProfit: number;        // gil/unit
  minMarkup: number;        // multiplier (e.g. 2.0 = 2× vendor price)
  minVelocity: number;      // sales/day
  maxListings: number | null;
  hq: HqMode;
  sort: VendorFlipSort;
  limit: number;
}

export interface VendorFlipRow {
  id: number;
  name: string;
  sc: number;
  vendorPrice: number;
  salePrice: number;
  hq: boolean;
  profitPerUnit: number;
  markup: number;           // tier.unit / vendorPrice
  profitPerDay: number;     // profitPerUnit × velocity
  velocity: number;
  listingCount: number;
}

export function defaultVendorFlipFilter(): VendorFlipFilter {
  return {
    searchCategories: [],
    minProfit: 500,
    minMarkup: 2.0,
    minVelocity: 0.5,
    maxListings: null,
    hq: 'either',
    sort: 'profitPerDay',
    limit: 200,
  };
}

export type CurrencyFlipSort =
  | 'gilPerUnit'
  | 'salePrice'
  | 'velocity'
  | 'costPerUnit';

export interface CurrencyFlipFilter {
  currency: CurrencyId;
  minGilPerUnit: number;
  minVelocity: number;
  maxListings: number | null;
  hq: HqMode;
  sort: CurrencyFlipSort;
  limit: number;
}

export interface CurrencyFlipRow {
  id: number;
  name: string;
  sc: number;
  costPerUnit: number;
  salePrice: number;
  hq: boolean;
  gilPerUnit: number;
  velocity: number;
  listingCount: number;
}

export function defaultCurrencyFlipFilter(): CurrencyFlipFilter {
  return {
    currency: 'poetics',
    minGilPerUnit: 0,
    minVelocity: 0,
    maxListings: null,
    hq: 'either',
    sort: 'gilPerUnit',
    limit: 200,
  };
}

export type EmptyShelfSort = 'freshness' | 'velocity' | 'estGilPerDay' | 'suggestedPrice';

export interface EmptyShelfFilter {
  searchCategories: number[];
  hq: HqMode;
  minVelocity: number;
  maxListings: number;
  maxDaysSinceSale: number | null;
  sort: EmptyShelfSort;
  limit: number;
}

export interface EmptyShelfRow {
  id: number; name: string; sc: number; hq: boolean;
  suggestedPrice: number;
  velocity: number;
  lastSaleMs: number | null;
  daysSinceLastSale: number | null;
  estGilPerDay: number;
}

export function defaultEmptyShelfFilter(): EmptyShelfFilter {
  return { searchCategories: [], hq: 'either', minVelocity: 0.14, maxListings: 0,
           maxDaysSinceSale: 30, sort: 'freshness', limit: 200 };
}

export type WhatsNewTab = 'items' | 'recipes';
export type WhatsNewSort = 'velocity' | 'price' | 'freshness' | 'name';

export interface WhatsNewFilter {
  tab: WhatsNewTab;
  tradeableOnly: boolean;
  minVelocity: number;
  categories: number[];
  sort: WhatsNewSort;
  limit: number;
}

export interface WhatsNewRow {
  id: number;
  name: string;
  sc: number;
  craftable: boolean;
  hq: boolean;
  price: number | null;
  velocity: number;
  recentSales: number;
  lastSaleMs: number | null;
  daysSinceLastSale: number | null;
}

export function defaultWhatsNewFilter(): WhatsNewFilter {
  return { tab: 'items', tradeableOnly: true, minVelocity: 0, categories: [], sort: 'velocity', limit: 200 };
}
