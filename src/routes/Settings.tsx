import { WorldDcPicker } from '../features/settings/WorldDcPicker';
import { LevelsEditor } from '../features/settings/LevelsEditor';
import { PackToggles } from '../features/settings/PackToggles';
import { AddItemSearch } from '../features/settings/AddItemSearch';

export default function Settings() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-10">
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">World &amp; Data Center</h2>
        <WorldDcPicker />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Retainer levels</h2>
        <LevelsEditor />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Starter packs</h2>
        <PackToggles />
      </section>
      <section>
        <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Add custom items</h2>
        <AddItemSearch />
      </section>
    </div>
  );
}
