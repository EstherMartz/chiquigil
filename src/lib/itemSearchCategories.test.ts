import { describe, it, expect } from 'vitest';
import { CATEGORY_GROUPS, ITEM_SEARCH_CATEGORIES } from './itemSearchCategories';

describe('CATEGORY_GROUPS', () => {
  it('has one entry per distinct group', () => {
    const distinct = new Set(ITEM_SEARCH_CATEGORIES.map((c) => c.group));
    expect(CATEGORY_GROUPS.length).toBe(distinct.size);
  });

  it('groups the housing categories under "Housing"', () => {
    const housing = CATEGORY_GROUPS.find((g) => g.label === 'Housing');
    expect(housing).toBeDefined();
    expect(housing!.ids).toEqual(
      expect.arrayContaining([56, 65, 66, 67, 68, 69, 70, 71, 72, 81, 82]),
    );
  });

  it('covers every category id exactly once', () => {
    const all = CATEGORY_GROUPS.flatMap((g) => g.ids);
    expect(all.length).toBe(ITEM_SEARCH_CATEGORIES.length);
    expect(new Set(all).size).toBe(ITEM_SEARCH_CATEGORIES.length);
  });
});
