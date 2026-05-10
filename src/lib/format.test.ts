import { describe, it, expect } from 'vitest';
import { fmtGil } from './format';

describe('fmtGil', () => {
  it('returns em-dash for null/undefined', () => {
    expect(fmtGil(null)).toBe('—');
    expect(fmtGil(undefined)).toBe('—');
  });
  it('formats sub-1k with grouping', () => {
    expect(fmtGil(950)).toBe('950');
  });
  it('formats 1k–10k with one decimal', () => {
    expect(fmtGil(1234)).toBe('1.2k');
  });
  it('formats 10k+ as integer thousands', () => {
    expect(fmtGil(15600)).toBe('16k');
  });
  it('formats 1M+ as M with up to two decimals, trimmed', () => {
    expect(fmtGil(1_500_000)).toBe('1.5M');
    expect(fmtGil(2_000_000)).toBe('2M');
    expect(fmtGil(1_234_567)).toBe('1.23M');
  });
});
