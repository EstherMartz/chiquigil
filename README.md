# ffxiv-helper

Personal crafting/market tool for FFXIV. Live data via Universalis, item metadata via XIVAPI.

Default world: Phantom · DC: Chaos.

## Dev

```
npm install
npm run dev
```

## Deploy

1. Push to GitHub.
2. Import the repo on Vercel (`https://vercel.com/new`).
3. Vercel auto-detects Vite, no config needed beyond `vercel.json` already in repo.
4. Optional env var: `VITE_XIVAPI_BASE` if you want to override the default `https://v2.xivapi.com`.

## Test

```
npm test
```

## Legacy

The original single-file artifact lives in `legacy/phantom_crafting_tracker.html` for reference.
