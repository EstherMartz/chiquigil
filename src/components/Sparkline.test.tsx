import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders an SVG with one polyline for non-empty data', () => {
    const { container } = render(<Sparkline points={[1, 2, 3, 4]} width={100} height={20} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
  });

  it('renders a placeholder when points is empty', () => {
    const { container } = render(<Sparkline points={[]} width={100} height={20} />);
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
    expect(container.textContent).toContain('—');
  });

  it('renders a flat line when all points are equal', () => {
    const { container } = render(<Sparkline points={[5, 5, 5]} width={100} height={20} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    const pts = polyline!.getAttribute('points')!;
    const ys = pts.split(' ').map((p) => Number(p.split(',')[1]));
    expect(ys.every((y) => y === 10)).toBe(true);
  });
});
