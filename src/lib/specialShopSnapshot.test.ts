import { describe, it, expect } from 'vitest';
import { parseSpecialShopPage, type RawSpecialShopPage } from './specialShopSnapshot';
import type { CurrencyId } from './currencies';

const CURRENCIES_BY_ID = new Map<number, CurrencyId>([
  [28, 'poetics'],
  [29, 'mgp'],
  [25199, 'whiteCrafter'],
]);

function deal(opts: Partial<{
  recvIds: [number, number]; recvCounts: [number, number]; recvHq: [boolean, boolean];
  costIds: [number, number, number]; currencyCost: [number, number, number];
}>) {
  return {
    'Item@as(raw)': opts.recvIds ?? [0, 0],
    ReceiveCount: opts.recvCounts ?? [1, 1],
    ReceiveHq: opts.recvHq ?? [false, false],
    'ItemCost@as(raw)': opts.costIds ?? [0, 0, 0],
    CurrencyCost: opts.currencyCost ?? [0, 0, 0],
  };
}

function page(rows: Array<{ row_id: number; deals: ReturnType<typeof deal>[] }>): RawSpecialShopPage {
  return { rows: rows.map((r) => ({ row_id: r.row_id, fields: { Item: r.deals } })) };
}

describe('parseSpecialShopPage', () => {
  it('returns [] for an empty page', () => {
    expect(parseSpecialShopPage({ rows: [] }, CURRENCIES_BY_ID)).toEqual([]);
    expect(parseSpecialShopPage({}, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('emits a pure-currency single-receive deal', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], recvCounts: [1, 1], recvHq: [false, false], costIds: [28, 0, 0], currencyCost: [5, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([
      { currency: 'poetics', itemId: 4729, receiveQty: 1, costPerUnit: 5, isHq: false },
    ]);
  });

  it('normalizes per-unit cost for stack purchases', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4551, 0], recvCounts: [99, 1], costIds: [25199, 0, 0], currencyCost: [1500, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([
      { currency: 'whiteCrafter', itemId: 4551, receiveQty: 99, costPerUnit: 1500 / 99, isHq: false },
    ]);
  });

  it('captures isHq from the ReceiveHq flag', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [12345, 0], recvHq: [true, false], costIds: [29, 0, 0], currencyCost: [10000, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)[0].isHq).toBe(true);
  });

  it('drops deals with no receive item', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [0, 0], costIds: [28, 0, 0], currencyCost: [5, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops deals with no cost item', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], costIds: [0, 0, 0], currencyCost: [0, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops deals whose cost item is not a curated currency', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], costIds: [9999, 0, 0], currencyCost: [5, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops hybrid (multi-cost) deals — cost slots 1 or 2 also have items', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], costIds: [28, 1, 0], currencyCost: [5, 100, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops multi-receive deals — receive slot 1 also has an item', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 4730], recvCounts: [1, 1], costIds: [28, 0, 0], currencyCost: [5, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops deals with receiveCount = 0 (div-by-zero guard)', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], recvCounts: [0, 1], costIds: [28, 0, 0], currencyCost: [5, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops deals with currencyCost = 0', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], recvCounts: [1, 1], costIds: [28, 0, 0], currencyCost: [0, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('emits multiple entries from a single row when multiple deal slots qualify', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], recvCounts: [1, 1], costIds: [28, 0, 0], currencyCost: [5, 0, 0] }),
      deal({ recvIds: [4730, 0], recvCounts: [1, 1], costIds: [28, 0, 0], currencyCost: [10, 0, 0] }),
      deal({ recvIds: [4731, 0], recvCounts: [1, 1], costIds: [29, 0, 0], currencyCost: [50000, 0, 0] }),
    ]}]);
    const out = parseSpecialShopPage(raw, CURRENCIES_BY_ID);
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.itemId)).toEqual([4729, 4730, 4731]);
  });
});
