import { useState } from 'react';

interface Props {
  current: number;
  target: number;
  onSave: (patch: { current: number; target: number }) => void;
  onClose: () => void;
}

export function EditGoalModal({ current, target, onSave, onClose }: Props) {
  const [c, setC] = useState(String(current));
  const [t, setT] = useState(String(target));

  function commit() {
    const ci = parseInt(c.replace(/[^0-9]/g, ''), 10);
    const ti = parseInt(t.replace(/[^0-9]/g, ''), 10);
    onSave({
      current: Number.isFinite(ci) ? ci : current,
      target: Number.isFinite(ti) && ti > 0 ? ti : target,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-bg-deep/80 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-hi max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg text-gold mb-4">Edit goal</h2>
        <label className="block mb-4">
          <span className="font-mono text-[13px] tracking-widest uppercase text-text-low">Target gil</span>
          <input
            type="text"
            value={t}
            onChange={(e) => setT(e.target.value)}
            className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm"
            placeholder="100000000"
          />
        </label>
        <label className="block mb-5">
          <span className="font-mono text-[13px] tracking-widest uppercase text-text-low">Current treasury</span>
          <input
            type="text"
            value={c}
            onChange={(e) => setC(e.target.value)}
            className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm"
            placeholder="10000000"
          />
        </label>
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
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
