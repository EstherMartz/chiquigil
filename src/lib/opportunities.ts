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
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as OpportunitiesFile;
    return { ts: data.ts ?? 0, opportunities: data.opportunities ?? [] };
  } catch {
    return EMPTY;
  }
}
