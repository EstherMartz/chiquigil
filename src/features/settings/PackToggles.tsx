import { STARTER_PACKS } from '../items/starterPacks';
import { useWatchlistStore } from '../items/watchlistStore';

export function PackToggles() {
  const { starterPacks, togglePack } = useWatchlistStore();
  return (
    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {STARTER_PACKS.map((p) => {
        const on = starterPacks[p.id];
        return (
          <li key={p.id}>
            <button
              onClick={() => togglePack(p.id)}
              className={`w-full text-left px-3 py-2 border font-mono text-xs flex justify-between items-center transition-colors ${
                on ? 'border-gold text-gold bg-bg-card-hi' : 'border-border-base text-text-dim hover:border-aether hover:text-aether'
              }`}
            >
              <span>{p.label}</span>
              <span className="text-[10px] tracking-widest uppercase">{on ? 'On' : 'Off'} · {p.items.length}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
