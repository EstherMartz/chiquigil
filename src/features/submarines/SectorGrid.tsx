import { useMemo } from 'react';
import type { Sector } from './submarineTypes';

interface Props {
  sectors: Sector[];
  rank: number;
  zone: string | null;
  selected: Set<number>;
  maxSlots: number;
  onToggle: (sectorId: number) => void;
}

export function SectorGrid({ sectors, rank, zone, selected, maxSlots, onToggle }: Props) {
  const filtered = useMemo(() => {
    let s = sectors.filter((s) => s.rankReq <= rank);
    if (zone) s = s.filter((s) => s.zone === zone);
    return s;
  }, [sectors, rank, zone]);

  const isFull = selected.size >= maxSlots;

  return (
    <div className="border border-border-base bg-bg-card overflow-x-auto max-h-[420px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-bg-card z-10">
          <tr className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
            <th className="px-3 py-2 text-left">Letter</th>
            <th className="px-3 py-2 text-left">Name</th>
            <th className="px-3 py-2 text-left hidden sm:table-cell">Zone</th>
            <th className="px-3 py-2 text-right">Rank</th>
            <th className="px-3 py-2 text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => {
            const isSelected = selected.has(s.id);
            const disabled = !isSelected && isFull;
            return (
              <tr
                key={s.id}
                onClick={() => !disabled && onToggle(s.id)}
                className={`border-t border-border-base transition-colors ${
                  isSelected
                    ? 'bg-gold/10 border-l-2 border-l-gold'
                    : disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-bg-card-hi cursor-pointer'
                }`}
              >
                <td className="px-3 py-1.5 font-mono text-gold">{s.letter}</td>
                <td className="px-3 py-1.5">{s.name}</td>
                <td className="px-3 py-1.5 text-text-low hidden sm:table-cell">{s.zone}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{s.rankReq}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {Math.floor(s.durationMin / 60)}h {s.durationMin % 60}m
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-text-low text-sm">
                No sectors available at rank {rank}{zone ? ` in ${zone}` : ''}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
