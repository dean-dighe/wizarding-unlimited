import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Wand2, Sparkles } from "lucide-react";
import { MagicalButton } from "@/components/ui/magical-button";
import { useInitGame } from "@/hooks/use-game";
import { useToast } from "@/hooks/use-toast";

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

export default function Landing() {
  const [name, setName] = useState("");
  const [house, setHouse] = useState<string | undefined>(undefined);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const initGame = useInitGame();

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
      const result = await initGame.mutateAsync({ playerName: name, house });
      setLocation(`/game/${result.conversationId}`);
    } catch (error: any) {
      toast({
        title: "Magic Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900 via-purple-950 to-black">
      {/* Background ambient particles could go here */}
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md relative"
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 via-purple-500 to-yellow-400 rounded-xl blur opacity-75 animate-pulse" />
        
        <div className="relative bg-black/80 backdrop-blur-xl rounded-xl p-8 border border-white/10 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-4 border border-primary/40">
              <Wand2 className="w-8 h-8 text-yellow-400 animate-float" />
            </div>
            <h1 className="text-4xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-yellow-600 mb-2">
              Wizarding Sagas
            </h1>
            <p className="text-purple-200/80 font-serif text-sm max-w-xs mx-auto">Begin your third year at Hogwarts. Board the Hogwarts Express at Platform 9¾ and uncover mysteries that await within the castle walls.</p>
          </div>

          <form onSubmit={handleStart} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-purple-200/60 uppercase tracking-wider">
                Wizard Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Harold Plotter"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 transition-all font-serif"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-purple-200/60 uppercase tracking-wider">
                Choose Your House
              </label>
              <div className="grid grid-cols-2 gap-2">
                {["Gryffindor", "Slytherin", "Ravenclaw", "Hufflepuff"].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHouse(house === h ? undefined : h)}
                    data-testid={`button-house-${h.toLowerCase()}`}
                    className={`
                      px-3 py-3 rounded border text-sm font-serif transition-all flex flex-col items-center justify-center gap-2
                      ${house === h 
                        ? 'bg-primary/40 border-yellow-500 text-yellow-200 shadow-[0_0_10px_rgba(234,179,8,0.2)]' 
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'}
                    `}
                  >
                    <img 
                      src={houseIcons[h]} 
                      alt={`${h} crest`} 
                      className="w-12 h-12 object-contain"
                    />
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <MagicalButton 
              type="submit" 
              className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold shadow-lg shadow-yellow-900/20"
              isLoading={initGame.isPending}
            >
              {initGame.isPending ? "Casting Spells..." : (
                <span className="flex items-center gap-2">
                  Enter World <Sparkles className="w-4 h-4" />
                </span>
              )}
            </MagicalButton>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
