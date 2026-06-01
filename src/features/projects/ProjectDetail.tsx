import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import { SectionHeader } from '../../components/SectionHeader';
import { StatusBanner } from '../../components/StatusBanner';
import { useProject } from './useProject';
import { collectPhases } from '../../bot/craftRender';
import type { StoredTask, TaskSource } from '../../bot/craftTypes';
import type { PhaseInfo } from '../../bot/craftRender';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { buildProjectTree } from './projectTree';
import { ProjectCraftTree } from './ProjectCraftTree';

const SOURCE_ORDER: TaskSource[] = ['craft', 'workshop', 'gather', 'currency', 'vendor', 'market'];

const SOURCE_LABEL: Record<TaskSource, string> = {
  craft: 'Craft',
  workshop: 'Workshop',
  gather: 'Gather',
  currency: 'Currency',
  vendor: 'Vendor',
  market: 'Market',
};

function groupTasks(tasks: StoredTask[]): Map<TaskSource, StoredTask[]> {
  const out = new Map<TaskSource, StoredTask[]>();
  for (const source of SOURCE_ORDER) out.set(source, []);
  for (const t of tasks) out.get(t.source)!.push(t);
  return out;
}

/** Workshop tasks (no partKey) always show; others only show for the active phase. */
function filterToPhase(tasks: StoredTask[], partKey: string, phaseIndex: number): StoredTask[] {
  return tasks.filter((t) => {
    if (t.meta?.partKey == null || t.meta?.phaseIndex == null) return true;
    return t.meta.partKey === partKey && t.meta.phaseIndex === phaseIndex;
  });
}

function TaskRow({ t, userNames }: { t: StoredTask; userNames: Record<string, string> }) {
  const pct = t.qtyNeeded > 0 ? Math.round((t.qtyDone / t.qtyNeeded) * 100) : 0;
  const assigneeLabel = t.assigneeId ? userNames[t.assigneeId] ?? t.assigneeId : 'unclaimed';
  return (
    <li className={[
      'flex items-center justify-between gap-3 py-1.5 border-b border-border-base/20 last:border-0 px-1 -mx-1 rounded',
      t.status === 'done'    ? 'bg-green-400/5' :
      t.status === 'claimed' ? 'bg-yellow-400/5' :
                               '',
    ].join(' ')}>
      <div className="flex-1 min-w-0">
        <span className="font-mono text-xs text-text-low mr-2">{t.qtyNeeded}×</span>
        <Link to={`/item/${t.itemId}`} className="hover:underline">{t.itemName}</Link>
      </div>
      <div className="font-mono text-xs text-text-low w-24 text-right">
        {t.qtyDone}/{t.qtyNeeded} ({pct}%)
      </div>
      <div className="font-mono text-xs text-text-low w-36 text-right truncate">
        {t.assigneeId ? `@${assigneeLabel}` : 'unclaimed'}
      </div>
      <div className={[
        'font-mono text-xs w-16 text-right font-semibold',
        t.status === 'done'    ? 'text-green-400' :
        t.status === 'claimed' ? 'text-yellow-400' :
                                 'text-text-low',
      ].join(' ')}>
        {t.status === 'done' ? '✓ done' : t.status === 'claimed' ? '⚒ claimed' : 'open'}
      </div>
    </li>
  );
}

