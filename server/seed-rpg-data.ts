import { db } from "./db";
import { 
  combat_spells, 
  items, 
  companions, 
  quests,
  map_connections,
  encounter_tables,
  creature_stats,
  type MagicalDiscipline,
  type StatusEffect,
  type ItemCategory,
  type CompanionType,
  type ConnectionType,
  type EncounterType,
} from "@shared/schema";

// ===== COMBAT SPELLS =====
// All Harry Potter spells with Pokemon-like battle mechanics

const COMBAT_SPELL_DATA: Array<{
  spellName: string;
  displayName: string;
  description: string;
  discipline: MagicalDiscipline;
  baseDamage: number;
  accuracy: number;
  ppCost: number;
  maxPP: number;
  targetType: string;
  statusEffect?: StatusEffect;
  statusChance?: number;
  healAmount?: number;
  priority?: number;
  levelRequired: number;
  isUnforgivable?: boolean;
  animationType: string;
}> = [
  // YEAR 1 SPELLS (Levels 1-3)
  { spellName: "lumos", displayName: "Lumos", description: "Creates light at wand tip. Reveals hidden things in battle.", discipline: "charms", baseDamage: 0, accuracy: 100, ppCost: 2, maxPP: 30, targetType: "self", priority: 1, levelRequired: 1, animationType: "buff" },
  { spellName: "nox", displayName: "Nox", description: "Extinguishes light. Reduces enemy accuracy.", discipline: "charms", baseDamage: 0, accuracy: 95, ppCost: 2, maxPP: 30, targetType: "single", statusEffect: "confused", statusChance: 30, levelRequired: 1, animationType: "debuff" },
  { spellName: "wingardium_leviosa", displayName: "Wingardium Leviosa", description: "Levitates objects. Can drop things on enemies.", discipline: "charms", baseDamage: 25, accuracy: 90, ppCost: 5, maxPP: 25, targetType: "single", levelRequired: 1, animationType: "projectile" },
  { spellName: "alohomora", displayName: "Alohomora", description: "Unlocks doors. In battle, lowers enemy defenses.", discipline: "charms", baseDamage: 0, accuracy: 95, ppCost: 3, maxPP: 20, targetType: "single", levelRequired: 1, animationType: "buff" },
  { spellName: "reparo", displayName: "Reparo", description: "Repairs objects. Heals a small amount of HP.", discipline: "transfiguration", baseDamage: 0, accuracy: 100, ppCost: 5, maxPP: 15, targetType: "self", healAmount: 25, levelRequired: 1, animationType: "heal" },
  
  // YEAR 2 SPELLS (Levels 4-6)
  { spellName: "incendio", displayName: "Incendio", description: "Creates fire. May cause burning.", discipline: "charms", baseDamage: 40, accuracy: 90, ppCost: 6, maxPP: 20, targetType: "single", statusEffect: "burning", statusChance: 25, levelRequired: 4, animationType: "beam" },
  { spellName: "flipendo", displayName: "Flipendo", description: "Knockback jinx. High damage, may stun.", discipline: "defense", baseDamage: 35, accuracy: 95, ppCost: 5, maxPP: 25, targetType: "single", statusEffect: "stunned", statusChance: 15, levelRequired: 4, animationType: "projectile" },
  { spellName: "expelliarmus", displayName: "Expelliarmus", description: "Disarming charm. Reduces enemy attack.", discipline: "defense", baseDamage: 30, accuracy: 95, ppCost: 5, maxPP: 25, targetType: "single", levelRequired: 5, animationType: "projectile" },
  { spellName: "rictusempra", displayName: "Rictusempra", description: "Tickling charm. May confuse the target.", discipline: "charms", baseDamage: 25, accuracy: 100, ppCost: 4, maxPP: 25, targetType: "single", statusEffect: "confused", statusChance: 40, levelRequired: 5, animationType: "projectile" },
  { spellName: "finite_incantatem", displayName: "Finite Incantatem", description: "Ends spell effects. Cures all status conditions.", discipline: "defense", baseDamage: 0, accuracy: 100, ppCost: 6, maxPP: 10, targetType: "ally", levelRequired: 6, animationType: "buff" },
  
  // YEAR 3 SPELLS (Levels 7-10)
  { spellName: "riddikulus", displayName: "Riddikulus", description: "Defeats Boggarts. Strong against fear-based creatures.", discipline: "defense", baseDamage: 50, accuracy: 85, ppCost: 7, maxPP: 15, targetType: "single", levelRequired: 7, animationType: "projectile" },
  { spellName: "lumos_maxima", displayName: "Lumos Maxima", description: "Blinding light. Damages and may stun dark creatures.", discipline: "charms", baseDamage: 45, accuracy: 90, ppCost: 7, maxPP: 15, targetType: "single", statusEffect: "stunned", statusChance: 20, levelRequired: 7, animationType: "beam" },
  { spellName: "depulso", displayName: "Depulso", description: "Banishing charm. High knockback damage.", discipline: "charms", baseDamage: 55, accuracy: 85, ppCost: 8, maxPP: 15, targetType: "single", levelRequired: 8, animationType: "projectile" },
  { spellName: "glacius", displayName: "Glacius", description: "Freezing charm. May freeze the target.", discipline: "charms", baseDamage: 45, accuracy: 90, ppCost: 7, maxPP: 15, targetType: "single", statusEffect: "frozen", statusChance: 30, levelRequired: 9, animationType: "beam" },
  { spellName: "protego", displayName: "Protego", description: "Shield charm. Greatly increases defense for one turn.", discipline: "defense", baseDamage: 0, accuracy: 100, ppCost: 6, maxPP: 15, targetType: "self", statusEffect: "shielded", statusChance: 100, priority: 3, levelRequired: 10, animationType: "buff" },
  
  // YEAR 4 SPELLS (Levels 11-14)
  { spellName: "stupefy", displayName: "Stupefy", description: "Stunning spell. High stun chance.", discipline: "defense", baseDamage: 50, accuracy: 90, ppCost: 8, maxPP: 15, targetType: "single", statusEffect: "stunned", statusChance: 50, levelRequired: 11, animationType: "beam" },
  { spellName: "impedimenta", displayName: "Impedimenta", description: "Impediment jinx. Slows enemy speed.", discipline: "defense", baseDamage: 40, accuracy: 95, ppCost: 6, maxPP: 20, targetType: "single", levelRequired: 11, animationType: "projectile" },
  { spellName: "accio", displayName: "Accio", description: "Summoning charm. Steals enemy item.", discipline: "charms", baseDamage: 20, accuracy: 85, ppCost: 5, maxPP: 15, targetType: "single", levelRequired: 12, animationType: "projectile" },
  { spellName: "diffindo", displayName: "Diffindo", description: "Severing charm. High critical hit chance.", discipline: "transfiguration", baseDamage: 55, accuracy: 90, ppCost: 7, maxPP: 15, targetType: "single", levelRequired: 13, animationType: "beam" },
  { spellName: "reducto", displayName: "Reducto", description: "Reductor curse. Destroys objects and damages heavily.", discipline: "defense", baseDamage: 70, accuracy: 80, ppCost: 10, maxPP: 10, targetType: "single", levelRequired: 14, animationType: "beam" },
  
  // YEAR 5 SPELLS (Levels 15-18)
  { spellName: "confringo", displayName: "Confringo", description: "Blasting curse. Hits all enemies.", discipline: "dark_arts", baseDamage: 55, accuracy: 85, ppCost: 12, maxPP: 8, targetType: "all_enemies", statusEffect: "burning", statusChance: 20, levelRequired: 15, animationType: "aoe" },
  { spellName: "bombarda", displayName: "Bombarda", description: "Exploding spell. Very high damage, low accuracy.", discipline: "dark_arts", baseDamage: 80, accuracy: 75, ppCost: 12, maxPP: 8, targetType: "single", levelRequired: 15, animationType: "aoe" },
  { spellName: "expecto_patronum", displayName: "Expecto Patronum", description: "Patronus charm. Devastates Dementors and heals allies.", discipline: "defense", baseDamage: 90, accuracy: 80, ppCost: 15, maxPP: 5, targetType: "single", healAmount: 30, levelRequired: 17, animationType: "beam" },
  { spellName: "petrificus_totalus", displayName: "Petrificus Totalus", description: "Full body-bind. Guaranteed stun on hit.", discipline: "defense", baseDamage: 35, accuracy: 85, ppCost: 10, maxPP: 10, targetType: "single", statusEffect: "stunned", statusChance: 100, levelRequired: 18, animationType: "beam" },
  
  // YEAR 6-7 SPELLS (Levels 19-25)
  { spellName: "sectumsempra", displayName: "Sectumsempra", description: "Dark slashing curse. Causes severe bleeding.", discipline: "dark_arts", baseDamage: 95, accuracy: 85, ppCost: 15, maxPP: 5, targetType: "single", statusEffect: "poisoned", statusChance: 60, levelRequired: 20, animationType: "beam" },
  { spellName: "fiendfyre", displayName: "Fiendfyre", description: "Cursed fire. Devastating but hard to control.", discipline: "dark_arts", baseDamage: 100, accuracy: 70, ppCost: 20, maxPP: 3, targetType: "all_enemies", statusEffect: "burning", statusChance: 80, levelRequired: 22, animationType: "aoe" },
  { spellName: "obliviate", displayName: "Obliviate", description: "Memory charm. May confuse or silence target.", discipline: "charms", baseDamage: 40, accuracy: 85, ppCost: 10, maxPP: 8, targetType: "single", statusEffect: "silenced", statusChance: 50, levelRequired: 23, animationType: "beam" },
  
  // UNFORGIVABLE CURSES (Level 25+, very powerful)
  { spellName: "crucio", displayName: "Cruciatus Curse", description: "Torture curse. Extreme damage, may stun.", discipline: "dark_arts", baseDamage: 120, accuracy: 90, ppCost: 25, maxPP: 3, targetType: "single", statusEffect: "stunned", statusChance: 40, levelRequired: 25, isUnforgivable: true, animationType: "beam" },
  { spellName: "imperio", displayName: "Imperius Curse", description: "Control curse. Confuses and weakens target greatly.", discipline: "dark_arts", baseDamage: 60, accuracy: 85, ppCost: 20, maxPP: 3, targetType: "single", statusEffect: "confused", statusChance: 80, levelRequired: 25, isUnforgivable: true, animationType: "beam" },
  { spellName: "avada_kedavra", displayName: "Avada Kedavra", description: "The Killing Curse. Instant defeat if it hits.", discipline: "dark_arts", baseDamage: 999, accuracy: 60, ppCost: 30, maxPP: 1, targetType: "single", levelRequired: 30, isUnforgivable: true, animationType: "beam" },
  
  // HEALING & SUPPORT SPELLS
  { spellName: "episkey", displayName: "Episkey", description: "Healing spell for minor injuries.", discipline: "potions", baseDamage: 0, accuracy: 100, ppCost: 5, maxPP: 15, targetType: "ally", healAmount: 40, levelRequired: 8, animationType: "heal" },
  { spellName: "vulnera_sanentur", displayName: "Vulnera Sanentur", description: "Powerful healing incantation.", discipline: "potions", baseDamage: 0, accuracy: 100, ppCost: 12, maxPP: 5, targetType: "ally", healAmount: 80, levelRequired: 18, animationType: "heal" },
  { spellName: "prior_incantato", displayName: "Prior Incantato", description: "Reveals last spell. Boosts accuracy.", discipline: "divination", baseDamage: 0, accuracy: 100, ppCost: 3, maxPP: 20, targetType: "self", statusEffect: "blessed", statusChance: 100, levelRequired: 12, animationType: "buff" },
];

