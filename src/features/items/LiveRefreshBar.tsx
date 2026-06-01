import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMarketLive } from '../../lib/universalis';

/** Re-clicks (and the auto pull) are blocked for this long after a refresh. */
const COOLDOWN_MS = 60_000;
/** Opt-in auto-refresh cadence — long enough that it never trips the cooldown. */
const AUTO_INTERVAL_MS = 5 * 60_000;

interface Props {
  itemId: number;
  homeWorld: string;
  dc: string;
  /** Region scope (e.g. 'Europe'); '' to skip. */
  region: string;
  /** Re-read the freshly-updated market cache into the page's query. */
  onRefreshed: () => void;
}

function agoLabel(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

/**
 * Per-item "live refresh" control for the item page. Pulls this one item's
 * prices straight from Universalis (all three scopes), bypassing the hourly
 * blob, then re-reads them into the page. Throttled by a cooldown so it can't
 * be hammered; an opt-in toggle re-pulls on a slow interval while it's open.
 */
export function LiveRefreshBar({ itemId, homeWorld, dc, region, onRefreshed }: Props) {
  const [busy, setBusy] = useState(false);
  const [lastTs, setLastTs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const cooldownLeft = lastTs ? Math.max(0, COOLDOWN_MS - (now - lastTs)) : 0;
  const onCooldown = cooldownLeft > 0;

  // Keep the latest onRefreshed in a ref so the interval/callback identity is stable.
  const onRefreshedRef = useRef(onRefreshed);
  onRefreshedRef.current = onRefreshed;

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await Promise.all([
        fetchMarketLive(homeWorld, [itemId]),
        fetchMarketLive(dc, [itemId]),
        region ? fetchMarketLive(region, [itemId]) : Promise.resolve({}),
      ]);
      setLastTs(Date.now());
      onRefreshedRef.current();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [itemId, homeWorld, dc, region]);

  // Tick the "now" clock only while a countdown or fetch is in flight.
  useEffect(() => {
    if (!onCooldown && !busy) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [onCooldown, busy]);

  // Opt-in auto-refresh: one pull on enable, then every AUTO_INTERVAL_MS.
  useEffect(() => {
    if (!auto) return;
    refresh();
    const t = setInterval(() => refresh(), AUTO_INTERVAL_MS);
    return () => clearInterval(t);
  }, [auto, refresh]);

  const disabled = busy || onCooldown;
  const label = busy
    ? 'Refreshing…'
    : onCooldown
      ? `Wait ${Math.ceil(cooldownLeft / 1000)}s`
      : '↻ Live refresh';

  return (
    <div className="flex items-center justify-end gap-3 flex-wrap font-mono text-[10px] tracking-widest uppercase text-text-low">
      {error ? (
        <span className="text-crimson normal-case tracking-normal">Live fetch failed: {error}</span>
      ) : lastTs ? (
        <span className="text-jade">Live · {agoLabel(lastTs, now)}</span>
      ) : null}

      <label className="flex items-center gap-1.5 cursor-pointer select-none hover:text-text-cream transition-colors">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
          className="accent-jade"
        />
        Auto
      </label>

      <button
        type="button"
        onClick={refresh}
        disabled={disabled}
        title="Fetch this item's live prices from Universalis"
        className="border border-jade/60 text-jade px-3 py-1.5 hover:bg-jade/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {label}
      </button>
    </div>
  );
}
