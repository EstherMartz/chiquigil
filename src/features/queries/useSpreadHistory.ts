import { useQuery } from '@tanstack/react-query';
import type { SpreadHistoryMap } from '../../lib/spreadHistory';

/**
 * Read-only fetch of the server-built spread-freshness blob.
 * Resolves to {} when the blob is absent (before the server task ships, or in
 * dev), so the WINDOW column gracefully shows "New". Refetched every 5 min to
 * track the refresh cadence; failures are swallowed to {}.
 */
async function fetchSpreadHistory(): Promise<SpreadHistoryMap> {
  const env = (import.meta as any).env ?? {};
  const url: string = env.VITE_SPREAD_HISTORY_URL || '/data/spread-history.json';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return {};
    return (await res.json()) as SpreadHistoryMap;
  } catch {
    return {};
  }
}

export function useSpreadHistory() {
  return useQuery({
    queryKey: ['spread-history'],
    queryFn: fetchSpreadHistory,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
}
