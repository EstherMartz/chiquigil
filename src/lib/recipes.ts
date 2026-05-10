import type { CrafterCode } from '../features/items/types';

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const FIELDS = [
  'ItemResult',
  'CraftType.Name',
  'RecipeLevelTable.ClassJobLevel',
  ...Array.from({ length: 10 }, (_, i) => [`Ingredient${i}`, `AmountIngredient${i}`]).flat(),
].join(',');

export interface Ingredient {
  itemId: number;
  amount: number;
}

export interface Recipe {
  itemResultId: number;
  classJob: CrafterCode;
  recipeLevel: number;
  ingredients: Ingredient[];
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
interface RawResultFields {
  ItemResult?: { value?: number };
  CraftType?: { fields?: { Name?: string } };
  RecipeLevelTable?: { fields?: { ClassJobLevel?: number } };
  [k: string]: unknown;
}

export function parseRecipeResponse(itemId: number, raw: { results?: Array<{ fields?: RawResultFields }> }): Recipe | null {
  const first = raw.results?.[0]?.fields;
  if (!first) return null;
  const name = first.CraftType?.fields?.Name ?? '';
  const code = NAME_TO_CODE[name] ?? 'ANY';
  const recipeLevel = first.RecipeLevelTable?.fields?.ClassJobLevel ?? 0;
  const ingredients: Ingredient[] = [];
  for (let i = 0; i < 10; i++) {
    const ing = first[`Ingredient${i}`] as RawIngredient | undefined;
    const amt = first[`AmountIngredient${i}`] as number | undefined;
    if (ing?.value && amt && amt > 0) {
      ingredients.push({ itemId: ing.value, amount: amt });
    }
  }
  return { itemResultId: itemId, classJob: code, recipeLevel, ingredients };
}

export async function fetchRecipeForItem(itemId: number): Promise<Recipe | null> {
  const res = await fetch(buildRecipeQueryUrl(itemId));
  if (!res.ok) throw new Error(`XIVAPI ${res.status}`);
  return parseRecipeResponse(itemId, await res.json());
}
