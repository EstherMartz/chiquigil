import { useState, useMemo, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { fetchInBatches } from '../../lib/universalisBulk';
import sectorData from '../../data/submarineSectors.json';
import type { Sector } from './submarineTypes';
import { SectorGrid } from './SectorGrid';
import { RouteSummary } from './RouteSummary';
import { suggestRoute } from './suggestRoute';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';

const sectors = (sectorData as { sectors: Sector[] }).sectors;

const ZONES = [...new Set(sectors.map((s) => s.zone))];

export function RouteValuator() {
  const { world, submarineRank, submarineSlots } = useSettingsStore();

  const [zone, setZone] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [marketCache, setMarketCache] = useState<MarketData>({});

  const selectedSectors = useMemo(
    () => sectors.filter((s) => selected.has(s.id)),
    [selected],
  );

  // Collect unique loot item IDs across selected sectors
  const lootIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of selectedSectors) {
      for (const item of s.loot) ids.add(item.itemId);
    }
    return [...ids];
  }, [selectedSectors]);

  const scan = useMutation({
    mutationFn: async () => {
      setProgress({ current: 0, total: lootIds.length });
      const result = await fetchInBatches<MarketData[string]>(
        lootIds,
        (chunk) => fetchMarketData(world, chunk),
        {
          chunkSize: 100,
          concurrency: 4,
          onProgress: (done) =>
            setProgress({ current: Math.min(done * 100, lootIds.length), total: lootIds.length }),
        },
      );
      setProgress(null);
      const merged = { ...marketCache, ...result.data };
      setMarketCache(merged);
      return { market: merged, skipped: result.errors.length };
    },
  });

  const handleToggle = useCallback((sectorId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sectorId)) {
        next.delete(sectorId);
      } else {
        next.add(sectorId);
      }
      return next;
    });
  }, []);

  const handleSuggest = useCallback(async () => {
    // Fetch prices for all sectors in the target zone (or all if no zone)
    const targetSectors = zone
      ? sectors.filter((s) => s.rankReq <= submarineRank && s.zone === zone)
      : sectors.filter((s) => s.rankReq <= submarineRank);

    const allLootIds = [...new Set(targetSectors.flatMap((s) => s.loot.map((l) => l.itemId)))];

    setProgress({ current: 0, total: allLootIds.length });
    const result = await fetchInBatches<MarketData[string]>(
      allLootIds,
      (chunk) => fetchMarketData(world, chunk),
      {
        chunkSize: 100,
        concurrency: 4,
        onProgress: (done) =>
          setProgress({ current: Math.min(done * 100, allLootIds.length), total: allLootIds.length }),
      },
    );
    setProgress(null);

    const merged = { ...marketCache, ...result.data };
    setMarketCache(merged);

    const suggested = suggestRoute(sectors, merged, {
      rank: submarineRank,
      slots: submarineSlots,
      zone,
    });
    setSelected(new Set(suggested.map((s) => s.id)));
  }, [zone, submarineRank, submarineSlots, world, marketCache]);

  const hasMarketData = scan.data != null || Object.keys(marketCache).length > 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low">Zone</span>
          <select
            value={zone ?? ''}
            onChange={(e) => setZone(e.target.value || null)}
            className="mt-1 block w-44 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
          >
            <option value="">All zones</option>
            {ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={handleSuggest}
          disabled={scan.isPending}
          className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-4 py-2 hover:bg-aether hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Suggest best route
        </button>

        <button
          type="button"
          onClick={() => { scan.reset(); scan.mutate(); }}
          disabled={scan.isPending || selected.size === 0}
          className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {scan.isPending ? 'Scanning...' : 'Run scan'}
        </button>
      </div>

      {/* Selected sectors as pills */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSectors.map((s) => (
            <button
              key={s.id}
              onClick={() => handleToggle(s.id)}
              className="inline-flex items-center gap-1 font-mono text-[10px] tracking-widest border border-gold text-gold px-2 py-1 hover:bg-gold/10 transition-colors"
            >
              {s.letter} — {s.name}
              <span className="text-text-low ml-1">×</span>
            </button>
          ))}
          <span className="font-mono text-[10px] text-text-low self-center">
            {selected.size}/{submarineSlots} slots
          </span>
        </div>
      )}

      {/* Progress / errors */}
      {scan.isPending && progress && (
        <ProgressBar current={progress.current} total={progress.total} label="Fetching prices..." />
      )}
      {!scan.isPending && progress && (
        <ProgressBar current={progress.current} total={progress.total} label="Fetching prices for suggestion..." />
      )}
      {scan.isError && <StatusBanner kind="error">Scan failed: {(scan.error as Error).message}</StatusBanner>}
      {scan.data && scan.data.skipped > 0 && (
        <StatusBanner kind="error">{scan.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {/* Sector grid */}
      <SectorGrid
        sectors={sectors}
        rank={submarineRank}
        zone={zone}
        selected={selected}
        maxSlots={submarineSlots}
        onToggle={handleToggle}
      />

      {/* Route summary (after scan) */}
      {hasMarketData && selectedSectors.length > 0 && (
        <RouteSummary sectors={selectedSectors} market={marketCache} />
      )}

      {/* Pre-scan empty state */}
      {!hasMarketData && selected.size === 0 && (
        <EmptyState
          icon="🚢"
          message="Select sectors from the grid above to build a submarine route, or use Suggest to auto-pick the best one."
        />
      )}
    </div>
  );
}
