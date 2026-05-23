import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DcFlipView } from '../features/insights/DcFlipView';
import { BestDealsView } from '../features/insights/BestDealsView';
import { MaterialFlipView } from '../features/insights/MaterialFlipView';
import { QueriesView } from '../features/queries/QueriesView';
import { SectionHeader } from '../components/SectionHeader';

type Tab = 'dcFlip' | 'deals' | 'materialFlip' | 'queries';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dcFlip',       label: 'DC Flip' },
  { id: 'deals',        label: 'Best deals' },
  { id: 'materialFlip', label: 'Material flip' },
  { id: 'queries',      label: 'Queries' },
];

export default function Trading() {
  const [params] = useSearchParams();
  const presetParam = params.get('preset') ?? undefined;
  const [tab, setTab] = useState<Tab>(presetParam ? 'queries' : 'dcFlip');
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <SectionHeader label="Trading" />
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
      {tab === 'dcFlip' && <DcFlipView />}
      {tab === 'deals' && <BestDealsView />}
      {tab === 'materialFlip' && <MaterialFlipView />}
      {tab === 'queries' && <QueriesView category="trading" initialPresetId={presetParam} />}
    </div>
  );
}
