/**
 * FFXIV item rarity → visual treatment.
 *
 * Tiers map to the in-game name colors:
 *   1  white     — common (no accent)
 *   2  green     — uncommon (HQ-able crafted gear)
 *   3  blue      — rare
 *   4  purple    — aetherial / relic-tier
 *   7  pink      — legendary / extreme relic
 */

/** Tailwind text-color class for the rarity tier, or null for common/unknown. */
export function rarityTextClass(rarity: number | undefined): string | null {
  switch (rarity) {
    case 2: return 'text-jade';
    case 3: return 'text-aether';
    case 4: return 'text-alc';
    case 7: return 'text-wvr';
    default: return null;
  }
}

/** Tailwind left-border-color class for the rarity tier, or null for common/unknown. */
export function rarityBorderLeftClass(rarity: number | undefined): string | null {
  switch (rarity) {
    case 2: return 'border-l-jade';
    case 3: return 'border-l-aether';
    case 4: return 'border-l-alc';
    case 7: return 'border-l-wvr';
    default: return null;
  }
}

export function rarityLabel(rarity: number | undefined): string | null {
  switch (rarity) {
    case 2: return 'Uncommon';
    case 3: return 'Rare';
    case 4: return 'Aetherial';
    case 7: return 'Legendary';
    default: return null;
  }
}
