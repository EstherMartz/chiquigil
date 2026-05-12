import { universalisItemUrl, garlandItemUrl } from '../lib/format';
import { useSettingsStore } from '../features/settings/store';
import { useSnapshotById } from '../features/queries/useSnapshotById';
import { CopyButton } from './CopyButton';
import { RecipeHover } from './RecipeHover';

interface Props {
  id: number;
  name: string;
  /** Optional badge (e.g., HQ star) rendered immediately after the name. */
  suffix?: React.ReactNode;
  /** Optional second line — typically "<crafter> · <category>". */
  sub?: React.ReactNode;
  /** Optional crafter code, surfaced into the sub-line as a discrete chip. */
  crafter?: string;
}

/**
 * Item cell used in result tables. Renders:
 *   <ilvl><name><HQ ★?><copy>
 *   <sub line · crafter chip · ↗ Garland link>
 *
 * Item name links to the Universalis market page (scoped to the user's home world).
 * ilvl is looked up from the cached item snapshot.
 */
export function ItemNameLinks({ id, name, suffix, sub, crafter }: Props) {
  const { world } = useSettingsStore();
  const byId = useSnapshotById();
  const ilvl = byId.get(id)?.ilvl;

  return (
    <>
      <RecipeHover itemId={id} itemName={name}>
        {ilvl != null && ilvl > 1 && (
          <span className="font-mono text-[10px] tracking-widest text-gold tabular-nums">
            i{ilvl}
          </span>
        )}
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
        <CopyButton text={name} />
      </RecipeHover>
      {(sub || crafter) && (
        <div className="font-mono text-[10px] text-text-low mt-0.5 flex items-center gap-2 flex-wrap">
          {sub && <span>{sub}</span>}
          {crafter && (
            <span className="text-aether border border-border-base px-1 py-0.5 leading-none">
              {crafter}
            </span>
          )}
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
