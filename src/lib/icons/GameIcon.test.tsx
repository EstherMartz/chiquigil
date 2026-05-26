import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GameIcon } from './GameIcon';

describe('GameIcon', () => {
  it('renders an img with the given src and alt', () => {
    render(<GameIcon src="/icons/jobs/CRP.png" alt="Carpenter" />);
    const img = screen.getByAltText('Carpenter');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/icons/jobs/CRP.png');
  });

  it('defaults size to 16 and applies it to width/height attributes', () => {
    render(<GameIcon src="/x.png" alt="x" />);
    const img = screen.getByAltText('x');
    expect(img).toHaveAttribute('width', '16');
    expect(img).toHaveAttribute('height', '16');
  });

  it('respects a custom size', () => {
    render(<GameIcon src="/x.png" alt="x" size={24} />);
    const img = screen.getByAltText('x');
    expect(img).toHaveAttribute('width', '24');
    expect(img).toHaveAttribute('height', '24');
  });

  it('uses empty alt when decorative=true', () => {
    render(<GameIcon src="/x.png" alt="Carpenter" decorative />);
    const img = document.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
  });

  it('passes className through', () => {
    render(<GameIcon src="/x.png" alt="x" className="custom-cls" />);
    expect(screen.getByAltText('x')).toHaveClass('custom-cls');
  });

  it('sets loading=lazy by default', () => {
    render(<GameIcon src="/x.png" alt="x" />);
    expect(screen.getByAltText('x')).toHaveAttribute('loading', 'lazy');
  });
});
