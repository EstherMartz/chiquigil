import { categoriesByGroup } from '../../lib/itemSearchCategories';
import type { QueryPreset } from './types';

export const PRESETS: QueryPreset[] = [
  {
    id: 'mega-value-hq', label: 'Mega Value HQ',
    desc: 'HQ items priced ≥1M gil currently discounted ≥30%.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 30, minVelocity: 0,
              minPrice: 1_000_000, maxPrice: null, sort: 'unitPrice', limit: 100,
              scope: 'dc', maxListings: null, craftableOnly: false },
  },
  {
    id: 'fast-sellers-hq', label: 'Fast Sellers HQ',
    desc: 'HQ items with ≥3 sales/day and ≥15% discount, sorted by gil/day.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 15, minVelocity: 3,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'dc', maxListings: null, craftableOnly: false },
  },
  {
    id: 'food-potions', label: 'Food & Potions',
    desc: 'Meals + medicine at ≥20% discount.',
    // Categories: 43 (Medicine), 45 (Meals) — see itemSearchCategories.ts
    filter: { searchCategories: [43, 45], hq: 'either', minDealPct: 20, minVelocity: 0,
              minPrice: null, maxPrice: null, sort: 'discount', limit: 100,
              scope: 'dc', maxListings: null, craftableOnly: false },
  },
  {
    id: 'furnishings', label: 'Furnishings discount',
    desc: 'Housing items at ≥30% discount.',
    filter: { searchCategories: categoriesByGroup('Housing'), hq: 'nq',
              minDealPct: 30, minVelocity: 0, minPrice: null, maxPrice: null,
              sort: 'discount', limit: 100,
              scope: 'dc', maxListings: null, craftableOnly: false },
  },
  {
    id: 'undersupply', label: 'Undersupply (craft + list)',
    desc: 'Items selling ≥1/day on your home world with ≤2 home-world listings. Craft and list to fill the gap.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: 2, craftableOnly: true },
  },
  {
    id: 'craft-flip', label: 'Craft-flip Phantom',
    desc: 'Craftable items ranked by home-world (sale − material cost) × velocity.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, craftableOnly: true },
  },
];

export function getPreset(id: string): QueryPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
