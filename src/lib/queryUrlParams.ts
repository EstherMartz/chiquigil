import type { QueryFilter, HqMode, QuerySort, QueryScope, QueryMode } from '../features/queries/types';

const DEFAULTS = {
  hq: 'either' as const,
  minDealPct: 0,
  minVelocity: 0,
  minPrice: null as number | null,
  maxPrice: null as number | null,
  limit: 100,
  maxListings: null as number | null,
  minGap: null as number | null,
  mode: 'standard' as const,
  minGatherablePct: null as number | null,
};

/**
 * Encode a QueryFilter as URLSearchParams. Defaults are omitted to keep
 * URLs compact.
 */
export function filterToParams(f: QueryFilter): URLSearchParams {
  const params = new URLSearchParams();

  // searchCategories: only add if non-empty
  if (f.searchCategories.length > 0) {
    params.set('sc', f.searchCategories.join(','));
  }

  // hq: only add if not the default 'either'
  if (f.hq !== DEFAULTS.hq) {
    params.set('hq', f.hq);
  }

  // minDealPct: only add if not 0
  if (f.minDealPct !== DEFAULTS.minDealPct) {
    params.set('d', String(f.minDealPct));
  }

  // minVelocity: only add if not 0
  if (f.minVelocity !== DEFAULTS.minVelocity) {
    params.set('v', String(f.minVelocity));
  }

  // minPrice: only add if not null
  if (f.minPrice !== DEFAULTS.minPrice) {
    params.set('pmin', String(f.minPrice));
  }

  // maxPrice: only add if not null
  if (f.maxPrice !== DEFAULTS.maxPrice) {
    params.set('pmax', String(f.maxPrice));
  }

  // sort: always include when present (multiple legitimate values)
  params.set('s', f.sort);

  // limit: only add if not 100
  if (f.limit !== DEFAULTS.limit) {
    params.set('l', String(f.limit));
  }

  // scope: always include when present (multiple legitimate values)
  params.set('scope', f.scope);

  // maxListings: only add if not null
  if (f.maxListings !== DEFAULTS.maxListings) {
    params.set('ml', String(f.maxListings));
  }

  // mode: only add if not 'standard'
  if (f.mode !== DEFAULTS.mode) {
    params.set('m', f.mode);
  }

  // minGap: only add if not null
  if (f.minGap !== DEFAULTS.minGap) {
    params.set('g', String(f.minGap));
  }

  // minGatherablePct: only add if set (treat undefined as null)
  if ((f.minGatherablePct ?? null) !== DEFAULTS.minGatherablePct) {
    params.set('mg', String(f.minGatherablePct));
  }

  return params;
}

/**
 * Hydrate a QueryFilter from URLSearchParams, layered on top of a base
 * filter (typically a preset's default filter or baseFilter). Any param absent from
 * the URL leaves the base value untouched.
 */
export function paramsToFilter(params: URLSearchParams, base: QueryFilter): QueryFilter {
  const result = { ...base };

  // searchCategories
  const scStr = params.get('sc');
  if (scStr) {
    try {
      result.searchCategories = scStr.split(',').map((s) => {
        const num = Number(s.trim());
        if (Number.isNaN(num)) throw new Error('Invalid category');
        return num;
      });
    } catch {
      // fall back to base
    }
  }

  // hq
  const hqStr = params.get('hq');
  if (hqStr === 'hq' || hqStr === 'nq' || hqStr === 'either') {
    result.hq = hqStr as HqMode;
  }

  // minDealPct
  const dStr = params.get('d');
  if (dStr) {
    const num = Number(dStr);
    if (!Number.isNaN(num)) {
      result.minDealPct = num;
    }
  }

  // minVelocity
  const vStr = params.get('v');
  if (vStr) {
    const num = Number(vStr);
    if (!Number.isNaN(num)) {
      result.minVelocity = num;
    }
  }

  // minPrice
  const pminStr = params.get('pmin');
  if (pminStr) {
    const num = Number(pminStr);
    if (!Number.isNaN(num)) {
      result.minPrice = num;
    }
  }

  // maxPrice
  const pmaxStr = params.get('pmax');
  if (pmaxStr) {
    const num = Number(pmaxStr);
    if (!Number.isNaN(num)) {
      result.maxPrice = num;
    }
  }

  // sort
  const sStr = params.get('s');
  if (sStr === 'discount' || sStr === 'gilFlow' || sStr === 'velocity'
      || sStr === 'unitPrice' || sStr === 'selfSourceGilFlow') {
    result.sort = sStr as QuerySort;
  }

  // limit
  const lStr = params.get('l');
  if (lStr) {
    const num = Number(lStr);
    if (!Number.isNaN(num)) {
      result.limit = num;
    }
  }

  // scope
  const scopeStr = params.get('scope');
  if (scopeStr === 'home' || scopeStr === 'dc') {
    result.scope = scopeStr as QueryScope;
  }

  // maxListings
  const mlStr = params.get('ml');
  if (mlStr) {
    const num = Number(mlStr);
    if (!Number.isNaN(num)) {
      result.maxListings = num;
    }
  }

  // mode
  const mStr = params.get('m');
  if (mStr === 'standard' || mStr === 'craft' || mStr === 'repost') {
    result.mode = mStr as QueryMode;
  }

  // minGap
  const gStr = params.get('g');
  if (gStr) {
    const num = Number(gStr);
    if (!Number.isNaN(num)) {
      result.minGap = num;
    }
  }

  // minGatherablePct (clamp 0..100)
  const mgStr = params.get('mg');
  if (mgStr) {
    const num = Number(mgStr);
    if (!Number.isNaN(num)) {
      result.minGatherablePct = Math.max(0, Math.min(100, num));
    }
  }

  return result;
}
