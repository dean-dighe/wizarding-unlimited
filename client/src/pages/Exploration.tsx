import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Heart, 
  Backpack, 
  Wand2, 
  Map, 
  Scroll,
  Menu,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Swords,
} from "lucide-react";
import { OverworldCanvas, OverworldCanvasRef, ExitPoint } from "@/components/game/OverworldCanvas";
import { useMapTransition } from "@/hooks/use-map-transition";
import { Button } from "@/components/ui/button";

interface MapConnection {
  id: number;
  fromLocation: string;
  toLocation: string;
  connectionType: string;
  fromPosition: { x: number; y: number } | null;
  toPosition: { x: number; y: number } | null;
  transitionText: string | null;
  isHidden: boolean;
}

interface EncounterEntry {
  creatureName: string;
  encounterRate: number;
  minLevel: number;
  maxLevel: number;
  encounterType: string;
  isRare?: boolean;
}

interface CombatState {
  active: boolean;
  creatureName: string;
  creatureLevel: number;
}

interface DialogueState {
  isOpen: boolean;
  speaker: string;
  text: string;
  choices: string[];
  onChoice?: (choice: string) => void;
}

function TouchControls({ 
  onMove, 
  onInteract, 
  onRunToggle, 
  isRunning, 
  disabled 
}: {
  onMove: (direction: "up" | "down" | "left" | "right" | null) => void;
  onInteract: () => void;
  onRunToggle?: () => void;
  isRunning?: boolean;
  disabled?: boolean;
}) {
  const handleTouchStart = (direction: "up" | "down" | "left" | "right") => {
    if (!disabled) onMove(direction);
  };
  const handleTouchEnd = () => onMove(null);

  return (
    <div className="flex items-center justify-between w-full px-4 py-2">
      <div className="relative w-28 h-28">
        {["up", "down", "left", "right"].map((dir) => {
          const Icon = dir === "up" ? ChevronUp : dir === "down" ? ChevronDown : dir === "left" ? ChevronLeft : ChevronRight;
          const positions = {
            up: "top-0 left-1/2 -translate-x-1/2",
            down: "bottom-0 left-1/2 -translate-x-1/2",
            left: "left-0 top-1/2 -translate-y-1/2",
            right: "right-0 top-1/2 -translate-y-1/2",
          };
          return (
            <button
              key={dir}
              className={`absolute ${positions[dir as keyof typeof positions]} w-10 h-10 bg-[#2d2d44]/80 rounded-lg border border-[#6b4c9a] flex items-center justify-center active:bg-[#6b4c9a]/50 touch-none`}
              onTouchStart={() => handleTouchStart(dir as "up" | "down" | "left" | "right")}
              onTouchEnd={handleTouchEnd}
              onMouseDown={() => handleTouchStart(dir as "up" | "down" | "left" | "right")}
              onMouseUp={handleTouchEnd}
              onMouseLeave={handleTouchEnd}
              data-testid={`touch-${dir}`}
            >
              <Icon className="w-6 h-6 text-[#c0a0e0]" />
            </button>
          );
        })}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-[#1a1a2e] rounded-full border border-[#4a4a6a]" />
      </div>

      <button
        className={`w-12 h-12 rounded-lg border flex items-center justify-center touch-none text-xs font-bold ${
          isRunning
            ? "bg-[#6b4c9a] border-[#8b6cc0] text-white"
            : "bg-[#2d2d44]/80 border-[#6b4c9a] text-[#c0a0e0]"
        }`}
        onClick={onRunToggle}
        data-testid="touch-run"
      >
        RUN
      </button>

      <button
        className="w-16 h-16 bg-[#6b4c9a]/80 rounded-full border-2 border-[#8b6cc0] flex items-center justify-center active:bg-[#8b6cc0] active:scale-95 transition-transform touch-none shadow-[0_0_15px_rgba(107,76,154,0.5)]"
        onTouchStart={onInteract}
        onMouseDown={onInteract}
        disabled={disabled}
        data-testid="touch-interact"
      >
        <CircleDot className="w-8 h-8 text-white" />
      </button>
    </div>
  );
}

export default function Exploration() {
  const canvasRef = useRef<OverworldCanvasRef>(null);
  const [currentLocation, setCurrentLocation] = useState("The Undercroft");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionText, setTransitionText] = useState<string | null>(null);
  const [spawnPosition, setSpawnPosition] = useState<{ x: number; y: number } | null>(null);
  const [playerPosition, setPlayerPosition] = useState<{ x: number; y: number } | null>(null);
  const [stepsSinceEncounter, setStepsSinceEncounter] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 480, height: 360 });
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);
  
  const testMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("testMode") === "1";

  const [combat, setCombat] = useState<CombatState>({ active: false, creatureName: "", creatureLevel: 1 });
  const [dialogue, setDialogue] = useState<DialogueState>({ isOpen: false, speaker: "", text: "", choices: [] });
  const [canvasNearbyExit, setCanvasNearbyExit] = useState<ExitPoint | null>(null);
  
  const [playerStats] = useState({ health: 100, maxHealth: 100, level: 5, experience: 350, galleons: 75 });
  const [inventory] = useState(["Wand", "Hogwarts Robes", "Potion", "Map"]);

  const { data: connections = [] } = useQuery<MapConnection[]>({
    queryKey: ["/api/rpg/map-connections", currentLocation],
    enabled: !!currentLocation,
  });

  const { data: encounters = [] } = useQuery<EncounterEntry[]>({
    queryKey: ["/api/rpg/encounters", currentLocation],
    enabled: !!currentLocation && !combat.active,
  });

  const exitPoints: ExitPoint[] = useMemo(() => 
    connections
      .filter(conn => conn.fromPosition)
      .map(conn => ({
        id: String(conn.id),
        toLocation: conn.toLocation,
        connectionType: conn.connectionType,
        x: conn.fromPosition!.x,
        y: conn.fromPosition!.y,
        isHidden: conn.isHidden,
      })),
    [connections]
  );

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      const isLandscape = window.innerWidth > window.innerHeight;
      setIsMobile(mobile);
      
      if (mobile) {
        if (isLandscape) {
          const maxHeight = window.innerHeight - 80;
          const aspectRatio = 4 / 3;
          const height = Math.min(maxHeight, 300);
          const width = height * aspectRatio;
          setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
        } else {
          const maxWidth = Math.min(window.innerWidth - 16, 480);
          const aspectRatio = 4 / 3;
          const height = Math.min(maxWidth / aspectRatio, window.innerHeight * 0.45);
          const width = height * aspectRatio;
          setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      } else {
        setCanvasSize({ width: 480, height: 360 });
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    window.addEventListener("orientationchange", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
      window.removeEventListener("orientationchange", checkMobile);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") setIsRunning(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") setIsRunning(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleTransitionStart = useCallback((destination: string, text: string | null) => {
    setIsTransitioning(true);
    setTransitionText(text);
    canvasRef.current?.pauseMovement();
  }, []);

  const handleTransitionComplete = useCallback((destination: string, toPos: { x: number; y: number } | null) => {
    setCurrentLocation(destination);
    setSpawnPosition(toPos || { x: canvasSize.width / 2, y: canvasSize.height - 64 });
    setStepsSinceEncounter(0);
    
    setTimeout(() => {
      setIsTransitioning(false);
      setTransitionText(null);
      canvasRef.current?.resumeMovement();
    }, 400);
  }, [canvasSize.width, canvasSize.height]);

  const { nearbyExit, initiateTransition } = useMapTransition({
    currentLocation,
    playerPosition,
    proximityThreshold: 40,
    onTransitionStart: handleTransitionStart,
    onTransitionComplete: handleTransitionComplete,
  });

  const handlePlayerMove = useCallback((position: { x: number; y: number }) => {
    setPlayerPosition(position);
    
    if (lastPositionRef.current) {
      const dx = position.x - lastPositionRef.current.x;
      const dy = position.y - lastPositionRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 16) {
        setStepsSinceEncounter(prev => prev + 1);
        lastPositionRef.current = position;
      }
    } else {
      lastPositionRef.current = position;
    }
  }, []);

  useEffect(() => {
    if (combat.active || isTransitioning || encounters.length === 0) return;
    
    const EXIT_SAFE_ZONE = 60;
    const isNearExit = playerPosition && exitPoints.some(exit => {
      const dx = playerPosition.x - exit.x;
      const dy = playerPosition.y - exit.y;
      return Math.sqrt(dx * dx + dy * dy) < EXIT_SAFE_ZONE;
    });
    
    if (isNearExit) return;
    
    const minSteps = testMode ? 8 : 5;
    if (stepsSinceEncounter < minSteps) return;

    let totalRate = 0;
    for (const enc of encounters) totalRate += enc.encounterRate;
    
    const roll = Math.random() * 100;
    const baseThreshold = testMode ? 15 : Math.min(totalRate / 10, 15);
    const threshold = baseThreshold;
    
    if (roll < threshold) {
      let cumulative = 0;
      const creatureRoll = Math.random() * totalRate;
      
      for (const enc of encounters) {
        cumulative += enc.encounterRate;
        if (creatureRoll < cumulative) {
          const level = Math.floor(Math.random() * (enc.maxLevel - enc.minLevel + 1) + enc.minLevel);
          setStepsSinceEncounter(0);
          setCombat({ active: true, creatureName: enc.creatureName, creatureLevel: level });
          canvasRef.current?.pauseMovement();
          return;
        }
      }
    }
  }, [stepsSinceEncounter, encounters, combat.active, isTransitioning, testMode, playerPosition, exitPoints]);

  const handleExitApproach = useCallback((exit: ExitPoint | null) => {
    setCanvasNearbyExit(exit);
  }, []);

  const triggerCanvasTransition = useCallback(() => {
    if (!canvasNearbyExit || isTransitioning) return;
    
    const conn = connections.find(c => c.id === Number(canvasNearbyExit.id));
    if (!conn) return;
    
    handleTransitionStart(conn.toLocation, conn.transitionText);
    
    setTimeout(() => {
      handleTransitionComplete(conn.toLocation, conn.toPosition);
    }, 600);
  }, [canvasNearbyExit, connections, isTransitioning, handleTransitionStart, handleTransitionComplete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "e" || e.key === "E" || e.key === " ") && canvasNearbyExit && !combat.active && !dialogue.isOpen && !isTransitioning) {
        e.preventDefault();
        triggerCanvasTransition();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canvasNearbyExit, triggerCanvasTransition, combat.active, dialogue.isOpen, isTransitioning]);

  const handleTouchMove = useCallback((direction: "up" | "down" | "left" | "right" | null) => {
    const canvas = document.querySelector('[data-testid="exploration-canvas"] canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const keyMap: Record<string, string> = { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" };
    if (direction) {
      const event = new KeyboardEvent("keydown", { code: keyMap[direction], bubbles: true });
      canvas.dispatchEvent(event);
    } else {
      ["KeyW", "KeyS", "KeyA", "KeyD"].forEach(code => {
        const event = new KeyboardEvent("keyup", { code, bubbles: true });
        canvas.dispatchEvent(event);
      });
    }
  }, []);

  const handleTouchInteract = useCallback(() => {
    if (canvasNearbyExit) {
      triggerCanvasTransition();
    }
  }, [canvasNearbyExit, triggerCanvasTransition]);

  const closeCombat = () => {
    setCombat({ active: false, creatureName: "", creatureLevel: 1 });
    canvasRef.current?.resumeMovement();
    setTimeout(() => {
      const canvas = document.querySelector('[data-testid="exploration-canvas"] canvas') as HTMLCanvasElement;
      canvas?.focus();
    }, 100);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#0a0a12] flex flex-col landscape:flex-row lg:flex-row overflow-hidden">
      <div className="flex-1 flex flex-col landscape:flex-row lg:flex-row">
        <div className="flex-shrink-0 flex flex-col items-center justify-center p-2 landscape:p-2 lg:p-4">
          <div className="flex items-center justify-between w-full max-w-[480px] px-2 mb-2">
            <h1 className="text-[#8b6cc0] font-serif text-sm lg:text-lg truncate">{currentLocation}</h1>
            <div className="flex items-center gap-2 lg:gap-4">
              <div className="flex items-center gap-1 text-red-400">
                <Heart className="w-3 h-3 lg:w-4 lg:h-4 fill-current" />
                <span className="text-xs lg:text-sm font-mono">{playerStats.health}/{playerStats.maxHealth}</span>
              </div>
              <div className="flex items-center gap-1 text-purple-400">
                <Backpack className="w-3 h-3 lg:w-4 lg:h-4" />
                <span className="text-xs lg:text-sm font-mono">{inventory.length}</span>
              </div>
              <div className="flex items-center gap-1 text-yellow-400">
                <span className="text-xs lg:text-sm font-mono">Lv.{playerStats.level}</span>
              </div>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-[#6b4c9a] hover:text-[#8b6cc0]"
                data-testid="button-menu"
              >
                <Menu className="w-4 h-4 lg:w-5 lg:h-5" />
              </button>
            </div>
          </div>

          <div className="relative" data-testid="exploration-canvas">
            <OverworldCanvas
              ref={canvasRef}
              locationName={currentLocation}
              playerName="Wizard"
              width={canvasSize.width}
              height={canvasSize.height}
              exitPoints={exitPoints}
              onPlayerMove={handlePlayerMove}
              onExitApproach={handleExitApproach}
              isPaused={isTransitioning || combat.active || dialogue.isOpen}
              isRunning={isRunning}
              spawnPosition={spawnPosition || undefined}
            />

            <AnimatePresence>
              {isTransitioning && (
                <motion.div
                  className="absolute inset-0 bg-black z-50 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {transitionText && (
                    <motion.p
                      className="text-[#8b6cc0] text-center font-serif italic px-8"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      {transitionText}
                    </motion.p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {combat.active && (
                <motion.div
                  className="absolute inset-0 bg-[#0a0a12]/95 z-50 flex flex-col items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="text-center">
                    <Swords className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-serif text-[#c0a0e0] mb-2">Wild Encounter!</h2>
                    <p className="text-lg text-[#8b6cc0] mb-1">{combat.creatureName}</p>
                    <p className="text-sm text-[#6b4c9a] mb-6">Level {combat.creatureLevel}</p>
                    <div className="flex gap-3 justify-center flex-wrap">
                      <Button variant="outline" className="border-red-500 text-red-400" onClick={closeCombat} data-testid="button-fight">
                        <Wand2 className="w-4 h-4 mr-2" />
                        Fight
                      </Button>
                      <Button variant="outline" className="border-yellow-500 text-yellow-400" onClick={closeCombat} data-testid="button-run">
                        Run Away
                      </Button>
                    </div>
                    <p className="text-xs text-[#4a4a6a] mt-4">(Combat system coming soon)</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {nearbyExit && !isTransitioning && !combat.active && (
            <div className="mt-2 text-center">
              <motion.div
                className="inline-block bg-[#1a1a2e]/90 border border-[#6b4c9a] rounded px-3 py-1.5"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span className="text-[#8b6cc0] text-sm font-mono">
                  [E] {nearbyExit.connection.connectionType === "stairs" ? "Climb to" : 
                       nearbyExit.connection.connectionType === "hidden" ? "Secret passage to" : 
                       "Enter"} {nearbyExit.connection.toLocation}
                </span>
              </motion.div>
            </div>
          )}

          {isMobile && (
            <TouchControls
              onMove={handleTouchMove}
              onInteract={handleTouchInteract}
              onRunToggle={() => setIsRunning(!isRunning)}
              isRunning={isRunning}
              disabled={combat.active || dialogue.isOpen || isTransitioning}
            />
          )}

          {!isMobile && (
            <div className="text-center mt-2">
              <p className="text-[#4a4a6a] text-xs">
                WASD to move | E to interact | SHIFT to run
              </p>
            </div>
          )}

          <div className="mt-2 flex gap-2 text-xs text-[#4a4a6a]">
            <span>Exits: {exitPoints.length}</span>
            <span>|</span>
            <span>Steps: {stepsSinceEncounter}</span>
            {encounters.length > 0 && (
              <>
                <span>|</span>
                <span>Encounters: {encounters.length} types</span>
              </>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showMenu && (
            <motion.div
              className="absolute right-2 top-14 lg:relative lg:right-0 lg:top-0 lg:flex-1 lg:max-w-xs z-40"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="bg-[#1a1a2e]/95 border border-[#4a4a6a] rounded-lg p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[#8b6cc0] font-serif">Menu</h2>
                  <button onClick={() => setShowMenu(false)} className="text-[#6b4c9a] hover:text-[#8b6cc0]" data-testid="button-close-menu">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#c0a0e0]">
                    <Map className="w-4 h-4" />
                    <span className="text-sm">{currentLocation}</span>
                  </div>
                  <div className="border-t border-[#4a4a6a]/50 pt-3">
                    <h3 className="text-xs text-[#6b4c9a] mb-2">Inventory</h3>
                    <div className="flex flex-wrap gap-1">
                      {inventory.map((item, i) => (
                        <span key={i} className="text-xs bg-[#2d2d44] px-2 py-1 rounded text-[#c0a0e0]">{item}</span>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-[#4a4a6a]/50 pt-3">
                    <h3 className="text-xs text-[#6b4c9a] mb-2">Stats</h3>
                    <div className="text-xs text-[#c0a0e0] space-y-1">
                      <div>Level: {playerStats.level}</div>
                      <div>XP: {playerStats.experience}</div>
                      <div>Galleons: {playerStats.galleons}</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
