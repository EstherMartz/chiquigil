import { useState } from 'react';

interface Props {
  /** Array of objects with at least an `id` (XIVAPI item ID). */
  items: { id: number }[];
}

/** Builds a Teamcraft import string: itemId,recipeId,quantity;... */
function toTeamcraftString(items: { id: number }[]): string {
  return items.map((i) => `${i.id},null,1`).join(';');
}

export function ExportTeamcraftButton({ items }: Props) {
  const [copied, setCopied] = useState(false);
  const disabled = items.length === 0;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(toTeamcraftString(items));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      disabled={disabled}
      title={disabled ? 'No items to export' : `Copy ${items.length} items in Teamcraft format`}
      className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-aether hover:text-aether transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {copied ? '✓ Copied' : '⎘ Teamcraft'}
    </button>
  );
}
