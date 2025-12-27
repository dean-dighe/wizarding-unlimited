/**
 * Combat Asset Seeding Script
 * Seeds combat spells, creatures, spell animations, and battle backgrounds
 * Generates assets using xAI API when needed
 */

import { db } from "./db";
import {
  combat_spells,
  creature_stats,
  encounter_tables,
  spell_animations,
  battle_backgrounds,
  items,
  companions,
  type MagicalDiscipline,
  type StatusEffect,
  type InsertCombatSpell,
  type InsertCreatureStats,
  type InsertItem,
  type InsertCompanion,
} from "@shared/schema";
import { eq } from "drizzle-orm";

// Combat spell definitions - Harry Potter themed with Pokemon-style mechanics
const COMBAT_SPELLS: InsertCombatSpell[] = [
  // CHARMS (Utility, buffs, light damage)
  { spellName: "lumos", displayName: "Lumos", description: "Creates a beam of light", discipline: "charms", baseDamage: 15, accuracy: 100, ppCost: 5, maxPP: 30, targetType: "single", priority: 0, animationType: "light" },
  { spellName: "stupefy", displayName: "Stupefy", description: "Stunning spell that may stun target", discipline: "charms", baseDamage: 40, accuracy: 95, ppCost: 10, maxPP: 20, targetType: "single", statusEffect: "stunned", statusChance: 30, animationType: "projectile" },
  { spellName: "expelliarmus", displayName: "Expelliarmus", description: "Disarms opponent, reducing attack", discipline: "charms", baseDamage: 35, accuracy: 100, ppCost: 8, maxPP: 25, targetType: "single", animationType: "beam" },
  { spellName: "accio", displayName: "Accio", description: "Summons objects to damage enemy", discipline: "charms", baseDamage: 30, accuracy: 90, ppCost: 8, maxPP: 20, targetType: "single", animationType: "projectile" },
  { spellName: "wingardium_leviosa", displayName: "Wingardium Leviosa", description: "Levitates and drops objects", discipline: "charms", baseDamage: 25, accuracy: 85, ppCost: 6, maxPP: 25, targetType: "single", animationType: "buff" },
  
  // TRANSFIGURATION (Transform, status effects)
  { spellName: "vera_verto", displayName: "Vera Verto", description: "Transforms target partially", discipline: "transfiguration", baseDamage: 45, accuracy: 80, ppCost: 12, maxPP: 15, targetType: "single", statusEffect: "confused", statusChance: 40, animationType: "transform" },
  { spellName: "draconifors", displayName: "Draconifors", description: "Transforms object into dragon", discipline: "transfiguration", baseDamage: 55, accuracy: 85, ppCost: 15, maxPP: 10, targetType: "single", animationType: "summon" },
  { spellName: "lapifors", displayName: "Lapifors", description: "Transforms target into rabbit", discipline: "transfiguration", baseDamage: 20, accuracy: 75, ppCost: 10, maxPP: 15, targetType: "single", statusEffect: "silenced", statusChance: 50, animationType: "transform" },
  
  // DEFENSE (Shields, counters)
  { spellName: "protego", displayName: "Protego", description: "Creates protective shield", discipline: "defense", baseDamage: 0, accuracy: 100, ppCost: 8, maxPP: 20, targetType: "self", statusEffect: "shielded", statusChance: 100, priority: 2, animationType: "shield" },
  { spellName: "impedimenta", displayName: "Impedimenta", description: "Slows enemy speed", discipline: "defense", baseDamage: 30, accuracy: 90, ppCost: 10, maxPP: 20, targetType: "single", statusEffect: "frozen", statusChance: 35, animationType: "ice" },
  { spellName: "petrificus_totalus", displayName: "Petrificus Totalus", description: "Full body bind", discipline: "defense", baseDamage: 25, accuracy: 75, ppCost: 15, maxPP: 10, targetType: "single", statusEffect: "stunned", statusChance: 60, animationType: "ice" },
  { spellName: "finite_incantatem", displayName: "Finite Incantatem", description: "Removes status effects", discipline: "defense", baseDamage: 0, accuracy: 100, ppCost: 5, maxPP: 25, targetType: "ally", healAmount: 0, animationType: "light" },
  
  // DARK ARTS (High damage, debuffs)
  { spellName: "flipendo", displayName: "Flipendo", description: "Knockback jinx", discipline: "dark_arts", baseDamage: 45, accuracy: 95, ppCost: 8, maxPP: 25, targetType: "single", animationType: "projectile" },
  { spellName: "incendio", displayName: "Incendio", description: "Fire spell that may burn", discipline: "dark_arts", baseDamage: 50, accuracy: 90, ppCost: 12, maxPP: 15, targetType: "single", statusEffect: "burning", statusChance: 25, animationType: "fire" },
  { spellName: "confringo", displayName: "Confringo", description: "Explosive curse", discipline: "dark_arts", baseDamage: 70, accuracy: 85, ppCost: 18, maxPP: 10, targetType: "all_enemies", animationType: "aoe" },
  { spellName: "sectumsempra", displayName: "Sectumsempra", description: "Slashing curse", discipline: "dark_arts", baseDamage: 80, accuracy: 80, ppCost: 20, maxPP: 8, targetType: "single", statusEffect: "burning", statusChance: 40, critBonus: 15, animationType: "dark" },
  { spellName: "crucio", displayName: "Crucio", description: "Unforgivable torture curse", discipline: "dark_arts", baseDamage: 90, accuracy: 95, ppCost: 25, maxPP: 5, targetType: "single", statusEffect: "stunned", statusChance: 50, isUnforgivable: true, levelRequired: 50, animationType: "dark" },
  { spellName: "avada_kedavra", displayName: "Avada Kedavra", description: "Unforgivable killing curse", discipline: "dark_arts", baseDamage: 999, accuracy: 70, ppCost: 50, maxPP: 3, targetType: "single", isUnforgivable: true, levelRequired: 70, animationType: "dark" },
  
  // POTIONS (Healing, buffs, DoT)
  { spellName: "episkey", displayName: "Episkey", description: "Minor healing spell", discipline: "potions", baseDamage: 0, accuracy: 100, ppCost: 8, maxPP: 20, targetType: "self", healAmount: 40, animationType: "heal" },
  { spellName: "vulnera_sanentur", displayName: "Vulnera Sanentur", description: "Major healing spell", discipline: "potions", baseDamage: 0, accuracy: 100, ppCost: 15, maxPP: 10, targetType: "ally", healAmount: 80, animationType: "heal" },
  { spellName: "antidote", displayName: "Antidote Charm", description: "Cures poison", discipline: "potions", baseDamage: 0, accuracy: 100, ppCost: 5, maxPP: 20, targetType: "self", animationType: "heal" },
  
  // CREATURES (Summons, beast attacks)
  { spellName: "serpensortia", displayName: "Serpensortia", description: "Summons a snake to attack", discipline: "creatures", baseDamage: 55, accuracy: 90, ppCost: 15, maxPP: 12, targetType: "single", statusEffect: "poisoned", statusChance: 30, animationType: "summon" },
  { spellName: "avis", displayName: "Avis", description: "Summons birds to attack", discipline: "creatures", baseDamage: 35, accuracy: 95, ppCost: 10, maxPP: 20, targetType: "single", animationType: "summon" },
  { spellName: "oppugno", displayName: "Oppugno", description: "Commands creatures to attack", discipline: "creatures", baseDamage: 60, accuracy: 85, ppCost: 15, maxPP: 10, targetType: "single", animationType: "summon" },
  
  // DIVINATION (Accuracy, evasion, prediction)
  { spellName: "homenum_revelio", displayName: "Homenum Revelio", description: "Reveals hidden enemies, boosts accuracy", discipline: "divination", baseDamage: 0, accuracy: 100, ppCost: 5, maxPP: 20, targetType: "self", statusEffect: "blessed", statusChance: 100, animationType: "light" },
  { spellName: "prior_incantato", displayName: "Prior Incantato", description: "Reveals last spell, may counter", discipline: "divination", baseDamage: 40, accuracy: 100, ppCost: 12, maxPP: 15, targetType: "single", priority: 1, animationType: "light" },
  
  // HERBOLOGY (Nature, entangle)
  { spellName: "herbivicus", displayName: "Herbivicus", description: "Grows plants to entangle", discipline: "herbology", baseDamage: 35, accuracy: 90, ppCost: 10, maxPP: 20, targetType: "single", statusEffect: "frozen", statusChance: 25, animationType: "summon" },
  { spellName: "diffindo", displayName: "Diffindo", description: "Cutting spell", discipline: "herbology", baseDamage: 45, accuracy: 95, ppCost: 8, maxPP: 25, targetType: "single", animationType: "projectile" },
];

