import { describe, it, expect } from 'vitest';
import { buildItemSearchUrl, parseItemSearchResponse } from './xivapi';

describe('buildItemSearchUrl', () => {
  it('builds a name-search URL with the Item sheet and Recipes link', () => {
    expect(buildItemSearchUrl('courtly')).toBe(
      'https://v2.xivapi.com/api/search?sheets=Item&query=Name~%22courtly%22&fields=Name,Icon,LevelItem,ClassJobCategory&limit=20'
    );
  });
});

describe('parseItemSearchResponse', () => {
  it('returns rows with id, name, level, classJobCategory', () => {
    const raw = {
      results: [
        { row_id: 49281, fields: { Name: "Courtly Lover's Temple Chain of Striking", Icon: 'x', LevelItem: 770, ClassJobCategory: { Name: 'LTW' } } },
        { row_id: 49297, fields: { Name: "Courtly Lover's Longcoat of Healing",      Icon: 'y', LevelItem: 770, ClassJobCategory: { Name: 'WVR' } } },
      ],
    };
    expect(parseItemSearchResponse(raw)).toEqual([
      { id: 49281, name: "Courtly Lover's Temple Chain of Striking", level: 770, classJobCategory: 'LTW' },
      { id: 49297, name: "Courtly Lover's Longcoat of Healing",      level: 770, classJobCategory: 'WVR' },
    ]);
  });

  it('drops rows missing fields', () => {
    expect(parseItemSearchResponse({ results: [{ row_id: 1 }] })).toEqual([]);
  });
});
