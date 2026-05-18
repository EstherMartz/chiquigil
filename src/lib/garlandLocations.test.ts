import { describe, it, expect } from 'vitest';
import { parseGarlandLocations } from './garlandLocations';

describe('parseGarlandLocations', () => {
  it('builds Map<number, string> from locationIndex', () => {
    const raw = {
      locationIndex: {
        '20': { id: 20, name: 'Hydaelyn', parentId: 20, size: 1 },
        '28': { id: 28, name: 'Limsa Lominsa Upper Decks', parentId: 22, size: 1 },
        '52': { id: 52, name: 'Mor Dhona', parentId: 22, size: 1 },
      },
    };
    const out = parseGarlandLocations(raw);
    expect(out.size).toBe(3);
    expect(out.get(20)).toBe('Hydaelyn');
    expect(out.get(28)).toBe('Limsa Lominsa Upper Decks');
    expect(out.get(52)).toBe('Mor Dhona');
  });

  it('returns empty Map when locationIndex is missing or empty', () => {
    expect(parseGarlandLocations({}).size).toBe(0);
    expect(parseGarlandLocations({ locationIndex: {} }).size).toBe(0);
  });

  it('skips entries with missing or non-string name', () => {
    const raw = {
      locationIndex: {
        '1': { id: 1, name: 'OK' },
        '2': { id: 2 },
        '3': { id: 3, name: '' },
      },
    };
    const out = parseGarlandLocations(raw);
    expect(out.size).toBe(1);
    expect(out.get(1)).toBe('OK');
  });

  it('skips entries with non-numeric key', () => {
    const raw = {
      locationIndex: {
        'abc': { id: 999, name: 'Garbage' },
        '7': { id: 7, name: 'Real' },
      },
    };
    const out = parseGarlandLocations(raw);
    expect(out.size).toBe(1);
    expect(out.get(7)).toBe('Real');
  });
});
