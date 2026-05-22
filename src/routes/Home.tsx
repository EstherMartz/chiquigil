import { WhatNowView } from '../features/whatnow/WhatNowView';

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">What Now?</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          One scan, five answers. The single best opportunity from each gil-making strategy on {'{'}your world{'}'}.
        </p>
      </div>
      <WhatNowView />
    </div>
  );
}
