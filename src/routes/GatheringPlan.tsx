import { Link } from 'react-router-dom';
import { GatheringPlanner } from '../features/gathering/GatheringPlanner';
import { useGatheringQuery } from '../features/gathering/useGatheringQuery';
import { useGatheringCatalog } from '../features/queries/useGatheringCatalog';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

export default function GatheringPlan() {
  const q = useGatheringQuery();
  const catalog = useGatheringCatalog();

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-gold tracking-wide">Plan a session</h2>
          <p className="font-mono text-[11px] text-text-low max-w-prose">
            Brain-off picks for your next auto-gather run.
          </p>
        </div>
        <button
          onClick={q.run}
          disabled={!q.ready || q.isPending}
          className="font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-gold text-gold disabled:border-border-base disabled:text-text-low"
        >
          {q.ready ? (q.isPending ? 'Runningâ€¦' : 'Run query') : 'Loading dataâ€¦'}
        </button>
      </div>

      {q.isPending && <Spinner label="Fetching gathering market dataâ€¦" />}
      {q.isError && <StatusBanner kind="error">Query failed: {(q.error as Error).message}</StatusBanner>}
      {q.skipped > 0 && (
        <StatusBanner kind="error">{q.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      <GatheringPlanner rows={q.rows} catalog={catalog.data} />

      <div>
        <Link to="/gathering" className="font-mono text-[10px] tracking-widest uppercase text-text-dim hover:text-aether">
          â† Browse all gatherables
        </Link>
      </div>
    </div>
  );
}
