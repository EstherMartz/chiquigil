import { fmtGil } from '../../lib/format';
import type { SessionResult } from './packSession';

export function SessionResults({ result }: { result: SessionResult | null }) {
  if (!result) return null;
  if (result.picks.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
        No items fit your budget — try a longer time, lower min-profit, or different strategy.
      </div>
    );
  }
  return (
    <div className="border border-border-base bg-bg-card">
      <div className="px-4 py-3 border-b border-border-base flex justify-between items-baseline">
        <div className="font-mono text-[10px] tracking-widest text-text-low uppercase">
          {result.picks.length} items · {Math.round(result.totalSeconds / 60)} min
        </div>
        <div className="font-display text-xl text-gold-hi">
          ~{fmtGil(result.totalGil)} <span className="text-xs text-text-dim">expected</span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
            <th className="text-left px-3 py-2">Item</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2 hidden md:table-cell">Time</th>
            <th className="text-right px-3 py-2 hidden md:table-cell">Profit ea</th>
            <th className="text-right px-3 py-2">Total gil</th>
          </tr>
        </thead>
        <tbody>
          {result.picks.map((p) => (
            <tr key={p.id} className="border-t border-border-base">
              <td className="px-3 py-2.5">
                <div className="text-text-cream">{p.name}</div>
                <div className="font-mono text-[10px] text-text-low">{p.crafter}</div>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-gold">×{p.batch}</td>
              <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">
                {Math.round(p.totalSeconds / 60)} min
              </td>
              <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">
                {fmtGil(p.profit)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-jade">{fmtGil(p.totalGil)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
