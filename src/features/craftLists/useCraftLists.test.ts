import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchLists, fetchList, createListReq, updateListReq, deleteListReq } from './useCraftLists';

afterEach(() => { vi.restoreAllMocks(); });

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('useCraftLists fetch helpers', () => {
  it('fetchLists GETs /api/lists and unwraps lists', async () => {
    const spy = mockFetch(200, { lists: [{ id: 'a', name: 'A', itemCount: 1, createdAt: 0, updatedAt: 0 }] });
    const lists = await fetchLists();
    expect(spy).toHaveBeenCalledWith('/api/lists');
    expect(lists).toHaveLength(1);
  });

  it('fetchList GETs /api/lists/:id', async () => {
    mockFetch(200, { id: 'abc', ownerId: 'o', name: 'X', createdAt: 0, updatedAt: 0, items: [] });
    const list = await fetchList('abc');
    expect(list.id).toBe('abc');
  });

  it('createListReq POSTs and returns the new id', async () => {
    const spy = mockFetch(201, { id: 'new1' });
    const id = await createListReq('My List', [{ itemId: 1, itemName: 'A', qty: 1, isHq: false }]);
    expect(id).toBe('new1');
    expect(spy).toHaveBeenCalledWith('/api/lists', expect.objectContaining({ method: 'POST' }));
  });

  it('throws on a non-ok response', async () => {
    mockFetch(403, { error: 'nope' });
    await expect(fetchList('x')).rejects.toThrow();
  });
});
