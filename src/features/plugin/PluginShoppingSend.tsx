import { useState } from 'react';
import { usePluginBridge } from './usePluginBridge';

/**
 * Pushes a shopping list (item names + quantities) into the in-game plugin
 * window so it can be ticked off while buying. Invisible unless the plugin is
 * connected, advertises `actions`, and there's something to send.
 */
export function PluginShoppingSend({ items }: { items: { name: string; qty: number }[] }) {
  const bridge = usePluginBridge();
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!bridge.connected || !bridge.has('actions') || items.length === 0) return null;

  async function send() {
    setState('busy'); setError(null);
    try {
      const r = await bridge.pushShoppingList(items);
      if (r.ok) { setState('sent'); setTimeout(() => setState('idle'), 2000); }
      else { setState('idle'); setError(r.error ?? 'failed'); }
    } catch (e) {
      setState('idle'); setError((e as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={send}
        disabled={state === 'busy'}
        className="font-mono text-[11px] tracking-widest uppercase border border-jade/50 text-jade px-3 py-2 hover:bg-jade/10 disabled:opacity-50 transition-colors"
      >
        {state === 'busy' ? 'Sending…' : state === 'sent' ? '✓ Sent to plugin' : '→ Send to plugin'}
      </button>
      {error && <span className="font-mono text-[11px] text-crimson">{error}</span>}
    </div>
  );
}
