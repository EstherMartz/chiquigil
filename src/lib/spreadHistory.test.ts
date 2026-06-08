import { describe, it, expect } from 'vitest';
import {
  spreadKey, foldSpreadCycle, stabilityLabel, fmtAge, deriveWindow,
  type SpreadHistoryEntry,
} from './spreadHistory';

const H = 3_600_000; // ms per hour

describe('spreadKey', () => {
  it('joins item id and world', () => {
    expect(spreadKey(5057, 'Omega')).toBe('5057|Omega');
  });
});

describe('foldSpreadCycle', () => {
  it('first detection starts at cycle 1 and stamps firstSeenAt', () => {
    const next = foldSpreadCycle(undefined, true, 1000);
    expect(next).toEqual({ firstSeenAt: 1000, cycleCount: 1 });
  });

  it('consecutive detection increments and keeps firstSeenAt', () => {
    const prev: SpreadHistoryEntry = { firstSeenAt: 1000, cycleCount: 1 };
    expect(foldSpreadCycle(prev, true, 9999)).toEqual({ firstSeenAt: 1000, cycleCount: 2 });
  });

  it('caps cycleCount at 20', () => {
    const prev: SpreadHistoryEntry = { firstSeenAt: 1000, cycleCount: 20 };
    const next = foldSpreadCycle(prev, true, 9999);
    expect(next?.cycleCount).toBe(20);
  });

  it('a missed cycle drops the entry (resets to New on next detection)', () => {
    const prev: SpreadHistoryEntry = { firstSeenAt: 1000, cycleCount: 8 };
    expect(foldSpreadCycle(prev, false, 9999)).toBeUndefined();
    expect(foldSpreadCycle(undefined, true, 12000)).toEqual({ firstSeenAt: 12000, cycleCount: 1 });
  });
});

describe('stabilityLabel', () => {
  it('1 cycle → New', () => expect(stabilityLabel(1)).toBe('New'));
  it('2 cycles → Volatile', () => expect(stabilityLabel(2)).toBe('Volatile'));
  it('4 cycles → Volatile', () => expect(stabilityLabel(4)).toBe('Volatile'));
  it('5 cycles → Stable', () => expect(stabilityLabel(5)).toBe('Stable'));
  it('20 cycles → Stable', () => expect(stabilityLabel(20)).toBe('Stable'));
});

describe('fmtAge', () => {
  it('under a minute → just now', () => expect(fmtAge(0, 30_000)).toBe('just now'));
  it('minutes', () => expect(fmtAge(0, 5 * 60_000)).toBe('5m ago'));
  it('hours', () => expect(fmtAge(0, 4 * H)).toBe('4h ago'));
  it('days', () => expect(fmtAge(0, 50 * H)).toBe('2d ago'));
});

describe('deriveWindow', () => {
  it('no entry → New, fresh tone', () => {
    const w = deriveWindow(undefined, 1000);
    expect(w.label).toBe('New');
    expect(w.ageText).toBe('just now');
    expect(w.tone).toBe('green');
  });
  it('fresh + stable → green', () => {
    const w = deriveWindow({ firstSeenAt: 0, cycleCount: 8 }, 4 * H);
    expect(w.label).toBe('Stable');
    expect(w.tone).toBe('green');
    expect(w.ageText).toBe('4h ago');
  });
  it('fresh + volatile → amber', () => {
    const w = deriveWindow({ firstSeenAt: 0, cycleCount: 3 }, 1 * H);
    expect(w.label).toBe('Volatile');
    expect(w.tone).toBe('amber');
  });
  it('old (>6h) → grey regardless of label', () => {
    const w = deriveWindow({ firstSeenAt: 0, cycleCount: 8 }, 14 * H);
    expect(w.label).toBe('Stable');
    expect(w.tone).toBe('grey');
  });
  it('tooltip reports cycles seen', () => {
    const w = deriveWindow({ firstSeenAt: 0, cycleCount: 8 }, 4 * H);
    expect(w.tooltip).toBe('First seen 4h ago · Stable (seen in 8 of last 20 scans)');
  });
});
