import { useState } from 'react';
import { usePluginBridge } from './usePluginBridge';

/**
 * Pulls the player's live gil from the plugin and hands it to `onSync` (the
 * Planner uses it to reconcile its tracked treasury to reality). Renders
 * nothing unless the plugin is connected and advertises the `gil` capability.
 */
export function PluginGilSync({ onSync }: { onSync: (gil: number) => void }) {
  const bridge = usePluginBridge();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!bridge.connected || !bridge.has('gil')) return null;

  async function sync() {
    setBusy(true); setError(null);
    try {
      const snap = await bridge.requestGil();
      onSync(snap.gil);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        className="font-mono text-[10px] tracking-widest uppercase border border-jade/50 text-jade px-2.5 py-1 hover:bg-jade/10 disabled:opacity-50 transition-colors"
      >
        {busy ? 'Reading…' : '⟲ Sync from game'}
      </button>
      {error && <span className="font-mono text-[10px] text-crimson">{error}</span>}
    </div>
  );
}