// ===== ITEMS =====
const ITEM_DATA: Array<{
  itemId: string;
  displayName: string;
  description: string;
  category: ItemCategory;
  rarity: string;
  buyPrice: number;
  sellPrice: number;
  usableInBattle: boolean;
  usableOutOfBattle: boolean;
  effect?: object;
}> = [
  // Potions
  { itemId: "health_potion", displayName: "Health Potion", description: "Restores 50 HP.", category: "potion", rarity: "common", buyPrice: 50, sellPrice: 25, usableInBattle: true, usableOutOfBattle: true, effect: { healHp: 50 } },
  { itemId: "super_health_potion", displayName: "Super Health Potion", description: "Restores 120 HP.", category: "potion", rarity: "uncommon", buyPrice: 150, sellPrice: 75, usableInBattle: true, usableOutOfBattle: true, effect: { healHp: 120 } },
  { itemId: "max_health_potion", displayName: "Max Health Potion", description: "Fully restores HP.", category: "potion", rarity: "rare", buyPrice: 400, sellPrice: 200, usableInBattle: true, usableOutOfBattle: true, effect: { healHp: 999 } },
  { itemId: "pp_potion", displayName: "Mana Elixir", description: "Restores 20 PP to all spells.", category: "potion", rarity: "uncommon", buyPrice: 100, sellPrice: 50, usableInBattle: true, usableOutOfBattle: true, effect: { healPp: 20 } },
  { itemId: "antidote", displayName: "Antidote", description: "Cures poison.", category: "potion", rarity: "common", buyPrice: 30, sellPrice: 15, usableInBattle: true, usableOutOfBattle: true, effect: { cureStatus: ["poisoned"] } },
  { itemId: "burn_heal", displayName: "Burn Salve", description: "Cures burns.", category: "potion", rarity: "common", buyPrice: 30, sellPrice: 15, usableInBattle: true, usableOutOfBattle: true, effect: { cureStatus: ["burning"] } },
  { itemId: "awakening", displayName: "Awakening Draught", description: "Wakes from stun or confusion.", category: "potion", rarity: "common", buyPrice: 40, sellPrice: 20, usableInBattle: true, usableOutOfBattle: true, effect: { cureStatus: ["stunned", "confused"] } },
  { itemId: "full_restore", displayName: "Full Restore", description: "Fully restores HP and cures all status.", category: "potion", rarity: "legendary", buyPrice: 800, sellPrice: 400, usableInBattle: true, usableOutOfBattle: true, effect: { healHp: 999, cureStatus: ["poisoned", "burning", "frozen", "confused", "stunned", "silenced"] } },
  
  // Battle boost items
  { itemId: "attack_boost", displayName: "Felix Felicis", description: "Boosts attack for the battle.", category: "potion", rarity: "rare", buyPrice: 300, sellPrice: 150, usableInBattle: true, usableOutOfBattle: false, effect: { boostStat: { stat: "attack", amount: 20 } } },
  { itemId: "defense_boost", displayName: "Baruffio's Brew", description: "Boosts defense for the battle.", category: "potion", rarity: "rare", buyPrice: 300, sellPrice: 150, usableInBattle: true, usableOutOfBattle: false, effect: { boostStat: { stat: "defense", amount: 20 } } },
  
  // Key items
  { itemId: "marauders_map", displayName: "Marauder's Map", description: "Shows all characters on the current map.", category: "key_item", rarity: "legendary", buyPrice: 0, sellPrice: 0, usableInBattle: false, usableOutOfBattle: true },
  { itemId: "invisibility_cloak", displayName: "Invisibility Cloak", description: "Avoid random encounters temporarily.", category: "key_item", rarity: "legendary", buyPrice: 0, sellPrice: 0, usableInBattle: false, usableOutOfBattle: true },
  { itemId: "elder_wand", displayName: "Elder Wand", description: "Greatly boosts spell power.", category: "artifact", rarity: "legendary", buyPrice: 0, sellPrice: 0, usableInBattle: false, usableOutOfBattle: false },
  { itemId: "resurrection_stone", displayName: "Resurrection Stone", description: "Revive from defeat once per battle.", category: "artifact", rarity: "legendary", buyPrice: 0, sellPrice: 0, usableInBattle: true, usableOutOfBattle: false },
  
  // Ingredients
  { itemId: "phoenix_feather", displayName: "Phoenix Feather", description: "Rare ingredient for powerful potions.", category: "ingredient", rarity: "rare", buyPrice: 200, sellPrice: 100, usableInBattle: false, usableOutOfBattle: false },
  { itemId: "unicorn_hair", displayName: "Unicorn Hair", description: "Pure magical ingredient.", category: "ingredient", rarity: "rare", buyPrice: 180, sellPrice: 90, usableInBattle: false, usableOutOfBattle: false },
  { itemId: "dragon_heartstring", displayName: "Dragon Heartstring", description: "Powerful wand core material.", category: "ingredient", rarity: "rare", buyPrice: 250, sellPrice: 125, usableInBattle: false, usableOutOfBattle: false },
  
  // Spell books
  { itemId: "book_stupefy", displayName: "Standard Book of Spells, Grade 4", description: "Teaches Stupefy spell.", category: "book", rarity: "uncommon", buyPrice: 500, sellPrice: 250, usableInBattle: false, usableOutOfBattle: true, effect: { teachSpell: "stupefy" } },
  { itemId: "book_patronus", displayName: "Advanced Defense", description: "Teaches Expecto Patronum.", category: "book", rarity: "rare", buyPrice: 1000, sellPrice: 500, usableInBattle: false, usableOutOfBattle: true, effect: { teachSpell: "expecto_patronum" } },
];

