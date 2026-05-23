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
  // Deep-sea Site K-AD (row_ids 11-30)
  11: {
    common: ['Bamboo Weave', 'Birch Branch', 'Deep-blue Crystal', 'Raw Celestine', 'Water Cluster', 'Water Shard'],
    uncommon: ['Balsa Wood Scrap', 'Dark Chestnut Branch', 'Empty Crystal'],
    rare: ['Aurelia Polyp', 'Unaspected Crystal'],
  },
  12: {
    common: ['Balsa Wood Scrap', 'Deep-red Cluster', 'Earth Cluster', 'Earth Shard', 'Ferberite', 'Raw Celestine'],
    uncommon: ['Balsa Wood Lumber', 'Empty Crystal', 'Platinum Ore'],
    rare: ['Black Clay', "Faded Copy of Ambient Abyss"],
  },
  13: {
    common: ['Balsa Wood Scrap', 'Birch Branch', 'Deep-green Cluster', 'Ice Cluster', 'Ice Shard', 'Raw Celestine', 'Vivianite'],
    uncommon: ['Balsa Wood Lumber', 'Dark Chestnut Branch', 'Empty Crystal'],
    rare: ['Extravagant Salvaged Earring', 'Unaspected Crystal'],
  },
  14: {
    common: ['Balsa Wood Scrap', 'Deep-blue Crystal', 'Earth Cluster', 'Earth Shard', 'Ferberite', 'Raw Celestine'],
    uncommon: ['Balsa Wood Lumber', 'Gold Ore', 'Platinum Ore'],
    rare: ['Crimson Coral', 'Magnanimous Mogcrown'],
  },
  15: {
    common: ['Diamond', 'Emerald', 'Ruby', 'Sapphire', 'Star Ruby', 'Star Sapphire'],
    uncommon: ['Marine Wax Ester', 'Platinum Ingot', 'Salvaged Bracelet', 'Salvaged Earring', 'Salvaged Necklace', 'Salvaged Ring'],
    rare: ['Extravagant Salvaged Bracelet', 'Extravagant Salvaged Earring', 'Extravagant Salvaged Necklace', 'Extravagant Salvaged Ring'],
  },
  16: {
    common: ['Balsa Wood Lumber', 'Birch Log', 'Deep-green Cluster', 'Red Moko Grass'],
    uncommon: ['Cassia Log', 'Chemically Treated Chimera Hide', 'Dark Chestnut Log', 'Empty Crystal', 'Synthetic Fiber'],
    rare: ['Magnanimous Mogcrown', 'Synthetic Resin'],
  },
  17: {
    common: ['Balsa Wood Lumber', 'Deep-red Cluster', 'Raw Celestine', 'Vivianite'],
    uncommon: ['Aurum Regis Sand', 'Cloud Mica', 'Empty Crystal', 'Hardsilver Sand', 'Raw Larimar', 'Synthetic Fiber', 'Titanium Ore'],
    rare: ['Crystal Boule', 'Synthetic Resin'],
  },
  18: {
    common: ['Rose Gold Ingot', 'Platinum Ingot'],
    uncommon: ['Combed Wool Rug', "Dead Man's Chest", 'Marine Wax Ester', 'Plundered Treasure', 'Salvaged Bracelet', 'Salvaged Earring', 'Salvaged Necklace', 'Salvaged Ring'],
    rare: ['Crystal Boule', 'Extravagant Salvaged Bracelet', 'Extravagant Salvaged Earring', 'Extravagant Salvaged Necklace', 'Extravagant Salvaged Ring'],
  },
  19: {
    common: ['Balsa Wood Lumber', 'Deep-blue Cluster'],
    uncommon: ['Empty Cluster', 'Synthetic Fiber'],
    rare: ['Aurelia Polyp', 'Crimson Coral', "Faded Copy of Ambient Abyss", 'Synthetic Resin'],
  },
  20: {
    common: ['Dinosaur Fossil', 'Raw Celestine', 'Vivianite'],
    uncommon: [],
    rare: [],
  },
  21: {
    common: ['Birch Log', 'Cassia Log', 'Dark Chestnut Log', 'Deep-blue Cluster', 'Spruce Log'],
    uncommon: ['Aetherochemical Fiber', 'Bamboo Stick', 'Beech Log', 'Empty Crystal', 'Persimmon Log', 'Zelkova Log'],
    rare: ['Aurelia Polyp', 'Old-growth Camphorwood Log', 'Synthetic Resin'],
  },
  22: {
    common: ['Cobalt Ore', 'Deep-green Cluster', 'Mythrite Ore', 'Water Cluster'],
    uncommon: ['Darksteel Ore', 'Empty Cluster', 'Luminium Ore', 'Molybdenum Ore', 'Titanium Ore'],
    rare: ["Faded Copy of Ambient Abyss", 'Kamacite Ore'],
  },
  23: {
    common: ['Cassia Log', 'Clear Glass Lens', 'Deep-red Cluster', 'Fire Cluster', 'Ice Cluster'],
    uncommon: ['Aetherochemical Fiber', 'Balsa Wood Lumber', 'Crystal Glass', 'Tempered Glass'],
    rare: ['Abroader Otter', "Belah'dian Glass", 'Frosted Glass Lens', 'Polarized Glass'],
  },
  24: {
    common: ['Aurum Regis Sand', 'Hardsilver Sand', 'Lumythrite Sand', 'Mythrite Sand'],
    uncommon: ['Durium Sand', 'Palladium Sand'],
    rare: ['Astral Moraine', 'Dawnlight Aethersand', 'Dusklight Aethersand'],
  },
  25: {
    common: ['Adamantite Ore', 'Cloud Mica', 'Granite', 'Limestone', 'Marble', 'Siltstone'],
    uncommon: ['Aetherochemical Fiber', 'Kamacite Ore', 'Marine Wax Ester'],
    rare: ['Crimson Coral', "Faded Copy of Ambient Abyss", 'Synthetic Resin'],
  },
  26: {
    common: ['Rose Gold Ingot', 'Gold Ore', 'Wind Cluster'],
    uncommon: ["Dead Man's Chest", 'Plundered Treasure', 'Salvaged Bracelet', 'Salvaged Earring', 'Salvaged Necklace', 'Salvaged Ring'],
    rare: ['Extravagant Salvaged Bracelet', 'Extravagant Salvaged Earring', 'Extravagant Salvaged Necklace', 'Extravagant Salvaged Ring', 'Salvaged Coinage'],
  },
  27: {
    common: ['Clear Prism', 'Glamour Dispeller', 'Grade 6 Dark Matter'],
    uncommon: ['Dark Matter Cluster', 'Glamour Prism', 'Grade 7 Dark Matter', 'Wool Top'],
    rare: ['Aurelia Polyp'],
  },
  28: {
    common: ['Balsa Wood Lumber', 'Earth Cluster', 'Lightning Cluster'],
    uncommon: [],
    rare: [],
  },
  29: {
    common: ['Cut Stone', 'Rose Gold Ingot', 'Gold Ore', 'Native Gold', 'Platinum Ingot'],
    uncommon: ['Darksteel Ore', "Dead Man's Chest", 'Doman Iron Ore', 'Magnanimous Mogcrown', 'Plundered Treasure', 'Scintillant Ingot'],
    rare: ['Crystal Boule', 'Undersea Spoils'],
  },
  30: {
    common: ['Deep-blue Cluster', 'Deep-green Cluster', 'Deep-red Cluster', 'Earth Crystal', 'Fire Crystal', 'Ice Crystal', 'Lightning Crystal', 'Water Crystal', 'Wind Cluster'],
    uncommon: ['Rhodonite', 'Star Spinel', 'Triphane', 'Unaspected Crystal'],
    rare: ['Cerulean Crystal Boule', 'Emerald Crystal Boule'],
  },
  // Sea of Ash (row_ids 32-51)
  32: {
    common: ['Earth Crystal', 'Earth Shard', 'Hardsilver Sand', 'Stiperstone', 'Synthetic Fiber'],
    uncommon: ['Cloudsbreath', 'Hard Mudstone', 'Truegold Sand'],
    rare: ['Cocobolo Lumber', 'Pure Titanium Ore'],
  },
  33: {
    common: ['Fire Crystal', 'Fire Shard', 'Mahogany Log', 'White Oak Log'],
    uncommon: ['Cocobolo Lumber', 'Cryptomeria Log', 'Miracle Apple Log', 'Old-growth Camphorwood Log', 'Teak Log', 'Truegold Ore', 'White Ash Log'],
    rare: ['Black Clay', 'Red Clay'],
  },
  34: {
    common: ['Bamboo Weave', 'Truegold Sand', 'Water Crystal', 'Water Shard'],
    uncommon: ['Adamantite Ore', 'Platinum Ore', 'Pure Titanium Ore', 'Truegold Ore'],
    rare: ['Black Clay', 'Red Clay'],
  },
  35: {
    common: ['Cobalt Ore', 'Lightning Crystal', 'Lightning Shard', 'Mythrite Sand', 'Vivianite'],
    uncommon: ['Bluespirit Ore', 'Manasilver Sand', 'Marine Wax Ester', 'Smithsonite Ore'],
    rare: ['Crimson Coral', 'Sharksucker-class Insubmersible'],
  },
  36: {
    common: ['Cassia Log', 'Cedar Log', 'Dark Chestnut Log', 'Zelkova Log'],
    uncommon: ['Astral Moraine', 'Cocobolo Lumber', 'Miracle Apple Log', 'Sandteak Log', 'White Ash Log'],
    rare: ['Abroader Otter', 'Torreya Log'],
  },
  37: {
    common: ['Aetherochemical Fiber', 'Clear Glass Lens', 'Raw Celestine', 'Red Moko Grass'],
    uncommon: ['Crystal Glass', 'Emerald Crystal Boule', 'Kudzu Cloth', 'Tempered Glass', 'Unaspected Crystal'],
    rare: ['Abroader Otter', 'Polarized Glass', 'Synthetic Resin'],
  },
  38: {
    common: ['Electrum Ingot', 'Gold Ore', 'Platinum Ingot'],
    uncommon: ['Extravagant Salvaged Bracelet', 'Extravagant Salvaged Earring', 'Extravagant Salvaged Necklace', 'Extravagant Salvaged Ring', 'Rhodonite', 'Salvaged Bracelet', 'Salvaged Earring', 'Salvaged Necklace', 'Salvaged Ring'],
    rare: ['Salvaged Coinage', 'Undersea Spoils'],
  },
  39: {
    common: ['Ferberite', 'Hardsilver Nugget', 'Silver Ore', 'Vivianite'],
    uncommon: ['Bluespirit Ore', 'Cryptomeria Log', 'Kamacite Ore', 'Koppranickel Nugget', 'Manasilver Sand', 'Pure Titanium Ore', 'Titancopper Sand'],
    rare: ['Cerulean Crystal Boule', 'Sharksucker-class Insubmersible'],
  },
  40: {
    common: ['Hard Mudstone', 'Synthetic Fiber', 'Titanium Ore'],
    uncommon: ['Fire Cluster', 'Ice Cluster', 'Lightning Cluster', 'Star Ruby', 'Titancopper Ore', 'Volcanic Tuff', 'Water Cluster', 'Wind Cluster'],
    rare: ['Antique Vessels', 'Rhodonite', 'Ruby Crystal Boule'],
  },
  41: {
    common: ['Beech Log', 'Cassia Log', 'Wind Crystal'],
    uncommon: ['Astral Oil', 'Cryptomeria Log', 'Miracle Apple Log', 'Nagxian Silk', 'White Oak Log', 'Zelkova Log'],
    rare: ['Sharksucker-class Insubmersible'],
  },
  42: {
    common: ['Hard Mudstone', 'Truegold Ore', 'Water Crystal'],
    uncommon: ['Deep-blue Cluster', 'Deep-green Cluster', 'Pure Titanium Ore', 'Rhodonite', 'Titancopper Ore', 'Unaspected Crystal'],
    rare: ['Ruby Crystal Boule'],
  },
  43: {
    common: ['Truegold Sand', 'Ice Crystal', 'White Scorpion'],
    uncommon: ['Astral Moraine', 'Cocobolo Lumber', 'Dimythrite Sand', 'Grade 7 Dark Matter', 'Manasilver Sand', 'Titancopper Sand'],
    rare: ['Meerkat', 'Pure Titanium Ore'],
  },
  44: {
    common: ['Black Scorpion', 'Earth Crystal', 'White Oak Log'],
    uncommon: ['Cocobolo Lumber', 'Grade 7 Dark Matter', 'Lignum Vitae Log', 'Old-growth Camphorwood Log', 'Sandteak Log', 'White Ash Log'],
    rare: ['Cryptomeria Log', 'Meerkat', 'Piety Materia VII'],
  },
  45: {
    common: ['Rose Gold Ingot', 'Gold Ore', 'Lightning Crystal'],
    uncommon: ['Deepgold Ingot', 'Grade 2 Tincture of Dexterity', 'Grade 2 Tincture of Intelligence', 'Grade 2 Tincture of Strength', 'Salvaged Coinage', 'Undersea Spoils'],
    rare: ['Antique Vessels', 'Golden Ewer'],
  },
  46: {
    common: ['Earth Crystal', 'Torreya Log', 'White Oak Log'],
    uncommon: ['Cocobolo Lumber', 'Cryptomeria Log', 'Lignum Vitae Log', 'Sandteak Log', 'White Ash Log'],
    rare: ['Emerald Crystal Boule', 'Meerkat', 'Silver Dasher'],
  },
  47: {
    common: ['Pixie Floss Boll', 'Wind Crystal', 'Yellow Alumen'],
    uncommon: ['Crimson Coral', 'Dwarven Cotton Boll', 'Sea Swallow Skin', 'Vampire Cup Vine', 'Vampire Vine Sap'],
    rare: ['Antique Vessels', 'Golden Crystal Boule', 'Sharksucker-class Insubmersible'],
  },
  48: {
    common: ['Fire Crystal', 'Stiperstone', 'Titancopper Ore', 'Titanium Ore'],
    uncommon: ['Abroader Otter', 'Pelagic Clay', 'Ruby Crystal Boule'],
    rare: [],
  },
  49: {
    common: ['Dimythrite Sand', 'Mythrite Sand', 'Water Crystal'],
    uncommon: ['Dimythrite Ore', 'Mythrite Ore', 'Salvaged Coinage', 'Undersea Spoils'],
    rare: ['Aurelia Polyp', 'Sintered Whetstone'],
  },
  50: {
    common: ['Balsa Wood Scrap', 'Lightning Crystal', 'Synthetic Fiber'],
    uncommon: ['Cocobolo Lumber', 'Deep-blue Cluster', 'Synthetic Resin'],
    rare: ['Cerulean Crystal Boule', 'Colossus Slab', 'Golden Ewer'],
  },
  51: {
    common: ['Miracle Apple Log', 'White Oak Log'],
    uncommon: ['Bamboo Weave', 'Cloudsbreath', 'Cryptomeria Log'],
    rare: ['Abroader Otter'],
  },
  // Sea of Jade (row_ids 53-72)
  53: {
    common: ['Miracle Apple Log', 'White Oak Log'],
    uncommon: ['Bamboo Weave', 'Cloudsbreath', 'Cryptomeria Log'],
    rare: ['Abroader Otter'],
  },
  54: {
    common: ['Manasilver Sand', 'Truegold Sand'],
    uncommon: ['Deep-blue Cluster', 'Pelagic Clay', 'Sintered Whetstone'],
    rare: ['Colossus Slab'],
  },
  55: {
    common: ['Dimythrite Sand', 'Titancopper Sand'],
    uncommon: ['Antique Vessels', 'Balsa Wood Scrap', 'Black Clay'],
    rare: ['Aurelia Polyp'],
  },
  56: {
    common: ['Bluespirit Ore', 'Deep-green Cluster', 'Deep-red Cluster', 'Truegold Ore'],
    uncommon: ['Balsa Wood Lumber', 'Pure Titanium Ore', 'Synthetic Resin'],
    rare: ['Silver Dasher'],
  },
  57: {
    common: ['Sandteak Log', 'White Ash Log'],
    uncommon: ['Golden Ewer', 'Red Clay', 'Synthetic Fiber'],
    rare: ['Meerkat'],
  },
  58: {
    common: ['Deep-blue Cluster', 'Dimythrite Ore', 'Titancopper Ore'],
    uncommon: ['Aetherochemical Fiber', 'Pelagic Clay', 'Plundered Treasure'],
    rare: ['Plum Paper Parasol'],
  },
  59: {
    common: ['Manasilver Sand', 'Truegold Sand'],
    uncommon: ['Cocobolo Lumber', 'Marine Wax Ester', 'Pelagic Clay'],
    rare: ['Hard to Miss Orchestrion Roll'],
  },
  60: {
    common: ['Lignum Vitae Log', 'Sandteak Log'],
    uncommon: ['Empty Cluster', 'Pelagic Clay', 'Undersea Spoils'],
    rare: ["Gemseeker's Pack"],
  },
  61: {
    common: ['Dimythrite Ore', 'Dimythrite Sand', 'Manasilver Sand'],
    uncommon: ['Deep-blue Cluster', 'Synthetic Resin'],
    rare: ['Tankard'],
  },
  62: {
    common: ['Bluespirit Ore', 'Titancopper Ore', 'Titancopper Sand'],
    uncommon: ['Deep-red Cluster', 'Marine Wax Ester'],
    rare: ['Antique Sink'],
  },
  63: {
    common: ['Gold Ore', 'Truegold Ore', 'Truegold Sand'],
    uncommon: ['Cocobolo Lumber', 'Pure Titanium Ore'],
    rare: ['Nemesis Orchestrion Roll'],
  },
  64: {
    common: ['Sandteak Log', 'Torreya Log', 'White Ash Log'],
    uncommon: ['Cloudsbreath', 'Cryptomeria Log'],
    rare: ['Parkside Tree', 'Royal Lion'],
  },
  65: {
    common: ['Lignum Vitae Log', 'Miracle Apple Log', 'White Oak Log'],
    uncommon: ['Pelagic Clay', 'Sintered Whetstone'],
    rare: ['Syldrion-class Insubmersible'],
  },
  66: {
    common: ['Lignum Vitae Log', 'Miracle Apple Log', 'White Oak Log'],
    uncommon: ['Pelagic Clay', 'Pure Titanium Ore'],
    rare: ['Rusted Suit of Armor'],
  },
  67: {
    common: ['Bluespirit Ore', 'Titancopper Ore', 'Titancopper Sand'],
    uncommon: ['Golden Crystal Boule', 'Royal Lion'],
    rare: ['By Design Orchestrion Roll'],
  },
  68: {
    common: ['Lignum Vitae Log', 'Miracle Apple Log', 'White Oak Log'],
    uncommon: ['Meerkat', 'Plum Paper Parasol', 'Parkside Tree'],
    rare: [],
  },
  69: {
    common: ['Dimythrite Ore', 'Dimythrite Sand', 'Manasilver Sand'],
    uncommon: ['Cryptomeria Log', 'Pelagic Clay'],
    rare: ['Ancient Bone'],
  },
  70: {
    common: ['Sandteak Log', 'Torreya Log', 'White Ash Log'],
    uncommon: ['Antique Sink', 'Syldrion-class Insubmersible'],
    rare: ['Damaged Icebox'],
  },
  71: {
    common: ['Dimythrite Ore', 'Dimythrite Sand', 'Manasilver Sand'],
    uncommon: ['Hard to Miss Orchestrion Roll', 'Nemesis Orchestrion Roll'],
    rare: ['Portrait of Gestahl'],
  },
  72: {
    common: ['Gold Ore', 'Truegold Ore', 'Truegold Sand'],
    uncommon: ['Silver Dasher', 'Tankard'],
    rare: ['Benben Stone'],
  },
  // Sirensong Sea (row_ids 74-93)
  74: {
    common: ['Coconut', 'Palm Syrup', 'Sideritis Leaves'],
    uncommon: ['Pelagic Clay', 'Sintered Whetstone'],
    rare: ['By Design Orchestrion Roll'],
  },
  75: {
    common: ['Alien Onion', 'Giant Popoto', 'Sykon'],
    uncommon: ['Meerkat', 'Pelagic Clay'],
    rare: ['Damaged Icebox'],
  },
  76: {
    common: ['Annite', 'Chloroschist', 'Pewter Ore'],
    uncommon: ['Cocobolo Lumber', 'Silver Dasher'],
    rare: ['Driftseeds'],
  },
  77: {
    common: ['Horse Chestnut Log', 'Integral Log', 'Ironwood Log'],
    uncommon: ['Cocobolo Lumber', "Gemseeker's Pack"],
    rare: ['False Classic Spectacles'],
  },
  78: {
    common: ['Raw Ametrine', 'Raw Blue Zircon', 'Raw Star Quartz'],
    uncommon: ['Benben Stone', 'Parkside Tree'],
    rare: ['Deep-sea Marble'],
  },
  79: {
    common: ['AR-Caean Cotton Boll', 'Dark Rye', 'Scarlet Moko Grass'],
    uncommon: ['Cerulean Crystal Boule', 'Plum Paper Parasol'],
    rare: ['Blue Blossom Parasol'],
  },
  80: {
    common: ['Bismuth Ore', 'Manganese Ore', 'Phrygian Gold Ore'],
    uncommon: ['Basaltic Clay'],
    rare: [],
  },
  81: {
    common: ['Coconut', 'Palm Syrup', 'Sideritis Leaves'],
    uncommon: ['By Design Orchestrion Roll', 'Sharksucker-class Insubmersible'],
    rare: ['Weatherproof Cloth'],
  },
  82: {
    common: ['Bismuth Ore', 'Manganese Ore', 'Phrygian Gold Ore'],
    uncommon: ['Aurelia Polyp', 'Blue Blossom Parasol'],
    rare: ['Wall-climbing Ivy'],
  },
  83: {
    common: ['Raw Ametrine', 'Raw Blue Zircon', 'Raw Star Quartz'],
    uncommon: ['Deep-sea Marble', 'Golden Crystal Boule'],
    rare: ['Weathered Pipe'],
  },
  84: {
    common: ['Alien Onion', 'Giant Popoto', 'Sykon'],
    uncommon: ['Damaged Icebox', 'Syldrion-class Insubmersible'],
    rare: ['Flagstone Steps'],
  },
  85: {
    common: ['Horse Chestnut Log', 'Integral Log', 'Ironwood Log'],
    uncommon: ['Sideritis Leaves', 'Driftseeds'],
    rare: ['Flagstone Loft'],
  },
  86: {
    common: ['Annite', 'Chloroschist', 'Pewter Ore'],
    uncommon: ['False Classic Spectacles', 'Undersea Spoils'],
    rare: ['Damaged Highland Turret'],
  },
  87: {
    common: ['Horse Chestnut Log', 'Integral Log', 'Ironwood Log'],
    uncommon: ['Blue Blossom Parasol', 'False Classic Spectacles'],
    rare: ['Charcoal Iron', 'White Granite'],
  },
  88: {
    common: ['Coconut', 'Palm Syrup', 'Sideritis Leaves'],
    uncommon: ['Weathered Pipe', 'Weatherproof Cloth'],
    rare: ['Classical Water Jug'],
  },
  89: {
    common: ['Raw Ametrine', 'Raw Blue Zircon', 'Raw Star Quartz'],
    uncommon: ['Flagstone Steps', 'Wall-climbing Ivy'],
    rare: ['Timeworn Thaumaturgic Instruments'],
  },
  90: {
    common: ['Bismuth Ore', 'Manganese Ore', 'Phrygian Gold Ore'],
    uncommon: ['Damaged Highland Turret', 'Flagstone Loft'],
    rare: ['Ominous Plating'],
  },
  91: {
    common: ['AR-Caean Cotton Boll', 'Dark Rye', 'Scarlet Moko Grass'],
    uncommon: ['Damaged Icebox', 'Deep-sea Marble'],
    rare: ['Enigmatic Gear'],
  },
  92: {
    common: ['Annite', 'Chloroschist', 'Pewter Ore'],
    uncommon: ['By Design Orchestrion Roll', 'Portrait of Gestahl'],
    rare: ['Suzusaurus'],
  },
  93: {
    common: ['Alien Onion', 'Giant Popoto', 'Sykon'],
    uncommon: ['Ancient Bone', 'Basaltic Clay'],
    rare: ['Dreams Aloft Orchestrion Roll'],
  },
  // Lilac Sea (row_ids 95-114)
  95: {
    common: ['Annite', 'Chloroschist', 'Pewter Ore'],
    uncommon: ['Deep-sea Marble', 'Flagstone Steps'],
    rare: ['Classic Tableware'],
  },
  96: {
    common: ['Coconut', 'Palm Syrup', 'Sideritis Leaves'],
    uncommon: ['Blue Blossom Parasol', 'Driftseeds'],
    rare: ['Damaged Side Table'],
  },
  97: {
    common: ['Horse Chestnut Log', 'Integral Log', 'Ironwood Log'],
    uncommon: ['Classical Water Jug', 'Dreams Aloft Orchestrion Roll'],
    rare: ['Mossy Log'],
  },
  98: {
    common: ['Alien Onion', 'Giant Popoto', 'Sykon'],
    uncommon: ['Timeworn Thaumaturgic Instruments', 'Wall-climbing Ivy'],
    rare: ['Raw Log Half Partition'],
  },
  99: {
    common: ['AR-Caean Cotton Boll', 'Dark Rye', 'Scarlet Moko Grass'],
    uncommon: ['Weathered Pipe', 'Weatherproof Cloth'],
    rare: ['Iroko Lumber'],
  },
  100: {
    common: ['Bismuth Ore', 'Manganese Ore', 'Phrygian Gold Ore'],
    uncommon: ['Enigmatic Gear', 'Ominous Plating'],
    rare: ['Weathered Fitting'],
  },
  101: {
    common: ['Raw Ametrine', 'Raw Blue Zircon', 'Raw Star Quartz'],
    uncommon: ['Basaltic Clay', 'Suzusaurus'],
    rare: ['Goggle-eyed Dogu'],
  },
  102: {
    common: ['Raw Ametrine', 'Raw Blue Zircon', 'Raw Star Quartz'],
    uncommon: ['Basaltic Clay', 'False Classic Spectacles'],
    rare: ['Deep-sea Umbrite'],
  },
  103: {
    common: ['Bismuth Ore', 'Manganese Ore', 'Phrygian Gold Ore'],
    uncommon: ['Damaged Side Table', 'Flagstone Steps'],
    rare: ['Minute Mindflayer Sprinkler'],
  },
  104: {
    common: ['Coconut', 'Palm Syrup', 'Sideritis Leaves'],
    uncommon: ['Mossy Log', 'Raw Log Half Partition'],
    rare: ['Wood Slice Loft'],
  },
  105: {
    common: ['Bismuth Ore', 'Manganese Ore', 'Phrygian Gold Ore'],
    uncommon: ['Classic Tableware', 'Wall-climbing Ivy'],
    rare: ["Alzadaal's Treasure Rug"],
  },
  106: {
    common: ['Horse Chestnut Log', 'Integral Log', 'Ironwood Log'],
    uncommon: ['Flagstone Loft', 'Iroko Lumber'],
    rare: ['Pennons Aloft Orchestrion Roll'],
  },
  107: {
    common: ['AR-Caean Cotton Boll', 'Dark Rye', 'Scarlet Moko Grass'],
    uncommon: ['Goggle-eyed Dogu', 'White Granite'],
    rare: ['From Fear to Fortitude Orchestrion Roll'],
  },
  108: {
    common: ['Turali Corn', 'Turali Pineapple', "Ut'ohmu Tomato"],
    uncommon: ['Basaltic Clay', 'Minute Mindflayer Sprinkler'],
    rare: ['Bluecap Mushroom Lamp'],
  },
  109: {
    common: ['Lar Ore', 'Mountain Chromite Ore', 'Ruthenium Ore'],
    uncommon: ['Suzusaurus', 'Weathered Fitting'],
    rare: ['Stuffed Punutiy'],
  },
  110: {
    common: ['Ceiba Log', 'Dark Mahogany Log', 'Ginseng Log'],
    uncommon: ['Damaged Icebox', 'Flagstone Steps'],
    rare: ['Stuffed Axolotl Eft'],
  },
  111: {
    common: ['Mesquite Beans', 'White Pepper', 'Yyasulani Garlic'],
    uncommon: ['Damaged Side Table', 'Flagstone Loft'],
    rare: ['High-density Fiberboard'],
  },
  112: {
    common: ['Raw Black Star', 'Raw Ihuykanite', 'Raw Pink Beryl'],
    uncommon: ["Alzadaal's Treasure Rug", 'Pennons Aloft Orchestrion Roll'],
    rare: ['Subterranean Drop Orchestrion Roll'],
  },
  113: {
    common: ['Mountain Flax', 'Sarcenet', 'Snow Cotton'],
    uncommon: ['Mossy Log', 'Wood Slice Loft'],
    rare: ['Fluffy-wuffy Stuffed Drippy'],
  },
  114: {
    common: ['Cobalt Tungsten Ore', 'Magnesia Powder', 'Titanium Gold Ore'],
    uncommon: ['Deep-sea Umbrite', 'From Fear to Fortitude Orchestrion Roll'],
    rare: ["Tinkerer's Treasure Trove Orchestrion Roll"],
  },
  // South Indigo Deep (row_ids 116-135)
  116: {
    common: ['Mountain Rock Salt', 'Royal Maple Sap', 'Turali Corn'],
    uncommon: ['Fluffy-wuffy Stuffed Drippy', 'Mountain Salt', 'Royal Maple Syrup', 'Turali Corn Oil'],
    rare: ["Nature's Bounty Orchestrion Roll"],
  },
  117: {
    common: ['Cobalt Tungsten Ore', 'Mountain Chromite Ore', 'Ruthenium Ore'],
    uncommon: ['Blue Blossom Parasol', 'Bluecap Mushroom Lamp', 'Cobalt Tungsten Ingot', 'Mountain Chromite Ingot', 'Ruthenium Ingot'],
    rare: ['Aromatic Wood Strips'],
  },
  118: {
    common: ['Mountain Flax', 'Sarcenet', 'Snow Cotton'],
    uncommon: ['Mountain Linen', 'Sarcenet Cloth', 'Snow Cotton Cloth', 'Stuffed Punutiy', 'Wall-climbing Ivy'],
    rare: ['Toco Toquito'],
  },
  119: {
    common: ['Raw Black Star', 'Raw Ihuykanite', 'Raw Pink Beryl'],
    uncommon: ['Black Star', 'Damaged Icebox', 'Ihuykanite', 'Pink Beryl', 'Subterranean Drop Orchestrion Roll'],
    rare: ['Laboratory Counter'],
  },
  120: {
    common: ["Br'aax Hide", 'Hammerhead Crocodile Skin', 'Silver Lobo Hide'],
    uncommon: ["Br'aax Leather", 'Hammerhead Crocodile Leather', 'Silver Lobo Leather', 'Tankard', "Tinkerer's Treasure Trove Orchestrion Roll"],
    rare: ['Weathered Porthole'],
  },
  121: {
    common: ['Acacia Log', 'Claro Walnut Log', 'Dark Mahogany Log'],
    uncommon: ['Acacia Lumber', 'Claro Walnut Lumber', 'Dark Mahogany Lumber', 'Flagstone Loft', 'Stuffed Axolotl Eft'],
    rare: ['Spinettesaurus'],
  },
  122: {
    common: ["Ra'Kaznar Ore", 'Titanium Gold Ore', 'White Gold Ore'],
    uncommon: ['High-density Fiberboard', "Ra'Kaznar Ingot", 'Titanium Gold Nugget', 'White Gold Ingot'],
    rare: ['Climbing Wall Partition'],
  },
  123: {
    common: ["Br'aax Hide", 'Hammerhead Crocodile Skin', 'Silver Lobo Hide'],
    uncommon: ['Aromatic Wood Strips', "Br'aax Leather", 'Hammerhead Crocodile Leather', 'Silver Lobo Leather', 'Undersea Spoils'],
    rare: ['Hewn Stone Circle'],
  },
  124: {
    common: ['Mountain Rock Salt', 'Royal Maple Sap', 'Turali Corn'],
    uncommon: ['High-density Fiberboard', 'Mountain Salt', 'Royal Maple Syrup', 'Spinettesaurus', 'Turali Corn Oil'],
    rare: ['Fluorescent Tube Chandelier'],
  },
  125: {
    common: ['Raw Black Star', 'Raw Ihuykanite', 'Raw Pink Beryl'],
    uncommon: ['Black Star', 'Ihuykanite', 'Pink Beryl', 'Silver Dasher'],
    rare: ['Round Stepping Star'],
  },
  126: {
    common: ['Cobalt Tungsten Ore', 'Mountain Chromite Ore', 'Ruthenium Ore'],
    uncommon: ['Cobalt Tungsten Ingot', 'Flagstone Loft', 'Mountain Chromite Ingot', 'Ruthenium Ingot', 'Toco Toquito'],
    rare: ['Outsized Crystal Glass'],
  },
  127: {
    common: ['Mountain Flax', 'Sarcenet', 'Snow Cotton'],
    uncommon: ['Mountain Linen', 'Sarcenet Cloth', 'Snow Cotton Cloth', 'Subterranean Drop Orchestrion Roll', 'The Faces We Wear - Classic Spectacles'],
    rare: ['The Faces We Wear - Tinted Goggles'],
  },
  128: {
    common: ['Acacia Log', 'Claro Walnut Log', 'Dark Mahogany Log'],
    uncommon: ['Acacia Lumber', 'Claro Walnut Lumber', 'Damaged Icebox', 'Dark Mahogany Lumber', "Nature's Bounty Orchestrion Roll"],
    rare: ["In Dawn's Embrace Orchestrion Roll"],
  },
  129: {
    common: ['Mountain Flax', 'Sarcenet', 'Snow Cotton'],
    uncommon: ['Deep-sea Umbrite', 'Mountain Linen', 'Outsized Crystal Glass', 'Sarcenet Cloth', 'Snow Cotton Cloth'],
    rare: ['Pliable Plywood'],
  },
  130: {
    common: ['Mountain Rock Salt', 'Royal Maple Sap', 'Turali Corn'],
    uncommon: ["Alzadaal's Treasure Rug", 'Hewn Stone Circle', 'Mountain Salt', 'Royal Maple Syrup', 'Turali Corn Oil'],
    rare: ['Scroll Cabinet'],
  },
  131: {
    common: ['Cobalt Tungsten Ore', 'Mountain Chromite Ore', 'Ruthenium Ore'],
    uncommon: ['Cobalt Tungsten Ingot', 'Flagstone Loft', 'Mountain Chromite Ingot', 'Ruthenium Ingot', 'The Faces We Wear - Classic Spectacles'],
    rare: ['The Faces We Wear - Petite Pince-nez'],
  },
  132: {
    common: ["Br'aax Hide", 'Hammerhead Crocodile Skin', 'Silver Lobo Hide'],
    uncommon: ['Benben Stone', "Br'aax Leather", 'Hammerhead Crocodile Leather', 'Silver Lobo Leather', 'Spinettesaurus'],
    rare: ['The Faces We Wear - Mythril-edged Eyepatch (Right)'],
  },
  133: {
    common: ['Raw Black Star', 'Raw Ihuykanite', 'Raw Pink Beryl'],
    uncommon: ['Black Star', 'Flagstone Loft', 'Flagstone Steps', 'Ihuykanite', 'Pink Beryl'],
    rare: ['Overhead Studio Light'],
  },
  134: {
    common: ["Ra'Kaznar Ore", 'Titanium Gold Ore', 'White Gold Ore'],
    uncommon: ["Ra'Kaznar Ingot", 'Titanium Gold Nugget', 'Wall-climbing Ivy', 'White Gold Ingot', 'Wood Slice Loft'],
    rare: ['The Faces We Wear - Mythril-edged Eyepatch (Left)'],
  },
  135: {
    common: ['Acacia Log', 'Claro Walnut Log', 'Dark Mahogany Log'],
    uncommon: ['Acacia Lumber', 'Claro Walnut Lumber', 'Dark Mahogany Lumber', "In Dawn's Embrace Orchestrion Roll", "Tinkerer's Treasure Trove Orchestrion Roll"],
    rare: ['Coffee Break Orchestrion Roll'],
  },
  // Northern Empty (row_ids 137-149)
  137: {
    common: ['Snow Cotton', 'Sarcenet', 'Mountain Flax'],
    uncommon: ['Snow Cotton Cloth', 'Sarcenet Cloth', 'Mountain Linen', 'The Faces We Wear - Mythril-edged Eyepatch (Right)', 'The Faces We Wear - Mythril-edged Eyepatch (Left)'],
    rare: ['The Faces We Wear - Blindfold Eyepatch (Left)', 'The Faces We Wear - Blindfold Eyepatch (Right)'],
  },
  138: {
    common: ['Royal Maple Sap', 'Mountain Rock Salt', 'Turali Corn'],
    uncommon: ['Royal Maple Syrup', 'Mountain Salt', 'Turali Corn Oil', 'Flagstone Loft', 'Climbing Wall Partition'],
    rare: ['Peeling Wallpaper Sticker'],
  },
  139: {
    common: ['Mountain Chromite Ore', 'Ruthenium Ore', 'Cobalt Tungsten Ore'],
    uncommon: ['Mountain Chromite Ingot', 'Ruthenium Ingot', 'Cobalt Tungsten Ingot', 'Bluecap Mushroom Lamp', 'Overhead Studio Light'],
    rare: ['Forged Leaves Ceiling Light'],
  },
  140: {
    common: ['Silver Lobo Hide', 'Hammerhead Crocodile Skin', "Br'aax Hide"],
    uncommon: ['Silver Lobo Leather', 'Hammerhead Crocodile Leather', "Br'aax Leather", 'Pliable Plywood', 'The Faces We Wear - Petite Pince-nez'],
    rare: ['Imitation Battlefield'],
  },
  141: {
    common: ['Raw Ihuykanite', 'Raw Pink Beryl', 'Raw Black Star'],
    uncommon: ['Ihuykanite', 'Pink Beryl', 'Black Star', 'High-density Fiberboard', 'Damaged Side Table'],
    rare: ["Fortune-teller's Velvet"],
  },
  142: {
    common: ['White Gold Ore', 'Titanium Gold Ore', "Ra'Kaznar Ore"],
    uncommon: ['White Granite', 'Titanium Ore', "Ra'Kaznar Ingot", 'Tankard', 'Mossy Log'],
    rare: ['Hearts Tread and Trampled Orchestrion Roll'],
  },
  143: {
    common: ['Acacia Log', 'Dark Mahogany Log', 'Claro Walnut Log'],
    uncommon: ['Acacia Lumber', 'Dark Mahogany Lumber', 'Claro Walnut Lumber', 'Undersea Spoils', 'Coffee Break Orchestrion Roll'],
    rare: ['Fall into Forever Orchestrion Roll'],
  },
  144: {
    common: ['Snow Cotton', 'Sarcenet', 'Mountain Flax'],
    uncommon: ['Snow Cotton Cloth', 'Sarcenet Cloth', 'Mountain Linen', 'Flagstone Loft', 'Scroll Cabinet'],
    rare: ['Everkeep Wall Decoration'],
  },
  145: {
    common: ['Royal Maple Sap', 'Mountain Rock Salt', 'Turali Corn'],
    uncommon: ['Royal Maple Syrup', 'Mountain Salt', 'Turali Corn Oil', 'Tempered Glass', 'Outsized Crystal Glass'],
    rare: ['Weatherproof Plywood'],
  },
  146: {
    common: ['Mountain Chromite Ore', 'Ruthenium Ore', 'Cobalt Tungsten Ore'],
    uncommon: ['Mountain Chromite Ingot', 'Ruthenium Ingot', 'Cobalt Tungsten Ingot', 'Fall into Forever Orchestrion Roll', 'Hearts Tread and Trampled Orchestrion Roll'],
    rare: ['Fond Farewells Orchestrion Roll'],
  },
  147: {
    common: ['Silver Lobo Hide', 'Hammerhead Crocodile Skin', "Br'aax Hide"],
    uncommon: ['Silver Lobo Leather', 'Hammerhead Crocodile Leather', "Br'aax Leather", 'The Faces We Wear - Tinted Goggles', 'The Faces We Wear - Petite Pince-nez'],
    rare: ['Garden Mood Lighting'],
  },
  148: {
    common: ['Raw Ihuykanite', 'Raw Pink Beryl', 'Raw Black Star'],
    uncommon: ['Ihuykanite', 'Pink Beryl', 'Black Star', 'The Faces We Wear - Mythril-edged Eyepatch (Left)', 'The Faces We Wear - Mythril-edged Eyepatch (Right)'],
    rare: ['The Faces We Wear - Sash Blinder (Left)', 'The Faces We Wear - Sash Blinder (Right)'],
  },
  149: {
    common: ['White Gold Ore', 'Titanium Gold Ore', "Ra'Kaznar Ore"],
    uncommon: ['White Gold Ingot', 'Titanium Gold Nugget', "Ra'Kaznar Ingot", 'The Faces We Wear - Blindfold Eyepatch (Left)', 'The Faces We Wear - Blindfold Eyepatch (Right)'],
    rare: ['The Faces We Wear - Studded Eyepatch (Left)', 'The Faces We Wear - Studded Eyepatch (Right)'],
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
    // Also handles double letters like (AA), (AB), or no letter at all
    const match = fields.Destination.match(/^(.+?)\s*(?:\(([A-Z]+)\))?$/);
    if (!match) {
      console.warn(`Warning: Could not parse destination: ${fields.Destination}`);
      continue;
    }

    const [, nameRaw, letterOrUndefined] = match;
    const letter = letterOrUndefined || String.fromCharCode(64 + (row_id % 26 || 26)); // Fallback to derived letter
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
