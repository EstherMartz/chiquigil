import { GameIcon } from './GameIcon';
import { CURRENCY_ICONS, type CurrencyIconKey } from './currencyIcons';

interface Props {
  currencyKey: CurrencyIconKey;
  size?: number;
  decorative?: boolean;
  className?: string;
}

export function CurrencyIcon({ currencyKey, size, decorative = true, className }: Props) {
  const entry = CURRENCY_ICONS.get(currencyKey);
  if (!entry) return null;
  return <GameIcon src={entry.file} alt={entry.alt} size={size} decorative={decorative} className={className} />;
}
