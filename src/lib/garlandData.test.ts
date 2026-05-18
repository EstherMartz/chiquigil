import { describe, it, expect } from 'vitest';
import { parseGarlandItem } from './garlandData';

describe('parseGarlandItem', () => {
  it('returns null when item is missing', () => {
    expect(parseGarlandItem({})).toBeNull();
  });

  it('classifies ingredients by partial flags (vendor, gather, craft, other)', () => {
    const raw = {
      item: {
        id: 49281,
        name: 'Test Tunic',
        ilvl: 770,
        craft: [{
          ingredients: [
            { id: 1, amount: 2 },
            { id: 2, amount: 4 },
            { id: 3, amount: 1 },
            { id: 4, amount: 8 },
          ],
        }],
      },
      partials: [
        { type: 'item', id: 1, obj: { n: 'Linen Yarn', i: 100, v: 1 } },
        { type: 'item', id: 2, obj: { n: 'Urqopacha Flax', i: 100, s: 1 } },
        { type: 'item', id: 3, obj: { n: 'Sweatcloth', i: 100, t: 1 } },
        { type: 'item', id: 4, obj: { n: 'Mystery Mat', i: 100 } },
      ],
    };
    const out = parseGarlandItem(raw);
    expect(out?.ingredients).toEqual([
      { id: 1, amount: 2, name: 'Linen Yarn', ilvl: 100, source: 'vendor' },
      { id: 2, amount: 4, name: 'Urqopacha Flax', ilvl: 100, source: 'gather' },
      { id: 3, amount: 1, name: 'Sweatcloth', ilvl: 100, source: 'craft' },
      { id: 4, amount: 8, name: 'Mystery Mat', ilvl: 100, source: 'other' },
    ]);
  });

  it('falls back to item.ingredients when craft is missing', () => {
    const raw = {
      item: {
        id: 5,
        name: 'Plain',
        ilvl: 1,
        ingredients: [{ id: 7, amount: 3 }],
      },
      partials: [
        { type: 'item', id: 7, obj: { n: 'Maple Log', i: 1, s: 1 } },
      ],
    };
    const out = parseGarlandItem(raw);
    expect(out?.ingredients).toEqual([
      { id: 7, amount: 3, name: 'Maple Log', ilvl: 1, source: 'gather' },
    ]);
  });

  it('uses #id placeholder when partial is missing', () => {
    const raw = {
      item: { id: 1, name: 'X', ilvl: 1, craft: [{ ingredients: [{ id: 999, amount: 1 }] }] },
      partials: [],
    };
    expect(parseGarlandItem(raw)?.ingredients[0]).toEqual({
      id: 999, amount: 1, name: '#999', ilvl: 0, source: 'other',
    });
  });

  it('extracts gilShopNpcs from item.vendors intersected with npc partials', () => {
    const raw = {
      item: {
        id: 4566,
        name: 'Linen Cloth',
        ilvl: 50,
        vendors: [1000239, 1003252, 1001967],
      },
      partials: [
        { type: 'npc', id: 1000239, obj: { n: 'Jossy', l: 28 } },
        { type: 'npc', id: 1003252, obj: { n: 'Domitia', l: 52 } },
      ],
    };
    const out = parseGarlandItem(raw);
    expect(out?.gilShopNpcs).toEqual([
      { id: 1000239, name: 'Jossy', locationId: 28 },
      { id: 1003252, name: 'Domitia', locationId: 52 },
    ]);
    expect(out?.tradeShopNpcs).toEqual([]);
  });

  it('extracts tradeShopNpcs as (npc x currency) pairs from item.tradeShops', () => {
    const raw = {
      item: {
        id: 41671,
        name: 'Some Mat',
        ilvl: 600,
        tradeShops: [
          {
            shop: 'Auriana',
            npcs: [1018997],
            listings: [
              { item: [{ id: '41671', amount: 1 }], currency: [{ id: '28', amount: 25 }] },
            ],
          },
          {
            shop: 'Hismena',
            npcs: [1019100],
            listings: [
              { item: [{ id: '41671', amount: 1 }], currency: [{ id: '25199', amount: 100 }] },
              { item: [{ id: '41671', amount: 2 }], currency: [{ id: '25199', amount: 180 }] },
            ],
          },
        ],
      },
      partials: [
        { type: 'npc', id: 1018997, obj: { n: 'Auriana', l: 52 } },
        { type: 'npc', id: 1019100, obj: { n: 'Hismena', l: 478 } },
      ],
    };
    const out = parseGarlandItem(raw);
    expect(out?.tradeShopNpcs).toEqual([
      { id: 1018997, name: 'Auriana', locationId: 52, currencyItemId: 28 },
      { id: 1019100, name: 'Hismena', locationId: 478, currencyItemId: 25199 },
    ]);
    expect(out?.gilShopNpcs).toEqual([]);
  });

  it('defaults gilShopNpcs and tradeShopNpcs to [] when fields absent', () => {
    const raw = {
      item: { id: 1, name: 'Plain', ilvl: 1 },
      partials: [],
    };
    const out = parseGarlandItem(raw);
    expect(out?.gilShopNpcs).toEqual([]);
    expect(out?.tradeShopNpcs).toEqual([]);
  });

  it('caps gilShopNpcs at 5 entries', () => {
    const raw = {
      item: {
        id: 1, name: 'Popular', ilvl: 1,
        vendors: [101, 102, 103, 104, 105, 106, 107],
      },
      partials: [101, 102, 103, 104, 105, 106, 107].map((id) => ({
        type: 'npc', id, obj: { n: `NPC ${id}`, l: 10 },
      })),
    };
    const out = parseGarlandItem(raw);
    expect(out?.gilShopNpcs).toHaveLength(5);
    expect(out?.gilShopNpcs[0]).toEqual({ id: 101, name: 'NPC 101', locationId: 10 });
    expect(out?.gilShopNpcs[4]).toEqual({ id: 105, name: 'NPC 105', locationId: 10 });
  });

  it('skips tradeShop listings with non-numeric currency id', () => {
    const raw = {
      item: {
        id: 1, name: 'X', ilvl: 1,
        tradeShops: [{
          shop: 'Mystery',
          npcs: [200],
          listings: [
            { item: [{ id: '1', amount: 1 }], currency: [{ id: 'oops', amount: 5 }] },
            { item: [{ id: '1', amount: 1 }], currency: [{ id: '28', amount: 10 }] },
          ],
        }],
      },
      partials: [{ type: 'npc', id: 200, obj: { n: 'Mystery NPC', l: 1 } }],
    };
    const out = parseGarlandItem(raw);
    expect(out?.tradeShopNpcs).toEqual([
      { id: 200, name: 'Mystery NPC', locationId: 1, currencyItemId: 28 },
    ]);
  });
});
