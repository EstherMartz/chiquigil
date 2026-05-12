import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';
import type { QueryResultRow } from './types';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';

interface Props {
  rows: QueryResultRow[];
  totalCandidates: number;
  skippedChunks: number;
  gatheringCatalog?: GatheringCatalog;
}

export function QueryResults({ rows, totalCandidates, skippedChunks, gatheringCatalog }: Props) {
  const lm = useLoadMore(rows, 25);
  if (rows.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
        No items match this filter. Try lowering the discount threshold or widening the price range.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] text-text-low">
        {rows.length} matches from {totalCandidates} candidates
        {skippedChunks > 0 && <span className="text-crimson"> · {skippedChunks} batch(es) skipped (Universalis error)</span>}
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Current</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Average</th>
              <th className="text-right px-3 py-2">Disc.</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Velocity</th>
              <th className="text-right px-3 py-2">Gil / day</th>
            </tr>
          </thead>
          <tbody>
            {lm.visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className="px-3 py-2.5 font-mono text-text-low">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <ItemNameLinks
                    id={r.id}
                    name={r.name}
                    suffix={
                      <>
                        {r.hq && <span className="text-gold"> ★</span>}
                        {gatheringCatalog && <GatherBadge info={gatheringCatalog.get(r.id)} />}
                      </>
                    }
                    sub={categoryLabel(r.sc)}
                  />
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.unitPrice)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{fmtGil(r.averagePrice)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-jade">-{r.dealPct}%</td>
                <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{r.velocity.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gold-hi">{fmtGil(Math.round(r.gilFlow))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <LoadMoreFooter
          hasMore={lm.hasMore}
          total={lm.total}
          shown={lm.shown}
          onLoadMore={lm.loadMore}
        />
      </div>
    </div>
  );
}

function GatherBadge({ info }: { info: { level: number; timed: boolean; hidden: boolean } | undefined }) {
  if (!info) return null;
  return (
    <span
      className={`ml-1.5 font-mono text-[9px] tracking-widest uppercase px-1 py-0.5 leading-none border ${
        info.timed
          ? 'text-gold border-gold/60'
          : 'text-aether border-border-base'
      }`}
      title={info.timed ? 'Timed gathering node (ephemeral/rare-pop)' : 'Untimed gathering node'}
    >
      {info.timed ? '⏱ Timed' : 'Gather'} · Lv {info.level || '?'}
    </span>
  );
}
