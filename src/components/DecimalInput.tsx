import { useState } from 'react';

/**
 * Locale-stable decimal input. A native `<input type="number">` renders a
 * fractional value using the *browser's* locale separator — so `0.14` shows as
 * `0,14` for a Spanish/German user, clashing with the period everything else in
 * the app uses. This keeps a string draft so mid-typing works, accepts either
 * separator, and always *displays* a period regardless of locale.
 *
 * Emits a parsed number via `onChange`. Empty input emits `min` (default 0).
 */
export function DecimalInput({
  value, onChange, min = 0, className, ...rest
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min'>) {
  const [draft, setDraft] = useState(() => String(value));
  const [lastValue, setLastValue] = useState(value);

  // Resync the draft when the parent value changes underneath us (e.g. a Reset
  // button) — but never clobber an in-progress edit that already parses to it.
  // Adjusting state during render (React-recommended) avoids an effect.
  if (value !== lastValue) {
    setLastValue(value);
    if (Number(draft.replace(',', '.')) !== value) setDraft(String(value));
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.');
        if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return; // reject non-decimal keystrokes
        setDraft(raw);
        if (raw === '' || raw === '.') { onChange(min); return; }
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(Math.max(min, n));
      }}
      onBlur={() => setDraft(String(value))}
      className={className}
    />
  );
}
