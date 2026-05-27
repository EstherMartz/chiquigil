import { useQuery } from '@tanstack/react-query';
import type { ProjectsListResponse } from './types';

const GUILD_ID = (import.meta.env?.VITE_GUILD_ID as string | undefined) ?? '';

async function fetchProjects(): Promise<ProjectsListResponse> {
  if (!GUILD_ID) throw new Error('VITE_GUILD_ID not configured');
  const res = await fetch(`/api/projects?guild=${encodeURIComponent(GUILD_ID)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ProjectsListResponse;
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
