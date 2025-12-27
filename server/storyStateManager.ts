/**
 * Story State Manager
 * Processes story choice effects from AI narratives and updates the game world
 * Handles: map connections, NPC locations, world state flags, quest triggers
 */

import { storage } from "./storage";
import type {
  InsertWorldStateFlag,
  InsertNpcLocation,
  InsertMapConnection,
  WorldStateFlag,
  StoryChoiceEffect,
  NpcLocation,
  MapConnection,
} from "@shared/schema";

export type EffectType = 
  | "unlock_connection"
  | "lock_connection"
  | "move_npc"
  | "set_flag"
  | "clear_flag"
  | "start_quest"
  | "complete_quest"
  | "spawn_encounter"
  | "trigger_event";

export interface StoryEffect {
  type: EffectType;
  target: string;
  value?: string | number | boolean | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface StoryChoiceResult {
  choiceId: string;
  choiceText: string;
  effects: StoryEffect[];
  narrativeContext?: string;
}

export interface WorldStateSnapshot {
  flags: WorldStateFlag[];
  npcLocations: NpcLocation[];
  activeEffects: StoryChoiceEffect[];
}

export async function processStoryChoice(
  profileId: number,
  choice: StoryChoiceResult
): Promise<{ success: boolean; appliedEffects: string[]; errors: string[] }> {
  const appliedEffects: string[] = [];
  const errors: string[] = [];
  
  for (const effect of choice.effects) {
    try {
      const result = await applyEffect(profileId, choice.choiceId, effect, choice.narrativeContext);
      if (result.success) {
        appliedEffects.push(result.description);
      } else if (result.error) {
        errors.push(result.error);
      }
    } catch (error) {
      errors.push(`Failed to apply ${effect.type}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  
  return { success: errors.length === 0, appliedEffects, errors };
}

async function applyEffect(
  profileId: number,
  choiceId: string,
  effect: StoryEffect,
  narrativeContext?: string
): Promise<{ success: boolean; description: string; error?: string }> {
  switch (effect.type) {
    case "unlock_connection":
      return await unlockMapConnection(profileId, choiceId, effect, narrativeContext);
    
    case "lock_connection":
      return await lockMapConnection(profileId, choiceId, effect, narrativeContext);
    
    case "move_npc":
      return await moveNpc(profileId, choiceId, effect, narrativeContext);
    
    case "set_flag":
      return await setWorldFlag(profileId, choiceId, effect, narrativeContext);
    
    case "clear_flag":
      return await clearWorldFlag(profileId, choiceId, effect, narrativeContext);
    
    case "start_quest":
      return await startQuest(profileId, choiceId, effect, narrativeContext);
    
    case "complete_quest":
      return await completeQuest(profileId, choiceId, effect, narrativeContext);
    
    case "spawn_encounter":
      return await spawnEncounter(profileId, choiceId, effect, narrativeContext);
    
    case "trigger_event":
      return await triggerEvent(profileId, choiceId, effect, narrativeContext);
    
    default:
      return { success: false, description: "", error: `Unknown effect type: ${effect.type}` };
  }
}

async function unlockMapConnection(
  profileId: number,
  choiceId: string,
  effect: StoryEffect,
  narrativeContext?: string
): Promise<{ success: boolean; description: string; error?: string }> {
  const [fromLocation, toLocation] = effect.target.split("->");
  
  if (!fromLocation || !toLocation) {
    return { success: false, description: "", error: "Invalid connection format. Use 'from->to'" };
  }
  
  const existingConnections = await storage.getMapConnections(fromLocation.trim());
  const alreadyExists = existingConnections.some(c => c.toLocation === toLocation.trim());
  
  if (alreadyExists) {
    return { success: true, description: `Connection ${fromLocation} -> ${toLocation} already exists` };
  }
  
  const connection: InsertMapConnection = {
    fromLocation: fromLocation.trim(),
    toLocation: toLocation.trim(),
    connectionType: (effect.metadata?.connectionType as "door" | "path" | "portal" | "secret" | "stairs") || "path",
    isHidden: (effect.metadata?.isHidden as boolean) || false,
    isOneWay: (effect.metadata?.isOneWay as boolean) || false,
    transitionText: (effect.metadata?.transitionText as string) || null,
    requiresKey: (effect.metadata?.requiresKey as string) || null,
    requiredQuest: (effect.metadata?.requiredQuest as string) || null,
    requiredSigils: (effect.metadata?.requiredSigils as number) || 0,
  };
  
  const newConnection = await storage.createMapConnection(connection);
  
  await storage.createStoryChoiceEffect({
    profileId,
    choiceId,
    effectType: "unlock_connection",
    effectPayload: { 
      connectionId: newConnection.id,
      newLocation: toLocation.trim(),
    },
    narrativeContext,
    isReverted: false,
  });
  
  return { success: true, description: `Unlocked path from ${fromLocation} to ${toLocation}` };
}

async function lockMapConnection(
  profileId: number,
  choiceId: string,
  effect: StoryEffect,
  narrativeContext?: string
): Promise<{ success: boolean; description: string; error?: string }> {
  const [fromLocation, toLocation] = effect.target.split("->");
  
  if (!fromLocation || !toLocation) {
    return { success: false, description: "", error: "Invalid connection format" };
  }
  
  const connections = await storage.getMapConnections(fromLocation.trim());
  const connection = connections.find(c => c.toLocation === toLocation.trim());
  
  if (!connection) {
    return { success: false, description: "", error: `Connection not found: ${effect.target}` };
  }
  
  await storage.deleteMapConnection(connection.id);
  
  await storage.createStoryChoiceEffect({
    profileId,
    choiceId,
    effectType: "lock_connection",
    effectPayload: { 
      connectionId: connection.id,
    },
    narrativeContext,
    isReverted: false,
  });
  
  return { success: true, description: `Locked path from ${fromLocation} to ${toLocation}` };
}

async function moveNpc(
  profileId: number,
  choiceId: string,
  effect: StoryEffect,
  narrativeContext?: string
): Promise<{ success: boolean; description: string; error?: string }> {
  const npcName = effect.target;
  const newLocation = effect.value as string;
  
  if (!newLocation) {
    return { success: false, description: "", error: "No destination location specified for NPC move" };
  }
  
  const existingNpc = await storage.getNpcLocation(profileId, npcName);
  const previousLocation = existingNpc?.currentLocation || null;
  
  const npcLocation: InsertNpcLocation = {
    profileId,
    npcName,
    currentLocation: newLocation,
    isAvailable: true,
    spawnPosition: (effect.metadata?.spawnPosition as { x: number; y: number }) || null,
    schedule: (effect.metadata?.schedule as Record<string, string>) || null,
  };
  
  await storage.setNpcLocation(npcLocation);
  
  await storage.createStoryChoiceEffect({
    profileId,
    choiceId,
    effectType: "move_npc",
    effectPayload: { 
      npcName,
      newLocation,
    },
    narrativeContext,
    isReverted: false,
  });
  
  return { success: true, description: `${npcName} moved to ${newLocation}` };
}

async function setWorldFlag(
  profileId: number,
  choiceId: string,
  effect: StoryEffect,
  narrativeContext?: string
): Promise<{ success: boolean; description: string; error?: string }> {
  const flagKey = effect.target;
  const flagValue = effect.value ?? true;
  
  const flag: InsertWorldStateFlag = {
    profileId,
    flagKey,
    flagValue: typeof flagValue === "object" ? flagValue as Record<string, unknown> : { value: flagValue },
    scope: (effect.metadata?.scope as "global" | "location" | "quest") || "global",
  };
  
  await storage.setWorldStateFlag(flag);
  
  await storage.createStoryChoiceEffect({
    profileId,
    choiceId,
    effectType: "set_flag",
    effectPayload: { 
      flagKey,
      flagValue,
    },
    narrativeContext,
    isReverted: false,
  });
  
  return { success: true, description: `Flag set: ${flagKey}` };
}

async function clearWorldFlag(
  profileId: number,
  choiceId: string,
  effect: StoryEffect,
  narrativeContext?: string
): Promise<{ success: boolean; description: string; error?: string }> {
  const flagKey = effect.target;
  
  const existingFlag = await storage.getWorldStateFlag(profileId, flagKey);
  
  if (!existingFlag) {
    return { success: true, description: `Flag ${flagKey} was not set` };
  }
  
  await storage.deleteWorldStateFlag(profileId, flagKey);
  
  await storage.createStoryChoiceEffect({
    profileId,
    choiceId,
    effectType: "clear_flag",
    effectPayload: { 
      flagKey,
    },
    narrativeContext,
    isReverted: false,
  });
  
  return { success: true, description: `Flag cleared: ${flagKey}` };
}

async function startQuest(
  profileId: number,
  choiceId: string,
  effect: StoryEffect,
  narrativeContext?: string
): Promise<{ success: boolean; description: string; error?: string }> {
  const questId = effect.target;
  
  const quest = await storage.getQuest(questId);
  if (!quest) {
    return { success: false, description: "", error: `Quest not found: ${questId}` };
  }
  
  const existingProgress = await storage.getPlayerQuests(profileId);
  const alreadyStarted = existingProgress.some(q => q.questId === questId);
  
  if (alreadyStarted) {
    return { success: true, description: `Quest ${quest.title} already in progress` };
  }
  
  await storage.createPlayerQuest({
    profileId,
    questId,
    status: "active",
    objectiveProgress: {},
  });
  
  await storage.createStoryChoiceEffect({
    profileId,
    choiceId,
    effectType: "start_quest",
    effectPayload: {},
    narrativeContext,
    isReverted: false,
  });
  
  return { success: true, description: `Started quest: ${quest.title}` };
}

async function completeQuest(
  profileId: number,
  choiceId: string,
  effect: StoryEffect,
  narrativeContext?: string
): Promise<{ success: boolean; description: string; error?: string }> {
  const questId = effect.target;
  
  const playerQuests = await storage.getPlayerQuests(profileId);
  const playerQuest = playerQuests.find(q => q.questId === questId);
  
  if (!playerQuest) {
    return { success: false, description: "", error: `Quest not active: ${questId}` };
  }
  
  await storage.updatePlayerQuest(playerQuest.id, {
    status: "completed",
    completedAt: new Date(),
  });
  
  await storage.createStoryChoiceEffect({
    profileId,
    choiceId,
    effectType: "complete_quest",
    effectPayload: {},
    narrativeContext,
    isReverted: false,
  });
  
  return { success: true, description: `Completed quest: ${questId}` };
}

async function spawnEncounter(
  profileId: number,
  choiceId: string,
  effect: StoryEffect,
  narrativeContext?: string
): Promise<{ success: boolean; description: string; error?: string }> {
  await storage.createStoryChoiceEffect({
    profileId,
    choiceId,
    effectType: "spawn_encounter",
    effectPayload: {
      encounterData: {
        creature: effect.target,
        location: (effect.value as string) || "current",
      },
    },
    narrativeContext,
    isReverted: false,
  });
  
  return { 
    success: true, 
    description: `Encounter spawned: ${effect.target}`,
  };
}

async function triggerEvent(
  profileId: number,
  choiceId: string,
  effect: StoryEffect,
  narrativeContext?: string
): Promise<{ success: boolean; description: string; error?: string }> {
  await storage.createStoryChoiceEffect({
    profileId,
    choiceId,
    effectType: "trigger_event",
    effectPayload: {},
    narrativeContext,
    isReverted: false,
  });
  
  return { success: true, description: `Event triggered: ${effect.target}` };
}

export async function getWorldState(profileId: number): Promise<WorldStateSnapshot> {
  const [flags, npcLocations, activeEffects] = await Promise.all([
    storage.getWorldStateFlags(profileId),
    storage.getNpcLocations(profileId),
    storage.getStoryChoiceEffects(profileId),
  ]);
  
  return { flags, npcLocations, activeEffects };
}

export async function checkFlag(profileId: number, flagKey: string): Promise<boolean> {
  const flag = await storage.getWorldStateFlag(profileId, flagKey);
  return flag !== undefined;
}

export async function getFlagValue(profileId: number, flagKey: string): Promise<unknown> {
  const flag = await storage.getWorldStateFlag(profileId, flagKey);
  return flag?.flagValue;
}

export async function getAvailableConnections(
  profileId: number,
  location: string
): Promise<MapConnection[]> {
  const connections = await storage.getMapConnections(location);
  const flags = await storage.getWorldStateFlags(profileId);
  
  const flagSet = new Set(flags.map(f => f.flagKey));
  
  return connections.filter(conn => {
    if (conn.requiredQuest && !flagSet.has(`quest_completed:${conn.requiredQuest}`)) return false;
    if (conn.requiresKey && !flagSet.has(`has_key:${conn.requiresKey}`)) return false;
    return true;
  });
}

export async function getNpcsAtLocation(
  profileId: number,
  location: string
): Promise<NpcLocation[]> {
  return storage.getNpcLocations(profileId, location);
}

export function parseStoryEffectsFromNarrative(narrativeJson: string): StoryEffect[] {
  try {
    const parsed = JSON.parse(narrativeJson);
    
    if (Array.isArray(parsed.effects)) {
      return parsed.effects.filter((e: StoryEffect) => 
        e.type && e.target && typeof e.type === "string"
      );
    }
    
    return [];
  } catch {
    return [];
  }
}