// Magical creatures for encounters
const CREATURES: InsertCreatureStats[] = [
  // Forest creatures
  { creatureName: "pixie", displayName: "Cornish Pixie", description: "Mischievous blue creature", baseLevel: 3, discipline: "creatures", knownSpells: ["flipendo", "accio"], experienceYield: 25, galleonYield: 8, stats: { maxHp: 40, currentHp: 40, attack: 12, defense: 6, speed: 18, accuracy: 85, evasion: 20, critChance: 10 } },
  { creatureName: "gnome", displayName: "Garden Gnome", description: "Potato-headed pest", baseLevel: 2, discipline: "herbology", knownSpells: ["diffindo"], experienceYield: 15, galleonYield: 5, stats: { maxHp: 35, currentHp: 35, attack: 10, defense: 8, speed: 8, accuracy: 80, evasion: 5, critChance: 5 } },
  { creatureName: "fairy", displayName: "Fairy", description: "Tiny magical being", baseLevel: 4, discipline: "charms", knownSpells: ["lumos", "wingardium_leviosa"], experienceYield: 30, galleonYield: 12, stats: { maxHp: 30, currentHp: 30, attack: 8, defense: 4, speed: 22, accuracy: 95, evasion: 25, critChance: 15 } },
  { creatureName: "bowtruckle", displayName: "Bowtruckle", description: "Tree guardian creature", baseLevel: 5, discipline: "herbology", knownSpells: ["diffindo", "herbivicus"], experienceYield: 40, galleonYield: 15, stats: { maxHp: 45, currentHp: 45, attack: 14, defense: 10, speed: 14, accuracy: 88, evasion: 15, critChance: 12 } },
  
  // Dungeon creatures
  { creatureName: "imp", displayName: "Imp", description: "Small dark creature", baseLevel: 6, discipline: "dark_arts", knownSpells: ["flipendo", "incendio"], experienceYield: 50, galleonYield: 20, stats: { maxHp: 55, currentHp: 55, attack: 16, defense: 10, speed: 16, accuracy: 82, evasion: 18, critChance: 10 } },
  { creatureName: "ghoul", displayName: "Ghoul", description: "Ugly humanoid creature", baseLevel: 8, discipline: "dark_arts", knownSpells: ["flipendo", "stupefy"], experienceYield: 65, galleonYield: 25, stats: { maxHp: 75, currentHp: 75, attack: 18, defense: 14, speed: 10, accuracy: 78, evasion: 5, critChance: 8 } },
  { creatureName: "boggart", displayName: "Boggart", description: "Shape-shifting fear creature", baseLevel: 10, discipline: "defense", knownSpells: ["vera_verto", "petrificus_totalus"], experienceYield: 80, galleonYield: 30, stats: { maxHp: 70, currentHp: 70, attack: 20, defense: 12, speed: 15, accuracy: 90, evasion: 20, critChance: 15 } },
  
  // Dangerous creatures
  { creatureName: "dementor", displayName: "Dementor", description: "Soul-draining dark creature", baseLevel: 25, discipline: "dark_arts", knownSpells: ["crucio"], experienceYield: 200, galleonYield: 0, isBoss: true, stats: { maxHp: 200, currentHp: 200, attack: 35, defense: 25, speed: 20, accuracy: 95, evasion: 30, critChance: 20 } },
  { creatureName: "acromantula", displayName: "Acromantula", description: "Giant spider", baseLevel: 20, discipline: "creatures", knownSpells: ["serpensortia", "oppugno"], experienceYield: 150, galleonYield: 50, isBoss: true, stats: { maxHp: 180, currentHp: 180, attack: 30, defense: 20, speed: 18, accuracy: 88, evasion: 15, critChance: 18 } },
  { creatureName: "troll", displayName: "Mountain Troll", description: "Dim-witted giant", baseLevel: 15, discipline: "creatures", knownSpells: ["confringo"], experienceYield: 120, galleonYield: 40, stats: { maxHp: 150, currentHp: 150, attack: 28, defense: 25, speed: 6, accuracy: 70, evasion: 2, critChance: 25 } },
  { creatureName: "basilisk", displayName: "Basilisk", description: "King of Serpents", baseLevel: 50, discipline: "dark_arts", knownSpells: ["avada_kedavra", "sectumsempra", "serpensortia"], experienceYield: 500, galleonYield: 200, isBoss: true, bossPhases: 3, stats: { maxHp: 500, currentHp: 500, attack: 50, defense: 40, speed: 25, accuracy: 92, evasion: 10, critChance: 20 } },
  
  // Common encounters
  { creatureName: "flobberworm", displayName: "Flobberworm", description: "Boring worm creature", baseLevel: 1, discipline: "herbology", knownSpells: [], experienceYield: 5, galleonYield: 2, stats: { maxHp: 20, currentHp: 20, attack: 5, defense: 2, speed: 2, accuracy: 60, evasion: 0, critChance: 0 } },
  { creatureName: "rat", displayName: "Magical Rat", description: "Enchanted rodent", baseLevel: 2, discipline: "creatures", knownSpells: [], experienceYield: 10, galleonYield: 3, stats: { maxHp: 25, currentHp: 25, attack: 8, defense: 4, speed: 15, accuracy: 75, evasion: 15, critChance: 5 } },
  { creatureName: "spider", displayName: "Giant Spider", description: "Large arachnid", baseLevel: 5, discipline: "creatures", knownSpells: ["oppugno"], experienceYield: 35, galleonYield: 12, stats: { maxHp: 50, currentHp: 50, attack: 15, defense: 8, speed: 12, accuracy: 82, evasion: 10, critChance: 8 } },
];

