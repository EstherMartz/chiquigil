import { describe, it, expect } from 'vitest';
import config from '../../tailwind.config';

const colors = (config as any).theme.extend.colors as Record<string, string>;

/** sRGB channel → linear. */
function lin(c8: number): number {
  const s = c8 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('faint label contrast (WCAG AA)', () => {
  it('text-low meets 4.5:1 on bg-card', () => {
    expect(contrast(colors['text-low'], colors['bg-card'])).toBeGreaterThanOrEqual(4.5);
  });

  it('text-dim also meets 4.5:1 on bg-card (sanity)', () => {
    expect(contrast(colors['text-dim'], colors['bg-card'])).toBeGreaterThanOrEqual(4.5);
  });

  it('preserves the cream > dim > low brightness hierarchy', () => {
    expect(luminance(colors['text-cream'])).toBeGreaterThan(luminance(colors['text-dim']));
    expect(luminance(colors['text-dim'])).toBeGreaterThan(luminance(colors['text-low']));
  });
});
