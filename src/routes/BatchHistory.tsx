import { BatchHistoryView } from '../features/batchTracker/BatchHistoryView';

export default function BatchHistory() {
  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Batch History</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Track craft batch outcomes — compare estimated profits against actual sales.
        </p>
      </div>
      <BatchHistoryView />
    </div>
  );
}
