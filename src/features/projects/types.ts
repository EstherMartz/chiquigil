import type { StoredTask, TaskSource } from '../../bot/craftTypes';

export interface ProjectSummary {
  id: number;
  name: string;
  targetItemId: number;
  targetQty: number;
  createdBy: string;
  threadId: string | null;
  status: 'open' | 'closed';
  createdAt: number;
  taskCounts: {
    byStatus: { open: number; claimed: number; done: number };
    bySource: Record<TaskSource, number>;
  };
}

export interface ProjectDetailResponse {
  project: Omit<ProjectSummary, 'taskCounts'>;
  tasks: StoredTask[];
}
