import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Phaser from "phaser";
import type { TilemapData } from "@/hooks/use-game-canvas";

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
  tilesetUrl?: string | null;
  tilemapData?: TilemapData | null;
  npcs?: NPCData[];
  onPlayerMove?: (target: { x: number; y: number }) => void;
  onInteraction?: (npcName: string) => void;
  width?: number;
  height?: number;
  isMapGenerating?: boolean;
}

const TILE_SIZE = 32;

const FALLBACK_COLORS = {
  floor: [0x8b7355, 0x9b8365, 0x7b6345, 0x8a7050],
  wall: [0x4a3b5c, 0x3d2e4f, 0x5a4b6c, 0x4f3f5f],
  decor: [0x6b4423, 0x5a3a1f, 0x7b542f, 0x694020],
};

function getLocationColors(locationName: string): { floor: number[]; wall: number[]; accent: number } {
  const lower = locationName.toLowerCase();
  
  if (lower.includes("gryffindor")) {
    return { floor: [0x8b4513, 0x9b5523, 0x7b3503], wall: [0x7a0000, 0x8a1010, 0x6a0000], accent: 0xffd700 };
  }
  if (lower.includes("slytherin") || lower.includes("dungeon") || lower.includes("potion")) {
    return { floor: [0x2d4a3d, 0x3d5a4d, 0x1d3a2d], wall: [0x1a2f23, 0x0a1f13, 0x2a3f33], accent: 0x50c878 };
  }
  if (lower.includes("ravenclaw") || lower.includes("library") || lower.includes("tower")) {
    return { floor: [0x4a5568, 0x5a6578, 0x3a4558], wall: [0x2d3748, 0x1d2738, 0x3d4758], accent: 0x6495ed };
  }
  if (lower.includes("hufflepuff")) {
    return { floor: [0x8b7355, 0x9b8365, 0x7b6345], wall: [0x5a4a3c, 0x4a3a2c, 0x6a5a4c], accent: 0xffd700 };
  }
  if (lower.includes("great hall")) {
    return { floor: [0x8b7355, 0x9b8365, 0x7b6345], wall: [0x4a3b5c, 0x3d2e4f, 0x5a4b6c], accent: 0xffd700 };
  }
  if (lower.includes("grounds") || lower.includes("forest") || lower.includes("quidditch")) {
    return { floor: [0x228b22, 0x2e8b2e, 0x1a7b1a], wall: [0x8b4513, 0x7b3503, 0x9b5523], accent: 0x87ceeb };
  }
  if (lower.includes("hogsmeade")) {
    return { floor: [0x696969, 0x808080, 0x5a5a5a], wall: [0x4a3b2c, 0x3a2b1c, 0x5a4b3c], accent: 0xfffafa };
  }
  
  return { floor: FALLBACK_COLORS.floor, wall: FALLBACK_COLORS.wall, accent: 0xffd700 };
}

