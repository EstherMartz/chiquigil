import { useSettingsStore } from './store';

export function SessionDefaults() {
  const {
    overheadMinutes, batchCapDays, defaultCraftTimeSeconds,
    setOverheadMinutes, setBatchCapDays, setDefaultCraftTimeSeconds,
  } = useSettingsStore();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Overhead (min)</span>
        <input
          type="number" min={0} max={60}
          value={overheadMinutes}
          onChange={(e) => setOverheadMinutes(Math.max(0, Number(e.target.value) || 0))}
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
        <span className="block mt-1 font-mono text-[10px] text-text-low">subtracted from time budget</span>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Default craft (sec)</span>
        <input
          type="number" min={5} max={600}
          value={defaultCraftTimeSeconds}
          onChange={(e) => setDefaultCraftTimeSeconds(Math.max(5, Number(e.target.value) || 0))}
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
        <span className="block mt-1 font-mono text-[10px] text-text-low">heuristic baseline</span>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Batch cap (days)</span>
        <input
          type="number" min={1} max={30}
          value={batchCapDays}
          onChange={(e) => setBatchCapDays(Math.max(1, Number(e.target.value) || 0))}
          className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
        <span className="block mt-1 font-mono text-[10px] text-text-low">qty cap = velocity × this</span>
      </label>
    </div>
  );
}
