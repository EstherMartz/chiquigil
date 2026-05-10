import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCachedRecipe, putCachedRecipe, clearRecipeCache } from './recipeCache';
import type { Recipe } from './recipes';

const sampleRecipe: Recipe = {
  itemResultId: 49281,
  classJob: 'LTW',
  recipeLevel: 770,
  ingredients: [{ itemId: 1, amount: 2 }],
};

beforeEach(async () => { await clearRecipeCache(); });
afterEach(async () => { await clearRecipeCache(); });

describe('recipeCache', () => {
  it('returns undefined when nothing cached', async () => {
    expect(await getCachedRecipe(49281)).toBeUndefined();
  });

  it('round-trips a recipe', async () => {
    await putCachedRecipe(49281, sampleRecipe);
    expect(await getCachedRecipe(49281)).toEqual(sampleRecipe);
  });

  it('round-trips an explicit null (item known to have no recipe)', async () => {
    await putCachedRecipe(41771, null);
    expect(await getCachedRecipe(41771)).toBeNull();
  });

  it('clearRecipeCache wipes all entries', async () => {
    await putCachedRecipe(49281, sampleRecipe);
    await putCachedRecipe(41771, null);
    await clearRecipeCache();
    expect(await getCachedRecipe(49281)).toBeUndefined();
    expect(await getCachedRecipe(41771)).toBeUndefined();
  });
});
