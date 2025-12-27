import { pgTable, serial, text, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export chat models
export * from "./models/chat";

// Import conversations for FK reference
import { conversations } from "./models/chat";

// ===== GAME ASSET TABLES =====

// Map generation status enum
export type MapGenerationStatus = "pending" | "generating" | "ready" | "failed";

// Tilemap layer data (Tiled-compatible format)
export interface TilemapLayer {
  name: string;
  data: number[]; // Tile indices
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
}

// Placed object on a map (environment sprite instance)
export interface PlacedObject {
  assetId: string; // References environment_sprites.assetId
  x: number; // Pixel position
  y: number;
  scale?: number; // Optional scale factor (default 1)
  flipX?: boolean; // Horizontal flip
}

// Full tilemap data structure
export interface TilemapData {
  width: number; // Map width in tiles
  height: number; // Map height in tiles
  tileWidth: number; // Tile size (32)
  tileHeight: number;
  layers: TilemapLayer[];
  tilesetName: string;
  objects?: PlacedObject[]; // Environmental objects placed on this map
}

// Location maps - stores generated Phaser.js map code for each unique location
// Game-wide persistence: maps are reused across all players
export const location_maps = pgTable("location_maps", {
  id: serial("id").primaryKey(),
  locationName: text("location_name").notNull().unique(), // e.g., "Great Hall", "Potions Classroom"
  mapCode: text("map_code").notNull(), // Generated Phaser.js map rendering code (deprecated)
  tilesetUrl: text("tileset_url"), // Object Storage URL for tileset image
  mapWidth: integer("map_width").default(640), // Canvas width in pixels
  mapHeight: integer("map_height").default(480), // Canvas height in pixels
  spawnPoints: jsonb("spawn_points").$type<Record<string, { x: number; y: number }>>().default({}), // Named spawn positions
  walkableTiles: jsonb("walkable_tiles").$type<number[]>().default([]), // Tile indices that can be walked on
  
  // New fields for proper tilemap support
  tilemapData: jsonb("tilemap_data").$type<TilemapData>(), // Structured tilemap for Phaser
  generationStatus: text("generation_status").$type<MapGenerationStatus>().default("pending"),
  lastAccessedAt: timestamp("last_accessed_at").defaultNow(), // For LRU cache eviction
  generationError: text("generation_error"), // Error message if generation failed
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLocationMapSchema = createInsertSchema(location_maps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LocationMap = typeof location_maps.$inferSelect;
export type InsertLocationMap = z.infer<typeof insertLocationMapSchema>;

// Character sprites - stores generated pixel art sprites for characters
// Game-wide persistence: sprites are reused across all players
export const character_sprites = pgTable("character_sprites", {
  id: serial("id").primaryKey(),
  characterName: text("character_name").notNull().unique(), // e.g., "Harry Potter", or custom NPC name
  isProtagonist: boolean("is_protagonist").default(false), // True for player characters
  isCanon: boolean("is_canon").default(false), // True for Harry Potter canon characters
  spriteSheetUrl: text("sprite_sheet_url").notNull(), // Object Storage URL for sprite sheet
  characterDescription: text("character_description"), // Visual description used for generation
  appearanceSignature: text("appearance_signature"), // Hash of normalized description for reuse detection
  variantVersion: integer("variant_version").default(1), // Version number for sprite updates
  previousSpriteUrl: text("previous_sprite_url"), // Previous sprite URL before update
  lastAppearanceChange: text("last_appearance_change"), // Description of last appearance modification
  spriteWidth: integer("sprite_width").default(32), // Single frame width
  spriteHeight: integer("sprite_height").default(32), // Single frame height
  frameCount: integer("frame_count").default(12), // Total animation frames
  animationConfig: jsonb("animation_config").$type<{
    idle: { start: number; end: number; frameRate: number };
    walkDown: { start: number; end: number; frameRate: number };
    walkUp: { start: number; end: number; frameRate: number };
    walkLeft: { start: number; end: number; frameRate: number };
    walkRight: { start: number; end: number; frameRate: number };
    cast: { start: number; end: number; frameRate: number };
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCharacterSpriteSchema = createInsertSchema(character_sprites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CharacterSprite = typeof character_sprites.$inferSelect;
export type InsertCharacterSprite = z.infer<typeof insertCharacterSpriteSchema>;

// Environment sprites - pre-generated assets for map decorations
// Game-wide persistence: shared across all maps and players
export const environment_sprites = pgTable("environment_sprites", {
  id: serial("id").primaryKey(),
  assetId: text("asset_id").notNull().unique(), // e.g., "rock_1", "tree_oak", "torch_lit"
  category: text("category").notNull(), // "nature", "furniture", "magical", "tools", "effects"
  spriteUrl: text("sprite_url").notNull(), // Object Storage URL for sprite image
  spriteWidth: integer("sprite_width").default(32),
  spriteHeight: integer("sprite_height").default(32),
  isAnimated: boolean("is_animated").default(false),
  frameCount: integer("frame_count").default(1),
  animationFrameRate: integer("animation_frame_rate").default(8),
  isWalkable: boolean("is_walkable").default(false), // Can player walk through this?
  description: text("description"), // What this asset represents
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEnvironmentSpriteSchema = createInsertSchema(environment_sprites).omit({
  id: true,
  createdAt: true,
});

export type EnvironmentSprite = typeof environment_sprites.$inferSelect;
export type InsertEnvironmentSprite = z.infer<typeof insertEnvironmentSpriteSchema>;

// Standard animation definitions - bundled config for consistent animations (deprecated - pixel art)
export const DEFAULT_ANIMATION_CONFIG = {
  idle: { start: 0, end: 0, frameRate: 1 },
  walkDown: { start: 0, end: 2, frameRate: 8 },
  walkUp: { start: 3, end: 5, frameRate: 8 },
  walkLeft: { start: 6, end: 8, frameRate: 8 },
  walkRight: { start: 9, end: 11, frameRate: 8 },
  cast: { start: 0, end: 2, frameRate: 6 },
} as const;

// ===== VISUAL NOVEL STYLE ASSETS =====

// Background generation status
export type BackgroundStatus = "pending" | "generating" | "ready" | "failed";

// Character portrait positions on screen
export type PortraitPosition = "left" | "center" | "right" | "far-left" | "far-right";

// Expression types for character portraits
export type PortraitExpression = "neutral" | "happy" | "sad" | "angry" | "surprised" | "worried" | "determined" | "mysterious" | "scared";

// Background scenes - VN-style location backgrounds
// Game-wide persistence: shared across all players
export const background_scenes = pgTable("background_scenes", {
  id: serial("id").primaryKey(),
  locationName: text("location_name").notNull().unique(), // e.g., "Great Hall", "Forbidden Forest"
  imageUrl: text("image_url"), // Object Storage URL for background image
  promptUsed: text("prompt_used"), // The prompt used to generate this background
  style: text("style").default("fantasy_illustration"), // Art style category
  timeOfDay: text("time_of_day").default("day"), // day, night, dusk, dawn for lighting variations
  weather: text("weather").default("clear"), // clear, rain, snow, fog for atmosphere
  generationStatus: text("generation_status").$type<BackgroundStatus>().default("pending"),
  generationError: text("generation_error"),
  aspectRatio: text("aspect_ratio").default("16:9"), // Standard VN aspect ratio
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBackgroundSceneSchema = createInsertSchema(background_scenes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BackgroundScene = typeof background_scenes.$inferSelect;
export type InsertBackgroundScene = z.infer<typeof insertBackgroundSceneSchema>;

// Character portraits - VN-style character art
// Game-wide persistence: shared across all players, with expression variants
export const character_portraits = pgTable("character_portraits", {
  id: serial("id").primaryKey(),
  characterName: text("character_name").notNull(), // e.g., "Harry Potter", "Hermione Granger"
  expression: text("expression").$type<PortraitExpression>().default("neutral"),
  isProtagonist: boolean("is_protagonist").default(false),
  isCanon: boolean("is_canon").default(false), // True for HP canon characters
  imageUrl: text("image_url"), // Object Storage URL for portrait image
  characterDescription: text("character_description"), // Visual description for generation
  appearanceSignature: text("appearance_signature"), // Hash for reuse detection
  pose: text("pose").default("front"), // front, three-quarter, side
  costume: text("costume").default("hogwarts_robes"), // Current outfit
  generationStatus: text("generation_status").$type<BackgroundStatus>().default("pending"),
  generationError: text("generation_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCharacterPortraitSchema = createInsertSchema(character_portraits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CharacterPortrait = typeof character_portraits.$inferSelect;
export type InsertCharacterPortrait = z.infer<typeof insertCharacterPortraitSchema>;

// Scene composition - which characters are visible in current scene
export interface SceneCharacter {
  characterName: string;
  position: PortraitPosition;
  expression: PortraitExpression;
  speaking?: boolean; // Highlighted when speaking
}

// Story Arc structure for narrative planning
export interface StoryArc {
  title: string;
  premise: string;
  chapters: Chapter[];
  currentChapterIndex: number;
}

export interface Chapter {
  title: string;
  objective: string;
  keyEvents: string[];
  completed: boolean;
}

// Game specific tables (if we need to store extra game state linked to a conversation)
export const game_states = pgTable("game_states", {
  id: serial("id").primaryKey(),
  // Foreign key to conversations with cascade delete
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  playerName: text("player_name"), // The player's character name
  house: text("house"), // Gryffindor, Slytherin, etc.
  health: integer("health").default(100),
  inventory: jsonb("inventory").default([]),
  spells: jsonb("spells").default([]), // Known spells learned throughout the adventure
  location: text("location").default("Great Hall"),
  gameTime: text("game_time").default("September 1st, 1991 - 10:30 AM"), // In-game date and time
  characterDescription: text("character_description"), // Verbose visual description for consistent image generation
  npcDescriptions: jsonb("npc_descriptions").$type<Record<string, string>>().default({}), // NPC name -> visual description mapping
  npcPositions: jsonb("npc_positions").$type<Record<string, string>>().default({}), // NPC name -> position (north, south, center, etc.) for game canvas
  characterMoods: jsonb("character_moods").$type<Record<string, string>>().default({}), // Character name -> expression (neutral, happy, sad, etc.) for VN portraits
  
  // Session-scoped player sprite (generated once per game session)
  playerSpriteUrl: text("player_sprite_url"), // Object Storage URL for this session's player sprite
  playerSpriteGenerated: boolean("player_sprite_generated").default(false), // Whether sprite generation completed
  
  // Story arc and chapter tracking
  storyArc: jsonb("story_arc").$type<StoryArc>(), // The overarching narrative structure
  decisionCount: integer("decision_count").default(0), // Track player decisions for summarization triggers
  
  // Context compaction - summarized history replaces full message history
  storySummary: text("story_summary"), // Compacted narrative summary (replaces old messages)
  lastSummarizedAt: integer("last_summarized_at").default(0), // Decision count when last summarized
  
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGameStateSchema = createInsertSchema(game_states).omit({
  id: true,
  updatedAt: true
});

export type GameState = typeof game_states.$inferSelect;
export type InsertGameState = z.infer<typeof insertGameStateSchema>;

// ===== SPELL ANIMATION SYSTEM =====

// Spell classification for categorizing effects
export type SpellClassification = "charm" | "jinx" | "hex" | "curse" | "transfiguration" | "healing" | "defensive" | "utility" | "dark";

// Animation generation status
export type AnimationStatus = "pending" | "generating" | "ready" | "failed";

// Spell color themes for procedural fallback effects
export interface SpellColorTheme {
  primary: string;    // Main spell color (hex)
  secondary: string;  // Secondary glow color
  particle: string;   // Particle effect color
}

// Animation frame configuration for sprite sheet playback
export interface SpellAnimationConfig {
  frameWidth: number;      // Width of each frame in pixels
  frameHeight: number;     // Height of each frame in pixels
  frameCount: number;      // Total number of frames
  frameRate: number;       // Frames per second
  loop: boolean;           // Whether to loop the animation
  phases: {                // Animation phases
    setup: { start: number; end: number };    // Wand raise/preparation
    cast: { start: number; end: number };     // Spell release
    impact: { start: number; end: number };   // Hit/effect
  };
}

// Master spell database - all known Harry Potter spells
export const spells = pgTable("spells", {
  id: serial("id").primaryKey(),
  spellName: text("spell_name").notNull().unique(), // e.g., "Lumos", "Expelliarmus"
  incantation: text("incantation").notNull(), // The spoken word(s)
  classification: text("classification").$type<SpellClassification>().default("charm"),
  description: text("description"), // What the spell does
  effect: text("effect"), // Visual effect description for image generation
  colorTheme: jsonb("color_theme").$type<SpellColorTheme>(), // Colors for procedural fallback
  difficulty: integer("difficulty").default(1), // 1-10 difficulty rating
  yearLearned: integer("year_learned").default(1), // Hogwarts year when typically learned
  isUnforgivable: boolean("is_unforgivable").default(false), // Avada Kedavra, Crucio, Imperio
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSpellSchema = createInsertSchema(spells).omit({
  id: true,
  createdAt: true,
});

export type Spell = typeof spells.$inferSelect;
export type InsertSpell = z.infer<typeof insertSpellSchema>;

// Spell animations - generated sprite sheets for each spell
export const spell_animations = pgTable("spell_animations", {
  id: serial("id").primaryKey(),
  spellName: text("spell_name").notNull().unique(), // References spell name for easy lookup
  spriteSheetUrl: text("sprite_sheet_url"), // Object Storage URL for animation sprite sheet
  animationConfig: jsonb("animation_config").$type<SpellAnimationConfig>(),
  promptUsed: text("prompt_used"), // Prompt used for generation
  generationStatus: text("generation_status").$type<AnimationStatus>().default("pending"),
  generationError: text("generation_error"),
  generationHash: text("generation_hash"), // Hash of prompt for cache invalidation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSpellAnimationSchema = createInsertSchema(spell_animations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SpellAnimation = typeof spell_animations.$inferSelect;
export type InsertSpellAnimation = z.infer<typeof insertSpellAnimationSchema>;

// Spell event for triggering animations in the scene
export interface SpellEvent {
  type: "spell";
  spellName: string;
  casterId: string;      // Character name who cast the spell
  targetId?: string;     // Character name of target (optional)
  position?: { x: number; y: number }; // Override position on screen
  timestamp: number;
}

// ===== POKEMON-STYLE RPG SYSTEM =====

// Magical disciplines (replaces Pokemon types)
export type MagicalDiscipline = 
  | "charms"           // Utility, buffs, light damage
  | "transfiguration"  // Transform self/enemy, status effects
  | "defense"          // Shields, counters, protection
  | "dark_arts"        // High damage, debuffs, fear
  | "potions"          // Healing, buffs, damage over time
  | "creatures"        // Summons, beast attacks
  | "divination"       // Accuracy, evasion, prediction
  | "herbology";       // Nature, healing, entangle

// Status effects that can be applied in combat
export type StatusEffect = 
  | "stunned"      // Skip turn
  | "burning"      // Damage over time
  | "frozen"       // Reduced speed, skip turn chance
  | "poisoned"     // Damage over time, reduced healing
  | "confused"     // May hurt self
  | "shielded"     // Reduced damage taken
  | "silenced"     // Cannot cast spells
  | "enraged"      // Increased damage, reduced defense
  | "invisible"    // Increased evasion
  | "blessed";     // Increased accuracy and crit

// Combat spell data - extends base spell with battle mechanics
export interface CombatSpellData {
  baseDamage: number;           // Base damage (0 for utility spells)
  accuracy: number;             // Hit chance 0-100
  ppCost: number;               // Power points consumed per use
  maxPP: number;                // Maximum PP for this spell
  discipline: MagicalDiscipline;
  targetType: "single" | "all_enemies" | "self" | "ally" | "all_allies";
  statusEffect?: StatusEffect;  // Status applied on hit
  statusChance?: number;        // Chance to apply status 0-100
  healAmount?: number;          // Healing if applicable
  priority?: number;            // Turn order priority (-5 to +5)
  critBonus?: number;           // Added crit chance 0-100
}

// Type effectiveness matrix (like Pokemon super effective/not very effective)
export const DISCIPLINE_EFFECTIVENESS: Record<MagicalDiscipline, { strongAgainst: MagicalDiscipline[]; weakAgainst: MagicalDiscipline[] }> = {
  charms: { strongAgainst: ["creatures", "herbology"], weakAgainst: ["defense", "dark_arts"] },
  transfiguration: { strongAgainst: ["defense", "potions"], weakAgainst: ["dark_arts", "divination"] },
  defense: { strongAgainst: ["dark_arts", "creatures"], weakAgainst: ["transfiguration", "charms"] },
  dark_arts: { strongAgainst: ["charms", "transfiguration"], weakAgainst: ["defense", "divination"] },
  potions: { strongAgainst: ["creatures", "herbology"], weakAgainst: ["transfiguration", "dark_arts"] },
  creatures: { strongAgainst: ["herbology", "divination"], weakAgainst: ["charms", "defense"] },
  divination: { strongAgainst: ["dark_arts", "transfiguration"], weakAgainst: ["creatures", "herbology"] },
  herbology: { strongAgainst: ["potions", "defense"], weakAgainst: ["charms", "creatures"] },
};

// Combat-ready spells table (extends base spells with battle mechanics)
export const combat_spells = pgTable("combat_spells", {
  id: serial("id").primaryKey(),
  spellName: text("spell_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  discipline: text("discipline").$type<MagicalDiscipline>().notNull().default("charms"),
  baseDamage: integer("base_damage").default(0),
  accuracy: integer("accuracy").default(95),
  ppCost: integer("pp_cost").default(5),
  maxPP: integer("max_pp").default(20),
  targetType: text("target_type").default("single"),
  statusEffect: text("status_effect").$type<StatusEffect>(),
  statusChance: integer("status_chance").default(0),
  healAmount: integer("heal_amount").default(0),
  priority: integer("priority").default(0),
  critBonus: integer("crit_bonus").default(0),
  levelRequired: integer("level_required").default(1),
  isUnforgivable: boolean("is_unforgivable").default(false),
  animationType: text("animation_type").default("projectile"), // projectile, beam, aoe, buff, heal
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCombatSpellSchema = createInsertSchema(combat_spells).omit({
  id: true,
  createdAt: true,
});

export type CombatSpell = typeof combat_spells.$inferSelect;
export type InsertCombatSpell = z.infer<typeof insertCombatSpellSchema>;

// ===== PLAYER PROFILE SYSTEM =====

// Player stats for combat
export interface PlayerStats {
  maxHp: number;
  currentHp: number;
  attack: number;      // Physical/spell damage modifier
  defense: number;     // Damage reduction
  speed: number;       // Turn order
  accuracy: number;    // Hit chance modifier
  evasion: number;     // Dodge chance
  critChance: number;  // Critical hit chance
}

// Player profiles - persistent save data
export const player_profiles = pgTable("player_profiles", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  playerName: text("player_name").notNull(),
  house: text("house"),
  level: integer("level").default(1),
  experience: integer("experience").default(0),
  experienceToNext: integer("experience_to_next").default(100),
  galleons: integer("galleons").default(50),
  stats: jsonb("stats").$type<PlayerStats>().default({
    maxHp: 100,
    currentHp: 100,
    attack: 10,
    defense: 10,
    speed: 10,
    accuracy: 90,
    evasion: 5,
    critChance: 5,
  }),
  knownSpells: text("known_spells").array().default([]),
  equippedSpells: text("equipped_spells").array().default([]), // Max 4 combat spells
  currentLocation: text("current_location").default("Great Hall"),
  trialSigils: integer("trial_sigils").default(0), // Badges equivalent
  playTime: integer("play_time").default(0), // Minutes played
  battlesWon: integer("battles_won").default(0),
  creaturesDefeated: integer("creatures_defeated").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlayerProfileSchema = createInsertSchema(player_profiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PlayerProfile = typeof player_profiles.$inferSelect;
export type InsertPlayerProfile = z.infer<typeof insertPlayerProfileSchema>;

// ===== INVENTORY SYSTEM =====

// Item categories
export type ItemCategory = "potion" | "equipment" | "key_item" | "ingredient" | "book" | "artifact";

// Item rarity
export type ItemRarity = "common" | "uncommon" | "rare" | "legendary";

// Item definitions
export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  itemId: text("item_id").notNull().unique(), // e.g., "health_potion", "phoenix_feather"
  displayName: text("display_name").notNull(),
  description: text("description"),
  category: text("category").$type<ItemCategory>().default("potion"),
  rarity: text("rarity").$type<ItemRarity>().default("common"),
  buyPrice: integer("buy_price").default(0),
  sellPrice: integer("sell_price").default(0),
  stackable: boolean("stackable").default(true),
  maxStack: integer("max_stack").default(99),
  usableInBattle: boolean("usable_in_battle").default(false),
  usableOutOfBattle: boolean("usable_out_of_battle").default(true),
  effect: jsonb("effect").$type<{
    healHp?: number;
    healPp?: number;
    cureStatus?: StatusEffect[];
    boostStat?: { stat: keyof PlayerStats; amount: number; duration?: number };
    teachSpell?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  createdAt: true,
});

export type Item = typeof items.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;

// Player inventory entries
export const player_inventory = pgTable("player_inventory", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => player_profiles.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").default(1),
  equipped: boolean("equipped").default(false),
  slotIndex: integer("slot_index"), // For equipment slots
});

export const insertPlayerInventorySchema = createInsertSchema(player_inventory).omit({
  id: true,
});

export type PlayerInventory = typeof player_inventory.$inferSelect;
export type InsertPlayerInventory = z.infer<typeof insertPlayerInventorySchema>;

// ===== COMPANION/PARTY SYSTEM =====

// Companion types (familiars, allies)
export type CompanionType = "familiar" | "ally" | "creature" | "house_elf";

// Companion data
export const companions = pgTable("companions", {
  id: serial("id").primaryKey(),
  companionId: text("companion_id").notNull().unique(), // e.g., "hedwig", "crookshanks"
  displayName: text("display_name").notNull(),
  description: text("description"),
  type: text("type").$type<CompanionType>().default("familiar"),
  baseStats: jsonb("base_stats").$type<PlayerStats>(),
  abilities: text("abilities").array().default([]), // Special abilities
  spriteId: text("sprite_id"), // Links to character_sprites
  isUnlockable: boolean("is_unlockable").default(true),
  unlockCondition: text("unlock_condition"), // Quest or event that unlocks
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCompanionSchema = createInsertSchema(companions).omit({
  id: true,
  createdAt: true,
});

export type Companion = typeof companions.$inferSelect;
export type InsertCompanion = z.infer<typeof insertCompanionSchema>;

// Player's unlocked companions
export const player_companions = pgTable("player_companions", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => player_profiles.id, { onDelete: "cascade" }),
  companionId: text("companion_id").notNull(),
  nickname: text("nickname"),
  level: integer("level").default(1),
  experience: integer("experience").default(0),
  currentHp: integer("current_hp").default(100),
  loyalty: integer("loyalty").default(50), // Affects battle performance
  isActive: boolean("is_active").default(false), // In current party
  partySlot: integer("party_slot"), // Position in party (0-2)
});

export const insertPlayerCompanionSchema = createInsertSchema(player_companions).omit({
  id: true,
});

export type PlayerCompanion = typeof player_companions.$inferSelect;
export type InsertPlayerCompanion = z.infer<typeof insertPlayerCompanionSchema>;

// ===== QUEST SYSTEM =====

// Quest status
export type QuestStatus = "locked" | "available" | "active" | "completed" | "failed";

// Quest definitions
export const quests = pgTable("quests", {
  id: serial("id").primaryKey(),
  questId: text("quest_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").default("main"), // main, side, trial, secret
  prerequisiteQuests: text("prerequisite_quests").array().default([]),
  requiredLevel: integer("required_level").default(1),
  requiredSigils: integer("required_sigils").default(0),
  objectives: jsonb("objectives").$type<{
    id: string;
    description: string;
    type: "defeat" | "collect" | "talk" | "explore" | "use_spell";
    target: string;
    required: number;
  }[]>().default([]),
  rewards: jsonb("rewards").$type<{
    experience?: number;
    galleons?: number;
    items?: { itemId: string; quantity: number }[];
    spells?: string[];
    sigils?: number;
    companions?: string[];
  }>(),
  startLocation: text("start_location"),
  grantsTrial: boolean("grants_trial").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertQuestSchema = createInsertSchema(quests).omit({
  id: true,
  createdAt: true,
});

export type Quest = typeof quests.$inferSelect;
export type InsertQuest = z.infer<typeof insertQuestSchema>;

// Player quest progress
export const player_quests = pgTable("player_quests", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => player_profiles.id, { onDelete: "cascade" }),
  questId: text("quest_id").notNull(),
  status: text("status").$type<QuestStatus>().default("locked"),
  objectiveProgress: jsonb("objective_progress").$type<Record<string, number>>().default({}),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertPlayerQuestSchema = createInsertSchema(player_quests).omit({
  id: true,
});

export type PlayerQuest = typeof player_quests.$inferSelect;
export type InsertPlayerQuest = z.infer<typeof insertPlayerQuestSchema>;

// ===== MAP CONNECTIVITY SYSTEM =====

// Connection types between maps
export type ConnectionType = "door" | "stairs" | "portal" | "path" | "hidden" | "locked";

// Map connections - defines how locations connect
export const map_connections = pgTable("map_connections", {
  id: serial("id").primaryKey(),
  fromLocation: text("from_location").notNull(),
  toLocation: text("to_location").notNull(),
  connectionType: text("connection_type").$type<ConnectionType>().default("door"),
  fromPosition: jsonb("from_position").$type<{ x: number; y: number }>(), // Trigger position on source map
  toPosition: jsonb("to_position").$type<{ x: number; y: number }>(),     // Spawn position on destination
  requiresKey: text("requires_key"), // Item ID needed to unlock
  requiredSigils: integer("required_sigils").default(0), // Minimum sigils to pass
  requiredQuest: text("required_quest"), // Quest that must be completed
  isOneWay: boolean("is_one_way").default(false),
  isHidden: boolean("is_hidden").default(false), // Only visible with certain spells/items
  transitionText: text("transition_text"), // Text shown during transition
});

export const insertMapConnectionSchema = createInsertSchema(map_connections).omit({
  id: true,
});

export type MapConnection = typeof map_connections.$inferSelect;
export type InsertMapConnection = z.infer<typeof insertMapConnectionSchema>;

// ===== ENCOUNTER SYSTEM =====

// Encounter types
export type EncounterType = "wild" | "trainer" | "boss" | "scripted";

// Creature encounter definitions per location
export const encounter_tables = pgTable("encounter_tables", {
  id: serial("id").primaryKey(),
  locationName: text("location_name").notNull(),
  encounterType: text("encounter_type").$type<EncounterType>().default("wild"),
  creatureName: text("creature_name").notNull(), // Character name from sprites
  encounterRate: integer("encounter_rate").default(10), // % chance per step
  minLevel: integer("min_level").default(1),
  maxLevel: integer("max_level").default(5),
  timeOfDay: text("time_of_day").default("any"), // any, day, night
  isRare: boolean("is_rare").default(false),
  specialCondition: text("special_condition"), // e.g., "full_moon", "after_quest_x"
});

export const insertEncounterTableSchema = createInsertSchema(encounter_tables).omit({
  id: true,
});

export type EncounterTable = typeof encounter_tables.$inferSelect;
export type InsertEncounterTable = z.infer<typeof insertEncounterTableSchema>;

// Creature combat stats (for enemies)
export const creature_stats = pgTable("creature_stats", {
  id: serial("id").primaryKey(),
  creatureName: text("creature_name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  baseLevel: integer("base_level").default(1),
  stats: jsonb("stats").$type<PlayerStats>(),
  discipline: text("discipline").$type<MagicalDiscipline>().default("creatures"),
  knownSpells: text("known_spells").array().default([]),
  experienceYield: integer("experience_yield").default(20),
  galleonYield: integer("galleon_yield").default(5),
  dropTable: jsonb("drop_table").$type<{ itemId: string; chance: number }[]>().default([]),
  isBoss: boolean("is_boss").default(false),
  bossPhases: integer("boss_phases").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCreatureStatsSchema = createInsertSchema(creature_stats).omit({
  id: true,
  createdAt: true,
});

export type CreatureStats = typeof creature_stats.$inferSelect;
export type InsertCreatureStats = z.infer<typeof insertCreatureStatsSchema>;

// ===== SAVE SYSTEM =====

// Save slots for each player
export const save_slots = pgTable("save_slots", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  slotNumber: integer("slot_number").notNull(), // 1-3
  profileSnapshot: jsonb("profile_snapshot").$type<PlayerProfile>(),
  locationSnapshot: text("location_snapshot"),
  timestamp: timestamp("timestamp").defaultNow(),
  playTime: integer("play_time").default(0),
  thumbnailUrl: text("thumbnail_url"), // Screenshot of save location
  isAutoSave: boolean("is_auto_save").default(false),
});

export const insertSaveSlotSchema = createInsertSchema(save_slots).omit({
  id: true,
});

export type SaveSlot = typeof save_slots.$inferSelect;
export type InsertSaveSlot = z.infer<typeof insertSaveSlotSchema>;

// ===== NPC DIALOGUE SYSTEM =====

// NPC state tracking
export type NPCDialogueState = "initial" | "met" | "friendly" | "quest_giver" | "shop" | "trainer";

export const npc_states = pgTable("npc_states", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => player_profiles.id, { onDelete: "cascade" }),
  npcName: text("npc_name").notNull(),
  dialogueState: text("dialogue_state").$type<NPCDialogueState>().default("initial"),
  relationshipLevel: integer("relationship_level").default(0), // -100 to 100
  timesSpoken: integer("times_spoken").default(0),
  lastDialogue: text("last_dialogue"),
  flags: jsonb("flags").$type<Record<string, boolean>>().default({}), // Custom per-NPC flags
});

// ===== BATTLE STATE SYSTEM =====

// Battle phase tracking
export type BattlePhase = 
  | "intro"          // Battle starting animation
  | "player_turn"    // Player selecting action
  | "enemy_turn"     // Enemy AI deciding
  | "action_resolve" // Executing actions
  | "status_tick"    // Status effects resolving
  | "victory"        // Player won
  | "defeat"         // Player lost
  | "flee"           // Player escaped
  | "capture";       // Creature pact formed

// Combatant state (player or enemy)
export interface CombatantState {
  name: string;
  isPlayer: boolean;
  currentHp: number;
  maxHp: number;
  currentPp: Record<string, number>; // PP per spell
  stats: PlayerStats;
  equippedSpells: string[];
  statusEffects: { effect: StatusEffect; turnsRemaining: number }[];
  level: number;
  discipline?: MagicalDiscipline;
}

// Active battle tracking
export const battle_states = pgTable("battle_states", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => player_profiles.id, { onDelete: "cascade" }),
  battleId: text("battle_id").notNull().unique(), // UUID for this battle
  phase: text("phase").$type<BattlePhase>().default("intro"),
  turnNumber: integer("turn_number").default(1),
  playerState: jsonb("player_state").$type<CombatantState>(),
  enemyState: jsonb("enemy_state").$type<CombatantState>(),
  companionStates: jsonb("companion_states").$type<CombatantState[]>().default([]),
  currentTurnOrder: text("current_turn_order").array().default([]), // Names in turn order
  locationName: text("location_name"),
  encounterType: text("encounter_type").$type<EncounterType>().default("wild"),
  canFlee: boolean("can_flee").default(true),
  weatherEffect: text("weather_effect"), // Special battle conditions
  backgroundUrl: text("background_url"), // Battle scene background
  startedAt: timestamp("started_at").defaultNow(),
  lastActionAt: timestamp("last_action_at").defaultNow(),
});

export const insertBattleStateSchema = createInsertSchema(battle_states).omit({
  id: true,
  startedAt: true,
  lastActionAt: true,
});

export type BattleState = typeof battle_states.$inferSelect;
export type InsertBattleState = z.infer<typeof insertBattleStateSchema>;

// Battle action log
export const battle_logs = pgTable("battle_logs", {
  id: serial("id").primaryKey(),
  battleId: text("battle_id").notNull(),
  turnNumber: integer("turn_number").notNull(),
  actorName: text("actor_name").notNull(),
  actionType: text("action_type").notNull(), // "spell", "item", "flee", "switch"
  actionTarget: text("action_target"),
  spellUsed: text("spell_used"),
  itemUsed: text("item_used"),
  damage: integer("damage").default(0),
  healing: integer("healing").default(0),
  statusApplied: text("status_applied").$type<StatusEffect>(),
  isCritical: boolean("is_critical").default(false),
  isMiss: boolean("is_miss").default(false),
  message: text("message"), // Narration text
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertBattleLogSchema = createInsertSchema(battle_logs).omit({
  id: true,
  timestamp: true,
});

export type BattleLog = typeof battle_logs.$inferSelect;
export type InsertBattleLog = z.infer<typeof insertBattleLogSchema>;

// ===== BATTLE BACKGROUNDS =====

// Pre-generated battle scene backgrounds
export const battle_backgrounds = pgTable("battle_backgrounds", {
  id: serial("id").primaryKey(),
  backgroundId: text("background_id").notNull().unique(), // e.g., "forest_day", "dungeon_dark"
  locationCategory: text("location_category").notNull(), // "forest", "castle", "dungeon", "field"
  timeOfDay: text("time_of_day").default("day"),
  weather: text("weather").default("clear"),
  imageUrl: text("image_url"),
  promptUsed: text("prompt_used"),
  generationStatus: text("generation_status").$type<BackgroundStatus>().default("pending"),
  generationError: text("generation_error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBattleBackgroundSchema = createInsertSchema(battle_backgrounds).omit({
  id: true,
  createdAt: true,
});

export type BattleBackground = typeof battle_backgrounds.$inferSelect;
export type InsertBattleBackground = z.infer<typeof insertBattleBackgroundSchema>;

// ===== STORY-WORLD INTEGRATION =====

// World state flags - tracks story choices that affect the explorable world
export const world_state_flags = pgTable("world_state_flags", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => player_profiles.id, { onDelete: "cascade" }),
  flagKey: text("flag_key").notNull(), // e.g., "forbidden_forest_unlocked", "snape_hostile"
  flagValue: jsonb("flag_value").$type<string | number | boolean | Record<string, unknown>>().default(true),
  scope: text("scope").default("permanent"), // "permanent", "chapter", "session"
  setAt: timestamp("set_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // For temporary flags
});

export const insertWorldStateFlagSchema = createInsertSchema(world_state_flags).omit({
  id: true,
  setAt: true,
});

export type WorldStateFlag = typeof world_state_flags.$inferSelect;
export type InsertWorldStateFlag = z.infer<typeof insertWorldStateFlagSchema>;

// Story choice effects - records the effects of story decisions
export type StoryEffectType = "unlock_connection" | "lock_connection" | "move_npc" | "set_flag" | "add_item" | "remove_item" | "change_relationship" | "trigger_encounter";

export const story_choice_effects = pgTable("story_choice_effects", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => player_profiles.id, { onDelete: "cascade" }),
  choiceId: text("choice_id").notNull(), // Unique identifier for this choice
  effectType: text("effect_type").$type<StoryEffectType>().notNull(),
  effectPayload: jsonb("effect_payload").$type<{
    connectionId?: number;
    npcName?: string;
    newLocation?: string;
    flagKey?: string;
    flagValue?: unknown;
    itemId?: string;
    quantity?: number;
    npcRelationship?: { npc: string; change: number };
    encounterData?: { creature: string; location: string };
  }>().notNull(),
  narrativeContext: text("narrative_context"), // What story moment triggered this
  appliedAt: timestamp("applied_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // For temporary effects
  isReverted: boolean("is_reverted").default(false),
});

export const insertStoryChoiceEffectSchema = createInsertSchema(story_choice_effects).omit({
  id: true,
  appliedAt: true,
});

export type StoryChoiceEffect = typeof story_choice_effects.$inferSelect;
export type InsertStoryChoiceEffect = z.infer<typeof insertStoryChoiceEffectSchema>;

// NPC locations - tracks where NPCs are in the world (can change based on story)
export const npc_locations = pgTable("npc_locations", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => player_profiles.id, { onDelete: "cascade" }),
  npcName: text("npc_name").notNull(),
  currentLocation: text("current_location").notNull(),
  spawnPosition: jsonb("spawn_position").$type<{ x: number; y: number }>(),
  schedule: jsonb("schedule").$type<Record<string, string>>(), // time-based locations
  isAvailable: boolean("is_available").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNpcLocationSchema = createInsertSchema(npc_locations).omit({
  id: true,
  updatedAt: true,
});

export type NpcLocation = typeof npc_locations.$inferSelect;
export type InsertNpcLocation = z.infer<typeof insertNpcLocationSchema>;
