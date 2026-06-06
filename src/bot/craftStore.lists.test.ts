import { describe, it, expect, beforeEach } from 'vitest';
import { openCraftStore, type CraftStore } from './craftStore';

let store: CraftStore;

beforeEach(async () => {
  store = await openCraftStore(':memory:');
});

const ITEMS = [
  { itemId: 100, itemName: 'Gunblade', qty: 1, isHq: false },
  { itemId: 200, itemName: 'Surcoat of Fending', qty: 2, isHq: true },
];

describe('craftStore lists', () => {
  it('creates a list and reads it back with items in order', async () => {
    const id = await store.createList('owner1', 'Set of Fending', ITEMS);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const list = await store.getList(id);
    expect(list).not.toBeNull();
    expect(list!.name).toBe('Set of Fending');
    expect(list!.ownerId).toBe('owner1');
    expect(list!.items).toHaveLength(2);
    expect(list!.items[0]).toMatchObject({ itemId: 100, qty: 1, isHq: false, position: 0 });
    expect(list!.items[1]).toMatchObject({ itemId: 200, qty: 2, isHq: true, position: 1 });
  });

  it('lists summaries for an owner with item counts', async () => {
    await store.createList('owner1', 'A', ITEMS);
    await store.createList('owner1', 'B', [ITEMS[0]]);
    await store.createList('owner2', 'C', ITEMS);

    const summaries = await store.listListsForOwner('owner1');
    expect(summaries).toHaveLength(2);
    const byName = Object.fromEntries(summaries.map((s) => [s.name, s]));
    expect(byName.A.itemCount).toBe(2);
    expect(byName.B.itemCount).toBe(1);
  });

  it('updates name only for the owner', async () => {
    const id = await store.createList('owner1', 'Old', ITEMS);
    expect(await store.updateListMeta(id, 'owner2', 'Hacked')).toBe(false);
    expect(await store.updateListMeta(id, 'owner1', 'New')).toBe(true);
    expect((await store.getList(id))!.name).toBe('New');
  });

  it('replaces items only for the owner', async () => {
    const id = await store.createList('owner1', 'L', ITEMS);
    expect(await store.replaceListItems(id, 'owner2', [ITEMS[0]])).toBe(false);
    const ok = await store.replaceListItems(id, 'owner1', [
      { itemId: 300, itemName: 'Ring of Fending', qty: 5, isHq: false },
    ]);
    expect(ok).toBe(true);
    const list = await store.getList(id);
    expect(list!.items).toHaveLength(1);
    expect(list!.items[0]).toMatchObject({ itemId: 300, qty: 5, position: 0 });
  });

  it('deletes a list and its items only for the owner', async () => {
    const id = await store.createList('owner1', 'L', ITEMS);
    expect(await store.deleteList(id, 'owner2')).toBe(false);
    expect(await store.deleteList(id, 'owner1')).toBe(true);
    expect(await store.getList(id)).toBeNull();
  });
});
