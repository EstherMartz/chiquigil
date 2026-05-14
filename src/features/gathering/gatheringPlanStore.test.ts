import { describe, it, expect, beforeEach } from 'vitest';
import { useGatheringPlanStore, defaultGatheringPlan } from './gatheringPlanStore';

beforeEach(() => {
  localStorage.clear();
  useGatheringPlanStore.setState(defaultGatheringPlan());
});

describe('gathering plan store', () => {
  it('exposes the documented defaults', () => {
    const s = useGatheringPlanStore.getState();
    expect(s.budgetMode).toBe('time');
    expect(s.budgetTimeMin).toBe(45);
    expect(s.budgetGil).toBe(500_000);
    expect(s.itemCount).toBe(3);
    expect(s.maxLevel).toBe(90);
    expect(s.includeTimed).toBe(false);
    expect(s.listName).toBe('AFK gather');
    expect(s.itemsPerMin).toBe(100);
  });

  it('setters mutate just that field', () => {
    useGatheringPlanStore.getState().setBudgetMode('gil');
    expect(useGatheringPlanStore.getState().budgetMode).toBe('gil');
    expect(useGatheringPlanStore.getState().budgetTimeMin).toBe(45);

    useGatheringPlanStore.getState().setItemCount(7);
    expect(useGatheringPlanStore.getState().itemCount).toBe(7);
  });

  it('clamps itemCount to 1-10', () => {
    useGatheringPlanStore.getState().setItemCount(0);
    expect(useGatheringPlanStore.getState().itemCount).toBe(1);
    useGatheringPlanStore.getState().setItemCount(99);
    expect(useGatheringPlanStore.getState().itemCount).toBe(10);
  });
});