// Battle items
const BATTLE_ITEMS: InsertItem[] = [
  { itemId: "health_potion", displayName: "Health Potion", description: "Restores 50 HP", category: "potion", rarity: "common", buyPrice: 50, sellPrice: 25, usableInBattle: true, usableOutOfBattle: true, effect: { healHp: 50 } },
  { itemId: "super_health_potion", displayName: "Super Health Potion", description: "Restores 150 HP", category: "potion", rarity: "uncommon", buyPrice: 150, sellPrice: 75, usableInBattle: true, usableOutOfBattle: true, effect: { healHp: 150 } },
  { itemId: "max_health_potion", displayName: "Max Health Potion", description: "Fully restores HP", category: "potion", rarity: "rare", buyPrice: 500, sellPrice: 250, usableInBattle: true, usableOutOfBattle: true, effect: { healHp: 999 } },
  { itemId: "focus_potion", displayName: "Focus Potion", description: "Restores 20 PP to all spells", category: "potion", rarity: "uncommon", buyPrice: 100, sellPrice: 50, usableInBattle: true, usableOutOfBattle: true, effect: { healPp: 20 } },
  { itemId: "antidote_potion", displayName: "Antidote", description: "Cures poison", category: "potion", rarity: "common", buyPrice: 30, sellPrice: 15, usableInBattle: true, usableOutOfBattle: true, effect: { cureStatus: ["poisoned"] } },
  { itemId: "awakening_potion", displayName: "Awakening Draught", description: "Cures stun and confusion", category: "potion", rarity: "common", buyPrice: 40, sellPrice: 20, usableInBattle: true, usableOutOfBattle: true, effect: { cureStatus: ["stunned", "confused"] } },
  { itemId: "burn_heal", displayName: "Burn Heal Paste", description: "Cures burns", category: "potion", rarity: "common", buyPrice: 35, sellPrice: 17, usableInBattle: true, usableOutOfBattle: true, effect: { cureStatus: ["burning"] } },
  { itemId: "full_restore", displayName: "Full Restore", description: "Fully heals and cures all status", category: "potion", rarity: "legendary", buyPrice: 1000, sellPrice: 500, usableInBattle: true, usableOutOfBattle: true, effect: { healHp: 999, cureStatus: ["stunned", "burning", "frozen", "poisoned", "confused", "silenced"] } },
  { itemId: "attack_boost", displayName: "Strength Elixir", description: "Temporarily boosts attack", category: "potion", rarity: "uncommon", buyPrice: 200, sellPrice: 100, usableInBattle: true, usableOutOfBattle: false, effect: { boostStat: { stat: "attack", amount: 20, duration: 5 } } },
  { itemId: "defense_boost", displayName: "Iron Skin Draught", description: "Temporarily boosts defense", category: "potion", rarity: "uncommon", buyPrice: 200, sellPrice: 100, usableInBattle: true, usableOutOfBattle: false, effect: { boostStat: { stat: "defense", amount: 20, duration: 5 } } },
  { itemId: "speed_boost", displayName: "Swiftness Potion", description: "Temporarily boosts speed", category: "potion", rarity: "uncommon", buyPrice: 200, sellPrice: 100, usableInBattle: true, usableOutOfBattle: false, effect: { boostStat: { stat: "speed", amount: 15, duration: 5 } } },
];

