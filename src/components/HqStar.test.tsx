import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HqStar } from './HqStar';

describe('HqStar', () => {
  it('renders the HQ marker image with accessible alt', () => {
    render(<HqStar />);
    const img = screen.getByAltText('High Quality');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/icons/hq/marker.png');
  });

  it('adds a leading margin when leading=true', () => {
    const { container } = render(<HqStar leading />);
    const span = container.querySelector('span');
    expect(span?.className).toMatch(/ml-1/);
  });

  it('renders a larger image when big=true', () => {
    const { container } = render(<HqStar big />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('width', '18');
  });

  it('renders the default 14px width when big=false', () => {
    const { container } = render(<HqStar />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('width', '14');
  });
});
