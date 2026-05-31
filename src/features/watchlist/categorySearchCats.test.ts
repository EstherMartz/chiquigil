import { describe, it, expect } from 'vitest';
import { searchCatsForCategory, categorySupportsSuggestions, inferCategory } from './categorySearchCats';

describe('searchCatsForCategory', () => {
  it('maps simple categories to their sc ids', () => {
    expect(searchCatsForCategory('Food')).toEqual([44, 45]);
    expect(searchCatsForCategory('Dye')).toEqual([54]);
    expect(searchCatsForCategory('Materia')).toEqual([57]);
    expect(searchCatsForCategory('Minion')).toEqual([75]);
  });

  it('expands grouped categories via the group helper', () => {
    expect(searchCatsForCategory('Housing').length).toBeGreaterThan(0);
    expect(searchCatsForCategory('Glamour').length).toBeGreaterThan(0);
  });

  it('reports support correctly', () => {
    expect(categorySupportsSuggestions('Food')).toBe(true);
    expect(categorySupportsSuggestions('Raid')).toBe(true);
  });
});

describe('inferCategory', () => {
  it('maps sc back to the watchlist category', () => {
    expect(inferCategory(45)).toBe('Food');
    expect(inferCategory(46)).toBe('Fish');
    expect(inferCategory(54)).toBe('Dye');
    expect(inferCategory(57)).toBe('Materia');
    expect(inferCategory(75)).toBe('Minion');
  });

  it('falls back to Glamour for unmapped equipment categories', () => {
    expect(inferCategory(34)).toBe('Glamour'); // an armor sc
    expect(inferCategory(9999)).toBe('Glamour');
  });
});