// Companions/familiars
const COMPANIONS: InsertCompanion[] = [
  { companionId: "owl", displayName: "Owl", description: "A wise and loyal owl familiar", type: "familiar", abilities: ["scout", "deliver"], baseStats: { maxHp: 50, currentHp: 50, attack: 12, defense: 8, speed: 20, accuracy: 95, evasion: 25, critChance: 10 } },
  { companionId: "cat", displayName: "Cat", description: "A clever and agile cat familiar", type: "familiar", abilities: ["detect_hidden", "distract"], baseStats: { maxHp: 45, currentHp: 45, attack: 14, defense: 6, speed: 22, accuracy: 90, evasion: 30, critChance: 15 } },
  { companionId: "toad", displayName: "Toad", description: "A hardy toad familiar", type: "familiar", abilities: ["poison_resist", "water_affinity"], baseStats: { maxHp: 60, currentHp: 60, attack: 8, defense: 12, speed: 8, accuracy: 80, evasion: 5, critChance: 5 } },
  { companionId: "phoenix", displayName: "Phoenix", description: "A legendary fire bird", type: "creature", abilities: ["rebirth", "healing_tears", "fire_attack"], isUnlockable: true, unlockCondition: "Complete Trial 5", baseStats: { maxHp: 100, currentHp: 100, attack: 25, defense: 15, speed: 25, accuracy: 95, evasion: 20, critChance: 20 } },
  { companionId: "hippogriff", displayName: "Hippogriff", description: "A proud magical beast", type: "creature", abilities: ["flight", "powerful_attack"], isUnlockable: true, unlockCondition: "Befriend in Care of Magical Creatures", baseStats: { maxHp: 120, currentHp: 120, attack: 30, defense: 18, speed: 18, accuracy: 85, evasion: 15, critChance: 18 } },
];

