import type { Recipe } from '../../../src/lib/recipes';

export interface ExplodedCraft {
  outputQty: number;
  craftCount: number;
  job: string;
}

export interface ExplodeResult {
  crafts: Map<number, ExplodedCraft>;
  leaves: Map<number, number>;
}

export interface ExplodeOpts {
  craftIntermediates?: boolean;  // default true
  maxDepth?: number;            // default 20
}

export function explode(
  targetId: number,
  targetQty: number,
  recipes: Map<number, Recipe>,
  opts: ExplodeOpts = {},
): ExplodeResult {
  const craftIntermediates = opts.craftIntermediates ?? true;
  const maxDepth = opts.maxDepth ?? 20;
  const crafts = new Map<number, ExplodedCraft>();
  const leaves = new Map<number, number>();

  function walk(id: number, qty: number, depth: number, path: Set<number>): void {
    if (depth > maxDepth) {
      // Depth exceeded — treat as leaf
      leaves.set(id, (leaves.get(id) ?? 0) + qty);
      return;
    }

    if (path.has(id)) {
      // Cycle detected — treat as leaf to break the loop
      leaves.set(id, (leaves.get(id) ?? 0) + qty);
      return;
    }

    const recipe = recipes.get(id);
    // Craft if: recipe exists AND (it's the top-level target OR we're crafting intermediates)
    if (recipe && (id === targetId || craftIntermediates)) {
      const yieldPerCraft = recipe.amountResult ?? 1;
      const craftCount = Math.ceil(qty / yieldPerCraft);

      // Accumulate into existing craft entry if we've seen this item before
      const existing = crafts.get(id);
      if (existing) {
        existing.outputQty += qty;
        existing.craftCount += craftCount;
      } else {
        crafts.set(id, { outputQty: qty, craftCount, job: recipe.classJob });
      }

      path.add(id);
      for (const ing of recipe.ingredients) {
        walk(ing.itemId, ing.amount * craftCount, depth + 1, path);
      }
      path.delete(id);
    } else {
      // No recipe or not crafting intermediates — it's a leaf
      leaves.set(id, (leaves.get(id) ?? 0) + qty);
    }
  }

  walk(targetId, targetQty, 0, new Set());
  return { crafts, leaves };
}
