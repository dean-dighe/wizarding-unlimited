import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SpellColorTheme {
  primary: string;
  secondary: string;
  particle: string;
}

interface AnimationConfig {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameRate: number;
  loop: boolean;
  phases?: {
    setup: { start: number; end: number };
    cast: { start: number; end: number };
    impact: { start: number; end: number };
  };
}

interface SpellAnimationProps {
  spellName: string;
  onComplete?: () => void;
  position?: { x: number; y: number };
  scale?: number;
}

export function SpellAnimation({
  spellName,
  onComplete,
  position = { x: 50, y: 50 },
  scale = 1,
}: SpellAnimationProps) {
  const [spriteSheetUrl, setSpriteSheetUrl] = useState<string | null>(null);
  const [animationConfig, setAnimationConfig] = useState<AnimationConfig | null>(null);
  const [colorTheme, setColorTheme] = useState<SpellColorTheme>({
    primary: "#FFD700",
    secondary: "#FFFACD",
    particle: "#FFFFFF",
  });
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [useFallback, setUseFallback] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const fetchAnimation = async () => {
      try {
        const res = await fetch(`/api/spell-animations/${encodeURIComponent(spellName)}`);
        const data = await res.json();
        
        if (!isMountedRef.current) return;
        
        if (data.colorTheme) {
          setColorTheme(data.colorTheme);
        }
        
        if (data.status === "ready" && data.spriteSheetUrl) {
          setSpriteSheetUrl(data.spriteSheetUrl);
          setAnimationConfig(data.animationConfig || {
            frameWidth: 256,
            frameHeight: 128,
            frameCount: 8,
            frameRate: 12,
            loop: false,
          });
          setUseFallback(false);
        } else {
          setUseFallback(true);
          fetch("/api/spell-animations/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spellName }),
          }).catch(console.error);
        }
      } catch (error) {
        console.error("[SpellAnimation] Failed to fetch:", error);
        setUseFallback(true);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchAnimation();
  }, [spellName]);

  useEffect(() => {
    if (!animationConfig || !spriteSheetUrl || useFallback) return;
    
    const { frameCount, frameRate, loop } = animationConfig;
    const frameDuration = 1000 / frameRate;
    
    frameIntervalRef.current = setInterval(() => {
      setCurrentFrame(prev => {
        const next = prev + 1;
        if (next >= frameCount) {
          if (!loop) {
            if (frameIntervalRef.current) {
              clearInterval(frameIntervalRef.current);
            }
            setIsComplete(true);
            onComplete?.();
            return frameCount - 1;
          }
          return 0;
        }
        return next;
      });
    }, frameDuration);
    
    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
    };
  }, [animationConfig, spriteSheetUrl, useFallback, onComplete]);

  const handleFallbackComplete = useCallback(() => {
    setIsComplete(true);
    onComplete?.();
  }, [onComplete]);

  if (isComplete) return null;

  if (isLoading) return null;

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: `translate(-50%, -50%) scale(${scale})`,
    pointerEvents: "none",
    zIndex: 100,
  };

  if (useFallback) {
    return (
      <ProceduralSpellEffect
        colorTheme={colorTheme}
        style={containerStyle}
        onComplete={handleFallbackComplete}
      />
    );
  }

  if (!spriteSheetUrl || !animationConfig) return null;

  const { frameWidth, frameHeight } = animationConfig;
  const framesPerRow = 4;
  const frameX = (currentFrame % framesPerRow) * frameWidth;
  const frameY = Math.floor(currentFrame / framesPerRow) * frameHeight;

  return (
    <div style={containerStyle} data-testid={`spell-animation-${spellName.toLowerCase().replace(/\s+/g, "-")}`}>
      <div
        style={{
          width: frameWidth,
          height: frameHeight,
          backgroundImage: `url(${spriteSheetUrl})`,
          backgroundPosition: `-${frameX}px -${frameY}px`,
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

function ProceduralSpellEffect({
  colorTheme,
  style,
  onComplete,
}: {
  colorTheme: SpellColorTheme;
  style: React.CSSProperties;
  onComplete: () => void;
}) {
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false);
      onComplete();
    }, 1200);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    angle: (i * 30) * (Math.PI / 180),
    delay: i * 0.03,
  }));

  return (
    <AnimatePresence>
      {isAnimating && (
        <motion.div
          style={{
            ...style,
            width: 200,
            height: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="spell-effect-procedural"
        >
          <motion.div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${colorTheme.primary} 0%, ${colorTheme.secondary} 50%, transparent 70%)`,
              boxShadow: `0 0 40px ${colorTheme.primary}, 0 0 80px ${colorTheme.secondary}`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: [0, 1.5, 0.8, 1.2, 0],
              opacity: [0, 1, 1, 0.8, 0],
            }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
          
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              style={{
                position: "absolute",
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: colorTheme.particle,
                boxShadow: `0 0 10px ${colorTheme.particle}`,
              }}
              initial={{ 
                x: 0, 
                y: 0, 
                scale: 0,
                opacity: 1,
              }}
              animate={{ 
                x: Math.cos(particle.angle) * 100, 
                y: Math.sin(particle.angle) * 100,
                scale: [0, 1, 0.5],
                opacity: [1, 1, 0],
              }}
              transition={{ 
                duration: 0.8, 
                delay: particle.delay + 0.2,
                ease: "easeOut",
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function useSpellDetection(text: string, knownSpells: string[]): string | null {
  const detectedSpell = knownSpells.find(spell => {
    const regex = new RegExp(`\\b${spell}\\b`, "i");
    return regex.test(text);
  });
  return detectedSpell || null;
}

export const COMMON_SPELLS = [
  "Lumos", "Nox", "Wingardium Leviosa", "Alohomora", "Reparo",
  "Incendio", "Flipendo", "Expelliarmus", "Rictusempra", "Stupefy",
  "Petrificus Totalus", "Expecto Patronum", "Riddikulus", "Protego",
  "Accio", "Aguamenti", "Lumos Maxima", "Obliviate", "Confundo",
  "Impedimenta", "Reducto", "Diffindo", "Silencio", "Episkey",
];
