import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { garlandItemUrl, gamerEscapeItemUrl, universalisItemUrl } from '../lib/format';
import { useSnapshotById } from '../features/queries/useSnapshotById';
import { CopyButton } from './CopyButton';
import { RecipeHover } from './RecipeHover';
import { crafterBeadClass } from '../features/items/crafterColors';
import { IgnoreAffordanceContext } from '../features/items/ignoreAffordance';
import { useSettingsStore } from '../features/settings/store';

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
 *   <sub line · crafter chip>
 *
 * Item name links to the Garland Tools item page (recipe, NPC vendors, drop sources).
 * ilvl is looked up from the cached item snapshot.
 */
export function ItemNameLinks({ id, name, suffix, sub, crafter }: Props) {
  const byId = useSnapshotById();
  const ilvl = byId.get(id)?.ilvl;

  const canHide = useContext(IgnoreAffordanceContext);
  const isIgnored = useSettingsStore((s) => s.ignoredItemIds.includes(id));
  const ignoreItem = useSettingsStore((s) => s.ignoreItem);

  return (
    <>
      <RecipeHover itemId={id} itemName={name}>
        {ilvl != null && ilvl > 1 && (
          <span className="font-mono text-[10px] tracking-widest text-gold tabular-nums">
            i{ilvl}
          </span>
        )}
        <Link
          to={`/item/${id}`}
          className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 transition-colors"
        >
          {name}
        </Link>
        {suffix}
        <CopyButton text={name} />
        <a
          href={garlandItemUrl(id)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] text-text-low hover:text-aether transition-colors shrink-0"
          title="Garland Tools"
        >
          GT
        </a>
        <a
          href={gamerEscapeItemUrl(name)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] text-text-low hover:text-aether transition-colors shrink-0"
          title="Gamer Escape wiki"
        >
          GE
        </a>
        <a
          href={universalisItemUrl(id)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] text-text-low hover:text-aether transition-colors shrink-0"
          title="Universalis (market data)"
        >
          UV
        </a>
        {canHide && !isIgnored && (
          <button
            type="button"
            onClick={() => ignoreItem(id)}
            title="Hide this item from scans"
            aria-label={`Hide ${name} from scans`}
            className="font-mono text-[9px] text-text-low hover:text-crimson transition-colors shrink-0"
          >
            ✕
          </button>
        )}
      </RecipeHover>
      {(sub || crafter) && (
        <div className="font-mono text-[10px] text-text-low mt-0.5 flex items-center gap-2 flex-wrap">
          {sub && <span>{sub}</span>}
          {crafter && (
            <span className="inline-flex items-center gap-1 text-text-cream border border-border-base px-1.5 py-0.5 leading-none">
              <span aria-hidden className={`${crafterBeadClass(crafter)} text-[8px] leading-none`}>●</span>
              {crafter}
            </span>
          )}
        </div>
      )}
    </>
  );
}
