import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import type { WatchlistRow } from '../../watchlist/buildRows';
import type { MoversDigest } from '../aggregate';

function MoverRow({ row, kind }: { row: WatchlistRow; kind: 'up' | 'down' | 'stale' }) {
  const price = row.dcMinHQ ?? row.dcMinNQ ?? null;
  const right =
    kind === 'stale'
      ? `${(row.staleDays ?? 0).toFixed(0)}d old`
      : `${(row.delta ?? 0) >= 0 ? '+' : ''}${row.delta}%`;
  const rightColor = kind === 'up' ? 'text-jade' : kind === 'down' ? 'text-crimson' : 'text-gold';
  return (
    <li className="flex items-center justify-between gap-2 py-1 border-b border-border-base/40 last:border-b-0">
      <Link
        to={`/item/${row.id}`}
        className="font-display text-[12px] text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 truncate min-w-0"
      >
        {row.name}
      </Link>
      <span className="flex items-center gap-2 shrink-0">
        {price != null && <span className="font-mono text-[10px] text-text-low tabular-nums">{fmtGil(price)}</span>}
        <span className={`font-mono text-[11px] tabular-nums ${rightColor}`}>{right}</span>
      </span>
    </li>
  );
}

function Column({ title, accent, rows, kind, empty }: {
  title: string; accent: string; rows: WatchlistRow[]; kind: 'up' | 'down' | 'stale'; empty: string;
}) {
  return (
    <div>
      <div className={`font-mono text-[9px] tracking-widest uppercase mb-1.5 ${accent}`}>{title}</div>
      {rows.length === 0 ? (
        <div className="text-text-low text-[11px] italic py-2">{empty}</div>
      ) : (
        <ul>{rows.map((r) => <MoverRow key={r.id} row={r} kind={kind} />)}</ul>
      )}
    </div>
  );
}

/** What moved on your watchlist this week (live market deltas, not your sales). */
export function ChangedDigest({ digest }: { digest: MoversDigest }) {
  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">What changed</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">7-day market move</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
        <Column title="▲ Spiking" accent="text-jade" rows={digest.gainers} kind="up" empty="Nothing spiking." />
        <Column title="▼ Crashing" accent="text-crimson" rows={digest.losers} kind="down" empty="Nothing crashing." />
        <Column title="◇ Going stale" accent="text-gold" rows={digest.stale} kind="stale" empty="All fresh." />
      </div>
    </div>
  );
}
