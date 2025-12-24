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
  spawnPoints?: Record<string, { x: number; y: number }>;
  environmentSprites?: Record<string, string>;
}

const TILE_SIZE = 32;

const POKEMON_PALETTE = {
  black: 0x081820,
  dark: 0x346856,
  light: 0x88c070,
  white: 0xe0f8d0,
};

function getLocationTheme(locationName: string): {
  floorColor: number;
  wallColor: number;
  accentColor: number;
  hasGrass: boolean;
  isOutdoor: boolean;
} {
  const lower = locationName.toLowerCase();
  
  if (lower.includes("grounds") || lower.includes("forest") || lower.includes("quidditch") || lower.includes("lake")) {
    return {
      floorColor: POKEMON_PALETTE.light,
      wallColor: POKEMON_PALETTE.dark,
      accentColor: POKEMON_PALETTE.white,
      hasGrass: true,
      isOutdoor: true,
    };
  }
  if (lower.includes("hogsmeade") || lower.includes("village") || lower.includes("street")) {
    return {
      floorColor: POKEMON_PALETTE.white,
      wallColor: POKEMON_PALETTE.dark,
      accentColor: POKEMON_PALETTE.light,
      hasGrass: false,
      isOutdoor: true,
    };
  }
  
  return {
    floorColor: POKEMON_PALETTE.white,
    wallColor: POKEMON_PALETTE.dark,
    accentColor: POKEMON_PALETTE.light,
    hasGrass: false,
    isOutdoor: false,
  };
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
  width = 320,
  height = 288,
  isMapGenerating = false,
  spawnPoints,
  environmentSprites = {},
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tilesX = Math.ceil(width / TILE_SIZE);
  const tilesY = Math.ceil(height / TILE_SIZE);

  const defaultSpawnPoints = useMemo(() => ({
    entrance: { x: width / 2, y: height - 24 },
    exit: { x: width / 2, y: 24 },
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

    const theme = getLocationTheme(locationName);

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width,
      height,
      parent: canvasRef.current,
      backgroundColor: "#081820",
      pixelArt: true,
      roundPixels: true,
      antialias: false,
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
          
          Object.entries(environmentSprites).forEach(([assetId, spriteUrl]) => {
            if (spriteUrl) {
              this.load.image(`env_${assetId}`, spriteUrl);
            }
          });
        },
        create: function(this: Phaser.Scene) {
          const graphics = this.add.graphics();
          const hasTileset = tilesetUrl && this.textures.exists("tileset");
          
          if (hasTileset && tilemapData) {
            renderGeneratedTilemap(this, tilemapData);
          } else {
            renderPokemonStyleMap(graphics, tilesX, tilesY, theme, locationName);
          }
          
          if (tilemapData?.objects && Object.keys(environmentSprites).length > 0) {
            renderEnvironmentObjects(this, tilemapData.objects);
          }
          
          function renderEnvironmentObjects(scene: Phaser.Scene, objects: Array<{assetId: string; x: number; y: number; scale?: number; flipX?: boolean}>) {
            objects.forEach(obj => {
              const textureKey = `env_${obj.assetId}`;
              if (scene.textures.exists(textureKey)) {
                const sprite = scene.add.image(obj.x, obj.y, textureKey);
                sprite.setScale(obj.scale || 1);
                if (obj.flipX) {
                  sprite.setFlipX(true);
                }
                sprite.setDepth(2);
              }
            });
          }

          function renderGeneratedTilemap(scene: Phaser.Scene, mapData: TilemapData) {
            const tilesetTexture = scene.textures.get("tileset");
            const texWidth = tilesetTexture.source[0].width;
            const tileW = mapData.tileWidth || 32;
            const tileH = mapData.tileHeight || 32;
            const tilesPerRow = Math.floor(texWidth / tileW);
            
            const scaleX = width / (mapData.width * tileW);
            const scaleY = height / (mapData.height * tileH);
            const scale = Math.min(scaleX, scaleY, 1);
            
            mapData.layers.forEach(layer => {
              if (!layer.visible) return;
              
              layer.data.forEach((tileIndex, i) => {
                if (tileIndex < 0) return;
                
                const tileX = ((i % layer.width) * tileW) * scale;
                const tileY = (Math.floor(i / layer.width) * tileH) * scale;
                
                const srcX = (tileIndex % tilesPerRow) * tileW;
                const srcY = Math.floor(tileIndex / tilesPerRow) * tileH;
                
                const tileSprite = scene.add.image(tileX + (tileW * scale) / 2, tileY + (tileH * scale) / 2, "tileset");
                tileSprite.setCrop(srcX, srcY, tileW, tileH);
                tileSprite.setScale(scale);
                tileSprite.setAlpha(layer.opacity);
                tileSprite.setDepth(layer.name === "ground" ? 0 : 1);
              });
            });
          }

          function renderPokemonStyleMap(
            gfx: Phaser.GameObjects.Graphics, 
            tx: number, 
            ty: number, 
            themeConfig: typeof theme,
            locName: string
          ) {
            for (let y = 0; y < ty; y++) {
              for (let x = 0; x < tx; x++) {
                const px = x * TILE_SIZE;
                const py = y * TILE_SIZE;
                const isEdge = x === 0 || x === tx - 1 || y === 0 || y === ty - 1;
                const isSecondEdge = x === 1 || x === tx - 2 || y === 1 || y === ty - 2;
                
                if (isEdge) {
                  gfx.fillStyle(POKEMON_PALETTE.black, 1);
                  gfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                  
                  gfx.fillStyle(themeConfig.wallColor, 1);
                  gfx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
                  
                  gfx.fillStyle(POKEMON_PALETTE.black, 1);
                  gfx.fillRect(px + 2, py + TILE_SIZE - 3, TILE_SIZE - 4, 1);
                } else if (isSecondEdge && !themeConfig.isOutdoor) {
                  gfx.fillStyle(themeConfig.wallColor, 1);
                  gfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                  
                  gfx.fillStyle(POKEMON_PALETTE.black, 0.2);
                  gfx.fillRect(px, py + TILE_SIZE - 1, TILE_SIZE, 1);
                } else {
                  gfx.fillStyle(themeConfig.floorColor, 1);
                  gfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                  
                  if (themeConfig.hasGrass && Math.random() > 0.7) {
                    drawGrassTuft(gfx, px, py);
                  } else if (!themeConfig.isOutdoor && (x + y) % 2 === 0) {
                    gfx.fillStyle(POKEMON_PALETTE.dark, 0.1);
                    gfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                  }
                  
                  gfx.fillStyle(POKEMON_PALETTE.black, 0.05);
                  gfx.fillRect(px + TILE_SIZE - 1, py, 1, TILE_SIZE);
                  gfx.fillRect(px, py + TILE_SIZE - 1, TILE_SIZE, 1);
                }
              }
            }
            
            const centerX = Math.floor(tx / 2);
            
            if (!themeConfig.isOutdoor) {
              drawRug(gfx, (centerX - 2) * TILE_SIZE, Math.floor(ty / 2) * TILE_SIZE, 4 * TILE_SIZE, 2 * TILE_SIZE, themeConfig.accentColor);
              drawDoor(gfx, centerX * TILE_SIZE - TILE_SIZE, TILE_SIZE);
            }
            
            drawLocationLabel(gfx, locName, width, height);
          }

          function drawGrassTuft(gfx: Phaser.GameObjects.Graphics, x: number, y: number) {
            gfx.fillStyle(POKEMON_PALETTE.dark, 1);
            gfx.fillRect(x + 2, y + 4, 2, 8);
            gfx.fillRect(x + 6, y + 5, 2, 7);
            gfx.fillRect(x + 10, y + 4, 2, 8);
          }

          function drawRug(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number) {
            gfx.fillStyle(POKEMON_PALETTE.black, 1);
            gfx.fillRect(x - 1, y - 1, w + 2, h + 2);
            
            gfx.fillStyle(color, 1);
            gfx.fillRect(x, y, w, h);
            
            gfx.fillStyle(POKEMON_PALETTE.dark, 0.2);
            for (let i = 0; i < w; i += 4) {
              gfx.fillRect(x + i, y, 2, h);
            }
          }

          function drawDoor(gfx: Phaser.GameObjects.Graphics, x: number, y: number) {
            gfx.fillStyle(POKEMON_PALETTE.black, 1);
            gfx.fillRect(x - 1, y, TILE_SIZE * 2 + 2, TILE_SIZE + 2);
            
            gfx.fillStyle(POKEMON_PALETTE.dark, 1);
            gfx.fillRect(x, y, TILE_SIZE * 2, TILE_SIZE);
            
            gfx.fillStyle(POKEMON_PALETTE.light, 1);
            gfx.fillRect(x + 3, y + 2, TILE_SIZE - 6, TILE_SIZE - 5);
            gfx.fillRect(x + TILE_SIZE + 3, y + 2, TILE_SIZE - 6, TILE_SIZE - 5);
          }

          function drawLocationLabel(gfx: Phaser.GameObjects.Graphics, name: string, w: number, h: number) {
            const labelWidth = Math.min(name.length * 5 + 12, w - 16);
            const labelX = (w - labelWidth) / 2;
            const labelY = h - 16;
            
            gfx.fillStyle(POKEMON_PALETTE.black, 1);
            gfx.fillRect(labelX - 1, labelY - 1, labelWidth + 2, 12);
            
            gfx.fillStyle(POKEMON_PALETTE.white, 1);
            gfx.fillRect(labelX, labelY, labelWidth, 10);
          }

          const scene = this;
          
          scene.add.text(width / 2, height - 11, locationName.substring(0, 24), {
            fontFamily: "monospace",
            fontSize: "7px",
            color: "#081820",
            align: "center",
          }).setOrigin(0.5, 0.5).setDepth(100);

          const spawnPoint = spawnPoints?.entrance || defaultSpawnPoints.entrance;
          
          let playerTextureValid = false;
          let useAnimatedSprite = false;
          
          if (playerSpriteUrl && this.textures.exists("player")) {
            try {
              const playerTexture = this.textures.get("player");
              const frameCount = playerTexture?.frameTotal || 0;
              playerTextureValid = frameCount >= 1;
              useAnimatedSprite = frameCount >= 12;
            } catch (e) {
              playerTextureValid = false;
            }
          }
          
          if (useAnimatedSprite) {
            const player = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, "player");
            player.setCollideWorldBounds(true);
            player.setDepth(10);
            player.setScale(1);
            
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
            (this as any).playerIsSprite = true;
            (this as any).playerHasAnimations = true;
          } else {
            const playerGraphic = this.add.graphics();
            playerGraphic.setDepth(10);
            
            drawFallbackPlayer(playerGraphic, spawnPoint.x, spawnPoint.y);
            
            (this as any).playerGraphic = playerGraphic;
            (this as any).playerPos = { x: spawnPoint.x, y: spawnPoint.y };
            (this as any).playerIsSprite = false;
          }

          function drawFallbackPlayer(gfx: Phaser.GameObjects.Graphics, px: number, py: number) {
            gfx.clear();
            
            gfx.fillStyle(POKEMON_PALETTE.black, 1);
            gfx.fillRect(px - 6, py - 6, 12, 12);
            
            gfx.fillStyle(POKEMON_PALETTE.dark, 1);
            gfx.fillRect(px - 5, py - 5, 10, 10);
            
            gfx.fillStyle(POKEMON_PALETTE.light, 1);
            gfx.fillRect(px - 3, py - 4, 6, 3);
            
            gfx.fillStyle(POKEMON_PALETTE.white, 1);
            gfx.fillRect(px - 2, py - 3, 2, 2);
            gfx.fillRect(px + 1, py - 3, 2, 2);
            
            gfx.fillStyle(POKEMON_PALETTE.black, 1);
            gfx.fillRect(px - 1, py - 2, 1, 1);
            gfx.fillRect(px + 2, py - 2, 1, 1);
          }

          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            const targetX = Math.round(pointer.worldX / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
            const targetY = Math.round(pointer.worldY / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
            
            if (targetX < TILE_SIZE * 2 || targetX > width - TILE_SIZE * 2 || 
                targetY < TILE_SIZE * 2 || targetY > height - TILE_SIZE * 2) {
              return;
            }
            
            onPlayerMove?.({ x: targetX, y: targetY });
            
            const playerObj = (this as any).player;
            const isSprite = (this as any).playerIsSprite;
            const hasAnims = (this as any).playerHasAnimations;
            
            if (isSprite && playerObj?.body) {
              this.physics.moveTo(playerObj, targetX, targetY, 60);
              
              if (hasAnims) {
                const dx = targetX - playerObj.x;
                const dy = targetY - playerObj.y;
                
                if (Math.abs(dx) > Math.abs(dy)) {
                  playerObj.play(dx > 0 ? "player_walk_right" : "player_walk_left", true);
                } else {
                  playerObj.play(dy > 0 ? "player_walk_down" : "player_walk_up", true);
                }
              }
              
              const distance = Phaser.Math.Distance.Between(playerObj.x, playerObj.y, targetX, targetY);
              const duration = (distance / 60) * 1000;
              
              this.time.delayedCall(duration, () => {
                if (playerObj.body) {
                  playerObj.body.setVelocity(0, 0);
                  if (hasAnims) playerObj.play("player_idle");
                }
              });
            } else {
              (this as any).targetPos = { x: targetX, y: targetY };
            }
          });
          
          if (!(this as any).playerIsSprite) {
            this.time.addEvent({
              delay: 80,
              callback: () => {
                const targetPos = (this as any).targetPos;
                const playerPos = (this as any).playerPos;
                const playerGraphic = (this as any).playerGraphic;
                
                if (targetPos && playerPos && playerGraphic) {
                  const dx = targetPos.x - playerPos.x;
                  const dy = targetPos.y - playerPos.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  
                  if (dist < TILE_SIZE / 2) {
                    (this as any).targetPos = null;
                  } else {
                    const speed = TILE_SIZE;
                    playerPos.x += (dx / dist) * Math.min(speed, dist);
                    playerPos.y += (dy / dist) * Math.min(speed, dist);
                    
                    drawFallbackPlayer(playerGraphic, playerPos.x, playerPos.y);
                  }
                }
              },
              loop: true,
            });
          }

          npcs.forEach((npc, i) => {
            const npcPos = npc.position || defaultSpawnPoints[`npc${i + 1}` as keyof typeof defaultSpawnPoints] || { 
              x: 50 + i * 50, 
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
              const npcSprite = this.physics.add.sprite(npcPos.x, npcPos.y, npcTextureKey);
              npcSprite.setDepth(5);
              npcSprite.setInteractive({ useHandCursor: true });
              npcSprite.on("pointerdown", () => onInteraction?.(npc.name));
            } else {
              const npcGraphic = this.add.graphics();
              npcGraphic.setDepth(5);
              
              npcGraphic.fillStyle(POKEMON_PALETTE.black, 1);
              npcGraphic.fillRect(npcPos.x - 5, npcPos.y - 5, 10, 10);
              
              npcGraphic.fillStyle(POKEMON_PALETTE.light, 1);
              npcGraphic.fillRect(npcPos.x - 4, npcPos.y - 4, 8, 8);
              
              npcGraphic.fillStyle(POKEMON_PALETTE.dark, 1);
              npcGraphic.fillRect(npcPos.x - 2, npcPos.y - 3, 4, 3);
              
              const hitArea = this.add.rectangle(npcPos.x, npcPos.y, 12, 12, 0x000000, 0);
              hitArea.setInteractive({ useHandCursor: true });
              hitArea.on("pointerdown", () => onInteraction?.(npc.name));
            }
          });
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
        className="flex items-center justify-center bg-[#081820] rounded border border-[#346856]"
        style={{ width, height }}
        data-testid="game-canvas-error"
      >
        <p className="text-[#88c070] text-xs font-mono">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {(isLoading || isMapGenerating) && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-[#081820] z-10 rounded"
          data-testid="game-canvas-loading"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#88c070] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[#88c070] font-mono">
              {isMapGenerating ? "Generating..." : "Loading..."}
            </p>
          </div>
        </div>
      )}
      <div 
        ref={canvasRef} 
        className="rounded border-2 border-[#346856] shadow-[0_0_0_2px_#081820]"
        style={{ width, height, imageRendering: "pixelated" }}
        data-testid="game-canvas"
      />
    </div>
  );
}
