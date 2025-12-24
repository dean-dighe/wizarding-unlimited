import { pgTable, serial, text, boolean, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export chat models
export * from "./models/chat";

// Import conversations for FK reference
import { conversations } from "./models/chat";

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

// Database indexes for foreign key columns (improves query performance)
export const gameStatesConversationIdIdx = index('game_states_conversation_id_idx').on(game_states.conversationId);
