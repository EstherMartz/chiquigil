import { describe, it, expect } from 'vitest';
import { filterToParams, paramsToFilter } from './queryUrlParams';
import type { QueryFilter } from '../features/queries/types';

const baseFilter: QueryFilter = {
  searchCategories: [],
  hq: 'either',
  minDealPct: 0,
  minVelocity: 0,
  minPrice: null,
  maxPrice: null,
  sort: 'discount',
  limit: 100,
  scope: 'home',
  maxListings: null,
  mode: 'standard',
  minGap: null,
};

describe('queryUrlParams', () => {
  describe('filterToParams', () => {
    it('omits default values to keep URLs compact', () => {
      const params = filterToParams(baseFilter);
      expect(params.has('hq')).toBe(false); // 'either' is default
      expect(params.has('d')).toBe(false); // 0 is default
      expect(params.has('v')).toBe(false); // 0 is default
      expect(params.has('pmin')).toBe(false); // null is default
      expect(params.has('pmax')).toBe(false); // null is default
      expect(params.has('l')).toBe(false); // 100 is default
      expect(params.has('ml')).toBe(false); // null is default
      expect(params.has('g')).toBe(false); // null is default
      expect(params.has('m')).toBe(false); // 'standard' is default
    });

    it('encodes searchCategories as comma-separated list', () => {
      const filter = { ...baseFilter, searchCategories: [56, 67] };
      const params = filterToParams(filter);
      expect(params.get('sc')).toBe('56,67');
    });

    it('omits sc when searchCategories is empty', () => {
      const params = filterToParams(baseFilter);
      expect(params.has('sc')).toBe(false);
    });

    it('encodes hq modes', () => {
      expect(filterToParams({ ...baseFilter, hq: 'hq' }).get('hq')).toBe('hq');
      expect(filterToParams({ ...baseFilter, hq: 'nq' }).get('hq')).toBe('nq');
      expect(filterToParams({ ...baseFilter, hq: 'either' }).has('hq')).toBe(false);
    });

    it('encodes minDealPct', () => {
      const params = filterToParams({ ...baseFilter, minDealPct: 20 });
      expect(params.get('d')).toBe('20');
    });

    it('encodes minVelocity', () => {
      const params = filterToParams({ ...baseFilter, minVelocity: 5 });
      expect(params.get('v')).toBe('5');
    });

    it('encodes minPrice', () => {
      const params = filterToParams({ ...baseFilter, minPrice: 1000 });
      expect(params.get('pmin')).toBe('1000');
    });

    it('encodes maxPrice', () => {
      const params = filterToParams({ ...baseFilter, maxPrice: 50000 });
      expect(params.get('pmax')).toBe('50000');
    });

    it('encodes sort', () => {
      const params = filterToParams({ ...baseFilter, sort: 'gilFlow' });
      expect(params.get('s')).toBe('gilFlow');
    });

    it('encodes limit', () => {
      const params = filterToParams({ ...baseFilter, limit: 50 });
      expect(params.get('l')).toBe('50');
    });

    it('encodes scope', () => {
      const params = filterToParams({ ...baseFilter, scope: 'dc' });
      expect(params.get('scope')).toBe('dc');
    });

    it('encodes maxListings', () => {
      const params = filterToParams({ ...baseFilter, maxListings: 20 });
      expect(params.get('ml')).toBe('20');
    });

    it('encodes mode', () => {
      expect(filterToParams({ ...baseFilter, mode: 'craft' }).get('m')).toBe('craft');
      expect(filterToParams({ ...baseFilter, mode: 'repost' }).get('m')).toBe('repost');
      expect(filterToParams({ ...baseFilter, mode: 'standard' }).has('m')).toBe(false);
    });

    it('encodes minGap', () => {
      const params = filterToParams({ ...baseFilter, minGap: 5000 });
      expect(params.get('g')).toBe('5000');
    });
  });

  describe('paramsToFilter', () => {
    it('returns base unchanged when params are empty', () => {
      const params = new URLSearchParams();
      const result = paramsToFilter(params, baseFilter);
      expect(result).toEqual(baseFilter);
    });

    it('decodes searchCategories from comma-separated list', () => {
      const params = new URLSearchParams('sc=56,67');
      const result = paramsToFilter(params, baseFilter);
      expect(result.searchCategories).toEqual([56, 67]);
    });

    it('decodes hq modes', () => {
      expect(paramsToFilter(new URLSearchParams('hq=hq'), baseFilter).hq).toBe('hq');
      expect(paramsToFilter(new URLSearchParams('hq=nq'), baseFilter).hq).toBe('nq');
      expect(paramsToFilter(new URLSearchParams('hq=either'), baseFilter).hq).toBe('either');
    });

    it('decodes minDealPct as number', () => {
      const result = paramsToFilter(new URLSearchParams('d=20'), baseFilter);
      expect(result.minDealPct).toBe(20);
    });

    it('decodes minVelocity as number', () => {
      const result = paramsToFilter(new URLSearchParams('v=5'), baseFilter);
      expect(result.minVelocity).toBe(5);
    });

    it('decodes minPrice as number', () => {
      const result = paramsToFilter(new URLSearchParams('pmin=1000'), baseFilter);
      expect(result.minPrice).toBe(1000);
    });

    it('decodes maxPrice as number', () => {
      const result = paramsToFilter(new URLSearchParams('pmax=50000'), baseFilter);
      expect(result.maxPrice).toBe(50000);
    });

    it('decodes sort', () => {
      const result = paramsToFilter(new URLSearchParams('s=gilFlow'), baseFilter);
      expect(result.sort).toBe('gilFlow');
    });

    it('decodes limit as number', () => {
      const result = paramsToFilter(new URLSearchParams('l=50'), baseFilter);
      expect(result.limit).toBe(50);
    });

    it('decodes scope', () => {
      const result = paramsToFilter(new URLSearchParams('scope=dc'), baseFilter);
      expect(result.scope).toBe('dc');
    });

    it('decodes maxListings as number', () => {
      const result = paramsToFilter(new URLSearchParams('ml=20'), baseFilter);
      expect(result.maxListings).toBe(20);
    });

    it('decodes mode', () => {
      expect(paramsToFilter(new URLSearchParams('m=craft'), baseFilter).mode).toBe('craft');
      expect(paramsToFilter(new URLSearchParams('m=repost'), baseFilter).mode).toBe('repost');
      expect(paramsToFilter(new URLSearchParams('m=standard'), baseFilter).mode).toBe('standard');
    });

    it('decodes minGap as number', () => {
      const result = paramsToFilter(new URLSearchParams('g=5000'), baseFilter);
      expect(result.minGap).toBe(5000);
    });

    it('handles invalid numeric values by returning base', () => {
      const params = new URLSearchParams('d=not-a-number&v=abc');
      const result = paramsToFilter(params, baseFilter);
      expect(result.minDealPct).toBe(baseFilter.minDealPct);
      expect(result.minVelocity).toBe(baseFilter.minVelocity);
    });

    it('merges multiple params over base', () => {
      const params = new URLSearchParams('d=20&v=1&m=craft&sc=56,67');
      const result = paramsToFilter(params, baseFilter);
      expect(result.minDealPct).toBe(20);
      expect(result.minVelocity).toBe(1);
      expect(result.mode).toBe('craft');
      expect(result.searchCategories).toEqual([56, 67]);
      expect(result.sort).toBe(baseFilter.sort); // not overridden
    });
  });

  describe('round-trip', () => {
    it('encodes and decodes a filter with many non-defaults', () => {
      const original: QueryFilter = {
        searchCategories: [56, 67],
        hq: 'hq',
        minDealPct: 20,
        minVelocity: 5,
        minPrice: 1000,
        maxPrice: 50000,
        sort: 'gilFlow',
        limit: 50,
        scope: 'dc',
        maxListings: 20,
        mode: 'craft',
        minGap: 5000,
      };
      const params = filterToParams(original);
      const decoded = paramsToFilter(params, baseFilter);
      expect(decoded).toEqual(original);
    });

    it('encodes and decodes with base filter as starting point', () => {
      const customBase: QueryFilter = {
        searchCategories: [],
        hq: 'nq',
        minDealPct: 10,
        minVelocity: 2,
        minPrice: 100,
        maxPrice: 10000,
        sort: 'velocity',
        limit: 200,
        scope: 'dc',
        maxListings: 30,
        mode: 'repost',
        minGap: 1000,
      };
      const override: QueryFilter = {
        ...customBase,
        minDealPct: 30,
        minVelocity: 5,
        mode: 'craft', // use a non-default mode
      };
      const params = filterToParams(override);
      const decoded = paramsToFilter(params, customBase);
      expect(decoded).toEqual(override);
    });
  });
});
