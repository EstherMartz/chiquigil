import { useMemo, useState } from 'react';
import { usePlannerStore } from './plannerStore';
import { fmt, type LogEntry } from './plannerStats';
import { LANE_ORDER } from './seedPlanner';
import { AddItemModal } from './AddItemModal';

export function SalesInsights() {
  const log = usePlannerStore((s) => s.log);
  const lanes = usePlannerStore((s) => s.lanes);
  const addItem = usePlannerStore((s) => s.addItem);

  const [addModal, setAddModal] = useState<{ name: string; price: number } | null>(null);

  const csvEntries = useMemo(
    () => log.filter((l) => l.source === 'csv-import').sort((a, b) => b.ts - a.ts),
    [log],
  );

  const suggestions = useMemo(() => {
    const unmatched = csvEntries.filter((l) => !l.itemId && l.csvName);
    const agg = new Map<string, { name: string; qty: number; total: number }>();
    for (const entry of unmatched) {
      const key = entry.csvName!.toLowerCase();
      const prev = agg.get(key) ?? { name: entry.csvName!, qty: 0, total: 0 };
      prev.qty += 1;
      prev.total += entry.amount;
      agg.set(key, prev);
    }
    return [...agg.values()].sort((a, b) => b.total - a.total);
  }, [csvEntries]);

  if (csvEntries.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-display text-xl text-text-cream tracking-wide">Sales Insights</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-border-base to-transparent" />
        <span className="font-mono text-[11px] text-text-low uppercase tracking-widest">
          {csvEntries.length} imported
        </span>
      </div>

      {suggestions.length > 0 && (
        <div>
          <div className="font-mono text-[11px] tracking-widest uppercase text-text-low mb-2">
            Unplanned sales — consider adding
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {suggestions.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between gap-2 border border-border-base bg-bg-card-hi/40 px-3 py-2"
              >
                <div>
                  <div className="font-mono text-sm text-text-cream">{s.name}</div>
                  <div className="font-mono text-[11px] text-text-low">
                    {s.qty}× sold · <span className="text-gold">{fmt(s.total)}</span> gil
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAddModal({ name: s.name, price: Math.round(s.total / s.qty) })}
                  className="font-mono text-[10px] tracking-widest uppercase text-gold border border-gold/30 px-2 py-1 hover:bg-gold/10 transition-colors shrink-0"
                >
                  + Plan
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="font-mono text-[11px] tracking-widest uppercase text-text-low mb-2">
          Recent sales
        </div>
        <div className="border border-border-base bg-bg-deep/40 max-h-[400px] overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="font-mono text-[10px] tracking-widest uppercase text-text-low border-b border-border-base sticky top-0 bg-bg-deep">
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Retainer</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {csvEntries.map((entry, i) => (
                <SaleRow key={`${entry.ts}-${i}`} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addModal && (
        <AddItemModal
          lane="craft"
          onAdd={(partial) => addItem('craft', partial)}
          onClose={() => setAddModal(null)}
          prefill={{ name: addModal.name, price: addModal.price }}
        />
      )}
    </div>
  );
}

function SaleRow({ entry }: { entry: LogEntry }) {
  const d = new Date(entry.ts);
  const ds =
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const isPlanned = !!entry.itemId;

  return (
    <tr className="font-mono text-xs border-b border-border-base/50 last:border-b-0 hover:bg-bg-card-hi/30 transition-colors">
      <td className="px-3 py-2 text-text-cream">{entry.csvName ?? entry.note}</td>
      <td className="px-3 py-2 text-right text-text-dim">—</td>
      <td className="px-3 py-2 text-right text-gold">{fmt(entry.amount)}</td>
      <td className="px-3 py-2 text-text-dim">{entry.retainer ?? '—'}</td>
      <td className="px-3 py-2 text-text-low">{ds}</td>
      <td className="px-3 py-2">
        {isPlanned ? (
          <span className="text-jade bg-jade/10 border border-jade/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
            Planned
          </span>
        ) : (
          <span className="text-aether bg-aether/10 border border-aether/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
            Unplanned
          </span>
        )}
      </td>
    </tr>
  );
}
