import { describe, it, expect } from 'vitest';
import { parseSalesCsv, type ParsedSale, dedupKey, matchSalesToPlan } from './parseSalesCsv';
import type { PlanItem } from './seedPlanner';

const SAMPLE_CSV = `Icon,Name,Quantity,Unit Price,World,Retainer,Sold At
,Open Book,1,89989,Phantom,El'jonah,24/05/2026 19:38:26
,Grade 4 Gemdraught of Dexterity,15,3997,Phantom,La'vane,24/05/2026 19:38:22
,Plain Hooded Tunic,1,2799998,Phantom,La'vane,24/05/2026 18:33:10`;

describe('parseSalesCsv', () => {
  it('parses well-formed CSV into typed rows', () => {
    const rows = parseSalesCsv(SAMPLE_CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual<ParsedSale>({
      name: 'Open Book',
      quantity: 1,
      unitPrice: 89989,
      world: 'Phantom',
      retainer: "El'jonah",
      soldAt: new Date(2026, 4, 24, 19, 38, 26).getTime(),
    });
  });

  it('parses quantity and price as integers', () => {
    const rows = parseSalesCsv(SAMPLE_CSV);
    expect(rows[1].quantity).toBe(15);
    expect(rows[1].unitPrice).toBe(3997);
  });

  it('returns empty array for empty input', () => {
    expect(parseSalesCsv('')).toEqual([]);
  });

  it('skips rows with missing name', () => {
    const csv = `Icon,Name,Quantity,Unit Price,World,Retainer,Sold At
,,1,100,Phantom,Ret,24/05/2026 10:00:00`;
    expect(parseSalesCsv(csv)).toEqual([]);
  });
});

describe('dedupKey', () => {
  it('produces a stable composite key', () => {
    const key = dedupKey({ name: 'Open Book', quantity: 1, unitPrice: 89989, soldAt: 1716576000000 } as ParsedSale);
    expect(key).toBe('open book|1|89989|1716576000000');
  });

  it('is case-insensitive on name', () => {
    const a = dedupKey({ name: 'OPEN BOOK', quantity: 1, unitPrice: 89989, soldAt: 100 } as ParsedSale);
    const b = dedupKey({ name: 'open book', quantity: 1, unitPrice: 89989, soldAt: 100 } as ParsedSale);
    expect(a).toBe(b);
  });
});

function mkItem(name: string, id = 'i1'): PlanItem {
  return { id, name, src: '', price: 0, cost: 0, perDay: 0, supply: null, active: true, earned: 0, units: 0 };
}

describe('matchSalesToPlan', () => {
  it('matches sale to plan item by case-insensitive name', () => {
    const items = [mkItem('Open Book', 'i1'), mkItem('Vanya Silk', 'i2')];
    const sale: ParsedSale = { name: 'open book', quantity: 1, unitPrice: 89989, world: 'Phantom', retainer: 'R', soldAt: 100 };
    const result = matchSalesToPlan([sale], items);
    expect(result[0].matchedItemId).toBe('i1');
  });

  it('returns undefined matchedItemId for unmatched sales', () => {
    const items = [mkItem('Open Book')];
    const sale: ParsedSale = { name: 'Zabuton Cushion', quantity: 1, unitPrice: 38899, world: 'Phantom', retainer: 'R', soldAt: 100 };
    const result = matchSalesToPlan([sale], items);
    expect(result[0].matchedItemId).toBeUndefined();
  });

  it('does not fuzzy match — exact name only', () => {
    const items = [mkItem('Grade 4 Gemdraughts (filler)')];
    const sale: ParsedSale = { name: 'Grade 4 Gemdraught of Dexterity', quantity: 15, unitPrice: 3997, world: 'Phantom', retainer: 'R', soldAt: 100 };
    const result = matchSalesToPlan([sale], items);
    expect(result[0].matchedItemId).toBeUndefined();
  });
});
