import { describe, it, expect, beforeEach } from 'vitest';
import { useBatchTrackerStore, defaultBatchTracker } from './batchTrackerStore';

beforeEach(() => {
  localStorage.clear();
  useBatchTrackerStore.setState(defaultBatchTracker());
});

const mockItems = [
  { id: 100, name: 'Widget', materialCost: 500, estimatedPrice: 1200, hq: true, actualPrice: null, soldAt: null },
  { id: 200, name: 'Gadget', materialCost: 300, estimatedPrice: 800, hq: false, actualPrice: null, soldAt: null },
];

describe('batchTrackerStore', () => {
  it('starts empty', () => {
    expect(useBatchTrackerStore.getState().batches).toEqual([]);
  });

  it('saveBatch creates a new active batch', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const batches = useBatchTrackerStore.getState().batches;
    expect(batches).toHaveLength(1);
    expect(batches[0].status).toBe('active');
    expect(batches[0].budget).toBe(5_000_000);
    expect(batches[0].items).toHaveLength(2);
    expect(batches[0].items[0].actualPrice).toBeNull();
  });

  it('saveBatch prepends newest first', () => {
    useBatchTrackerStore.getState().saveBatch(1_000_000, [mockItems[0]]);
    useBatchTrackerStore.getState().saveBatch(2_000_000, [mockItems[1]]);
    const batches = useBatchTrackerStore.getState().batches;
    expect(batches[0].budget).toBe(2_000_000);
    expect(batches[1].budget).toBe(1_000_000);
  });

  it('setActualPrice updates a specific item', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const batchId = useBatchTrackerStore.getState().batches[0].batchId;
    useBatchTrackerStore.getState().setActualPrice(batchId, 100, 1500);
    const item = useBatchTrackerStore.getState().batches[0].items[0];
    expect(item.actualPrice).toBe(1500);
    expect(item.soldAt).toBeTruthy();
  });

  it('clearActualPrice resets price and soldAt', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const batchId = useBatchTrackerStore.getState().batches[0].batchId;
    useBatchTrackerStore.getState().setActualPrice(batchId, 100, 1500);
    useBatchTrackerStore.getState().clearActualPrice(batchId, 100);
    const item = useBatchTrackerStore.getState().batches[0].items[0];
    expect(item.actualPrice).toBeNull();
    expect(item.soldAt).toBeNull();
  });

  it('closeBatch sets status to closed', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const batchId = useBatchTrackerStore.getState().batches[0].batchId;
    useBatchTrackerStore.getState().closeBatch(batchId);
    expect(useBatchTrackerStore.getState().batches[0].status).toBe('closed');
  });

  it('deleteBatch removes the batch', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const batchId = useBatchTrackerStore.getState().batches[0].batchId;
    useBatchTrackerStore.getState().deleteBatch(batchId);
    expect(useBatchTrackerStore.getState().batches).toHaveLength(0);
  });

  it('persists to localStorage', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const raw = localStorage.getItem('ffxiv-helper:batchTracker');
    expect(raw).toBeTruthy();
    expect(raw!).toContain('"budget":5000000');
  });
});
