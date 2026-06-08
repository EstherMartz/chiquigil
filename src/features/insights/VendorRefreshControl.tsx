import { useEffect, useRef, useState } from 'react';
import { FreshnessChip } from '../../components/FreshnessChip';
import { SpinGlyph } from '../../components/Spinner';

/** Re-clicks (and the auto pull) are blocked for this long after a refresh. */
const COOLDOWN_MS = 60_000;
/** Opt-in auto-refresh cadence — long enough that it never trips the cooldown. */
const AUTO_INTERVAL_MS = 5 * 60_000;

interface Props {
  /** Trigger the bulk price re-fetch. */
  onRefresh: () => void;
  /** A refresh is in flight. */
  busy: boolean;
  /** Catalog not loaded yet. */
  notReady: boolean;
  /** When the last successful refresh completed (ms epoch), or null if never. */
  lastRefreshTs: number | null;
}

/**
 * Bulk "refresh prices" control for the Vendor Flip view. Re-pulls live
 * marketboard prices for the whole candidate set, throttled by a cooldown so it
 * can't be hammered, with a freshness stamp and an opt-in slow auto-refresh.
 * Mirrors the per-item LiveRefreshBar idiom.
 */
export function VendorRefreshControl({ onRefresh, busy, notReady, lastRefreshTs }: Props) {
  const [auto, setAuto] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const cooldownLeft = lastRefreshTs != null ? Math.max(0, COOLDOWN_MS - (now - lastRefreshTs)) : 0;
  const onCooldown = cooldownLeft > 0;

  // Keep the latest props in refs so the auto interval's identity stays stable.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const lastRefreshTsRef = useRef(lastRefreshTs);
  lastRefreshTsRef.current = lastRefreshTs;

  // Tick the "now" clock only while a countdown or fetch is in flight.
  useEffect(() => {
    if (!onCooldown && !busy) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [onCooldown, busy]);

  // Opt-in auto-refresh: one immediate pull on enable (unless still cooling), then
  // every AUTO_INTERVAL_MS. Refs keep this effect from re-running each render.
  useEffect(() => {
    if (!auto) return;
    const ts = lastRefreshTsRef.current;
    const cooling = ts != null && Date.now() - ts < COOLDOWN_MS;
    if (!cooling) onRefreshRef.current();
    const t = setInterval(() => onRefreshRef.current(), AUTO_INTERVAL_MS);
    return () => clearInterval(t);
  }, [auto]);

  const disabled = busy || onCooldown || notReady;
  const label = onCooldown ? `Wait ${Math.ceil(cooldownLeft / 1000)}s` : '↻ Refresh prices';
  const buttonTitle = notReady
    ? 'Loading vendor catalog…'
    : onCooldown
      ? `Prices were just refreshed — re-fetch unlocks in ${Math.ceil(cooldownLeft / 1000)}s (throttle, not auto-run)`
      : 'Re-fetch live market prices from Universalis';

  return (
    <div className="flex items-center justify-end gap-3 flex-wrap font-mono text-[10px] tracking-widest uppercase text-text-low">
      {lastRefreshTs != null && <FreshnessChip ts={lastRefreshTs} now={now} />}

      <label
        title="Auto-refresh: re-fetch prices every 5 minutes while this page is open"
        className="flex items-center gap-1.5 cursor-pointer select-none hover:text-text-cream transition-colors"
      >
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
          className="accent-gold"
        />
        Auto <span className="text-text-low/70 normal-case tracking-normal">· every 5m</span>
      </label>

      <button
        type="button"
        onClick={onRefresh}
        disabled={disabled}
        title={buttonTitle}
        className="inline-flex items-center gap-1 font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {busy ? <>Refreshing…<SpinGlyph /></> : label}
      </button>
    </div>
  );
}
