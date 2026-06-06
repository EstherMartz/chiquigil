import { describe, it, expect } from 'vitest';
import { TRAVEL_WORLDS, OCEANIA_WORLDS, dcOfTravel } from './travelWorlds';

describe('travelWorlds', () => {
  it('classifies worlds by data center', () => {
    expect(dcOfTravel('Phantom')).toBe('Chaos');
    expect(dcOfTravel('Lich')).toBe('Light');
    expect(dcOfTravel('Ravana')).toBe('Oceania');
    expect(dcOfTravel('Gilgamesh')).toBeNull();
  });

  it('includes Chaos, Light and Oceania worlds in the travel set', () => {
    expect(TRAVEL_WORLDS.has('Phantom')).toBe(true);
    expect(TRAVEL_WORLDS.has('Shiva')).toBe(true);
    expect(TRAVEL_WORLDS.has('Sephirot')).toBe(true);
    expect(OCEANIA_WORLDS.has('Zurvan')).toBe(true);
  });
});
