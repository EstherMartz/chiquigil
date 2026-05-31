/**
 * Shared "data freshness" stamp — a colored dot + relative age, matching the
 * idiom used on the Heatmap and What Now? pages. Green < 15m, gold < 60m,
 * crimson beyond.
 */

function formatAgo(ts: number, now: number): string {
  const diffMin = Math.max(0, Math.floor((now - ts) / 60_000));
  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1m ago';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hr = Math.floor(diffMin / 60);
  return hr === 1 ? '1h ago' : `${hr}h ago`;
}

function freshnessTone(ageMin: number): { dot: string; text: string; label: string } {
  if (ageMin < 15) return { dot: 'bg-jade', text: 'text-jade', label: 'Fresh' };
  if (ageMin < 60) return { dot: 'bg-gold', text: 'text-gold', label: 'OK' };
  return { dot: 'bg-crimson', text: 'text-crimson', label: 'Stale' };
}

export function FreshnessChip({ ts, now }: { ts: number; now: number }) {
  const ageMin = Math.max(0, Math.floor((now - ts) / 60_000));
  const fresh = freshnessTone(ageMin);
  return (
    <div className={`flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase ${fresh.text}`}>
      <span aria-hidden className={`inline-block w-1.5 h-1.5 rounded-full ${fresh.dot}`} />
      <span>{fresh.label} · {formatAgo(ts, now)}</span>
    </div>
  );
}
