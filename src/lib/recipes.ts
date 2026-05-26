import type { CrafterCode } from '../features/items/types';
import { fetchXivapiPage } from './xivapiRetry';

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const FIELDS = [
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
  // See recipeSnapshot.ts: bare `Ingredient` busts XIVAPI's row budget.
  'Ingredient[].row_id',
  'AmountIngredient',
].join(',');

export interface Ingredient {
  itemId: number;
  amount: number;
}

export interface RecipeStats {
  durability: number;
  progress: number;
  quality: number;
  stars: number;
  requiredCraftsmanship: number;
  requiredControl: number;
}

export interface Recipe {
  itemResultId: number;
  classJob: CrafterCode;
  recipeLevel: number;
  ingredients: Ingredient[];
  stats?: RecipeStats;
  amountResult?: number;
}

const NAME_TO_CODE: Record<string, CrafterCode> = {
  Carpenter: 'CRP',
  Blacksmith: 'BSM',
  Armorer: 'ARM',
  Goldsmith: 'GSM',
  Leatherworker: 'LTW',
  Weaver: 'WVR',
  Alchemist: 'ALC',
  Culinarian: 'CUL',
};

export function buildRecipeQueryUrl(itemId: number): string {
  const q = encodeURIComponent(`ItemResult=${itemId}`);
  return `${BASE.replace(/\/$/, '')}/api/search?sheets=Recipe&query=${q}&fields=${FIELDS}&limit=1`;
}

interface RawIngredient { value?: number }
interface RawRecipeLevelTableFields {
  ClassJobLevel?: number;
  Stars?: number;
  Difficulty?: number;
  Quality?: number;
  Durability?: number;
}
interface RawResultFields {
  ItemResult?: { value?: number };
  CraftType?: { fields?: { Name?: string } };
  RecipeLevelTable?: { fields?: RawRecipeLevelTableFields };
  DifficultyFactor?: number;
  QualityFactor?: number;
  DurabilityFactor?: number;
  RequiredCraftsmanship?: number;
  RequiredControl?: number;
  Ingredient?: RawIngredient[];
  AmountIngredient?: number[];
  [k: string]: unknown;
}

export function parseRecipeResponse(itemId: number, raw: { results?: Array<{ fields?: RawResultFields }> }): Recipe | null {
  const first = raw.results?.[0]?.fields;
  if (!first) return null;
  const name = first.CraftType?.fields?.Name ?? '';
  const code = NAME_TO_CODE[name] ?? 'ANY';
  const rlt = first.RecipeLevelTable?.fields;
  const recipeLevel = rlt?.ClassJobLevel ?? 0;
  // XIVAPI v2 returns Ingredient + AmountIngredient as parallel arrays.
  // Earlier shape (Ingredient0..Ingredient9 numbered fields) is gone — recipes
  // baked under the old parser come out with ingredients=[].
  const ings = Array.isArray(first.Ingredient) ? first.Ingredient : [];
  const amts = Array.isArray(first.AmountIngredient) ? first.AmountIngredient : [];
  const ingredients: Ingredient[] = [];
  for (let i = 0; i < ings.length; i++) {
    const ing = ings[i];
    const amt = amts[i];
    if (ing?.value && typeof amt === 'number' && amt > 0) {
      ingredients.push({ itemId: ing.value, amount: amt });
    }
  }
  let stats: RecipeStats | undefined;
  if (rlt && (rlt.Difficulty != null || rlt.Quality != null || rlt.Durability != null)) {
    const df = first.DifficultyFactor ?? 100;
    const qf = first.QualityFactor ?? 100;
    const durf = first.DurabilityFactor ?? 100;
    stats = {
      durability: Math.floor((rlt.Durability ?? 0) * durf / 100),
      progress: Math.floor((rlt.Difficulty ?? 0) * df / 100),
      quality: Math.floor((rlt.Quality ?? 0) * qf / 100),
      stars: rlt.Stars ?? 0,
      requiredCraftsmanship: first.RequiredCraftsmanship ?? 0,
      requiredControl: first.RequiredControl ?? 0,
    };
  }
  return { itemResultId: itemId, classJob: code, recipeLevel, ingredients, ...(stats ? { stats } : {}) };
}

export async function fetchRecipeForItem(itemId: number): Promise<Recipe | null> {
  const res = await fetchXivapiPage(buildRecipeQueryUrl(itemId));
  if (!res.ok) throw new Error(`XIVAPI ${res.status}`);
  return parseRecipeResponse(itemId, await res.json());
}
