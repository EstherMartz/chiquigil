import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useMarketData } from '../watchlist/useMarketData';
import { usePluginBridge } from './usePluginBridge';
import { usePluginDataStore } from './pluginDataStore';
import { computeUndercuts } from './undercut';
import { fmtGil } from '../../lib/format';

/**
 * "Your listings" — pulls the player's own retainer listings from the plugin
 * and flags which have been undercut against the live market floor. Renders
 * nothing unless the plugin is connected and advertises the `listings`
 * capability, so it's invisible without the plugin.
 */
export function UndercutPanel() {
  // Thin gate: only mount the data-fetching body when the plugin is connected
  // and advertises listings, so the heavy snapshot/market hooks never run
  // (and never need a QueryClient) on a plain Planner render.
  const bridge = usePluginBridge();
  if (!bridge.connected || !bridge.has('listings')) return null;
  return <UndercutPanelInner />;
}

function UndercutPanelInner() {
  const bridge = usePluginBridge();
  const listings = usePluginDataStore((s) => s.listings);
  const { world, dc } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const namesById = useMemo(() => {
    const m = new Map<number, string>();
    for (const it of snapshot.data?.items ?? []) m.set(it.id, it.name);
    return m;
  }, [snapshot.data]);

  const ids = useMemo(
    () => (listings ? [...new Set(listings.listings.map((l) => l.itemId))] : []),
    [listings],
  );
  const market = useMarketData(ids, world, dc, undefined, { enabled: ids.length > 0 });

  const rows = useMemo(() => {
    if (!listings) return [];
    const floorOf = (itemId: number, hq: boolean): number | null => {
      const m = market.data?.phantom[String(itemId)] ?? market.data?.dc[String(itemId)];
      if (!m) return null;
      return (hq ? m.minHQ : m.minNQ) ?? null;
    };
    return computeUndercuts(listings.listings, floorOf);
  }, [listings, market.data]);

  const undercutCount = rows.filter((r) => r.status === 'undercut').length;

  async function check() {
    setBusy(true); setError(null);
    try { await bridge.requestListings(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-display text-xl text-text-cream tracking-wide">Your Listings</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-border-base to-transparent" />
        {listings && (
          <span className={`font-mono text-[11px] uppercase tracking-widest ${undercutCount > 0 ? 'text-crimson' : 'text-jade'}`}>
            {undercutCount > 0 ? `${undercutCount} undercut` : 'all holding'}
          </span>
        )}
      </div>

      <div className="border border-border-base bg-bg-card p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={check}
            disabled={busy}
            className="font-mono text-[11px] tracking-widest uppercase border border-jade/50 text-jade px-3 py-2 hover:bg-jade/10 disabled:opacity-50 transition-colors"
          >
            {busy ? 'Reading game…' : '⟲ Check my listings'}
          </button>
          <span className="font-mono text-[10px] text-text-low">
            compares your retainer prices to the live {world} floor
          </span>
          {error && <span className="font-mono text-[11px] text-crimson">{error}</span>}
        </div>

        {rows.length === 0 ? (
          <div className="font-mono text-[11px] text-text-low italic">
            {listings ? 'No active listings found.' : 'Pull your listings to check for undercuts.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                <th className="text-left py-1">Item</th>
                <th className="text-right py-1">Your price</th>
                <th className="text-right py-1">Floor</th>
                <th className="text-right py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.itemId}-${r.hq}-${r.retainer ?? ''}`} className="border-t border-border-base/50">
                  <td className="py-1.5">
                    <Link to={`/item/${r.itemId}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                      {namesById.get(r.itemId) ?? `#${r.itemId}`}
                    </Link>
                    {r.hq && <span className="text-gold text-[10px] ml-1">HQ</span>}
                    {r.retainer && <span className="font-mono text-[10px] text-text-low ml-2">{r.retainer}</span>}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{fmtGil(r.yourPrice)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-text-low">{r.floor != null ? fmtGil(r.floor) : '—'}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {r.status === 'undercut'
                      ? <span className="text-crimson">undercut −{fmtGil(r.undercutBy ?? 0)}</span>
                      : r.status === 'holding'
                        ? <span className="text-jade">holding</span>
                        : <span className="text-text-low">no data</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
