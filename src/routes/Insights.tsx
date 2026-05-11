import { useState } from 'react';
import { ArbitrageView } from '../features/insights/ArbitrageView';
import { BestDealsView } from '../features/insights/BestDealsView';
import { MarketshareView } from '../features/insights/MarketshareView';

type Tab = 'arbitrage' | 'deals' | 'marketshare';

const TABS: { id: Tab; label: string }[] = [
  { id: 'arbitrage',   label: 'Arbitrage' },
  { id: 'deals',       label: 'Best deals' },
  { id: 'marketshare', label: 'Marketshare' },
];

export default function Insights() {
  const [tab, setTab] = useState<Tab>('arbitrage');
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
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
      {tab === 'arbitrage' && <ArbitrageView />}
      {tab === 'deals' && <BestDealsView />}
      {tab === 'marketshare' && <MarketshareView />}
    </div>
  );
}
