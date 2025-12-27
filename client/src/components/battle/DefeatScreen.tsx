import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skull, RotateCcw, Home } from "lucide-react";

interface DefeatScreenProps {
  enemyName: string;
  onRetry?: () => void;
  onReturnToTown: () => void;
}

export function DefeatScreen({ enemyName, onRetry, onReturnToTown }: DefeatScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      data-testid="defeat-screen"
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
      >
        <Card className="w-[320px] sm:w-[400px] bg-gradient-to-b from-red-950/95 to-stone-950/95 border-red-800/50 p-6 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
            className="mx-auto w-16 h-16 bg-gradient-to-br from-red-600 to-red-800 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-red-500/30"
          >
            <Skull className="w-8 h-8 text-red-200" />
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-2xl font-serif font-bold text-red-200 mb-2"
          >
            Defeated...
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-foreground/70 mb-6"
          >
            You were bested by <span className="text-red-300 font-medium">{enemyName}</span>...
          </motion.p>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-sm text-foreground/50 mb-6 italic"
          >
            A mysterious force whisked you away to safety. You lost some Galleons in the confusion.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex flex-col gap-3"
          >
            {onRetry && (
              <Button
                onClick={onRetry}
                variant="outline"
                className="w-full border-red-700/50 text-red-200"
                data-testid="button-retry"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
            
            <Button
              onClick={onReturnToTown}
              className="w-full bg-gradient-to-r from-stone-600 to-stone-700 text-stone-100"
              data-testid="button-return-town"
            >
              <Home className="w-4 h-4 mr-2" />
              Return to Safety
            </Button>
          </motion.div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
