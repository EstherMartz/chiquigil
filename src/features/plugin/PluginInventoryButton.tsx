import { useState } from 'react';
import { usePluginBridge } from './usePluginBridge';
import { pluginInventoryToParseResult } from './pluginInventory';
import type { ParseResult } from '../cleanup/parseAllaganInventory';

interface Props {
  namesById: Map<number, string>;
  onLoaded: (result: ParseResult) => void;
}

/**
 * Pulls the player's live in-game inventory from the connected plugin and hands
 * it back in the same shape as a parsed CSV. Renders nothing unless the plugin
 * is connected and advertises the `inventory` capability — so the CSV import
 * stays the fallback when the plugin is absent.
 */
export function PluginInventoryButton({ namesById, onLoaded }: Props) {
  const bridge = usePluginBridge();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!bridge.connected || !bridge.has('inventory')) return null;

  async function load() {
    setBusy(true); setError(null);
    try {
      const snap = await bridge.requestInventory('all');
      onLoaded(pluginInventoryToParseResult(snap, namesById));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={load}
        disabled={busy}
        className="font-mono text-[11px] tracking-widest uppercase border border-jade/50 text-jade px-3 py-2 hover:bg-jade/10 disabled:opacity-50 transition-colors"
      >
        {busy ? 'Reading game…' : '⟲ Use in-game inventory'}
      </button>
      <span className="font-mono text-[10px] text-text-low">
        live from the plugin{bridge.character ? ` · ${bridge.character.name}` : ''}
      </span>
      {error && <span className="font-mono text-[11px] text-crimson">{error}</span>}
    </div>
  );
}
