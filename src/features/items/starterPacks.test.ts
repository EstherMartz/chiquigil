import { describe, it, expect } from 'vitest';
import { STARTER_PACKS, allItemsFromEnabledPacks, type StarterPackToggles } from './starterPacks';

describe('STARTER_PACKS', () => {
  it('has all seven packs', () => {
    const ids = STARTER_PACKS.map((p) => p.id).sort();
    expect(ids).toEqual([
      'dyes', 'food-7x', 'glamour-faves', 'housing-faves',
      'materia-xii', 'raid-current', 'tinctures-g4',
    ]);
  });

  it('current raid pack contains the Courtly Lover head piece (id 49281)', () => {
    const raid = STARTER_PACKS.find((p) => p.id === 'raid-current')!;
    expect(raid.items.some((i) => i.id === 49281)).toBe(true);
  });

  it('marks 7.x packs as defaultOn and Quaintrelle/housing as defaultOff', () => {
    const byId = Object.fromEntries(STARTER_PACKS.map((p) => [p.id, p]));
    expect(byId['raid-current'].defaultOn).toBe(true);
    expect(byId['tinctures-g4'].defaultOn).toBe(true);
    expect(byId['food-7x'].defaultOn).toBe(true);
    expect(byId['housing-faves'].defaultOn).toBe(false);
  });
});

describe('allItemsFromEnabledPacks', () => {
  it('returns the union of items from enabled packs, deduped by id', () => {
    const enabled = { 'raid-current': true, 'tinctures-g4': true, 'food-7x': false, 'dyes': false, 'materia-xii': false, 'glamour-faves': false, 'housing-faves': false } as const;
    const items = allItemsFromEnabledPacks(enabled);
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(items.length);
    expect(ids.has(49281)).toBe(true); // raid
    expect(ids.has(49234)).toBe(true); // gemdraught of strength
    expect(ids.has(49232)).toBe(false); // food, disabled
  });

  it('respects the excluded set when given', () => {
    const enabled: StarterPackToggles = {
      'raid-current': true, 'tinctures-g4': false, 'food-7x': false, 'dyes': false,
      'materia-xii': false, 'glamour-faves': false, 'housing-faves': false,
    };
    const excluded = new Set([49281]); // a raid item
    const items = allItemsFromEnabledPacks(enabled, excluded);
    expect(items.some((i) => i.id === 49281)).toBe(false);
    expect(items.length).toBeGreaterThan(0);
  });
});
