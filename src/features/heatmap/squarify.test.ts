import { describe, it, expect } from 'vitest';
import { squarify, type SquarifyInput } from './squarify';

describe('squarify', () => {
  it('returns empty array for empty input', () => {
    expect(squarify([], 800, 600)).toEqual([]);
  });

  it('single item fills the entire container', () => {
    const rects = squarify([{ id: 1, area: 100 }], 800, 600);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ id: 1, x: 0, y: 0, w: 800, h: 600 });
  });

  it('total area of rects equals container area', () => {
    const items: SquarifyInput[] = [
      { id: 1, area: 60 },
      { id: 2, area: 30 },
      { id: 3, area: 10 },
    ];
    const rects = squarify(items, 800, 600);
    const totalArea = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    expect(totalArea).toBeCloseTo(800 * 600, 0);
  });

  it('no rects overlap', () => {
    const items: SquarifyInput[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      area: 100 - i * 8,
    }));
    const rects = squarify(items, 800, 600);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
        const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlapX && overlapY, `rects ${a.id} and ${b.id} overlap`).toBe(false);
      }
    }
  });

  it('all rects are inside the container', () => {
    const items: SquarifyInput[] = [
      { id: 1, area: 50 },
      { id: 2, area: 30 },
      { id: 3, area: 20 },
    ];
    const rects = squarify(items, 800, 600);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(800 + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(600 + 0.01);
    }
  });

  it('preserves all input IDs', () => {
    const items: SquarifyInput[] = [
      { id: 10, area: 40 },
      { id: 20, area: 30 },
      { id: 30, area: 20 },
      { id: 40, area: 10 },
    ];
    const rects = squarify(items, 800, 600);
    expect(rects.map((r) => r.id).sort()).toEqual([10, 20, 30, 40]);
  });

  it('skips items with zero or negative area', () => {
    const items: SquarifyInput[] = [
      { id: 1, area: 50 },
      { id: 2, area: 0 },
      { id: 3, area: -5 },
    ];
    const rects = squarify(items, 800, 600);
    expect(rects).toHaveLength(1);
    expect(rects[0].id).toBe(1);
  });
});
