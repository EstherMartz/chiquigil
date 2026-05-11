import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import type { RepostRow } from './types';

interface Props {
  rows: RepostRow[];
  totalCandidates: number;
  skippedChunks: number;
}

export function RepostResults({ rows, totalCandidates, skippedChunks }: Props) {
  if (rows.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
        No repost opportunities. Lower Min gap, lower Min discount %, or widen categories.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] text-text-low">
        Showing {rows.length} of {totalCandidates} candidates
        {skippedChunks > 0 && <span className="text-crimson"> · {skippedChunks} batch(es) skipped (Universalis error)</span>}
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Cheapest</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Wall</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Gap</th>
              <th className="text-right px-3 py-2">%</th>
              <th className="text-right px-3 py-2">Profit (after tax)</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Vel</th>
              <th className="text-right px-3 py-2">Gil / day</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className="px-3 py-2.5 font-mono text-text-low">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="text-text-cream">{r.name} {r.hq && <span className="text-gold">★</span>}</div>
                  <div className="font-mono text-[10px] text-text-low">{categoryLabel(r.sc)}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.cheapest)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{fmtGil(r.wall)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-jade hidden md:table-cell">+{fmtGil(r.gap)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-jade">{r.gapPct}%</td>
                <td className="px-3 py-2.5 text-right font-mono text-jade">+{fmtGil(r.taxedProfit)}</td>
                <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{r.velocity.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gold-hi">{fmtGil(Math.round(r.gilPerDay))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
