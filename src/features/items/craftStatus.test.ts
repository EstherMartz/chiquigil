import { describe, it, expect } from 'vitest';
import { craftStatus } from './craftStatus';

const levels = { CRP: 93, BSM: 33, ARM: 42, GSM: 83, LTW: 100, WVR: 100, ALC: 90, CUL: 100 };

describe('craftStatus', () => {
  it('returns ok for ANY items regardless of levels', () => {
    expect(craftStatus({ crafter: 'ANY', lvl: 100 }, levels)).toBe('ok');
  });
  it('returns ok when retainer level >= recipe level', () => {
    expect(craftStatus({ crafter: 'LTW', lvl: 90 }, levels)).toBe('ok');
    expect(craftStatus({ crafter: 'LTW', lvl: 100 }, levels)).toBe('ok');
  });
  it('returns short when within 10 levels', () => {
    expect(craftStatus({ crafter: 'BSM', lvl: 42 }, levels)).toBe('short');
  });
  it('returns no when more than 10 below', () => {
    expect(craftStatus({ crafter: 'BSM', lvl: 50 }, levels)).toBe('no');
  });
});