// ===== COMPANIONS =====
const COMPANION_DATA: Array<{
  companionId: string;
  displayName: string;
  description: string;
  type: CompanionType;
  abilities: string[];
  spriteId: string;
  unlockCondition?: string;
}> = [
  { companionId: "hedwig", displayName: "Hedwig", description: "A loyal snowy owl. Swift and perceptive.", type: "familiar", abilities: ["scout", "deliver"], spriteId: "Hedwig" },
  { companionId: "crookshanks", displayName: "Crookshanks", description: "A clever half-Kneazle cat. Detects lies and danger.", type: "familiar", abilities: ["detect_evil", "distract"], spriteId: "Crookshanks" },
  { companionId: "fawkes", displayName: "Fawkes", description: "Dumbledore's phoenix. Heals with tears, fights with fire.", type: "creature", abilities: ["heal", "flame_burst"], spriteId: "Fawkes", unlockCondition: "Earn 5 Trial Sigils" },
  { companionId: "buckbeak", displayName: "Buckbeak", description: "A proud Hippogriff. Powerful in aerial combat.", type: "creature", abilities: ["fly", "talon_strike"], spriteId: "Buckbeak", unlockCondition: "Complete Care of Magical Creatures quest" },
  { companionId: "dobby", displayName: "Dobby", description: "A free house-elf. Devoted and resourceful.", type: "house_elf", abilities: ["apparate", "protect"], spriteId: "Dobby", unlockCondition: "Free Dobby from Malfoy Manor" },
  { companionId: "norberta", displayName: "Norberta", description: "A Norwegian Ridgeback dragon. Breathes devastating fire.", type: "creature", abilities: ["fire_breath", "intimidate"], spriteId: "Norbert (Dragon)", unlockCondition: "Help Hagrid with dragon egg" },
];

