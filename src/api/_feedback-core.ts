import {
  getChannel as realGetChannel,
  createForumPost as realCreateForumPost,
  sendToChannel as realSendToChannel,
} from '../bot/discordApi';

export type FeedbackCategory = 'bug' | 'idea' | 'feedback';

export interface FeedbackContext {
  path: string;
  build: string;
  userAgent: string;
  viewport: string;
}

export interface FeedbackInput {
  category: FeedbackCategory;
  message: string;
  context: FeedbackContext;
  reporter: { sub: string; username: string };
}

export interface FeedbackDeps {
  botToken: string;
  channelId: string;
  getChannel?: typeof realGetChannel;
  createForumPost?: typeof realCreateForumPost;
  sendToChannel?: typeof realSendToChannel;
}

const CATEGORY_META: Record<FeedbackCategory, { emoji: string; label: string; color: number }> = {
  bug: { emoji: '🐛', label: 'Bug', color: 0xe05d5d },
  idea: { emoji: '💡', label: 'Idea', color: 0xd4a958 },
  feedback: { emoji: '💬', label: 'Feedback', color: 0x5da9e0 },
};

const TITLE_MAX = 60;

export function buildTitle(category: FeedbackCategory, message: string): string {
  const meta = CATEGORY_META[category];
  const oneLine = message.replace(/\s+/g, ' ').trim();
  const snippet = oneLine.length > TITLE_MAX ? `${oneLine.slice(0, TITLE_MAX - 1)}…` : oneLine;
  return `[${meta.emoji} ${meta.label}] ${snippet}`;
}

export function buildEmbed(input: FeedbackInput): Record<string, unknown> {
  const meta = CATEGORY_META[input.category];
  return {
    color: meta.color,
    title: `${meta.emoji} ${meta.label}`,
    description: input.message,
    fields: [
      { name: 'Reporter', value: `${input.reporter.username} (<@${input.reporter.sub}>)`, inline: true },
      { name: 'Page', value: input.context.path || '—', inline: true },
      { name: 'Build', value: input.context.build || '—', inline: true },
      { name: 'Viewport', value: input.context.viewport || '—', inline: true },
      { name: 'Client', value: input.context.userAgent || '—', inline: false },
    ],
  };
}

export async function postFeedback(
  deps: FeedbackDeps,
  input: FeedbackInput,
): Promise<{ id: string | null }> {
  const getChannel = deps.getChannel ?? realGetChannel;
  const createForumPost = deps.createForumPost ?? realCreateForumPost;
  const sendToChannel = deps.sendToChannel ?? realSendToChannel;

  const embed = { ...buildEmbed(input), timestamp: new Date().toISOString() };
  const channel = await getChannel(deps.botToken, deps.channelId);

  if (channel?.type === 15) {
    const res = await createForumPost(
      deps.botToken,
      deps.channelId,
      buildTitle(input.category, input.message),
      { embeds: [embed] },
    );
    return { id: (res?.id as string) ?? null };
  }

  const res = await sendToChannel(deps.botToken, deps.channelId, { embeds: [embed] });
  return { id: (res?.id as string) ?? null };
}
