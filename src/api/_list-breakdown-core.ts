import { resolveList, type ListInput, type ResolveDeps, type ListSource } from '../features/craftLists/resolveList';

export interface ApiFinalItem {
  itemId: number; itemName: string; qty: number; isHq: boolean;
  job?: string; recipeLevel?: number; stars?: number;
}
export interface ApiResolvedIngredient {
  itemId: number; itemName: string; requiredQty: number; source: ListSource;
  craftedByJob?: string; recipeLevel?: number; usedToCraft: string[]; depth?: number; canHq?: boolean;
}
export interface ListBreakdownResponse {
  finalItems: ApiFinalItem[];
  ingredients: ApiResolvedIngredient[];
}

const MAX_ITEMS = 200;

/** Validate the POST body's `items` into resolveList inputs, or null if invalid. */
export function validateBreakdownItems(raw: unknown): ListInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return null;
  const out: ListInput[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const itemId = Number(o.itemId);
    const qty = Number(o.qty);
    if (!Number.isInteger(itemId) || itemId <= 0) return null;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99999) return null;
    out.push({ itemId, qty, isHq: !!o.hq });
  }
  return out;
}

/** Resolve a list (reusing the Part-1 resolver) and flatten for JSON transport. */
export function buildListBreakdown(items: ListInput[], deps: ResolveDeps): ListBreakdownResponse {
  const r = resolveList(items, deps);
  return {
    finalItems: r.finalItems.map((f) => ({
      itemId: f.itemId, itemName: f.itemName, qty: f.qty, isHq: f.isHq,
      job: f.job, recipeLevel: f.recipeLevel, stars: f.stars,
    })),
    ingredients: r.all.map((i) => ({
      itemId: i.itemId, itemName: i.itemName, requiredQty: i.requiredQty, source: i.source,
      craftedByJob: i.craftedByJob, recipeLevel: i.recipeLevel,
      usedToCraft: i.usedToCraft, depth: i.depth, canHq: i.canHq,
    })),
  };
}
