# ffxiv-uses-bot

Discord bot: attach an Allagan-Tools CSV, get a "used in N recipes" breakdown.

## Run locally

    cp .env.example .env
    # fill in DISCORD_TOKEN + GUILD_ALLOWLIST
    npm install
    npm run dev

## Deploy

See `../docs/superpowers/plans/2026-05-19-discord-uses-bot.md` for the Fly.io flow.

The Dockerfile bakes `public/data/snapshots/*.json` into the image, so
re-deploy whenever you regenerate snapshots via `npm run snapshots` at
the repo root.