export function GameCanvas({
  locationName,
  playerName,
  playerSpriteUrl,
  tilesetUrl,
  tilemapData,
  npcs = [],
  onPlayerMove,
  onInteraction,
  width = 640,
  height = 320,
  isMapGenerating = false,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tilesX = Math.ceil(width / TILE_SIZE);
  const tilesY = Math.ceil(height / TILE_SIZE);

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

    const locationColors = getLocationColors(locationName);

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width,
      height,
      parent: canvasRef.current,
      backgroundColor: "#0d0618",
      pixelArt: true,
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
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
          
          if (tilesetUrl) {
            this.load.image("tileset", tilesetUrl);
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
          
          const hasTileset = tilesetUrl && this.textures.exists("tileset");
          
          if (hasTileset && tilemapData) {
            try {
              const tilesetTexture = this.textures.get("tileset");
              const texWidth = tilesetTexture.source[0].width;
              const texHeight = tilesetTexture.source[0].height;
              const tilesPerRow = Math.floor(texWidth / TILE_SIZE);
              
              tilemapData.layers.forEach(layer => {
                if (!layer.visible) return;
                
                layer.data.forEach((tileIndex, i) => {
                  if (tileIndex < 0) return;
                  
                  const tileX = (i % layer.width) * TILE_SIZE;
                  const tileY = Math.floor(i / layer.width) * TILE_SIZE;
                  
                  const srcX = (tileIndex % tilesPerRow) * TILE_SIZE;
                  const srcY = Math.floor(tileIndex / tilesPerRow) * TILE_SIZE;
                  
                  if (srcY < texHeight && srcX < texWidth) {
                    const tileSprite = this.add.image(tileX + TILE_SIZE / 2, tileY + TILE_SIZE / 2, "tileset");
                    tileSprite.setCrop(srcX, srcY, TILE_SIZE, TILE_SIZE);
                    tileSprite.setAlpha(layer.opacity);
                    tileSprite.setDepth(layer.name === "ground" ? 0 : 1);
                  }
                });
              });
            } catch (e) {
              console.warn("Failed to render tileset, using procedural:", e);
              renderProceduralMap(graphics, tilesX, tilesY, locationColors);
            }
          } else {
            renderProceduralMap(graphics, tilesX, tilesY, locationColors);
          }

          function renderProceduralMap(
            gfx: Phaser.GameObjects.Graphics, 
            tx: number, 
            ty: number, 
            colors: { floor: number[]; wall: number[]; accent: number }
          ) {
            for (let x = 0; x < tx; x++) {
              for (let y = 0; y < ty; y++) {
                const isWall = x === 0 || x === tx - 1 || y === 0 || y === ty - 1;
                
                if (isWall) {
                  const wallColor = colors.wall[Math.floor(Math.random() * colors.wall.length)];
                  gfx.fillStyle(wallColor, 1);
                  gfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                  gfx.lineStyle(1, 0x2d2640, 0.5);
                  gfx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                } else {
                  const floorColor = colors.floor[Math.floor(Math.random() * colors.floor.length)];
                  gfx.fillStyle(floorColor, 1);
                  gfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                  gfx.lineStyle(1, 0x5a4a3c, 0.2);
                  gfx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
              }
            }
            
            const centerX = Math.floor(tx / 2);
            const centerY = Math.floor(ty / 2);
            if (tx > 4 && ty > 4) {
              gfx.fillStyle(colors.accent, 0.3);
              gfx.fillCircle(centerX * TILE_SIZE + TILE_SIZE / 2, centerY * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE);
            }
          }

          const spawnPoint = defaultSpawnPoints.entrance;
          
          let playerTextureValid = false;
          let frameCount = 0;
          
          if (playerSpriteUrl && this.textures.exists("player")) {
            try {
              const playerTexture = this.textures.get("player");
              frameCount = playerTexture?.frameTotal || 0;
              playerTextureValid = frameCount >= 1;
            } catch (e) {
              playerTextureValid = false;
            }
          }
          
          let useSprite = playerTextureValid && frameCount >= 12;
          let hasAnimations = false;
          
          if (useSprite) {
            try {
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
              hasAnimations = true;
              
              (this as any).player = player;
              (this as any).playerHasAnimations = hasAnimations;
              (this as any).playerIsSprite = true;
            } catch (e) {
              useSprite = false;
            }
          }
          
          if (!useSprite) {
            const playerGraphic = this.add.rectangle(spawnPoint.x, spawnPoint.y, 24, 24, 0x9b4dca);
            playerGraphic.setDepth(10);
            playerGraphic.setStrokeStyle(2, 0xffd700);
            this.physics.add.existing(playerGraphic);
            const body = playerGraphic.body as Phaser.Physics.Arcade.Body;
            if (body) body.setCollideWorldBounds(true);
            (this as any).player = playerGraphic;
            (this as any).playerHasAnimations = false;
            (this as any).playerIsSprite = false;
          }

          npcs.forEach((npc, i) => {
            const npcPos = npc.position || defaultSpawnPoints[`npc${i + 1}` as keyof typeof defaultSpawnPoints] || { 
              x: 100 + i * 100, 
              y: height / 2 
            };
            
            const npcTextureKey = `npc_${i}`;
            let npcTextureValid = false;
            
            if (npc.spriteUrl && this.textures.exists(npcTextureKey)) {
              try {
                const npcTexture = this.textures.get(npcTextureKey);
                npcTextureValid = (npcTexture?.frameTotal || 0) >= 1;
              } catch (e) {
                npcTextureValid = false;
              }
            }
            
            if (npcTextureValid) {
              try {
                const npcSprite = this.physics.add.sprite(npcPos.x, npcPos.y, npcTextureKey);
                npcSprite.setDepth(5);
                npcSprite.setInteractive({ useHandCursor: true });
                npcSprite.on("pointerdown", () => onInteraction?.(npc.name));
              } catch (e) {
                npcTextureValid = false;
              }
            }
            
            if (!npcTextureValid) {
              const npcGraphic = this.add.rectangle(npcPos.x, npcPos.y, 20, 20, 0x4169e1);
              npcGraphic.setDepth(5);
              npcGraphic.setStrokeStyle(1, 0x6495ed);
              npcGraphic.setInteractive({ useHandCursor: true });
              npcGraphic.on("pointerdown", () => onInteraction?.(npc.name));
            }
          });

          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            const player = (this as any).player;
            const hasAnims = (this as any).playerHasAnimations;
            if (!player) return;
            
            const targetX = pointer.worldX;
            const targetY = pointer.worldY;
            
            if (targetX < TILE_SIZE || targetX > width - TILE_SIZE || 
                targetY < TILE_SIZE || targetY > height - TILE_SIZE) {
              return;
            }
            
            onPlayerMove?.({ x: targetX, y: targetY });
            
            if (player.body) {
              this.physics.moveTo(player, targetX, targetY, 100);
              
              if (hasAnims && player.play) {
                const dx = targetX - player.x;
                const dy = targetY - player.y;
                
                if (Math.abs(dx) > Math.abs(dy)) {
                  player.play(dx > 0 ? "player_walk_right" : "player_walk_left", true);
                } else {
                  player.play(dy > 0 ? "player_walk_down" : "player_walk_up", true);
                }
              }
              
              const distance = Phaser.Math.Distance.Between(player.x, player.y, targetX, targetY);
              const duration = (distance / 100) * 1000;
              
              this.time.delayedCall(duration, () => {
                if (player.body) {
                  player.body.setVelocity(0, 0);
                  if (hasAnims && player.play) player.play("player_idle");
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
      setError("Failed to load game map");
      setIsLoading(false);
    }

    return cleanupGame;
  }, [locationName, playerSpriteUrl, tilesetUrl, tilemapData, npcs, width, height, defaultSpawnPoints, onPlayerMove, onInteraction, cleanupGame, tilesX, tilesY]);

  if (error) {
    return (
      <div 
        className="flex items-center justify-center bg-[#1a0b2e] rounded-md border border-red-500/30"
        style={{ width, height }}
        data-testid="game-canvas-error"
      >
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {(isLoading || isMapGenerating) && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-[#0d0618]/90 z-10 rounded-md"
          data-testid="game-canvas-loading"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-purple-200">
              {isMapGenerating ? "Generating map..." : `Loading ${locationName}...`}
            </p>
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
