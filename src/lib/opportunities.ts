import type { OpportunitiesFile } from '../bot/marketDiff';
export type { Opportunity, OpportunityKind, OpportunitiesFile } from '../bot/marketDiff';

const EMPTY: OpportunitiesFile = { ts: 0, opportunities: [] };

/**
 * Load the rolling opportunity feed (public blob). Returns an empty feed on any
 * failure so the page renders an empty state instead of erroring.
 * `marketDiff` is pure (only a type import from universalis) — safe in the browser bundle.
 */
export async function loadOpportunities(): Promise<OpportunitiesFile> {
  try {
    const url = (import.meta as any).env?.VITE_OPPORTUNITIES_URL || '/data/opportunities.json';
    // 'default' lets the browser/CDN cache the blob per its Cache-Control header (the
    // refresh writes set a 1h max-age). Stale data is not a risk since items are filtered
    // by age and the feed refreshes every hour anyway.
    const res = await fetch(url, { cache: 'default' });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as Partial<OpportunitiesFile>;
    // Guard against a malformed / partially-written blob (writes aren't atomic).
    if (!Array.isArray(data?.opportunities)) return EMPTY;
    return { ts: typeof data.ts === 'number' ? data.ts : 0, opportunities: data.opportunities };
  } catch {
    return EMPTY;
  }
}
