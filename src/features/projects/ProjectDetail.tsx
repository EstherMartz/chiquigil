import { Link } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import { SectionHeader } from '../../components/SectionHeader';
import { StatusBanner } from '../../components/StatusBanner';
import { useProject } from './useProject';
import type { StoredTask, TaskSource } from '../../bot/craftTypes';

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

function TaskRow({ t, userNames }: { t: StoredTask; userNames: Record<string, string> }) {
  const pct = t.qtyNeeded > 0 ? Math.round((t.qtyDone / t.qtyNeeded) * 100) : 0;
  const assigneeLabel = t.assigneeId ? userNames[t.assigneeId] ?? t.assigneeId : 'unclaimed';
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 border-b border-border-base/20 last:border-0">
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
      <div className="font-mono text-xs w-16 text-right">{t.status}</div>
    </li>
  );
}

export function ProjectDetail({ projectId }: { projectId: number }) {
  const q = useProject(projectId);

  if (q.isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 font-mono text-[10px] text-text-low flex items-center gap-2">
        <Spinner /> Loading…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <StatusBanner kind="error">Couldn't load project — try again or check Discord.</StatusBanner>
      </div>
    );
  }

  const { project, tasks, userNames } = q.data;
  const groups = groupTasks(tasks);
  const creatorLabel = userNames[project.createdBy] ?? project.createdBy;

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <SectionHeader label={project.name} />
      <div className="font-mono text-xs text-text-low">
        Target:{' '}
        <Link to={`/item/${project.targetItemId}`} className="hover:underline">
          Item #{project.targetItemId}
        </Link>{' '}
        × {project.targetQty}
        {' · '}Created by @{creatorLabel}
      </div>
      <div className="text-xs text-text-low italic">View only — edit in Discord with /craft.</div>

      {SOURCE_ORDER.map((source) => {
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
      })}
    </div>
  );
}
