import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Trophy, Coins, Package, ArrowUp } from "lucide-react";

export interface BattleRewards {
  experienceGained: number;
  galleonsGained: number;
  itemsDropped: { itemId: string; displayName?: string; quantity: number }[];
  leveledUp: boolean;
  newLevel?: number;
}

interface VictoryScreenProps {
  enemyName: string;
  rewards: BattleRewards;
  onContinue: () => void;
}

export function VictoryScreen({ enemyName, rewards, onContinue }: VictoryScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      data-testid="victory-screen"
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
      >
        <Card className="w-[320px] sm:w-[400px] bg-gradient-to-b from-amber-950/95 to-stone-950/95 border-amber-600/50 p-6 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
            className="mx-auto w-16 h-16 bg-gradient-to-br from-amber-500 to-yellow-400 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-amber-500/30"
          >
            <Trophy className="w-8 h-8 text-amber-900" />
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-2xl font-serif font-bold text-amber-200 mb-2"
          >
            Victory!
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-foreground/70 mb-6"
          >
            You defeated <span className="text-amber-300 font-medium">{enemyName}</span>!
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="space-y-3 mb-6"
          >
            <div className="flex items-center justify-between px-4 py-2 bg-black/30 rounded-lg">
              <div className="flex items-center gap-2 text-purple-300">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm">Experience</span>
              </div>
              <span className="font-mono text-purple-200" data-testid="xp-gained">
                +{rewards.experienceGained} XP
              </span>
            </div>
            
            <div className="flex items-center justify-between px-4 py-2 bg-black/30 rounded-lg">
              <div className="flex items-center gap-2 text-amber-300">
                <Coins className="w-4 h-4" />
                <span className="text-sm">Galleons</span>
              </div>
              <span className="font-mono text-amber-200" data-testid="galleons-gained">
                +{rewards.galleonsGained}
              </span>
            </div>
            
            {rewards.itemsDropped.length > 0 && (
              <div className="px-4 py-2 bg-black/30 rounded-lg">
                <div className="flex items-center gap-2 text-green-300 mb-2">
                  <Package className="w-4 h-4" />
                  <span className="text-sm">Items Found</span>
                </div>
                <div className="space-y-1">
                  {rewards.itemsDropped.map((item, idx) => (
                    <p key={idx} className="text-sm text-green-200 pl-6" data-testid={`item-${item.itemId}`}>
                      {item.displayName || item.itemId} x{item.quantity}
                    </p>
                  ))}
                </div>
              </div>
            )}
            
            {rewards.leveledUp && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 1, type: "spring" }}
                className="px-4 py-3 bg-gradient-to-r from-amber-700/50 to-yellow-700/50 rounded-lg border border-amber-500/50"
              >
                <div className="flex items-center justify-center gap-2 text-amber-100">
                  <ArrowUp className="w-5 h-5" />
                  <span className="font-serif font-bold text-lg">Level Up!</span>
                </div>
                <p className="text-amber-200/80 text-sm mt-1" data-testid="new-level">
                  You are now level {rewards.newLevel}!
                </p>
              </motion.div>
            )}
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <Button
              onClick={onContinue}
              className="w-full bg-gradient-to-r from-amber-600 to-yellow-600 text-amber-950 font-semibold"
              data-testid="button-continue"
            >
              Continue
            </Button>
          </motion.div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
