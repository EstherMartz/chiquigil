import { describe, it, expect } from 'vitest';
import { parseGilShopPage, type RawGilShopPage } from './vendorShopSnapshot';

function page(rows: Array<{ row_id: number; itemId: number; price: number }>): RawGilShopPage {
  return {
    rows: rows.map((r, i) => ({
      row_id: r.row_id,
      subrow_id: i,
      fields: {
        Item: { value: r.itemId, fields: { PriceMid: r.price } },
      },
    })),
  };
}

describe('parseGilShopPage', () => {
  it('returns [] for an empty page', () => {
    expect(parseGilShopPage({ rows: [] })).toEqual([]);
    expect(parseGilShopPage({})).toEqual([]);
  });

  it('extracts { itemId, price } entries', () => {
    const raw = page([
      { row_id: 262144, itemId: 4594, price: 108 },
      { row_id: 262145, itemId: 4595, price: 108 },
    ]);
    expect(parseGilShopPage(raw)).toEqual([
      { itemId: 4594, price: 108 },
      { itemId: 4595, price: 108 },
    ]);
  });

  it('drops rows where price <= 0', () => {
    const raw = page([
      { row_id: 1, itemId: 100, price: 0 },
      { row_id: 2, itemId: 101, price: -5 },
      { row_id: 3, itemId: 102, price: 50 },
    ]);
    expect(parseGilShopPage(raw)).toEqual([{ itemId: 102, price: 50 }]);
  });

  it('drops rows where itemId <= 0', () => {
    const raw = page([
      { row_id: 1, itemId: 0, price: 100 },
      { row_id: 2, itemId: -1, price: 200 },
      { row_id: 3, itemId: 5, price: 9 },
    ]);
    expect(parseGilShopPage(raw)).toEqual([{ itemId: 5, price: 9 }]);
  });

  it('handles missing Item field gracefully', () => {
    const raw: RawGilShopPage = { rows: [
      { row_id: 1, subrow_id: 0, fields: {} },
    ] };
    expect(parseGilShopPage(raw)).toEqual([]);
  });
});
