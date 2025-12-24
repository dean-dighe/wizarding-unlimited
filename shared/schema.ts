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
