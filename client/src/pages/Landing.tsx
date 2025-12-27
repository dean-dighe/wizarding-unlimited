import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import wandLogo from "@assets/generated_images/magical_wand_app_logo.png";
import { MagicalButton } from "@/components/ui/magical-button";
import { useGameStart } from "@/hooks/use-game-start";
import { useToast } from "@/hooks/use-toast";
import { type HogwartsHouse, HogwartsHouses } from "@shared/routes";
import { IntroScene } from "@/components/game/IntroScene";

import gryffindorIcon from "@assets/generated_images/gryffindor_lion_crest_icon.png";
import slytherinIcon from "@assets/generated_images/slytherin_snake_crest_icon.png";
import ravenclawIcon from "@assets/generated_images/ravenclaw_eagle_crest_icon.png";
import hufflepuffIcon from "@assets/generated_images/hufflepuff_badger_crest_icon.png";

const houseIcons: Record<string, string> = {
  Gryffindor: gryffindorIcon,
  Slytherin: slytherinIcon,
  Ravenclaw: ravenclawIcon,
  Hufflepuff: hufflepuffIcon,
};

interface GameStartResult {
  profileId: number;
  introText: string;
  startingLocation: string;
  playerData: {
    playerName: string;
    house: string;
  };
}

export default function Landing() {
  const [name, setName] = useState("");
  const [house, setHouse] = useState<HogwartsHouse | undefined>(undefined);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const gameStart = useGameStart();
  
  const [gameResult, setGameResult] = useState<GameStartResult | null>(null);
  const [showIntro, setShowIntro] = useState(false);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!house) {
      toast({
        title: "Choose Your House",
        description: "Please select a Hogwarts house to begin your journey.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await gameStart.mutateAsync({ playerName: name, house });
      setGameResult(result);
      setShowIntro(true);
    } catch (error: any) {
      toast({
        title: "Magic Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleContinueToExplore = () => {
    if (gameResult) {
      setLocation(`/explore?profileId=${gameResult.profileId}`);
    }
  };

  if (showIntro && gameResult) {
    return (
      <IntroScene
        introText={gameResult.introText}
        playerName={gameResult.playerData.playerName}
        house={gameResult.playerData.house}
        onContinue={handleContinueToExplore}
      />
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center p-2 sm:p-4 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900 via-purple-950 to-black overflow-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-4xl relative"
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 via-purple-500 to-yellow-400 rounded-xl blur opacity-75 animate-pulse" />
        
        <div className="relative bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl">
          <div className="flex flex-col landscape:flex-row landscape:items-stretch">
            <div className="flex-shrink-0 p-4 sm:p-6 landscape:p-4 landscape:w-[40%] landscape:border-r landscape:border-white/10 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 landscape:w-14 landscape:h-14 lg:w-20 lg:h-20 mx-auto rounded-full flex items-center justify-center mb-2 landscape:mb-3 overflow-hidden">
                <img src={wandLogo} alt="Magical Wand" className="w-full h-full object-cover animate-float" />
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-yellow-600 mb-1 landscape:mb-2">
                Hogwarts Unlimited
              </h1>
              <p className="text-purple-200/80 font-serif text-xs sm:text-sm max-w-xs mx-auto leading-snug">
                Explore the magical world of Hogwarts. Battle creatures, learn spells, and discover secrets.
              </p>
            </div>

            <form onSubmit={handleStart} className="flex-1 p-4 sm:p-6 landscape:p-4 space-y-3 landscape:space-y-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-purple-200/60 uppercase tracking-wider">
                  Wizard Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full px-3 py-2 landscape:py-1.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 transition-all font-serif text-sm"
                  required
                  data-testid="input-wizard-name"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-purple-200/60 uppercase tracking-wider">
                  Choose Your House
                </label>
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                  {HogwartsHouses.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHouse(house === h ? undefined : h)}
                      data-testid={`button-house-${h.toLowerCase()}`}
                      className={`
                        px-1 py-2 landscape:py-1.5 rounded border text-xs font-serif transition-all flex flex-col items-center justify-center gap-1
                        ${house === h 
                          ? 'bg-primary/40 border-yellow-500 text-yellow-200 shadow-[0_0_10px_rgba(234,179,8,0.2)]' 
                          : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'}
                      `}
                    >
                      <img 
                        src={houseIcons[h]} 
                        alt={`${h} crest`} 
                        className="w-8 h-8 landscape:w-7 landscape:h-7 sm:w-10 sm:h-10 object-contain"
                      />
                      <span className="hidden sm:inline landscape:inline text-[10px] sm:text-xs">{h}</span>
                    </button>
                  ))}
                </div>
              </div>

              <MagicalButton 
                type="submit" 
                className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold shadow-lg shadow-yellow-900/20 py-2 landscape:py-1.5 text-sm"
                isLoading={gameStart.isPending}
                data-testid="button-enter-world"
              >
                {gameStart.isPending ? "Casting Spells..." : (
                  <span className="flex items-center justify-center gap-2">
                    Begin Adventure <Sparkles className="w-4 h-4" />
                  </span>
                )}
              </MagicalButton>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
