import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import type { WorldSpread } from '../aggregate';

/** Items cheaper on another world in your DC — buy there, resell at home. */
export function SpreadBars({ spreads, homeWorld }: { spreads: WorldSpread[]; homeWorld: string }) {
  const max = spreads.reduce((m, s) => Math.max(m, s.spread), 0);
  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Cross-world spread</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">buy off-world · sell on {homeWorld}</div>
      </div>
      {spreads.length === 0 ? (
        <div className="text-text-low text-sm italic py-6 text-center">
          No tracked item is currently cheaper on another {homeWorld} DC world.
        </div>
      ) : (
        <ul className="space-y-2">
          {spreads.map((s) => (
            <li key={s.id}>
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  to={`/item/${s.id}`}
                  className="font-display text-[12px] text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 truncate min-w-0"
                >
                  {s.name}
                </Link>
                <span className="font-mono text-[11px] text-jade tabular-nums shrink-0">
                  +{fmtGil(s.spread)} <span className="text-text-low">({(s.spreadPct * 100).toFixed(0)}%)</span>
                </span>
              </div>
              <div className="mt-1 h-2 bg-bg-deep overflow-hidden rounded-sm">
                <div className="h-full bg-aether" style={{ width: `${max > 0 ? Math.max(6, (s.spread / max) * 100) : 0}%` }} />
              </div>
              <div className="mt-1 font-mono text-[9px] tracking-widest uppercase text-text-low">
                {s.bestWorld} {fmtGil(s.bestPrice)} → home {fmtGil(s.homeFloor)} · {s.velocity.toFixed(1)}/day
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
