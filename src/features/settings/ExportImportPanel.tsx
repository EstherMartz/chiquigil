import { useRef, useState } from 'react';
import { useSettingsStore } from './store';
import { useWatchlistStore } from '../items/watchlistStore';
import { buildExportPayload, parseImportPayload } from './exportImport';

export function ExportImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  function onExport() {
    const settings = useSettingsStore.getState();
    const watchlist = useWatchlistStore.getState();
    const payload = buildExportPayload(settings, watchlist);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    a.href = url;
    a.download = `ffxiv-helper-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: 'ok', msg: 'Exported.' });
  }

  async function onImport(file: File) {
    try {
      const text = await file.text();
      const payload = parseImportPayload(text);
      useSettingsStore.setState(payload.settings);
      useWatchlistStore.setState(payload.watchlist);
      setStatus({ kind: 'ok', msg: 'Imported. Reload may help if anything looks stale.' });
    } catch (e) {
      setStatus({ kind: 'error', msg: (e as Error).message });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onExport}
          className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-4 py-2 hover:bg-aether hover:text-bg-deep"
        >
          Export JSON
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep"
        >
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
      </div>
      {status && (
        <div className={`font-mono text-xs ${status.kind === 'ok' ? 'text-jade' : 'text-crimson'}`}>{status.msg}</div>
      )}
    </div>
  );
}
