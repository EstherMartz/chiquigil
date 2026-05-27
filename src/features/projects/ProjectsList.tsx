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
  return parts.join(' Â· ');
}

function progressLabel(s: ProjectSummary): string {
  const total = s.taskCounts.byStatus.open + s.taskCounts.byStatus.claimed + s.taskCounts.byStatus.done;
  return `${s.taskCounts.byStatus.done} / ${total} done`;
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
          <Spinner /> Loadingâ€¦
        </div>
      )}
      {q.isError && <StatusBanner kind="error">Couldn't load projects â€” Discord bot may be down.</StatusBanner>}
      {projects && projects.length === 0 && (
        <EmptyState icon="ðŸ“‹" message="No open projects. Start one with /craft new in Discord." />
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
                    </Link>{' '}Ã— {p.targetQty}
                  </td>
                  <td className="p-2 text-text-low text-xs">{sourceMixSummary(p)}</td>
                  <td className="p-2 font-mono text-xs">{progressLabel(p)}</td>
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
