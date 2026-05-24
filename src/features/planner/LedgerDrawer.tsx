import { usePlannerStore } from './plannerStore';
import { fmt } from './plannerStats';

interface Props {
  open: boolean;
}

export function LedgerDrawer({ open }: Props) {
  const log = usePlannerStore((s) => s.log);
  const deleteLogEntry = usePlannerStore((s) => s.deleteLogEntry);

  if (!open) return null;

  if (log.length === 0) {
    return (
      <div className="mt-3 border border-border-base/50 bg-bg-deep/40 p-3 max-h-[340px] overflow-y-auto">
        <div className="font-mono text-xs text-text-low italic">
          No entries yet — log your first sale above.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-border-base/50 bg-bg-deep/40 max-h-[340px] overflow-y-auto">
      {[...log].reverse().map((l) => {
        const d = new Date(l.ts);
        const ds =
          d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
          ' ' +
          d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return (
          <div
            key={l.ts}
            className="flex items-center gap-3 font-mono text-xs px-3 py-2 border-b border-border-base/50 last:border-b-0 hover:bg-bg-card-hi/30 transition-colors"
          >
            <span className="text-text-low w-28 shrink-0">{ds}</span>
            <span className="text-text-dim flex-1 truncate">{l.note || 'untagged'}</span>
            <span className={`font-semibold text-right ${l.amount < 0 ? 'text-crimson' : 'text-jade'}`}>
              {l.amount >= 0 ? '+' : ''}{fmt(l.amount)}
            </span>
            <button
              type="button"
              onClick={() => deleteLogEntry(l.ts)}
              className="text-text-low hover:text-crimson pl-1 transition-colors"
              aria-label="Revert entry"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
