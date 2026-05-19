import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import type { InventoryEntry, UsesEntry } from '../../src/features/cleanup/types';

const EMBED_MAX_FIELDS = 25;
const EMBED_FIELD_MAX = 1024;

export interface FormatInput {
  entries: InventoryEntry[];
  usesByItemId: Map<number, UsesEntry[]>;
  unrecognized: InventoryEntry[];
}

export interface FormatOutput {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
  summary: string;
}

function fmtGil(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

export function formatUsesReply(input: FormatInput): FormatOutput {
  const { entries, usesByItemId, unrecognized } = input;
  const totalRecognized = entries.length;
  const itemsWithUses = entries.filter((e) => (usesByItemId.get(e.itemId)?.length ?? 0) > 0);
  itemsWithUses.sort(
    (a, b) => (usesByItemId.get(b.itemId)?.length ?? 0) - (usesByItemId.get(a.itemId)?.length ?? 0),
  );

  const summary = `Parsed ${totalRecognized + unrecognized.length} rows · ${totalRecognized} recognized · ${itemsWithUses.length} have crafting uses.`;

  const embed = new EmbedBuilder()
    .setTitle('Inventory uses')
    .setDescription(summary)
    .setColor(0xc8a14a);

  const top = itemsWithUses.slice(0, EMBED_MAX_FIELDS - 1);
  for (const e of top) {
    const uses = usesByItemId.get(e.itemId) ?? [];
    const lines = uses.slice(0, 5).map(
      (u) => `• ${u.outputName} (needs ${u.amountNeeded}×) · ${fmtGil(u.outputUnitPrice)}g`,
    );
    if (uses.length > 5) lines.push(`…+${uses.length - 5} more`);
    const value = lines.join('\n').slice(0, EMBED_FIELD_MAX);
    embed.addFields({
      name: `${e.name}${e.isHq ? ' ✦' : ''} ×${e.qty}`,
      value: value || '—',
      inline: false,
    });
  }

  const md = buildMarkdown(itemsWithUses, usesByItemId, unrecognized);
  const file = new AttachmentBuilder(Buffer.from(md, 'utf8'), { name: 'uses.md' });

  return { embeds: [embed], files: [file], summary };
}

function buildMarkdown(
  itemsWithUses: InventoryEntry[],
  usesByItemId: Map<number, UsesEntry[]>,
  unrecognized: InventoryEntry[],
): string {
  const lines: string[] = ['# Inventory uses', ''];
  for (const e of itemsWithUses) {
    const uses = usesByItemId.get(e.itemId) ?? [];
    lines.push(`## ${e.name}${e.isHq ? ' ✦' : ''} ×${e.qty} — used in ${uses.length} recipes`);
    for (const u of uses) {
      lines.push(`- ${u.outputName} (needs ${u.amountNeeded}×) · ${fmtGil(u.outputUnitPrice)}g`);
    }
    lines.push('');
  }
  if (unrecognized.length > 0) {
    lines.push(`## Unrecognized (${unrecognized.length})`);
    for (const u of unrecognized) lines.push(`- "${u.name}" ×${u.qty}`);
  }
  return lines.join('\n');
}
