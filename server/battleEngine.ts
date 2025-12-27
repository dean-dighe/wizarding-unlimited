/**
 * Pokemon-style Combat Engine for Hogwarts Unlimited RPG
 * Handles turn-based combat with type effectiveness, status effects, and PP management
 */

import {
  type CombatantState,
  type CombatSpell,
  type MagicalDiscipline,
  type StatusEffect,
  type BattlePhase,
  type BattleState,
  type BattleLog,
  type InsertBattleLog,
  type PlayerStats,
  type CreatureStats,
  type PlayerProfile,
  DISCIPLINE_EFFECTIVENESS,
} from "@shared/schema";
import { storage } from "./storage";
import { v4 as uuidv4 } from "uuid";

// ===== PURE HELPER FUNCTIONS =====

/**
 * Calculate type effectiveness multiplier using the DISCIPLINE_EFFECTIVENESS matrix
 */
export function getTypeMultiplier(
  attackerDiscipline: MagicalDiscipline,
  defenderDiscipline: MagicalDiscipline
): number {
  const attackerEffectiveness = DISCIPLINE_EFFECTIVENESS[attackerDiscipline];
  
  if (!attackerEffectiveness) {
    return 1.0;
  }
  
  if (attackerEffectiveness.strongAgainst.includes(defenderDiscipline)) {
    return 2.0;
  }
  
  if (attackerEffectiveness.weakAgainst.includes(defenderDiscipline)) {
    return 0.5;
  }
  
  return 1.0;
}

/**
 * Get effectiveness description for battle log
 */
export function getEffectivenessText(multiplier: number): string {
  if (multiplier >= 2.0) {
    return "super_effective";
  } else if (multiplier <= 0.5) {
    return "not_very_effective";
  }
  return "normal";
}

/**
 * Calculate damage using Pokemon-style formula
 * damage = baseDamage * (attack/defense) * typeMultiplier * critMultiplier * random(0.85-1.0)
 */
export function calculateDamage(
  spell: CombatSpell,
  attacker: CombatantState,
  defender: CombatantState
): { damage: number; isCritical: boolean; effectiveness: string } {
  if (spell.baseDamage === 0 || spell.baseDamage === null) {
    return { damage: 0, isCritical: false, effectiveness: "normal" };
  }
  
  const baseDamage = spell.baseDamage;
  const attackStat = attacker.stats.attack;
  const defenseStat = defender.stats.defense;
  
  const atkDefRatio = attackStat / Math.max(defenseStat, 1);
  
  const typeMultiplier = getTypeMultiplier(
    spell.discipline as MagicalDiscipline,
    defender.discipline || "creatures"
  );
  
  const critChance = attacker.stats.critChance + (spell.critBonus || 0);
  const isCritical = Math.random() * 100 < critChance;
  const critMultiplier = isCritical ? 1.5 : 1.0;
  
  const randomFactor = 0.85 + Math.random() * 0.15;
  
  let damage = Math.floor(
    baseDamage * atkDefRatio * typeMultiplier * critMultiplier * randomFactor
  );
  
  if (hasStatusEffect(defender, "shielded")) {
    damage = Math.floor(damage * 0.5);
  }
  
  damage = Math.max(1, damage);
  
  return {
    damage,
    isCritical,
    effectiveness: getEffectivenessText(typeMultiplier),
  };
}

/**
 * Check if accuracy check passes
 */
export function checkAccuracy(
  spell: CombatSpell,
  attacker: CombatantState,
  defender: CombatantState
): boolean {
  const baseAccuracy = spell.accuracy || 95;
  const attackerAccuracyMod = attacker.stats.accuracy - 90;
  const defenderEvasion = defender.stats.evasion;
  
  let finalAccuracy = baseAccuracy + attackerAccuracyMod - defenderEvasion;
  
  if (hasStatusEffect(attacker, "blessed")) {
    finalAccuracy += 20;
  }
  
  if (hasStatusEffect(defender, "invisible")) {
    finalAccuracy -= 30;
  }
  
  finalAccuracy = Math.max(10, Math.min(100, finalAccuracy));
  
  return Math.random() * 100 < finalAccuracy;
}

/**
 * Roll for status effect application
 */
