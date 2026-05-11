import { describe, it, expect } from 'vitest';
import { PRESETS, getPreset } from './presets';
import { categoriesByGroup } from '../../lib/itemSearchCategories';

describe('PRESETS', () => {
  it('every preset has a unique id', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(PRESETS.length);
  });

  it('every preset has a non-empty label and desc', () => {
    for (const p of PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.desc.length).toBeGreaterThan(0);
    }
  });

  it('every preset filter has a legal sort mode and limit > 0', () => {
    for (const p of PRESETS) {
      expect(['discount', 'gilFlow', 'velocity', 'unitPrice']).toContain(p.filter.sort);
      expect(p.filter.limit).toBeGreaterThan(0);
    }
  });

  it('food-potions targets the Medicine + Meals ItemSearchCategories (43 and 45)', () => {
    const p = getPreset('food-potions')!;
    expect([...p.filter.searchCategories].sort((a, b) => a - b)).toEqual([43, 45]);
  });

  it('furnishings preset uses the Housing category group', () => {
    const p = getPreset('furnishings')!;
    const housingIds = categoriesByGroup('Housing').sort((a, b) => a - b);
    expect([...p.filter.searchCategories].sort((a, b) => a - b)).toEqual(housingIds);
    expect(housingIds.length).toBeGreaterThan(0); // sanity: Housing group is non-empty
  });

  it('getPreset returns undefined for unknown id', () => {
    expect(getPreset('nope')).toBeUndefined();
  });
});
