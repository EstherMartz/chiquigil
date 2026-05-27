import { useSettingsStore } from './store';

const DCS = ['Chaos', 'Light', 'Materia', 'Crystal', 'Aether', 'Primal', 'Dynamis', 'Mana', 'Gaia', 'Elemental', 'Meteor'];
const PHANTOM_WORLDS = ['Phantom', 'Lich', 'Shiva', 'Twintania', 'Zodiark'];

export function WorldDcPicker() {
  const { world, dc, setWorld, setDc } = useSettingsStore();
  return (
    <div className="grid grid-cols-2 gap-4 max-w-md">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">World</span>
        <input
          type="text"
          value={world}
          onChange={(e) => setWorld(e.target.value)}
          list="worlds"
          className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors focus:outline-none focus:border-aether"
        />
        <datalist id="worlds">{PHANTOM_WORLDS.map((w) => <option key={w} value={w} />)}</datalist>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Data Center</span>
        <select
          value={dc}
          onChange={(e) => setDc(e.target.value)}
          className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors focus:outline-none focus:border-aether"
        >
          {DCS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
    </div>
  );
}
