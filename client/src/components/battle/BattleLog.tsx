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
      return "text-green-400";
    case "not_very_effective":
      return "text-red-400";
    default:
      return "text-foreground/90";
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
      className="flex gap-2 items-start py-1.5 border-b border-amber-900/20 last:border-0"
      data-testid={`battle-log-entry-${entry.turnNumber}`}
    >
      <span className="text-amber-600/60 mt-0.5">
        {getLogIcon(entry.actionType)}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${effectivenessStyle} break-words`}>
          {entry.message}
        </p>
        {(entry.damage !== undefined && entry.damage > 0) && (
          <span 
            className={`text-xs font-mono ${entry.isCritical ? "text-amber-400 font-bold" : "text-red-400"}`}
            data-testid="damage-value"
          >
            -{entry.damage} HP{entry.isCritical && " CRIT!"}
          </span>
        )}
        {(entry.healing !== undefined && entry.healing > 0) && (
          <span className="text-xs font-mono text-green-400" data-testid="healing-value">
            +{entry.healing} HP
          </span>
        )}
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
      className="bg-gradient-to-b from-amber-950/40 to-stone-950/60 rounded-lg border border-amber-900/30 h-full"
      data-testid="battle-log"
    >
      <div className="px-3 py-2 border-b border-amber-900/30">
        <h4 className="text-xs font-serif font-semibold text-amber-200/80 uppercase tracking-wider">
          Battle Log
        </h4>
      </div>
      
      <ScrollArea className="h-[calc(100%-2rem)]" ref={scrollRef}>
        <div className="px-3 py-2">
          {visibleLogs.length === 0 ? (
            <p className="text-sm text-foreground/40 italic text-center py-4">
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
