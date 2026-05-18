import type { CrafterCode } from './types';

/**
 * Crafter identity colors mapped to static Tailwind text-color classes.
 * Tokens defined in `tailwind.config.ts`. Static strings so the Tailwind
 * content scan finds them.
 */
const BEAD_BY_CODE: Record<CrafterCode, string> = {
  CRP: 'text-crp',
  BSM: 'text-bsm',
  ARM: 'text-arm',
  GSM: 'text-gsm',
  LTW: 'text-ltw',
  WVR: 'text-wvr',
  ALC: 'text-alc',
  CUL: 'text-cul',
  ANY: 'text-text-low',
};

export function crafterBeadClass(crafter: string): string {
  return BEAD_BY_CODE[crafter as CrafterCode] ?? 'text-text-low';
}
