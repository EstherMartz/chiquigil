import { useQuery } from '@tanstack/react-query';
import type { ProjectSummary } from './types';

const GUILD_ID = (import.meta.env?.VITE_GUILD_ID as string | undefined) ?? '';

async function fetchProjects(): Promise<ProjectSummary[]> {
  if (!GUILD_ID) throw new Error('VITE_GUILD_ID not configured');
  const res = await fetch(`/api/projects?guild=${encodeURIComponent(GUILD_ID)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { projects: ProjectSummary[] };
  return body.projects;
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects', GUILD_ID],
    queryFn: fetchProjects,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
