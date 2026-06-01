import { useEffect, useState } from 'react';
import { usePluginStore, type PluginConnectionStatus } from './pluginStore';
import { usePluginDataStore } from './pluginDataStore';
import { usePluginBridge } from './usePluginBridge';
import type { Capability } from './protocol';

const STATUS_LABEL: Record<PluginConnectionStatus, string> = {
  idle: 'Disabled',
  connecting: 'Connecting…',
  open: 'Connected',
  closed: 'Disconnected',
  error: 'Error',
};

const STATUS_COLOR: Record<PluginConnectionStatus, string> = {
  idle: 'text-text-low',
  connecting: 'text-aether',
  open: 'text-jade',
  closed: 'text-text-low',
  error: 'text-crimson',
};

export function PluginPanel() {
  const enabled = usePluginStore((s) => s.enabled);
  const url = usePluginStore((s) => s.url);
  const token = usePluginStore((s) => s.token);
  const autoApply = usePluginStore((s) => s.autoApplySnapshots);
  const status = usePluginStore((s) => s.status);
  const lastSnapshotAt = usePluginStore((s) => s.lastSnapshotAt);
  const lastError = usePluginStore((s) => s.lastError);
  const pluginVersion = usePluginDataStore((s) => s.pluginVersion);
  const setEnabled = usePluginStore((s) => s.setEnabled);
  const setUrl = usePluginStore((s) => s.setUrl);
  const setToken = usePluginStore((s) => s.setToken);
  const setAutoApply = usePluginStore((s) => s.setAutoApplySnapshots);

  const lastSyncLabel = useRelativeTime(lastSnapshotAt);

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-gold w-4 h-4"
        />
        <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
          Enable in-game plugin connection
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr] items-center max-w-2xl">
        <label className="font-mono text-[10px] tracking-widest uppercase text-text-low">URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="ws://127.0.0.1:7331/sync"
          className="font-mono text-xs bg-bg-card-hi border border-border-base px-2 py-1.5 text-text-cream focus:border-aether outline-none"
        />
        <label className="font-mono text-[10px] tracking-widest uppercase text-text-low">Token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="paste, or use the plugin's one-click Pair button"
          className="font-mono text-xs bg-bg-card-hi border border-border-base px-2 py-1.5 text-text-cream focus:border-aether outline-none"
        />
      </div>

      <p className="font-mono text-[10px] text-text-low -mt-1">
        Tip: the plugin's <span className="text-aether">Pair with web</span> button opens this page with a one-click
        link — no token to copy. The link drops off the address bar automatically once applied.
      </p>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoApply}
          onChange={(e) => setAutoApply(e.target.checked)}
          className="accent-gold w-4 h-4"
        />
        <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
          Apply snapshots automatically (overwrites world, DC, and crafter levels)
        </span>
      </label>

      <div className="flex items-center gap-3 pt-2 border-t border-border-base">
        <span className={`font-mono text-[10px] tracking-widest uppercase ${STATUS_COLOR[status]}`}>
          ● {STATUS_LABEL[status]}
        </span>
        {status === 'open' && pluginVersion && (
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">
            plugin v{pluginVersion}
          </span>
        )}
        {lastSnapshotAt && (
          <span className="font-mono text-[10px] text-text-low">
            last sync {lastSyncLabel}
          </span>
        )}
        {lastError && (
          <span className="font-mono text-[10px] text-crimson">{lastError}</span>
        )}
      </div>

      {status === 'open' && <LiveSyncPanel />}

      <p className="font-mono text-[10px] text-text-low">
        Requires the ChiquigilBridge Dalamud plugin running in FFXIV on this machine.
        Chrome, Edge, and Firefox can connect to <code>ws://127.0.0.1</code> from the deployed site.
        Safari does not allow this and is not supported.
      </p>
    </div>
  );
}

const CAP_LABEL: Record<Capability, string> = {
  playerSnapshot: 'Player', inventory: 'Inventory', gil: 'Gil', listings: 'Listings', actions: 'Actions',
};

/** Live v2 data: negotiated capabilities, character, and on-demand pulls. */
function LiveSyncPanel() {
  const bridge = usePluginBridge();
  const character = usePluginDataStore((s) => s.character);
  const inventory = usePluginDataStore((s) => s.inventory);
  const gil = usePluginDataStore((s) => s.gil);
  const listings = usePluginDataStore((s) => s.listings);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setError(null);
    try { await fn(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className="border-t border-border-base pt-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {character && (
          <span className="font-mono text-[10px] text-text-cream">
            {character.name} · {character.world}/{character.dc}
          </span>
        )}
        <span className="flex items-center gap-1.5 flex-wrap">
          {bridge.capabilities.length === 0 && (
            <span className="font-mono text-[9px] text-text-low tracking-widest uppercase">no v2 capabilities</span>
          )}
          {bridge.capabilities.map((c) => (
            <span key={c} className="font-mono text-[9px] tracking-widest uppercase border border-jade/40 text-jade px-1.5 py-0.5 rounded-sm">
              {CAP_LABEL[c]}
            </span>
          ))}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {bridge.has('inventory') && (
          <PullButton busy={busy === 'inv'} label="Pull inventory"
            onClick={() => run('inv', () => bridge.requestInventory('all'))} />
        )}
        {bridge.has('gil') && (
          <PullButton busy={busy === 'gil'} label="Pull gil"
            onClick={() => run('gil', () => bridge.requestGil())} />
        )}
        {bridge.has('listings') && (
          <PullButton busy={busy === 'lst'} label="Pull listings"
            onClick={() => run('lst', () => bridge.requestListings())} />
        )}
      </div>

      <div className="font-mono text-[10px] text-text-low space-y-0.5">
        {inventory && <div>inventory: {inventory.items.length} stacks · {inventory.source}</div>}
        {gil && <div>gil: {gil.gil.toLocaleString()}</div>}
        {listings && <div>your listings: {listings.listings.length}</div>}
        {error && <div className="text-crimson">{error}</div>}
      </div>
    </div>
  );
}

function PullButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-aether px-2.5 py-1.5 hover:border-aether disabled:opacity-50 transition-colors"
    >
      {busy ? '…' : label}
    </button>
  );
}

function useRelativeTime(ts: number | null): string {
  const [, force] = useState(0);
  useEffect(() => {
    if (ts == null) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ts]);
  if (ts == null) return '';
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
