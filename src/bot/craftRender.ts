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

function groupBySection(tasks: StoredTask[]): Map<string, StoredTask[]> {
  const map = new Map<string, StoredTask[]>();
  for (const t of tasks) {
    const sec = sectionKeyFor(t);
    let arr = map.get(sec);
    if (!arr) { arr = []; map.set(sec, arr); }
    arr.push(t);
  }
  return map;
}

export interface PhaseInfo {
  partKey: string;
  phaseIndex: number;
  /** Human label including counter, e.g. "Wall · Fase 1 de 3". */
  label: string;
  total: number;
  done: number;
}

/** Derive all (part, phase) combos that have at least one task. */
export function collectPhases(tasks: StoredTask[]): PhaseInfo[] {
  const map = new Map<string, Omit<PhaseInfo, 'label'>>();
  const partOrder = new Map<string, number>();
  const phasesPerPart = new Map<string, Set<number>>();
  let nextPartOrder = 0;

  for (const t of tasks) {
    const pk = t.meta?.partKey;
    const pi = t.meta?.phaseIndex;
    if (pk == null || pi == null) continue;
    if (!partOrder.has(pk)) partOrder.set(pk, nextPartOrder++);
    let phaseSet = phasesPerPart.get(pk);
    if (!phaseSet) { phaseSet = new Set(); phasesPerPart.set(pk, phaseSet); }
    phaseSet.add(pi);
    const key = `${pk}#${pi}`;
    const existing = map.get(key);
    if (existing) {
      existing.total++;
      if (t.status === 'done') existing.done++;
    } else {
      map.set(key, {
        partKey: pk,
        phaseIndex: pi,
        total: 1,
        done: t.status === 'done' ? 1 : 0,
      });
    }
  }
  return [...map.values()]
    .sort((a, b) => {
      const ao = partOrder.get(a.partKey)!;
      const bo = partOrder.get(b.partKey)!;
      if (ao !== bo) return ao - bo;
      return a.phaseIndex - b.phaseIndex;
    })
    .map((p) => ({
      ...p,
      label: `${p.partKey} · Fase ${p.phaseIndex + 1} de ${phasesPerPart.get(p.partKey)!.size}`,
    }));
}

/**
 * Returns the first incomplete phase after the given (partKey, phaseIndex), or
 * null if there's nothing else to advance to. Used by the auto-advance handler
 * in craftInteractions.ts.
 */
export function findNextIncompletePhase(
  phases: PhaseInfo[],
  currentPartKey: string,
  currentPhaseIndex: number,
): { partKey: string; phaseIndex: number } | null {
  const idx = phases.findIndex(
    (p) => p.partKey === currentPartKey && p.phaseIndex === currentPhaseIndex,
  );
  if (idx === -1) return null;
  for (let i = idx + 1; i < phases.length; i++) {
    if (phases[i].done < phases[i].total) {
      return { partKey: phases[i].partKey, phaseIndex: phases[i].phaseIndex };
    }
  }
  return null;
}

/** Filter to workshop tasks (always visible) + the currently-displayed phase's tasks. */
function filterToPhase(
  tasks: StoredTask[],
  partKey: string,
  phaseIndex: number,
): StoredTask[] {
  return tasks.filter((t) => {
    // Untagged tasks (workshop assembly) stay visible at all times.
    if (t.meta?.partKey == null || t.meta?.phaseIndex == null) return true;
    return t.meta.partKey === partKey && t.meta.phaseIndex === phaseIndex;
  });
}

