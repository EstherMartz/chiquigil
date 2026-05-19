import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import type { CleanupResult, CleanupRow, InventoryEntry, UsesEntry } from '../../src/features/cleanup/types';

const EMBED_FIELD_MAX = 1024;
const TOP_CRAFTS_INLINE = 12;
const TOP_SELLS_INLINE = 12;

export interface FormatInput {
  result: CleanupResult;
  usesByItemId: Map<number, UsesEntry[]>;
  totalRows: number;
}

export interface FormatOutput {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
  summary: string;
}

function fmtGil(n: number): string {
  const abs = Math.abs(n);
  if (abs <= 0) return '—';
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

function fmtFull(n: number): string {
  return n.toLocaleString();
}

function rowLabel(entry: InventoryEntry): string {
  return `${entry.name}${entry.isHq ? ' ✦' : ''} ×${entry.qty}`;
}

function craftAlt(row: CleanupRow): string {
  if (!row.runnerUp) return '';
  const perUnit = Math.round(row.runnerUp.value / Math.max(1, row.entry.qty));
  if (row.runnerUp.action === 'sellMb') return ` · o vender en Mercado ${fmtGil(perUnit)}g/ud`;
  if (row.runnerUp.action === 'vendor') return ` · o entregar al vendedor ${fmtGil(perUnit)}g/ud`;
  return '';
}

export function formatCleanupReply(input: FormatInput): FormatOutput {
  const { result, usesByItemId, totalRows } = input;
  const totalRecognized = result.craft.length + result.sellMb.length + result.vendor.length + result.discard.length;

  const mbTotal = result.sellMb.reduce((a, r) => a + r.mbRevenue, 0);
  const vendorTotal = result.vendor.reduce((a, r) => a + r.vendorRevenue, 0);
  const craftProfit = result.craft.reduce((a, r) => a + (r.bestCraft?.netProfit ?? 0), 0);

  const summary = [
    `He saludado ${totalRows} objetos · ${totalRecognized} reconocidos · ${result.unrecognized.length} misteriosos`,
    `Para crear ${result.craft.length} (~${fmtGil(craftProfit)}g) · Mercado ${result.sellMb.length} (~${fmtGil(mbTotal)}g) · Gracias ${result.vendor.length} (~${fmtGil(vendorTotal)}g) · Suelta ${result.discard.length}`,
  ].join('\n');

  const embeds: EmbedBuilder[] = [];

  const overview = new EmbedBuilder()
    .setTitle('Ordenando con cariño ✨')
    .setColor(0xc8a14a)
    .setDescription(summary);
  embeds.push(overview);

  if (result.craft.length > 0) {
    const craft = new EmbedBuilder()
      .setTitle(`▸ Crea con ellos algo nuevo (${result.craft.length})`)
      .setColor(0x82c8a0);
    for (const row of result.craft.slice(0, TOP_CRAFTS_INLINE)) {
      if (!row.bestCraft) continue;
      const sign = row.bestCraft.netProfit >= 0 ? '+' : '−';
      const lines: string[] = [
        `→ se transforma en ${row.bestCraft.outputName} ${sign}${fmtGil(Math.abs(row.bestCraft.netProfit))}g${craftAlt(row)}`,
      ];
      if (row.otherCrafts.length > 0) lines.push(`  +${row.otherCrafts.length} recetas más`);
      const missing = row.bestCraft.missingIngredients;
      if (missing.length > 0) {
        lines.push(`  comprar en Mercado: ${missing.map((m) => `${m.amount}× ${m.name}`).join(', ').slice(0, 200)}`);
      }
      craft.addFields({
        name: rowLabel(row.entry),
        value: lines.join('\n').slice(0, EMBED_FIELD_MAX),
      });
    }
    if (result.craft.length > TOP_CRAFTS_INLINE) {
      craft.setFooter({ text: `…+${result.craft.length - TOP_CRAFTS_INLINE} más en cleanup.md` });
    }
    embeds.push(craft);
  }

  if (result.sellMb.length > 0) {
    const sell = new EmbedBuilder()
      .setTitle(`▸ Que encuentren nuevo dueño en el Mercado (${result.sellMb.length})`)
      .setColor(0xa098dc);
    for (const row of result.sellMb.slice(0, TOP_SELLS_INLINE)) {
      const perEa = Math.round(row.mbRevenue / row.entry.qty);
      const scopeLabel = row.mbScope === 'dc' ? ' · DC' : row.mbScope === 'region' ? ' · entre DCs' : '';
      const thin = row.mbListingCount < 2 ? ' · mercado tímido' : ` · ${row.mbListingCount} anuncios`;
      sell.addFields({
        name: rowLabel(row.entry),
        value: `${fmtFull(perEa)}g/ud · total ${fmtGil(row.mbRevenue)}g${thin}${scopeLabel}`.slice(0, EMBED_FIELD_MAX),
      });
    }
    if (result.sellMb.length > TOP_SELLS_INLINE) {
      sell.setFooter({ text: `…+${result.sellMb.length - TOP_SELLS_INLINE} más en cleanup.md` });
    }
    embeds.push(sell);
  }

  if (result.vendor.length + result.discard.length > 0) {
    const vd = new EmbedBuilder()
      .setTitle(`▸ Agradéceles y despídete (${result.vendor.length + result.discard.length})`)
      .setColor(0x6b6b6b)
      .setDescription(
        `${result.vendor.length} tesoros que el vendedor recibirá por ~${fmtGil(vendorTotal)}g.\n` +
        `${result.discard.length} sin comprador — suéltalos con cariño.\n` +
        `La lista completa está en cleanup.md.`,
      );
    embeds.push(vd);
  }

  if (result.unrecognized.length > 0 && embeds.length < 10) {
    const un = new EmbedBuilder()
      .setTitle(`▸ Tesoros que no reconozco (${result.unrecognized.length})`)
      .setColor(0xb04a4a)
      .setDescription(
        result.unrecognized.slice(0, 20).map((u) => `• "${u.name}" ×${u.qty}`).join('\n').slice(0, 4000)
        + (result.unrecognized.length > 20 ? `\n…+${result.unrecognized.length - 20} más en cleanup.md` : ''),
      );
    embeds.push(un);
  }

  const md = buildMarkdown(result, usesByItemId, totalRows);
  const file = new AttachmentBuilder(Buffer.from(md, 'utf8'), { name: 'cleanup.md' });

  return { embeds, files: [file], summary };
}

function buildMarkdown(
  result: CleanupResult,
  usesByItemId: Map<number, UsesEntry[]>,
  totalRows: number,
): string {
  const totalRecognized = result.craft.length + result.sellMb.length + result.vendor.length + result.discard.length;
  const mbTotal = result.sellMb.reduce((a, r) => a + r.mbRevenue, 0);
  const vendorTotal = result.vendor.reduce((a, r) => a + r.vendorRevenue, 0);
  const craftProfit = result.craft.reduce((a, r) => a + (r.bestCraft?.netProfit ?? 0), 0);

  const lines: string[] = [
    '# Ordenando con cariño ✨',
    '',
    `- Saludados: ${totalRows} objetos (${totalRecognized} reconocidos, ${result.unrecognized.length} misteriosos)`,
    `- Para crear: ${result.craft.length} (~${fmtFull(craftProfit)}g de ganancia)`,
    `- Mercado: ${result.sellMb.length} (~${fmtFull(mbTotal)}g)`,
    `- Gracias y vender: ${result.vendor.length} (~${fmtFull(vendorTotal)}g)`,
    `- Suelta con cariño: ${result.discard.length}`,
    '',
  ];

  if (result.craft.length > 0) {
    lines.push(`## Crea con ellos algo nuevo (${result.craft.length})`, '');
    for (const row of result.craft) {
      if (!row.bestCraft) continue;
      const sign = row.bestCraft.netProfit >= 0 ? '+' : '−';
      lines.push(`### ${rowLabel(row.entry)}`);
      lines.push(`- → se transforma en ${row.bestCraft.outputName} ${sign}${fmtFull(Math.abs(row.bestCraft.netProfit))}g${craftAlt(row)}`);
      if (row.bestCraft.usedFromInventory.length > 0) {
        lines.push(`  - usa de tu inventario: ${row.bestCraft.usedFromInventory.map((u) => `${u.amount}× ${u.name}`).join(', ')}`);
      }
      if (row.bestCraft.missingIngredients.length > 0) {
        lines.push(`  - comprar en Mercado: ${row.bestCraft.missingIngredients.map((m) => `${m.amount}× ${m.name} @ ${fmtFull(m.mbUnitPrice)}g`).join(', ')}`);
      }
      for (const other of row.otherCrafts) {
        const s = other.netProfit >= 0 ? '+' : '−';
        lines.push(`- → o también ${other.outputName} ${s}${fmtFull(Math.abs(other.netProfit))}g`);
      }
      lines.push('');
    }
  }

  if (result.sellMb.length > 0) {
    lines.push(`## Que encuentren nuevo dueño en el Mercado (${result.sellMb.length})`, '');
    for (const row of result.sellMb) {
      const perEa = Math.round(row.mbRevenue / row.entry.qty);
      const scope = row.mbScope === 'dc' ? ' DC' : row.mbScope === 'region' ? ' entre DCs' : '';
      lines.push(`- ${rowLabel(row.entry)} — ${fmtFull(perEa)}g/ud × ${row.entry.qty} = ${fmtFull(row.mbRevenue)}g (${row.mbListingCount} anuncios${scope})`);
    }
    lines.push('');
  }

  if (result.vendor.length > 0) {
    lines.push(`## Agradéceles y véndelos al vendedor (${result.vendor.length})`, '');
    for (const row of result.vendor) {
      const perEa = Math.round(row.vendorRevenue / row.entry.qty);
      lines.push(`- ${rowLabel(row.entry)} — ${fmtFull(perEa)}g/ud × ${row.entry.qty} = ${fmtFull(row.vendorRevenue)}g`);
    }
    lines.push('');
  }

  if (result.discard.length > 0) {
    lines.push(`## Suelta con cariño (${result.discard.length})`, '');
    for (const row of result.discard) {
      lines.push(`- ${rowLabel(row.entry)} — gracias por tu servicio`);
    }
    lines.push('');
  }

  // Apéndice: cada objeto del inventario que participe en alguna receta,
  // aunque su mejor acción haya sido vender o entregar al vendedor.
  // Ayuda a descubrir potencial creativo que el ordenador no destacó.
  const itemsWithUses: Array<{ entry: InventoryEntry; uses: UsesEntry[] }> = [];
  const collect = (rows: CleanupRow[]) => {
    for (const r of rows) {
      const u = usesByItemId.get(r.entry.itemId);
      if (u && u.length > 0) itemsWithUses.push({ entry: r.entry, uses: u });
    }
  };
  collect(result.craft);
  collect(result.sellMb);
  collect(result.vendor);
  collect(result.discard);
  if (itemsWithUses.length > 0) {
    lines.push(`## Estos objetos forman parte de recetas (${itemsWithUses.length})`, '');
    itemsWithUses.sort((a, b) => b.uses.length - a.uses.length);
    for (const { entry, uses } of itemsWithUses) {
      lines.push(`### ${rowLabel(entry)} — aparece en ${uses.length} recetas`);
      for (const u of uses) {
        const price = u.outputUnitPrice > 0 ? `${fmtFull(u.outputUnitPrice)}g` : 'sin precio en el Mercado';
        lines.push(`- ${u.outputName} (necesita ${u.amountNeeded}×) · ${price}`);
      }
      lines.push('');
    }
  }

  if (result.unrecognized.length > 0) {
    lines.push(`## Tesoros que no reconozco (${result.unrecognized.length})`, '');
    for (const u of result.unrecognized) lines.push(`- "${u.name}" ×${u.qty}`);
  }

  return lines.join('\n');
}