export function tryApplyStatus(
  spell: CombatSpell,
  target: CombatantState
): StatusEffect | null {
  if (!spell.statusEffect || !spell.statusChance) {
    return null;
  }
  
  if (hasStatusEffect(target, spell.statusEffect)) {
    return null;
  }
  
  if (Math.random() * 100 < spell.statusChance) {
    return spell.statusEffect;
  }
  
  return null;
}

/**
 * Check if combatant has a specific status effect
 */
export function hasStatusEffect(
  combatant: CombatantState,
  effect: StatusEffect
): boolean {
  return combatant.statusEffects.some((se) => se.effect === effect);
}

/**
 * Apply a status effect to a combatant
 */
export function applyStatusEffect(
  combatant: CombatantState,
  effect: StatusEffect,
  duration: number = 3
): CombatantState {
  if (hasStatusEffect(combatant, effect)) {
    return combatant;
  }
  
  return {
    ...combatant,
    statusEffects: [
      ...combatant.statusEffects,
      { effect, turnsRemaining: duration },
    ],
  };
}

/**
 * Process end-of-turn status effects (damage over time, duration ticks)
 */
export function processStatusEffects(combatant: CombatantState): {
  damage: number;
  expiredEffects: string[];
  newState: CombatantState;
} {
  let totalDamage = 0;
  const expiredEffects: string[] = [];
  const maxHp = combatant.maxHp;
  
  const newStatusEffects = combatant.statusEffects
    .map((se) => {
      if (se.effect === "burning") {
        totalDamage += Math.floor(maxHp * 0.0625);
      }
      
      if (se.effect === "poisoned") {
        totalDamage += Math.floor(maxHp * 0.0833);
      }
      
      const newTurns = se.turnsRemaining - 1;
      if (newTurns <= 0) {
        expiredEffects.push(se.effect);
        return null;
      }
      
      return { ...se, turnsRemaining: newTurns };
    })
    .filter((se): se is { effect: StatusEffect; turnsRemaining: number } => se !== null);
  
  const newHp = Math.max(0, combatant.currentHp - totalDamage);
  
  return {
    damage: totalDamage,
    expiredEffects,
    newState: {
      ...combatant,
      currentHp: newHp,
      statusEffects: newStatusEffects,
    },
  };
}

/**
 * Determine turn order based on speed stats and spell priority
 */
export function calculateTurnOrder(
  player: CombatantState,
  enemy: CombatantState,
  companions: CombatantState[]
): string[] {
  const combatants: { name: string; speed: number }[] = [
    { name: player.name, speed: player.stats.speed },
    { name: enemy.name, speed: enemy.stats.speed },
    ...companions.map((c) => ({ name: c.name, speed: c.stats.speed })),
  ];
  
  combatants.sort((a, b) => {
    if (b.speed !== a.speed) {
      return b.speed - a.speed;
    }
    return Math.random() - 0.5;
  });
  
  return combatants.map((c) => c.name);
}

/**
 * Check if a combatant can act this turn (not stunned, frozen, etc.)
 */
export function canAct(combatant: CombatantState): {
  canAct: boolean;
  reason?: string;
} {
  if (combatant.currentHp <= 0) {
    return { canAct: false, reason: `${combatant.name} has fainted!` };
  }
  
  if (hasStatusEffect(combatant, "stunned")) {
    return { canAct: false, reason: `${combatant.name} is stunned and cannot move!` };
  }
  
  if (hasStatusEffect(combatant, "frozen")) {
    if (Math.random() < 0.25) {
      return { canAct: false, reason: `${combatant.name} is frozen solid!` };
    }
  }
  
  if (hasStatusEffect(combatant, "confused")) {
    if (Math.random() < 0.33) {
      return { canAct: false, reason: `${combatant.name} is confused and hurt themselves!` };
    }
  }
  
  if (hasStatusEffect(combatant, "silenced")) {
    return { canAct: true, reason: `${combatant.name} is silenced! Only physical attacks available.` };
  }
  
  return { canAct: true };
}

/**
 * Check if combatant has enough PP for a spell
 */
export function hasSufficientPP(
  combatant: CombatantState,
  spellName: string,
  spell: CombatSpell
): boolean {
  const currentPP = combatant.currentPp[spellName] ?? spell.maxPP ?? 20;
  return currentPP >= (spell.ppCost ?? 5);
}

/**
 * Consume PP for using a spell
 */
