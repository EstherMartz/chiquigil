import { LevePlanner } from '../features/leves/LevePlanner';
import { useLevePlanQuery } from '../features/leves/useLevePlanQuery';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

export default function LevePlan() {
  const q = useLevePlanQuery();
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-gold tracking-wide">Levequest planner</h2>
          <p className="font-mono text-[11px] text-text-low max-w-prose">
            Best gil or exp per allowance, ranked.
          </p>
        </div>
        <button
          onClick={q.run}
          disabled={!q.ready || q.isPending}
          className="font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-gold text-gold disabled:border-border-base disabled:text-text-low"
        >
          {q.ready ? (q.isPending ? 'Running…' : 'Run query') : 'Loading data…'}
        </button>
      </div>

      {q.isPending && <Spinner label="Fetching leve market data…" />}
      {q.isError && <StatusBanner kind="error">Query failed: {(q.error as Error).message}</StatusBanner>}
      {q.skipped > 0 && (
        <StatusBanner kind="error">{q.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      <LevePlanner rows={q.rows} />
    </div>
  );
}
