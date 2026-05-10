import type { CrafterCode } from './types';

export type CrafterLevels = Record<Exclude<CrafterCode, 'ANY'>, number>;

export type CraftStatus = 'ok' | 'short' | 'no';

export function craftStatus(
  item: { crafter: CrafterCode; lvl: number },
  levels: CrafterLevels,
): CraftStatus {
  if (item.crafter === 'ANY') return 'ok';
  const my = levels[item.crafter];
  if (my >= item.lvl) return 'ok';
  if (my >= item.lvl - 10) return 'short';
  return 'no';
}
