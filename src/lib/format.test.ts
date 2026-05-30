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

  it('formats negative values with a leading minus and the same scale rules', () => {
    expect(fmtGil(-13_863.45)).toBe('-14k');
    expect(fmtGil(-14_630.4)).toBe('-15k');
    expect(fmtGil(-1234)).toBe('-1.2k');
    expect(fmtGil(-298.58)).toBe('-299');
    expect(fmtGil(-2_500_000)).toBe('-2.5M');
  });

  it('never renders a misleading negative zero', () => {
    expect(fmtGil(-0)).toBe('0');
    expect(fmtGil(-0.4)).toBe('0'); // rounds to zero — no "-0"
  });

  it('rounds sub-1k values to whole gil and never uses locale decimal commas', () => {
    // 247.175 gil/day must read as "247", not "247,175" (which looks like 247k)
    expect(fmtGil(247.175)).toBe('247');
    expect(fmtGil(950.6)).toBe('951');
  });
});
