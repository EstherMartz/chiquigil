import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CurrencyIcon } from './CurrencyIcon';

describe('CurrencyIcon', () => {
  it('renders by numeric item id', () => {
    const { container } = render(<CurrencyIcon currencyKey={28} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/icons/currency/28.png');
  });

  it('renders by gil sentinel', () => {
    const { container } = render(<CurrencyIcon currencyKey="gil" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/icons/currency/gil.png');
  });

  it('renders by GC seal slug', () => {
    const { container } = render(<CurrencyIcon currencyKey="storm-seal" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/icons/currency/storm-seal.png');
  });

  it('renders null for unknown key', () => {
    const { container } = render(<CurrencyIcon currencyKey={999999} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
