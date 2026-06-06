import { useCallback, useEffect, useState } from 'react';

export interface Cooldown {
  /** True while the cooldown window is active. */
  onCooldown: boolean;
  /** Whole seconds remaining (0 when not on cooldown). */
  secondsLeft: number;
  /** Begin (or restart) the cooldown window. */
  start: () => void;
}

/**
 * A simple timed cooldown for throttling an action (e.g. a "live refresh"
 * button). `start()` opens an `ms` window during which `onCooldown` is true and
 * `secondsLeft` counts down. A ticking interval runs only while on cooldown.
 */
export function useCooldown(ms: number): Cooldown {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const start = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setUntil(t + ms);
  }, [ms]);

  const remaining = until ? Math.max(0, until - now) : 0;
  const onCooldown = remaining > 0;

  useEffect(() => {
    if (!onCooldown) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [onCooldown]);

  return { onCooldown, secondsLeft: Math.ceil(remaining / 1000), start };
}