export function buildProjectMessage(
  project: CraftProject,
  tasks: StoredTask[],
  projectItems?: Array<{ itemName: string; qty: number }>,
): { embeds: object[]; components: object[] } {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const isClosed = project.status === 'closed';
  const statusTag = isClosed
    ? S.PROJECT_STATUS_CLOSED
    : `${S.PROJECT_STATUS_OPEN} · ${doneTasks}/${totalTasks} ${S.PROJECT_DONE_SUFFIX}`;

  // Phase navigation: only fires for CompanyCraft projects that have multiple
  // (part, phase) combinations. Other projects (standard recipes, single-phase
  // workshops) render every task and skip the phase select.
  const phases = collectPhases(tasks);
  const hasPhaseNav = phases.length > 1;
  const activePartKey = hasPhaseNav ? (project.displayPartKey ?? phases[0].partKey) : null;
  const activePhaseIndex = hasPhaseNav
    ? (project.displayPhaseIndex ?? phases[0].phaseIndex)
    : null;
  const visibleTasks = hasPhaseNav && activePartKey != null && activePhaseIndex != null
    ? filterToPhase(tasks, activePartKey, activePhaseIndex)
    : tasks;
  const activePhaseLabel = hasPhaseNav
    ? phases.find((p) => p.partKey === activePartKey && p.phaseIndex === activePhaseIndex)?.label
    : null;

  const sections = groupBySection(visibleTasks);
  let description = '';
  if (activePhaseLabel) {
    description += `\n📍 **${activePhaseLabel}**\n`;
  }
  for (const [header, sectionTasks] of sections) {
    description += `\n**${header}**\n`;
    for (const t of sectionTasks) {
      description += taskLine(t) + '\n';
    }
  }

  let itemsSummary = '';
  if (projectItems && projectItems.length >= 2) {
    itemsSummary = 'Items: ' + projectItems.map((pi) => `${pi.itemName} ×${pi.qty}`).join(' · ') + '\n';
  }

  const title = isClosed
    ? `✅ [Cerrado] ${project.name}`
    : `🛠  ${project.name}`;

  const fullDescription = `\`[${statusTag}]\`\n${itemsSummary}${description}`;
  const color = isClosed ? 0x666666 : 0xD4A958;
  const footer = { text: `Proyecto #${project.id}` };
  const timestamp = new Date(project.createdAt).toISOString();
  const chunks = chunkDescription(fullDescription);

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

  if (!isClosed) {
    // Phase select sits ABOVE the claim dropdown so it's the first thing the
    // user sees when navigating a big workshop project.
    if (hasPhaseNav) {
      const phaseSelect = {
        type: 3,
        custom_id: `cproj:${project.id}:phase`,
        placeholder: S.PHASE_SELECT_PLACEHOLDER,
        options: phases.slice(0, 25).map((p) => {
          const isDone = p.total > 0 && p.done === p.total;
          const checkmark = isDone ? ' ✓' : '';
          return {
            label: `${p.label}${checkmark}`.slice(0, 100),
            description: `${p.done}/${p.total} ${S.PROJECT_DONE_SUFFIX}`.slice(0, 100),
            value: `${p.partKey}#${p.phaseIndex}`,
            default: p.partKey === activePartKey && p.phaseIndex === activePhaseIndex,
          };
        }),
      };
      components.push({ type: 1, components: [phaseSelect] });
    }

    // Claim dropdown only sees tasks for the currently-displayed phase.
    const claimable = visibleTasks.filter((t) => t.status === 'open').slice(0, 25);
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

// Discord caps each embed.description at 4096 chars AND the cumulative
// title+description+footer.text+field text across all embeds at 6000 per
// message. We aim for ~3900 per chunk and ~5500 cumulative across all
// description chunks to leave ~500 chars for title + footer text.
const PER_CHUNK_LIMIT = 3900;
const TOTAL_LIMIT = 5500;

export function chunkDescription(text: string): string[] {
  if (text.length <= PER_CHUNK_LIMIT) return [text];

  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';
  let pushed = 0; // chars already committed to chunks[]
  let truncated = false;

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    // Allow extension only if it fits the per-embed limit AND the final
    // cumulative total (already-pushed + this extended chunk) stays under
    // the per-message cap.
    if (candidate.length <= PER_CHUNK_LIMIT && pushed + candidate.length <= TOTAL_LIMIT) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
      pushed += current.length;
    }
    // Can the next chunk hold this line at all without busting the budget?
    if (pushed + line.length > TOTAL_LIMIT) {
      truncated = true;
      break;
    }
    current = line;
  }
  if (current && !truncated) chunks.push(current);
  if (truncated) {
    const marker = `\n\n_${S.PROJECT_TRUNCATED}_`;
    if (chunks.length === 0) {
      chunks.push(marker.trimStart());
    } else {
      const lastIdx = chunks.length - 1;
      // Trim from the last chunk if needed so chunk + marker still fits
      // both the per-embed and cumulative caps.
      const otherPushed = pushed - chunks[lastIdx].length;
      const budget = Math.min(
        PER_CHUNK_LIMIT - marker.length,
        TOTAL_LIMIT - otherPushed - marker.length,
      );
      if (chunks[lastIdx].length > budget) {
        chunks[lastIdx] = chunks[lastIdx].slice(0, Math.max(0, budget));
      }
      chunks[lastIdx] = chunks[lastIdx] + marker;
    }
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
        emoji: { name: '🛠' },
      },
    ],
  };

  return { embeds: [embed], components: [row] };
}
