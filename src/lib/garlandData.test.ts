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
});
