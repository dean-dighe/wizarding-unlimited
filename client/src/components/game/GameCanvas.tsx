import { useEffect, useRef, useState, useCallback } from "react";
import Phaser from "phaser";
import { DEFAULT_ANIMATION_CONFIG } from "@shared/schema";

interface CharacterPosition {
  x: number;
  y: number;
  facing: "down" | "up" | "left" | "right";
}

interface NPCData {
  name: string;
  spriteUrl: string;
  position: CharacterPosition;
}

interface GameCanvasProps {
  locationName: string;
  playerName: string;
  playerSpriteUrl?: string;
  npcs?: NPCData[];
  onPlayerMove?: (target: { x: number; y: number }) => void;
  onInteraction?: (npcName: string) => void;
  width?: number;
  height?: number;
}

interface MapData {
  locationName: string;
  mapCode: string;
  tilesetUrl: string | null;
  spawnPoints: Record<string, { x: number; y: number }>;
}

interface SpriteData {
  characterName: string;
  spriteSheetUrl: string;
  spriteWidth: number;
  spriteHeight: number;
  frameCount: number;
  animationConfig: typeof DEFAULT_ANIMATION_CONFIG;
}

export function GameCanvas({
  locationName,
  playerName,
  playerSpriteUrl,
  npcs = [],
  onPlayerMove,
  onInteraction,
  width = 640,
  height = 480,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);

  const fetchOrGenerateMap = useCallback(async (location: string): Promise<MapData | null> => {
    try {
      let response = await fetch(`/api/game-assets/map/${encodeURIComponent(location)}`);
      
      if (response.status === 404) {
        response = await fetch("/api/game-assets/map/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationName: location }),
        });
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch map: ${response.status}`);
      }
      
      return await response.json();
    } catch (err) {
      console.error("Error fetching map:", err);
      return null;
    }
  }, []);

  const fetchOrGenerateSprite = useCallback(async (
    characterName: string, 
    description: string,
    isProtagonist = false
  ): Promise<SpriteData | null> => {
    try {
      let response = await fetch(`/api/game-assets/sprite/${encodeURIComponent(characterName)}`);
      
      if (response.status === 404) {
        response = await fetch("/api/game-assets/sprite/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterName, characterDescription: description, isProtagonist }),
        });
        
        if (response.ok) {
          await new Promise(resolve => setTimeout(resolve, 500));
          response = await fetch(`/api/game-assets/sprite/${encodeURIComponent(characterName)}`);
        }
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch sprite: ${response.status}`);
      }
      
      return await response.json();
    } catch (err) {
      console.error("Error fetching sprite:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current || gameRef.current) return;

    const initGame = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const map = await fetchOrGenerateMap(locationName);
        setMapData(map);

        const config: Phaser.Types.Core.GameConfig = {
          type: Phaser.AUTO,
          width,
          height,
          parent: canvasRef.current!,
          backgroundColor: "#2d2d2d",
          pixelArt: true,
          physics: {
            default: "arcade",
            arcade: {
              gravity: { x: 0, y: 0 },
              debug: false,
            },
          },
          scene: {
            key: "GameScene",
            preload: function(this: Phaser.Scene) {
              if (playerSpriteUrl) {
                this.load.spritesheet("player", playerSpriteUrl, {
                  frameWidth: 32,
                  frameHeight: 32,
                });
              }
              
              npcs.forEach((npc, i) => {
                if (npc.spriteUrl) {
                  this.load.spritesheet(`npc_${i}`, npc.spriteUrl, {
                    frameWidth: 32,
                    frameHeight: 32,
                  });
                }
              });

              if (map?.tilesetUrl) {
                this.load.image("tileset", map.tilesetUrl);
              }
            },
            create: function(this: Phaser.Scene) {
              const graphics = this.add.graphics();
              
              graphics.fillStyle(0x4a4a4a, 1);
              for (let x = 0; x < Math.ceil(width / 32); x++) {
                for (let y = 0; y < Math.ceil(height / 32); y++) {
                  if (x === 0 || x === Math.ceil(width / 32) - 1 || 
                      y === 0 || y === Math.ceil(height / 32) - 1) {
                    graphics.fillRect(x * 32, y * 32, 32, 32);
                  }
                }
              }
              
              graphics.fillStyle(0x8b7355, 1);
              for (let x = 1; x < Math.ceil(width / 32) - 1; x++) {
                for (let y = 1; y < Math.ceil(height / 32) - 1; y++) {
                  graphics.fillRect(x * 32, y * 32, 32, 32);
                }
              }

              const spawnPoint = map?.spawnPoints?.entrance || { x: width / 2, y: height - 60 };
              
              if (playerSpriteUrl) {
                const player = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, "player");
                player.setCollideWorldBounds(true);
                player.setDepth(10);
                
                this.anims.create({
                  key: "player_idle",
                  frames: [{ key: "player", frame: 0 }],
                  frameRate: 1,
                  repeat: -1,
                });
                
                this.anims.create({
                  key: "player_walk_down",
                  frames: this.anims.generateFrameNumbers("player", { start: 0, end: 2 }),
                  frameRate: 8,
                  repeat: -1,
                });
                
                this.anims.create({
                  key: "player_walk_up",
                  frames: this.anims.generateFrameNumbers("player", { start: 3, end: 5 }),
                  frameRate: 8,
                  repeat: -1,
                });
                
                this.anims.create({
                  key: "player_walk_left",
                  frames: this.anims.generateFrameNumbers("player", { start: 6, end: 8 }),
                  frameRate: 8,
                  repeat: -1,
                });
                
                this.anims.create({
                  key: "player_walk_right",
                  frames: this.anims.generateFrameNumbers("player", { start: 9, end: 11 }),
                  frameRate: 8,
                  repeat: -1,
                });
                
                player.play("player_idle");
                
                (this as any).player = player;
              } else {
                const playerGraphic = this.add.rectangle(spawnPoint.x, spawnPoint.y, 28, 28, 0x8b0000);
                playerGraphic.setDepth(10);
                (this as any).player = playerGraphic;
              }

              npcs.forEach((npc, i) => {
                const npcPos = npc.position || map?.spawnPoints?.[`npc${i + 1}`] || { 
                  x: 100 + i * 150, 
                  y: height / 2 
                };
                
                if (npc.spriteUrl) {
                  const npcSprite = this.physics.add.sprite(npcPos.x, npcPos.y, `npc_${i}`);
                  npcSprite.setDepth(5);
                  npcSprite.setInteractive({ useHandCursor: true });
                  npcSprite.on("pointerdown", () => {
                    onInteraction?.(npc.name);
                  });
                } else {
                  const npcGraphic = this.add.rectangle(npcPos.x, npcPos.y, 24, 24, 0x4169e1);
                  npcGraphic.setDepth(5);
                  npcGraphic.setInteractive({ useHandCursor: true });
                  npcGraphic.on("pointerdown", () => {
                    onInteraction?.(npc.name);
                  });
                }
              });

              this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
                const player = (this as any).player;
                if (!player) return;
                
                const targetX = pointer.worldX;
                const targetY = pointer.worldY;
                
                if (targetX < 32 || targetX > width - 32 || targetY < 32 || targetY > height - 32) {
                  return;
                }
                
                onPlayerMove?.({ x: targetX, y: targetY });
                
                if (player.body) {
                  this.physics.moveTo(player, targetX, targetY, 120);
                  
                  const dx = targetX - player.x;
                  const dy = targetY - player.y;
                  
                  if (Math.abs(dx) > Math.abs(dy)) {
                    player.play(dx > 0 ? "player_walk_right" : "player_walk_left", true);
                  } else {
                    player.play(dy > 0 ? "player_walk_down" : "player_walk_up", true);
                  }
                  
                  const distance = Phaser.Math.Distance.Between(player.x, player.y, targetX, targetY);
                  const duration = (distance / 120) * 1000;
                  
                  this.time.delayedCall(duration, () => {
                    if (player.body) {
                      player.body.setVelocity(0, 0);
                      player.play("player_idle");
                    }
                  });
                }
              });

              const locationText = this.add.text(width / 2, 16, locationName, {
                fontFamily: "Cinzel, serif",
                fontSize: "14px",
                color: "#ffeedd",
                stroke: "#000000",
                strokeThickness: 2,
              });
              locationText.setOrigin(0.5, 0);
              locationText.setDepth(100);
            },
            update: function(this: Phaser.Scene) {
            },
          },
        };

        gameRef.current = new Phaser.Game(config);
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to initialize game:", err);
        setError("Failed to load game map");
        setIsLoading(false);
      }
    };

    initGame();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [locationName, playerSpriteUrl, npcs, width, height, fetchOrGenerateMap, onPlayerMove, onInteraction]);

  if (error) {
    return (
      <div 
        className="flex items-center justify-center bg-muted rounded-md"
        style={{ width, height }}
        data-testid="game-canvas-error"
      >
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {isLoading && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-background/80 z-10"
          data-testid="game-canvas-loading"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading {locationName}...</p>
          </div>
        </div>
      )}
      <div 
        ref={canvasRef} 
        className="rounded-md overflow-hidden border border-border"
        style={{ width, height }}
        data-testid="game-canvas"
      />
    </div>
  );
}
