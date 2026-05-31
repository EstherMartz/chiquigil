import { useState } from 'react';
import { usePluginBridge } from './usePluginBridge';

/**
 * Per-item web→plugin actions. Renders an "Open in-game MB" button that opens
 * the marketboard and searches this item inside FFXIV. Invisible unless the
 * plugin is connected and advertises the `actions` capability.
 */
export function PluginItemActions({ itemId }: { itemId: number }) {
  const bridge = usePluginBridge();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!bridge.connected || !bridge.has('actions')) return null;

  async function openMb() {
    setBusy(true); setNote(null);
    try {
      const r = await bridge.openMarketboard(itemId);
      setNote(r.ok ? null : (r.error ?? 'failed'));
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
      if (note) setTimeout(() => setNote(null), 2500);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openMb}
        disabled={busy}
        title="Open the marketboard for this item in-game"
        className="font-mono text-[10px] tracking-widest uppercase border border-jade/50 text-jade px-3 py-2 hover:bg-jade/10 disabled:opacity-50 transition-colors"
      >
        {busy ? 'Opening…' : '⤢ Open in-game MB'}
      </button>
      {note && <span className="font-mono text-[10px] text-crimson self-center">{note}</span>}
    </>
  );
}
