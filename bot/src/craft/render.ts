import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { CraftProject, StoredTask } from './types';
import * as S from './strings';

const JOB_EMOJI: Record<string, string> = {
  CRP: '🪚', BSM: '⚒️', ARM: '🛡️', GSM: '💎', LTW: '🧵',
  WVR: '🧶', ALC: '⚗️', CUL: '🍳', ANY: '🔨',
};

const SOURCE_EMOJI: Record<string, string> = {
  craft: '🔨', market: '🪙', vendor: '🏪', currency: '💠', gather: '⛏',
};

function fmtPrice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function taskLine(t: StoredTask): string {
  const done = t.status === 'done' ? '✅' : '';
  const assignee = t.assigneeId ? `<@${t.assigneeId}>` : `_${S.UNCLAIMED}_`;
  const progress = `(${t.qtyDone}/${t.qtyNeeded})`;
  let detail = '';

  if (t.source === 'craft' && t.meta?.job) {
    detail = '';
  } else if (t.source === 'market' && t.meta?.price) {
    detail = ` · ~${fmtPrice(t.meta.price)}g`;
    if (t.meta.world) detail += ` · ${t.meta.world}`;
  } else if (t.source === 'vendor' && t.meta?.price) {
    detail = ` · ${fmtPrice(t.meta.price)}g PNJ`;
  } else if (t.source === 'currency' && t.meta?.currency) {
    detail = ` · ${t.meta.costPerUnit} ${t.meta.currency} c/u`;
  } else if (t.source === 'gather' && t.meta?.gatherLevel) {
    detail = ` · Nv${t.meta.gatherLevel}`;
    if (t.meta.timed) detail += ' ⏰';
  }

  return `${done} ${t.qtyNeeded}× **${t.itemName}** — ${assignee} ${progress}${detail}`;
}

function groupBySection(tasks: StoredTask[]): Map<string, StoredTask[]> {
  const groups = new Map<string, StoredTask[]>();
  for (const t of tasks) {
    let key: string;
    if (t.source === 'craft') {
      const job = t.meta?.job ?? 'ANY';
      const jobName = S.JOB_NAME[job] ?? job;
      key = `${S.SECTION_CRAFT} — ${JOB_EMOJI[job] ?? '🔨'} ${jobName}`;
    } else if (t.source === 'market') {
      key = S.SECTION_MARKET;
    } else if (t.source === 'vendor') {
      key = S.SECTION_VENDOR;
    } else if (t.source === 'currency') {
      key = S.SECTION_CURRENCY;
    } else {
      key = S.SECTION_GATHER;
    }
    let arr = groups.get(key);
    if (!arr) { arr = []; groups.set(key, arr); }
    arr.push(t);
  }
  return groups;
}

export function buildProjectMessage(
  project: CraftProject,
  tasks: StoredTask[],
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const isClosed = project.status === 'closed';
  const statusTag = isClosed
    ? S.PROJECT_STATUS_CLOSED
    : `${S.PROJECT_STATUS_OPEN} · ${doneTasks}/${totalTasks} ${S.PROJECT_DONE_SUFFIX}`;

  const sections = groupBySection(tasks);
  let description = '';
  for (const [header, sectionTasks] of sections) {
    description += `\n**${header}**\n`;
    for (const t of sectionTasks) {
      description += taskLine(t) + '\n';
    }
  }

  if (description.length > 4000) {
    description = description.slice(0, 3950) + `\n\n_${S.PROJECT_TRUNCATED}_`;
  }

  const title = isClosed
    ? `✅ [Cerrado] ${project.name}`
    : `🛠  ${project.name}`;

  const embed = new EmbedBuilder()
    .setColor(isClosed ? 0x666666 : 0xD4A958)
    .setTitle(title)
    .setDescription(`\`[${statusTag}]\`\n${description}`)
    .setFooter({ text: `Proyecto #${project.id}` })
    .setTimestamp(project.createdAt);

  const components: ActionRowBuilder<any>[] = [];

  // Only show interactive components for open projects
  if (!isClosed) {
    const claimable = tasks.filter((t) => t.status === 'open').slice(0, 25);
    if (claimable.length > 0) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`cproj:${project.id}:claim`)
        .setPlaceholder(S.SELECT_PLACEHOLDER)
        .addOptions(
          claimable.map((t) => ({
            label: `${t.qtyNeeded}× ${t.itemName}`.slice(0, 100),
            description: `${SOURCE_EMOJI[t.source] ?? ''} ${t.source}`.slice(0, 100),
            value: String(t.id),
          })),
        );
      components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
    }

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`cproj:${project.id}:progress`)
        .setLabel(S.BTN_LOG_PROGRESS)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`cproj:${project.id}:done`)
        .setLabel(S.BTN_MARK_DONE)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cproj:${project.id}:unclaim`)
        .setLabel(S.BTN_UNCLAIM)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`cproj:${project.id}:refresh`)
        .setLabel(S.BTN_REFRESH)
        .setStyle(ButtonStyle.Secondary),
    );
    components.push(buttons);
  }

  return { embeds: [embed], components };
}

/** Pinned roll-up board listing all open projects with progress. */
export function buildBoardMessage(
  openProjects: { project: CraftProject; tasks: StoredTask[] }[],
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  let description: string;

  if (openProjects.length === 0) {
    description = `_${S.BOARD_EMPTY}_`;
  } else {
    const lines = openProjects.map(({ project, tasks }) => {
      const done = tasks.filter((t) => t.status === 'done').length;
      const total = tasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      const thread = project.threadId ? ` · <#${project.threadId}>` : '';
      const requester = ` · <@${project.createdBy}>`;
      return `**#${project.id}** ${project.name}\n${bar} ${pct}% (${done}/${total} ${S.PROJECT_TASKS_SUFFIX})${thread}${requester}`;
    });
    description = lines.join('\n\n');
  }

  if (description.length > 4000) {
    description = description.slice(0, 3950) + `\n\n_${S.BOARD_TRUNCATED}_`;
  }

  const embed = new EmbedBuilder()
    .setColor(0xD4A958)
    .setTitle(S.BOARD_TITLE)
    .setDescription(description)
    .setFooter({ text: S.BOARD_FOOTER })
    .setTimestamp();

  return { embeds: [embed], components: [] };
}

/** The standing "Request a craft" prompt message with a button. */
export function buildRequestPrompt(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const embed = new EmbedBuilder()
    .setColor(0xD4A958)
    .setTitle(S.REQUEST_TITLE)
    .setDescription(S.REQUEST_DESCRIPTION);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('cproj:request')
      .setLabel(S.REQUEST_BUTTON)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🛠'),
  );

  return { embeds: [embed], components: [row] };
}
