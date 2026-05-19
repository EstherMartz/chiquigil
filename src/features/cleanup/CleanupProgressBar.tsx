interface Stage {
  label: string;
  done: number;
  total: number;
  status: 'pending' | 'active' | 'done';
}

interface CleanupProgressBarProps {
  stages: Stage[];
}

/**
 * Two-stage progress indicator for the cleanup view. Each stage shows a bar
 * + count; the active stage's bar pulses softly. Stages already complete
 * stay visible in muted color so the user can see what's done.
 */
export function CleanupProgressBar({ stages }: CleanupProgressBarProps) {
  return (
    <div className="space-y-2 font-mono text-[11px]">
      {stages.map((s) => {
        const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : (s.status === 'done' ? 100 : 0);
        const barColor =
          s.status === 'done' ? 'bg-jade'
          : s.status === 'active' ? 'bg-aether animate-pulse'
          : 'bg-border-base';
        const labelColor =
          s.status === 'done' ? 'text-text-low'
          : s.status === 'active' ? 'text-text-cream'
          : 'text-text-low';
        return (
          <div key={s.label}>
            <div className={`flex items-center justify-between ${labelColor}`}>
              <span>
                {s.status === 'done' ? '✓ ' : s.status === 'active' ? '▸ ' : '  '}
                {s.label}
              </span>
              <span className="text-text-low">
                {s.total > 0 ? `${s.done} / ${s.total}` : s.status === 'done' ? 'done' : '—'}
              </span>
            </div>
            <div className="h-1 bg-border-base/40 rounded mt-0.5 overflow-hidden">
              <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
