import { Link } from 'react-router-dom';
import { garlandItemUrl, gamerEscapeItemUrl } from '../lib/format';
import { useSnapshotById } from '../features/queries/useSnapshotById';
import { CopyButton } from './CopyButton';
import { RecipeHover } from './RecipeHover';
import { crafterBeadClass } from '../features/items/crafterColors';

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
