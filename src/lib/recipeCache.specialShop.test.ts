import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedSpecialShop,
  putCachedSpecialShop,
  clearSpecialShopCache,
  getSpecialShopUpdatedAt,
} from './recipeCache';
import type { SpecialShopSnapshot } from './specialShopSnapshot';

beforeEach(async () => {
  await clearSpecialShopCache();
});

function mkSnapshot(): SpecialShopSnapshot {
  return {
    byCurrency: new Map([
      ['poetics', [
        { itemId: 4729, receiveQty: 1, costPerUnit: 1, isHq: false },
        { itemId: 4551, receiveQty: 99, costPerUnit: 1.5, isHq: false },
      ]],
      ['mgp', [
        { itemId: 9999, receiveQty: 1, costPerUnit: 50000, isHq: true },
      ]],
    ]),
  };
}

describe('recipeCache specialShop store', () => {
  it('returns undefined when no snapshot cached', async () => {
    expect(await getCachedSpecialShop()).toBeUndefined();
    expect(await getSpecialShopUpdatedAt()).toBeUndefined();
  });

  it('round-trips a SpecialShopSnapshot preserving Map semantics', async () => {
    await putCachedSpecialShop(mkSnapshot());
    const out = await getCachedSpecialShop();
    expect(out).toBeDefined();
    expect(out!.byCurrency).toBeInstanceOf(Map);
    expect(out!.byCurrency.get('poetics')).toHaveLength(2);
    expect(out!.byCurrency.get('poetics')![0]).toEqual({ itemId: 4729, receiveQty: 1, costPerUnit: 1, isHq: false });
    expect(out!.byCurrency.get('mgp')).toHaveLength(1);
    expect(out!.byCurrency.get('mgp')![0].isHq).toBe(true);
  });

  it('sets updatedAt timestamp on put', async () => {
    const before = Date.now();
    await putCachedSpecialShop(mkSnapshot());
    const ts = await getSpecialShopUpdatedAt();
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it('clear empties the store + drops the timestamp', async () => {
    await putCachedSpecialShop(mkSnapshot());
    await clearSpecialShopCache();
    expect(await getCachedSpecialShop()).toBeUndefined();
    expect(await getSpecialShopUpdatedAt()).toBeUndefined();
  });
});