// Battle background categories
const BATTLE_BACKGROUNDS = [
  { backgroundId: "forest_day", locationCategory: "forest", timeOfDay: "day", weather: "clear" },
  { backgroundId: "forest_night", locationCategory: "forest", timeOfDay: "night", weather: "clear" },
  { backgroundId: "forest_fog", locationCategory: "forest", timeOfDay: "day", weather: "fog" },
  { backgroundId: "castle_interior", locationCategory: "castle", timeOfDay: "day", weather: "clear" },
  { backgroundId: "castle_dungeon", locationCategory: "castle", timeOfDay: "night", weather: "clear" },
  { backgroundId: "castle_tower", locationCategory: "castle", timeOfDay: "night", weather: "storm" },
  { backgroundId: "field_day", locationCategory: "field", timeOfDay: "day", weather: "clear" },
  { backgroundId: "field_rain", locationCategory: "field", timeOfDay: "day", weather: "rain" },
  { backgroundId: "lake_day", locationCategory: "lake", timeOfDay: "day", weather: "clear" },
  { backgroundId: "lake_night", locationCategory: "lake", timeOfDay: "night", weather: "fog" },
  { backgroundId: "village_day", locationCategory: "village", timeOfDay: "day", weather: "clear" },
  { backgroundId: "graveyard_night", locationCategory: "graveyard", timeOfDay: "night", weather: "fog" },
];