// ===== STARTER QUESTS =====
const QUEST_DATA = [
  {
    questId: "trial_1_secrecy",
    title: "The First Trial: Secrecy",
    description: "Prove you can keep the society's secrets. You must not speak of what you've seen to anyone.",
    category: "main",
    requiredLevel: 1,
    objectives: [
      { id: "avoid_teachers", description: "Avoid speaking to teachers for one day", type: "explore" as const, target: "avoid_conversation", required: 3 },
    ],
    rewards: { experience: 100, sigils: 1, items: [{ itemId: "health_potion", quantity: 3 }] },
    grantsTrial: true,
  },
  {
    questId: "learn_basics",
    title: "Magical Foundations",
    description: "Learn the basic spells every young witch or wizard needs.",
    category: "side",
    requiredLevel: 1,
    objectives: [
      { id: "cast_lumos", description: "Cast Lumos 5 times", type: "use_spell" as const, target: "lumos", required: 5 },
      { id: "cast_wingardium", description: "Cast Wingardium Leviosa 3 times", type: "use_spell" as const, target: "wingardium_leviosa", required: 3 },
    ],
    rewards: { experience: 50, galleons: 25 },
    grantsTrial: false,
  },
  {
    questId: "explore_hogwarts",
    title: "Know Your School",
    description: "Explore the main areas of Hogwarts castle.",
    category: "side",
    requiredLevel: 1,
    objectives: [
      { id: "visit_great_hall", description: "Visit the Great Hall", type: "explore" as const, target: "Great Hall", required: 1 },
      { id: "visit_library", description: "Visit the Library", type: "explore" as const, target: "Library", required: 1 },
      { id: "visit_grounds", description: "Visit Hogwarts Grounds", type: "explore" as const, target: "Hogwarts Grounds", required: 1 },
    ],
    rewards: { experience: 75, items: [{ itemId: "marauders_map", quantity: 1 }] },
    grantsTrial: false,
  },
  {
    questId: "defeat_creatures",
    title: "Pest Control",
    description: "Help Hagrid deal with some troublesome creatures near his hut.",
    category: "side",
    requiredLevel: 3,
    startLocation: "Hagrid's Hut",
    objectives: [
      { id: "defeat_pixies", description: "Defeat 5 Cornish Pixies", type: "defeat" as const, target: "Cornish Pixie", required: 5 },
    ],
    rewards: { experience: 120, galleons: 50 },
    grantsTrial: false,
  },
];

