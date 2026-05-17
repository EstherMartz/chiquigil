export const CHAOS_WORLDS: ReadonlySet<string> = new Set([
  'Cerberus', 'Louisoix', 'Moogle', 'Omega', 'Phantom',
  'Ragnarok', 'Sagittarius', 'Spriggan',
]);

export const LIGHT_WORLDS: ReadonlySet<string> = new Set([
  'Alpha', 'Lich', 'Odin', 'Phoenix', 'Raiden',
  'Shiva', 'Twintania', 'Zodiark',
]);

export const EU_WORLDS: ReadonlySet<string> = new Set([
  ...CHAOS_WORLDS, ...LIGHT_WORLDS,
]);

export type EuDc = 'Chaos' | 'Light';

export function dcOf(world: string): EuDc | null {
  if (CHAOS_WORLDS.has(world)) return 'Chaos';
  if (LIGHT_WORLDS.has(world)) return 'Light';
  return null;
}
