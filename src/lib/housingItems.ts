import { categoriesByGroup } from './itemSearchCategories';
import type { SnapshotItem } from './itemSnapshot';
import type { Recipe } from './recipes';

export function housingCategoryIds(): number[] {
  return categoriesByGroup('Housing');
}

const HOUSING_SET = new Set(housingCategoryIds());

export function isHousingItem(sc: number): boolean {
  return HOUSING_SET.has(sc);
}

export function furnishingCandidates(items: SnapshotItem[], recipes: Map<number, Recipe>): number[] {
  return items.filter((i) => isHousingItem(i.sc) && recipes.has(i.id)).map((i) => i.id);
}

export function materialCandidates(recipes: Map<number, Recipe>, furnishingIds: number[]): number[] {
  const out = new Set<number>();
  for (const id of furnishingIds) {
    const r = recipes.get(id);
    if (!r) continue;
    for (const ing of r.ingredients) out.add(ing.itemId);
  }
  return [...out];
}

export function allHousingCandidates(items: SnapshotItem[]): number[] {
  return items.filter((i) => isHousingItem(i.sc)).map((i) => i.id);
}
