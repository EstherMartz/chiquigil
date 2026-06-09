import { Link } from 'react-router-dom';
import { fmtGil } from '../../../lib/format';
import { Skeleton } from '../../../components/Skeleton';
import type { WatchlistRow } from '../../watchlist/buildRows';
import type { MoversDigest } from '../aggregate';
import type { Valuation } from '../../fairvalue/fairValue';
import type { PatchMover } from '../patchMovers';

// "So what" tag bridging a price move to action. cheap/rich come from the
// fair-value signal; profitable is a craftable now turning a positive margin.
const VAL_TAG: Partial<Record<Valuation, { label: string; cls: string }>> = {
  cheap: { label: 'cheap', cls: 'text-jade border-jade/40' },
  rich: { label: 'rich', cls: 'text-gold border-gold/40' },
};

function moverTag(row: WatchlistRow, valuation: Valuation | undefined): { label: string; cls: string } | null {
  if (valuation && VAL_TAG[valuation]) return VAL_TAG[valuation]!;
  if (row.craftable === true && (row.profit ?? 0) > 0) {
    return { label: 'profitable', cls: 'text-aether border-aether/40' };
  }
  return null;
}

function MoverRow({ row, kind, valuation }: { row: WatchlistRow; kind: 'up' | 'down' | 'stale'; valuation?: Valuation }) {
  const price = row.dcMinHQ ?? row.dcMinNQ ?? null;
  const right =
    kind === 'stale'
      ? `${(row.staleDays ?? 0).toFixed(0)}d old`
      : `${(row.delta ?? 0) >= 0 ? '+' : ''}${Math.round(row.delta ?? 0)}%`;
  const rightColor = kind === 'up' ? 'text-jade' : kind === 'down' ? 'text-crimson' : 'text-gold';
  const tag = moverTag(row, valuation);
  return (
    <li className="flex flex-col gap-0.5 py-1 border-b border-border-base/40 last:border-b-0">
      <Link
        to={`/item/${row.id}`}
        title={row.name}
        className="font-display text-[12px] text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 leading-tight line-clamp-2 break-words"
      >
        {row.name}
      </Link>
      <div className="flex items-center gap-2">
        {tag && (
          <span className={`shrink-0 border ${tag.cls} px-1 py-px leading-none text-[8px] tracking-widest uppercase rounded-sm`}>
            {tag.label}
          </span>
        )}
        <span className="flex items-center gap-2 ml-auto shrink-0">
          {price != null && <span className="font-mono text-[10px] text-text-low tabular-nums">{fmtGil(price)}</span>}
          <span className={`font-mono text-[11px] tabular-nums ${rightColor}`}>{right}</span>
        </span>
      </div>
    </li>
  );
}

function Column({ title, accent, rows, kind, empty, valuationById }: {
  title: string; accent: string; rows: WatchlistRow[]; kind: 'up' | 'down' | 'stale'; empty: string;
  valuationById?: Map<number, Valuation>;
}) {
  return (
    <div>
      <div className={`font-mono text-[9px] tracking-widest uppercase mb-1.5 ${accent}`}>{title}</div>
      {rows.length === 0 ? (
        <div className="text-text-low text-[11px] italic py-2">{empty}</div>
      ) : (
        <ul>{rows.map((r) => <MoverRow key={r.id} row={r} kind={kind} valuation={valuationById?.get(r.id)} />)}</ul>
      )}
    </div>
  );
}

function ColumnSkeleton({ title, accent }: { title: string; accent: string }) {
  return (
    <div>
      <div className={`font-mono text-[9px] tracking-widest uppercase mb-1.5 ${accent}`}>{title}</div>
      <div className="space-y-1.5 py-1">
        {[0, 1, 2].map((i) => <Skeleton key={i} height={14} className="w-full" />)}
      </div>
    </div>
  );
}

function NewPatchColumn({ items, trackedIds }: { items: PatchMover[]; trackedIds?: Set<number> }) {
  const capped = items.slice(0, 6);
  return (
    <div>
      <div className="font-mono text-[9px] tracking-widest uppercase mb-1.5 text-aether">★ New this patch</div>
      {capped.length === 0 ? (
        <div className="text-text-low text-[11px] italic py-2">No new items selling yet — check back soon.</div>
      ) : (
        <ul>
          {capped.map((m) => (
            <li key={m.id} className="flex flex-col gap-0.5 py-1 border-b border-border-base/40 last:border-b-0">
              <Link
                to={`/item/${m.id}`}
                title={m.name}
                className="font-display text-[12px] text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 leading-tight line-clamp-2 break-words"
              >
                {m.name}
              </Link>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-text-low tabular-nums">{m.velocity.toFixed(1)}/d</span>
                <span className="ml-auto shrink-0">
                  {trackedIds?.has(m.id) ? (
                    <span className="font-mono text-[9px] tracking-widest uppercase text-text-low">[tracked]</span>
                  ) : (
                    <Link
                      to={`/item/${m.id}`}
                      className="font-mono text-[9px] tracking-widest uppercase border border-aether/40 text-aether px-1 py-px rounded-sm hover:bg-aether hover:text-bg-deep transition-colors"
                    >
                      [craft?]
                    </Link>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * What moved on your watchlist this week (live market deltas, not your sales).
 * `loading` = the 7-day history fetch is still in flight; show shimmer columns
 * rather than "Nothing spiking." which would read as a settled (wrong) answer.
 */
export function ChangedDigest({
  digest,
  valuationById,
  loading = false,
  newPatchItems,
  showNewPatch,
  trackedIds,
}: {
  digest: MoversDigest;
  valuationById?: Map<number, Valuation>;
  loading?: boolean;
  newPatchItems?: PatchMover[];
  showNewPatch?: boolean;
  trackedIds?: Set<number>;
}) {
  const gridCols = showNewPatch ? 'sm:grid-cols-4' : 'sm:grid-cols-3';
  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">What changed</div>
        <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">7-day market move</div>
      </div>
      <div className={`grid grid-cols-1 ${gridCols} gap-x-6 gap-y-3`}>
        {loading ? (
          <>
            <ColumnSkeleton title="▲ Spiking" accent="text-jade" />
            <ColumnSkeleton title="▼ Crashing" accent="text-crimson" />
            <ColumnSkeleton title="◇ Going stale" accent="text-gold" />
          </>
        ) : (
          <>
            <Column title="▲ Spiking" accent="text-jade" rows={digest.gainers} kind="up" empty="Nothing spiking." valuationById={valuationById} />
            <Column title="▼ Crashing" accent="text-crimson" rows={digest.losers} kind="down" empty="Nothing crashing." valuationById={valuationById} />
            <Column title="◇ Going stale" accent="text-gold" rows={digest.stale} kind="stale" empty="All fresh." valuationById={valuationById} />
            {showNewPatch && <NewPatchColumn items={newPatchItems ?? []} trackedIds={trackedIds} />}
          </>
        )}
      </div>
    </div>
  );
}