// ===== MAP CONNECTIONS =====
// Define how locations connect to each other
const MAP_CONNECTION_DATA: Array<{
  fromLocation: string;
  toLocation: string;
  connectionType: ConnectionType;
  fromPosition?: { x: number; y: number };
  toPosition?: { x: number; y: number };
  transitionText?: string;
  isHidden?: boolean;
}> = [
  // The Undercroft (starting location) - hidden chamber beneath Hogwarts
  { fromLocation: "The Undercroft", toLocation: "Dungeons", connectionType: "hidden", fromPosition: { x: 240, y: 48 }, toPosition: { x: 320, y: 272 }, transitionText: "You slip through the hidden passage..." },
  { fromLocation: "The Undercroft", toLocation: "Slytherin Common Room", connectionType: "hidden", fromPosition: { x: 440, y: 180 }, toPosition: { x: 80, y: 160 }, transitionText: "A secret passage leads to Slytherin territory...", isHidden: true },
  
  // Dungeons to Undercroft (return path)
  { fromLocation: "Dungeons", toLocation: "The Undercroft", connectionType: "hidden", fromPosition: { x: 320, y: 272 }, toPosition: { x: 240, y: 48 }, transitionText: "You descend into the hidden chamber...", isHidden: true },
  
  // Great Hall connections
  { fromLocation: "Great Hall", toLocation: "Entrance Hall", connectionType: "door", fromPosition: { x: 320, y: 48 }, toPosition: { x: 320, y: 272 }, transitionText: "You leave the Great Hall..." },
  
  // Entrance Hall connections
  { fromLocation: "Entrance Hall", toLocation: "Great Hall", connectionType: "door", fromPosition: { x: 320, y: 272 }, toPosition: { x: 320, y: 48 } },
  { fromLocation: "Entrance Hall", toLocation: "Grand Staircase", connectionType: "stairs", fromPosition: { x: 480, y: 160 }, toPosition: { x: 160, y: 160 } },
  { fromLocation: "Entrance Hall", toLocation: "Dungeons", connectionType: "stairs", fromPosition: { x: 160, y: 272 }, toPosition: { x: 320, y: 48 } },
  { fromLocation: "Entrance Hall", toLocation: "Hogwarts Grounds", connectionType: "door", fromPosition: { x: 320, y: 48 }, toPosition: { x: 320, y: 272 } },
  
  // Dungeons connections
  { fromLocation: "Dungeons", toLocation: "Entrance Hall", connectionType: "stairs", fromPosition: { x: 320, y: 48 }, toPosition: { x: 160, y: 272 } },
  { fromLocation: "Dungeons", toLocation: "Potions Classroom", connectionType: "door", fromPosition: { x: 480, y: 160 }, toPosition: { x: 160, y: 160 } },
  { fromLocation: "Dungeons", toLocation: "Slytherin Common Room", connectionType: "hidden", fromPosition: { x: 160, y: 160 }, toPosition: { x: 320, y: 272 } },
  { fromLocation: "Dungeons", toLocation: "Snape's Office", connectionType: "door", fromPosition: { x: 560, y: 160 }, toPosition: { x: 160, y: 160 } },
  
  // Library area
  { fromLocation: "Library", toLocation: "Restricted Section", connectionType: "locked", fromPosition: { x: 480, y: 80 }, toPosition: { x: 160, y: 160 }, transitionText: "You sneak into the Restricted Section..." },
  
  // Grounds connections
  { fromLocation: "Hogwarts Grounds", toLocation: "Entrance Hall", connectionType: "path", fromPosition: { x: 320, y: 272 }, toPosition: { x: 320, y: 48 } },
  { fromLocation: "Hogwarts Grounds", toLocation: "Hagrid's Hut", connectionType: "path", fromPosition: { x: 160, y: 160 }, toPosition: { x: 320, y: 272 } },
  { fromLocation: "Hogwarts Grounds", toLocation: "Quidditch Pitch", connectionType: "path", fromPosition: { x: 480, y: 160 }, toPosition: { x: 320, y: 272 } },
  { fromLocation: "Hogwarts Grounds", toLocation: "Forbidden Forest", connectionType: "path", fromPosition: { x: 80, y: 80 }, toPosition: { x: 560, y: 272 } },
  { fromLocation: "Hogwarts Grounds", toLocation: "Black Lake", connectionType: "path", fromPosition: { x: 560, y: 80 }, toPosition: { x: 160, y: 160 } },
  { fromLocation: "Hogwarts Grounds", toLocation: "Greenhouse", connectionType: "door", fromPosition: { x: 400, y: 80 }, toPosition: { x: 320, y: 272 } },
  
  // Tower connections
  { fromLocation: "Grand Staircase", toLocation: "Gryffindor Common Room", connectionType: "door", fromPosition: { x: 560, y: 80 }, toPosition: { x: 320, y: 272 } },
  { fromLocation: "Grand Staircase", toLocation: "Astronomy Tower", connectionType: "stairs", fromPosition: { x: 320, y: 48 }, toPosition: { x: 320, y: 272 } },
  { fromLocation: "Grand Staircase", toLocation: "Divination Tower", connectionType: "stairs", fromPosition: { x: 480, y: 48 }, toPosition: { x: 320, y: 272 } },
  { fromLocation: "Grand Staircase", toLocation: "Library", connectionType: "door", fromPosition: { x: 160, y: 80 }, toPosition: { x: 320, y: 272 } },
  { fromLocation: "Grand Staircase", toLocation: "Seventh Floor Corridor", connectionType: "stairs", fromPosition: { x: 400, y: 48 }, toPosition: { x: 320, y: 272 } },
  
  // Room of Requirement
  { fromLocation: "Seventh Floor Corridor", toLocation: "Room of Requirement", connectionType: "hidden", fromPosition: { x: 320, y: 160 }, toPosition: { x: 320, y: 272 }, transitionText: "A door appears in the wall..." },
  
  // Hogsmeade
  { fromLocation: "Hogwarts Grounds", toLocation: "Hogsmeade Village", connectionType: "path", fromPosition: { x: 40, y: 160 }, toPosition: { x: 560, y: 160 }, transitionText: "You walk down to Hogsmeade..." },
  { fromLocation: "Hogsmeade Village", toLocation: "Three Broomsticks", connectionType: "door", fromPosition: { x: 200, y: 120 }, toPosition: { x: 320, y: 272 } },
  { fromLocation: "Hogsmeade Village", toLocation: "Honeydukes", connectionType: "door", fromPosition: { x: 280, y: 120 }, toPosition: { x: 320, y: 272 } },
  { fromLocation: "Hogsmeade Village", toLocation: "Zonko's Joke Shop", connectionType: "door", fromPosition: { x: 360, y: 120 }, toPosition: { x: 320, y: 272 } },
  { fromLocation: "Hogsmeade Village", toLocation: "Shrieking Shack", connectionType: "path", fromPosition: { x: 80, y: 80 }, toPosition: { x: 320, y: 272 }, transitionText: "You approach the haunted shack..." },
];

