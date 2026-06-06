import { CHAOS_WORLDS, LIGHT_WORLDS } from './europeWorlds';

/** Oceania data center (Materia). */
export const OCEANIA_WORLDS: ReadonlySet<string> = new Set([
  'Bismarck', 'Ravana', 'Sephirot', 'Sophia', 'Zurvan',
]);

export type TravelDc = 'Chaos' | 'Light' | 'Oceania';

/** Every world a Chaos/Light player can DC-travel to. */
export const TRAVEL_WORLDS: ReadonlySet<string> = new Set([
  ...CHAOS_WORLDS, ...LIGHT_WORLDS, ...OCEANIA_WORLDS,
]);

export function dcOfTravel(world: string): TravelDc | null {
  if (CHAOS_WORLDS.has(world)) return 'Chaos';
  if (LIGHT_WORLDS.has(world)) return 'Light';
  if (OCEANIA_WORLDS.has(world)) return 'Oceania';
  return null;
}
