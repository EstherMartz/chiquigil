import type { AccessLevel } from '../bot/craftTypes';

export type { AccessLevel };

/**
 * Single source of truth for "is this user allowed in?".
 * - block   → never
 * - allow   → always
 * - default → follow the guild allow-list result
 * `access: null` means we have no record yet → treated as 'default'.
 */
export function decideAccess(input: { guildAllowed: boolean; access: AccessLevel | null }): boolean {
  if (input.access === 'block') return false;
  if (input.access === 'allow') return true;
  return input.guildAllowed;
}
