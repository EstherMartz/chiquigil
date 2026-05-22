import { useState } from 'react';
import { useBatchTrackerStore } from './batchTrackerStore';
import { BatchDetail } from './BatchDetail';
import { fmtGil } from '../../lib/format';

export function BatchHistoryView() {
  const batches = useBatchTrackerStore((s) => s.batches);
  const deleteBatch = useBatchTrackerStore((s) => s.deleteBatch);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (batches.length === 0) {
    return (
      <p className="text-text-dim text-sm font-mono text-center py-8">
        No saved batches yet. Generate a batch and click "Save &amp; Track" to start tracking.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {batches.map((batch) => {
        const isExpanded = expandedId === batch.batchId;
        const totalMaterialCost = batch.items.reduce((s, i) => s + i.materialCost, 0);
        const estimatedProfit = batch.items.reduce((s, i) => s + i.estimatedPrice, 0) - totalMaterialCost;
        const soldItems = batch.items.filter((i) => i.actualPrice !== null);
        const actualRevenue = soldItems.reduce((s, i) => s + i.actualPrice!, 0);
        const actualProfit = soldItems.length > 0 ? actualRevenue - totalMaterialCost : null;

        return (
          <div key={batch.batchId} className="border border-border-base rounded-lg overflow-hidden">
            {/* Card header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : batch.batchId)}
              className="w-full text-left px-4 py-3 bg-bg-card hover:bg-bg-card-hi transition-colors flex items-center gap-4 flex-wrap"
            >
              <span className="font-mono text-[11px] text-text-low">
                {new Date(batch.createdAt).toLocaleDateString()}
              </span>
              <span className={`font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 rounded ${
                batch.status === 'active'
                  ? 'bg-aether/20 text-aether'
                  : 'bg-text-dim/20 text-text-dim'
              }`}>
                {batch.status}
              </span>
              <span className="font-mono text-xs text-text-cream">
                {batch.items.length} items · {fmtGil(batch.budget)} budget
              </span>
              <span className="font-mono text-xs text-text-low">
                Est. profit: <span className="text-jade">{fmtGil(estimatedProfit)}</span>
              </span>
              {actualProfit !== null && (
                <span className="font-mono text-xs text-text-low">
                  Actual: <span className={actualProfit >= 0 ? 'text-jade' : 'text-crimson'}>
                    {fmtGil(actualProfit)}
                  </span>
                  <span className="text-text-dim ml-1">({soldItems.length}/{batch.items.length} sold)</span>
                </span>
              )}
              <span className="ml-auto font-mono text-text-dim">{isExpanded ? '▲' : '▼'}</span>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border-base p-4 space-y-3">
                <BatchDetail batch={batch} />
                <div className="flex justify-end">
                  <button
                    onClick={() => deleteBatch(batch.batchId)}
                    className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-crimson hover:text-crimson transition-colors"
                  >
                    Delete Batch
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
