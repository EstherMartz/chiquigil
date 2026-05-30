import { useEffect, useRef } from 'react';

/**
 * Fires `run` exactly once, on the first render where `ready` is true.
 *
 * Used to auto-run a view's default scan as soon as its data (item snapshot,
 * shop/vendor catalog, etc.) is available — so default results appear without
 * the user clicking "Run scan". The fire is one-shot for the life of the
 * component: it never re-fires when `ready` stays true, toggles back to true,
 * or after a later manual `run.reset()`. A fresh mount gets a fresh auto-run.
 */
export function useInitialScan(ready: boolean, run: () => void): void {
  const fired = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (ready && !fired.current) {
      fired.current = true;
      runRef.current();
    }
  }, [ready]);
}
