import { describe, it, expect } from 'vitest';
import { isItemHidden, CRYSTALS_SEARCH_CATEGORY } from './commonFilters';

const opts = (over = {}) => ({ hideCrystals: true, hideIgnored: true, ignored: new Set<number>([7]), ...over });

describe('isItemHidden', () => {
  it('hides crystals when hideCrystals is on', () => {
    expect(isItemHidden({ id: 1, sc: CRYSTALS_SEARCH_CATEGORY }, opts())).toBe(true);
  });
  it('keeps crystals when hideCrystals is off', () => {
    expect(isItemHidden({ id: 1, sc: CRYSTALS_SEARCH_CATEGORY }, opts({ hideCrystals: false }))).toBe(false);
  });
  it('hides an ignored id when hideIgnored is on', () => {
    expect(isItemHidden({ id: 7, sc: 5 }, opts())).toBe(true);
  });
  it('keeps an ignored id when hideIgnored is off', () => {
    expect(isItemHidden({ id: 7, sc: 5 }, opts({ hideIgnored: false }))).toBe(false);
  });
  it('keeps an ordinary item', () => {
    expect(isItemHidden({ id: 3, sc: 5 }, opts())).toBe(false);
  });
});
