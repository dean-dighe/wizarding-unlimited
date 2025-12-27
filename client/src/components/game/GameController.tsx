import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { OverworldCanvas, OverworldCanvasRef, ExitPoint } from "./OverworldCanvas";
import { useMapTransition } from "@/hooks/use-map-transition";

type GameMode = "overworld" | "story" | "combat" | "menu" | "dialogue";

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

interface GameControllerProps {
  initialLocation?: string;
  playerName: string;
  playerSpriteUrl?: string;
  onModeChange?: (mode: GameMode) => void;
  onEncounter?: (creature: string, level: number) => void;
  onDialogue?: (text: string, speaker?: string) => void;
  onLocationChange?: (location: string) => void;
  width?: number;
  height?: number;
}

export function GameController({
  initialLocation = "The Undercroft",
  playerName,
  playerSpriteUrl,
  onModeChange,
  onEncounter,
  onDialogue,
  onLocationChange,
  width = 480,
  height = 360,
}: GameControllerProps) {
  const [currentLocation, setCurrentLocation] = useState(initialLocation);
  const [gameMode, setGameMode] = useState<GameMode>("overworld");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionText, setTransitionText] = useState<string | null>(null);
  const [spawnPosition, setSpawnPosition] = useState<{ x: number; y: number } | null>(null);
  const [playerPosition, setPlayerPosition] = useState<{ x: number; y: number } | null>(null);
  const [stepsSinceLastEncounter, setStepsSinceLastEncounter] = useState(0);
  
  const canvasRef = useRef<OverworldCanvasRef>(null);
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);

  const { data: connections = [] } = useQuery<MapConnection[]>({
    queryKey: ["/api/rpg/map-connections", currentLocation],
    enabled: !!currentLocation,
  });

  const { data: encounters = [] } = useQuery<EncounterEntry[]>({
    queryKey: ["/api/rpg/encounters", currentLocation],
    enabled: !!currentLocation && gameMode === "overworld",
  });

  const exitPoints: ExitPoint[] = connections
    .filter(conn => conn.fromPosition)
    .map(conn => ({
      id: String(conn.id),
      toLocation: conn.toLocation,
      connectionType: conn.connectionType,
      x: conn.fromPosition!.x,
      y: conn.fromPosition!.y,
      isHidden: conn.isHidden,
    }));

  const handleModeChange = useCallback((mode: GameMode) => {
    setGameMode(mode);
    onModeChange?.(mode);
  }, [onModeChange]);

  const handleTransitionStart = useCallback((destination: string, text: string | null) => {
    setIsTransitioning(true);
    setTransitionText(text);
    canvasRef.current?.pauseMovement();
  }, []);

  const handleTransitionComplete = useCallback((destination: string, toPos: { x: number; y: number } | null) => {
    setCurrentLocation(destination);
    setSpawnPosition(toPos || { x: width / 2, y: height - 64 });
    setStepsSinceLastEncounter(0);
    onLocationChange?.(destination);
    
    setTimeout(() => {
      setIsTransitioning(false);
      setTransitionText(null);
      canvasRef.current?.resumeMovement();
    }, 400);
  }, [width, height, onLocationChange]);

  const {
    nearbyExit,
    initiateTransition,
    getExitPromptText,
  } = useMapTransition({
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
        setStepsSinceLastEncounter(prev => prev + 1);
        lastPositionRef.current = position;
      }
    } else {
      lastPositionRef.current = position;
    }
  }, []);

  useEffect(() => {
    if (gameMode !== "overworld" || isTransitioning || encounters.length === 0) return;
    if (stepsSinceLastEncounter < 5) return;

    const checkEncounter = () => {
      let totalRate = 0;
      for (const enc of encounters) {
        totalRate += enc.encounterRate;
      }
      
      const roll = Math.random() * 100;
      const threshold = Math.min(totalRate / 10, 15);
      
      if (roll < threshold) {
        let cumulative = 0;
        const creatureRoll = Math.random() * totalRate;
        
        for (const enc of encounters) {
          cumulative += enc.encounterRate;
          if (creatureRoll < cumulative) {
            const level = Math.floor(
              Math.random() * (enc.maxLevel - enc.minLevel + 1) + enc.minLevel
            );
            
            setStepsSinceLastEncounter(0);
            handleModeChange("combat");
            onEncounter?.(enc.creatureName, level);
            return;
          }
        }
      }
    };

    checkEncounter();
  }, [stepsSinceLastEncounter, encounters, gameMode, isTransitioning, handleModeChange, onEncounter]);

  const handleExitApproach = useCallback((exit: ExitPoint | null) => {
    if (exit) {
      canvasRef.current?.showInteractionPrompt(`[E] To ${exit.toLocation}`);
    } else {
      canvasRef.current?.hideInteractionPrompt();
    }
  }, []);

  const handleInteraction = useCallback((obj: any) => {
    if (obj.type === "npc") {
      handleModeChange("dialogue");
      onDialogue?.(obj.dialogue || "...", obj.name);
    } else if (obj.type === "trigger") {
      handleModeChange("story");
      onDialogue?.(obj.dialogue || "Something happens...", undefined);
    }
  }, [handleModeChange, onDialogue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "e" || e.key === "E" || e.key === " ") && nearbyExit) {
        e.preventDefault();
        initiateTransition();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nearbyExit, initiateTransition]);

  return (
    <div className="relative" style={{ width, height }}>
      <OverworldCanvas
        ref={canvasRef}
        locationName={currentLocation}
        playerName={playerName}
        playerSpriteUrl={playerSpriteUrl}
        width={width}
        height={height}
        exitPoints={exitPoints}
        onPlayerMove={handlePlayerMove}
        onExitApproach={handleExitApproach}
        onInteraction={handleInteraction}
        isPaused={gameMode !== "overworld" || isTransitioning}
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

      <div className="absolute top-2 left-2 z-30 pointer-events-none">
        <div className="bg-[#0a0a12]/80 border border-[#6b4c9a]/50 rounded px-2 py-1">
          <span className="text-[#c0a0e0] text-xs font-serif">{currentLocation}</span>
        </div>
      </div>

      {nearbyExit && !isTransitioning && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <motion.div
            className="bg-[#1a1a2e]/90 border border-[#6b4c9a] rounded px-3 py-1.5"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="text-[#8b6cc0] text-sm font-mono">
              {getExitPromptText()}
            </span>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default GameController;
