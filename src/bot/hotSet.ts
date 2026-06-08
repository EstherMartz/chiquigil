import type { MarketBundle } from './marketFetch';

/**
 * Items worth refreshing on the fast (hot) cadence: anything actively selling.
 * `velocity` is Universalis' regularSaleVelocity (sales/day). An item is hot if it
 * clears `velocityThreshold` in ANY scope (home / dc / region). Pure + sorted so the
 * output is deterministic and diffable; reused by the Tier-3 diff and the future
 * WebSocket worker.
 */
export function selectHotIds(bundle: MarketBundle, velocityThreshold: number): number[] {
  const hot = new Set<number>();
  for (const scope of [bundle.phantom, bundle.dc, bundle.region]) {
    for (const [id, item] of Object.entries(scope)) {
      if (item.velocity >= velocityThreshold) hot.add(Number(id));
    }
  }
  return [...hot].sort((a, b) => a - b);
}
