import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { PortraitPosition, PortraitExpression, SceneCharacter } from "@shared/schema";
import { SpellAnimation } from "./SpellAnimation";

interface SceneStageProps {
  locationName: string;
  characters?: SceneCharacter[];
  activeSpell?: string | null;
  onSpellComplete?: () => void;
  width?: number;
  height?: number;
  className?: string;
}

interface BackgroundData {
  status: "pending" | "generating" | "ready" | "failed";
  imageUrl?: string;
}

interface PortraitData {
  status: "pending" | "generating" | "ready" | "failed";
  imageUrl?: string;
}

const POSITION_STYLES: Record<PortraitPosition, { left: string; transform: string }> = {
  "far-left": { left: "5%", transform: "translateX(0)" },
  "left": { left: "20%", transform: "translateX(-50%)" },
  "center": { left: "50%", transform: "translateX(-50%)" },
  "right": { left: "80%", transform: "translateX(-50%)" },
  "far-right": { left: "95%", transform: "translateX(-100%)" },
};

export function SceneStage({
  locationName,
  characters = [],
  activeSpell = null,
  onSpellComplete,
  width = 640,
  height = 360,
  className = "",
}: SceneStageProps) {
  const [background, setBackground] = useState<BackgroundData>({ status: "pending" });
  const [portraits, setPortraits] = useState<Record<string, PortraitData>>({});
  
  const bgIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const portraitIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const isMountedRef = useRef(true);

  const clearBgInterval = useCallback(() => {
    if (bgIntervalRef.current) {
      clearInterval(bgIntervalRef.current);
      bgIntervalRef.current = null;
    }
  }, []);

  const clearAllPortraitIntervals = useCallback(() => {
    portraitIntervalsRef.current.forEach((interval) => clearInterval(interval));
    portraitIntervalsRef.current.clear();
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearBgInterval();
      clearAllPortraitIntervals();
    };
  }, [clearBgInterval, clearAllPortraitIntervals]);

  useEffect(() => {
    if (!locationName) return;

    setBackground({ status: "pending" });
    clearBgInterval();

    const fetchBackground = async () => {
      try {
        const res = await fetch(`/api/vn-assets/background/${encodeURIComponent(locationName)}`);
        const data = await res.json();
        if (!isMountedRef.current) return;
        setBackground(data);

        if (data.status === "generating" || data.status === "pending") {
          bgIntervalRef.current = setInterval(async () => {
            try {
              const pollRes = await fetch(`/api/vn-assets/background/${encodeURIComponent(locationName)}/status`);
              const pollData = await pollRes.json();
              if (!isMountedRef.current) return;
              setBackground(pollData);
              if (pollData.status === "ready" || pollData.status === "failed") {
                clearBgInterval();
              }
            } catch {
              clearBgInterval();
            }
          }, 3000);
        }
      } catch (error) {
        console.error("[SceneStage] Failed to fetch background:", error);
        if (isMountedRef.current) setBackground({ status: "failed" });
      }
    };

    fetchBackground();

    return () => {
      clearBgInterval();
    };
  }, [locationName, clearBgInterval]);

  useEffect(() => {
    if (characters.length === 0) {
      clearAllPortraitIntervals();
      return;
    }

    const characterKeys = new Set(characters.map(c => `${c.characterName}_${c.expression}`));
    portraitIntervalsRef.current.forEach((interval, key) => {
      if (!characterKeys.has(key)) {
        clearInterval(interval);
        portraitIntervalsRef.current.delete(key);
      }
    });

    const fetchPortraits = async () => {
      for (const char of characters) {
        const key = `${char.characterName}_${char.expression}`;
        try {
          const res = await fetch(
            `/api/vn-assets/portrait/${encodeURIComponent(char.characterName)}?expression=${char.expression}`
          );
          const data = await res.json();
          if (!isMountedRef.current) return;
          setPortraits(prev => ({ ...prev, [key]: data }));

          if ((data.status === "generating" || data.status === "pending") && !portraitIntervalsRef.current.has(key)) {
            const interval = setInterval(async () => {
              try {
                const pollRes = await fetch(
                  `/api/vn-assets/portrait/${encodeURIComponent(char.characterName)}/status?expression=${char.expression}`
                );
                const pollData = await pollRes.json();
                if (!isMountedRef.current) return;
                setPortraits(prev => ({ ...prev, [key]: pollData }));
                if (pollData.status === "ready" || pollData.status === "failed") {
                  const existingInterval = portraitIntervalsRef.current.get(key);
                  if (existingInterval) {
                    clearInterval(existingInterval);
                    portraitIntervalsRef.current.delete(key);
                  }
                }
              } catch {
                const existingInterval = portraitIntervalsRef.current.get(key);
                if (existingInterval) {
                  clearInterval(existingInterval);
                  portraitIntervalsRef.current.delete(key);
                }
              }
            }, 3000);
            portraitIntervalsRef.current.set(key, interval);
          }
        } catch (error) {
          console.error(`[SceneStage] Failed to fetch portrait for ${char.characterName}:`, error);
          if (isMountedRef.current) {
            setPortraits(prev => ({ ...prev, [key]: { status: "failed" } }));
          }
        }
      }
    };

    fetchPortraits();

    return () => {
      clearAllPortraitIntervals();
    };
  }, [characters, clearAllPortraitIntervals]);

  const isLoading = background.status === "generating" || background.status === "pending";

  return (
    <div
      className={`relative overflow-hidden rounded-md ${className}`}
      style={{ width, height }}
      data-testid="scene-stage"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-slate-900">
        <AnimatePresence mode="wait">
          {background.status === "ready" && background.imageUrl ? (
            <motion.img
              key={background.imageUrl}
              src={background.imageUrl}
              alt={locationName}
              className="absolute inset-0 w-full h-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              data-testid="background-image"
            />
          ) : (
            <motion.div
              key="loading"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="text-center text-white/70">
                {isLoading ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm font-serif">Painting {locationName}...</p>
                  </>
                ) : (
                  <p className="text-sm font-serif">{locationName}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute inset-0 pointer-events-none">
        <AnimatePresence>
          {characters.map((char) => {
            const key = `${char.characterName}_${char.expression}`;
            const portrait = portraits[key];
            const positionStyle = POSITION_STYLES[char.position];

            if (!portrait || portrait.status !== "ready" || !portrait.imageUrl) {
              return null;
            }

            return (
              <motion.div
                key={key}
                className="absolute bottom-0"
                style={{
                  left: positionStyle.left,
                  transform: positionStyle.transform,
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: char.speaking ? 1 : 0.9,
                  y: 0,
                  scale: char.speaking ? 1.02 : 1,
                }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3 }}
              >
                <img
                  src={portrait.imageUrl}
                  alt={char.characterName}
                  className="h-[85%] max-h-[300px] w-auto object-contain drop-shadow-lg"
                  style={{
                    filter: char.speaking ? "none" : "brightness(0.85)",
                  }}
                  data-testid={`portrait-${char.characterName.toLowerCase().replace(/\s+/g, "-")}`}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {activeSpell && (
        <SpellAnimation
          spellName={activeSpell}
          position={{ x: 50, y: 40 }}
          scale={1.5}
          onComplete={onSpellComplete}
        />
      )}

      <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-xs text-white/80 font-serif">
        {locationName}
      </div>
    </div>
  );
}

export default SceneStage;