// Encounter table by location
const ENCOUNTER_TABLES = [
  // Hogwarts grounds
  { locationName: "Hogwarts Grounds", creatureName: "gnome", encounterRate: 15, minLevel: 1, maxLevel: 4 },
  { locationName: "Hogwarts Grounds", creatureName: "fairy", encounterRate: 10, minLevel: 3, maxLevel: 6 },
  { locationName: "Hogwarts Grounds", creatureName: "bowtruckle", encounterRate: 8, minLevel: 4, maxLevel: 7, isRare: true },
  
  // Forbidden Forest
  { locationName: "Forbidden Forest", creatureName: "pixie", encounterRate: 12, minLevel: 3, maxLevel: 6 },
  { locationName: "Forbidden Forest", creatureName: "spider", encounterRate: 15, minLevel: 4, maxLevel: 8 },
  { locationName: "Forbidden Forest", creatureName: "bowtruckle", encounterRate: 10, minLevel: 5, maxLevel: 9 },
  { locationName: "Forbidden Forest", creatureName: "acromantula", encounterRate: 3, minLevel: 18, maxLevel: 25, isRare: true },
  
  // Dungeons
  { locationName: "Hogwarts Dungeons", creatureName: "rat", encounterRate: 20, minLevel: 1, maxLevel: 3 },
  { locationName: "Hogwarts Dungeons", creatureName: "imp", encounterRate: 12, minLevel: 5, maxLevel: 8 },
  { locationName: "Hogwarts Dungeons", creatureName: "ghoul", encounterRate: 8, minLevel: 7, maxLevel: 10 },
  
  // Chamber of Secrets area
  { locationName: "Chamber of Secrets", creatureName: "basilisk", encounterRate: 100, minLevel: 50, maxLevel: 50, isRare: true, specialCondition: "boss_encounter" },
  
  // General castle
  { locationName: "Hogwarts Castle", creatureName: "boggart", encounterRate: 5, minLevel: 8, maxLevel: 12, isRare: true },
  { locationName: "Hogwarts Castle", creatureName: "ghoul", encounterRate: 8, minLevel: 6, maxLevel: 10, timeOfDay: "night" },
];

// Seed function
export async function seedCombatAssets(): Promise<{ spells: number; creatures: number; items: number; companions: number; backgrounds: number; encounters: number }> {
  const results = { spells: 0, creatures: 0, items: 0, companions: 0, backgrounds: 0, encounters: 0 };
  
  console.log("Seeding combat spells...");
  for (const spell of COMBAT_SPELLS) {
    try {
      const existing = await db.select().from(combat_spells).where(eq(combat_spells.spellName, spell.spellName));
      if (existing.length === 0) {
        await db.insert(combat_spells).values(spell as any);
        results.spells++;
      }
    } catch (e) {
      console.error(`Failed to seed spell ${spell.spellName}:`, e);
    }
  }
  console.log(`Seeded ${results.spells} new spells`);
  
  console.log("Seeding creatures...");
  for (const creature of CREATURES) {
    try {
      const existing = await db.select().from(creature_stats).where(eq(creature_stats.creatureName, creature.creatureName));
      if (existing.length === 0) {
        await db.insert(creature_stats).values(creature as any);
        results.creatures++;
      }
    } catch (e) {
      console.error(`Failed to seed creature ${creature.creatureName}:`, e);
    }
  }
  console.log(`Seeded ${results.creatures} new creatures`);
  
  console.log("Seeding battle items...");
  for (const item of BATTLE_ITEMS) {
    try {
      const existing = await db.select().from(items).where(eq(items.itemId, item.itemId));
      if (existing.length === 0) {
        await db.insert(items).values(item as any);
        results.items++;
      }
    } catch (e) {
      console.error(`Failed to seed item ${item.itemId}:`, e);
    }
  }
  console.log(`Seeded ${results.items} new items`);
  
  console.log("Seeding companions...");
  for (const companion of COMPANIONS) {
    try {
      const existing = await db.select().from(companions).where(eq(companions.companionId, companion.companionId));
      if (existing.length === 0) {
        await db.insert(companions).values(companion as any);
        results.companions++;
      }
    } catch (e) {
      console.error(`Failed to seed companion ${companion.companionId}:`, e);
    }
  }
  console.log(`Seeded ${results.companions} new companions`);
  
  console.log("Seeding battle backgrounds...");
  for (const bg of BATTLE_BACKGROUNDS) {
    try {
      const existing = await db.select().from(battle_backgrounds).where(eq(battle_backgrounds.backgroundId, bg.backgroundId));
      if (existing.length === 0) {
        await db.insert(battle_backgrounds).values({
          ...bg,
          generationStatus: "pending",
        });
        results.backgrounds++;
      }
    } catch (e) {
      console.error(`Failed to seed background ${bg.backgroundId}:`, e);
    }
  }
  console.log(`Seeded ${results.backgrounds} new battle backgrounds`);
  
  console.log("Seeding encounter tables...");
  for (const encounter of ENCOUNTER_TABLES) {
    try {
      const existing = await db.select().from(encounter_tables).where(
        eq(encounter_tables.locationName, encounter.locationName)
      );
      const hasThisCreature = existing.some(e => e.creatureName === encounter.creatureName);
      if (!hasThisCreature) {
        await db.insert(encounter_tables).values(encounter);
        results.encounters++;
      }
    } catch (e) {
      console.error(`Failed to seed encounter:`, e);
    }
  }
  console.log(`Seeded ${results.encounters} new encounters`);
  
  return results;
}

