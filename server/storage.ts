import { db } from "./db";
import { 
  game_states, 
  location_maps,
  character_sprites,
  environment_sprites,
  combat_spells,
  player_profiles,
  items,
  player_inventory,
  companions,
  player_companions,
  quests,
  player_quests,
  map_connections,
  encounter_tables,
  creature_stats,
  save_slots,
  npc_states,
  battle_states,
  battle_logs,
  type InsertGameState, 
  type GameState,
  type InsertLocationMap,
  type LocationMap,
  type InsertCharacterSprite,
  type CharacterSprite,
  type InsertEnvironmentSprite,
  type EnvironmentSprite,
  type CombatSpell,
  type InsertCombatSpell,
  type PlayerProfile,
  type InsertPlayerProfile,
  type Item,
  type InsertItem,
  type PlayerInventory,
  type InsertPlayerInventory,
  type Companion,
  type InsertCompanion,
  type PlayerCompanion,
  type InsertPlayerCompanion,
  type Quest,
  type InsertQuest,
  type PlayerQuest,
  type InsertPlayerQuest,
  type MapConnection,
  type InsertMapConnection,
  type EncounterTable,
  type InsertEncounterTable,
  type CreatureStats,
  type InsertCreatureStats,
  type SaveSlot,
  type InsertSaveSlot,
  type BattleState,
  type InsertBattleState,
  type BattleLog,
  type InsertBattleLog,
} from "@shared/schema";
import { eq, and, desc, notInArray } from "drizzle-orm";

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
  
  // Combat spell methods
  getCombatSpell(spellName: string): Promise<CombatSpell | undefined>;
  getAllCombatSpells(): Promise<CombatSpell[]>;
  createCombatSpell(spell: InsertCombatSpell): Promise<CombatSpell>;
  
  // Player profile methods
  getPlayerProfile(conversationId: number): Promise<PlayerProfile | undefined>;
  createPlayerProfile(profile: InsertPlayerProfile): Promise<PlayerProfile>;
  updatePlayerProfile(profileId: number, updates: Partial<InsertPlayerProfile>): Promise<PlayerProfile>;
  
  // Item methods
  getItem(itemId: string): Promise<Item | undefined>;
  getAllItems(): Promise<Item[]>;
  createItem(item: InsertItem): Promise<Item>;
  
  // Player inventory methods
  getPlayerInventory(profileId: number): Promise<PlayerInventory[]>;
  addToInventory(entry: InsertPlayerInventory): Promise<PlayerInventory>;
  updateInventoryItem(id: number, updates: Partial<InsertPlayerInventory>): Promise<PlayerInventory>;
  removeFromInventory(id: number): Promise<void>;
  
  // Companion methods
  getCompanion(companionId: string): Promise<Companion | undefined>;
  getAllCompanions(): Promise<Companion[]>;
  createCompanion(companion: InsertCompanion): Promise<Companion>;
  
  // Player companion methods
  getPlayerCompanions(profileId: number): Promise<PlayerCompanion[]>;
  addPlayerCompanion(entry: InsertPlayerCompanion): Promise<PlayerCompanion>;
  updatePlayerCompanion(id: number, updates: Partial<InsertPlayerCompanion>): Promise<PlayerCompanion>;
  
  // Quest methods
  getQuest(questId: string): Promise<Quest | undefined>;
  getAllQuests(): Promise<Quest[]>;
  createQuest(quest: InsertQuest): Promise<Quest>;
  
  // Player quest methods
  getPlayerQuests(profileId: number): Promise<PlayerQuest[]>;
  updatePlayerQuest(id: number, updates: Partial<InsertPlayerQuest>): Promise<PlayerQuest>;
  createPlayerQuest(entry: InsertPlayerQuest): Promise<PlayerQuest>;
  
  // Map connection methods
  getMapConnections(fromLocation: string): Promise<MapConnection[]>;
  getAllMapConnections(): Promise<MapConnection[]>;
  createMapConnection(connection: InsertMapConnection): Promise<MapConnection>;
  deleteMapConnection(id: number): Promise<void>;
  
  // Encounter methods
  getEncounterTable(locationName: string): Promise<EncounterTable[]>;
  createEncounterTable(entry: InsertEncounterTable): Promise<EncounterTable>;
  
  // Creature stats methods
  getCreatureStats(creatureName: string): Promise<CreatureStats | undefined>;
  getAllCreatureStats(): Promise<CreatureStats[]>;
  createCreatureStats(stats: InsertCreatureStats): Promise<CreatureStats>;
  
  // Save slot methods
  getSaveSlots(conversationId: number): Promise<SaveSlot[]>;
  createSaveSlot(slot: InsertSaveSlot): Promise<SaveSlot>;
  updateSaveSlot(id: number, updates: Partial<InsertSaveSlot>): Promise<SaveSlot>;
  deleteSaveSlot(id: number): Promise<void>;
  
  // Battle state methods
  createBattleState(state: InsertBattleState): Promise<BattleState>;
  getBattleState(battleId: number): Promise<BattleState | undefined>;
  getBattleStateByBattleId(battleId: string): Promise<BattleState | undefined>;
  getActiveBattleForPlayer(profileId: number): Promise<BattleState | undefined>;
  updateBattleState(id: number, updates: Partial<InsertBattleState>): Promise<BattleState>;
  
  // Battle log methods
  createBattleLog(log: InsertBattleLog): Promise<BattleLog>;
  getBattleLogsForBattle(battleId: string): Promise<BattleLog[]>;
  
  // Additional player profile method
  getPlayerProfileById(profileId: number): Promise<PlayerProfile | undefined>;
  
  // Random encounter method
  getRandomEncounter(location: string): Promise<EncounterTable | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getGameState(conversationId: number): Promise<GameState | undefined> {
    const [state] = await db.select().from(game_states).where(eq(game_states.conversationId, conversationId));
    return state;
  }

  async createGameState(state: InsertGameState): Promise<GameState> {
    const [newState] = await db.insert(game_states).values([state]).returning();
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
    const [newMap] = await db.insert(location_maps).values([map]).returning();
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
    const [newSprite] = await db.insert(character_sprites).values([sprite]).returning();
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
    const [newSprite] = await db.insert(environment_sprites).values([sprite]).returning();
    return newSprite;
  }
  
  async getAllEnvironmentSprites(): Promise<EnvironmentSprite[]> {
    return db.select().from(environment_sprites);
  }
  
  async getEnvironmentSpritesByCategory(category: string): Promise<EnvironmentSprite[]> {
    return db.select().from(environment_sprites).where(eq(environment_sprites.category, category));
  }

  // ===== COMBAT SPELL METHODS =====
  
  async getCombatSpell(spellName: string): Promise<CombatSpell | undefined> {
    const [spell] = await db.select().from(combat_spells).where(eq(combat_spells.spellName, spellName));
    return spell;
  }
  
  async getAllCombatSpells(): Promise<CombatSpell[]> {
    return db.select().from(combat_spells);
  }
  
  async createCombatSpell(spell: InsertCombatSpell): Promise<CombatSpell> {
    const [newSpell] = await db.insert(combat_spells).values([spell]).returning();
    return newSpell;
  }

  // ===== PLAYER PROFILE METHODS =====
  
  async getPlayerProfile(conversationId: number): Promise<PlayerProfile | undefined> {
    const [profile] = await db.select().from(player_profiles).where(eq(player_profiles.conversationId, conversationId));
    return profile;
  }
  
  async createPlayerProfile(profile: InsertPlayerProfile): Promise<PlayerProfile> {
    const [newProfile] = await db.insert(player_profiles).values([profile]).returning();
    return newProfile;
  }
  
  async updatePlayerProfile(profileId: number, updates: Partial<InsertPlayerProfile>): Promise<PlayerProfile> {
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }
    
    const [updated] = await db
      .update(player_profiles)
      .set({ ...cleanUpdates, updatedAt: new Date() })
      .where(eq(player_profiles.id, profileId))
      .returning();
    
    if (!updated) {
      throw new Error(`Player profile not found: ${profileId}`);
    }
    
    return updated;
  }

  // ===== ITEM METHODS =====
  
  async getItem(itemId: string): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.itemId, itemId));
    return item;
  }
  
  async getAllItems(): Promise<Item[]> {
    return db.select().from(items);
  }
  
  async createItem(item: InsertItem): Promise<Item> {
    const [newItem] = await db.insert(items).values([item]).returning();
    return newItem;
  }

  // ===== PLAYER INVENTORY METHODS =====
  
  async getPlayerInventory(profileId: number): Promise<PlayerInventory[]> {
    return db.select().from(player_inventory).where(eq(player_inventory.profileId, profileId));
  }
  
  async addToInventory(entry: InsertPlayerInventory): Promise<PlayerInventory> {
    const [newEntry] = await db.insert(player_inventory).values([entry]).returning();
    return newEntry;
  }
  
  async updateInventoryItem(id: number, updates: Partial<InsertPlayerInventory>): Promise<PlayerInventory> {
    const [updated] = await db
      .update(player_inventory)
      .set(updates)
      .where(eq(player_inventory.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Inventory item not found: ${id}`);
    }
    
    return updated;
  }
  
  async removeFromInventory(id: number): Promise<void> {
    await db.delete(player_inventory).where(eq(player_inventory.id, id));
  }

  // ===== COMPANION METHODS =====
  
  async getCompanion(companionId: string): Promise<Companion | undefined> {
    const [companion] = await db.select().from(companions).where(eq(companions.companionId, companionId));
    return companion;
  }
  
  async getAllCompanions(): Promise<Companion[]> {
    return db.select().from(companions);
  }
  
  async createCompanion(companion: InsertCompanion): Promise<Companion> {
    const [newCompanion] = await db.insert(companions).values([companion]).returning();
    return newCompanion;
  }

  // ===== PLAYER COMPANION METHODS =====
  
  async getPlayerCompanions(profileId: number): Promise<PlayerCompanion[]> {
    return db.select().from(player_companions).where(eq(player_companions.profileId, profileId));
  }
  
  async addPlayerCompanion(entry: InsertPlayerCompanion): Promise<PlayerCompanion> {
    const [newEntry] = await db.insert(player_companions).values([entry]).returning();
    return newEntry;
  }
  
  async updatePlayerCompanion(id: number, updates: Partial<InsertPlayerCompanion>): Promise<PlayerCompanion> {
    const [updated] = await db
      .update(player_companions)
      .set(updates)
      .where(eq(player_companions.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Player companion not found: ${id}`);
    }
    
    return updated;
  }

  // ===== QUEST METHODS =====
  
  async getQuest(questId: string): Promise<Quest | undefined> {
    const [quest] = await db.select().from(quests).where(eq(quests.questId, questId));
    return quest;
  }
  
  async getAllQuests(): Promise<Quest[]> {
    return db.select().from(quests);
  }
  
  async createQuest(quest: InsertQuest): Promise<Quest> {
    const [newQuest] = await db.insert(quests).values([quest]).returning();
    return newQuest;
  }

  // ===== PLAYER QUEST METHODS =====
  
  async getPlayerQuests(profileId: number): Promise<PlayerQuest[]> {
    return db.select().from(player_quests).where(eq(player_quests.profileId, profileId));
  }
  
  async createPlayerQuest(entry: InsertPlayerQuest): Promise<PlayerQuest> {
    const [newEntry] = await db.insert(player_quests).values([entry]).returning();
    return newEntry;
  }
  
  async updatePlayerQuest(id: number, updates: Partial<InsertPlayerQuest>): Promise<PlayerQuest> {
    const [updated] = await db
      .update(player_quests)
      .set(updates)
      .where(eq(player_quests.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Player quest not found: ${id}`);
    }
    
    return updated;
  }

  // ===== MAP CONNECTION METHODS =====
  
  async getMapConnections(fromLocation: string): Promise<MapConnection[]> {
    return db.select().from(map_connections).where(eq(map_connections.fromLocation, fromLocation));
  }
  
  async getAllMapConnections(): Promise<MapConnection[]> {
    return db.select().from(map_connections);
  }
  
  async createMapConnection(connection: InsertMapConnection): Promise<MapConnection> {
    const [newConnection] = await db.insert(map_connections).values([connection]).returning();
    return newConnection;
  }
  
  async deleteMapConnection(id: number): Promise<void> {
    await db.delete(map_connections).where(eq(map_connections.id, id));
  }

  // ===== ENCOUNTER TABLE METHODS =====
  
  async getEncounterTable(locationName: string): Promise<EncounterTable[]> {
    return db.select().from(encounter_tables).where(eq(encounter_tables.locationName, locationName));
  }
  
  async createEncounterTable(entry: InsertEncounterTable): Promise<EncounterTable> {
    const [newEntry] = await db.insert(encounter_tables).values([entry]).returning();
    return newEntry;
  }

  // ===== CREATURE STATS METHODS =====
  
  async getCreatureStats(creatureName: string): Promise<CreatureStats | undefined> {
    const [stats] = await db.select().from(creature_stats).where(eq(creature_stats.creatureName, creatureName));
    return stats;
  }
  
  async getAllCreatureStats(): Promise<CreatureStats[]> {
    return db.select().from(creature_stats);
  }
  
  async createCreatureStats(stats: InsertCreatureStats): Promise<CreatureStats> {
    const [newStats] = await db.insert(creature_stats).values([stats]).returning();
    return newStats;
  }

  // ===== SAVE SLOT METHODS =====
  
  async getSaveSlots(conversationId: number): Promise<SaveSlot[]> {
    return db.select().from(save_slots).where(eq(save_slots.conversationId, conversationId));
  }
  
  async createSaveSlot(slot: InsertSaveSlot): Promise<SaveSlot> {
    const [newSlot] = await db.insert(save_slots).values([slot]).returning();
    return newSlot;
  }
  
  async updateSaveSlot(id: number, updates: Partial<InsertSaveSlot>): Promise<SaveSlot> {
    const [updated] = await db
      .update(save_slots)
      .set({ ...updates, timestamp: new Date() })
      .where(eq(save_slots.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Save slot not found: ${id}`);
    }
    
    return updated;
  }
  
  async deleteSaveSlot(id: number): Promise<void> {
    await db.delete(save_slots).where(eq(save_slots.id, id));
  }

  // ===== BATTLE STATE METHODS =====
  
  async createBattleState(state: InsertBattleState): Promise<BattleState> {
    const [newState] = await db.insert(battle_states).values([state]).returning();
    return newState;
  }
  
  async getBattleState(id: number): Promise<BattleState | undefined> {
    const [state] = await db.select().from(battle_states).where(eq(battle_states.id, id));
    return state;
  }
  
  async getBattleStateByBattleId(battleId: string): Promise<BattleState | undefined> {
    const [state] = await db.select().from(battle_states).where(eq(battle_states.battleId, battleId));
    return state;
  }
  
  async getActiveBattleForPlayer(profileId: number): Promise<BattleState | undefined> {
    // Find any battle that is not in a terminal phase (victory, defeat, flee)
    const terminalPhases = ["victory", "defeat", "flee"];
    const [state] = await db
      .select()
      .from(battle_states)
      .where(
        and(
          eq(battle_states.profileId, profileId),
          notInArray(battle_states.phase, terminalPhases)
        )
      )
      .orderBy(desc(battle_states.startedAt))
      .limit(1);
    return state;
  }
  
  async updateBattleState(id: number, updates: Partial<InsertBattleState>): Promise<BattleState> {
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }
    
    const [updated] = await db
      .update(battle_states)
      .set({ ...cleanUpdates, lastActionAt: new Date() })
      .where(eq(battle_states.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Battle state not found: ${id}`);
    }
    
    return updated;
  }

  // ===== BATTLE LOG METHODS =====
  
  async createBattleLog(log: InsertBattleLog): Promise<BattleLog> {
    const [newLog] = await db.insert(battle_logs).values([log]).returning();
    return newLog;
  }
  
  async getBattleLogsForBattle(battleId: string): Promise<BattleLog[]> {
    return db
      .select()
      .from(battle_logs)
      .where(eq(battle_logs.battleId, battleId))
      .orderBy(battle_logs.turnNumber, battle_logs.timestamp);
  }

  // ===== ADDITIONAL PLAYER PROFILE METHOD =====
  
  async getPlayerProfileById(profileId: number): Promise<PlayerProfile | undefined> {
    const [profile] = await db.select().from(player_profiles).where(eq(player_profiles.id, profileId));
    return profile;
  }

  // ===== RANDOM ENCOUNTER METHOD =====
  
  async getRandomEncounter(location: string): Promise<EncounterTable | undefined> {
    const encounters = await db
      .select()
      .from(encounter_tables)
      .where(eq(encounter_tables.locationName, location));
    
    if (encounters.length === 0) {
      return undefined;
    }
    
    const totalRate = encounters.reduce((sum, e) => sum + (e.encounterRate || 10), 0);
    let roll = Math.random() * totalRate;
    
    for (const encounter of encounters) {
      roll -= encounter.encounterRate || 10;
      if (roll <= 0) {
        return encounter;
      }
    }
    
    return encounters[0];
  }
}

export const storage = new DatabaseStorage();
