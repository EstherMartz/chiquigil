import type { NameIndex } from './nameIndex';

/** Base URL of the web app where each item has a detail page at /item/:id. */
export const ITEMS_BASE_URL =
  (typeof process !== 'undefined' ? process.env.PROJECTS_BASE_URL : undefined) ?? 'https://qiqirn.tools';

// A markdown bold span: **...** with no nested asterisks or newlines.
const BOLD = /\*\*([^*\n]+)\*\*/g;

/**
 * Turn bolded item names in bot prose into Discord links to the item's web
 * detail page (`/item/:id`). Only bold spans whose text EXACTLY matches a
 * catalog item name (case-insensitive) are linked, so non-item bold — city
 * names, "ganancia", emphasis — is left untouched. Bold spans that are already
 * the label of a markdown link (`[**name**](url)`) are skipped so we never
 * double-link the craft renderer's output.
 *
 * Deterministic on purpose: we don't trust the LLM to build URLs, we linkify
 * after the fact against the name index it already has loaded.
 */
export function linkifyItems(text: string, nameIndex: NameIndex): string {
  if (!text) return text;
  return text.replace(BOLD, (match: string, inner: string, offset: number) => {
    // Already a link label: `[**name**](…)` — the char before `**` is `[`.
    if (offset > 0 && text[offset - 1] === '[') return match;
    const id = nameIndex.get(inner.trim().toLowerCase());
    if (id == null) return match;
    return `[${match}](${ITEMS_BASE_URL}/item/${id})`;
  });
}
