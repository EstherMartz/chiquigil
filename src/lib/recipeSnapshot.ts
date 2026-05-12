/**
 * One-shot paginated fetch of the entire XIVAPI Recipe sheet, returned as
 * Map<itemResultId, Recipe>. Replaces the per-item fetch model used by
 * useRecipes — after this loads (~5-15s on first visit), every recipe
 * lookup is local. Cached as a single IDB blob.
 */
import type { CrafterCode } from '../features/items/types';
import { parseRecipeResponse, type Recipe } from './recipes';

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const PAGE_SIZE = 500;
const RECIPE_FIELDS = [
  'ItemResult',
  'CraftType.Name',
  'RecipeLevelTable.ClassJobLevel',
  'RecipeLevelTable.Stars',
  'RecipeLevelTable.Difficulty',
  'RecipeLevelTable.Quality',
  'RecipeLevelTable.Durability',
  'DifficultyFactor',
  'QualityFactor',
  'DurabilityFactor',
  'RequiredCraftsmanship',
  'RequiredControl',
  ...Array.from({ length: 10 }, (_, i) => [`Ingredient${i}`, `AmountIngredient${i}`]).flat(),
].join(',');

interface RawRow { row_id: number; fields: Record<string, unknown> }
interface RawPage { rows?: RawRow[] }

export interface RecipeSnapshotMeta {
  fetchedAt: number;
  recipeCount: number;
}

export type RecipeMap = Map<number, Recipe>;

export interface BuildOpts {
  onProgress?: (count: number) => void;
}

function buildPageUrl(after: number): string {
  const params = new URLSearchParams({ fields: RECIPE_FIELDS, limit: String(PAGE_SIZE) });
  if (after > 0) params.set('after', String(after));
  return `${BASE.replace(/\/$/, '')}/api/sheet/Recipe?${params.toString()}`;
}

export async function fetchRecipeSnapshot(opts: BuildOpts = {}): Promise<RecipeMap> {
  const out: RecipeMap = new Map();
  let after = 0;
  while (true) {
    const res = await fetch(buildPageUrl(after));
    if (!res.ok) throw new Error(`XIVAPI Recipe ${res.status}`);
    const page = (await res.json()) as RawPage;
    const rows = page.rows ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      // parseRecipeResponse expects the {results:[{fields}]} shape — wrap once.
      const recipe = parseRecipeResponse(0, { results: [{ fields: row.fields }] });
      if (!recipe) continue;
      const itemId = (row.fields.ItemResult as { value?: number } | undefined)?.value ?? 0;
      if (itemId <= 0) continue;
      recipe.itemResultId = itemId;
      // First recipe wins — duplicates across crafters are rare for crafted-only items.
      if (!out.has(itemId)) out.set(itemId, recipe);
    }
    opts.onProgress?.(out.size);
    after = rows[rows.length - 1].row_id;
  }
  return out;
}

// Re-exported for callers building lookup maps with the same type signature
// the old per-item resolver returned (Map<id, Recipe | null>).
export function asNullableMap(snapshot: RecipeMap, ids: number[]): Map<number, Recipe | null> {
  const out = new Map<number, Recipe | null>();
  for (const id of ids) out.set(id, snapshot.get(id) ?? null);
  return out;
}

export type { CrafterCode };
