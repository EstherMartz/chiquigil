import { CurrencyFlipView } from '../features/insights/CurrencyFlipView';

export default function CurrencyFlip() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Currency Optimizer</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Spend earned currency on vendor items, sell on home MB for the best gil/currency-unit ratio.
        </p>
      </div>
      <CurrencyFlipView />
    </div>
  );
}
