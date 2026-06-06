import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceTag } from './SourceTag';

describe('SourceTag', () => {
  it('renders a human label per source', () => {
    render(<SourceTag source="TimedGather" />);
    expect(screen.getByText('TIMED GATHER')).toBeInTheDocument();
  });

  it('renders crystal label', () => {
    render(<SourceTag source="Crystal" />);
    expect(screen.getByText('CRYSTAL')).toBeInTheDocument();
  });
});
