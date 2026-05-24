import { describe, it, expect } from 'vitest';
import { buildNameIndex, searchItems } from './nameIndex';

const SAMPLE_NAMES = new Map<number, string>([
  [100, 'Plain Hooded Tunic'],
  [200, 'Grade 4 Gemdraught of Dexterity'],
  [300, 'Yollal Extract'],
  [400, 'Courtly Lover\'s Cane'],
  [500, 'Open Book'],
]);

describe('buildNameIndex', () => {
  it('builds a lowercase name-to-id map', () => {
    const index = buildNameIndex(SAMPLE_NAMES);
    expect(index.get('plain hooded tunic')).toBe(100);
    expect(index.get('open book')).toBe(500);
  });
});

describe('searchItems', () => {
  const index = buildNameIndex(SAMPLE_NAMES);

  it('finds exact match (case-insensitive)', () => {
    const results = searchItems(index, 'Plain Hooded Tunic');
    expect(results[0]).toEqual({ id: 100, name: 'Plain Hooded Tunic' });
  });

  it('finds substring match', () => {
    const results = searchItems(index, 'gemdraught');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe(200);
  });

  it('returns empty for no match', () => {
    const results = searchItems(index, 'nonexistent garbage');
    expect(results).toEqual([]);
  });

  it('limits results', () => {
    const results = searchItems(index, 'o', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
