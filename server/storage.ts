import { db } from "./db";
import { game_states, type InsertGameState, type GameState } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getGameState(conversationId: number): Promise<GameState | undefined>;
  createGameState(state: InsertGameState): Promise<GameState>;
  updateGameState(conversationId: number, updates: Partial<InsertGameState>): Promise<GameState>;
}

export class DatabaseStorage implements IStorage {
  async getGameState(conversationId: number): Promise<GameState | undefined> {
    const [state] = await db.select().from(game_states).where(eq(game_states.conversationId, conversationId));
    return state;
  }

  async createGameState(state: InsertGameState): Promise<GameState> {
    const [newState] = await db.insert(game_states).values(state).returning();
    return newState;
  }

  async updateGameState(conversationId: number, updates: Partial<InsertGameState>): Promise<GameState> {
    const [updated] = await db
      .update(game_states)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(game_states.conversationId, conversationId))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
