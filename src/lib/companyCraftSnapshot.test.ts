import { describe, it, expect } from 'vitest';
import { parseCompanyCraftRow, type CompanyCraftRecipe } from './companyCraftSnapshot';

describe('parseCompanyCraftRow', () => {
  it('groups part→process→supplyItem under a single part with the type name', () => {
    const row = {
      row_id: 17,
      fields: {
        ResultItem: { value: 31600 },
        CompanyCraftPart: [
          {
            fields: {
              CompanyCraftType: { fields: { Name: 'Hull' } },
              CompanyCraftProcess: [
                {
                  fields: {
                    SupplyItem: [
                      { fields: { Item: { value: 5106 } } },
                      { fields: { Item: { value: 5107 } } },
                    ],
                    SetQuantity: [3, 5],
                    SetsRequired: [2, 2],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const result = parseCompanyCraftRow(row, new Map([
      [31600, 'Tatanora Hull'],
      [5106, 'Iron Ore'],
      [5107, 'Hardsilver Ore'],
    ]));
    const expected: CompanyCraftRecipe = {
      resultItemId: 31600,
      resultName: 'Tatanora Hull',
      parts: [{
        name: 'Hull',
        phases: [{
          ingredients: [
            { itemId: 5106, qty: 6 },   // 3 × 2
            { itemId: 5107, qty: 10 },  // 5 × 2
          ],
        }],
      }],
    };
    expect(result).toEqual(expected);
  });

  it('keeps multiple parts separate (e.g. submarine Hull + Stern)', () => {
    const row = {
      row_id: 42,
      fields: {
        ResultItem: { value: 200 },
        CompanyCraftPart: [
          {
            fields: {
              CompanyCraftType: { fields: { Name: 'Hull' } },
              CompanyCraftProcess: [
                { fields: { SupplyItem: [{ fields: { Item: { value: 10 } } }], SetQuantity: [2], SetsRequired: [3] } },
              ],
            },
          },
          {
            fields: {
              CompanyCraftType: { fields: { Name: 'Stern' } },
              CompanyCraftProcess: [
                { fields: { SupplyItem: [{ fields: { Item: { value: 20 } } }], SetQuantity: [4], SetsRequired: [1] } },
              ],
            },
          },
        ],
      },
    };
    const result = parseCompanyCraftRow(row, new Map([[200, 'Sub']]));
    expect(result?.parts).toHaveLength(2);
    expect(result?.parts[0]).toEqual({
      name: 'Hull',
      phases: [{ ingredients: [{ itemId: 10, qty: 6 }] }],
    });
    expect(result?.parts[1]).toEqual({
      name: 'Stern',
      phases: [{ ingredients: [{ itemId: 20, qty: 4 }] }],
    });
  });

  it('keeps phases within a part separate (each process is its own entry)', () => {
    const row = {
      row_id: 1,
      fields: {
        ResultItem: { value: 100 },
        CompanyCraftPart: [
          {
            fields: {
              CompanyCraftType: { fields: { Name: 'Wheel Stand' } },
              CompanyCraftProcess: [
                { fields: { SupplyItem: [{ fields: { Item: { value: 50 } } }], SetQuantity: [4], SetsRequired: [3] } },
                { fields: { SupplyItem: [{ fields: { Item: { value: 50 } } }], SetQuantity: [2], SetsRequired: [1] } },
              ],
            },
          },
        ],
      },
    };
    const result = parseCompanyCraftRow(row, new Map([[100, 'X'], [50, 'Ore']]));
    expect(result?.parts).toHaveLength(1);
    // Two separate processes → two separate phases.
    expect(result?.parts[0].phases).toHaveLength(2);
    expect(result?.parts[0].phases[0].ingredients).toEqual([{ itemId: 50, qty: 12 }]); // 4·3
    expect(result?.parts[0].phases[1].ingredients).toEqual([{ itemId: 50, qty: 2 }]);  // 2·1
  });

  it('skips empty parts (no supplies) but keeps populated siblings', () => {
    const row = {
      row_id: 7,
      fields: {
        ResultItem: { value: 300 },
        CompanyCraftPart: [
          { fields: { CompanyCraftType: { fields: { Name: '' } }, CompanyCraftProcess: [] } },
          {
            fields: {
              CompanyCraftType: { fields: { Name: 'Bridge' } },
              CompanyCraftProcess: [
                { fields: { SupplyItem: [{ fields: { Item: { value: 99 } } }], SetQuantity: [1], SetsRequired: [1] } },
              ],
            },
          },
        ],
      },
    };
    const result = parseCompanyCraftRow(row, new Map([[300, 'Thing']]));
    expect(result?.parts).toHaveLength(1);
    expect(result?.parts[0].name).toBe('Bridge');
  });

  it('returns null when ResultItem is missing or zero', () => {
    const row = { row_id: 1, fields: { ResultItem: { value: 0 }, CompanyCraftPart: [] } };
    expect(parseCompanyCraftRow(row, new Map())).toBeNull();
  });
});
