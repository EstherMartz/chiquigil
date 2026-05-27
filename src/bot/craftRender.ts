import type { CraftProject, StoredTask } from './craftTypes';
import * as S from './craftStrings';

const ITEMS_BASE_URL = process.env.PROJECTS_BASE_URL ?? 'https://qiqirn.tools';

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

  const itemLink = `[**${t.itemName}**](${ITEMS_BASE_URL}/item/${t.itemId})`;
  return `${done} ${t.qtyNeeded}× ${itemLink} — ${assignee} ${progress}${detail}`;
}

function sectionKeyFor(t: StoredTask): string {
  if (t.source === 'craft') {
    const job = t.meta?.job ?? 'ANY';
    const jobName = S.JOB_NAME[job] ?? job;
    return `${S.SECTION_CRAFT} — ${JOB_EMOJI[job] ?? '🔨'} ${jobName}`;
  }
  if (t.source === 'workshop') return S.SECTION_WORKSHOP;
  if (t.source === 'market') return S.SECTION_MARKET;
  if (t.source === 'vendor') return S.SECTION_VENDOR;
  if (t.source === 'currency') return S.SECTION_CURRENCY;
  return S.SECTION_GATHER;
}

interface GroupedTasks {
  /** Sections for tasks without a partKey (always includes workshop assembly). */
  topSections: Map<string, StoredTask[]>;
  /** Per-part: ordered map of partKey → section → tasks. */
  parts: Map<string, Map<string, StoredTask[]>>;
}

function groupTasks(tasks: StoredTask[]): GroupedTasks {
  const topSections = new Map<string, StoredTask[]>();
  const parts = new Map<string, Map<string, StoredTask[]>>();
  for (const t of tasks) {
    const sec = sectionKeyFor(t);
    const partKey = t.meta?.partKey;
    if (!partKey) {
      let arr = topSections.get(sec);
      if (!arr) { arr = []; topSections.set(sec, arr); }
      arr.push(t);
      continue;
    }
    let partMap = parts.get(partKey);
    if (!partMap) { partMap = new Map(); parts.set(partKey, partMap); }
    let arr = partMap.get(sec);
    if (!arr) { arr = []; partMap.set(sec, arr); }
    arr.push(t);
  }
  return { topSections, parts };
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

  const { topSections, parts } = groupTasks(tasks);
  let description = '';
  for (const [header, sectionTasks] of topSections) {
    description += `\n**${header}**\n`;
    for (const t of sectionTasks) {
      description += taskLine(t) + '\n';
    }
  }
  for (const [partKey, sectionMap] of parts) {
    description += `\n━━━ **${partKey.toUpperCase()}** ━━━\n`;
    for (const [header, sectionTasks] of sectionMap) {
      description += `\n**${header}**\n`;
      for (const t of sectionTasks) {
        description += taskLine(t) + '\n';
      }
    }
  }

  const title = isClosed
    ? `✅ [Cerrado] ${project.name}`
    : `🛠  ${project.name}`;

  const fullDescription = `\`[${statusTag}]\`\n${description}`;
  const color = isClosed ? 0x666666 : 0xD4A958;
  const footer = { text: `Proyecto #${project.id}` };
  const timestamp = new Date(project.createdAt).toISOString();
  const chunks = chunkDescription(fullDescription);

  // Multi-embed when one description chunk would exceed Discord's per-embed
  // limit. All embeds share the project's color; only the first carries the
  // title, only the last carries footer+timestamp.
  const builtEmbeds = chunks.map((chunk, i) => {
    const e: Record<string, unknown> = { color, description: chunk };
    if (i === 0) e.title = title;
    if (i === chunks.length - 1) {
      e.footer = footer;
      e.timestamp = timestamp;
    }
    return e;
  });

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

  return { embeds: builtEmbeds, components };
}

// Discord caps each embed.description at 4096 chars and the total characters
// across all embeds in a message at 6000. We aim for ~3900 per chunk with
// ~5800 cumulative to leave room for title/footer/status text.
const PER_CHUNK_LIMIT = 3900;
const TOTAL_LIMIT = 5800;

export function chunkDescription(text: string): string[] {
  if (text.length <= PER_CHUNK_LIMIT) return [text];

  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';
  let totalUsed = 0;
  let truncated = false;

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= PER_CHUNK_LIMIT && totalUsed + candidate.length - current.length <= TOTAL_LIMIT) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
      totalUsed += current.length;
    }
    // Would the next chunk exceed the total budget?
    if (totalUsed + line.length > TOTAL_LIMIT) {
      truncated = true;
      break;
    }
    current = line;
  }
  if (current && !truncated) chunks.push(current);
  if (truncated && chunks.length > 0) {
    const lastIdx = chunks.length - 1;
    chunks[lastIdx] = chunks[lastIdx] + `\n\n_${S.PROJECT_TRUNCATED}_`;
  }
  return chunks;
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
