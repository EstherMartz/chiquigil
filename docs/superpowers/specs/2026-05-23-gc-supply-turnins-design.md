# GC Supply Turn-ins (Quest Items Fix)

Replace the broken XIVAPI quest data source with Teamcraft's `gc-supply.json`, which contains all Grand Company supply/provisioning turn-in items. These are the daily turn-ins that drive real MB demand.

## Data Source

**URL**: `https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/master/libs/data/src/lib/json/gc-supply.json`

**Structure**: `Record<level, Record<category, Array<{ itemId, count, reward: { xp, seals } }>>>`

- Levels: 1–33 (GC supply level brackets)
- Categories: 8–18 (ClassJob IDs: 8=CRP, 9=BSM, 10=ARM, 11=GSM, 12=LTW, 13=WVR, 14=ALC, 15=CUL, 16=MIN, 17=BTN, 18=FSH)
- Each item: the possible turn-in for that level+class, with quantity and seal/xp reward

## Changes

### questSnapshot.ts

Replace the XIVAPI Quest sheet fetcher with a Teamcraft `gc-supply.json` fetcher. The output type stays `SnapshotQuest[]` so the runtime pipeline (hook, runner, results component) is unchanged.

Mapping:
- `questId` = `level * 100 + category` (synthetic, unique per level+class)
- `questName` = `"GC Supply Lv.{level}"`
- `categoryName` = class name from category ID (CRP, BSM, etc.)
- `level` = the GC supply level
- `requiredItems` = all items in that level+category bucket, each as `{ itemId, itemName: '', qty: count }`

Item names are left empty during bake (Teamcraft doesn't include them); the runtime `runQuestItemFlip` already falls back to the item snapshot for names.

### bake-snapshots.ts

The `bakeQuests` function calls the new fetcher. No other bake changes needed.

### Page rename

- Route stays `/quest-items`
- Nav link: "GC Supply" (was "Quest items")
- Page title: "GC Supply Turn-ins"
- Subtitle: "Items players need for daily Grand Company supply missions. High-velocity items sell well because demand recurs daily."

### No other page changes

Other insight pages (crafts, gathering, vendor flip, etc.) already have their own working data sources. GC supply data doesn't add value there.

## Testing

- `questSnapshot.test.ts`: test the new parser with a mock gc-supply JSON snippet
- Existing `runQuestItemFlip.test.ts` tests remain valid (input type unchanged)
- Manual: bake → verify snapshot has non-crystal items → run page → see results
