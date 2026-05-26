export type CurrencyIconKey = number | 'gil' | 'storm-seal' | 'serpent-seal' | 'flame-seal';

interface CurrencyIconEntry {
  file: string;
  alt: string;
}

export const CURRENCY_ICONS: ReadonlyMap<CurrencyIconKey, CurrencyIconEntry> = new Map<CurrencyIconKey, CurrencyIconEntry>([
  [28,    { file: '/icons/currency/28.png',    alt: 'Allagan Tomestone of Poetics' }],
  [48,    { file: '/icons/currency/48.png',    alt: 'Allagan Tomestone of Mathematics' }],
  [47,    { file: '/icons/currency/47.png',    alt: 'Allagan Tomestone of Heliometry' }],
  [49,    { file: '/icons/currency/49.png',    alt: 'Allagan Tomestone of Mnemonics' }],
  [25199, { file: '/icons/currency/25199.png', alt: "White Crafters' Scrip" }],
  [33913, { file: '/icons/currency/33913.png', alt: "Purple Crafters' Scrip" }],
  [41784, { file: '/icons/currency/41784.png', alt: "Orange Crafters' Scrip" }],
  [25200, { file: '/icons/currency/25200.png', alt: "White Gatherers' Scrip" }],
  [33914, { file: '/icons/currency/33914.png', alt: "Purple Gatherers' Scrip" }],
  [41785, { file: '/icons/currency/41785.png', alt: "Orange Gatherers' Scrip" }],
  [29,    { file: '/icons/currency/29.png',    alt: 'MGP' }],
  [25,    { file: '/icons/currency/25.png',    alt: 'Wolf Mark' }],
  [26807, { file: '/icons/currency/26807.png', alt: 'Bicolor Gemstone' }],
  ['gil',          { file: '/icons/currency/gil.png',          alt: 'Gil' }],
  ['storm-seal',   { file: '/icons/currency/storm-seal.png',   alt: 'Storm Seal' }],
  ['serpent-seal', { file: '/icons/currency/serpent-seal.png', alt: 'Serpent Seal' }],
  ['flame-seal',   { file: '/icons/currency/flame-seal.png',   alt: 'Flame Seal' }],
]);
