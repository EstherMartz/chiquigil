import { useQuery } from '@tanstack/react-query';
import type { ProjectDetailResponse } from './types';

async function fetchProject(id: number): Promise<ProjectDetailResponse> {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ProjectDetailResponse;
}

export function useProject(id: number | null) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id as number),
    enabled: id != null,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
