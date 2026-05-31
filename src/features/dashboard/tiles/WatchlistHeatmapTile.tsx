import { useMemo, useState } from 'react';
import { buildHeatmapCells } from '../../heatmap/buildHeatmapData';
import { HeatmapChart } from '../../heatmap/HeatmapChart';
import type { SnapshotItem } from '../../../lib/itemSnapshot';
import type { MarketData } from '../../../lib/universalis';
import type { Recipe } from '../../../lib/recipes';

type Scope = 'all' | 'craft';

/**
 * Full-width treemap of the watchlist — size = velocity, brightness = margin
 * tier, hue = play kind. Reuses the /heatmap building blocks (buildHeatmapCells
 * + HeatmapChart) so it stays in lockstep with that page. A scope toggle shows
 * the whole watchlist or just the craftable subset.
 */
export function WatchlistHeatmapTile({ items, market, recipes }: {
  items: SnapshotItem[];
  market: MarketData;
  recipes: Map<number, Recipe>;
}) {
  const [scope, setScope] = useState<Scope>('all');

  const allCells = useMemo(
    () => buildHeatmapCells(items, market, recipes),
    [items, market, recipes],
  );
  const cells = useMemo(
    () => (scope === 'craft' ? allCells.filter((c) => c.craftable) : allCells),
    [allCells, scope],
  );

  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">
          Watchlist heatmap
        </div>
        <div className="flex gap-1">
          {([['all', 'All'], ['craft', 'Craftable']] as [Scope, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setScope(id)}
              className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 transition-colors ${
                scope === id ? 'text-gold' : 'text-text-dim hover:text-aether'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {cells.length === 0 ? (
        <div className="flex items-center justify-center text-text-low text-sm italic" style={{ height: 120 }}>
          {scope === 'craft' ? 'No craftable items moving yet.' : 'No tracked items with market activity yet.'}
        </div>
      ) : (
        <HeatmapChart cells={cells} />
      )}
    </div>
  );
}
