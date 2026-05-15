import { describe, it, expect, beforeEach } from 'vitest';
import { useLevePlanStore, defaultLevePlan } from './levePlanStore';

beforeEach(() => {
  localStorage.clear();
  useLevePlanStore.setState(defaultLevePlan());
});

describe('useLevePlanStore', () => {
  it('has expected defaults', () => {
    const s = useLevePlanStore.getState();
    expect(s.mode).toBe('gil');
    expect(s.jobFilter).toBe('all');
    expect(s.maxLevel).toBe(100);
  });

  it('setMode toggles between gil and exp', () => {
    useLevePlanStore.getState().setMode('exp');
    expect(useLevePlanStore.getState().mode).toBe('exp');
    useLevePlanStore.getState().setMode('gil');
    expect(useLevePlanStore.getState().mode).toBe('gil');
  });

  it('setJobFilter accepts class codes and category strings', () => {
    useLevePlanStore.getState().setJobFilter('CRP');
    expect(useLevePlanStore.getState().jobFilter).toBe('CRP');
    useLevePlanStore.getState().setJobFilter('doh');
    expect(useLevePlanStore.getState().jobFilter).toBe('doh');
  });

  it('setMaxLevel clamps to 1-100 and floors decimals', () => {
    useLevePlanStore.getState().setMaxLevel(50.7);
    expect(useLevePlanStore.getState().maxLevel).toBe(50);
    useLevePlanStore.getState().setMaxLevel(0);
    expect(useLevePlanStore.getState().maxLevel).toBe(1);
    useLevePlanStore.getState().setMaxLevel(999);
    expect(useLevePlanStore.getState().maxLevel).toBe(100);
  });
});
