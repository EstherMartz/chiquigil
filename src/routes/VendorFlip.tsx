import { VendorFlipView } from '../features/insights/VendorFlipView';

export default function VendorFlip() {
  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Vendor Flip</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Flip NPC gil-shop items on your home MB. Compare fixed vendor prices against your home-world sale tier and rank by profit/day.
        </p>
      </div>
      <VendorFlipView />
    </div>
  );
}
