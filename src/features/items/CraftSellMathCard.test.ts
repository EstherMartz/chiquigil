import { describe, it, expect } from 'vitest';
import { craftSellMath } from './CraftSellMathCard';

describe('craftSellMath', () => {
  it('calculates profit as sale price minus minimum materials cost', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 1,
    });
    expect(result.bestMaterials).toBe(800);
    expect(result.profitPerCraft).toBe(1200); // 2000 - 800
  });

  it('uses home cost when it is cheaper than region best', () => {
    const result = craftSellMath({
      materialsHome: 500,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 1,
    });
    expect(result.bestMaterials).toBe(500);
    expect(result.profitPerCraft).toBe(1500); // 2000 - 500
  });

  it('returns null profit when sale price is null', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: null,
      velocity: 1,
    });
    expect(result.bestMaterials).toBe(800);
    expect(result.profitPerCraft).toBeNull();
    expect(result.daysToMove).toBe(1); // 1 / velocity
  });

  it('calculates daysToMove as 1 / velocity', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 2,
    });
    expect(result.daysToMove).toBe(0.5); // 1 / 2
  });

  it('returns null daysToMove when velocity is 0', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 0,
    });
    expect(result.daysToMove).toBeNull();
    expect(result.gilPerHour).toBeNull();
  });

  it('calculates gilPerHour as profit / (daysToMove * 24)', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 1, // daysToMove = 1
    });
    expect(result.profitPerCraft).toBe(1200);
    expect(result.gilPerHour).toBe(50); // 1200 / (1 * 24)
  });

  it('returns null gilPerHour when profit is null', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: null,
      velocity: 1,
    });
    expect(result.gilPerHour).toBeNull();
  });

  it('returns null gilPerHour when velocity is 0', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 0,
    });
    expect(result.gilPerHour).toBeNull();
  });

  it('returns 0 gilPerHour when daysToMove is exactly 0 (edge case)', () => {
    // This is technically impossible (velocity must be Infinity), but defensive.
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: Infinity,
    });
    expect(result.gilPerHour).toBeNull(); // 1200 / (0 * 24) = Infinity or NaN
  });

  it('handles negative profit (loss)', () => {
    const result = craftSellMath({
      materialsHome: 3000,
      materialsRegionBest: 3000,
      salePrice: 2000,
      velocity: 1,
    });
    expect(result.profitPerCraft).toBe(-1000);
    expect(result.gilPerHour).toBe(-41.666666666666664); // -1000 / 24 (rounded slightly)
  });
});
