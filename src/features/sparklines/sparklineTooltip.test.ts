import { describe, it, expect } from 'vitest';
import { formatSparklineTooltip } from './sparklineTooltip';

describe('formatSparklineTooltip', () => {
  it('formats 7 days with values and nulls', () => {
    const result = formatSparklineTooltip(
      [1700, 1650, null, 1720, 1800, 1750, 1780],
      new Date('2026-05-23T12:00:00'),
    );
    expect(result).toContain('1700');
    expect(result).toContain('—');
    expect(result).toContain('← today');
    expect(result.split('\n')).toHaveLength(7);
  });

  it('handles all nulls', () => {
    const result = formatSparklineTooltip(
      [null, null, null, null, null, null, null],
      new Date('2026-05-23T12:00:00'),
    );
    expect(result.split('\n').every((line) => line.includes('—'))).toBe(true);
  });
});
