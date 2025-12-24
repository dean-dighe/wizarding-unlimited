import { db } from "./db";
import { 
  game_states, 
  location_maps,
  character_sprites,
  environment_sprites,
  type InsertGameState, 
  type GameState,
  type InsertLocationMap,
  type LocationMap,
  type InsertCharacterSprite,
  type CharacterSprite,
  type InsertEnvironmentSprite,
  type EnvironmentSprite,
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Game state methods
  getGameState(conversationId: number): Promise<GameState | undefined>;
  createGameState(state: InsertGameState): Promise<GameState>;
  updateGameState(conversationId: number, updates: Partial<InsertGameState>): Promise<GameState>;
  
  // Location map methods (game-wide persistence)
  getLocationMap(locationName: string): Promise<LocationMap | undefined>;
  createLocationMap(map: InsertLocationMap): Promise<LocationMap>;
  updateLocationMap(locationName: string, updates: Partial<InsertLocationMap>): Promise<LocationMap>;
  getAllLocationMaps(): Promise<LocationMap[]>;
  
  // Character sprite methods (game-wide persistence)
  getCharacterSprite(characterName: string): Promise<CharacterSprite | undefined>;
  createCharacterSprite(sprite: InsertCharacterSprite): Promise<CharacterSprite>;
  updateCharacterSprite(characterName: string, updates: Partial<InsertCharacterSprite>): Promise<CharacterSprite>;
  getAllCharacterSprites(): Promise<CharacterSprite[]>;
  getCanonCharacterSprites(): Promise<CharacterSprite[]>;
  
  // Environment sprite methods (game-wide persistence)
  getEnvironmentSprite(assetId: string): Promise<EnvironmentSprite | undefined>;
  createEnvironmentSprite(sprite: InsertEnvironmentSprite): Promise<EnvironmentSprite>;
  getAllEnvironmentSprites(): Promise<EnvironmentSprite[]>;
  getEnvironmentSpritesByCategory(category: string): Promise<EnvironmentSprite[]>;
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
    // Filter out undefined values to prevent accidental NULL writes
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }
    
    const [updated] = await db
      .update(game_states)
      .set({ ...cleanUpdates, updatedAt: new Date() })
      .where(eq(game_states.conversationId, conversationId))
      .returning();
    
    if (!updated) {
      throw new Error(`Game state not found for conversation ${conversationId}`);
    }
    
    return updated;
  }

  // ===== LOCATION MAP METHODS =====
  
  async getLocationMap(locationName: string): Promise<LocationMap | undefined> {
    const [map] = await db.select().from(location_maps).where(eq(location_maps.locationName, locationName));
    return map;
  }
  
  async createLocationMap(map: InsertLocationMap): Promise<LocationMap> {
    const [newMap] = await db.insert(location_maps).values(map).returning();
    return newMap;
  }
  
  async updateLocationMap(locationName: string, updates: Partial<InsertLocationMap>): Promise<LocationMap> {
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }
    
    const [updated] = await db
      .update(location_maps)
      .set({ ...cleanUpdates, updatedAt: new Date() })
      .where(eq(location_maps.locationName, locationName))
      .returning();
    
    if (!updated) {
      throw new Error(`Location map not found: ${locationName}`);
    }
    
    return updated;
  }
  
  async getAllLocationMaps(): Promise<LocationMap[]> {
    return db.select().from(location_maps);
  }

  // ===== CHARACTER SPRITE METHODS =====
  
  async getCharacterSprite(characterName: string): Promise<CharacterSprite | undefined> {
    const [sprite] = await db.select().from(character_sprites).where(eq(character_sprites.characterName, characterName));
    return sprite;
  }
  
  async createCharacterSprite(sprite: InsertCharacterSprite): Promise<CharacterSprite> {
    const [newSprite] = await db.insert(character_sprites).values(sprite).returning();
    return newSprite;
  }
  
  async updateCharacterSprite(characterName: string, updates: Partial<InsertCharacterSprite>): Promise<CharacterSprite> {
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }
    
    const [updated] = await db
      .update(character_sprites)
      .set({ ...cleanUpdates, updatedAt: new Date() })
      .where(eq(character_sprites.characterName, characterName))
      .returning();
    
    if (!updated) {
      throw new Error(`Character sprite not found: ${characterName}`);
    }
    
    return updated;
  }
  
  async getAllCharacterSprites(): Promise<CharacterSprite[]> {
    return db.select().from(character_sprites);
  }
  
  async getCanonCharacterSprites(): Promise<CharacterSprite[]> {
    return db.select().from(character_sprites).where(eq(character_sprites.isCanon, true));
  }

  // ===== ENVIRONMENT SPRITE METHODS =====
  
  async getEnvironmentSprite(assetId: string): Promise<EnvironmentSprite | undefined> {
    const [sprite] = await db.select().from(environment_sprites).where(eq(environment_sprites.assetId, assetId));
    return sprite;
  }
  
  async createEnvironmentSprite(sprite: InsertEnvironmentSprite): Promise<EnvironmentSprite> {
    const [newSprite] = await db.insert(environment_sprites).values(sprite).returning();
    return newSprite;
  }
  
  async getAllEnvironmentSprites(): Promise<EnvironmentSprite[]> {
    return db.select().from(environment_sprites);
  }
  
  async getEnvironmentSpritesByCategory(category: string): Promise<EnvironmentSprite[]> {
    return db.select().from(environment_sprites).where(eq(environment_sprites.category, category));
  }
}

export const storage = new DatabaseStorage();
