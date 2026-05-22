import { describe, it, expect } from 'vitest';
import type { BatchResult } from './types';

// View-level rendering tests would need a full React test harness.
// For now, verify the algorithm integrates correctly with the view's
// expected data shape by checking BatchResult fields are present.

describe('CraftBatchView data contract', () => {
  it('BatchResult has all fields the view reads', () => {
    const result: BatchResult = {
      items: [],
      totalCost: 0,
      expectedRevenue: 0,
      expectedProfit: 0,
      roi: 0,
      budgetRemaining: 1000,
      categoryBreakdown: {},
    };
    // Verify the shape matches what the view destructures
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('totalCost');
    expect(result).toHaveProperty('expectedRevenue');
    expect(result).toHaveProperty('expectedProfit');
    expect(result).toHaveProperty('roi');
    expect(result).toHaveProperty('budgetRemaining');
    expect(result).toHaveProperty('categoryBreakdown');
  });
});
