import { pgTable, serial, text, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export chat models
export * from "./models/chat";

// Game specific tables (if we need to store extra game state linked to a conversation)
export const game_states = pgTable("game_states", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(), // Links to the chat conversation
  house: text("house"), // Gryffindor, Slytherin, etc.
  health: integer("health").default(100),
  inventory: jsonb("inventory").default([]),
  location: text("location").default("Great Hall"),
  gameTime: text("game_time").default("September 1st, 1991 - 10:30 AM"), // In-game date and time
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGameStateSchema = createInsertSchema(game_states).omit({ 
  id: true, 
  updatedAt: true 
});

export type GameState = typeof game_states.$inferSelect;
export type InsertGameState = z.infer<typeof insertGameStateSchema>;
