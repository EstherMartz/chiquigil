import { useSettingsStore } from '../features/settings/store';
import { WhatNowView } from '../features/whatnow/WhatNowView';

export default function Home() {
  const { world } = useSettingsStore();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">What Now?</h2>
        <p className="font-mono text-[13px] text-text-low max-w-prose">
          One scan, five answers. The single best opportunity from each gil-making strategy on {world}.
        </p>
      </div>
      <WhatNowView />
    </div>
  );
}
