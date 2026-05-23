import * as fs from 'fs';
import * as path from 'path';

const XIVAPI_BASE = 'https://v2.xivapi.com/api';
const OUTPUT_PATH = path.join(process.cwd(), 'src/data/submarineSectors.json');
const SEARCH_DELAY_MS = 100;

// Sector IDs to skip (zone dividers)
const SKIP_ROW_IDS = new Set([0, 31, 52, 73, 94, 115, 136]);

interface SectorData {
  id: number;
  name: string;
  letter: string;
  zone: string;
  rankReq: number;
  durationMin: number;
  distance: number;
  loot: LootEntry[];
}

interface LootEntry {
  itemId: number;
  name: string;
  tier: 'common' | 'uncommon' | 'rare';
}

interface SubmarineExploration {
  row_id: number;
  fields: {
    Destination: string;
    RankReq: number;
    SurveyDurationmin: number;
    SurveyDistance: number;
    CeruleumTankReq: number;
    ExpReward: number;
    Map: {
      fields: {
        Name: string;
      };
    };
  };
}

// Loot data per sector (row_id -> { common, uncommon, rare })
const SECTOR_LOOT: Record<number, { common: string[]; uncommon: string[]; rare: string[] }> = {
  1: {
    common: ['Red Moko Grass', 'Scarlet Sap', 'Water Crystal', 'Wind Crystal'],
    uncommon: ['Bamboo Weave', 'Birch Branch', 'Empty Crystal'],
    rare: ['Unaspected Crystal'],
  },
  2: {
    common: ['Earth Crystal', 'Ferberite', 'Ice Crystal'],
    uncommon: ['Bamboo Weave', 'Empty Crystal', 'Gold Ore'],
    rare: ['Unaspected Crystal'],
  },
  3: {
    common: ['Red Moko Grass', 'Scarlet Sap', 'Water Crystal', 'Wind Crystal'],
    uncommon: ['Bamboo Weave', 'Birch Branch', 'Empty Crystal'],
    rare: ['Unaspected Crystal'],
  },
  4: {
    common: ['Earth Crystal', 'Ferberite', 'Ice Crystal', 'Vivianite'],
    uncommon: ['Bamboo Weave', 'Empty Crystal', 'Gold Ore'],
    rare: ['Crimson Coral', 'Unaspected Crystal'],
  },
  5: {
    common: ['Birch Branch', 'Red Moko Grass', 'Water Crystal', 'Wind Crystal'],
    uncommon: ['Bamboo Weave', 'Dark Chestnut Branch', 'Deep-red Crystal', 'Empty Crystal'],
    rare: ['Aurelia Polyp', 'Unaspected Crystal'],
  },
  6: {
    common: ['Earth Crystal', 'Gold Ore', 'Ice Crystal', 'Vivianite'],
    uncommon: ['Bamboo Weave', 'Deep-green Crystal', 'Empty Crystal', 'Platinum Ore'],
    rare: ['Crimson Coral', 'Unaspected Crystal'],
  },
  7: {
    common: ['Bamboo Weave', 'Birch Branch', 'Deep-blue Crystal', 'Red Moko Grass', 'Water Crystal', 'Wind Crystal'],
    uncommon: ['Balsa Wood Scrap', 'Dark Chestnut Branch', 'Empty Crystal'],
    rare: ['Aurelia Polyp', 'Unaspected Crystal'],
  },
  8: {
    common: ['Bamboo Weave', 'Deep-red Crystal', 'Lightning Crystal', 'Water Crystal'],
    uncommon: ['Balsa Wood Scrap', 'Birch Branch', 'Dark Chestnut Branch', 'Empty Crystal', 'Scarlet Sap'],
    rare: ['Red Clay', 'Unaspected Crystal'],
  },
  9: {
    common: ['Bamboo Weave', 'Deep-red Crystal', 'Fire Crystal', 'Ice Crystal'],
    uncommon: ['Balsa Wood Scrap', 'Empty Crystal', 'Ferberite', 'Gold Ore', 'Platinum Ore'],
    rare: ['Colossus Slab', 'Red Clay', 'Unaspected Crystal'],
  },
  10: {
    common: ['Diamond', 'Emerald', 'Ruby', 'Sapphire', 'Star Ruby', 'Star Sapphire'],
    uncommon: ['Rose Gold Ingot', 'Platinum Ingot', 'Salvaged Earring', 'Salvaged Bracelet', 'Salvaged Necklace', 'Salvaged Ring'],
    rare: ['Extravagant Salvaged Earring', 'Extravagant Salvaged Bracelet', 'Extravagant Salvaged Necklace', 'Extravagant Salvaged Ring'],
  },
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function fetchSectors(): Promise<Map<number, SectorData>> {
  console.log('Fetching sector metadata from XIVAPI...');
  const url = `${XIVAPI_BASE}/sheet/SubmarineExploration?limit=200&fields=Destination,RankReq,SurveyDurationmin,SurveyDistance,CeruleumTankReq,ExpReward,Map`;
  const data = await fetchJson(url) as { rows: SubmarineExploration[] };

  const sectors = new Map<number, SectorData>();

  for (const row of data.rows) {
    const { row_id, fields } = row;

    // Skip zone dividers
    if (SKIP_ROW_IDS.has(row_id) || !fields.Destination || row_id === 0) {
      continue;
    }

    // Parse destination: "the Ivory Shoals (A)" -> name, letter
    const match = fields.Destination.match(/^(.+?)\s+\(([A-Z])\)$/);
    if (!match) {
      console.warn(`Warning: Could not parse destination: ${fields.Destination}`);
      continue;
    }

    const [, nameRaw, letter] = match;
    const zone = fields.Map?.fields?.Name || 'Unknown Zone';

    sectors.set(row_id, {
      id: row_id,
      name: nameRaw,
      letter,
      zone,
      rankReq: fields.RankReq || 0,
      durationMin: fields.SurveyDurationmin || 0,
      distance: fields.SurveyDistance || 0,
      loot: [],
    });
  }

  console.log(`Fetched ${sectors.size} sectors`);
  return sectors;
}

async function resolveItemId(name: string, cache: Map<string, number>): Promise<number> {
  // Check cache first
  if (cache.has(name)) {
    return cache.get(name)!;
  }

  try {
    const encodedName = encodeURIComponent(name);
    const url = `${XIVAPI_BASE}/search?sheets=Item&query=Name~"${encodedName}"&fields=Name&limit=1`;
    const data = await fetchJson(url) as { results: Array<{ row_id: number; fields: { Name: string } }> };

    if (data.results && data.results.length > 0) {
      const itemId = data.results[0].row_id;
      cache.set(name, itemId);
      return itemId;
    }

    console.warn(`Warning: Could not resolve item ID for: ${name}`);
    cache.set(name, -1);
    return -1;
  } catch (error) {
    console.warn(`Warning: Error resolving item ID for ${name}:`, error instanceof Error ? error.message : String(error));
    cache.set(name, -1);
    return -1;
  }
}

async function main(): Promise<void> {
  console.log('Building submarine data...');

  // Step 1: Fetch sectors
  const sectors = await fetchSectors();

  // Collect all unique item names
  const uniqueItems = new Set<string>();
  for (const loot of Object.values(SECTOR_LOOT)) {
    loot.common.forEach(item => uniqueItems.add(item));
    loot.uncommon.forEach(item => uniqueItems.add(item));
    loot.rare.forEach(item => uniqueItems.add(item));
  }

  console.log(`Found ${uniqueItems.size} unique items to resolve`);

  // Step 2: Resolve all item names to IDs
  const itemIdCache = new Map<string, number>();
  const itemArray = Array.from(uniqueItems);

  console.log('Resolving item IDs from XIVAPI...');
  for (let i = 0; i < itemArray.length; i++) {
    const itemName = itemArray[i];
    await resolveItemId(itemName, itemIdCache);
    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${i + 1}/${itemArray.length}`);
    }
    // Rate limit: delay between requests
    if (i < itemArray.length - 1) {
      await sleep(SEARCH_DELAY_MS);
    }
  }

  console.log('Item ID resolution complete');

  // Step 3: Build full dataset
  const sectorsWithLoot: SectorData[] = [];

  for (const [sectorId, sectorData] of sectors) {
    if (!SECTOR_LOOT[sectorId]) {
      continue; // Skip sectors without loot data
    }

    const lootTiers = SECTOR_LOOT[sectorId];
    const loot: LootEntry[] = [];

    // Add common loot
    for (const itemName of lootTiers.common) {
      const itemId = itemIdCache.get(itemName) || -1;
      loot.push({ itemId, name: itemName, tier: 'common' });
    }

    // Add uncommon loot
    for (const itemName of lootTiers.uncommon) {
      const itemId = itemIdCache.get(itemName) || -1;
      loot.push({ itemId, name: itemName, tier: 'uncommon' });
    }

    // Add rare loot
    for (const itemName of lootTiers.rare) {
      const itemId = itemIdCache.get(itemName) || -1;
      loot.push({ itemId, name: itemName, tier: 'rare' });
    }

    sectorData.loot = loot;
    sectorsWithLoot.push(sectorData);
  }

  // Sort by ID for consistent output
  sectorsWithLoot.sort((a, b) => a.id - b.id);

  const output = {
    sectors: sectorsWithLoot,
    meta: {
      generatedAt: new Date().toISOString(),
      sectorCount: sectorsWithLoot.length,
      uniqueItems: uniqueItems.size,
    },
  };

  // Step 4: Write output JSON
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nData written to ${OUTPUT_PATH}`);
  console.log(`Sectors: ${output.meta.sectorCount}, Unique Items: ${output.meta.uniqueItems}`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
