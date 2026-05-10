import { STARTER_PACKS } from '../items/starterPacks';
import { useWatchlistStore } from '../items/watchlistStore';

export function PackToggles() {
  const { starterPacks, togglePack, excludedItems, toggleExcluded } = useWatchlistStore();
  const excludedSet = new Set(excludedItems);

  return (
    <ul className="space-y-2">
      {STARTER_PACKS.map((p) => {
        const on = starterPacks[p.id];
        const includedCount = on ? p.items.filter((i) => !excludedSet.has(i.id)).length : 0;
        return (
          <li key={p.id}>
            <details className="border border-border-base bg-bg-card group open:border-border-hi">
              <summary className="flex justify-between items-center px-3 py-2 cursor-pointer list-none font-mono text-xs">
                <span className="flex items-center gap-2">
                  <span
                    role="button"
                    onClick={(e) => { e.preventDefault(); togglePack(p.id); }}
                    className={`px-2 py-0.5 border text-[10px] tracking-widest uppercase ${
                      on ? 'border-gold text-gold bg-bg-card-hi' : 'border-border-base text-text-dim'
                    }`}
                  >
                    {on ? 'On' : 'Off'}
                  </span>
                  <span className="text-text-cream">{p.label}</span>
                </span>
                <span className="text-text-low text-[10px] tracking-widest uppercase">
                  {on ? `${includedCount} / ${p.items.length}` : `${p.items.length} items`}
                </span>
              </summary>
              {on && (
                <ul className="border-t border-border-base">
                  {p.items.map((item) => {
                    const isExcluded = excludedSet.has(item.id);
                    return (
                      <li key={item.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-border-base last:border-b-0">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => toggleExcluded(item.id)}
                          aria-label={`Include ${item.name}`}
                        />
                        <span className={`text-sm ${isExcluded ? 'text-text-low line-through' : 'text-text-cream'}`}>{item.name}</span>
                        <span className="font-mono text-[10px] text-text-low ml-auto">
                          {item.crafter} · lvl {item.lvl}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
}
