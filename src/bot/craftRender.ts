import type { CraftProject, StoredTask } from './craftTypes';
import * as S from './craftStrings';

const JOB_EMOJI: Record<string, string> = {
  CRP: '🪚', BSM: '⚒️', ARM: '🛡️', GSM: '💎', LTW: '🧵',
  WVR: '🧶', ALC: '⚗️', CUL: '🍳', ANY: '🔨',
};

const SOURCE_EMOJI: Record<string, string> = {
  craft: '🔨', workshop: '🛠', market: '🪙', vendor: '🏪', currency: '💠', gather: '⛏',
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
    } else if (t.source === 'workshop') {
      key = S.SECTION_WORKSHOP;
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
): { embeds: object[]; components: object[] } {
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

  const embed = {
    color: isClosed ? 0x666666 : 0xD4A958,
    title: title,
    description: `\`[${statusTag}]\`\n${description}`,
    footer: { text: `Proyecto #${project.id}` },
    timestamp: new Date(project.createdAt).toISOString(),
  };

  const components: object[] = [];

  // Only show interactive components for open projects
  if (!isClosed) {
    const claimable = tasks.filter((t) => t.status === 'open').slice(0, 25);
    if (claimable.length > 0) {
      const selectComponent = {
        type: 3,
        custom_id: `cproj:${project.id}:claim`,
        placeholder: S.SELECT_PLACEHOLDER,
        options: claimable.map((t) => ({
          label: `${t.qtyNeeded}× ${t.itemName}`.slice(0, 100),
          description: `${SOURCE_EMOJI[t.source] ?? ''} ${t.source}`.slice(0, 100),
          value: String(t.id),
        })),
      };
      components.push({
        type: 1,
        components: [selectComponent],
      });
    }

    const buttons = {
      type: 1,
      components: [
        {
          type: 2,
          custom_id: `cproj:${project.id}:progress`,
          label: S.BTN_LOG_PROGRESS,
          style: 1,
        },
        {
          type: 2,
          custom_id: `cproj:${project.id}:done`,
          label: S.BTN_MARK_DONE,
          style: 3,
        },
        {
          type: 2,
          custom_id: `cproj:${project.id}:unclaim`,
          label: S.BTN_UNCLAIM,
          style: 2,
        },
        {
          type: 2,
          custom_id: `cproj:${project.id}:refresh`,
          label: S.BTN_REFRESH,
          style: 2,
        },
      ],
    };
    components.push(buttons);
  }

  return { embeds: [embed], components };
}

/** Pinned roll-up board listing all open projects with progress. */
export function buildBoardMessage(
  openProjects: { project: CraftProject; tasks: StoredTask[] }[],
): { embeds: object[]; components: object[] } {
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

  const embed = {
    color: 0xD4A958,
    title: S.BOARD_TITLE,
    description: description,
    footer: { text: S.BOARD_FOOTER },
    timestamp: new Date().toISOString(),
  };

  return { embeds: [embed], components: [] };
}

/** The standing "Request a craft" prompt message with a button. */
export function buildRequestPrompt(): { embeds: object[]; components: object[] } {
  const embed = {
    color: 0xD4A958,
    title: S.REQUEST_TITLE,
    description: S.REQUEST_DESCRIPTION,
  };

  const row = {
    type: 1,
    components: [
      {
        type: 2,
        custom_id: 'cproj:request',
        label: S.REQUEST_BUTTON,
        style: 1,
        emoji: '🛠',
      },
    ],
  };

  return { embeds: [embed], components: [row] };
}
