import { useMemo, useState } from 'react';
import { buildHeatmapCells } from '../../heatmap/buildHeatmapData';
import { HeatmapChart } from '../../heatmap/HeatmapChart';
import { Skeleton } from '../../../components/Skeleton';
import type { SnapshotItem } from '../../../lib/itemSnapshot';
import type { MarketData } from '../../../lib/universalis';
import type { Recipe } from '../../../lib/recipes';

type Scope = 'all' | 'craft';
type SizeMode = 'velocity' | 'opportunity';

/**
 * Full-width treemap of the watchlist — brightness = margin tier, hue = play
 * kind. Reuses the /heatmap building blocks so it stays in lockstep with that
 * page. Two toggles: scope (all vs craftable) and what tile size encodes —
 * Velocity (raw sales/day) or Best ratio (gil/day money-flow = sale × margin ×
 * velocity), so the best plays rise visually instead of just the busiest ones.
 */
export function WatchlistHeatmapTile({ items, market, recipes, loading = false }: {
  items: SnapshotItem[];
  market: MarketData;
  recipes: Map<number, Recipe>;
  /** Inputs still resolving (snapshot/market). Show a shimmer instead of the
   * "no activity" empty state so an unloaded heatmap never reads as empty. */
  loading?: boolean;
}) {
  const [scope, setScope] = useState<Scope>('all');
  const [sizeMode, setSizeMode] = useState<SizeMode>('velocity');

  const allCells = useMemo(
    () => buildHeatmapCells(items, market, recipes),
    [items, market, recipes],
  );
  const cells = useMemo(() => {
    const scoped = scope === 'craft' ? allCells.filter((c) => c.craftable) : allCells;
    if (sizeMode === 'velocity') return scoped;
    // Best ratio = money flow. Sizing by margin × velocity alone is a near
    // no-op when margins cluster (e.g. all ~95%), so weight by sale price too:
    // gil/day ≈ salePrice × margin × velocity (profit flow). Non-craftables
    // (margin null) fall back to revenue flow salePrice × velocity.
    return scoped.map((c) => {
      const flow = c.salePrice * (c.margin ?? 1) * c.velocity;
      return { ...c, area: Math.max(0.01, flow) };
    });
  }, [allCells, scope, sizeMode]);

  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">
          Watchlist heatmap
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {([['velocity', 'Velocity'], ['opportunity', 'Best ratio']] as [SizeMode, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSizeMode(id)}
                title={id === 'opportunity' ? 'Size by margin × velocity' : 'Size by sales/day'}
                className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 transition-colors ${
                  sizeMode === id ? 'bg-bg-card-hi text-aether' : 'text-text-dim hover:text-aether'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-text-low">·</span>
          <div className="flex gap-1">
            {([['all', 'All'], ['craft', 'Craftable']] as [Scope, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setScope(id)}
                className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 transition-colors ${
                  scope === id ? 'bg-bg-card-hi text-aether' : 'text-text-dim hover:text-aether'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {loading ? (
        <Skeleton height={120} className="w-full" />
      ) : cells.length === 0 ? (
        <div className="flex items-center justify-center text-text-low text-sm italic" style={{ height: 120 }}>
          {scope === 'craft' ? 'No craftable items moving yet.' : 'No tracked items with market activity yet.'}
        </div>
      ) : (
        <HeatmapChart cells={cells} />
      )}
    </div>
  );
}