export function consumePP(
  combatant: CombatantState,
  spellName: string,
  spell: CombatSpell
): CombatantState {
  const currentPP = combatant.currentPp[spellName] ?? spell.maxPP ?? 20;
  const cost = spell.ppCost ?? 5;
  
  return {
    ...combatant,
    currentPp: {
      ...combatant.currentPp,
      [spellName]: Math.max(0, currentPP - cost),
    },
  };
}

// ===== AI OPPONENT LOGIC =====

/**
 * AI spell selection with priority scoring
 */
export async function selectEnemyAction(
  enemy: CombatantState,
  player: CombatantState,
  spells: CombatSpell[]
): Promise<{
  actionType: "spell" | "item";
  spellName?: string;
  priority: number;
}> {
  if (spells.length === 0) {
    return { actionType: "spell", spellName: "struggle", priority: -999 };
  }
  
  const scoredSpells: { spell: CombatSpell; score: number }[] = [];
  
  for (const spell of spells) {
    let score = 0;
    
    if (!hasSufficientPP(enemy, spell.spellName, spell)) {
      score = -100;
      scoredSpells.push({ spell, score });
      continue;
    }
    
    if (spell.baseDamage && spell.baseDamage > 0) {
      const { damage } = calculateDamage(spell, enemy, player);
      if (damage >= player.currentHp) {
        score += 50;
      }
    }
    
    const typeMultiplier = getTypeMultiplier(
      spell.discipline as MagicalDiscipline,
      player.discipline || "charms"
    );
    
    if (typeMultiplier >= 2.0) {
      score += 30;
    } else if (typeMultiplier <= 0.5) {
      score -= 20;
    }
    
    if (spell.statusEffect && spell.statusChance) {
      if (player.currentHp > player.maxHp * 0.5) {
        score += 15;
      }
      if (hasStatusEffect(player, spell.statusEffect)) {
        score -= 20;
      }
    }
    
    if (spell.healAmount && spell.healAmount > 0) {
      const hpPercent = enemy.currentHp / enemy.maxHp;
      if (hpPercent < 0.3) {
        score += 40;
      } else if (hpPercent < 0.5) {
        score += 20;
      } else {
        score -= 10;
      }
    }
    
    score += spell.priority || 0;
    
    score += (Math.random() - 0.5) * 10;
    
    scoredSpells.push({ spell, score });
  }
  
  scoredSpells.sort((a, b) => b.score - a.score);
  
  const bestSpell = scoredSpells[0];
  
  return {
    actionType: "spell",
    spellName: bestSpell.spell.spellName,
    priority: bestSpell.spell.priority || 0,
  };
}

// ===== BATTLE STATE MANAGEMENT =====

export interface BattleContext {
  battleId: string;
  playerState: CombatantState;
  enemyState: CombatantState;
  companionStates: CombatantState[];
  turnOrder: string[];
  currentTurn: number;
  phase: BattlePhase;
  logs: BattleLogEntry[];
  locationName: string;
  canFlee: boolean;
}

export interface BattleLogEntry {
  turnNumber: number;
  actorName: string;
  actionType: string;
  actionTarget?: string;
  spellUsed?: string;
  itemUsed?: string;
  damage?: number;
  healing?: number;
  statusApplied?: StatusEffect;
  isCritical?: boolean;
  isMiss?: boolean;
  message: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  damage?: number;
  healing?: number;
  isCritical?: boolean;
  effectiveness?: string;
  statusApplied?: StatusEffect;
  targetFainted?: boolean;
  battleEnded?: boolean;
  outcome?: "victory" | "defeat" | "flee";
}

export interface BattleRewards {
  experienceGained: number;
  galleonsGained: number;
  itemsDropped: { itemId: string; quantity: number }[];
  leveledUp: boolean;
  newLevel?: number;
}

/**
 * Create initial combatant state from player profile
 */
export function createPlayerCombatant(profile: PlayerProfile): CombatantState {
  const stats = profile.stats as PlayerStats;
  const equippedSpells = profile.equippedSpells || [];
  
  const currentPp: Record<string, number> = {};
  for (const spellName of equippedSpells) {
    currentPp[spellName] = 20;
  }
  
  return {
    name: profile.playerName,
    isPlayer: true,
    currentHp: stats.currentHp,
    maxHp: stats.maxHp,
    currentPp,
    stats,
    equippedSpells,
    statusEffects: [],
    level: profile.level ?? 1,
    discipline: "charms",
  };
}

