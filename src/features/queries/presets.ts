import { categoriesByGroup } from '../../lib/itemSearchCategories';
import type { QueryPreset } from './types';

export const PRESETS: QueryPreset[] = [
  {
    id: 'mega-value-hq', label: 'Mega Value HQ', category: 'trading',
    desc: 'HQ items priced ≥1M gil currently discounted ≥30%.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 30, minVelocity: 0,
              minPrice: 1_000_000, maxPrice: null, sort: 'unitPrice', limit: 100,
              scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
  },
  {
    id: 'fast-sellers-hq', label: 'Fast Sellers HQ', category: 'trading',
    desc: 'HQ items with ≥3 sales/day and ≥15% discount, sorted by gil/day.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 15, minVelocity: 3,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
  },
  {
    id: 'food-potions', label: 'Food & Potions', category: 'trading',
    desc: 'Meals + medicine at ≥20% discount.',
    // Categories: 43 (Medicine), 45 (Meals) — see itemSearchCategories.ts
    filter: { searchCategories: [43, 45], hq: 'either', minDealPct: 20, minVelocity: 0,
              minPrice: null, maxPrice: null, sort: 'discount', limit: 100,
              scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
  },
  {
    id: 'furnishings', label: 'Furnishings discount', category: 'trading',
    desc: 'Housing items at ≥30% discount.',
    filter: { searchCategories: categoriesByGroup('Housing'), hq: 'nq',
              minDealPct: 30, minVelocity: 0, minPrice: null, maxPrice: null,
              sort: 'discount', limit: 100,
              scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
  },
  {
    id: 'undersupply', label: 'Undersupply (craft + list)', category: 'craft',
    desc: 'Items selling ≥1/day on your home world with ≤2 home-world listings. Craft and list to fill the gap.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: 2, mode: 'craft', minGap: null },
  },
  {
    id: 'craft-flip', label: 'Craft-flip Phantom', category: 'craft',
    desc: 'Craftable items ranked by home-world (sale − material cost) × velocity.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, mode: 'craft', minGap: null },
  },
  {
    id: 'reposts', label: 'Reposts (camp)', category: 'trading',
    desc: 'Home-world items where the cheapest listing is ≥10k below the next price (gap ≥30%). Buy + relist for instant gil.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 30, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, mode: 'repost', minGap: 10_000 },
  },
  {
    id: 'housing-crafts', label: 'Housing Crafts', category: 'craft',
    desc: 'Craftable housing items ranked by home-world (sale − material cost) × velocity.',
    filter: { searchCategories: categoriesByGroup('Housing'), hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, mode: 'craft', minGap: null },
  },
  {
    id: 'materials-crafts', label: 'Materials Crafts', category: 'craft',
    desc: 'Craftable materials (intermediates) ranked by home-world (sale − material cost) × velocity.',
    filter: { searchCategories: categoriesByGroup('Materials'), hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, mode: 'craft', minGap: null },
  },
  {
    id: 'high-value-materials', label: 'High-value materials', category: 'trading',
    desc: 'Materials priced ≥100k on the DC, sorted by gil/day.',
    filter: { searchCategories: categoriesByGroup('Materials'), hq: 'either', minDealPct: 0, minVelocity: 0,
              minPrice: 100_000, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
  },
  {
    id: 'minions-quick-sell', label: 'Minions quick sell', category: 'trading',
    desc: 'Minions ≤50k with ≥1 sale/day on the DC. Cheap, fast churn.',
    // Category 75: Minions — see itemSearchCategories.ts
    filter: { searchCategories: [75], hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: 50_000, sort: 'gilFlow', limit: 100,
              scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
  },
];

export function getPreset(id: string): QueryPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
