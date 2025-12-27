import { motion } from "framer-motion";
import { type CombatantState } from "@shared/schema";
import { StatusEffectList } from "./StatusBadge";
import { Card } from "@/components/ui/card";

interface CombatantPanelProps {
  combatant: CombatantState;
  isPlayer: boolean;
  isActive?: boolean;
  showPP?: boolean;
}

function getHpColor(hpPercent: number): string {
  if (hpPercent > 0.5) return "from-green-500 to-green-400";
  if (hpPercent > 0.25) return "from-yellow-500 to-yellow-400";
  return "from-red-500 to-red-400";
}

function HpBar({ current, max, animate = true }: { current: number; max: number; animate?: boolean }) {
  const percent = Math.max(0, Math.min(100, (current / max) * 100));
  const hpColor = getHpColor(current / max);
  
  return (
    <div className="w-full" data-testid="hp-bar-container">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-serif font-medium text-amber-300">HP</span>
        <span className="text-xs font-mono text-amber-200" data-testid="hp-text">
          {current}/{max}
        </span>
      </div>
      <div className="h-3 bg-black/50 rounded-full overflow-hidden border border-amber-700/30">
        <motion.div
          className={`h-full bg-gradient-to-r ${hpColor} rounded-full`}
          initial={animate ? { width: "100%" } : { width: `${percent}%` }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          data-testid="hp-bar-fill"
        />
      </div>
    </div>
  );
}

function TotalPPBar({ currentPp, equippedSpells }: { currentPp: Record<string, number>; equippedSpells: string[] }) {
  const totalCurrent = Object.values(currentPp).reduce((sum, pp) => sum + pp, 0);
  const totalMax = equippedSpells.length * 20;
  const percent = totalMax > 0 ? Math.max(0, Math.min(100, (totalCurrent / totalMax) * 100)) : 0;
  
  return (
    <div className="w-full" data-testid="pp-bar-container">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-serif font-medium text-purple-300">PP</span>
        <span className="text-xs font-mono text-purple-200" data-testid="pp-text">
          {totalCurrent}/{totalMax}
        </span>
      </div>
      <div className="h-2 bg-black/50 rounded-full overflow-hidden border border-purple-700/30">
        <motion.div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full"
          initial={{ width: `${percent}%` }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.3 }}
          data-testid="pp-bar-fill"
        />
      </div>
    </div>
  );
}

export function CombatantPanel({ combatant, isPlayer, isActive = false, showPP = true }: CombatantPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: isPlayer ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
      data-testid={isPlayer ? "player-panel" : "enemy-panel"}
    >
      <Card 
        className={`p-3 bg-gradient-to-br from-stone-900/95 to-stone-950/95 border-amber-700/50 ${
          isActive ? "ring-2 ring-amber-400/60 magic-border" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-serif font-semibold text-amber-200 truncate max-w-[100px] sm:max-w-[120px]" data-testid="combatant-name">
              {combatant.name}
            </h3>
            <span 
              className="text-xs font-mono bg-amber-900/40 px-1.5 py-0.5 rounded text-amber-300 border border-amber-700/30"
              data-testid="combatant-level"
            >
              Lv.{combatant.level}
            </span>
          </div>
          {combatant.discipline && (
            <span 
              className="text-xs px-2 py-0.5 rounded bg-purple-900/40 text-purple-200 capitalize border border-purple-700/30"
              data-testid="combatant-discipline"
            >
              {combatant.discipline.replace("_", " ")}
            </span>
          )}
        </div>
        
        <div className="space-y-2">
          <HpBar current={combatant.currentHp} max={combatant.maxHp} />
          
          {isPlayer && showPP && (
            <TotalPPBar currentPp={combatant.currentPp} equippedSpells={combatant.equippedSpells} />
          )}
        </div>
        
        {combatant.statusEffects.length > 0 && (
          <div className="mt-2">
            <StatusEffectList effects={combatant.statusEffects} size="sm" />
          </div>
        )}
      </Card>
    </motion.div>
  );
}