// Spell animation generation prompts
export function getSpellAnimationPrompt(spellName: string, animationType: string, discipline: string): string {
  const basePrompts: Record<string, string> = {
    projectile: "magical energy bolt flying through air, glowing particle trail, fantasy spell effect",
    beam: "continuous magical beam of light, crackling energy stream, wizard spell",
    aoe: "magical explosion, expanding ring of energy, area effect spell",
    buff: "golden aura surrounding character, protective magical glow, enhancement spell",
    debuff: "dark swirling energy, curse effect, weakening magical aura",
    heal: "green and golden healing particles, restoration magic, warm magical glow",
    summon: "magical creature appearing from light, summoning circle, conjuration effect",
    transform: "shape-shifting magical effect, transformation particles, transfiguration spell",
    shield: "protective magical barrier, translucent energy shield, defense spell",
    lightning: "electric magical energy, crackling lightning bolt, storm spell",
    fire: "magical flames, burning fire spell, orange and red magical fire",
    ice: "frost and ice crystals, freezing magical effect, blue cold energy",
    dark: "dark purple and black magical energy, shadow curse, dark arts spell",
    light: "bright white magical light, holy protection, illumination spell",
  };
  
  const disciplineColors: Record<string, string> = {
    charms: "soft blue and white",
    transfiguration: "purple and silver",
    defense: "golden and white",
    dark_arts: "deep purple and green",
    potions: "green and orange",
    creatures: "brown and natural tones",
    divination: "silver and ethereal blue",
    herbology: "green and earthy brown",
  };
  
  const base = basePrompts[animationType] || basePrompts.projectile;
  const colors = disciplineColors[discipline] || "magical colored";
  
  return `Fantasy spell animation sprite sheet, ${spellName} spell, ${base}, ${colors} colors, Harry Potter magical style, transparent background, 8 frames horizontal strip, game asset, pixel art style, 64x64 pixels per frame`;
}

// Battle background generation prompts
export function getBattleBackgroundPrompt(category: string, timeOfDay: string, weather: string): string {
  const categoryPrompts: Record<string, string> = {
    forest: "dense magical forest, ancient trees, mysterious atmosphere, Forbidden Forest style",
    castle: "Hogwarts castle interior, stone walls, torches, medieval magical architecture",
    field: "open magical meadow, rolling hills, Hogwarts in distance",
    lake: "Black Lake shore, misty water, mountains in background",
    village: "Hogsmeade village, magical shops, cobblestone streets",
    graveyard: "old cemetery, tombstones, eerie atmosphere, magical fog",
    dungeon: "underground dungeon, stone corridors, dim lighting, chains and potions",
  };
  
  const timePrompts: Record<string, string> = {
    day: "bright daylight, sunny atmosphere",
    night: "moonlit night, stars, magical nighttime",
    dusk: "sunset colors, golden hour, twilight",
    dawn: "early morning, soft light, misty sunrise",
  };
  
  const weatherPrompts: Record<string, string> = {
    clear: "clear sky",
    rain: "rainy weather, wet surfaces, droplets",
    fog: "misty fog, atmospheric haze, mysterious",
    storm: "lightning storm, dark clouds, dramatic",
    snow: "falling snow, winter landscape, frost",
  };
  
  const cat = categoryPrompts[category] || categoryPrompts.forest;
  const time = timePrompts[timeOfDay] || timePrompts.day;
  const weath = weatherPrompts[weather] || weatherPrompts.clear;
  
  return `Fantasy RPG battle background, ${cat}, ${time}, ${weath}, Harry Potter magical world style, wide landscape view, 16:9 aspect ratio, detailed illustration, no characters, battle arena perspective`;
}