function PhaseTabs({
  phases,
  activePartKey,
  activePhaseIndex,
  onSelect,
}: {
  phases: PhaseInfo[];
  activePartKey: string;
  activePhaseIndex: number;
  onSelect: (partKey: string, phaseIndex: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {phases.map((p) => {
        const isActive = p.partKey === activePartKey && p.phaseIndex === activePhaseIndex;
        const isDone = p.total > 0 && p.done === p.total;
        return (
          <button
            key={`${p.partKey}#${p.phaseIndex}`}
            onClick={() => onSelect(p.partKey, p.phaseIndex)}
            className={[
              'px-2.5 py-1 rounded font-mono text-[10px] tracking-wide border transition-colors',
              isActive
                ? 'bg-accent/20 border-accent text-accent'
                : 'border-border-base/40 text-text-low hover:border-accent/50 hover:text-text-base',
            ].join(' ')}
          >
            {p.label}{isDone ? ' ✓' : ''}
            <span className="ml-1.5 opacity-60">{p.done}/{p.total}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ProjectDetail({ projectId }: { projectId: number }) {
  const q = useProject(projectId);
  const [activePhase, setActivePhase] = useState<{ partKey: string; phaseIndex: number } | null>(null);
  const recipes = useRecipeSnapshot(true);
  const [viewMode, setViewMode] = useState<'tree' | 'source'>('tree');

  if (q.isLoading) {
    return (
      <div className="max-w-[100rem] mx-auto px-4 py-6 font-mono text-[10px] text-text-low flex items-center gap-2">
        <Spinner /> Loading…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="max-w-[100rem] mx-auto px-4 py-6">
        <StatusBanner kind="error">Couldn't load project — try again or check Discord.</StatusBanner>
      </div>
    );
  }

  const { project, tasks, userNames, projectItems } = q.data;
  const creatorLabel = userNames[project.createdBy] ?? project.createdBy;

  // Phase navigation — only for CompanyCraft projects.
  const phases = collectPhases(tasks);
  const hasPhases = phases.length > 1;
  const resolvedPartKey = activePhase?.partKey ?? phases[0]?.partKey ?? '';
  const resolvedPhaseIndex = activePhase?.phaseIndex ?? phases[0]?.phaseIndex ?? 0;
  const visibleTasks = hasPhases ? filterToPhase(tasks, resolvedPartKey, resolvedPhaseIndex) : tasks;
  const groups = groupTasks(visibleTasks);

  const isMultiCraft = projectItems.length >= 2;

  const treeRoots = buildProjectTree(tasks, recipes.data ?? new Map());
  const hasNesting = treeRoots.some((r) => r.children.length > 0);
  const showTreeToggle = hasNesting && !hasPhases;
  const showTree = showTreeToggle && viewMode === 'tree';

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <SectionHeader label={project.name} />

      {/* Target / items summary */}
      <div className="font-mono text-xs text-text-low space-y-0.5">
        {isMultiCraft ? (
          <div>
            Items:{' '}
            {projectItems.map((pi, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1 opacity-40">·</span>}
                <span className="text-text-base">{pi.itemName}</span>
                <span className="ml-1 opacity-60">×{pi.qty}</span>
              </span>
            ))}
          </div>
        ) : project.targetItemId > 0 ? (
          <div>
            Target:{' '}
            <Link to={`/item/${project.targetItemId}`} className="hover:underline">
              {tasks.find(t => t.source === 'craft')?.itemName ?? `Item #${project.targetItemId}`}
            </Link>{' '}
            × {project.targetQty}
          </div>
        ) : null}
        <div>Created by @{creatorLabel}</div>
      </div>

      <div className="text-xs text-text-low italic">View only — edit in Discord with /craft.</div>

      {/* Phase tabs */}
      {hasPhases && (
        <PhaseTabs
          phases={phases}
          activePartKey={resolvedPartKey}
          activePhaseIndex={resolvedPhaseIndex}
          onSelect={(partKey, phaseIndex) => setActivePhase({ partKey, phaseIndex })}
        />
      )}

      {showTreeToggle && (
        <div className="flex gap-1.5">
          {(['tree', 'source'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={[
                'px-2.5 py-1 rounded font-mono text-[10px] tracking-wide border transition-colors',
                viewMode === mode
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'border-border-base/40 text-text-low hover:border-accent/50 hover:text-text-base',
              ].join(' ')}
            >
              {mode === 'tree' ? 'Tree' : 'By source'}
            </button>
          ))}
        </div>
      )}

      {showTree ? (
        <ProjectCraftTree roots={treeRoots} />
      ) : (
        SOURCE_ORDER.map((source) => {
          const list = groups.get(source) ?? [];
          if (list.length === 0) return null;
          return (
            <section key={source} className="border border-border-base rounded p-3">
              <h3 className="font-mono text-[10px] tracking-widest text-text-low mb-2 uppercase">
                {SOURCE_LABEL[source]} · {list.length}
              </h3>
              <ul>
                {list.map((t) => (
                  <TaskRow key={t.id} t={t} userNames={userNames} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
