import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { MagicalButton } from "@/components/ui/magical-button";

interface IntroSceneProps {
  introText: string;
  playerName: string;
  house: string;
  onContinue: () => void;
}

export function IntroScene({ introText, playerName, house, onContinue }: IntroSceneProps) {
  const houseColors: Record<string, string> = {
    Gryffindor: "from-red-900/80 to-yellow-900/60",
    Slytherin: "from-green-900/80 to-emerald-900/60",
    Ravenclaw: "from-blue-900/80 to-indigo-900/60",
    Hufflepuff: "from-yellow-800/80 to-amber-900/60",
  };

  const houseBorder: Record<string, string> = {
    Gryffindor: "border-red-500/50",
    Slytherin: "border-green-500/50",
    Ravenclaw: "border-blue-500/50",
    Hufflepuff: "border-yellow-500/50",
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950 via-purple-950 to-black">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-2xl"
      >
        <div className={`relative bg-gradient-to-b ${houseColors[house] || "from-purple-900/80 to-indigo-900/60"} backdrop-blur-xl rounded-lg border ${houseBorder[house] || "border-purple-500/50"} shadow-2xl overflow-hidden`}>
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNhKSIvPjwvc3ZnPg==')] opacity-30" />
          
          <div className="relative p-8 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-center"
            >
              <h2 className="text-2xl font-serif font-bold text-yellow-200/90 mb-1">
                Welcome, {playerName}
              </h2>
              <p className="text-sm text-purple-200/60 font-serif">
                House {house}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent blur-xl" />
              <p className="relative text-lg font-serif text-white/90 leading-relaxed text-center italic">
                "{introText}"
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.5 }}
              className="flex justify-center pt-4"
            >
              <MagicalButton
                onClick={onContinue}
                className="bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold shadow-lg shadow-yellow-900/30 px-8 py-3"
                data-testid="button-continue-explore"
              >
                <span className="flex items-center gap-2">
                  Begin Exploration <Sparkles className="w-4 h-4" />
                </span>
              </MagicalButton>
            </motion.div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-yellow-400/50 to-transparent" />
        </div>
      </motion.div>
    </div>
  );
}
