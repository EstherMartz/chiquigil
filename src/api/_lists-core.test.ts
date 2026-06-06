// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { handleCreateList, handleGetList, handleListLists, handleUpdateList, handleDeleteList } from './_lists-core';

let store: CraftStore;
beforeEach(async () => { store = await openCraftStore(':memory:'); });

const BODY = {
  name: 'Set of Fending',
  items: [
    { itemId: 100, itemName: 'Gunblade', qty: 1, isHq: false },
    { itemId: 200, itemName: 'Surcoat', qty: 2, isHq: true },
  ],
};

describe('_lists-core', () => {
  it('creates, lists, gets, updates, deletes', async () => {
    const created = await handleCreateList(store, 'owner1', BODY);
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;

    const listed = await handleListLists(store, 'owner1');
    expect(listed.status).toBe(200);
    expect((listed.body as { lists: unknown[] }).lists).toHaveLength(1);

    const got = await handleGetList(store, id);
    expect(got.status).toBe(200);
    expect((got.body as { name: string }).name).toBe('Set of Fending');

    const updated = await handleUpdateList(store, id, 'owner1', { name: 'Renamed' });
    expect(updated.status).toBe(200);
    expect((await handleGetList(store, id)).body).toMatchObject({ name: 'Renamed' });

    const del = await handleDeleteList(store, id, 'owner1');
    expect(del.status).toBe(200);
    expect((await handleGetList(store, id)).status).toBe(404);
  });

  it('rejects an empty or unnamed list with 400', async () => {
    expect((await handleCreateList(store, 'o', { name: '', items: BODY.items })).status).toBe(400);
    expect((await handleCreateList(store, 'o', { name: 'X', items: [] })).status).toBe(400);
  });

  it('rejects invalid item quantities', async () => {
    const bad = { name: 'X', items: [{ itemId: 1, itemName: 'A', qty: 0, isHq: false }] };
    expect((await handleCreateList(store, 'o', bad)).status).toBe(400);
  });

  it('blocks non-owner update/delete with 403', async () => {
    const id = (await handleCreateList(store, 'owner1', BODY)).body as { id: string };
    expect((await handleUpdateList(store, id.id, 'intruder', { name: 'Z' })).status).toBe(403);
    expect((await handleDeleteList(store, id.id, 'intruder')).status).toBe(403);
  });

  it('404s when getting a missing list', async () => {
    expect((await handleGetList(store, 'nope')).status).toBe(404);
  });
});
