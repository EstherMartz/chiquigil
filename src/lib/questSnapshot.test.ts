import { describe, it, expect } from 'vitest';
import { parseGcSupply } from './questSnapshot';

describe('parseGcSupply', () => {
  it('returns [] for empty input', () => {
    expect(parseGcSupply({})).toEqual([]);
  });

  it('parses a single level + category with one item', () => {
    const raw = { '5': { '8': [{ itemId: 3742, count: 1, reward: { xp: 420, seals: 8 } }] } };
    const out = parseGcSupply(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      questId: 508,
      questName: 'GC Supply Lv.5',
      categoryName: 'CRP',
      level: 5,
      requiredItems: [{ itemId: 3742, itemName: '', qty: 1 }],
    });
  });

  it('maps category IDs to class names', () => {
    const raw = {
      '1': {
        '9': [{ itemId: 100, count: 1, reward: { xp: 1, seals: 1 } }],
        '13': [{ itemId: 200, count: 1, reward: { xp: 1, seals: 1 } }],
        '16': [{ itemId: 300, count: 10, reward: { xp: 1, seals: 1 } }],
      },
    };
    const out = parseGcSupply(raw);
    expect(out.map((q) => q.categoryName).sort()).toEqual(['BSM', 'MIN', 'WVR']);
  });

  it('skips unknown category IDs', () => {
    const raw = { '1': { '99': [{ itemId: 100, count: 1, reward: { xp: 1, seals: 1 } }] } };
    expect(parseGcSupply(raw)).toEqual([]);
  });

  it('skips items with zero itemId or count', () => {
    const raw = {
      '1': {
        '8': [
          { itemId: 0, count: 1, reward: { xp: 1, seals: 1 } },
          { itemId: 100, count: 0, reward: { xp: 1, seals: 1 } },
          { itemId: 200, count: 3, reward: { xp: 1, seals: 1 } },
        ],
      },
    };
    const out = parseGcSupply(raw);
    expect(out).toHaveLength(1);
    expect(out[0].requiredItems).toEqual([{ itemId: 200, itemName: '', qty: 3 }]);
  });

  it('groups multiple items under one quest entry', () => {
    const raw = {
      '10': {
        '14': [
          { itemId: 500, count: 1, reward: { xp: 100, seals: 10 } },
          { itemId: 501, count: 2, reward: { xp: 100, seals: 10 } },
        ],
      },
    };
    const out = parseGcSupply(raw);
    expect(out).toHaveLength(1);
    expect(out[0].requiredItems).toHaveLength(2);
    expect(out[0].categoryName).toBe('ALC');
  });
});
