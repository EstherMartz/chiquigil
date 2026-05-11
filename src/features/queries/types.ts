export type HqMode = 'hq' | 'nq' | 'either';
export type QuerySort = 'discount' | 'gilFlow' | 'velocity' | 'unitPrice';
export type QueryScope = 'home' | 'dc';
export type QueryMode = 'standard' | 'craft' | 'repost';
export type PresetCategory = 'craft' | 'trading';

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
