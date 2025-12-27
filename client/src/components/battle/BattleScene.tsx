import { motion, AnimatePresence } from "framer-motion";
import { type CombatantState, type BattlePhase, type CombatSpell } from "@shared/schema";
import { CombatantPanel } from "./CombatantPanel";
import { CommandBar } from "./CommandBar";
import { BattleLog, type BattleLogEntry } from "./BattleLog";
import { VictoryScreen, type BattleRewards } from "./VictoryScreen";
import { DefeatScreen } from "./DefeatScreen";
import { Loader2, Wand2 } from "lucide-react";

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

function MagicalParticle({ delay }: { delay: number }) {
  return (
    <motion.div
      className="absolute w-2 h-2 rounded-full bg-amber-400/60"
      initial={{ opacity: 0, scale: 0, y: 0 }}
      animate={{
        opacity: [0, 1, 0],
        scale: [0, 1.5, 0],
        y: [-20, -60],
        x: [0, Math.random() * 40 - 20],
      }}
      transition={{
        duration: 2,
        delay,
        repeat: Infinity,
        ease: "easeOut",
      }}
      style={{
        left: `${Math.random() * 100}%`,
        bottom: "20%",
        filter: "blur(1px)",
        boxShadow: "0 0 8px rgba(251, 191, 36, 0.6)",
      }}
    />
  );
}

function CombatantSprite({ 
  combatant, 
  isPlayer,
  isActive 
}: { 
  combatant: CombatantState; 
  isPlayer: boolean;
  isActive: boolean;
}) {
  return (
    <motion.div
      className={`relative flex flex-col items-center ${isPlayer ? "order-1" : "order-3"}`}
      initial={{ opacity: 0, scale: 0.8, x: isPlayer ? -50 : 50 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <motion.div
        className={`relative w-24 h-32 sm:w-32 sm:h-40 flex items-end justify-center ${
          isActive ? "magic-border rounded-lg" : ""
        }`}
        animate={isActive ? { scale: [1, 1.02, 1] } : {}}
        transition={{ duration: 1.5, repeat: isActive ? Infinity : 0 }}
      >
        <div 
          className={`w-20 h-28 sm:w-28 sm:h-36 rounded-lg flex items-center justify-center ${
            isPlayer 
              ? "bg-gradient-to-t from-blue-900/80 to-indigo-800/60" 
              : "bg-gradient-to-t from-red-900/80 to-rose-800/60"
          } border ${
            isPlayer ? "border-blue-500/50" : "border-red-500/50"
          } shadow-lg`}
          style={{
            boxShadow: isActive 
              ? `0 0 20px ${isPlayer ? "rgba(59, 130, 246, 0.4)" : "rgba(239, 68, 68, 0.4)"}` 
              : undefined
          }}
        >
          <div className="text-center">
            <Wand2 className={`w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-1 ${
              isPlayer ? "text-blue-300" : "text-red-300"
            }`} />
            <span className={`text-xs font-serif ${
              isPlayer ? "text-blue-200" : "text-red-200"
            }`}>
              {isPlayer ? "Wizard" : "Foe"}
            </span>
          </div>
        </div>
        
        <div 
          className="absolute -bottom-1 w-16 h-3 rounded-full blur-sm"
          style={{
            background: isPlayer 
              ? "radial-gradient(ellipse, rgba(59, 130, 246, 0.3) 0%, transparent 70%)"
              : "radial-gradient(ellipse, rgba(239, 68, 68, 0.3) 0%, transparent 70%)"
          }}
        />
      </motion.div>
      
      <p className="mt-2 text-xs font-serif text-amber-200 text-center truncate max-w-[100px] sm:max-w-[120px]">
        {combatant.name}
      </p>
    </motion.div>
  );
}

function BattleStage({ 
  playerState, 
  enemyState, 
  phase 
}: { 
  playerState: CombatantState; 
  enemyState: CombatantState;
  phase: BattlePhase;
}) {
  const isPlayerActive = phase === "player_turn";
  const isEnemyActive = phase === "enemy_turn";
  
  return (
    <div className="relative flex items-center justify-center gap-8 sm:gap-16 py-4 sm:py-6">
      <CombatantSprite 
        combatant={playerState} 
        isPlayer={true} 
        isActive={isPlayerActive}
      />
      
      <div className="order-2 relative w-12 sm:w-20 h-20 flex items-center justify-center">
        {[...Array(5)].map((_, i) => (
          <MagicalParticle key={i} delay={i * 0.4} />
        ))}
        <motion.div
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-400/20 to-purple-600/20 border border-amber-500/30"
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-amber-400/60 text-lg sm:text-xl font-serif">VS</span>
          </div>
        </motion.div>
      </div>
      
      <CombatantSprite 
        combatant={enemyState} 
        isPlayer={false} 
        isActive={isEnemyActive}
      />
    </div>
  );
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
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      
      <div className="relative z-10 w-full h-full max-w-6xl mx-auto flex flex-col lg:flex-row p-2 sm:p-4 gap-2 sm:gap-4">
        <div className="flex-1 flex flex-col gap-2 sm:gap-3">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between gap-2 bg-gradient-to-r from-stone-900/90 to-stone-950/90 rounded-lg p-2 sm:p-3 border border-amber-700/30"
          >
            <div className="flex-1 max-w-[200px] sm:max-w-[260px]">
              <CombatantPanel 
                combatant={enemyState} 
                isPlayer={false}
                isActive={phase === "enemy_turn"}
              />
            </div>
            
            <div className="text-center px-3 sm:px-4">
              <span className="text-xs text-amber-400/70 font-serif uppercase tracking-wider">Turn</span>
              <p className="text-2xl sm:text-3xl font-serif font-bold text-amber-300 text-magic-glow" data-testid="turn-number">
                {turnNumber}
              </p>
            </div>
            
            <div className="flex-1 max-w-[200px] sm:max-w-[260px]">
              <CombatantPanel 
                combatant={playerState} 
                isPlayer={true}
                isActive={isPlayerTurn}
                showPP={true}
              />
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex-1 flex flex-col items-center justify-center min-h-[180px] sm:min-h-[240px] bg-gradient-to-br from-stone-900/60 to-purple-950/40 rounded-xl border border-amber-700/20"
          >
            <BattleStage 
              playerState={playerState} 
              enemyState={enemyState}
              phase={phase}
            />
            
            <AnimatePresence mode="wait">
              {phase === "intro" && (
                <motion.div
                  key="intro"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center mt-2"
                >
                  <h2 className="text-xl sm:text-2xl font-serif font-bold text-amber-300 text-magic-glow mb-1">
                    Wild {enemyState.name} appeared!
                  </h2>
                  <p className="text-amber-200/60 text-sm">Prepare for battle!</p>
                </motion.div>
              )}
              
              {isResolving && (
                <motion.div
                  key="resolving"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-amber-200/80 mt-2"
                >
                  <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                  <span className="text-sm font-serif">
                    {phase === "enemy_turn" ? `${enemyState.name} is casting...` : "Resolving magic..."}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
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
          className="w-full lg:w-80 h-[160px] lg:h-auto"
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
