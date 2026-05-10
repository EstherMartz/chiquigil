import type { StarterPack, StarterPackId, TrackedItem } from './types';

export type { StarterPackId };

const raidCurrent: TrackedItem[] = [
  { id: 49281, name: "Courtly Lover's Temple Chain of Striking", crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Head' },
  { id: 49282, name: "Courtly Lover's Cloak of Striking",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Body' },
  { id: 49283, name: "Courtly Lover's Armguards of Striking",    crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Hands' },
  { id: 49284, name: "Courtly Lover's Brais of Striking",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Legs' },
  { id: 49285, name: "Courtly Lover's Boots of Striking",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Feet' },
  { id: 49286, name: "Courtly Lover's Hairpin of Aiming",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Head' },
  { id: 49287, name: "Courtly Lover's Shirt of Aiming",          crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Body' },
  { id: 49288, name: "Courtly Lover's Halfgloves of Aiming",     crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Hands' },
  { id: 49289, name: "Courtly Lover's Trousers of Aiming",       crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Legs' },
  { id: 49290, name: "Courtly Lover's Shoes of Aiming",          crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Feet' },
  { id: 49291, name: "Courtly Lover's Hairpin of Scouting",      crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Head' },
  { id: 49292, name: "Courtly Lover's Shirt of Scouting",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Body' },
  { id: 49293, name: "Courtly Lover's Halfgloves of Scouting",   crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Hands' },
  { id: 49294, name: "Courtly Lover's Trousers of Scouting",     crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Legs' },
  { id: 49295, name: "Courtly Lover's Shoes of Scouting",        crafter: 'LTW', lvl: 100, cat: 'Raid', subcat: 'Feet' },
  { id: 49296, name: "Courtly Lover's Hood of Healing",          crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Head' },
  { id: 49297, name: "Courtly Lover's Longcoat of Healing",      crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Body' },
  { id: 49298, name: "Courtly Lover's Gloves of Healing",        crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Hands' },
  { id: 49299, name: "Courtly Lover's Pantaloons of Healing",    crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Legs' },
  { id: 49300, name: "Courtly Lover's Shoes of Healing",         crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Feet' },
  { id: 49301, name: "Courtly Lover's Hood of Casting",          crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Head' },
  { id: 49302, name: "Courtly Lover's Longcoat of Casting",      crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Body' },
  { id: 49303, name: "Courtly Lover's Gloves of Casting",        crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Hands' },
  { id: 49304, name: "Courtly Lover's Pantaloons of Casting",    crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Legs' },
  { id: 49305, name: "Courtly Lover's Shoes of Casting",         crafter: 'WVR', lvl: 100, cat: 'Raid', subcat: 'Feet' },
];

const tincturesG4: TrackedItem[] = [
  { id: 49234, name: 'Grade 4 Gemdraught of Strength',     crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49235, name: 'Grade 4 Gemdraught of Dexterity',    crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49236, name: 'Grade 4 Gemdraught of Vitality',     crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49237, name: 'Grade 4 Gemdraught of Intelligence', crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49238, name: 'Grade 4 Gemdraught of Mind',         crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49218, name: 'Grade 4 Gemsap of Strength',         crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49219, name: 'Grade 4 Gemsap of Dexterity',        crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49220, name: 'Grade 4 Gemsap of Vitality',         crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49221, name: 'Grade 4 Gemsap of Intelligence',     crafter: 'ALC', lvl: 100, cat: 'Tincture' },
  { id: 49222, name: 'Grade 4 Gemsap of Mind',             crafter: 'ALC', lvl: 100, cat: 'Tincture' },
];

const food7x: TrackedItem[] = [
  { id: 49232, name: 'Rock-fist Popoto',         crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49240, name: 'Caramel Popcorn',          crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49241, name: 'Prune Ponzecake',          crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49242, name: 'Prune-packed Fruitcake',   crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49244, name: 'Popoto Potage',            crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49245, name: 'Rock-fisted Popoto Stew',  crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49246, name: 'Rock-fisted Popoto Salad', crafter: 'CUL', lvl: 100, cat: 'Food' },
  { id: 49247, name: 'Clam Cake',                crafter: 'CUL', lvl: 100, cat: 'Food' },
];

const dyes: TrackedItem[] = [
  { id: 13114, name: 'General-purpose Pure White Dye',      crafter: 'WVR', lvl: 50, cat: 'Dye' },
  { id: 13115, name: 'General-purpose Jet Black Dye',       crafter: 'WVR', lvl: 50, cat: 'Dye' },
  { id: 13116, name: 'General-purpose Metallic Silver Dye', crafter: 'WVR', lvl: 50, cat: 'Dye' },
  { id: 13117, name: 'General-purpose Metallic Gold Dye',   crafter: 'WVR', lvl: 50, cat: 'Dye' },
];

const materiaXii: TrackedItem[] = [
  { id: 41771, name: "Heavens' Eye Materia XII", crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 41772, name: 'Savage Aim Materia XII',   crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 41773, name: 'Savage Might Materia XII', crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 41774, name: 'Battledance Materia XII',  crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 41781, name: 'Quickarm Materia XII',     crafter: 'ANY', lvl: 100, cat: 'Materia' },
  { id: 41782, name: 'Quicktongue Materia XII',  crafter: 'ANY', lvl: 100, cat: 'Materia' },
];

const glamourFaves: TrackedItem[] = [
  { id: 29435, name: 'Neo-Ishgardian Top of Striking', crafter: 'LTW', lvl: 80, cat: 'Glamour' },
  { id: 29429, name: 'Neo-Ishgardian Top of Maiming',  crafter: 'ARM', lvl: 80, cat: 'Glamour' },
  { id: 29441, name: 'Neo-Ishgardian Top of Aiming',   crafter: 'LTW', lvl: 80, cat: 'Glamour' },
  { id: 29447, name: 'Neo-Ishgardian Top of Scouting', crafter: 'LTW', lvl: 80, cat: 'Glamour' },
  { id: 29459, name: 'Neo-Ishgardian Top of Casting',  crafter: 'WVR', lvl: 80, cat: 'Glamour' },
  { id: 29453, name: 'Neo-Ishgardian Top of Healing',  crafter: 'WVR', lvl: 80, cat: 'Glamour' },
  { id: 39676, name: 'Diadochos Coat of Healing',      crafter: 'WVR', lvl: 90, cat: 'Glamour' },
  { id: 39681, name: 'Diadochos Coat of Casting',      crafter: 'WVR', lvl: 90, cat: 'Glamour' },
  { id: 40618, name: 'Ornate Diadochos Coat of Healing', crafter: 'WVR', lvl: 90, cat: 'Glamour' },
  { id: 40619, name: 'Ornate Diadochos Coat of Casting', crafter: 'WVR', lvl: 90, cat: 'Glamour' },
  { id: 39663, name: 'Diadochos Bottoms of Striking',  crafter: 'LTW', lvl: 90, cat: 'Glamour' },
  { id: 23373, name: "Quaintrelle's Hat",              crafter: 'WVR', lvl: 50, cat: 'Glamour' },
  { id: 23374, name: "Quaintrelle's Dress Shoes",      crafter: 'WVR', lvl: 50, cat: 'Glamour' },
  { id: 23001, name: "Quaintrelle's Ruffled Dress",    crafter: 'WVR', lvl: 50, cat: 'Glamour' },
  { id: 23002, name: "Quaintrelle's Ruffled Skirt",    crafter: 'WVR', lvl: 50, cat: 'Glamour' },
  { id: 29234, name: 'Crystarium Robe of Casting',     crafter: 'WVR', lvl: 80, cat: 'Glamour' },
];

const housingFaves: TrackedItem[] = [
  { id: 12087, name: 'Stuffed Carbuncle',     crafter: 'LTW', lvl: 50, cat: 'Housing' },
  { id: 8729,  name: 'Stuffed Tonberry',      crafter: 'LTW', lvl: 50, cat: 'Housing' },
  { id: 6653,  name: 'Stuffed Moogle',        crafter: 'WVR', lvl: 50, cat: 'Housing' },
  { id: 6654,  name: 'Stuffed Chocobo',       crafter: 'WVR', lvl: 50, cat: 'Housing' },
  { id: 6601,  name: 'Riviera Round Table',   crafter: 'CRP', lvl: 30, cat: 'Housing' },
  { id: 6603,  name: 'Glade Round Table',     crafter: 'CRP', lvl: 30, cat: 'Housing' },
  { id: 6602,  name: 'Oasis Round Table',     crafter: 'CRP', lvl: 30, cat: 'Housing' },
  { id: 12085, name: 'Alpine Round Table',    crafter: 'CRP', lvl: 60, cat: 'Housing' },
  { id: 39411, name: 'Faerie Round Table',    crafter: 'CRP', lvl: 90, cat: 'Housing' },
  { id: 6543,  name: 'Glade Bed',             crafter: 'CRP', lvl: 50, cat: 'Housing' },
  { id: 6544,  name: 'Oasis Bed',             crafter: 'CRP', lvl: 50, cat: 'Housing' },
  { id: 6583,  name: 'Riviera Floor Lamp',    crafter: 'GSM', lvl: 30, cat: 'Housing' },
  { id: 6584,  name: 'Glade Floor Lamp',      crafter: 'GSM', lvl: 30, cat: 'Housing' },
  { id: 6585,  name: 'Oasis Floor Lamp',      crafter: 'GSM', lvl: 30, cat: 'Housing' },
  { id: 6587,  name: 'Tonberry Floor Lamp',   crafter: 'GSM', lvl: 50, cat: 'Housing' },
  { id: 14048, name: 'Pudding Floor Lamp',    crafter: 'GSM', lvl: 50, cat: 'Housing' },
  { id: 38596, name: 'Sharlayan Chair',       crafter: 'CRP', lvl: 90, cat: 'Housing' },
  { id: 38597, name: 'Sharlayan Desk',        crafter: 'CRP', lvl: 90, cat: 'Housing' },
  { id: 21831, name: 'Sharlayan Cabinet',     crafter: 'CRP', lvl: 90, cat: 'Housing' },
  { id: 21832, name: 'Sharlayan Wardrobe',    crafter: 'CRP', lvl: 90, cat: 'Housing' },
  { id: 38598, name: 'Sharlayan Rug',         crafter: 'WVR', lvl: 90, cat: 'Housing' },
  { id: 20741, name: 'Hingan Andon Lamp',     crafter: 'GSM', lvl: 70, cat: 'Housing' },
  { id: 20211, name: 'Doman Bubble Eye',      crafter: 'CUL', lvl: 70, cat: 'Housing' },
  { id: 20776, name: 'Far Eastern Antique',   crafter: 'CRP', lvl: 70, cat: 'Housing' },
  { id: 14045, name: 'Orchestrion',           crafter: 'GSM', lvl: 50, cat: 'Housing' },
  { id: 28751, name: "Skybuilders' Counter",  crafter: 'CRP', lvl: 80, cat: 'Housing' },
  { id: 27282, name: 'Crystarium Bench',      crafter: 'CRP', lvl: 80, cat: 'Housing' },
];

export const STARTER_PACKS: StarterPack[] = [
  { id: 'raid-current',   label: 'Current raid set (7.x)',  defaultOn: true,  items: raidCurrent },
  { id: 'tinctures-g4',   label: 'Tinctures (Grade 4)',     defaultOn: true,  items: tincturesG4 },
  { id: 'food-7x',        label: 'Food (7.x)',              defaultOn: true,  items: food7x },
  { id: 'dyes',           label: 'General-purpose dyes',    defaultOn: true,  items: dyes },
  { id: 'materia-xii',    label: 'Materia XII',             defaultOn: true,  items: materiaXii },
  { id: 'glamour-faves',  label: 'Glamour favourites',      defaultOn: false, items: glamourFaves },
  { id: 'housing-faves',  label: 'Housing favourites',      defaultOn: false, items: housingFaves },
];

export type StarterPackToggles = Record<StarterPackId, boolean>;

export function defaultStarterToggles(): StarterPackToggles {
  return Object.fromEntries(STARTER_PACKS.map((p) => [p.id, p.defaultOn])) as StarterPackToggles;
}

export function allItemsFromEnabledPacks(
  toggles: StarterPackToggles,
  excluded: Set<number> = new Set(),
): TrackedItem[] {
  const seen = new Set<number>();
  const out: TrackedItem[] = [];
  for (const pack of STARTER_PACKS) {
    if (!toggles[pack.id]) continue;
    for (const item of pack.items) {
      if (seen.has(item.id) || excluded.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
