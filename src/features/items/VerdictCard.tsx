import { fmtGil } from '../../lib/format';
import type { MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

type PlayKind = 'craft' | 'arb' | 'vendor' | 'list' | 'thin' | 'untraded';
type Tone = 'gold' | 'good' | 'aether' | 'warn' | 'bad' | 'mute';

interface Verdict {
  kind: PlayKind;
  headline: string;             // e.g. "Cheaper on Lich"
  rationale: string;            // one-sentence explanation
  bestPlay: string;             // "Cross-world arb"
  bestPlayDetail: string;       // "Buy on Lich · resell home"
  margin: number | null;        // gil profit per unit (null if not a money play)
  marginLabel: string;          // "+ 272k · 136% ROI" or "—"
  risk: string;                 // "Medium — illiquid"
  tone: Tone;                   // accent color for left bar + verdict text
}

const TONE_BORDER: Record<Tone, string> = {
  gold: 'border-l-gold',
  good: 'border-l-jade',
  aether: 'border-l-aether',
  warn: 'border-l-gold',
  bad: 'border-l-crimson',
  mute: 'border-l-border-base',
};

const TONE_TEXT: Record<Tone, string> = {
  gold: 'text-gold',
  good: 'text-jade',
  aether: 'text-aether',
  warn: 'text-gold',
  bad: 'text-crimson',
  mute: 'text-text-low',
};

const TONE_FRAME: Record<Tone, string> = {
  gold: 'border-gold/40',
  good: 'border-jade/40',
  aether: 'border-aether/40',
  warn: 'border-gold/40',
  bad: 'border-crimson/40',
  mute: 'border-border-base',
};

function priceOf(m: MarketItem | undefined, canHq: boolean): number | null {
  if (!m) return null;
  return canHq ? (m.minHQ ?? m.minNQ) : (m.minNQ ?? m.minHQ);
}

function bestForeignListing(m: MarketItem | undefined, homeWorld: string, canHq: boolean) {
  if (!m) return null;
  const candidates = m.worldListings
    .filter((l) => l.world !== homeWorld && (!canHq || l.hq === canHq ? true : !l.hq))
    .sort((a, b) => a.price - b.price);
  return candidates[0] ?? null;
}

function riskFromVelocity(v: number): string {
  if (v >= 5) return 'Low — moves daily';
  if (v >= 1) return 'Medium';
  if (v >= 0.3) return 'Medium — slow seller';
  return 'High — illiquid';
}

function computeVerdict({
  phantom, region, recipe, vendorPrice, materialCost, homeWorld, canHq,
}: {
  phantom: MarketItem | undefined;
  region: MarketItem | undefined;
  recipe: Recipe | undefined;
  vendorPrice: number | undefined;
  materialCost: number;
  homeWorld: string;
  canHq: boolean;
}): Verdict | null {
  const homePrice = priceOf(phantom, canHq);
  const homeVelocity = phantom?.velocity ?? 0;

  // Untraded — no useful market data at all
  if (!phantom || homePrice == null) {
    return {
      kind: 'untraded',
      headline: 'Not enough data',
      rationale: 'No marketboard activity on the home world. Check Garland or Universalis for context, or wait for a listing.',
      bestPlay: 'Wait or check externally',
      bestPlayDetail: 'No play yet',
      margin: null,
      marginLabel: '—',
      risk: 'n/a',
      tone: 'mute',
    };
  }

  // Cross-world arbitrage opportunity
  const foreign = bestForeignListing(region, homeWorld, canHq);
  if (foreign && foreign.price > 0 && foreign.price < homePrice * 0.7) {
    const arbProfit = homePrice - foreign.price;
    const arbPct = Math.round((arbProfit / homePrice) * 100);
    return {
      kind: 'arb',
      headline: `Cheaper on ${foreign.world}`,
      rationale: `Buy on ${foreign.world} for ${fmtGil(foreign.price)}, resell home around ${fmtGil(homePrice)}. The home price isn't backed by local trade volume.`,
      bestPlay: 'Cross-world arb',
      bestPlayDetail: `Buy on ${foreign.world} · resell home`,
      margin: arbProfit,
      marginLabel: `+ ${fmtGil(arbProfit)} · ${arbPct}% under home`,
      risk: homeVelocity >= 1 ? 'Medium — depends on local velocity' : 'Medium — home is illiquid',
      tone: 'good',
    };
  }

  // Vendor flip — NPC sells much cheaper than MB
  if (vendorPrice && vendorPrice > 0 && vendorPrice * 2 < homePrice) {
    const vendorProfit = homePrice - vendorPrice;
    return {
      kind: 'vendor',
      headline: 'Buy from NPC, sell on MB',
      rationale: `Vendor sells for ${fmtGil(vendorPrice)}, MB sells around ${fmtGil(homePrice)}. Free gil per turn-in.`,
      bestPlay: 'Vendor flip',
      bestPlayDetail: `Buy ${fmtGil(vendorPrice)} → sell ${fmtGil(homePrice)}`,
      margin: vendorProfit,
      marginLabel: `+ ${fmtGil(vendorProfit)} per unit`,
      risk: riskFromVelocity(homeVelocity),
      tone: 'gold',
    };
  }

  // Craft flip — recipe profitable
  if (recipe && materialCost > 0 && homePrice > materialCost) {
    const craftProfit = homePrice - materialCost;
    const craftMargin = craftProfit / homePrice;
    if (craftMargin > 0.15) {
      return {
        kind: 'craft',
        headline: 'Craft and sell',
        rationale: `Materials cost about ${fmtGil(materialCost)} at home prices; sells around ${fmtGil(homePrice)} at ${homeVelocity.toFixed(1)}/day.`,
        bestPlay: 'Craft-flip',
        bestPlayDetail: `${recipe.classJob} · Lv ${recipe.recipeLevel}`,
        margin: craftProfit,
        marginLabel: `+ ${fmtGil(craftProfit)} · ${Math.round(craftMargin * 100)}% margin`,
        risk: riskFromVelocity(homeVelocity),
        tone: 'gold',
      };
    }
  }

  // Thin market — listed but barely sells
  if ((phantom.listingCount ?? 0) < 3 && homeVelocity < 0.3) {
    return {
      kind: 'thin',
      headline: "Don't trust the home price",
      rationale: `Only ${phantom.listingCount} listing(s) on the home world and ${homeVelocity.toFixed(1)} sales/day. The listed price likely isn't backed by real trades.`,
      bestPlay: 'Wait or look elsewhere',
      bestPlayDetail: 'Check sale history before acting',
      margin: null,
      marginLabel: '—',
      risk: 'High — illiquid',
      tone: 'bad',
    };
  }

  // Default — list it
  return {
    kind: 'list',
    headline: 'Normal marketboard listing',
    rationale: `Sells around ${fmtGil(homePrice)} at ${homeVelocity.toFixed(1)}/day on the home world. No obvious arb or craft edge.`,
    bestPlay: 'List on MB',
    bestPlayDetail: `~ ${fmtGil(homePrice)} per unit`,
    margin: null,
    marginLabel: '—',
    risk: riskFromVelocity(homeVelocity),
    tone: homeVelocity >= 1 ? 'gold' : 'mute',
  };
}

interface Props {
  phantom: MarketItem | undefined;
  region: MarketItem | undefined;
  recipe: Recipe | undefined;
  vendorPrice: number | undefined;
  materialCost: number;
  homeWorld: string;
  canHq: boolean;
}

export function VerdictCard(props: Props) {
  const v = computeVerdict(props);
  if (!v) return null;

  return (
    <section
      className={`bg-bg-card border ${TONE_FRAME[v.tone]} border-l-[3px] ${TONE_BORDER[v.tone]} p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] gap-5 md:gap-7`}
    >
      <div>
        <div className={`font-mono text-[10px] tracking-widest uppercase mb-1.5 ${TONE_TEXT[v.tone]}`}>
          ✦ Verdict
        </div>
        <div className={`font-display text-xl tracking-wide mb-1.5 ${v.tone === 'bad' ? 'text-crimson' : v.tone === 'good' ? 'text-jade' : v.tone === 'mute' ? 'text-text-cream' : 'text-text-cream'}`}>
          {v.headline}
        </div>
        <p className="text-[12.5px] text-text-dim leading-snug">{v.rationale}</p>
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">Best play</div>
        <div className="font-display text-base text-gold tracking-wide mb-1">{v.bestPlay}</div>
        <p className="text-[12.5px] text-text-dim leading-snug">{v.bestPlayDetail}</p>
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">Margin</div>
        {v.margin != null ? (
          <>
            <div className="font-mono text-2xl text-jade tabular-nums leading-none">
              + {fmtGil(v.margin)}
            </div>
            <p className="font-mono text-[11px] text-text-dim mt-1.5">{v.marginLabel}</p>
          </>
        ) : (
          <div className="font-mono text-2xl text-text-low tabular-nums leading-none">—</div>
        )}
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">Risk</div>
        <div className="font-display text-base text-text-cream tracking-wide mb-1">{v.risk}</div>
      </div>
    </section>
  );
}
