// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { buildTitle, buildEmbed, postFeedback, type FeedbackInput, type FeedbackDeps } from './_feedback-core';

const input: FeedbackInput = {
  category: 'bug',
  message: 'The crafts page throws when I sort by profit and the list is empty',
  context: { path: '/crafts?sort=profit', build: '0.0.1', userAgent: 'Mozilla/5.0', viewport: '1440x900' },
  reporter: { sub: '123', username: 'Esther' },
};

describe('buildTitle', () => {
  it('prefixes category emoji + label and truncates long messages to ~60 chars', () => {
    const t = buildTitle('bug', input.message);
    expect(t.startsWith('[🐛 Bug] ')).toBe(true);
    expect(t.length).toBeLessThanOrEqual(8 + 60 + 2);
    expect(t.endsWith('…')).toBe(true);
  });

  it('keeps short messages intact without an ellipsis', () => {
    expect(buildTitle('idea', 'Add dark mode')).toBe('[💡 Idea] Add dark mode');
  });
});

describe('buildEmbed', () => {
  it('carries description, reporter mention, page, build and viewport', () => {
    const e = buildEmbed(input) as any;
    expect(e.description).toBe(input.message);
    expect(e.color).toBe(0xE05D5D);
    const flat = JSON.stringify(e.fields);
    expect(flat).toContain('<@123>');
    expect(flat).toContain('Esther');
    expect(flat).toContain('/crafts?sort=profit');
    expect(flat).toContain('0.0.1');
    expect(flat).toContain('1440x900');
  });
});

describe('postFeedback', () => {
  it('creates a forum post when the channel is a forum (type 15)', async () => {
    const getChannel = vi.fn().mockResolvedValue({ id: 'ch', type: 15, name: 'qiqirn-feedback' });
    const createForumPost = vi.fn().mockResolvedValue({ id: 'thread1' });
    const sendToChannel = vi.fn();
    const deps: FeedbackDeps = { botToken: 'tok', channelId: 'ch', getChannel, createForumPost, sendToChannel };

    const out = await postFeedback(deps, input);

    expect(createForumPost).toHaveBeenCalledOnce();
    expect(sendToChannel).not.toHaveBeenCalled();
    const [, channelId, name, payload] = createForumPost.mock.calls[0];
    expect(channelId).toBe('ch');
    expect(name.startsWith('[🐛 Bug] ')).toBe(true);
    expect((payload as any).embeds).toHaveLength(1);
    expect(out.id).toBe('thread1');
  });

  it('sends a channel message when the channel is text (type 0)', async () => {
    const getChannel = vi.fn().mockResolvedValue({ id: 'ch', type: 0, name: 'feedback' });
    const createForumPost = vi.fn();
    const sendToChannel = vi.fn().mockResolvedValue({ id: 'msg1' });
    const deps: FeedbackDeps = { botToken: 'tok', channelId: 'ch', getChannel, createForumPost, sendToChannel };

    const out = await postFeedback(deps, input);

    expect(sendToChannel).toHaveBeenCalledOnce();
    expect(createForumPost).not.toHaveBeenCalled();
    expect(out.id).toBe('msg1');
  });
});
