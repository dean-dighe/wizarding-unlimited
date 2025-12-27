import { motion, AnimatePresence } from "framer-motion";
import { type CombatantState, type BattlePhase, type CombatSpell } from "@shared/schema";
import { CombatantPanel } from "./CombatantPanel";
import { CommandBar } from "./CommandBar";
import { BattleLog, type BattleLogEntry } from "./BattleLog";
import { VictoryScreen, type BattleRewards } from "./VictoryScreen";
import { DefeatScreen } from "./DefeatScreen";
import { Loader2 } from "lucide-react";

interface BattleSceneProps {
  battleId: string;
  playerState: CombatantState;
  enemyState: CombatantState;
  phase: BattlePhase;
  turnNumber: number;
  logs: BattleLogEntry[];
  spells: CombatSpell[];
  canFlee: boolean;
  backgroundUrl?: string | null;
  rewards?: BattleRewards | null;
  onActionComplete?: (result: unknown) => void;
  onVictoryContinue: () => void;
  onDefeatRetry?: () => void;
  onDefeatReturn: () => void;
}

export function BattleScene({
  battleId,
  playerState,
  enemyState,
  phase,
  turnNumber,
  logs,
  spells,
  canFlee,
  backgroundUrl,
  rewards,
  onActionComplete,
  onVictoryContinue,
  onDefeatRetry,
  onDefeatReturn,
}: BattleSceneProps) {
  const isPlayerTurn = phase === "player_turn";
  const isEnded = phase === "victory" || phase === "defeat" || phase === "flee";
  const isResolving = phase === "action_resolve" || phase === "status_tick" || phase === "enemy_turn";
  
  const backgroundStyle = backgroundUrl
    ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : {};

  return (
    <div 
      className="relative w-full h-full min-h-screen bg-gradient-to-b from-slate-900 via-purple-950 to-slate-950"
      style={backgroundStyle}
      data-testid="battle-scene"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50" />
      
      <div className="relative z-10 w-full h-full max-w-5xl mx-auto flex flex-col lg:flex-row p-2 sm:p-4 gap-2 sm:gap-4">
        <div className="flex-1 flex flex-col gap-2 sm:gap-3">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex-1 max-w-[200px] sm:max-w-[240px]">
              <CombatantPanel 
                combatant={enemyState} 
                isPlayer={false}
                isActive={phase === "enemy_turn"}
              />
            </div>
            
            <div className="text-center px-2 sm:px-4">
              <span className="text-xs text-foreground/50 font-mono">Turn</span>
              <p className="text-xl sm:text-2xl font-serif font-bold text-amber-300" data-testid="turn-number">
                {turnNumber}
              </p>
            </div>
          </motion.div>
          
          <div className="flex-1 flex items-center justify-center min-h-[100px] sm:min-h-[150px]">
            <AnimatePresence mode="wait">
              {phase === "intro" && (
                <motion.div
                  key="intro"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <h2 className="text-2xl sm:text-3xl font-serif font-bold text-red-400 mb-2">
                    Wild {enemyState.name} appeared!
                  </h2>
                  <p className="text-foreground/60">Prepare for battle!</p>
                </motion.div>
              )}
              
              {isResolving && (
                <motion.div
                  key="resolving"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-foreground/70"
                >
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">
                    {phase === "enemy_turn" ? `${enemyState.name} is thinking...` : "Resolving..."}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-2 sm:space-y-3"
          >
            <div className="max-w-[200px] sm:max-w-[240px]">
              <CombatantPanel 
                combatant={playerState} 
                isPlayer={true}
                isActive={isPlayerTurn}
                showPP={true}
              />
            </div>
            
            <CommandBar
              playerState={playerState}
              spells={spells}
              battleId={battleId}
              isDisabled={!isPlayerTurn || isEnded}
              canFlee={canFlee}
              onActionComplete={onActionComplete}
            />
          </motion.div>
        </div>
        
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full lg:w-72 h-[150px] lg:h-auto"
        >
          <BattleLog logs={logs} />
        </motion.div>
      </div>
      
      <AnimatePresence>
        {phase === "victory" && rewards && (
          <VictoryScreen
            enemyName={enemyState.name}
            rewards={rewards}
            onContinue={onVictoryContinue}
          />
        )}
        
        {phase === "defeat" && (
          <DefeatScreen
            enemyName={enemyState.name}
            onRetry={onDefeatRetry}
            onReturnToTown={onDefeatReturn}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
