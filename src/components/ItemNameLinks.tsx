import { universalisItemUrl, garlandItemUrl } from '../lib/format';
import { useSettingsStore } from '../features/settings/store';

interface Props {
  id: number;
  name: string;
  /** Optional badge (e.g., HQ star) rendered immediately after the name. */
  suffix?: React.ReactNode;
  /** Optional second line — typically "<crafter> · <category>". */
  sub?: React.ReactNode;
}

/**
 * Item cell used in result tables. Item name links to the Universalis market page
 * (scoped to the user's home world). A small ↗ glyph next to the sub-line opens
 * Garland Tools, which shows NPC vendors, drop sources, and recipe trees.
 */
export function ItemNameLinks({ id, name, suffix, sub }: Props) {
  const { world } = useSettingsStore();
  return (
    <>
      <a
        href={universalisItemUrl(id, world)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 transition-colors"
        title="Open on Universalis"
      >
        {name}
      </a>
      {suffix}
      {sub && (
        <div className="font-mono text-[10px] text-text-low mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{sub}</span>
          <a
            href={garlandItemUrl(id)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-aether transition-colors"
            title="Open on Garland Tools (recipe, NPC vendors, drop sources)"
          >
            ↗
          </a>
        </div>
      )}
    </>
  );
}
