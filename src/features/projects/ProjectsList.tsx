import { Link } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import { SectionHeader } from '../../components/SectionHeader';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { useProjects } from './useProjects';
import type { ProjectSummary } from './types';

function sourceMixSummary(s: ProjectSummary): string {
  const parts: string[] = [];
  for (const [key, count] of Object.entries(s.taskCounts.bySource)) {
    if (count > 0) parts.push(`${count} ${key}`);
  }
  return parts.join(' · ');
}

function ProjectProgress({ s }: { s: ProjectSummary }) {
  const done = s.taskCounts.byStatus.done;
  const total = s.taskCounts.byStatus.open + s.taskCounts.byStatus.claimed + done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = total > 0 && done === total;
  const fillClass = isComplete ? 'bg-jade' : pct > 0 ? 'bg-gold' : 'bg-text-low/20';
  return (
    <div className="space-y-1 w-32">
      <div className="h-1.5 rounded-full bg-bg-elev overflow-hidden">
        <div
          className={`h-full ${fillClass} transition-[width] duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="font-mono text-[10px] text-text-low">
        {done} / {total} · {pct}%
      </div>
    </div>
  );
}

export function ProjectsList() {
  const q = useProjects();
  const projects = q.data?.projects;
  const userNames = q.data?.userNames ?? {};

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <SectionHeader label="Crafting Projects" />

      {q.isLoading && (
        <div className="font-mono text-[10px] text-text-low flex items-center gap-2">
          <Spinner /> Loading…
        </div>
      )}
      {q.isError && <StatusBanner kind="error">Couldn't load projects — Discord bot may be down.</StatusBanner>}
      {projects && projects.length === 0 && (
        <EmptyState icon="📋" message="No open projects. Start one with /craft new in Discord." />
      )}

      {projects && projects.length > 0 && (
        <div className="border border-border-base rounded">
          <table className="w-full text-sm">
            <thead className="text-[10px] font-mono text-text-low border-b border-border-base">
              <tr>
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Project</th>
                <th className="text-left p-2">Target</th>
                <th className="text-left p-2">Source mix</th>
                <th className="text-left p-2">Progress</th>
                <th className="text-left p-2">Created by</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-border-base/30 last:border-0 hover:bg-bg-elev">
                  <td className="p-2 font-mono text-text-low">#{p.id}</td>
                  <td className="p-2">
                    <Link to={`/projects/${p.id}`} className="text-accent hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="p-2">
                    <Link to={`/item/${p.targetItemId}`} className="hover:underline">
                      Item #{p.targetItemId}
                    </Link>{' '}× {p.targetQty}
                  </td>
                  <td className="p-2 text-text-low text-xs">{sourceMixSummary(p)}</td>
                  <td className="p-2"><ProjectProgress s={p} /></td>
                  <td className="p-2 font-mono text-xs text-text-low">{userNames[p.createdBy] ?? p.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
