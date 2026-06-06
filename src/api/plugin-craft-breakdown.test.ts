// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Recipe } from '../lib/recipes';
import type { SnapshotItem } from '../lib/itemSnapshot';

// Mock the snapshot loader so the handler doesn't hit the network.
vi.mock('../bot/loadSnapshots', () => {
  const recipes = new Map<number, Recipe>([
    [1, { itemResultId: 1, classJob: 'BSM', recipeLevel: 90, ingredients: [
      { itemId: 2, amount: 2 }, { itemId: 7, amount: 1 },
    ], amountResult: 1, stats: { durability: 1, progress: 1, quality: 1, stars: 4, requiredCraftsmanship: 0, requiredControl: 0 } }],
    [2, { itemResultId: 2, classJob: 'BSM', recipeLevel: 50, ingredients: [{ itemId: 3, amount: 3 }], amountResult: 1 }],
  ]);
  const itemsById = new Map<number, SnapshotItem>([
    [1, { id: 1, name: 'Sword', sc: 5, ui: 0, ilvl: 600, canHq: true, rarity: 1 }],
    [2, { id: 2, name: 'Ingot', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
    [3, { id: 3, name: 'Ore', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
    [7, { id: 7, name: 'Fire Shard', sc: 58, ui: 0, ilvl: 1, canHq: false, rarity: 1 }],
  ] as [number, SnapshotItem][]);
  const namesById = new Map([...itemsById].map(([id, it]) => [id, it.name]));
  return {
    loadSnapshots: vi.fn(async () => ({
      itemsById, namesById, recipes,
      vendorMap: new Map<number, number>(),
      specialShop: { byCurrency: new Map() },
      gatheringCatalog: new Map([[3, { level: 50, timed: false, hidden: false }]]),
      companyCraft: new Map(),
    })),
  };
});

import handler from './plugin-craft-breakdown';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/plugin/craft-breakdown (list)', () => {
  it('returns finalItems + ingredients for a list', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: { items: [{ itemId: 1, qty: 1 }] }, query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.finalItems[0]).toMatchObject({ itemId: 1, itemName: 'Sword' });
    expect(body.ingredients.find((i: any) => i.itemId === 3)).toMatchObject({ requiredQty: 6, source: 'Gathered' });
  });

  it('400s on an empty/invalid items array', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: { items: [] }, query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('still 400s a GET with no id/qty (existing behavior)', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
