import type { SavedBatch } from './types';
import { useBatchTrackerStore } from './batchTrackerStore';
import { fmtGil } from '../../lib/format';
import { HqStar } from '../../components/HqStar';

interface Props {
  batch: SavedBatch;
}

export function BatchDetail({ batch }: Props) {
  const setActualPrice = useBatchTrackerStore((s) => s.setActualPrice);
  const clearActualPrice = useBatchTrackerStore((s) => s.clearActualPrice);
  const closeBatch = useBatchTrackerStore((s) => s.closeBatch);
  const isClosed = batch.status === 'closed';

  const totalMaterialCost = batch.items.reduce((s, i) => s + i.materialCost, 0);
  const estimatedRevenue = batch.items.reduce((s, i) => s + i.estimatedPrice, 0);
  const estimatedProfit = estimatedRevenue - totalMaterialCost;
  const soldItems = batch.items.filter((i) => i.actualPrice !== null);
  const actualRevenue = soldItems.reduce((s, i) => s + i.actualPrice!, 0);
  const actualProfit = actualRevenue - totalMaterialCost;

  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Material Cost" value={fmtGil(totalMaterialCost)} valueClass="text-crimson" />
        <StatCard label="Est. Profit" value={fmtGil(estimatedProfit)} valueClass="text-text-low" />
        <StatCard
          label="Actual Revenue"
          value={soldItems.length > 0 ? fmtGil(actualRevenue) : '—'}
          valueClass="text-jade"
          sub={`${soldItems.length}/${batch.items.length} sold`}
        />
        <StatCard
          label="Actual Profit"
          value={soldItems.length > 0 ? fmtGil(actualProfit) : '—'}
          valueClass={actualProfit > 0 ? 'text-jade' : actualProfit < 0 ? 'text-crimson' : 'text-text-cream'}
          sub={soldItems.length === batch.items.length ? 'Final' : 'Partial'}
        />
      </div>

      {/* Per-item table */}
      <div className="border border-border-base rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Mat Cost</th>
              <th className="text-right px-3 py-2">Est. Price</th>
              <th className="text-right px-3 py-2">Actual Price</th>
              <th className="text-right px-3 py-2">Delta</th>
            </tr>
          </thead>
          <tbody>
            {batch.items.map((item) => {
              const delta = item.actualPrice !== null ? item.actualPrice - item.estimatedPrice : null;
              return (
                <tr key={item.id} className="border-t border-border-base">
                  <td className="px-3 py-2 text-text-cream">
                    {item.name}{item.hq && <HqStar leading />}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-text-low">{fmtGil(item.materialCost)}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-low">{fmtGil(item.estimatedPrice)}</td>
                  <td className="px-3 py-2 text-right">
                    {isClosed ? (
                      <span className="font-mono">{item.actualPrice !== null ? fmtGil(item.actualPrice) : '—'}</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        value={item.actualPrice ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || val === '0') {
                            clearActualPrice(batch.batchId, item.id);
                          } else {
                            setActualPrice(batch.batchId, item.id, Number(val));
                          }
                        }}
                        placeholder="—"
                        className="bg-bg-card-lo border border-border-base text-text-cream font-mono text-xs px-2 py-1 w-24 text-right"
                      />
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${
                    delta === null ? 'text-text-low' : delta >= 0 ? 'text-jade' : 'text-crimson'
                  }`}>
                    {delta !== null ? `${delta >= 0 ? '+' : ''}${fmtGil(delta)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      {!isClosed && (
        <div className="flex justify-end">
          <button
            onClick={() => closeBatch(batch.batchId)}
            className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-3 py-2 hover:bg-gold hover:text-bg-deep transition-colors"
          >
            Close Batch
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, valueClass, sub }: {
  label: string; value: string; valueClass: string; sub?: string;
}) {
  return (
    <div className="bg-bg-card rounded-lg border border-border-base p-3">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-dim">{label}</div>
      <div className={`text-xl font-semibold font-mono mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-text-low text-[11px] font-mono">{sub}</div>}
    </div>
  );
}
