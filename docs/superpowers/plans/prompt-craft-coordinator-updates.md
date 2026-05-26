# Follow-up prompt — updates since the original

Paste this into the **same Claude Code session** as a follow-up. It only covers what changed; the original prompt still stands.

---

I've updated the design doc at `docs/superpowers/plans/2026-05-25-discord-craft-coordinator.md` since you started — please re-read it, then fold in these two additions.

**A) Recipe yield — skip this if your in-progress build already handles it.**
The shared `Recipe` type now has an optional `amountResult?` field; the `AmountResult` fetch field + parser were already added to `src/lib/recipes.ts` and `src/lib/recipeSnapshot.ts` with tests — do NOT redo that. In `explode.ts`, use it:
`const perCraft = recipe.amountResult ?? 1; const craftCount = Math.ceil(qtyNeeded / perCraft);` and scale each sub-ingredient's demand by `craftCount`, NOT by output units (otherwise raw-mat demand is ~3× too high for the many intermediates that yield 3). `recipes.json` only carries real yields after a `npm run snapshots` re-bake; it reads as 1 until then, which is safe.

**B) Dedicated `#crafting` channel + extras (new).**

- **Config** (`bot/src/config.ts`): add `craftChannelId = optional('CRAFT_CHANNEL_ID')` and `crafterRoleId = optional('CRAFT_ROLE_ID')`, mirroring the existing `chatChannelId`. `/craft` stays runnable from any channel, but the announcement board always posts to the craft channel (fall back to the invoking channel if `CRAFT_CHANNEL_ID` is unset).
- **Store** (`store.ts`): add a `channel_state` table (`guild_id, channel_id, board_message_id, request_message_id`, PRIMARY KEY `(guild_id, channel_id)`) and a `thread_id TEXT` column on `projects`. Add CRUD for `channel_state`.
- **Pinned roll-up board**: maintain ONE bot-owned, pinned "Active crafting projects" message listing every open project with progress %, re-rendered and edited on every project create/claim/progress/close (create + pin if missing). Add `buildBoardMessage(openProjects)` to `render.ts`.
- **Thread per project**: after posting a project's announcement, `await message.startThread({ name: project.name, autoArchiveDuration: 1440 })`; store `projects.thread_id`; drop a one-line note in the thread on claim/progress.
- **`@Crafters` role ping**: if `crafterRoleId` (or a `/craft new ping_role` option) is set, put `<@&roleId>` in the announcement `content` with `allowedMentions: { roles: [roleId] }` so it never escalates to `@everyone`.
- **"Request a craft" button**: add a `/craft setup` admin subcommand (requires `ManageMessages`) that posts + pins a standing message carrying a button with customId `cproj:request`. Clicking it opens a modal (item, qty, optional name) whose submit id `cproj:requestmodal` runs the same `new` flow. Add `buildRequestPrompt()` to `render.ts`. Register the new `setup` subcommand in `registerCommands.ts`.
- **Routing** (`index.ts`): handle the `cproj:request` button and the `cproj:requestmodal` modal submit. On `ClientReady`, if `CRAFT_CHANNEL_ID` is set, ensure the pinned board (and request prompt, if `setup` ran earlier) still exist via `channel_state` and recreate if deleted. Note: slash commands appear in every channel — don't hard-gate, just route the board to the craft channel.

**Verify**: `/craft setup` posts + pins the board and request prompt; a new project creates a thread and refreshes the board; logging progress updates the board; restarting the bot preserves projects, assignments, and the board. Then `npm run typecheck` + `npm test` in `bot/` green.

**Reminder**: run `npm run snapshots` from the `ffxiv-helper` repo root once so real yields populate `recipes.json`.
