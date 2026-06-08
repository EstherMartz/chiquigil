import { useEffect, useState } from 'react';
import type { LiveStatus } from './useItemSocket';

function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

/** Tiny "live stream" indicator beside the item's LiveRefreshBar. */
export function LiveStreamChip({ status, liveAt }: { status: LiveStatus; liveAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'open') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  if (status === 'off') return null;
  if (status === 'connecting') {
    return <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">○ connecting…</span>;
  }
  if (status === 'closed') {
    return <span className="font-mono text-[10px] tracking-widest uppercase text-text-low/60">○ live off</span>;
  }
  return (
    <span className="font-mono text-[10px] tracking-widest uppercase text-jade inline-flex items-center gap-1">
      <span className="text-jade animate-pulse" aria-hidden>●</span>
      {liveAt ? `live · ${ago(liveAt, now)}` : 'live'}
    </span>
  );
}
