import { describe, it, expect, vi } from 'vitest';
import { chunkIds, fetchInBatches } from './universalisBulk';

describe('chunkIds', () => {
  it('splits into even-sized chunks', () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns [] for empty input', () => {
    expect(chunkIds([], 10)).toEqual([]);
  });

  it('returns one chunk when size >= length', () => {
    expect(chunkIds([1, 2], 10)).toEqual([[1, 2]]);
  });
});

describe('fetchInBatches', () => {
  it('runs no more than `concurrency` requests in flight at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchOne = vi.fn().mockImplementation(async (chunk: number[]) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return Object.fromEntries(chunk.map((id) => [id, { price: id * 10 }]));
    });
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = await fetchInBatches(ids, fetchOne, { chunkSize: 2, concurrency: 3 });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(Object.keys(out.data)).toHaveLength(10);
    expect(out.errors).toEqual([]);
  });

  it('records errored chunks and continues', async () => {
    const fetchOne = vi.fn().mockImplementation(async (chunk: number[]) => {
      if (chunk.includes(3)) throw new Error('boom');
      return Object.fromEntries(chunk.map((id) => [id, { price: id }]));
    });
    const out = await fetchInBatches([1, 2, 3, 4, 5], fetchOne, { chunkSize: 2, concurrency: 2 });
    expect(out.errors).toEqual([[3, 4]]);
    expect(Object.keys(out.data).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 5]);
  });

  it('reports progress per completed chunk', async () => {
    const fetchOne = vi.fn().mockResolvedValue({});
    const seen: number[] = [];
    await fetchInBatches([1, 2, 3, 4], fetchOne, { chunkSize: 2, concurrency: 2, onProgress: (n) => seen.push(n) });
    expect(seen.sort()).toEqual([1, 2]);
  });
});
