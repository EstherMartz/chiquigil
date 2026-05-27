import { useParams } from 'react-router-dom';
import { ProjectDetail } from '../features/projects/ProjectDetail';

export default function Project() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return <div className="max-w-[100rem] mx-auto px-4 py-6 text-text-low">Invalid project id.</div>;
  }
  return <ProjectDetail projectId={projectId} />;
}
