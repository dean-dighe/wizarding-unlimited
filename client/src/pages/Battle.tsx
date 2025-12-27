import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import { type CombatantState, type BattlePhase, type CombatSpell } from "@shared/schema";
import { BattleScene } from "@/components/battle/BattleScene";
import { type BattleLogEntry } from "@/components/battle/BattleLog";
import { type BattleRewards } from "@/components/battle/VictoryScreen";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface BattleStateResponse {
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
  backgroundUrl?: string;
}

interface ActionResponse {
  battle: BattleStateResponse;
  result: {
    success: boolean;
    message: string;
    damage?: number;
    healing?: number;
    isCritical?: boolean;
    effectiveness?: string;
    statusApplied?: string;
    targetFainted?: boolean;
    battleEnded?: boolean;
    outcome?: "victory" | "defeat" | "flee";
  };
  aiAction?: {
    battle: BattleStateResponse;
    result: {
      message: string;
      damage?: number;
    };
  };
  turnEnd?: {
    statusDamage: number[];
    expiredEffects: string[];
  };
}

export default function Battle() {
  const params = useParams<{ battleId?: string }>();
  const [, setLocation] = useLocation();
  const [battleState, setBattleState] = useState<BattleStateResponse | null>(null);
  const [rewards, setRewards] = useState<BattleRewards | null>(null);
  const [phase, setPhase] = useState<BattlePhase>("intro");
  
  const profileId = 1;
  
  // Query for active battle (when no battleId in URL)
  const { data: activeBattle, isLoading: activeLoading, error: activeError } = useQuery<{ battle: BattleStateResponse } | null>({
    queryKey: ["/api/combat/active", profileId],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/combat/active/${profileId}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Failed to fetch battle");
        return response.json();
      } catch {
        return null;
      }
    },
    enabled: !params.battleId,
  });
  
  // Query for specific battle by ID (when battleId in URL)
  const { data: specificBattle, isLoading: specificLoading, error: specificError } = useQuery<{ battle: BattleStateResponse } | null>({
    queryKey: ["/api/combat/battle", params.battleId],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/combat/battle/${params.battleId}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Failed to fetch battle");
        return response.json();
      } catch {
        return null;
      }
    },
    enabled: !!params.battleId,
  });
  
  const initialBattle = params.battleId ? specificBattle : activeBattle;
  const isLoading = params.battleId ? specificLoading : activeLoading;
  const error = params.battleId ? specificError : activeError;

  const { data: spellsData } = useQuery<CombatSpell[]>({
    queryKey: ["/api/rpg/spells"],
    enabled: !!battleState,
  });

  const endBattleMutation = useMutation({
    mutationFn: async ({ battleId, outcome }: { battleId: string; outcome: "victory" | "defeat" | "flee" }) => {
      const response = await apiRequest("POST", "/api/combat/end", { battleId, outcome });
      return response.json() as Promise<{ rewards: BattleRewards }>;
    },
    onSuccess: (data) => {
      setRewards(data.rewards);
      queryClient.invalidateQueries({ queryKey: ["/api/combat/active"] });
    },
  });

  useEffect(() => {
    if (initialBattle?.battle) {
      setBattleState(initialBattle.battle);
      setPhase(initialBattle.battle.phase);
      
      if (initialBattle.battle.phase === "intro") {
        setTimeout(() => setPhase("player_turn"), 2000);
      }
    }
  }, [initialBattle]);

  const handleActionComplete = useCallback((result: unknown) => {
    const actionResult = result as ActionResponse;
    
    if (actionResult.battle) {
      setBattleState(actionResult.battle);
      
      if (actionResult.result.battleEnded) {
        const outcome = actionResult.result.outcome;
        if (outcome) {
          setPhase(outcome === "victory" ? "victory" : outcome === "defeat" ? "defeat" : "flee");
          
          if (outcome !== "flee" && actionResult.battle.battleId) {
            endBattleMutation.mutate({ 
              battleId: actionResult.battle.battleId, 
              outcome 
            });
          }
        }
      } else {
        setPhase(actionResult.battle.phase);
        
        if (actionResult.battle.phase === "intro" || actionResult.battle.phase === "action_resolve") {
          setTimeout(() => setPhase("player_turn"), 500);
        }
      }
    }
  }, [endBattleMutation]);

  const handleVictoryContinue = useCallback(() => {
    setLocation("/explore");
  }, [setLocation]);

  const handleDefeatReturn = useCallback(() => {
    setLocation("/explore");
  }, [setLocation]);

  const handleDefeatRetry = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/combat/active"] });
    setLocation("/explore");
  }, [setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-purple-950">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="w-12 h-12 animate-spin text-amber-400" />
          <p className="text-foreground/70 font-serif">Preparing for battle...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-purple-950">
        <div className="text-center">
          <p className="text-red-400 mb-4">Failed to load battle</p>
          <button 
            onClick={() => setLocation("/explore")}
            className="text-amber-400 underline"
          >
            Return to Exploration
          </button>
        </div>
      </div>
    );
  }

  if (!battleState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-purple-950">
        <div className="text-center">
          <p className="text-foreground/70 mb-4">No active battle found</p>
          <button 
            onClick={() => setLocation("/explore")}
            className="text-amber-400 underline"
            data-testid="link-explore"
          >
            Return to Exploration
          </button>
        </div>
      </div>
    );
  }

  return (
    <BattleScene
      battleId={battleState.battleId}
      playerState={battleState.playerState}
      enemyState={battleState.enemyState}
      phase={phase}
      turnNumber={battleState.currentTurn}
      logs={battleState.logs}
      spells={spellsData || []}
      canFlee={battleState.canFlee}
      backgroundUrl={battleState.backgroundUrl}
      rewards={rewards}
      onActionComplete={handleActionComplete}
      onVictoryContinue={handleVictoryContinue}
      onDefeatRetry={handleDefeatRetry}
      onDefeatReturn={handleDefeatReturn}
    />
  );
}
