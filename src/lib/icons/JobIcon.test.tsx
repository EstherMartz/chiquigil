import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { JobIcon } from './JobIcon';

describe('JobIcon', () => {
  it('renders the matching icon for a known job key', () => {
    const { container } = render(<JobIcon job="CRP" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/icons/jobs/CRP.png');
  });

  it('passes alt through (presentational by default = empty alt)', () => {
    const { container } = render(<JobIcon job="CRP" />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('uses non-empty alt when decorative={false}', () => {
    const { container } = render(<JobIcon job="CRP" decorative={false} />);
    expect(container.querySelector('img')).toHaveAttribute('alt', 'Carpenter');
  });

  it('renders null for unknown keys', () => {
    const { container } = render(<JobIcon job={'XXX' as never} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
