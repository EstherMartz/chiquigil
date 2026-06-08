import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import { groupSpreadsByWorld, type WorldSpread } from '../aggregate';

/** Items cheaper on another world in your DC — buy there, resell at home. Grouped by destination world. */
export function SpreadBars({ spreads, homeWorld }: { spreads: WorldSpread[]; homeWorld: string }) {
  const groups = groupSpreadsByWorld(spreads);
  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Cross-world spread</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">buy off-world · sell on {homeWorld}</div>
      </div>
      {groups.length === 0 ? (
        <div className="text-text-low text-sm italic py-6 text-center">
          No tracked item is currently cheaper on another {homeWorld} DC world.
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.world}>
              <Link
                to={`/trading?world=${encodeURIComponent(g.world)}`}
                className="group flex items-baseline justify-between gap-2"
              >
                <span className="font-display text-[13px] text-text-cream group-hover:text-aether group-hover:underline decoration-1 underline-offset-4 truncate min-w-0">
                  {g.world} <span className="font-mono text-[10px] text-text-low">({g.itemCount} item{g.itemCount === 1 ? '' : 's'})</span>
                </span>
                <span className="font-mono text-[11px] tabular-nums shrink-0">
                  <span className="text-jade">+{fmtGil(g.totalSpread)}</span>
                  <span className="text-text-low"> · {Math.round(g.gilPerMillion)} gil/M</span>
                </span>
              </Link>
              <ul className="mt-1 space-y-0.5 pl-2 border-l border-border-base">
                {g.items.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-2">
                    <Link to={`/item/${s.id}`} className="font-display text-[11px] text-text-dim hover:text-aether truncate min-w-0">{s.name}</Link>
                    <span className="font-mono text-[10px] text-text-low tabular-nums shrink-0">
                      {fmtGil(s.bestPrice)} → {fmtGil(s.homeFloor)} · +{fmtGil(s.spread)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
