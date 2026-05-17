import { describe, it, expect } from 'vitest';
import { dcOf, CHAOS_WORLDS, LIGHT_WORLDS, EU_WORLDS } from './europeWorlds';

describe('europeWorlds', () => {
  it('partitions known Chaos worlds correctly', () => {
    expect(dcOf('Phantom')).toBe('Chaos');
    expect(dcOf('Omega')).toBe('Chaos');
    expect(dcOf('Cerberus')).toBe('Chaos');
  });

  it('partitions known Light worlds correctly', () => {
    expect(dcOf('Twintania')).toBe('Light');
    expect(dcOf('Odin')).toBe('Light');
    expect(dcOf('Phoenix')).toBe('Light');
    expect(dcOf('Lich')).toBe('Light');
  });

  it('returns null for unknown worlds', () => {
    expect(dcOf('Bahamut')).toBeNull();
    expect(dcOf('')).toBeNull();
  });

  it('CHAOS_WORLDS and LIGHT_WORLDS are disjoint and together = EU_WORLDS', () => {
    for (const w of CHAOS_WORLDS) expect(LIGHT_WORLDS.has(w)).toBe(false);
    expect(EU_WORLDS.size).toBe(CHAOS_WORLDS.size + LIGHT_WORLDS.size);
  });
});
