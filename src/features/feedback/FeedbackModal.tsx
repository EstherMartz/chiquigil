import { useState } from 'react';
import { submitFeedback, type FeedbackCategory } from './submitFeedback';

const CATEGORIES: { value: FeedbackCategory; emoji: string; label: string }[] = [
  { value: 'bug', emoji: '🐛', label: 'Bug' },
  { value: 'idea', emoji: '💡', label: 'Idea' },
  { value: 'feedback', emoji: '💬', label: 'Feedback' },
];

const MAX = 500;

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<SubmitState>('idle');

  async function send() {
    const trimmed = message.trim();
    if (!trimmed || state === 'submitting') return;
    setState('submitting');
    try {
      await submitFeedback(category, trimmed);
      setState('success');
      setTimeout(onClose, 1500);
    } catch {
      setState('error');
    }
  }

  return (
    <div
      className="fixed inset-0 bg-bg-deep/80 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] z-50"
      onClick={onClose}
    >
      <div className="bg-bg-card border border-border-hi max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg text-gold mb-4">Send feedback</h2>

        {state === 'success' ? (
          <p className="font-mono text-sm text-aether py-4">Thanks! Posted to #qiqirn-feedback.</p>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`font-mono text-[11px] tracking-widest uppercase border px-3 py-2 transition-colors ${
                    category === c.value
                      ? 'border-aether text-aether'
                      : 'border-border-base text-text-dim hover:text-aether'
                  }`}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>

            <label className="block mb-1">
              <span className="font-mono text-[13px] tracking-widest uppercase text-text-low">Message</span>
              <textarea
                value={message}
                maxLength={MAX}
                rows={4}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1 block w-full bg-bg-deep border border-border-base px-3 py-2 font-mono text-sm resize-none"
                placeholder="What happened, or what would you like to see?"
              />
            </label>

            <div className="flex justify-between items-center mb-5">
              <span className="font-mono text-[11px] text-text-dim">We'll include this page + your app version.</span>
              <span className="font-mono text-[11px] text-text-dim">{message.length}/{MAX}</span>
            </div>

            {state === 'error' && (
              <p className="font-mono text-[12px] text-[#e05d5d] mb-3">Couldn't send — try again.</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-4 py-2 hover:text-aether hover:border-aether transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={!message.trim() || state === 'submitting'}
                className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {state === 'submitting' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
