import { describe, it, expect } from 'vitest';
import { summarizeHistory, classifyValue, MIN_SALES } from './fairValue';
import type { HistoryEntry } from '../../lib/universalisHistory';

const E = (pricePerUnit: number, quantity = 1, hq = false): HistoryEntry => ({
  timestamp: 0, pricePerUnit, quantity, hq,
});

describe('summarizeHistory', () => {
  it('computes count, mean, stdev, vwap and median', () => {
    const s = summarizeHistory([E(100), E(200), E(300)]);
    expect(s.count).toBe(3);
    expect(s.mean).toBe(200);
    expect(s.median).toBe(200);
    // population stdev of [100,200,300] = sqrt(((100²+0+100²))/3) ≈ 81.65
    expect(s.stdev).toBeCloseTo(81.65, 1);
    expect(s.vwap).toBe(200);
  });

  it('quantity-weights the vwap', () => {
    const s = summarizeHistory([E(100, 9), E(200, 1)]);
    expect(s.vwap).toBe(110); // (900 + 200) / 10
  });

  it('returns nulls for empty input', () => {
    expect(summarizeHistory([])).toEqual({ count: 0, mean: null, stdev: null, vwap: null, median: null });
  });
});

describe('classifyValue', () => {
  const liquid = { count: MIN_SALES, mean: 1000, stdev: 100 };

  it('flags cheap on a low z-score and composes an under-fair verdict', () => {
    const sig = classifyValue({ current: 800, ...liquid }); // z = -2
    expect(sig.valuation).toBe('cheap');
    expect(sig.zScore).toBe(-2);
    expect(sig.pctVsFair).toBeCloseTo(-0.2);
    expect(sig.confident).toBe(true);
    expect(sig.verdict).toMatch(/under fair value/);
    expect(sig.verdict).toMatch(/accumulate/);
  });

  it('flags rich on a high z-score', () => {
    const sig = classifyValue({ current: 1200, ...liquid }); // z = +2
    expect(sig.valuation).toBe('rich');
    expect(sig.verdict).toMatch(/over fair value/);
  });

  it('calls fair inside the band', () => {
    expect(classifyValue({ current: 1010, ...liquid }).valuation).toBe('fair');
  });

  it('is unknown (not confident) below the sales floor', () => {
    const sig = classifyValue({ current: 800, mean: 1000, stdev: 100, count: 3 });
    expect(sig.confident).toBe(false);
    expect(sig.valuation).toBe('unknown');
    expect(sig.verdict).toMatch(/few sales/i);
  });

  it('uses the VWAP band as an OR signal for cheap/rich', () => {
    // z is only -0.5 (not past Z_CHEAP) but current is below bandLo → cheap
    const sig = classifyValue({ current: 950, mean: 1000, stdev: 100, count: MIN_SALES, bandLo: 980, bandHi: 1020 });
    expect(sig.valuation).toBe('cheap');
  });

  it('tags volatility from the coefficient of variation', () => {
    expect(classifyValue({ current: 1000, mean: 1000, stdev: 50, count: MIN_SALES }).volatility).toBe('low');
    expect(classifyValue({ current: 1000, mean: 1000, stdev: 250, count: MIN_SALES }).volatility).toBe('med');
    expect(classifyValue({ current: 1000, mean: 1000, stdev: 600, count: MIN_SALES }).volatility).toBe('high');
  });

  it('flags below-floor and near-ceiling', () => {
    const below = classifyValue({ current: 700, mean: 1000, stdev: 100, count: MIN_SALES, floor: 800 });
    expect(below.belowFloor).toBe(true);
    expect(below.verdict).toMatch(/below craft cost/);

    const near = classifyValue({ current: 990, mean: 1000, stdev: 100, count: MIN_SALES, ceiling: 1000 });
    expect(near.nearCeiling).toBe(true);
    expect(near.verdict).toMatch(/vendor ceiling/);
  });
});