/**
 * Create initial combatant state from creature stats
 */
export function createCreatureCombatant(
  creature: CreatureStats,
  level?: number
): CombatantState {
  const baseStats = creature.stats as PlayerStats;
  const actualLevel = level || creature.baseLevel || 1;
  
  const levelMultiplier = 1 + (actualLevel - 1) * 0.1;
  const scaledStats: PlayerStats = {
    maxHp: Math.floor(baseStats.maxHp * levelMultiplier),
    currentHp: Math.floor(baseStats.maxHp * levelMultiplier),
    attack: Math.floor(baseStats.attack * levelMultiplier),
    defense: Math.floor(baseStats.defense * levelMultiplier),
    speed: Math.floor(baseStats.speed * levelMultiplier),
    accuracy: baseStats.accuracy,
    evasion: baseStats.evasion,
    critChance: baseStats.critChance,
  };
  
  const knownSpells = creature.knownSpells || [];
  const currentPp: Record<string, number> = {};
  for (const spellName of knownSpells) {
    currentPp[spellName] = 20;
  }
  
  return {
    name: creature.displayName || creature.creatureName,
    isPlayer: false,
    currentHp: scaledStats.currentHp,
    maxHp: scaledStats.maxHp,
    currentPp,
    stats: scaledStats,
    equippedSpells: knownSpells,
    statusEffects: [],
    level: actualLevel,
    discipline: (creature.discipline as MagicalDiscipline) || "creatures",
  };
}

/**
 * Initialize a new battle
 */
export async function initializeBattle(
  profileId: number,
  enemyType: string | null,
  location: string
): Promise<BattleContext> {
  const profile = await storage.getPlayerProfileById(profileId);
  if (!profile) {
    throw new Error("Player profile not found");
  }
  
  let creature: CreatureStats | undefined;
  let encounterLevel: number | undefined;
  
  if (enemyType) {
    creature = await storage.getCreatureStats(enemyType);
  } else {
    const encounter = await storage.getRandomEncounter(location);
    if (encounter) {
      creature = await storage.getCreatureStats(encounter.creatureName);
      encounterLevel = Math.floor(
        (encounter.minLevel || 1) +
          Math.random() * ((encounter.maxLevel || 5) - (encounter.minLevel || 1))
      );
    }
  }
  
  if (!creature) {
    throw new Error("No creature found for encounter");
  }
  
  const playerState = createPlayerCombatant(profile);
  const enemyState = createCreatureCombatant(creature, encounterLevel);
  
  const turnOrder = calculateTurnOrder(playerState, enemyState, []);
  
  const battleId = uuidv4();
  
  const battleState = await storage.createBattleState({
    profileId,
    battleId,
    phase: "intro",
    turnNumber: 1,
    playerState,
    enemyState,
    companionStates: [],
    currentTurnOrder: turnOrder,
    locationName: location,
    encounterType: "wild",
    canFlee: !creature.isBoss,
  });
  
  return {
    battleId,
    playerState,
    enemyState,
    companionStates: [],
    turnOrder,
    currentTurn: 1,
    phase: "intro",
    logs: [],
    locationName: location,
    canFlee: !creature.isBoss,
  };
}

/**
 * Execute a combat action
 */
