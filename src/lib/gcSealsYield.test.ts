import { describe, it, expect } from 'vitest';
import { gcSealsYield, isEquippable } from './gcSealsYield';

describe('gcSealsYield', () => {
  it('returns 0 for ilvl < 45', () => {
    expect(gcSealsYield(44)).toBe(0);
    expect(gcSealsYield(0)).toBe(0);
  });

  it('returns 188 for ilvl 45-109', () => {
    expect(gcSealsYield(45)).toBe(188);
    expect(gcSealsYield(109)).toBe(188);
    expect(gcSealsYield(70)).toBe(188);
  });

  it('returns 282 for ilvl 110-179', () => {
    expect(gcSealsYield(110)).toBe(282);
    expect(gcSealsYield(179)).toBe(282);
    expect(gcSealsYield(150)).toBe(282);
  });

  it('returns 282 for ilvl 180', () => {
    expect(gcSealsYield(180)).toBe(282);
  });

  it('returns 312 for ilvl 190', () => {
    expect(gcSealsYield(190)).toBe(312);
  });

  it('returns ~492 for ilvl 250', () => {
    const result = gcSealsYield(250);
    // 282 + floor((250-180)/10)*30 = 282 + floor(70/10)*30 = 282 + 7*30 = 282 + 210 = 492
    expect(result).toBe(492);
  });
});

describe('isEquippable', () => {
  it('returns true for weapon category IDs (1, 9-18, 62, 73, 76-78, 83-89, 91, 92)', () => {
    expect(isEquippable(1)).toBe(true);
    expect(isEquippable(9)).toBe(true);
    expect(isEquippable(18)).toBe(true);
    expect(isEquippable(62)).toBe(true);
    expect(isEquippable(73)).toBe(true);
    expect(isEquippable(87)).toBe(true);
  });

  it('returns true for armor category IDs (4, 31-38)', () => {
    expect(isEquippable(4)).toBe(true);
    expect(isEquippable(31)).toBe(true);
    expect(isEquippable(38)).toBe(true);
  });

  it('returns true for accessory category IDs (5, 39-42)', () => {
    expect(isEquippable(5)).toBe(true);
    expect(isEquippable(39)).toBe(true);
    expect(isEquippable(42)).toBe(true);
  });

  it('returns true for tools category IDs (2, 3, 19-30)', () => {
    expect(isEquippable(2)).toBe(true);
    expect(isEquippable(3)).toBe(true);
    expect(isEquippable(19)).toBe(true);
    expect(isEquippable(30)).toBe(true);
  });

  it('returns false for non-equippable categories (7 = Materials)', () => {
    expect(isEquippable(7)).toBe(false);
    expect(isEquippable(6)).toBe(false);
    expect(isEquippable(8)).toBe(false);
  });
});
