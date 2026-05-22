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

function page(
  rows: Array<{ row_id: number; deals: ReturnType<typeof deal>[]; uct?: number }>,
): RawSpecialShopPage {
  return { rows: rows.map((r) => ({ row_id: r.row_id, fields: { Item: r.deals, UseCurrencyType: r.uct } })) };
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

  it('resolves UseCurrencyType 4 (tomestones) via type-index mapping', () => {
    // costId = 1 is tomestone type index → maps to item 28 (Poetics)
    const raw = page([{ row_id: 1, uct: 4, deals: [
      deal({ recvIds: [29276, 0], recvCounts: [1, 1], costIds: [1, 0, 0], currencyCost: [170, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([
      { currency: 'poetics', itemId: 29276, receiveQty: 1, costPerUnit: 170, isHq: false },
    ]);
  });

  it('resolves UseCurrencyType 16 (scrips) via type-index mapping for small costIds', () => {
    // costId = 1 is scrip type index → maps to item 25199 (White Crafters' Scrip)
    const raw = page([{ row_id: 1, uct: 16, deals: [
      deal({ recvIds: [27811, 0], recvCounts: [1, 1], costIds: [1, 0, 0], currencyCost: [500, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([
      { currency: 'whiteCrafter', itemId: 27811, receiveQty: 1, costPerUnit: 500, isHq: false },
    ]);
  });

  it('falls through to direct lookup for large costIds in scrip shops', () => {
    // costId = 29028 is a direct item ref (raid token), not a scrip index — should be skipped
    const raw = page([{ row_id: 1, uct: 16, deals: [
      deal({ recvIds: [12345, 0], recvCounts: [1, 1], costIds: [29028, 0, 0], currencyCost: [8, 0, 0] }),
    ]}]);
    // 29028 is not in CURRENCIES_BY_ID → dropped
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops tomestone deals with unknown type index', () => {
    const raw = page([{ row_id: 1, uct: 4, deals: [
      deal({ recvIds: [29276, 0], recvCounts: [1, 1], costIds: [99, 0, 0], currencyCost: [170, 0, 0] }),
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