// ===== ENCOUNTER TABLES =====
// Which creatures appear in each location
const ENCOUNTER_DATA: Array<{
  locationName: string;
  creatureName: string;
  encounterType: EncounterType;
  encounterRate: number;
  minLevel: number;
  maxLevel: number;
  isRare?: boolean;
}> = [
  // The Undercroft (starting area - low encounter rate, easier creatures)
  { locationName: "The Undercroft", creatureName: "Cornish Pixie", encounterType: "wild", encounterRate: 10, minLevel: 1, maxLevel: 3 },
  { locationName: "The Undercroft", creatureName: "Boggart", encounterType: "wild", encounterRate: 5, minLevel: 3, maxLevel: 5, isRare: true },
  
  // Forbidden Forest
  { locationName: "Forbidden Forest", creatureName: "Acromantula", encounterType: "wild", encounterRate: 15, minLevel: 8, maxLevel: 15 },
  { locationName: "Forbidden Forest", creatureName: "Centaur", encounterType: "wild", encounterRate: 5, minLevel: 10, maxLevel: 18, isRare: true },
  { locationName: "Forbidden Forest", creatureName: "Unicorn", encounterType: "wild", encounterRate: 3, minLevel: 5, maxLevel: 10, isRare: true },
  { locationName: "Forbidden Forest", creatureName: "Thestral", encounterType: "wild", encounterRate: 8, minLevel: 6, maxLevel: 12 },
  
  // Dungeons
  { locationName: "Dungeons", creatureName: "Cornish Pixie", encounterType: "wild", encounterRate: 20, minLevel: 2, maxLevel: 5 },
  { locationName: "Dungeons", creatureName: "Red Cap", encounterType: "wild", encounterRate: 10, minLevel: 4, maxLevel: 8 },
  
  // Chamber of Secrets
  { locationName: "Chamber of Secrets", creatureName: "Basilisk", encounterType: "boss", encounterRate: 100, minLevel: 20, maxLevel: 25 },
  
  // Black Lake
  { locationName: "Black Lake", creatureName: "Grindylow", encounterType: "wild", encounterRate: 25, minLevel: 3, maxLevel: 7 },
  { locationName: "Black Lake", creatureName: "Merperson", encounterType: "wild", encounterRate: 10, minLevel: 8, maxLevel: 14, isRare: true },
  { locationName: "Black Lake", creatureName: "Giant Squid", encounterType: "boss", encounterRate: 5, minLevel: 15, maxLevel: 20 },
  
  // Hogwarts Grounds
  { locationName: "Hogwarts Grounds", creatureName: "Cornish Pixie", encounterType: "wild", encounterRate: 15, minLevel: 1, maxLevel: 3 },
  { locationName: "Hogwarts Grounds", creatureName: "Gnome", encounterType: "wild", encounterRate: 20, minLevel: 1, maxLevel: 2 },
  
  // Shrieking Shack
  { locationName: "Shrieking Shack", creatureName: "Boggart", encounterType: "wild", encounterRate: 30, minLevel: 5, maxLevel: 10 },
  { locationName: "Shrieking Shack", creatureName: "Dementor", encounterType: "wild", encounterRate: 10, minLevel: 12, maxLevel: 18, isRare: true },
  
  // Azkaban (high level area)
  { locationName: "Azkaban Prison", creatureName: "Dementor", encounterType: "wild", encounterRate: 50, minLevel: 15, maxLevel: 25 },
  
  // Room of Requirement can spawn training dummies
  { locationName: "Room of Requirement", creatureName: "Training Dummy", encounterType: "scripted", encounterRate: 100, minLevel: 1, maxLevel: 30 },
];

