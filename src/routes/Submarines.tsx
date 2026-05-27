import { useState } from 'react';
import { useSettingsStore } from '../features/settings/store';
import { SectionHeader } from '../components/SectionHeader';
import { RouteValuator } from '../features/submarines/RouteValuator';
import { LootPricer } from '../features/submarines/LootPricer';

type Tab = 'route' | 'loot';

const TABS: { id: Tab; label: string }[] = [
  { id: 'route', label: 'Route valuator' },
  { id: 'loot', label: 'Loot pricer' },
];

export default function Submarines() {
  const [tab, setTab] = useState<Tab>('route');
  const { submarineRank, submarineSlots, setSubmarineRank, setSubmarineSlots } = useSettingsStore();

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <SectionHeader label="Submarines" />
        <div className="flex items-end gap-3">
          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low">Rank</span>
            <input
              type="number"
              min={1}
              max={125}
              value={submarineRank}
              onChange={(e) => setSubmarineRank(Math.max(1, Math.min(125, Number(e.target.value) || 1)))}
              className="mt-1 block w-20 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low">Slots</span>
            <input
              type="number"
              min={1}
              max={5}
              value={submarineSlots}
              onChange={(e) => setSubmarineSlots(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
              className="mt-1 block w-20 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
      </div>

      <nav className="flex border-b border-border-base">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`font-mono text-[11px] tracking-widest uppercase px-4 py-3 border-b-2 transition-colors -mb-[1px] ${
              tab === t.id ? 'border-gold text-gold' : 'border-transparent text-text-dim hover:text-aether'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'route' && <RouteValuator />}
      {tab === 'loot' && <LootPricer />}
    </div>
  );
}
