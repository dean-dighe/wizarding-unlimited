import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sword, Shield, Wind, Sparkles } from "lucide-react";

export interface BattleLogEntry {
  turnNumber: number;
  actorName: string;
  actionType: string;
  actionTarget?: string;
  spellUsed?: string;
  itemUsed?: string;
  damage?: number;
  healing?: number;
  statusApplied?: string;
  isCritical?: boolean;
  isMiss?: boolean;
  message: string;
  effectiveness?: "super_effective" | "not_very_effective" | "normal";
}

interface BattleLogProps {
  logs: BattleLogEntry[];
  maxVisible?: number;
}

function getLogIcon(actionType: string) {
  switch (actionType) {
    case "spell":
      return <Sparkles className="w-3 h-3" />;
    case "item":
      return <Shield className="w-3 h-3" />;
    case "flee":
      return <Wind className="w-3 h-3" />;
    default:
      return <Sword className="w-3 h-3" />;
  }
}

function getEffectivenessStyle(effectiveness?: string): string {
  switch (effectiveness) {
    case "super_effective":
      return "text-emerald-300";
    case "not_very_effective":
      return "text-red-300";
    default:
      return "text-amber-100";
  }
}

function LogEntry({ entry, index }: { entry: BattleLogEntry; index: number }) {
  const effectivenessStyle = getEffectivenessStyle(entry.effectiveness);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="flex gap-2 items-start py-2 border-b border-amber-800/20 last:border-0"
      data-testid={`battle-log-entry-${entry.turnNumber}`}
    >
      <span className="text-amber-500 mt-0.5 flex-shrink-0">
        {getLogIcon(entry.actionType)}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${effectivenessStyle} break-words leading-relaxed`}>
          {entry.message}
        </p>
        <div className="flex flex-wrap gap-2 mt-0.5">
          {(entry.damage !== undefined && entry.damage > 0) && (
            <span 
              className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                entry.isCritical 
                  ? "bg-amber-900/50 text-amber-300 font-bold" 
                  : "bg-red-900/30 text-red-300"
              }`}
              data-testid="damage-value"
            >
              -{entry.damage} HP{entry.isCritical && " CRIT!"}
            </span>
          )}
          {(entry.healing !== undefined && entry.healing > 0) && (
            <span 
              className="text-xs font-mono px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-300" 
              data-testid="healing-value"
            >
              +{entry.healing} HP
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function BattleLog({ logs, maxVisible = 10 }: BattleLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleLogs = logs.slice(-maxVisible);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);
  
  return (
    <div 
      className="bg-gradient-to-br from-stone-900/95 to-stone-950/95 rounded-lg border border-amber-700/50 h-full"
      data-testid="battle-log"
    >
      <div className="px-3 py-2 border-b border-amber-700/30 bg-amber-900/20">
        <h4 className="text-xs font-serif font-semibold text-amber-300 uppercase tracking-wider text-magic-glow">
          Battle Chronicle
        </h4>
      </div>
      
      <ScrollArea className="h-[calc(100%-2.5rem)]" ref={scrollRef}>
        <div className="px-3 py-2">
          {visibleLogs.length === 0 ? (
            <p className="text-sm text-amber-200/40 italic text-center py-4 font-serif">
              The battle begins...
            </p>
          ) : (
            <AnimatePresence mode="popLayout">
              {visibleLogs.map((entry, idx) => (
                <LogEntry 
                  key={`${entry.turnNumber}-${entry.actorName}-${idx}`} 
                  entry={entry} 
                  index={idx}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
