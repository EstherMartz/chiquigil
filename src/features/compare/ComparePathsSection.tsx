import { forwardRef, useState } from 'react';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Spinner';
import { CompareControls } from './CompareControls';
import { PathCardView } from './PathCard';
import { useComparePaths, type MaterialSource } from './useComparePaths';

export const ComparePathsSection = forwardRef<HTMLDivElement, { itemId: number | null }>(
  function ComparePathsSection({ itemId }, ref) {
    const [quantity, setQuantity] = useState(1);
    const [materialSource, setMaterialSource] = useState<MaterialSource>('home');
    const { comparison, loading, error } = useComparePaths(itemId, materialSource, quantity);

    return (
      <section ref={ref} id="compare-paths">
        <SectionHeader label="Compare Paths" />
        <CompareControls
          quantity={quantity}
          onQuantity={setQuantity}
          materialSource={materialSource}
          onMaterialSource={setMaterialSource}
        />

        {itemId == null && (
          <div className="border border-border-base bg-bg-card p-4 text-text-low text-sm italic">
            Search for an item to compare its paths.
          </div>
        )}
        {itemId != null && loading && <div className="py-4"><Spinner label="Comparing paths…" /></div>}
        {itemId != null && error && (
          <div className="border border-border-base bg-bg-card p-4 text-crimson text-sm">Market fetch failed.</div>
        )}

        {comparison && comparison.cards.length > 0 && (
          <>
            <div className="border-l-[3px] border-l-aether bg-bg-card border border-border-base px-4 py-3 mb-4 text-sm text-text-cream">
              {comparison.summary}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:flex-row flex-col">
              {comparison.cards.map((card) => (
                <PathCardView
                  key={card.id}
                  card={card}
                  isWinner={card.id === comparison.winnerId}
                  quantity={quantity}
                />
              ))}
            </div>
          </>
        )}
      </section>
    );
  },
);
