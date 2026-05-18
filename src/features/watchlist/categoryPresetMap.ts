/**
 * Maps a Watchlist category label to the matching `/trading` preset id.
 * Used by the Watchlist empty state to deep-link into a discovery view
 * when the user's curated list has no matches for the selected category.
 *
 * "All" and "Raid" intentionally have no mapping — "All" is the unfiltered
 * view, and "Raid" is a curated set with no clean ItemSearchCategory analogue.
 */
export const CATEGORY_TO_TRADING_PRESET: Record<string, string> = {
  Food: 'top-food',
  Fish: 'top-fish',
  Tincture: 'top-tinctures',
  Dye: 'top-dyes',
  Materia: 'top-materia',
  Minion: 'top-minions',
  Glamour: 'glamour-gear',
  Housing: 'furnishings',
};
