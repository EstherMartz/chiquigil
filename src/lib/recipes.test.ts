import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRecipeQueryUrl, parseRecipeResponse, fetchRecipeForItem } from './recipes';

describe('buildRecipeQueryUrl', () => {
  it('builds an XIVAPI Recipe-sheet query filtering by ItemResult', () => {
    expect(buildRecipeQueryUrl(49281)).toBe(
      'https://v2.xivapi.com/api/search?sheets=Recipe&query=ItemResult%3D49281&fields=ItemResult,CraftType.Name,RecipeLevelTable.ClassJobLevel,RecipeLevelTable.Stars,RecipeLevelTable.Difficulty,RecipeLevelTable.Quality,RecipeLevelTable.Durability,DifficultyFactor,QualityFactor,DurabilityFactor,RequiredCraftsmanship,RequiredControl,Ingredient[].row_id,AmountIngredient,AmountResult&limit=1'
    );
  });
});

describe('parseRecipeResponse', () => {
  it('returns null when no results', () => {
    expect(parseRecipeResponse(49281, { results: [] })).toBeNull();
  });

  it('returns null when results array is missing', () => {
    expect(parseRecipeResponse(49281, {})).toBeNull();
  });

  it('extracts ingredients with amount > 0', () => {
    const raw = {
      results: [{
        fields: {
          ItemResult: { value: 49281 },
          CraftType: { fields: { Name: 'Leatherworker' } },
          RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
          Ingredient: [
            { value: 100 },
            { value: 200 },
            { value: 0 },
          ],
          AmountIngredient: [2, 3, 0],
        },
      }],
    };
    expect(parseRecipeResponse(49281, raw)).toEqual({
      itemResultId: 49281,
      classJob: 'LTW',
      recipeLevel: 100,
      amountResult: 1,
      ingredients: [
        { itemId: 100, amount: 2 },
        { itemId: 200, amount: 3 },
      ],
    });
  });

  it('extracts stats when RecipeLevelTable carries them, applying factors', () => {
    const raw = {
      results: [{
        fields: {
          ItemResult: { value: 1 },
          CraftType: { fields: { Name: 'Weaver' } },
          RecipeLevelTable: {
            fields: {
              ClassJobLevel: 100,
              Stars: 4,
              Difficulty: 10040,
              Quality: 21200,
              Durability: 70,
            },
          },
          DifficultyFactor: 100,
          QualityFactor: 100,
          DurabilityFactor: 100,
          RequiredCraftsmanship: 5400,
          RequiredControl: 5200,
        },
      }],
    };
    const r = parseRecipeResponse(1, raw);
    expect(r?.stats).toEqual({
      durability: 70,
      progress: 10040,
      quality: 21200,
      stars: 4,
      requiredCraftsmanship: 5400,
      requiredControl: 5200,
    });
  });

  it('applies sub-100 factors to base stats', () => {
    const raw = {
      results: [{
        fields: {
          ItemResult: { value: 1 },
          CraftType: { fields: { Name: 'Weaver' } },
          RecipeLevelTable: {
            fields: { ClassJobLevel: 100, Difficulty: 1000, Quality: 2000, Durability: 100 },
          },
          DifficultyFactor: 50,
          QualityFactor: 75,
          DurabilityFactor: 80,
        },
      }],
    };
    const r = parseRecipeResponse(1, raw);
    expect(r?.stats).toMatchObject({
      progress: 500,
      quality: 1500,
      durability: 80,
    });
  });

  it('omits stats when RecipeLevelTable has none', () => {
    const raw = {
      results: [{
        fields: {
          ItemResult: { value: 1 },
          CraftType: { fields: { Name: 'Weaver' } },
          RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
        },
      }],
    };
    expect(parseRecipeResponse(1, raw)?.stats).toBeUndefined();
  });

  it('maps full crafter names back to codes', () => {
    const make = (name: string) => ({
      results: [{
        fields: {
          ItemResult: { value: 1 },
          CraftType: { fields: { Name: name } },
          RecipeLevelTable: { fields: { ClassJobLevel: 1 } },
        },
      }],
    });
    expect(parseRecipeResponse(1, make('Carpenter'))?.classJob).toBe('CRP');
    expect(parseRecipeResponse(1, make('Weaver'))?.classJob).toBe('WVR');
    expect(parseRecipeResponse(1, make('Alchemist'))?.classJob).toBe('ALC');
    expect(parseRecipeResponse(1, make('Culinarian'))?.classJob).toBe('CUL');
    expect(parseRecipeResponse(1, make('Blacksmith'))?.classJob).toBe('BSM');
    expect(parseRecipeResponse(1, make('Armorer'))?.classJob).toBe('ARM');
    expect(parseRecipeResponse(1, make('Goldsmith'))?.classJob).toBe('GSM');
    expect(parseRecipeResponse(1, make('Leatherworker'))?.classJob).toBe('LTW');
  });
});

describe('fetchRecipeForItem', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns null on empty results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }));
    expect(await fetchRecipeForItem(99999)).toBeNull();
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(fetchRecipeForItem(1)).rejects.toThrow('XIVAPI 400');
  });
});

describe('parseRecipeResponse amountResult (yield)', () => {
  const base = {
    ItemResult: { value: 5 },
    CraftType: { fields: { Name: 'Blacksmith' } },
    RecipeLevelTable: { fields: { ClassJobLevel: 1 } },
    Ingredient: [{ value: 10 }],
    AmountIngredient: [1],
  };

  it('reads AmountResult as the per-craft yield', () => {
    const raw = { results: [{ fields: { ...base, AmountResult: 3 } }] };
    expect(parseRecipeResponse(5, raw)?.amountResult).toBe(3);
  });

  it('defaults to 1 when AmountResult is absent', () => {
    const raw = { results: [{ fields: { ...base } }] };
    expect(parseRecipeResponse(5, raw)?.amountResult).toBe(1);
  });

  it('clamps a zero/invalid AmountResult to 1 (never divides by zero downstream)', () => {
    const raw = { results: [{ fields: { ...base, AmountResult: 0 } }] };
    expect(parseRecipeResponse(5, raw)?.amountResult).toBe(1);
  });
});