export async function executeAction(
  battleId: string,
  actorName: string,
  action: { type: "spell" | "item" | "flee"; spellName?: string; itemId?: string }
): Promise<{ battle: BattleContext; result: ActionResult }> {
  const battleState = await storage.getBattleStateByBattleId(battleId);
  if (!battleState) {
    throw new Error("Battle not found");
  }
  
  let playerState = battleState.playerState as CombatantState;
  let enemyState = battleState.enemyState as CombatantState;
  const companionStates = (battleState.companionStates || []) as CombatantState[];
  let turnNumber = battleState.turnNumber || 1;
  let phase = battleState.phase as BattlePhase;
  
  const isPlayer = actorName === playerState.name;
  const actor = isPlayer ? playerState : enemyState;
  const target = isPlayer ? enemyState : playerState;
  
  const canActResult = canAct(actor);
  if (!canActResult.canAct) {
    const skipLog: BattleLogEntry = {
      turnNumber,
      actorName,
      actionType: "skip",
      message: canActResult.reason || `${actorName} cannot act!`,
    };
    
    await storage.createBattleLog({
      battleId,
      turnNumber,
      actorName,
      actionType: "skip",
      message: canActResult.reason || `${actorName} cannot act!`,
    });
    
    return {
      battle: {
        battleId,
        playerState,
        enemyState,
        companionStates,
        turnOrder: battleState.currentTurnOrder || [],
        currentTurn: turnNumber,
        phase,
        logs: [skipLog],
        locationName: battleState.locationName || "",
        canFlee: battleState.canFlee ?? true,
      },
      result: {
        success: false,
        message: canActResult.reason || `${actorName} cannot act!`,
      },
    };
  }
  
  let result: ActionResult;
  const logs: BattleLogEntry[] = [];
  
  if (action.type === "flee") {
    if (!battleState.canFlee) {
      result = { success: false, message: "Cannot flee from this battle!" };
    } else {
      const fleeChance = 50 + (playerState.stats.speed - enemyState.stats.speed);
      const fleeSuccess = Math.random() * 100 < fleeChance;
      
      if (fleeSuccess) {
        phase = "flee";
        result = { success: true, message: "Got away safely!", battleEnded: true, outcome: "flee" };
      } else {
        result = { success: false, message: "Couldn't get away!" };
      }
    }
    
    logs.push({
      turnNumber,
      actorName,
      actionType: "flee",
      message: result.message,
    });
  } else if (action.type === "spell" && action.spellName) {
    const spell = await storage.getCombatSpell(action.spellName);
    if (!spell) {
      result = { success: false, message: "Spell not found!" };
    } else if (!hasSufficientPP(actor, action.spellName, spell)) {
      result = { success: false, message: "Not enough PP!" };
    } else {
      if (isPlayer) {
        playerState = consumePP(playerState, action.spellName, spell);
      } else {
        enemyState = consumePP(enemyState, action.spellName, spell);
      }
      
      const accuracyPassed = checkAccuracy(spell, actor, target);
      
      if (!accuracyPassed) {
        result = { success: true, message: `${actorName}'s attack missed!`, isCritical: false };
        logs.push({
          turnNumber,
          actorName,
          actionType: "spell",
          spellUsed: action.spellName,
          actionTarget: target.name,
          isMiss: true,
          message: `${actorName} used ${spell.displayName} but it missed!`,
        });
      } else {
        const damageResult = calculateDamage(spell, actor, target);
        const newTargetHp = Math.max(0, target.currentHp - damageResult.damage);
        
        if (isPlayer) {
          enemyState = { ...enemyState, currentHp: newTargetHp };
        } else {
          playerState = { ...playerState, currentHp: newTargetHp };
        }
        
        let statusApplied: StatusEffect | null = null;
        if (damageResult.damage > 0 || spell.statusEffect) {
          statusApplied = tryApplyStatus(spell, isPlayer ? enemyState : playerState);
          if (statusApplied) {
            if (isPlayer) {
              enemyState = applyStatusEffect(enemyState, statusApplied);
            } else {
              playerState = applyStatusEffect(playerState, statusApplied);
            }
          }
        }
        
        if (spell.healAmount && spell.healAmount > 0) {
          const healTarget = spell.targetType === "self" ? actor : target;
          const newHp = Math.min(healTarget.maxHp, healTarget.currentHp + spell.healAmount);
          if (spell.targetType === "self") {
            if (isPlayer) {
              playerState = { ...playerState, currentHp: newHp };
            } else {
              enemyState = { ...enemyState, currentHp: newHp };
            }
          }
        }
        
        let message = `${actorName} used ${spell.displayName}!`;
        if (damageResult.damage > 0) {
          message += ` It dealt ${damageResult.damage} damage!`;
          if (damageResult.isCritical) {
            message += " A critical hit!";
          }
          if (damageResult.effectiveness === "super_effective") {
            message += " It's super effective!";
          } else if (damageResult.effectiveness === "not_very_effective") {
            message += " It's not very effective...";
          }
        }
        if (statusApplied) {
          message += ` ${target.name} is now ${statusApplied}!`;
        }
        
        const targetFainted = newTargetHp <= 0;
        if (targetFainted) {
          message += ` ${target.name} fainted!`;
          phase = isPlayer ? "victory" : "defeat";
        }
        
        result = {
          success: true,
          message,
          damage: damageResult.damage,
          isCritical: damageResult.isCritical,
          effectiveness: damageResult.effectiveness,
          statusApplied: statusApplied || undefined,
          targetFainted,
          battleEnded: targetFainted,
          outcome: targetFainted ? (isPlayer ? "victory" : "defeat") : undefined,
        };
        
        logs.push({
          turnNumber,
          actorName,
          actionType: "spell",
          spellUsed: action.spellName,
          actionTarget: target.name,
          damage: damageResult.damage,
          isCritical: damageResult.isCritical,
          statusApplied: statusApplied || undefined,
          message,
        });
      }
    }
  } else if (action.type === "item" && action.itemId) {
    const item = await storage.getItem(action.itemId);
    if (!item) {
      result = { success: false, message: "Item not found!" };
    } else if (!item.usableInBattle) {
      result = { success: false, message: "Can't use that item in battle!" };
    } else {
      const effect = item.effect as { healHp?: number; healPp?: number; cureStatus?: StatusEffect[] } | null;
      let message = `${actorName} used ${item.displayName}!`;
      
      if (effect?.healHp) {
        const newHp = Math.min(playerState.maxHp, playerState.currentHp + effect.healHp);
        playerState = { ...playerState, currentHp: newHp };
        message += ` Restored ${effect.healHp} HP!`;
      }
      
      if (effect?.cureStatus && effect.cureStatus.length > 0) {
        playerState = {
          ...playerState,
          statusEffects: playerState.statusEffects.filter(
            (se) => !effect.cureStatus!.includes(se.effect)
          ),
        };
        message += ` Cured status effects!`;
      }
      
      result = { success: true, message, healing: effect?.healHp };
      
      logs.push({
        turnNumber,
        actorName,
        actionType: "item",
        itemUsed: action.itemId,
        healing: effect?.healHp,
        message,
      });
    }
  } else {
    result = { success: false, message: "Invalid action!" };
  }
  
  for (const log of logs) {
    await storage.createBattleLog({
      battleId,
      turnNumber: log.turnNumber,
      actorName: log.actorName,
      actionType: log.actionType,
      actionTarget: log.actionTarget,
      spellUsed: log.spellUsed,
      itemUsed: log.itemUsed,
      damage: log.damage,
      healing: log.healing,
      statusApplied: log.statusApplied,
      isCritical: log.isCritical,
      isMiss: log.isMiss,
      message: log.message,
    });
  }
  
  await storage.updateBattleState(battleState.id, {
    phase,
    turnNumber,
    playerState,
    enemyState,
    companionStates,
    lastActionAt: new Date(),
  });
  
  return {
    battle: {
      battleId,
      playerState,
      enemyState,
      companionStates,
      turnOrder: battleState.currentTurnOrder || [],
      currentTurn: turnNumber,
      phase,
      logs,
      locationName: battleState.locationName || "",
      canFlee: battleState.canFlee ?? true,
    },
    result,
  };
}

