import type { CrafterCode } from '../items/types';
import { craftStatus, type CrafterLevels } from '../items/craftStatus';
import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';

export interface PatchMover {
  id: number;
  name: string;
  velocity: number; // sales/day
  price: number | null; // a representative sale price for display
  crafter: CrafterCode;
  recipeLevel: number;
}

/** Minimum sales/day for a new item to count as a "mover" (proven demand). */
export const PATCH_MOVER_MIN_VELOCITY = 0.5;

/**
 * New-this-patch items the user can craft at their current job levels AND that
 * are selling (velocity ≥ PATCH_MOVER_MIN_VELOCITY). Sorted by velocity desc.
 * Pure: callers pass already-fetched catalog + market data.
 */
export function selectPatchMovers(
  ids: number[],
  itemsById: Map<number, SnapshotItem>,
  recipes: Map<number, Recipe>,
  levels: CrafterLevels,
  market: MarketData,
): PatchMover[] {
  const movers: PatchMover[] = [];

  for (const id of ids) {
    // 1. Get item metadata
    const it = itemsById.get(id);
    if (!it) continue;

    // 2. Get recipe
    const recipe = recipes.get(id);
    if (!recipe) continue;

    // 3. Check if user can craft at their current levels
    if (craftStatus({ crafter: recipe.classJob, lvl: recipe.recipeLevel }, levels) !== 'ok') {
      continue;
    }

    // 4. Get market data and velocity
    const m = market[String(id)];
    const velocity = m?.velocity ?? 0;
    if (velocity < PATCH_MOVER_MIN_VELOCITY) continue;

    // 5. Pick a representative price (fallthrough chain)
    let price: number | null = null;
    if (m) {
      const candidate = m.medianHQ ?? m.medianNQ ?? m.minHQ ?? m.minNQ ?? m.averagePriceHQ ?? m.averagePriceNQ ?? null;
      price = candidate != null ? Math.round(candidate) : null;
    }

    // 6. Add to movers
    movers.push({
      id,
      name: it.name,
      velocity,
      price,
      crafter: recipe.classJob,
      recipeLevel: recipe.recipeLevel,
    });
  }

  // Sort by velocity desc, then by id asc for determinism
  movers.sort((a, b) => b.velocity - a.velocity || a.id - b.id);

  return movers;
}
