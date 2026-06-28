export type FeedbackCategory = 'bug' | 'idea' | 'feedback';

export async function submitFeedback(category: FeedbackCategory, message: string): Promise<void> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      category,
      message,
      context: {
        path: window.location.pathname + window.location.search,
        build: __APP_VERSION__,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      },
    }),
  });
  if (!res.ok) throw new Error(`Feedback failed: ${res.status}`);
}
