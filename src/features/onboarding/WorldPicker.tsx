import { useState, useRef, useEffect } from 'react';
import type { WorldEntry } from './fetchWorldData';

interface Props {
  worlds: WorldEntry[];
  value: string;
  onChange: (world: string, dc: string) => void;
}

export function WorldPicker({ worlds, value, onChange }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? worlds.filter((w) => w.name.toLowerCase().includes(query.toLowerCase()))
    : worlds;

  // Group by DC
  const grouped = new Map<string, WorldEntry[]>();
  for (const w of filtered) {
    const arr = grouped.get(w.dc) ?? [];
    arr.push(w);
    grouped.set(w.dc, arr);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(w: WorldEntry) {
    setQuery(w.name);
    onChange(w.name, w.dc);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low mb-1 block">
          Home World
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange('', ''); }}
          onFocus={() => setOpen(true)}
          placeholder="Type your world name…"
          className="w-full bg-bg-card-hi border border-border-base text-text-cream font-mono text-sm px-3 py-2 placeholder:text-text-low"
        />
      </label>

      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-bg-card-hi border border-border-hi max-h-60 overflow-y-auto">
          {[...grouped.entries()].map(([dc, dcWorlds]) => (
            <div key={dc}>
              <div className="px-3 py-1 font-mono text-[9px] tracking-widest uppercase text-text-low bg-bg-card sticky top-0">
                {dc}
              </div>
              {dcWorlds.map((w) => (
                <button
                  key={w.name}
                  type="button"
                  onClick={() => select(w)}
                  className={`w-full text-left px-3 py-1.5 font-mono text-xs hover:bg-bg-card cursor-pointer ${
                    w.name === value ? 'text-gold' : 'text-text-cream'
                  }`}
                >
                  {w.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
