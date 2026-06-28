# In-app Bug Report / Feedback → Discord

**Date:** 2026-06-28
**Status:** Approved (design)

## Problem

There's no in-app path for users to report bugs or send feedback. We want a low-friction
affordance in the top-right (next to the user info) that captures a report at the moment of
frustration and routes it to the `#qiqirn-feedback` Discord channel automatically, so reports
land in one place with enough context to be actionable.

## Context & constraints

- **Every web user is a guild member.** The app is guild-gated (Discord OAuth + `GUILD_ALLOWLIST`),
  so we don't need to handle non-members. This is why a bot-posted report is the right model and
  why a thread back-link (deferred) would work for everyone.
- **12-function Vercel Hobby cap.** All 12 lambda slots in [vercel.json](../../../vercel.json) are
  in use. The feedback endpoint must fold into an existing function — `projects.mjs` — not add a
  new one.
- Session identity is available server-side via `requireSession(req)` →
  `{ sub, username, avatar, guilds }` (see [_auth.ts](../../../src/api/_auth.ts)).
- The bot already has channel-posting primitives in
  [discordApi.ts](../../../src/bot/discordApi.ts): `getChannel`, `sendToChannel`,
  `createForumPost`. These are bundled into the lambdas by the `build:api` esbuild step.
- `DISCORD_BOT_TOKEN` is already in the Vercel env (used by `discord.mjs`).
- `__APP_VERSION__` (package.json version) is injected globally via a Vite `define`
  ([vite.config.ts](../../../vite.config.ts)), available in client code.

## Approach

In-app form → backend posts to Discord via the bot. (Chosen over link-out: higher follow-through,
auto-captured context, consistent formatting.) Net new code is small.

## Components

### 1. Trigger — `FeedbackButton`

- File: `src/features/feedback/FeedbackButton.tsx`.
- Rendered in [App.tsx](../../../src/App.tsx) at the `flex justify-end` row that currently holds
  only `<UserMenu />` (line ~144). Change that wrapper to
  `flex justify-end items-center gap-3` and place `<FeedbackButton />` before `<UserMenu />`.
- Ghost styling consistent with existing affordances: mono, tiny, `text-text-dim hover:text-aether`.
  Icon + "Feedback" label.
- Manages open/closed state for the modal.

### 2. `FeedbackModal`

- File: `src/features/feedback/FeedbackModal.tsx`.
- Mirrors the existing modal idiom (reference `OnboardingWizard`).
- Fields:
  - **Category**: segmented toggle — 🐛 Bug · 💡 Idea · 💬 Feedback. Default Bug.
  - **Message**: required `<textarea>`, ~500-char client cap with a live counter.
  - Muted helper line: "We'll include the page you're on and your app version." (Auto-captured
    context is not user-editable.)
- Actions: **Send** (disabled while message is empty/whitespace) and **Cancel**.
- States: `idle → submitting → success → error`.
  - success: "Thanks! Posted to #qiqirn-feedback", auto-closes after ~1.5s.
  - error: inline message "Couldn't send — try again", Send re-enabled.

### 3. Client submit

- A small `submitFeedback()` helper (in `src/features/feedback/`) does:
  - `POST /api/feedback`, `credentials: 'same-origin'` (cookie auth, same as the logout call in
    [UserMenu.tsx](../../../src/features/auth/UserMenu.tsx)).
  - Body:
    ```ts
    {
      category: 'bug' | 'idea' | 'feedback',
      message: string,
      context: {
        path: string,        // location.pathname + location.search
        build: string,       // __APP_VERSION__
        userAgent: string,   // navigator.userAgent
        viewport: string,    // `${innerWidth}x${innerHeight}`
      }
    }
    ```
  - Returns `{ ok: true }` on 200; throws/returns error otherwise so the modal can show the error
    state.

### 4. Backend — fold into `projects.mjs`

- Add rewrite to [vercel.json](../../../vercel.json):
  `{ "source": "/api/feedback", "destination": "/api/projects" }`.
- In [projects.ts](../../../src/api/projects.ts) `handler`, after the existing
  `requireSession` gate (returns 401 when absent), add a branch handled **before** the
  GET-only projects routes:
  - Only `POST /api/feedback` is valid (other methods → 405).
  - Validation: `message` trimmed non-empty, server-side length cap ~1000 chars; `category`
    coerced to one of the three (default `bug`). Invalid → 400.
  - Light rate-limit: per-instance in-memory `Map<sub, timestamps[]>`, max ~5/min per user.
    Best-effort (Fluid instances are reused); over-limit → 429.
  - Calls `postFeedback(...)` (see below). Success → 200 `{ ok: true }`.
    Discord failure → 502 `{ error }`.
- Test seam: allow injecting a fake `postFeedback` via `globalThis.__testPostFeedback`, matching
  the existing `globalThis.__testCraftStore` pattern in `projects.ts`.

### 5. Discord post — `src/api/_feedback-core.ts`

- Exports `postFeedback(deps, input)` where `deps` carries `{ botToken, channelId }` (read from
  env in `projects.ts`: `DISCORD_BOT_TOKEN`, `FEEDBACK_CHANNEL_ID`) and `input` is the validated
  report + reporter identity (`sub`, `username`).
- Logic:
  - `getChannel(botToken, channelId)` to detect type. Forum (type 15) → `createForumPost`;
    text (type 0) → `sendToChannel`. (`#qiqirn-feedback` is expected to be a forum.)
  - **Title** (forum thread name): `[<emoji> <Category>] <first ~60 chars of message>`.
  - **Body**: a single embed —
    - `description`: the message.
    - reporter: `username` + `<@sub>` mention.
    - `page`, `build`, `viewport` from context; `timestamp`.
    - `color` per category (bug/idea/feedback).
  - Returns the created thread/message id (unused in v1; enables the deferred back-link).
- Reuses [discordApi.ts](../../../src/bot/discordApi.ts) helpers; no new Discord plumbing.

## Config / deploy

- **New env var `FEEDBACK_CHANNEL_ID`** = the `#qiqirn-feedback` channel/forum id. Set in Vercel
  (Production + Preview). This is the only manual deploy step. Document in the implementation plan.

## Testing

- `src/api/_feedback-core.test.ts` — pure-core tests with a mocked `discordApi`:
  - title truncation at ~60 chars;
  - category → emoji + color mapping;
  - forum (type 15) routes to `createForumPost`, text (type 0) routes to `sendToChannel`;
  - embed carries reporter mention, page, build.
- `src/api/projects.test.ts` — add cases via the `__testPostFeedback` seam:
  - `POST /api/feedback` with no session → 401;
  - empty/whitespace message → 400;
  - valid → `postFeedback` called once, 200 `{ ok: true }`;
  - non-POST method → 405.

## Error handling

- Discord post failure surfaces as 502 with a friendly client message; failures are
  `console.error`-logged like the other discord calls. No silent loss.
- Malformed/oversized input rejected with 400 before any Discord call.

## Out of scope (v1)

- Thread back-link / URL returned to the reporter (trivial follow-up; all users are guild members).
- Screenshot / attachment upload.
- Persisting feedback to Turso (Discord channel is the system of record).
- Upvotes / triage status / de-duplication.
