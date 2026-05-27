// src/features/onboarding/OnboardingWizard.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, type CrafterLevels } from '../settings/store';
import { WorldPicker } from './WorldPicker';
import { CrafterSetup } from './CrafterSetup';
import { fetchWorldData, type WorldEntry } from './fetchWorldData';

const ZERO_LEVELS: CrafterLevels = { CRP: 0, BSM: 0, ARM: 0, GSM: 0, LTW: 0, WVR: 0, ALC: 0, CUL: 0 };

interface Props {
  onComplete: () => void;
  prefill?: boolean; // true = redo mode, pre-fill from current settings
}

export function OnboardingWizard({ onComplete, prefill }: Props) {
  const navigate = useNavigate();
  const settings = useSettingsStore();

  const [step, setStep] = useState(1);
  const [worlds, setWorlds] = useState<WorldEntry[]>([]);
  const [world, setWorld] = useState(prefill ? settings.world : '');
  const [dc, setDc] = useState(prefill ? settings.dc : '');
  const [levels, setLevels] = useState<CrafterLevels>(prefill ? { ...settings.retainerLevels } : { ...ZERO_LEVELS });

  useEffect(() => {
    fetchWorldData().then(setWorlds);
  }, []);

  function handleStep1Continue() {
    settings.setWorld(world);
    settings.setDc(dc);
    setStep(2);
  }

  function handleStep2Continue() {
    for (const [job, lvl] of Object.entries(levels)) {
      settings.setRetainerLevel(job as keyof CrafterLevels, lvl);
    }
    setStep(3);
  }

  function handleFinish(goToWhatNow: boolean) {
    localStorage.setItem('ffxiv-helper:onboarded', '1');
    onComplete();
    if (goToWhatNow) navigate('/home');
  }

  // Summary for step 3
  const nonZeroCrafters = Object.entries(levels)
    .filter(([, lvl]) => lvl > 0)
    .map(([job, lvl]) => `${job} ${lvl}`)
    .join(' · ');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60"
        onClick={step === 3 ? () => handleFinish(false) : undefined}
      />

      {/* Centering wrapper — min-h-full + flex lets the card center when small and scroll the page when tall */}
      <div className="relative z-10 min-h-full flex items-center justify-center p-4">
      {/* Modal card */}
      <div className="max-w-lg w-full bg-bg-card border border-border-base p-6">
        {/* Progress pips with labels */}
        <div className="flex justify-center items-start gap-6 mb-6">
          {[
            { n: 1, label: 'World' },
            { n: 2, label: 'Crafters' },
            { n: 3, label: 'Done' },
          ].map(({ n, label }) => (
            <div key={n} className="flex flex-col items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${n <= step ? 'bg-gold' : 'bg-border-base'}`}
              />
              <span className={`font-mono text-[9px] tracking-widest uppercase ${n === step ? 'text-gold' : 'text-text-low'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg text-gold tracking-wide">Where do you play?</h2>
              <p className="font-mono text-[10px] text-text-low mt-1">
                All market prices and profit calculations are based on your home world and data center.
              </p>
            </div>

            <WorldPicker worlds={worlds} value={world} onChange={(w, d) => { setWorld(w); setDc(d); }} />

            {dc && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-text-low">Data Center:</span>
                <span className="font-mono text-[10px] tracking-widest uppercase border border-aether/40 text-aether px-2 py-0.5 rounded-sm">
                  {dc}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handleStep1Continue}
              disabled={!world || !dc}
              className="w-full font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-3 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg text-gold tracking-wide">What can you craft?</h2>
              <p className="font-mono text-[10px] text-text-low mt-1">
                Set the level of each crafting job. This filters out recipes you can't make and powers the Trained Eye threshold. Set to 0 if you don't have that job.
              </p>
            </div>

            <CrafterSetup levels={levels} onChange={setLevels} />

            <button
              type="button"
              onClick={handleStep2Continue}
              className="w-full font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-3 hover:bg-gold hover:text-bg-deep transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg text-gold tracking-wide">
                You're all set, {world}!
              </h2>
              <p className="font-mono text-[10px] text-text-low mt-1">
                qiqirn.tools will now show you real market data for your world. Start with What Now? for an instant overview of your best gil-making opportunity right now.
              </p>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gold">◆</span>
                <span className="text-text-low">Home world:</span>
                <span className="text-text-cream">{world} · {dc}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gold">◆</span>
                <span className="text-text-low">Crafters:</span>
                <span className="text-text-cream">{nonZeroCrafters || 'none set'}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleFinish(true)}
                className="flex-1 font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-3 hover:bg-gold hover:text-bg-deep transition-colors"
              >
                Go to What Now? →
              </button>
              <button
                type="button"
                onClick={() => handleFinish(false)}
                className="flex-1 font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-4 py-3 hover:border-aether hover:text-aether transition-colors"
              >
                Explore the app
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
