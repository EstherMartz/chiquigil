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

  it('existing four presets default to dc scope, no list cap, non-craftable mode', () => {
    for (const id of ['mega-value-hq', 'fast-sellers-hq', 'food-potions', 'furnishings']) {
      const p = getPreset(id)!;
      expect(p.filter.scope).toBe('dc');
      expect(p.filter.maxListings).toBeNull();
      expect(p.filter.mode).toBe('standard');
    }
  });

  it('undersupply preset is home-scope, maxListings 2, craftable-only', () => {
    const p = getPreset('undersupply')!;
    expect(p.filter.scope).toBe('home');
    expect(p.filter.maxListings).toBe(2);
    expect(p.filter.mode).toBe('craft');
    expect(p.filter.minVelocity).toBeGreaterThanOrEqual(1);
  });

  it('craft-flip preset is home-scope, no list cap, craftable-only', () => {
    const p = getPreset('craft-flip')!;
    expect(p.filter.scope).toBe('home');
    expect(p.filter.maxListings).toBeNull();
    expect(p.filter.mode).toBe('craft');
  });

  it('reposts preset is home-scope mode=repost with minGap 10k', () => {
    const p = getPreset('reposts')!;
    expect(p.filter.mode).toBe('repost');
    expect(p.filter.scope).toBe('home');
    expect(p.filter.minGap).toBe(10_000);
    expect(p.filter.minDealPct).toBe(30);
  });

  it('treasure-maps targets category 64 (Other)', () => {
    const p = getPreset('treasure-maps')!;
    expect(p.filter.searchCategories).toEqual([64]);
    expect(p.filter.sort).toBe('gilFlow');
    expect(p.filter.scope).toBe('dc');
    expect(p.filter.minVelocity).toBe(0.5);
  });

  it('every preset has a category (craft, trading, or gathering)', () => {
    for (const p of PRESETS) {
      expect(['craft', 'trading', 'gathering']).toContain(p.category);
    }
  });

  it('categorizes craft presets correctly', () => {
    const craftIds = PRESETS.filter((p) => p.category === 'craft').map((p) => p.id).sort();
    expect(craftIds).toEqual(['craft-flip', 'housing-crafts', 'materials-crafts', 'undersupply']);
  });

  it('categorizes trading presets correctly', () => {
    const tradingIds = PRESETS.filter((p) => p.category === 'trading').map((p) => p.id).sort();
    expect(tradingIds).toEqual([
      'fast-sellers-hq',
      'food-potions',
      'furnishings',
      'high-value-materials',
      'mega-value-hq',
      'minions-quick-sell',
      'reposts',
      'treasure-maps',
    ]);
  });

  it('categorizes gathering presets correctly', () => {
    const ids = PRESETS.filter((p) => p.category === 'gathering').map((p) => p.id).sort();
    expect(ids).toEqual([
      'botany-commodities',
      'fishing-commodities',
      'gather-commodities',
      'mining-commodities',
    ]);
  });

  it('gathering presets default to NQ and standard mode', () => {
    for (const p of PRESETS.filter((p) => p.category === 'gathering')) {
      expect(p.filter.hq).toBe('nq');
      expect(p.filter.mode).toBe('standard');
      expect(p.filter.minVelocity).toBeGreaterThanOrEqual(3);
    }
  });
});
