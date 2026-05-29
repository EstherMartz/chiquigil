export type PlayKind = 'list' | 'craft' | 'arb' | 'vendor' | 'untraded';
export type Quality = 'NQ' | 'HQ';
export type Tone = 'gold' | 'good' | 'aether' | 'warn' | 'bad' | 'mute';

export interface Play {
  kind: PlayKind;
  quality: Quality;
  sellPrice: number;
  cost: number;
  netPerUnit: number;
  effectiveUnitsPerDay: number;
  gilPerDay: number;
  roi: number | null;
  confidence: number;
  score: number;
  headline: string;
  rationale: string;
  bestPlay: string;
  bestPlayDetail: string;
  risk: string;
  tone: Tone;
}

export interface VerdictResult {
  best: Play;
  runnerUp: Play | null;
}