// ===== CREATURE STATS =====
// Combat stats for creatures that can be encountered
const CREATURE_STATS_DATA = [
  { 
    creatureName: "Cornish Pixie", 
    displayName: "Cornish Pixie",
    description: "Mischievous blue creatures. Quick but fragile.",
    baseLevel: 2,
    discipline: "creatures" as MagicalDiscipline,
    stats: { maxHp: 30, currentHp: 30, attack: 8, defense: 4, speed: 15, accuracy: 85, evasion: 20, critChance: 5 },
    knownSpells: ["flipendo"],
    experienceYield: 15,
    galleonYield: 3,
  },
  { 
    creatureName: "Gnome", 
    displayName: "Garden Gnome",
    description: "Pesky garden pests. Easy to defeat.",
    baseLevel: 1,
    discipline: "herbology" as MagicalDiscipline,
    stats: { maxHp: 20, currentHp: 20, attack: 5, defense: 5, speed: 8, accuracy: 70, evasion: 10, critChance: 2 },
    knownSpells: [],
    experienceYield: 8,
    galleonYield: 1,
  },
  { 
    creatureName: "Boggart", 
    displayName: "Boggart",
    description: "Shape-shifting creature that takes the form of your worst fear.",
    baseLevel: 6,
    discipline: "dark_arts" as MagicalDiscipline,
    stats: { maxHp: 60, currentHp: 60, attack: 15, defense: 8, speed: 10, accuracy: 90, evasion: 15, critChance: 10 },
    knownSpells: ["fear_strike"],
    experienceYield: 45,
    galleonYield: 10,
  },
  { 
    creatureName: "Acromantula", 
    displayName: "Acromantula",
    description: "Giant magical spider. Extremely dangerous.",
    baseLevel: 12,
    discipline: "creatures" as MagicalDiscipline,
    stats: { maxHp: 120, currentHp: 120, attack: 25, defense: 15, speed: 12, accuracy: 85, evasion: 8, critChance: 15 },
    knownSpells: ["venomous_bite", "web_trap"],
    experienceYield: 100,
    galleonYield: 25,
  },
  { 
    creatureName: "Grindylow", 
    displayName: "Grindylow",
    description: "Water demon with sharp claws. Aggressive but manageable.",
    baseLevel: 5,
    discipline: "creatures" as MagicalDiscipline,
    stats: { maxHp: 45, currentHp: 45, attack: 12, defense: 6, speed: 14, accuracy: 80, evasion: 18, critChance: 8 },
    knownSpells: [],
    experienceYield: 30,
    galleonYield: 5,
  },
  { 
    creatureName: "Red Cap", 
    displayName: "Red Cap",
    description: "Malevolent goblin-like creature. Bloodthirsty.",
    baseLevel: 6,
    discipline: "dark_arts" as MagicalDiscipline,
    stats: { maxHp: 55, currentHp: 55, attack: 18, defense: 8, speed: 10, accuracy: 85, evasion: 10, critChance: 20 },
    knownSpells: [],
    experienceYield: 40,
    galleonYield: 8,
  },
  { 
    creatureName: "Dementor", 
    displayName: "Dementor",
    description: "Soul-sucking dark creature. Only vulnerable to Patronus.",
    baseLevel: 15,
    discipline: "dark_arts" as MagicalDiscipline,
    stats: { maxHp: 150, currentHp: 150, attack: 30, defense: 20, speed: 8, accuracy: 95, evasion: 5, critChance: 25 },
    knownSpells: ["dementors_kiss", "fear_aura"],
    experienceYield: 200,
    galleonYield: 0,
    isBoss: true,
  },
  { 
    creatureName: "Basilisk", 
    displayName: "Basilisk",
    description: "King of Serpents. Its gaze is lethal.",
    baseLevel: 25,
    discipline: "creatures" as MagicalDiscipline,
    stats: { maxHp: 500, currentHp: 500, attack: 50, defense: 35, speed: 6, accuracy: 90, evasion: 5, critChance: 30 },
    knownSpells: ["deadly_gaze", "venomous_fang", "constrict"],
    experienceYield: 1000,
    galleonYield: 100,
    isBoss: true,
    bossPhases: 3,
  },
  { 
    creatureName: "Thestral", 
    displayName: "Thestral",
    description: "Skeletal winged horse. Gentle unless threatened.",
    baseLevel: 8,
    discipline: "creatures" as MagicalDiscipline,
    stats: { maxHp: 80, currentHp: 80, attack: 18, defense: 12, speed: 18, accuracy: 85, evasion: 25, critChance: 10 },
    knownSpells: [],
    experienceYield: 60,
    galleonYield: 15,
  },
  { 
    creatureName: "Training Dummy", 
    displayName: "Training Dummy",
    description: "A magical practice target. Good for learning spells.",
    baseLevel: 1,
    discipline: "defense" as MagicalDiscipline,
    stats: { maxHp: 50, currentHp: 50, attack: 0, defense: 5, speed: 1, accuracy: 0, evasion: 0, critChance: 0 },
    knownSpells: [],
    experienceYield: 10,
    galleonYield: 0,
  },
];

