import { describe, it, expect } from 'vitest';
import { parseCompanyCraftRow, type CompanyCraftRecipe } from './companyCraftSnapshot';

describe('parseCompanyCraftRow', () => {
  it('flattens part→process→supplyItem into one ingredient bucket', () => {
    const row = {
      row_id: 17,
      fields: {
        ResultItem: { value: 31600 },
        CompanyCraftPart: [
          {
            fields: {
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
      ingredients: [
        { itemId: 5106, qty: 6 },   // 3 × 2
        { itemId: 5107, qty: 10 },  // 5 × 2
      ],
    };
    expect(result).toEqual(expected);
  });

  it('sums duplicate ingredients across phases', () => {
    const row = {
      row_id: 1,
      fields: {
        ResultItem: { value: 100 },
        CompanyCraftPart: [
          {
            fields: {
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
    expect(result?.ingredients).toEqual([{ itemId: 50, qty: 14 }]); // 4·3 + 2·1
  });

  it('returns null when ResultItem is missing or zero', () => {
    const row = { row_id: 1, fields: { ResultItem: { value: 0 }, CompanyCraftPart: [] } };
    expect(parseCompanyCraftRow(row, new Map())).toBeNull();
  });
});
