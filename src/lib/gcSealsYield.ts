import { ITEM_SEARCH_CATEGORIES } from './itemSearchCategories';

/**
 * GC seals yield table by item level.
 * The approximation accounts for the three main tiers and linear scaling above 180.
 */
export function gcSealsYield(ilvl: number): number {
  if (ilvl < 45) return 0;
  if (ilvl < 110) return 188;
  if (ilvl < 180) return 282;
  // 180+ scales roughly with ilvl — approximation, refine later if needed.
  return 282 + Math.floor((ilvl - 180) / 10) * 30;
}

// Equippable groups: gear items turnable for GC seals (weapons, armor, accessories, tools).
const EQUIP_GROUPS: ReadonlySet<string> = new Set(['Weapons', 'Armor', 'Accessories', 'Tools']);

// All item search categories (IDs) that belong to equippable groups.
export const EQUIPPABLE_SC: ReadonlySet<number> = new Set(
  ITEM_SEARCH_CATEGORIES.filter((c) => EQUIP_GROUPS.has(c.group)).map((c) => c.id),
);

/**
 * Check if an item search category ID is equippable (turnable for GC seals).
 */
export function isEquippable(sc: number): boolean {
  return EQUIPPABLE_SC.has(sc);
}
