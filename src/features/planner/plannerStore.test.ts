import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlannerStore } from './plannerStore';

function resetStore() {
  usePlannerStore.getState().resetAll();
  // resetAll() uses the seed which sets startTs = Date.now(); also reset persist
  usePlannerStore.setState((s) => ({ ...s, log: [], daily: { date: '', done: {} } }));
}

describe('plannerStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordSale / reverseSale symmetry', () => {
    it('reverseSale fully undoes a recordSale (units, earned, treasury, log)', () => {
      const before = usePlannerStore.getState();
      const item = before.lanes.craft[0];
      const startCurrent = before.goal.current;
      const startUnits = item.units;
      const startEarned = item.earned;
      const startLogLen = before.log.length;

      usePlannerStore.getState().recordSale('craft', item.id);
      const mid = usePlannerStore.getState();
      const midItem = mid.lanes.craft.find((i) => i.id === item.id)!;
      expect(midItem.units).toBe(startUnits + 1);
      expect(midItem.earned).toBe(startEarned + item.price);
      expect(mid.goal.current).toBe(startCurrent + item.price);
      expect(mid.log.length).toBe(startLogLen + 1);

      usePlannerStore.getState().reverseSale('craft', item.id);
      const after = usePlannerStore.getState();
      const afterItem = after.lanes.craft.find((i) => i.id === item.id)!;
      expect(afterItem.units).toBe(startUnits);
      expect(afterItem.earned).toBe(startEarned);
      expect(after.goal.current).toBe(startCurrent);
      expect(after.log.length).toBe(startLogLen);
    });

    it('reverseSale is a no-op when units = 0', () => {
      const item = usePlannerStore.getState().lanes.gather[0];
      const beforeLog = usePlannerStore.getState().log.length;
      usePlannerStore.getState().reverseSale('gather', item.id);
      const after = usePlannerStore.getState();
      expect(after.lanes.gather.find((i) => i.id === item.id)!.units).toBe(0);
      expect(after.log.length).toBe(beforeLog);
    });
  });

  describe('dailyResetIfStale', () => {
    it('resets done when date is stale', () => {
      usePlannerStore.setState(() => ({ daily: { date: '2020-01-01', done: { d1: true, d2: true } } }));
      usePlannerStore.getState().dailyResetIfStale();
      const after = usePlannerStore.getState();
      expect(after.daily.date).toBe('2026-05-24');
      expect(after.daily.done).toEqual({});
    });

    it('no-ops when date is today', () => {
      usePlannerStore.setState(() => ({ daily: { date: '2026-05-24', done: { d1: true } } }));
      usePlannerStore.getState().dailyResetIfStale();
      const after = usePlannerStore.getState();
      expect(after.daily.done.d1).toBe(true);
    });
  });

  describe('deleteLogEntry', () => {
    it('decrements goal.current by the entry amount', () => {
      const start = usePlannerStore.getState().goal.current;
      usePlannerStore.getState().logGil(50_000);
      const entry = usePlannerStore.getState().log[0];
      expect(usePlannerStore.getState().goal.current).toBe(start + 50_000);
      usePlannerStore.getState().deleteLogEntry(entry.ts);
      expect(usePlannerStore.getState().goal.current).toBe(start);
      expect(usePlannerStore.getState().log.length).toBe(0);
    });
  });

  describe('addItem / removeItem / toggleActive', () => {
    it('adds a new item to a lane and tags it active with zero earned/units', () => {
      const beforeCount = usePlannerStore.getState().lanes.craft.length;
      usePlannerStore.getState().addItem('craft', { name: 'Test', src: 'test', price: 1000, perDay: 1, supply: null });
      const lanes = usePlannerStore.getState().lanes.craft;
      expect(lanes.length).toBe(beforeCount + 1);
      const added = lanes[lanes.length - 1];
      expect(added.name).toBe('Test');
      expect(added.active).toBe(true);
      expect(added.earned).toBe(0);
      expect(added.units).toBe(0);
    });

    it('removeItem deletes by id', () => {
      const target = usePlannerStore.getState().lanes.passive[0];
      usePlannerStore.getState().removeItem('passive', target.id);
      const after = usePlannerStore.getState().lanes.passive;
      expect(after.find((i) => i.id === target.id)).toBeUndefined();
    });

    it('toggleActive flips active flag', () => {
      const target = usePlannerStore.getState().lanes.content[0];
      const wasActive = target.active;
      usePlannerStore.getState().toggleActive('content', target.id);
      const after = usePlannerStore.getState().lanes.content.find((i) => i.id === target.id)!;
      expect(after.active).toBe(!wasActive);
    });
  });

  describe('logGil', () => {
    it('adds untagged log entry and increments treasury', () => {
      const start = usePlannerStore.getState().goal.current;
      usePlannerStore.getState().logGil(123_456);
      const s = usePlannerStore.getState();
      expect(s.goal.current).toBe(start + 123_456);
      expect(s.log[s.log.length - 1]).toMatchObject({ amount: 123_456, note: 'Manual entry' });
    });

    it('attributes to item when itemId is provided', () => {
      const item = usePlannerStore.getState().lanes.gather[0];
      const startEarned = item.earned;
      const startUnits = item.units;
      usePlannerStore.getState().logGil(10_000, { itemId: item.id });
      const after = usePlannerStore.getState().lanes.gather.find((i) => i.id === item.id)!;
      expect(after.earned).toBe(startEarned + 10_000);
      expect(after.units).toBe(startUnits + 1);
    });
  });
});
