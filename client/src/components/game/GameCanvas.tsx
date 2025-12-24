import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Phaser from "phaser";

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
  tilesetUrl: string | null;
  spawnPoints: Record<string, { x: number; y: number }>;
}

export function GameCanvas({
  locationName,
  playerName,
  playerSpriteUrl,
  npcs = [],
  onPlayerMove,
  onInteraction,
  width = 640,
  height = 320,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const defaultSpawnPoints = useMemo(() => ({
    entrance: { x: width / 2, y: height - 40 },
    exit: { x: width / 2, y: 40 },
    npc1: { x: width * 0.25, y: height / 2 },
    npc2: { x: width * 0.75, y: height / 2 },
  }), [width, height]);

  const cleanupGame = useCallback(() => {
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    cleanupGame();

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width,
      height,
      parent: canvasRef.current,
      backgroundColor: "#1a0b2e",
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
        },
        create: function(this: Phaser.Scene) {
          const graphics = this.add.graphics();
          
          const tileSize = 32;
          const tilesX = Math.ceil(width / tileSize);
          const tilesY = Math.ceil(height / tileSize);

          graphics.fillStyle(0x4a3b5c, 1);
          for (let x = 0; x < tilesX; x++) {
            for (let y = 0; y < tilesY; y++) {
              if (x === 0 || x === tilesX - 1 || y === 0 || y === tilesY - 1) {
                graphics.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
                graphics.lineStyle(1, 0x2d2640, 1);
                graphics.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
              }
            }
          }
          
          graphics.fillStyle(0x8b7355, 1);
          for (let x = 1; x < tilesX - 1; x++) {
            for (let y = 1; y < tilesY - 1; y++) {
              graphics.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
              graphics.lineStyle(1, 0x6b5645, 0.3);
              graphics.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
            }
          }

          const spawnPoint = defaultSpawnPoints.entrance;
          
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
            const playerGraphic = this.add.rectangle(spawnPoint.x, spawnPoint.y, 24, 24, 0x9b4dca);
            playerGraphic.setDepth(10);
            (this as any).player = playerGraphic;
          }

          npcs.forEach((npc, i) => {
            const npcPos = npc.position || defaultSpawnPoints[`npc${i + 1}` as keyof typeof defaultSpawnPoints] || { 
              x: 100 + i * 100, 
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
              const npcGraphic = this.add.rectangle(npcPos.x, npcPos.y, 20, 20, 0x4169e1);
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
            
            if (targetX < tileSize || targetX > width - tileSize || 
                targetY < tileSize || targetY > height - tileSize) {
              return;
            }
            
            onPlayerMove?.({ x: targetX, y: targetY });
            
            if (player.body) {
              this.physics.moveTo(player, targetX, targetY, 100);
              
              const dx = targetX - player.x;
              const dy = targetY - player.y;
              
              if (Math.abs(dx) > Math.abs(dy)) {
                player.play(dx > 0 ? "player_walk_right" : "player_walk_left", true);
              } else {
                player.play(dy > 0 ? "player_walk_down" : "player_walk_up", true);
              }
              
              const distance = Phaser.Math.Distance.Between(player.x, player.y, targetX, targetY);
              const duration = (distance / 100) * 1000;
              
              this.time.delayedCall(duration, () => {
                if (player.body) {
                  player.body.setVelocity(0, 0);
                  player.play("player_idle");
                }
              });
            }
          });

          const locationText = this.add.text(width / 2, 8, locationName, {
            fontFamily: "Cinzel, serif",
            fontSize: "12px",
            color: "#ffeedd",
            stroke: "#000000",
            strokeThickness: 2,
          });
          locationText.setOrigin(0.5, 0);
          locationText.setDepth(100);
        },
      },
    };

    try {
      gameRef.current = new Phaser.Game(config);
      setIsLoading(false);
      setError(null);
    } catch (err) {
      console.error("Failed to initialize Phaser:", err);
      setError("Failed to load game map");
      setIsLoading(false);
    }

    return cleanupGame;
  }, [locationName, playerSpriteUrl, npcs, width, height, defaultSpawnPoints, onPlayerMove, onInteraction, cleanupGame]);

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
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Loading {locationName}...</p>
          </div>
        </div>
      )}
      <div 
        ref={canvasRef} 
        className="rounded-md overflow-hidden border border-purple-500/30"
        style={{ width, height }}
        data-testid="game-canvas"
      />
    </div>
  );
}
