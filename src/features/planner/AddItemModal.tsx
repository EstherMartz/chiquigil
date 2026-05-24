import { useState } from 'react';
import { LANE_META, type LaneKey } from './seedPlanner';

interface Props {
  lane: LaneKey;
  onAdd: (partial: { name: string; src: string; price: number; perDay: number; supply: number | null }) => void;
  onClose: () => void;
  prefill?: { name: string; price: number };
}

export function AddItemModal({ lane, onAdd, onClose, prefill }: Props) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [src, setSrc] = useState('');
  const [price, setPrice] = useState(prefill?.price ? String(prefill.price) : '');
  const [perDay, setPerDay] = useState('');
  const [supply, setSupply] = useState('');

  const canSave = name.trim().length > 0;

  function commit() {
    if (!canSave) return;
    const p = parseInt(price.replace(/[^0-9]/g, ''), 10);
    const pd = parseFloat(perDay);
    const sup = supply.trim() === '' ? null : parseFloat(supply);
    onAdd({
      name: name.trim(),
      src: src.trim() || 'custom',
      price: Number.isFinite(p) ? p : 0,
      perDay: Number.isFinite(pd) ? pd : 0,
      supply: sup != null && Number.isFinite(sup) ? sup : null,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-bg-deep/80 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-hi max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg text-gold mb-1">Add item</h2>
        <div className="font-mono text-[11px] tracking-widest uppercase text-text-low mb-4">
          to {LANE_META[lane].nm}
        </div>

        <label className="block mb-3">
          <span className="font-mono text-[13px] tracking-widest uppercase text-text-low">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm"
            placeholder="e.g. Yollal Extract"
          />
        </label>
        <label className="block mb-3">
          <span className="font-mono text-[13px] tracking-widest uppercase text-text-low">Source</span>
          <input
            type="text"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm"
            placeholder="e.g. Weaver, Cosmic Auxesia"
          />
        </label>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest uppercase text-text-low">Price</span>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm"
              placeholder="0"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest uppercase text-text-low">Per/day</span>
            <input
              type="text"
              value={perDay}
              onChange={(e) => setPerDay(e.target.value)}
              className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm"
              placeholder="1"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest uppercase text-text-low">Supply</span>
            <input
              type="text"
              value={supply}
              onChange={(e) => setSupply(e.target.value)}
              className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm"
              placeholder="blank = n/a"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-4 py-2 hover:text-aether hover:border-aether transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={!canSave}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
