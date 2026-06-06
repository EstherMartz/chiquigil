import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CraftListSummary, CraftListDetail, CraftListItem } from './types';

const LISTS_KEY = ['craft-lists'] as const;

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchLists(): Promise<CraftListSummary[]> {
  const body = await asJson<{ lists: CraftListSummary[] }>(await fetch('/api/lists'));
  return body.lists;
}

export async function fetchList(id: string): Promise<CraftListDetail> {
  return asJson<CraftListDetail>(await fetch(`/api/lists/${encodeURIComponent(id)}`));
}

export async function createListReq(name: string, items: CraftListItem[]): Promise<string> {
  const body = await asJson<{ id: string }>(await fetch('/api/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, items }),
  }));
  return body.id;
}

export async function updateListReq(
  id: string, patch: { name?: string; items?: CraftListItem[] },
): Promise<CraftListDetail> {
  return asJson<CraftListDetail>(await fetch(`/api/lists/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }));
}

export async function deleteListReq(id: string): Promise<void> {
  await asJson<{ ok: true }>(await fetch(`/api/lists/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export function useCraftLists() {
  return useQuery({ queryKey: LISTS_KEY, queryFn: fetchLists });
}

export function useCraftList(id: string | undefined) {
  return useQuery({
    queryKey: [...LISTS_KEY, id],
    queryFn: () => fetchList(id!),
    enabled: !!id,
  });
}

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, items }: { name: string; items: CraftListItem[] }) => createListReq(name, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTS_KEY }),
  });
}

export function useUpdateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; items?: CraftListItem[] } }) =>
      updateListReq(id, patch),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: LISTS_KEY });
      qc.invalidateQueries({ queryKey: [...LISTS_KEY, vars.id] });
    },
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteListReq(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTS_KEY }),
  });
}
