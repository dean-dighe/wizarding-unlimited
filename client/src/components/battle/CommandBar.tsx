import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { type CombatantState, type CombatSpell, type MagicalDiscipline } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { Wand2, Package, DoorOpen, Loader2, Sparkles } from "lucide-react";

const DISCIPLINE_COLORS: Record<MagicalDiscipline, string> = {
  charms: "from-blue-600 to-blue-500 border-blue-400/50",
  transfiguration: "from-teal-600 to-teal-500 border-teal-400/50",
  defense: "from-slate-600 to-slate-500 border-slate-400/50",
  dark_arts: "from-purple-700 to-purple-600 border-purple-400/50",
  potions: "from-green-600 to-green-500 border-green-400/50",
  creatures: "from-amber-600 to-amber-500 border-amber-400/50",
  divination: "from-indigo-600 to-indigo-500 border-indigo-400/50",
  herbology: "from-lime-600 to-lime-500 border-lime-400/50",
};

interface CommandBarProps {
  playerState: CombatantState;
  spells: CombatSpell[];
  battleId: string;
  isDisabled?: boolean;
  canFlee?: boolean;
  onActionComplete?: (result: unknown) => void;
}

function SpellCard({ 
  spell, 
  currentPP, 
  isDisabled, 
  onSelect 
}: { 
  spell: CombatSpell; 
  currentPP: number;
  isDisabled: boolean;
  onSelect: () => void;
}) {
  const maxPP = spell.maxPP || 20;
  const ppCost = spell.ppCost || 5;
  const hasEnoughPP = currentPP >= ppCost;
  const disciplineColor = DISCIPLINE_COLORS[spell.discipline as MagicalDiscipline] || "from-gray-600 to-gray-500 border-gray-400/50";
  
  return (
    <motion.button
      onClick={onSelect}
      disabled={isDisabled || !hasEnoughPP}
      className={`w-full text-left p-3 rounded-lg border-2 transition-all relative overflow-visible ${
        isDisabled || !hasEnoughPP
          ? "opacity-50 cursor-not-allowed bg-stone-900/60 border-stone-700/30"
          : `bg-gradient-to-br ${disciplineColor} cursor-pointer shadow-lg`
      }`}
      whileHover={!isDisabled && hasEnoughPP ? { scale: 1.03, y: -2 } : {}}
      whileTap={!isDisabled && hasEnoughPP ? { scale: 0.98 } : {}}
      data-testid={`spell-card-${spell.spellName}`}
    >
      {!isDisabled && hasEnoughPP && (
        <div className="absolute inset-0 rounded-lg opacity-0 hover:opacity-100 transition-opacity pointer-events-none"
          style={{
            boxShadow: "0 0 15px rgba(251, 191, 36, 0.3), inset 0 0 10px rgba(251, 191, 36, 0.1)"
          }}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-amber-300/80 flex-shrink-0" />
            <h4 className="font-serif font-semibold text-amber-100 text-sm truncate">{spell.displayName}</h4>
          </div>
          <p className="text-xs text-amber-200/70 capitalize mt-0.5">
            {spell.discipline?.replace("_", " ")}
            {spell.baseDamage ? ` | ${spell.baseDamage} DMG` : ""}
          </p>
        </div>
        <div className="text-right flex-shrink-0 bg-black/30 rounded px-2 py-1">
          <span className={`text-xs font-mono font-bold ${hasEnoughPP ? "text-amber-200" : "text-red-300"}`}>
            {currentPP}/{maxPP}
          </span>
          <p className="text-xs text-amber-300/60">PP</p>
        </div>
      </div>
    </motion.button>
  );
}

export function CommandBar({ 
  playerState, 
  spells, 
  battleId, 
  isDisabled = false,
  canFlee = true,
  onActionComplete 
}: CommandBarProps) {
  const [selectedTab, setSelectedTab] = useState("spells");
  
  const actionMutation = useMutation({
    mutationFn: async (action: { type: "spell" | "item" | "flee"; spellName?: string; itemId?: string }) => {
      const response = await apiRequest("POST", "/api/combat/action", {
        battleId,
        actorName: playerState.name,
        actionType: action.type,
        actionData: action,
      });
      return response.json();
    },
    onSuccess: (data) => {
      onActionComplete?.(data);
    },
  });
  
  const handleSpellSelect = (spellName: string) => {
    if (isDisabled || actionMutation.isPending) return;
    actionMutation.mutate({ type: "spell", spellName });
  };
  
  const handleFlee = () => {
    if (isDisabled || actionMutation.isPending || !canFlee) return;
    actionMutation.mutate({ type: "flee" });
  };
  
  const playerSpells = spells.filter(s => playerState.equippedSpells.includes(s.spellName));
  const isActing = actionMutation.isPending;
  
  return (
    <Card 
      className="bg-gradient-to-br from-stone-900/95 to-stone-950/95 border-amber-700/50 p-3 relative"
      data-testid="command-bar"
    >
      {isActing && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 rounded-xl backdrop-blur-sm">
          <div className="flex items-center gap-2 text-amber-300">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="font-serif text-sm">Casting...</span>
          </div>
        </div>
      )}
      
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="w-full grid grid-cols-3 bg-stone-900/80 mb-3 border border-amber-800/30">
          <TabsTrigger 
            value="spells" 
            className="data-[state=active]:bg-amber-800/60 data-[state=active]:text-amber-100 text-amber-300/70 gap-1 font-serif"
            data-testid="tab-spells"
          >
            <Wand2 className="w-4 h-4" />
            <span className="hidden sm:inline">Spells</span>
          </TabsTrigger>
          <TabsTrigger 
            value="items" 
            className="data-[state=active]:bg-amber-800/60 data-[state=active]:text-amber-100 text-amber-300/70 gap-1 font-serif"
            data-testid="tab-items"
          >
            <Package className="w-4 h-4" />
            <span className="hidden sm:inline">Items</span>
          </TabsTrigger>
          <TabsTrigger 
            value="tactics" 
            className="data-[state=active]:bg-amber-800/60 data-[state=active]:text-amber-100 text-amber-300/70 gap-1 font-serif"
            data-testid="tab-tactics"
          >
            <DoorOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Tactics</span>
          </TabsTrigger>
        </TabsList>
        
        <AnimatePresence mode="wait">
          <TabsContent value="spells" className="mt-0">
            <ScrollArea className="h-[140px]">
              <div className="grid grid-cols-2 gap-2 pr-2">
                {playerSpells.length > 0 ? (
                  playerSpells.map((spell) => (
                    <SpellCard
                      key={spell.spellName}
                      spell={spell}
                      currentPP={playerState.currentPp[spell.spellName] ?? spell.maxPP ?? 20}
                      isDisabled={isDisabled || isActing}
                      onSelect={() => handleSpellSelect(spell.spellName)}
                    />
                  ))
                ) : (
                  <p className="col-span-2 text-center text-sm text-amber-200/50 py-4 font-serif italic">
                    No spells equipped
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="items" className="mt-0">
            <div className="h-[140px] flex items-center justify-center">
              <p className="text-sm text-amber-200/50 italic font-serif">
                No items available
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="tactics" className="mt-0">
            <div className="h-[140px] flex flex-col items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={handleFlee}
                disabled={isDisabled || isActing || !canFlee}
                className="border-amber-700/50 text-amber-200 font-serif"
                data-testid="button-flee"
              >
                <DoorOpen className="w-4 h-4 mr-2" />
                {canFlee ? "Attempt to Flee" : "Cannot Flee!"}
              </Button>
              {!canFlee && (
                <p className="text-xs text-red-400 font-serif">This foe blocks your escape!</p>
              )}
            </div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>
    </Card>
  );
}
