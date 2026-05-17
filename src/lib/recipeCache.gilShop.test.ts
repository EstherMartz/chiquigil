import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedVendorSnapshot,
  putCachedVendorSnapshot,
  clearVendorSnapshotCache,
  getVendorSnapshotUpdatedAt,
} from './recipeCache';

beforeEach(async () => {
  // Reset between tests: clear our store so we start empty.
  await clearVendorSnapshotCache();
});

describe('recipeCache gilShop store', () => {
  it('returns undefined when no snapshot cached', async () => {
    expect(await getCachedVendorSnapshot()).toBeUndefined();
    expect(await getVendorSnapshotUpdatedAt()).toBeUndefined();
  });

  it('round-trips a Map<itemId, price>', async () => {
    const m = new Map<number, number>([[5, 9], [4594, 108]]);
    await putCachedVendorSnapshot(m);
    const out = await getCachedVendorSnapshot();
    expect(out).toBeInstanceOf(Map);
    expect(out!.get(5)).toBe(9);
    expect(out!.get(4594)).toBe(108);
    expect(out!.size).toBe(2);
  });

  it('sets updatedAt timestamp on put', async () => {
    const before = Date.now();
    await putCachedVendorSnapshot(new Map([[1, 1]]));
    const ts = await getVendorSnapshotUpdatedAt();
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it('clear empties the store + drops the timestamp', async () => {
    await putCachedVendorSnapshot(new Map([[1, 1]]));
    await clearVendorSnapshotCache();
    expect(await getCachedVendorSnapshot()).toBeUndefined();
    expect(await getVendorSnapshotUpdatedAt()).toBeUndefined();
  });
});
