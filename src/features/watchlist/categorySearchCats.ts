import type { ItemCategory } from '../items/types';
import { categoriesByGroup } from '../../lib/itemSearchCategories';

/**
 * Maps a watchlist category to the ItemSearchCategory (sc) ids that define it,
 * so suggestions can scope a catalog scan to "items in this category". Reuses
 * the XIVAPI group helper where a group maps cleanly. A category that has no
 * clean sc analogue (a hand-curated set) returns [] — meaning "no suggestions".
 *
 *   43 Medicine · 44 Ingredients · 45 Meals · 46 Seafood · 54 Dyes · 57 Materia
 *   75 Minions · Armor/Weapons/Accessories groups · Housing group
 */
export function searchCatsForCategory(cat: ItemCategory): number[] {
  switch (cat) {
    case 'Food':     return [44, 45];               // Ingredients, Meals
    case 'Fish':     return [46];                   // Seafood
    case 'Tincture': return [43, 6];                // Medicine, Medicines umbrella
    case 'Dye':      return [54];
    case 'Materia':  return [57];
    case 'Minion':   return [75];
    case 'Housing':  return categoriesByGroup('Housing');
    case 'Glamour':
    case 'Raid':
      return [
        ...categoriesByGroup('Weapons'),
        ...categoriesByGroup('Armor'),
        ...categoriesByGroup('Accessories'),
      ];
  }
}

/** True when the category supports suggestions (has any backing sc ids). */
export function categorySupportsSuggestions(cat: ItemCategory): boolean {
  return searchCatsForCategory(cat).length > 0;
}

// Reverse map (sc → watchlist category) for inferring the category of a
// manually-added item. First match wins; falls back to 'Glamour' for anything
// equipment-shaped and unmatched, matching the prior hard-coded default.
const SC_TO_CATEGORY: Array<[ReadonlySet<number>, ItemCategory]> = [
  [new Set([44, 45]), 'Food'],
  [new Set([46]), 'Fish'],
  [new Set([43, 6]), 'Tincture'],
  [new Set([54]), 'Dye'],
  [new Set([57]), 'Materia'],
  [new Set([75]), 'Minion'],
  [new Set(categoriesByGroup('Housing')), 'Housing'],
];

/** Best-effort watchlist category for an item's search category. */
export function inferCategory(sc: number): ItemCategory {
  for (const [set, cat] of SC_TO_CATEGORY) {
    if (set.has(sc)) return cat;
  }
  return 'Glamour';
}
