import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  abbr, abbrParts, elapsedDays, eta, fmt, pct, rate, supClass,
  todayStr, todaySum, weekSum, type LogEntry,
} from './plannerStats';

const DAY = 864e5;

describe('plannerStats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('todayStr', () => {
    it('returns YYYY-MM-DD in UTC', () => {
      expect(todayStr()).toBe('2026-05-24');
    });
  });

  describe('todaySum', () => {
    it('sums only entries from today', () => {
      const log: LogEntry[] = [
        { ts: new Date('2026-05-23T23:59:59Z').getTime(), amount: 100, note: '' },
        { ts: new Date('2026-05-24T00:00:01Z').getTime(), amount: 50, note: '' },
        { ts: new Date('2026-05-24T11:30:00Z').getTime(), amount: 200, note: '' },
        { ts: new Date('2026-05-25T00:00:01Z').getTime(), amount: 999, note: '' },
      ];
      expect(todaySum(log)).toBe(250);
    });

    it('returns 0 for empty log', () => {
      expect(todaySum([])).toBe(0);
    });
  });

  describe('weekSum', () => {
    it('includes entries within the last 7 days (exclusive of exact 7d boundary)', () => {
      const now = Date.now();
      const log: LogEntry[] = [
        { ts: now - 6 * DAY, amount: 100, note: '' },
        { ts: now - (7 * DAY - 1), amount: 50, note: '' },
        { ts: now - 7 * DAY, amount: 999, note: '' }, // exactly 7d → excluded
        { ts: now - 8 * DAY, amount: 999, note: '' },
      ];
      expect(weekSum(log, now)).toBe(150);
    });
  });

  describe('elapsedDays', () => {
    it('returns 1 for startTs equal to now', () => {
      expect(elapsedDays(Date.now())).toBe(1);
    });
    it('returns 3 for a 2.5 day window (ceil)', () => {
      const now = Date.now();
      expect(elapsedDays(now - 2.5 * DAY, now)).toBe(3);
    });
  });

  describe('rate', () => {
    it('returns 0 for weekSum 0 (avoids NaN)', () => {
      expect(rate(0, 5)).toBe(0);
    });
    it('divides by min(7, days)', () => {
      expect(rate(700, 10)).toBe(100);  // min(7, 10) = 7
      expect(rate(300, 3)).toBe(100);   // min(7, 3) = 3
    });
  });

  describe('eta', () => {
    it('returns null when rate is 0', () => {
      expect(eta(1000, 0)).toBe(null);
    });
    it('ceils remaining / rate', () => {
      expect(eta(1000, 300)).toBe(4); // 3.33 → 4
    });
  });

  describe('pct', () => {
    it('caps at 100', () => {
      expect(pct(150, 100)).toBe(100);
    });
    it('returns 0 for zero target', () => {
      expect(pct(50, 0)).toBe(0);
    });
    it('computes ratio', () => {
      expect(pct(25, 100)).toBe(25);
    });
  });

  describe('abbr', () => {
    it.each([
      [42, '42'],
      [999, '999'],
      [1_000, '1K'],
      [100_000, '100K'],
      [1_000_000, '1M'],
      [10_500_000, '10.5M'],
      [1_250_000_000, '1.25B'],
    ])('abbr(%i) = %s', (input, expected) => {
      expect(abbr(input)).toBe(expected);
    });
  });

  describe('abbrParts', () => {
    it('returns million parts', () => {
      expect(abbrParts(10_000_000)).toEqual(['10', 'M gil']);
    });
    it('returns K parts', () => {
      expect(abbrParts(50_000)).toEqual(['50', 'K gil']);
    });
    it('returns raw under 1k', () => {
      expect(abbrParts(500)).toEqual(['500', 'gil']);
    });
  });

  describe('fmt', () => {
    it('rounds and formats with commas', () => {
      expect(fmt(1234567.6)).toBe('1,234,568');
    });
  });

  describe('supClass', () => {
    it.each([
      [null, ''],
      [0, 'low'],
      [1.99, 'low'],
      [2, 'mid'],
      [7, 'mid'],
      [7.01, 'high'],
      [50, 'high'],
    ] as const)('supClass(%s) = %s', (input, expected) => {
      expect(supClass(input)).toBe(expected);
    });
  });
});