// Main seed function
export async function seedRPGData() {
  console.log("Seeding RPG game data...");
  
  // Seed combat spells
  console.log("Seeding combat spells...");
  for (const spell of COMBAT_SPELL_DATA) {
    try {
      await db.insert(combat_spells).values(spell).onConflictDoNothing();
    } catch (error) {
      console.log(`Spell ${spell.spellName} already exists, skipping...`);
    }
  }
  console.log(`Seeded ${COMBAT_SPELL_DATA.length} combat spells`);
  
  // Seed items
  console.log("Seeding items...");
  for (const item of ITEM_DATA) {
    try {
      await db.insert(items).values(item).onConflictDoNothing();
    } catch (error) {
      console.log(`Item ${item.itemId} already exists, skipping...`);
    }
  }
  console.log(`Seeded ${ITEM_DATA.length} items`);
  
  // Seed companions
  console.log("Seeding companions...");
  for (const companion of COMPANION_DATA) {
    try {
      await db.insert(companions).values(companion).onConflictDoNothing();
    } catch (error) {
      console.log(`Companion ${companion.companionId} already exists, skipping...`);
    }
  }
  console.log(`Seeded ${COMPANION_DATA.length} companions`);
  
  // Seed quests
  console.log("Seeding quests...");
  for (const quest of QUEST_DATA) {
    try {
      await db.insert(quests).values(quest).onConflictDoNothing();
    } catch (error) {
      console.log(`Quest ${quest.questId} already exists, skipping...`);
    }
  }
  console.log(`Seeded ${QUEST_DATA.length} quests`);
  
  // Seed map connections
  console.log("Seeding map connections...");
  for (const connection of MAP_CONNECTION_DATA) {
    try {
      await db.insert(map_connections).values(connection).onConflictDoNothing();
    } catch (error) {
      // Map connections don't have unique constraint, so just log
    }
  }
  console.log(`Seeded ${MAP_CONNECTION_DATA.length} map connections`);
  
  // Seed encounter tables
  console.log("Seeding encounter tables...");
  for (const encounter of ENCOUNTER_DATA) {
    try {
      await db.insert(encounter_tables).values(encounter).onConflictDoNothing();
    } catch (error) {
      // Encounter tables don't have unique constraint
    }
  }
  console.log(`Seeded ${ENCOUNTER_DATA.length} encounter entries`);
  
  // Seed creature stats
  console.log("Seeding creature stats...");
  for (const stats of CREATURE_STATS_DATA) {
    try {
      await db.insert(creature_stats).values(stats).onConflictDoNothing();
    } catch (error) {
      console.log(`Creature ${stats.creatureName} already exists, skipping...`);
    }
  }
  console.log(`Seeded ${CREATURE_STATS_DATA.length} creature stats`);
  
  console.log("RPG data seeding complete!");
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedRPGData().then(() => process.exit(0)).catch(console.error);
}