/**
 * Execute AI turn
 */
export async function executeAITurn(battleId: string): Promise<{
  battle: BattleContext;
  result: ActionResult;
}> {
  const battleState = await storage.getBattleStateByBattleId(battleId);
  if (!battleState) {
    throw new Error("Battle not found");
  }
  
  const enemyState = battleState.enemyState as CombatantState;
  const playerState = battleState.playerState as CombatantState;
  
  if (enemyState.currentHp <= 0 || playerState.currentHp <= 0) {
    return {
      battle: {
        battleId,
        playerState,
        enemyState,
        companionStates: (battleState.companionStates || []) as CombatantState[],
        turnOrder: battleState.currentTurnOrder || [],
        currentTurn: battleState.turnNumber || 1,
        phase: battleState.phase as BattlePhase,
        logs: [],
        locationName: battleState.locationName || "",
        canFlee: battleState.canFlee ?? true,
      },
      result: { success: false, message: "Battle already ended" },
    };
  }
  
  const spells: CombatSpell[] = [];
  for (const spellName of enemyState.equippedSpells) {
    const spell = await storage.getCombatSpell(spellName);
    if (spell) {
      spells.push(spell);
    }
  }
  
  const aiAction = await selectEnemyAction(enemyState, playerState, spells);
  
  return executeAction(battleId, enemyState.name, {
    type: aiAction.actionType,
    spellName: aiAction.spellName,
  });
}

/**
 * Finalize battle and distribute rewards
 */
