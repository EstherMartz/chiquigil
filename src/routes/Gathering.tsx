import { useState } from 'react';
import { QueriesView } from '../features/queries/QueriesView';
import { GatheringPlanner } from '../features/gathering/GatheringPlanner';
import { useGatheringCatalog } from '../features/queries/useGatheringCatalog';
import type { QueryResultRow } from '../features/queries/types';

export default function Gathering() {
  const [rows, setRows] = useState<QueryResultRow[]>([]);
  const catalog = useGatheringCatalog();

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <h2 className="font-display text-lg text-gold tracking-wide">Gathering</h2>
      <p className="font-mono text-[11px] text-text-low max-w-prose">
        Raw materials you can gather while doing other things. Sells as-is — no recipe required.
      </p>
      <GatheringPlanner rows={rows} catalog={catalog.data} />
      <QueriesView category="gathering" onRowsChange={setRows} />
    </div>
  );
}
