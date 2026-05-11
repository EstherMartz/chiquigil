import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';
import type { CraftFlipRow } from './types';

interface Props {
  rows: CraftFlipRow[];
  totalCandidates: number;
  skippedChunks: number;
}

export function CraftFlipResults({ rows, totalCandidates, skippedChunks }: Props) {
  const lm = useLoadMore(rows, 25);
  if (rows.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
        No craft-flip opportunities. Try lowering Min velocity, raising Max listings, or widening categories.
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
              <th className="text-right px-3 py-2">Sale</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Materials</th>
              <th className="text-right px-3 py-2">Profit</th>
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
                    suffix={r.hq && <span className="text-gold"> ★</span>}
                    sub={categoryLabel(r.sc)}
                  />
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.unitPrice)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{fmtGil(r.materialCost)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-jade">+{fmtGil(r.profit)}</td>
                <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{r.velocity.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gold-hi">{fmtGil(Math.round(r.gilPerDay))}</td>
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
