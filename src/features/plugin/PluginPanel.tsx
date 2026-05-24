import { useEffect, useState } from 'react';
import { usePluginStore, type PluginConnectionStatus } from './pluginStore';

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
          placeholder="paste from the Dalamud plugin config window"
          className="font-mono text-xs bg-bg-card-hi border border-border-base px-2 py-1.5 text-text-cream focus:border-aether outline-none"
        />
      </div>

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
        {lastSnapshotAt && (
          <span className="font-mono text-[10px] text-text-low">
            last sync {lastSyncLabel}
          </span>
        )}
        {lastError && (
          <span className="font-mono text-[10px] text-crimson">{lastError}</span>
        )}
      </div>

      <p className="font-mono text-[10px] text-text-low">
        Requires the ChiquigilBridge Dalamud plugin running in FFXIV on this machine.
        Chrome, Edge, and Firefox can connect to <code>ws://127.0.0.1</code> from the deployed site.
        Safari does not allow this and is not supported.
      </p>
    </div>
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