export async function endBattle(
  battleId: string,
  outcome: "victory" | "defeat" | "flee"
): Promise<BattleRewards> {
  const battleState = await storage.getBattleStateByBattleId(battleId);
  if (!battleState) {
    throw new Error("Battle not found");
  }
  
  const rewards: BattleRewards = {
    experienceGained: 0,
    galleonsGained: 0,
    itemsDropped: [],
    leveledUp: false,
  };
  
  if (outcome === "victory") {
    const enemyState = battleState.enemyState as CombatantState;
    const creatureName = enemyState.name.toLowerCase().replace(/\s+/g, "_");
    const creature = await storage.getCreatureStats(creatureName);
    
    if (creature) {
      rewards.experienceGained = creature.experienceYield || 20;
      rewards.galleonsGained = creature.galleonYield || 5;
      
      const dropTable = creature.dropTable as { itemId: string; chance: number }[] | null;
      if (dropTable) {
        for (const drop of dropTable) {
          if (Math.random() * 100 < drop.chance) {
            rewards.itemsDropped.push({ itemId: drop.itemId, quantity: 1 });
          }
        }
      }
    } else {
      rewards.experienceGained = enemyState.level * 15;
      rewards.galleonsGained = enemyState.level * 3;
    }
    
    const profile = await storage.getPlayerProfileById(battleState.profileId);
    if (profile) {
      const newExp = (profile.experience || 0) + rewards.experienceGained;
      const expToNext = profile.experienceToNext || 100;
      
      let newLevel = profile.level || 1;
      let remainingExp = newExp;
      let currentExpToNext = expToNext;
      
      while (remainingExp >= currentExpToNext) {
        remainingExp -= currentExpToNext;
        newLevel++;
        currentExpToNext = Math.floor(currentExpToNext * 1.2);
        rewards.leveledUp = true;
        rewards.newLevel = newLevel;
      }
      
      const stats = profile.stats as PlayerStats;
      const newStats = rewards.leveledUp
        ? {
            ...stats,
            maxHp: stats.maxHp + (newLevel - (profile.level || 1)) * 10,
            attack: stats.attack + (newLevel - (profile.level || 1)) * 2,
            defense: stats.defense + (newLevel - (profile.level || 1)) * 2,
            speed: stats.speed + (newLevel - (profile.level || 1)) * 1,
          }
        : stats;
      
      await storage.updatePlayerProfile(profile.id, {
        experience: remainingExp,
        experienceToNext: currentExpToNext,
        level: newLevel,
        galleons: (profile.galleons || 0) + rewards.galleonsGained,
        battlesWon: (profile.battlesWon || 0) + 1,
        creaturesDefeated: (profile.creaturesDefeated || 0) + 1,
        stats: newStats,
      });
    }
  }
  
  await storage.updateBattleState(battleState.id, {
    phase: outcome,
  });
  
  return rewards;
}

/**
 * Get full turn with status effect processing
 */
export async function processTurnEnd(battleId: string): Promise<{
  playerStatusDamage: number;
  enemyStatusDamage: number;
  playerExpiredEffects: string[];
  enemyExpiredEffects: string[];
  battleEnded: boolean;
  outcome?: "victory" | "defeat";
}> {
  const battleState = await storage.getBattleStateByBattleId(battleId);
  if (!battleState) {
    throw new Error("Battle not found");
  }
  
  let playerState = battleState.playerState as CombatantState;
  let enemyState = battleState.enemyState as CombatantState;
  
  const playerResult = processStatusEffects(playerState);
  const enemyResult = processStatusEffects(enemyState);
  
  playerState = playerResult.newState;
  enemyState = enemyResult.newState;
  
  let battleEnded = false;
  let outcome: "victory" | "defeat" | undefined;
  
  if (playerState.currentHp <= 0) {
    battleEnded = true;
    outcome = "defeat";
  } else if (enemyState.currentHp <= 0) {
    battleEnded = true;
    outcome = "victory";
  }
  
  await storage.updateBattleState(battleState.id, {
    playerState,
    enemyState,
    turnNumber: (battleState.turnNumber || 1) + 1,
    phase: battleEnded ? outcome : "player_turn",
  });
  
  return {
    playerStatusDamage: playerResult.damage,
    enemyStatusDamage: enemyResult.damage,
    playerExpiredEffects: playerResult.expiredEffects,
    enemyExpiredEffects: enemyResult.expiredEffects,
    battleEnded,
    outcome,
  };
}
