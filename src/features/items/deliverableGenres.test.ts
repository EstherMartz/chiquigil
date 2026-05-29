import { describe, it, expect } from 'vitest';
import { jobTagForGenre } from './deliverableGenres';

describe('jobTagForGenre', () => {
  it('returns the class-quest tag for a known genre', () => {
    expect(jobTagForGenre(174)).toBe('BTN class quest');
  });

  it('returns null for an unknown genre', () => {
    expect(jobTagForGenre(9999)).toBeNull();
  });

  it('returns null when genre is undefined', () => {
    expect(jobTagForGenre(undefined)).toBeNull();
  });
});
