import { useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import Phaser from "phaser";

const TILE_SIZE = 32;
const SUB_TILE = 8;
const PLAYER_SPEED = 120;
const PLAYER_RUN_SPEED = 180;

const POKEMON_STYLE = {
  outline: 0x000000,
  highlight: 0xffffff,
  shadow: 0x202020,
};

const UNDERCROFT_PALETTE = {
  black: 0x0a0a12,
  darkStone: 0x1a1a2e,
  stone: 0x2d2d44,
  lightStone: 0x4a4a6a,
  accent: 0x6b4c9a,
  glow: 0x8b6cc0,
  candle: 0xffaa44,
};

const GREAT_HALL_PALETTE = {
  black: 0x1a1410,
  darkWood: 0x3d2817,
  wood: 0x5c3d24,
  lightWood: 0x7a5233,
  stone: 0x4a4a5a,
  gold: 0xd4af37,
  candleGlow: 0xffcc66,
  banner: 0x740001,
};

const CLASSROOM_PALETTE = {
  black: 0x12121a,
  darkStone: 0x2a2a3a,
  stone: 0x3d3d52,
  lightStone: 0x5a5a72,
  wood: 0x4a3520,
  chalkboard: 0x1a3020,
  accent: 0x5a7aa0,
  candle: 0xffbb55,
};

const DUNGEON_PALETTE = {
  black: 0x080810,
  darkStone: 0x151520,
  stone: 0x222235,
  lightStone: 0x353548,
  moss: 0x2a3a20,
  chain: 0x555566,
  torch: 0xff6622,
  green: 0x2a5a3a,
};

const TOWER_PALETTE = {
  black: 0x101020,
  darkStone: 0x252540,
  stone: 0x3a3a5a,
  lightStone: 0x5a5a7a,
  skyBlue: 0x304060,
  gold: 0xc4a030,
  starlight: 0xaaccff,
  accent: 0x6a5aaa,
};

const COURTYARD_PALETTE = {
  black: 0x0a1008,
  darkGrass: 0x1a3010,
  grass: 0x2a5020,
  lightGrass: 0x3a7030,
  stone: 0x5a5a60,
  lightStone: 0x7a7a82,
  water: 0x3050a0,
  flower: 0xdd6688,
};

const CORRIDOR_PALETTE = {
  black: 0x0e0e16,
  darkStone: 0x1e1e2e,
  stone: 0x303045,
  lightStone: 0x454560,
  carpet: 0x6a1a1a,
  gold: 0xb89a30,
  torch: 0xff8844,
  portrait: 0x4a3020,
};

type LocationType = "undercroft" | "great_hall" | "classroom" | "dungeon" | "tower" | "courtyard" | "corridor";

function drawSubTile(gfx: Phaser.GameObjects.Graphics, x: number, y: number, colors: number[], pattern: number[][]) {
  for (let py = 0; py < pattern.length && py < 4; py++) {
    for (let px = 0; px < pattern[py].length && px < 4; px++) {
      const colorIndex = pattern[py][px];
      if (colorIndex >= 0 && colorIndex < colors.length) {
        gfx.fillStyle(colors[colorIndex], 1);
        gfx.fillRect(x + px * 2, y + py * 2, 2, 2);
      }
    }
  }
}

function drawPokemonBrick(gfx: Phaser.GameObjects.Graphics, x: number, y: number, baseColor: number, lightColor: number) {
  gfx.fillStyle(baseColor, 1);
  gfx.fillRect(x, y, SUB_TILE, SUB_TILE);
  gfx.fillStyle(lightColor, 1);
  gfx.fillRect(x, y, SUB_TILE, 1);
  gfx.fillRect(x, y, 1, SUB_TILE);
  gfx.fillStyle(POKEMON_STYLE.shadow, 0.5);
  gfx.fillRect(x + SUB_TILE - 1, y, 1, SUB_TILE);
  gfx.fillRect(x, y + SUB_TILE - 1, SUB_TILE, 1);
}

function drawPokemonFloor(gfx: Phaser.GameObjects.Graphics, x: number, y: number, color1: number, color2: number, variant: number) {
  gfx.fillStyle(color1, 1);
  gfx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      if ((sx + sy + variant) % 2 === 0) {
        gfx.fillStyle(color2, 0.3);
        gfx.fillRect(x + sx * SUB_TILE, y + sy * SUB_TILE, SUB_TILE, SUB_TILE);
      }
    }
  }
  gfx.fillStyle(POKEMON_STYLE.outline, 0.15);
  gfx.fillRect(x, y + TILE_SIZE - 1, TILE_SIZE, 1);
  gfx.fillRect(x + TILE_SIZE - 1, y, 1, TILE_SIZE);
}

function drawPokemonWall(gfx: Phaser.GameObjects.Graphics, x: number, y: number, darkColor: number, mainColor: number, lightColor: number) {
  gfx.fillStyle(darkColor, 1);
  gfx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 === 0 ? 0 : SUB_TILE;
    for (let col = 0; col < 3; col++) {
      const bx = x + offset + col * SUB_TILE * 2 - (row % 2 === 1 ? SUB_TILE : 0);
      if (bx >= x && bx < x + TILE_SIZE - SUB_TILE) {
        drawPokemonBrick(gfx, bx, y + row * SUB_TILE, mainColor, lightColor);
      }
    }
  }
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2);
}

function drawPokemonTable(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, woodDark: number, woodLight: number) {
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x - 1, y - 1, w + 2, h + 2);
  gfx.fillStyle(woodDark, 1);
  gfx.fillRect(x, y, w, h);
  gfx.fillStyle(woodLight, 1);
  gfx.fillRect(x, y, w, 2);
  gfx.fillRect(x, y, 2, h);
  gfx.fillStyle(POKEMON_STYLE.shadow, 0.6);
  gfx.fillRect(x, y + h - 2, w, 2);
  for (let i = SUB_TILE; i < w - SUB_TILE; i += SUB_TILE * 2) {
    gfx.fillStyle(woodLight, 0.3);
    gfx.fillRect(x + i, y + 2, 2, h - 4);
  }
}

function drawPokemonCandle(gfx: Phaser.GameObjects.Graphics, x: number, y: number, glowColor: number) {
  gfx.fillStyle(0x4a3a2a, 1);
  gfx.fillRect(x + 6, y + 16, 4, 8);
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x + 5, y + 16, 1, 8);
  gfx.fillRect(x + 10, y + 16, 1, 8);
  gfx.fillStyle(0xccaa44, 1);
  gfx.fillRect(x + 6, y + 12, 4, 6);
  gfx.fillStyle(glowColor, 1);
  gfx.fillRect(x + 7, y + 10, 2, 4);
  gfx.fillStyle(glowColor, 0.4);
  gfx.fillCircle(x + 8, y + 12, 10);
  gfx.fillStyle(glowColor, 0.15);
  gfx.fillCircle(x + 8, y + 12, 18);
}

function drawPokemonBanner(gfx: Phaser.GameObjects.Graphics, x: number, y: number, bannerColor: number, accentColor: number) {
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x + 4, y, 24, 30);
  gfx.fillStyle(bannerColor, 1);
  gfx.fillRect(x + 5, y + 1, 22, 28);
  gfx.fillStyle(accentColor, 1);
  gfx.fillRect(x + 5, y + 1, 22, 3);
  gfx.fillRect(x + 13, y + 8, 6, 12);
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x + 6, y + 28, 8, 4);
  gfx.fillRect(x + 18, y + 28, 8, 4);
}

function drawPokemonWindow(gfx: Phaser.GameObjects.Graphics, x: number, y: number, frameColor: number, glassColor: number, lightColor: number) {
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x + 2, y + 2, 28, 28);
  gfx.fillStyle(frameColor, 1);
  gfx.fillRect(x + 3, y + 3, 26, 26);
  gfx.fillStyle(glassColor, 1);
  gfx.fillRect(x + 5, y + 5, 10, 10);
  gfx.fillRect(x + 17, y + 5, 10, 10);
  gfx.fillRect(x + 5, y + 17, 10, 10);
  gfx.fillRect(x + 17, y + 17, 10, 10);
  gfx.fillStyle(lightColor, 0.5);
  gfx.fillRect(x + 5, y + 5, 4, 4);
  gfx.fillRect(x + 17, y + 5, 4, 4);
}

function drawPokemonChalkboard(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, frameColor: number) {
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x - 2, y, w + 4, 28);
  gfx.fillStyle(frameColor, 1);
  gfx.fillRect(x - 1, y + 1, w + 2, 26);
  gfx.fillStyle(0x1a3020, 1);
  gfx.fillRect(x + 2, y + 3, w - 4, 20);
  gfx.fillStyle(0x88aa88, 0.4);
  gfx.fillRect(x + 6, y + 8, w * 0.6, 2);
  gfx.fillRect(x + 10, y + 14, w * 0.4, 2);
}

function drawPokemonDesk(gfx: Phaser.GameObjects.Graphics, x: number, y: number, woodColor: number, legColor: number) {
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x - 1, y, TILE_SIZE * 2 + 2, 22);
  gfx.fillStyle(woodColor, 1);
  gfx.fillRect(x, y + 1, TILE_SIZE * 2, 20);
  gfx.fillStyle(legColor, 1);
  gfx.fillRect(x, y + 1, TILE_SIZE * 2, 3);
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x + 4, y + 18, 4, 8);
  gfx.fillRect(x + TILE_SIZE * 2 - 8, y + 18, 4, 8);
}

function drawPokemonTorch(gfx: Phaser.GameObjects.Graphics, x: number, y: number, flameColor: number) {
  gfx.fillStyle(0x3a2a1a, 1);
  gfx.fillRect(x + 12, y + 14, 8, 16);
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x + 11, y + 14, 1, 16);
  gfx.fillRect(x + 20, y + 14, 1, 16);
  gfx.fillStyle(flameColor, 1);
  gfx.fillRect(x + 13, y + 8, 6, 8);
  gfx.fillStyle(0xffee88, 1);
  gfx.fillRect(x + 14, y + 10, 4, 4);
  gfx.fillStyle(flameColor, 0.5);
  gfx.fillCircle(x + 16, y + 12, 12);
  gfx.fillStyle(flameColor, 0.2);
  gfx.fillCircle(x + 16, y + 12, 20);
}

function drawPokemonPortrait(gfx: Phaser.GameObjects.Graphics, x: number, y: number, frameColor: number, canvasColor: number) {
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x + 2, y, 28, 28);
  gfx.fillStyle(frameColor, 1);
  gfx.fillRect(x + 3, y + 1, 26, 26);
  gfx.fillStyle(canvasColor, 1);
  gfx.fillRect(x + 6, y + 4, 20, 20);
  gfx.fillStyle(0x8a6a5a, 1);
  gfx.fillCircle(x + 16, y + 10, 5);
  gfx.fillStyle(0x5a4a3a, 1);
  gfx.fillRect(x + 12, y + 14, 8, 8);
}

function drawPokemonChain(gfx: Phaser.GameObjects.Graphics, x: number, y: number, h: number, chainColor: number) {
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillRect(x, y, 6, h);
  for (let i = 0; i < h; i += 8) {
    gfx.fillStyle(chainColor, 1);
    gfx.fillRect(x + 1, y + i, 4, 6);
    gfx.fillStyle(POKEMON_STYLE.highlight, 0.4);
    gfx.fillRect(x + 1, y + i, 1, 4);
  }
}

function drawPokemonFountain(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, stoneColor: number, waterColor: number) {
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillCircle(cx, cy, TILE_SIZE * 1.6);
  gfx.fillStyle(stoneColor, 1);
  gfx.fillCircle(cx, cy, TILE_SIZE * 1.5);
  gfx.fillStyle(POKEMON_STYLE.outline, 1);
  gfx.fillCircle(cx, cy, TILE_SIZE * 1.1);
  gfx.fillStyle(waterColor, 1);
  gfx.fillCircle(cx, cy, TILE_SIZE);
  gfx.fillStyle(0x88bbff, 0.4);
  gfx.fillCircle(cx - 6, cy - 6, TILE_SIZE * 0.5);
  gfx.fillStyle(stoneColor, 1);
  gfx.fillCircle(cx, cy, 8);
  gfx.fillStyle(waterColor, 0.8);
  gfx.fillRect(cx - 2, cy - 20, 4, 14);
  gfx.fillCircle(cx, cy - 20, 6);
}

function drawPokemonGrass(gfx: Phaser.GameObjects.Graphics, x: number, y: number, grassDark: number, grassLight: number, variant: number) {
  gfx.fillStyle(grassDark, 1);
  gfx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      if ((sx + sy + variant) % 3 === 0) {
        gfx.fillStyle(grassLight, 0.5);
        gfx.fillRect(x + sx * SUB_TILE + 2, y + sy * SUB_TILE + 2, 4, 4);
      }
      if ((sx * 3 + sy * 7 + variant) % 11 === 0) {
        gfx.fillStyle(grassLight, 0.7);
        gfx.fillRect(x + sx * SUB_TILE + 3, y + sy * SUB_TILE, 2, 6);
      }
    }
  }
}

function drawPokemonFlower(gfx: Phaser.GameObjects.Graphics, x: number, y: number, petalColor: number, centerColor: number) {
  gfx.fillStyle(0x2a5020, 1);
  gfx.fillRect(x + 3, y + 4, 2, 4);
  gfx.fillStyle(petalColor, 1);
  gfx.fillRect(x + 1, y, 2, 3);
  gfx.fillRect(x + 5, y, 2, 3);
  gfx.fillRect(x, y + 2, 3, 2);
  gfx.fillRect(x + 5, y + 2, 3, 2);
  gfx.fillStyle(centerColor, 1);
  gfx.fillRect(x + 3, y + 1, 2, 2);
}

function drawPokemonCarpet(gfx: Phaser.GameObjects.Graphics, x: number, y: number, carpetColor: number, borderColor: number, isEdgeLeft: boolean, isEdgeRight: boolean) {
  gfx.fillStyle(carpetColor, 1);
  gfx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  if (isEdgeLeft) {
    gfx.fillStyle(borderColor, 1);
    gfx.fillRect(x, y, 4, TILE_SIZE);
    gfx.fillStyle(POKEMON_STYLE.outline, 1);
    gfx.fillRect(x, y, 1, TILE_SIZE);
  }
  if (isEdgeRight) {
    gfx.fillStyle(borderColor, 1);
    gfx.fillRect(x + TILE_SIZE - 4, y, 4, TILE_SIZE);
    gfx.fillStyle(POKEMON_STYLE.outline, 1);
    gfx.fillRect(x + TILE_SIZE - 1, y, 1, TILE_SIZE);
  }
  for (let i = SUB_TILE; i < TILE_SIZE - SUB_TILE; i += SUB_TILE * 2) {
    gfx.fillStyle(borderColor, 0.3);
    gfx.fillRect(x + 6, y + i, TILE_SIZE - 12, 2);
  }
}

function drawPokemonSpiral(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number, size: number) {
  gfx.lineStyle(2, POKEMON_STYLE.outline, 1);
  gfx.strokeCircle(cx, cy, size);
  gfx.lineStyle(2, color, 0.6);
  gfx.strokeCircle(cx, cy, size - 4);
  gfx.fillStyle(color, 0.3);
  gfx.fillCircle(cx, cy, size - 8);
  gfx.fillStyle(color, 0.6);
  gfx.fillCircle(cx, cy, 6);
}

function getLocationTypeFromName(name: string): LocationType {
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes("great hall") || lowerName.includes("dining") || lowerName.includes("feast")) {
    return "great_hall";
  }
  if (lowerName.includes("classroom") || lowerName.includes("class") || lowerName.includes("study") || 
      lowerName.includes("charms") || lowerName.includes("transfiguration") || lowerName.includes("potions") ||
      lowerName.includes("defense") || lowerName.includes("herbology") || lowerName.includes("library")) {
    return "classroom";
  }
  if (lowerName.includes("dungeon") || lowerName.includes("slytherin") || lowerName.includes("cellar") ||
      lowerName.includes("undercroft") || lowerName.includes("basement") || lowerName.includes("crypt")) {
    return "dungeon";
  }
  if (lowerName.includes("tower") || lowerName.includes("astronomy") || lowerName.includes("ravenclaw") ||
      lowerName.includes("divination") || lowerName.includes("owlery") || lowerName.includes("headmaster")) {
    return "tower";
  }
  if (lowerName.includes("courtyard") || lowerName.includes("garden") || lowerName.includes("grounds") ||
      lowerName.includes("greenhouse") || lowerName.includes("quad") || lowerName.includes("outdoor") ||
      lowerName.includes("lake") || lowerName.includes("forest") || lowerName.includes("bridge")) {
    return "courtyard";
  }
  if (lowerName.includes("corridor") || lowerName.includes("hallway") || lowerName.includes("passage") ||
      lowerName.includes("staircase") || lowerName.includes("entrance") || lowerName.includes("foyer") ||
      lowerName.includes("lobby") || lowerName.includes("vestibule") || lowerName.includes("gryffindor") ||
      lowerName.includes("hufflepuff") || lowerName.includes("common room")) {
    return "corridor";
  }
  
  return "undercroft";
}

interface InteractiveObject {
  id: string;
  name: string;
  type: "npc" | "item" | "examine" | "trigger" | "exit";
  x: number;
  y: number;
  spriteKey?: string;
  dialogue?: string;
  onInteract?: () => void;
}

export interface ExitPoint {
  id: string;
  toLocation: string;
  connectionType: string;
  x: number;
  y: number;
  isHidden?: boolean;
}

interface OverworldCanvasProps {
  locationName: string;
  playerName: string;
  playerSpriteUrl?: string;
  width?: number;
  height?: number;
  objects?: InteractiveObject[];
  exitPoints?: ExitPoint[];
  onInteraction?: (object: InteractiveObject) => void;
  onPlayerMove?: (position: { x: number; y: number }) => void;
  onExitApproach?: (exit: ExitPoint | null) => void;
  isPaused?: boolean;
  isRunning?: boolean;
  spawnPosition?: { x: number; y: number };
}

export interface OverworldCanvasRef {
  pauseMovement: () => void;
  resumeMovement: () => void;
  getPlayerPosition: () => { x: number; y: number } | null;
  showInteractionPrompt: (text: string) => void;
  hideInteractionPrompt: () => void;
  setTouchDirection: (direction: "up" | "down" | "left" | "right" | null) => void;
}

export const OverworldCanvas = forwardRef<OverworldCanvasRef, OverworldCanvasProps>(({
  locationName,
  playerName,
  playerSpriteUrl,
  width = 480,
  height = 360,
  objects = [],
  exitPoints = [],
  onInteraction,
  onPlayerMove,
  onExitApproach,
  isPaused = false,
  isRunning = false,
  spawnPosition,
}, ref) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<Phaser.Scene | null>(null);
  const playerRef = useRef<Phaser.Physics.Arcade.Sprite | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pausedRef = useRef(isPaused);
  const runningRef = useRef(isRunning);
  const interactionPromptRef = useRef<Phaser.GameObjects.Container | null>(null);
  const nearbyObjectRef = useRef<InteractiveObject | null>(null);
  const playerDirectionRef = useRef<"down" | "up" | "left" | "right">("down");
  const exitMarkersRef = useRef<Phaser.GameObjects.Container[]>([]);
  const nearbyExitRef = useRef<ExitPoint | null>(null);
  const touchDirectionRef = useRef<"up" | "down" | "left" | "right" | null>(null);
  
  const objectsRef = useRef(objects);
  const exitPointsRef = useRef(exitPoints);
  const onInteractionRef = useRef(onInteraction);
  const onPlayerMoveRef = useRef(onPlayerMove);
  const onExitApproachRef = useRef(onExitApproach);
  const spawnPositionRef = useRef(spawnPosition);

  const tilesX = useMemo(() => Math.ceil(width / TILE_SIZE), [width]);
  const tilesY = useMemo(() => Math.ceil(height / TILE_SIZE), [height]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);
  
  useEffect(() => {
    runningRef.current = isRunning;
  }, [isRunning]);
  
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);
  
  useEffect(() => {
    onInteractionRef.current = onInteraction;
  }, [onInteraction]);
  
  useEffect(() => {
    onPlayerMoveRef.current = onPlayerMove;
  }, [onPlayerMove]);
  
  useEffect(() => {
    exitPointsRef.current = exitPoints;
  }, [exitPoints]);
  
  useEffect(() => {
    onExitApproachRef.current = onExitApproach;
  }, [onExitApproach]);
  
  useEffect(() => {
    spawnPositionRef.current = spawnPosition;
  }, [spawnPosition]);

  useImperativeHandle(ref, () => ({
    pauseMovement: () => {
      pausedRef.current = true;
      if (playerRef.current?.body && sceneRef.current) {
        (playerRef.current.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        const idleAnim = `player_idle_${playerDirectionRef.current}`;
        if (sceneRef.current.anims.exists(idleAnim)) {
          playerRef.current.play(idleAnim, true);
        }
      }
    },
    resumeMovement: () => {
      pausedRef.current = false;
    },
    getPlayerPosition: () => {
      if (playerRef.current) {
        return { x: playerRef.current.x, y: playerRef.current.y };
      }
      return null;
    },
    showInteractionPrompt: (text: string) => {
      if (sceneRef.current && interactionPromptRef.current) {
        const textObj = interactionPromptRef.current.getByName("promptText") as Phaser.GameObjects.Text;
        if (textObj) {
          textObj.setText(text);
        }
        interactionPromptRef.current.setVisible(true);
      }
    },
    hideInteractionPrompt: () => {
      if (interactionPromptRef.current) {
        interactionPromptRef.current.setVisible(false);
      }
    },
    setTouchDirection: (direction: "up" | "down" | "left" | "right" | null) => {
      touchDirectionRef.current = direction;
    },
  }));

  const cleanupGame = useCallback(() => {
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
      playerRef.current = null;
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
      backgroundColor: "#0a0a12",
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      scene: {
        key: "OverworldScene",
        preload: preloadScene,
        create: createScene,
        update: updateScene,
      },
    };

    function preloadScene(this: Phaser.Scene) {
      this.load.on("loaderror", () => {});
    }

    function createScene(this: Phaser.Scene) {
      sceneRef.current = this;
      const graphics = this.add.graphics();

      const locationType = getLocationTypeFromName(locationName);
      renderMap(graphics, tilesX, tilesY, locationType);

      const wallGroup = this.physics.add.staticGroup();
      createWalls(this, wallGroup, tilesX, tilesY, locationType);

      const spawnX = width / 2;
      const spawnY = height - TILE_SIZE * 2.5;

      const player = this.physics.add.sprite(spawnX, spawnY, "__DEFAULT");
      player.setDepth(10);
      player.setCollideWorldBounds(true);
      (player.body as Phaser.Physics.Arcade.Body).setSize(20, 20);
      (player.body as Phaser.Physics.Arcade.Body).setOffset(6, 12);
      playerRef.current = player;

      drawPlayerGraphics(this, player, playerSpriteUrl);

      this.physics.add.collider(player, wallGroup);

      const interactableGroup = this.physics.add.staticGroup();
      const objectSprites: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();

      objectsRef.current.forEach((obj) => {
        const objSprite = createInteractiveObject(this, obj, interactableGroup);
        if (objSprite) {
          objectSprites.set(obj.id, objSprite);
        }
      });

      const promptBg = this.add.rectangle(0, 0, 120, 24, 0x1a1a2e, 0.9);
      promptBg.setStrokeStyle(1, UNDERCROFT_PALETTE.accent);
      const promptText = this.add.text(0, 0, "[E] Interact", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#8b6cc0",
      }).setOrigin(0.5).setName("promptText");
      
      const promptContainer = this.add.container(width / 2, height - 30, [promptBg, promptText]);
      promptContainer.setDepth(100);
      promptContainer.setVisible(false);
      interactionPromptRef.current = promptContainer;

      const cursors = this.input.keyboard?.createCursorKeys();
      const wasd = this.input.keyboard?.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        interact: Phaser.Input.Keyboard.KeyCodes.E,
        interactAlt: Phaser.Input.Keyboard.KeyCodes.SPACE,
      }) as { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key; interact: Phaser.Input.Keyboard.Key; interactAlt: Phaser.Input.Keyboard.Key };

      (this as any).controls = { cursors, wasd };
      (this as any).objectSprites = objectSprites;
      (this as any).interactableGroup = interactableGroup;

      this.input.keyboard?.on("keydown-E", handleInteraction);
      this.input.keyboard?.on("keydown-SPACE", handleInteraction);

      function handleInteraction() {
        if (pausedRef.current) return;
        if (nearbyObjectRef.current && onInteractionRef.current) {
          onInteractionRef.current(nearbyObjectRef.current);
        }
      }

      this.add.text(width / 2, 12, locationName, {
        fontFamily: "serif",
        fontSize: "11px",
        color: "#8b6cc0",
        stroke: "#0a0a12",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(100);

      exitMarkersRef.current.forEach(m => m.destroy());
      exitMarkersRef.current = [];
      
      exitPointsRef.current.forEach((exit) => {
        const exitMarker = createExitMarker(this, exit);
        if (exitMarker) {
          exitMarkersRef.current.push(exitMarker);
        }
      });

      if (spawnPositionRef.current && player) {
        player.setPosition(spawnPositionRef.current.x, spawnPositionRef.current.y);
      }

      setIsLoading(false);
    }

    function createExitMarker(scene: Phaser.Scene, exit: ExitPoint): Phaser.GameObjects.Container {
      const container = scene.add.container(exit.x, exit.y);
      container.setDepth(5);
      
      const gfx = scene.add.graphics();
      
      if (exit.isHidden) {
        gfx.lineStyle(2, UNDERCROFT_PALETTE.accent, 0.4);
        gfx.strokeCircle(0, 0, 12);
        gfx.fillStyle(UNDERCROFT_PALETTE.glow, 0.1);
        gfx.fillCircle(0, 0, 10);
      } else {
        const exitTypeColors: Record<string, number> = {
          door: 0x8b6cc0,
          stairs: 0x6b8cc0,
          path: 0x6bc08b,
          hidden: 0xc08b6b,
          portal: 0xc06bc0,
        };
        const color = exitTypeColors[exit.connectionType] || UNDERCROFT_PALETTE.glow;
        
        gfx.lineStyle(2, color, 0.7);
        gfx.strokeRect(-14, -14, 28, 28);
        gfx.fillStyle(color, 0.15);
        gfx.fillRect(-12, -12, 24, 24);
        
        if (exit.connectionType === "stairs") {
          gfx.lineStyle(1, color, 0.5);
          for (let i = 0; i < 3; i++) {
            gfx.strokeRect(-8 + i * 2, -6 + i * 4, 16 - i * 4, 2);
          }
        } else if (exit.connectionType === "door") {
          gfx.fillStyle(color, 0.4);
          gfx.fillRect(-4, -10, 8, 18);
        }
      }
      
      container.add(gfx);
      
      scene.tweens.add({
        targets: gfx,
        alpha: { from: 1, to: 0.5 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      
      return container;
    }

    function updateScene(this: Phaser.Scene) {
      const player = playerRef.current;
      if (!player?.body) return;

      const body = player.body as Phaser.Physics.Arcade.Body;
      const { cursors, wasd } = (this as any).controls || {};

      if (pausedRef.current) {
        body.setVelocity(0, 0);
        const idleAnim = `player_idle_${playerDirectionRef.current}`;
        if (this.anims.exists(idleAnim)) {
          player.play(idleAnim, true);
        }
        return;
      }

      const speed = runningRef.current ? PLAYER_RUN_SPEED : PLAYER_SPEED;
      let vx = 0;
      let vy = 0;

      const touchDir = touchDirectionRef.current;
      
      if (cursors?.left?.isDown || wasd?.left?.isDown || touchDir === "left") vx = -speed;
      else if (cursors?.right?.isDown || wasd?.right?.isDown || touchDir === "right") vx = speed;

      if (cursors?.up?.isDown || wasd?.up?.isDown || touchDir === "up") vy = -speed;
      else if (cursors?.down?.isDown || wasd?.down?.isDown || touchDir === "down") vy = speed;

      if (vx !== 0 && vy !== 0) {
        vx *= 0.707;
        vy *= 0.707;
      }

      body.setVelocity(vx, vy);

      let newDirection: "down" | "up" | "left" | "right" = playerDirectionRef.current;
      if (vy < 0) newDirection = "up";
      else if (vy > 0) newDirection = "down";
      else if (vx < 0) newDirection = "left";
      else if (vx > 0) newDirection = "right";

      if (vx !== 0 || vy !== 0) {
        playerDirectionRef.current = newDirection;
        const walkAnim = `player_walk_${newDirection}`;
        if (this.anims.exists(walkAnim) && player.anims.currentAnim?.key !== walkAnim) {
          player.play(walkAnim, true);
        }
        onPlayerMoveRef.current?.({ x: player.x, y: player.y });
      } else {
        const idleAnim = `player_idle_${newDirection}`;
        if (this.anims.exists(idleAnim) && player.anims.currentAnim?.key !== idleAnim) {
          player.play(idleAnim, true);
        }
      }

      let closestObjResult: InteractiveObject | null = null;
      let closestDist = 50;

      for (const obj of objectsRef.current) {
        const dist = Phaser.Math.Distance.Between(player.x, player.y, obj.x, obj.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestObjResult = obj;
        }
      }

      nearbyObjectRef.current = closestObjResult;

      let closestExit: ExitPoint | null = null;
      let closestExitDist = 40;

      for (const exit of exitPointsRef.current) {
        const dist = Phaser.Math.Distance.Between(player.x, player.y, exit.x, exit.y);
        if (dist < closestExitDist) {
          closestExitDist = dist;
          closestExit = exit;
        }
      }

      if (closestExit !== nearbyExitRef.current) {
        nearbyExitRef.current = closestExit;
        onExitApproachRef.current?.(closestExit);
      }

      if (interactionPromptRef.current) {
        if (closestExit) {
          const textObj = interactionPromptRef.current.getByName("promptText") as Phaser.GameObjects.Text;
          if (textObj) {
            const typeLabel = closestExit.connectionType === "stairs" ? "Climb to" :
                              closestExit.connectionType === "door" ? "Enter" :
                              closestExit.connectionType === "hidden" ? "Secret to" :
                              closestExit.connectionType === "path" ? "Go to" : "To";
            textObj.setText(`[E] ${typeLabel} ${closestExit.toLocation}`);
          }
          interactionPromptRef.current.setVisible(true);
        } else if (closestObjResult) {
          const textObj = interactionPromptRef.current.getByName("promptText") as Phaser.GameObjects.Text;
          if (textObj) {
            const objType = closestObjResult.type;
            const objName = closestObjResult.name;
            const label = objType === "npc" ? `[E] Talk to ${objName}` :
                          objType === "item" ? `[E] Pick up ${objName}` :
                          objType === "examine" ? `[E] Examine ${objName}` :
                          `[E] ${objName}`;
            textObj.setText(label);
          }
          interactionPromptRef.current.setVisible(true);
        } else {
          interactionPromptRef.current.setVisible(false);
        }
      }
    }

    function renderUndercroft(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number) {
      for (let y = 0; y < ty; y++) {
        for (let x = 0; x < tx; x++) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const isWall = x === 0 || x === tx - 1 || y === 0 || y === ty - 1;
          const isSecondWall = x === 1 || x === tx - 2 || y === 1;

          if (isWall) {
            gfx.fillStyle(UNDERCROFT_PALETTE.black, 1);
            gfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            gfx.fillStyle(UNDERCROFT_PALETTE.darkStone, 1);
            gfx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);

            gfx.fillStyle(UNDERCROFT_PALETTE.black, 1);
            gfx.fillRect(px + 4, py + TILE_SIZE - 4, TILE_SIZE - 8, 2);
          } else if (isSecondWall) {
            gfx.fillStyle(UNDERCROFT_PALETTE.stone, 1);
            gfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            gfx.fillStyle(UNDERCROFT_PALETTE.darkStone, 0.3);
            gfx.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE, 2);
          } else {
            gfx.fillStyle(UNDERCROFT_PALETTE.stone, 1);
            gfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            if ((x + y) % 2 === 0) {
              gfx.fillStyle(UNDERCROFT_PALETTE.lightStone, 0.15);
              gfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }

            gfx.fillStyle(UNDERCROFT_PALETTE.black, 0.08);
            gfx.fillRect(px + TILE_SIZE - 1, py, 1, TILE_SIZE);
            gfx.fillRect(px, py + TILE_SIZE - 1, TILE_SIZE, 1);
          }
        }
      }

      const centerX = tx / 2;
      const centerY = ty / 2;
      drawRitualCircle(gfx, centerX * TILE_SIZE, centerY * TILE_SIZE);

      drawPillar(gfx, TILE_SIZE * 3, TILE_SIZE * 3);
      drawPillar(gfx, (tx - 4) * TILE_SIZE, TILE_SIZE * 3);
      drawPillar(gfx, TILE_SIZE * 3, (ty - 4) * TILE_SIZE);
      drawPillar(gfx, (tx - 4) * TILE_SIZE, (ty - 4) * TILE_SIZE);

      drawCandle(gfx, TILE_SIZE * 2, TILE_SIZE * 2);
      drawCandle(gfx, (tx - 3) * TILE_SIZE, TILE_SIZE * 2);
      drawCandle(gfx, TILE_SIZE * 2, (ty - 3) * TILE_SIZE);
      drawCandle(gfx, (tx - 3) * TILE_SIZE, (ty - 3) * TILE_SIZE);

      drawTome(gfx, TILE_SIZE * 4, TILE_SIZE * 2 + 8);
    }

    function drawRitualCircle(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number) {
      const radius = TILE_SIZE * 2;
      
      gfx.lineStyle(2, UNDERCROFT_PALETTE.accent, 0.6);
      gfx.strokeCircle(cx, cy, radius);
      
      gfx.lineStyle(1, UNDERCROFT_PALETTE.glow, 0.4);
      gfx.strokeCircle(cx, cy, radius - 8);
      
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const x1 = cx + Math.cos(angle) * (radius - 12);
        const y1 = cy + Math.sin(angle) * (radius - 12);
        const x2 = cx + Math.cos(angle) * (radius + 4);
        const y2 = cy + Math.sin(angle) * (radius + 4);
        gfx.lineStyle(1, UNDERCROFT_PALETTE.glow, 0.5);
        gfx.lineBetween(x1, y1, x2, y2);
      }

      gfx.fillStyle(UNDERCROFT_PALETTE.glow, 0.1);
      gfx.fillCircle(cx, cy, radius - 16);
    }

    function drawPillar(gfx: Phaser.GameObjects.Graphics, x: number, y: number) {
      gfx.fillStyle(UNDERCROFT_PALETTE.black, 1);
      gfx.fillRect(x - 1, y - 1, TILE_SIZE + 2, TILE_SIZE + 10);
      
      gfx.fillStyle(UNDERCROFT_PALETTE.darkStone, 1);
      gfx.fillRect(x, y, TILE_SIZE, TILE_SIZE + 8);
      
      gfx.fillStyle(UNDERCROFT_PALETTE.stone, 1);
      gfx.fillRect(x + 2, y + 2, TILE_SIZE - 8, TILE_SIZE + 4);
      
      gfx.fillStyle(UNDERCROFT_PALETTE.lightStone, 0.3);
      gfx.fillRect(x + 2, y + 2, 4, TILE_SIZE + 4);
    }

    function drawCandle(gfx: Phaser.GameObjects.Graphics, x: number, y: number) {
      gfx.fillStyle(UNDERCROFT_PALETTE.darkStone, 1);
      gfx.fillRect(x + 12, y + 20, 8, 12);
      
      gfx.fillStyle(UNDERCROFT_PALETTE.candle, 0.8);
      gfx.fillCircle(x + 16, y + 16, 6);
      gfx.fillStyle(UNDERCROFT_PALETTE.candle, 0.4);
      gfx.fillCircle(x + 16, y + 16, 10);
    }

    function drawTome(gfx: Phaser.GameObjects.Graphics, x: number, y: number) {
      gfx.fillStyle(UNDERCROFT_PALETTE.black, 1);
      gfx.fillRect(x - 1, y - 1, 26, 20);
      
      gfx.fillStyle(0x4a2c5a, 1);
      gfx.fillRect(x, y, 24, 18);
      
      gfx.fillStyle(0xd4af37, 0.6);
      gfx.fillRect(x + 2, y + 2, 20, 1);
      gfx.fillRect(x + 11, y + 2, 2, 14);
    }

    function renderGreatHall(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number) {
      for (let y = 0; y < ty; y++) {
        for (let x = 0; x < tx; x++) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const isWall = x === 0 || x === tx - 1 || y === 0 || y === 1;
          
          if (isWall) {
            drawPokemonWall(gfx, px, py, GREAT_HALL_PALETTE.black, GREAT_HALL_PALETTE.stone, GREAT_HALL_PALETTE.lightWood);
            if (y === 1 && x > 2 && x < tx - 3 && x % 4 === 0) {
              drawPokemonCandle(gfx, px, py, GREAT_HALL_PALETTE.candleGlow);
            }
            if (y === 0 && x > 1 && x < tx - 2 && x % 5 === 2) {
              drawPokemonBanner(gfx, px, py, GREAT_HALL_PALETTE.banner, GREAT_HALL_PALETTE.gold);
            }
          } else {
            drawPokemonFloor(gfx, px, py, GREAT_HALL_PALETTE.darkWood, GREAT_HALL_PALETTE.wood, x + y);
          }
        }
      }
      for (let row = 0; row < 4; row++) {
        const tableY = TILE_SIZE * 3 + row * TILE_SIZE * 2;
        const tableW = (tx - 4) * TILE_SIZE;
        drawPokemonTable(gfx, TILE_SIZE * 2, tableY, tableW, TILE_SIZE - 4, GREAT_HALL_PALETTE.wood, GREAT_HALL_PALETTE.lightWood);
      }
    }

    function renderClassroom(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number) {
      for (let y = 0; y < ty; y++) {
        for (let x = 0; x < tx; x++) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const isWall = x === 0 || x === tx - 1 || y === 0 || y === 1;
          
          if (isWall) {
            drawPokemonWall(gfx, px, py, CLASSROOM_PALETTE.black, CLASSROOM_PALETTE.darkStone, CLASSROOM_PALETTE.lightStone);
            if (y === 1 && x >= 3 && x <= tx - 4) {
              drawPokemonChalkboard(gfx, px, py + 2, TILE_SIZE, CLASSROOM_PALETTE.wood);
            }
            if (y === 1 && x === 2) {
              drawPokemonCandle(gfx, px, py, CLASSROOM_PALETTE.candle);
            }
          } else {
            drawPokemonFloor(gfx, px, py, CLASSROOM_PALETTE.stone, CLASSROOM_PALETTE.lightStone, x + y);
          }
        }
      }
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const deskX = TILE_SIZE * 2 + col * TILE_SIZE * 4;
          const deskY = TILE_SIZE * 4 + row * TILE_SIZE * 2;
          drawPokemonDesk(gfx, deskX, deskY, CLASSROOM_PALETTE.wood, CLASSROOM_PALETTE.lightStone);
        }
      }
    }

    function renderDungeon(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number) {
      for (let y = 0; y < ty; y++) {
        for (let x = 0; x < tx; x++) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const isWall = x === 0 || x === tx - 1 || y === 0 || y === ty - 1;
          const isSecondWall = x === 1 || x === tx - 2 || y === 1;
          
          if (isWall) {
            drawPokemonWall(gfx, px, py, DUNGEON_PALETTE.black, DUNGEON_PALETTE.darkStone, DUNGEON_PALETTE.stone);
            if ((x + y) % 3 === 0) {
              gfx.fillStyle(DUNGEON_PALETTE.moss, 0.5);
              gfx.fillRect(px + 4, py + TILE_SIZE - 10, 10, 8);
              gfx.fillRect(px + 8, py + TILE_SIZE - 14, 6, 4);
            }
          } else if (isSecondWall) {
            drawPokemonWall(gfx, px, py, DUNGEON_PALETTE.darkStone, DUNGEON_PALETTE.stone, DUNGEON_PALETTE.lightStone);
            if (y === 1 && x % 5 === 2) {
              drawPokemonTorch(gfx, px, py, DUNGEON_PALETTE.torch);
            }
          } else {
            drawPokemonFloor(gfx, px, py, DUNGEON_PALETTE.stone, DUNGEON_PALETTE.lightStone, x + y);
          }
        }
      }
      for (let i = 0; i < 3; i++) {
        const chainX = TILE_SIZE * 3 + i * TILE_SIZE * 4;
        drawPokemonChain(gfx, chainX, TILE_SIZE * 2, TILE_SIZE * 2, DUNGEON_PALETTE.chain);
      }
      gfx.fillStyle(POKEMON_STYLE.outline, 1);
      gfx.fillCircle(tx * TILE_SIZE / 2, ty * TILE_SIZE / 2, TILE_SIZE + 4);
      gfx.fillStyle(DUNGEON_PALETTE.green, 0.6);
      gfx.fillCircle(tx * TILE_SIZE / 2, ty * TILE_SIZE / 2, TILE_SIZE);
      gfx.fillStyle(0x4a8a5a, 0.4);
      gfx.fillCircle(tx * TILE_SIZE / 2 - 8, ty * TILE_SIZE / 2 - 8, TILE_SIZE * 0.5);
    }

    function renderTower(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number) {
      for (let y = 0; y < ty; y++) {
        for (let x = 0; x < tx; x++) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const isWall = x === 0 || x === tx - 1;
          const isTopWall = y === 0 || y === 1;
          
          if (isWall) {
            drawPokemonWall(gfx, px, py, TOWER_PALETTE.black, TOWER_PALETTE.darkStone, TOWER_PALETTE.stone);
            if (y % 3 === 1) {
              drawPokemonWindow(gfx, px, py, TOWER_PALETTE.stone, TOWER_PALETTE.skyBlue, TOWER_PALETTE.starlight);
            }
          } else if (isTopWall) {
            drawPokemonWall(gfx, px, py, TOWER_PALETTE.darkStone, TOWER_PALETTE.stone, TOWER_PALETTE.lightStone);
            if (y === 0 && x % 3 === 1) {
              drawPokemonBanner(gfx, px, py, TOWER_PALETTE.accent, TOWER_PALETTE.gold);
            }
          } else {
            drawPokemonFloor(gfx, px, py, TOWER_PALETTE.stone, TOWER_PALETTE.lightStone, x + y);
            const dist = Math.sqrt(Math.pow(x - tx/2, 2) + Math.pow(y - ty/2, 2));
            if (dist < 3) {
              gfx.fillStyle(TOWER_PALETTE.accent, 0.15);
              gfx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
          }
        }
      }
      const cx = tx * TILE_SIZE / 2;
      const cy = ty * TILE_SIZE / 2;
      drawPokemonSpiral(gfx, cx, cy, TOWER_PALETTE.accent, TILE_SIZE * 1.5);
    }

    function renderCourtyard(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number) {
      for (let y = 0; y < ty; y++) {
        for (let x = 0; x < tx; x++) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const isEdge = x === 0 || x === tx - 1 || y === 0 || y === ty - 1;
          const isPath = (x === Math.floor(tx/2) || y === Math.floor(ty/2)) && !isEdge;
          
          if (isEdge) {
            drawPokemonFloor(gfx, px, py, COURTYARD_PALETTE.stone, COURTYARD_PALETTE.lightStone, x + y);
            gfx.fillStyle(POKEMON_STYLE.outline, 1);
            if (x === 0) gfx.fillRect(px, py, 2, TILE_SIZE);
            if (x === tx - 1) gfx.fillRect(px + TILE_SIZE - 2, py, 2, TILE_SIZE);
            if (y === 0) gfx.fillRect(px, py, TILE_SIZE, 2);
            if (y === ty - 1) gfx.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE, 2);
          } else if (isPath) {
            drawPokemonFloor(gfx, px, py, COURTYARD_PALETTE.stone, COURTYARD_PALETTE.lightStone, x + y);
          } else {
            drawPokemonGrass(gfx, px, py, COURTYARD_PALETTE.grass, COURTYARD_PALETTE.lightGrass, x * 3 + y * 7);
            if ((x * 3 + y * 11) % 17 === 0) {
              drawPokemonFlower(gfx, px + 10, py + 10, COURTYARD_PALETTE.flower, 0xffff88);
            }
            if ((x * 7 + y * 5) % 23 === 0) {
              drawPokemonFlower(gfx, px + 4, py + 20, 0x88aaff, 0xffffaa);
            }
          }
        }
      }
      const cx = tx * TILE_SIZE / 2;
      const cy = ty * TILE_SIZE / 2;
      drawPokemonFountain(gfx, cx, cy, COURTYARD_PALETTE.stone, COURTYARD_PALETTE.water);
    }

    function renderCorridor(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number) {
      for (let y = 0; y < ty; y++) {
        for (let x = 0; x < tx; x++) {
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const isWall = x === 0 || x === tx - 1 || y === 0 || y === 1;
          const isCarpetRow = y >= 4 && y <= ty - 3;
          const isCarpet = isCarpetRow && x >= 2 && x <= tx - 3;
          const isLeftEdge = x === 2;
          const isRightEdge = x === tx - 3;
          
          if (isWall) {
            drawPokemonWall(gfx, px, py, CORRIDOR_PALETTE.black, CORRIDOR_PALETTE.darkStone, CORRIDOR_PALETTE.stone);
            if (y === 1 && x % 4 === 2 && x > 0 && x < tx - 1) {
              drawPokemonPortrait(gfx, px, py, CORRIDOR_PALETTE.gold, CORRIDOR_PALETTE.portrait);
            }
            if (y === 0 && x % 6 === 3) {
              drawPokemonTorch(gfx, px, py, CORRIDOR_PALETTE.torch);
            }
          } else {
            drawPokemonFloor(gfx, px, py, CORRIDOR_PALETTE.stone, CORRIDOR_PALETTE.lightStone, x + y);
            if (isCarpet) {
              drawPokemonCarpet(gfx, px, py, CORRIDOR_PALETTE.carpet, CORRIDOR_PALETTE.gold, isLeftEdge, isRightEdge);
            }
          }
        }
      }
    }

    function renderMap(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number, locationType: LocationType) {
      switch (locationType) {
        case "great_hall":
          renderGreatHall(gfx, tx, ty);
          break;
        case "classroom":
          renderClassroom(gfx, tx, ty);
          break;
        case "dungeon":
          renderDungeon(gfx, tx, ty);
          break;
        case "tower":
          renderTower(gfx, tx, ty);
          break;
        case "courtyard":
          renderCourtyard(gfx, tx, ty);
          break;
        case "corridor":
          renderCorridor(gfx, tx, ty);
          break;
        case "undercroft":
        default:
          renderUndercroft(gfx, tx, ty);
          break;
      }
    }

    function createWalls(scene: Phaser.Scene, group: Phaser.Physics.Arcade.StaticGroup, tx: number, ty: number, locationType: LocationType) {
      for (let x = 0; x < tx; x++) {
        group.create(x * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE).setVisible(false).refreshBody();
        group.create(x * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE).setVisible(false).refreshBody();
        if (locationType !== "courtyard") {
          group.create(x * TILE_SIZE + TILE_SIZE / 2, (ty - 1) * TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE).setVisible(false).refreshBody();
        }
      }
      for (let y = 2; y < ty - 1; y++) {
        group.create(TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE).setVisible(false).refreshBody();
        group.create((tx - 1) * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE).setVisible(false).refreshBody();
      }

      if (locationType === "undercroft") {
        group.create(TILE_SIZE * 3 + TILE_SIZE / 2, TILE_SIZE * 3 + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE + 8).setVisible(false).refreshBody();
        group.create((tx - 4) * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE * 3 + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE + 8).setVisible(false).refreshBody();
        group.create(TILE_SIZE * 3 + TILE_SIZE / 2, (ty - 4) * TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE + 8).setVisible(false).refreshBody();
        group.create((tx - 4) * TILE_SIZE + TILE_SIZE / 2, (ty - 4) * TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE + 8).setVisible(false).refreshBody();
      }

      if (locationType === "great_hall") {
        for (let row = 0; row < 4; row++) {
          const tableY = TILE_SIZE * 3 + row * TILE_SIZE * 2 + TILE_SIZE / 2;
          group.create(tx * TILE_SIZE / 2, tableY, "__DEFAULT").setSize((tx - 4) * TILE_SIZE, TILE_SIZE - 4).setVisible(false).refreshBody();
        }
      }

      if (locationType === "classroom") {
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            const deskX = TILE_SIZE * 3 + col * TILE_SIZE * 4;
            const deskY = TILE_SIZE * 4.5 + row * TILE_SIZE * 2;
            group.create(deskX, deskY, "__DEFAULT").setSize(TILE_SIZE * 2, TILE_SIZE - 6).setVisible(false).refreshBody();
          }
        }
      }

      if (locationType === "courtyard") {
        const cx = tx * TILE_SIZE / 2;
        const cy = ty * TILE_SIZE / 2;
        group.create(cx, cy, "__DEFAULT").setSize(TILE_SIZE * 2.5, TILE_SIZE * 2.5).setVisible(false).refreshBody();
      }
    }

    function drawPlayerGraphics(scene: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite, spriteUrl?: string) {
      const FRAME_SIZE = 32;
      const SHEET_COLS = 3;
      const DIRECTIONS = ["down", "left", "right", "up"] as const;
      
      createFallbackPlayerTextures(scene, FRAME_SIZE, DIRECTIONS);
      createFallbackPlayerAnimations(scene, DIRECTIONS);
      player.setTexture("player_down_1");
      player.play("player_idle_down");
      
      if (spriteUrl) {
        scene.load.spritesheet("player_sheet", spriteUrl, {
          frameWidth: FRAME_SIZE,
          frameHeight: FRAME_SIZE,
        });
        scene.load.once("complete", () => {
          DIRECTIONS.forEach((dir) => {
            scene.anims.remove(`player_walk_${dir}`);
            scene.anims.remove(`player_idle_${dir}`);
          });
          createPlayerAnimations(scene, "player_sheet", FRAME_SIZE, SHEET_COLS, DIRECTIONS);
          player.setTexture("player_sheet", 1);
          player.play("player_idle_down");
        });
        scene.load.start();
      }
    }

    function createPlayerAnimations(
      scene: Phaser.Scene, 
      textureKey: string, 
      frameSize: number, 
      cols: number,
      directions: readonly ("down" | "left" | "right" | "up")[]
    ) {
      directions.forEach((dir, row) => {
        const startFrame = row * cols;
        scene.anims.create({
          key: `player_walk_${dir}`,
          frames: scene.anims.generateFrameNumbers(textureKey, { start: startFrame, end: startFrame + 2 }),
          frameRate: 8,
          repeat: -1,
        });
        scene.anims.create({
          key: `player_idle_${dir}`,
          frames: [{ key: textureKey, frame: startFrame + 1 }],
          frameRate: 1,
          repeat: -1,
        });
      });
    }

    function createFallbackPlayerTextures(
      scene: Phaser.Scene, 
      size: number, 
      directions: readonly ("down" | "left" | "right" | "up")[]
    ) {
      const ROBE_COLOR = 0x2d1b4e;
      const ROBE_DARK = 0x1a1030;
      const ROBE_TRIM = 0x8b6cc0;
      const SKIN_COLOR = 0xe8d4b8;
      const SKIN_SHADOW = 0xc4a890;
      const HAIR_COLOR = 0x3a2820;
      const EYE_COLOR = 0x1a1a2e;
      const EYE_WHITE = 0xffffff;

      directions.forEach((dir) => {
        for (let frame = 0; frame < 3; frame++) {
          const gfx = scene.add.graphics();
          const cx = size / 2;
          const cy = size / 2;
          const legOffset = frame === 0 ? -2 : frame === 2 ? 2 : 0;
          const armSwing = frame === 0 ? -1 : frame === 2 ? 1 : 0;

          gfx.fillStyle(ROBE_DARK, 1);
          gfx.fillRect(cx - 9, cy - 4, 18, 19);
          
          gfx.fillStyle(ROBE_COLOR, 1);
          gfx.fillRect(cx - 8, cy - 4, 16, 18);
          
          gfx.fillStyle(ROBE_TRIM, 1);
          gfx.fillRect(cx - 1, cy - 2, 2, 14);
          gfx.fillRect(cx - 7, cy - 3, 14, 1);
          
          gfx.fillStyle(ROBE_DARK, 1);
          if (dir === "left") {
            gfx.fillRect(cx + 4, cy - 4, 4, 16);
          } else if (dir === "right") {
            gfx.fillRect(cx - 8, cy - 4, 4, 16);
          }
          
          gfx.fillStyle(ROBE_COLOR, 1);
          gfx.fillRect(cx - 4 + legOffset, cy + 10, 4, 6);
          gfx.fillRect(cx + legOffset, cy + 10, 4, 6);
          
          gfx.fillStyle(ROBE_DARK, 1);
          gfx.fillRect(cx - 3 + legOffset, cy + 14, 2, 2);
          gfx.fillRect(cx + 1 + legOffset, cy + 14, 2, 2);
          
          gfx.fillStyle(ROBE_COLOR, 1);
          gfx.fillRect(cx - 12 + armSwing, cy - 2, 5, 10);
          gfx.fillRect(cx + 7 - armSwing, cy - 2, 5, 10);
          gfx.fillStyle(SKIN_COLOR, 1);
          gfx.fillRect(cx - 12 + armSwing, cy + 6, 4, 3);
          gfx.fillRect(cx + 8 - armSwing, cy + 6, 4, 3);
          
          gfx.fillStyle(SKIN_COLOR, 1);
          gfx.fillCircle(cx, cy - 8, 6);
          
          gfx.fillStyle(HAIR_COLOR, 1);
          if (dir === "down") {
            gfx.fillRect(cx - 6, cy - 15, 12, 5);
            gfx.fillRect(cx - 6, cy - 12, 2, 3);
            gfx.fillRect(cx + 4, cy - 12, 2, 3);
            
            gfx.fillStyle(EYE_WHITE, 1);
            gfx.fillRect(cx - 4, cy - 9, 3, 2);
            gfx.fillRect(cx + 1, cy - 9, 3, 2);
            gfx.fillStyle(EYE_COLOR, 1);
            gfx.fillRect(cx - 3, cy - 9, 2, 2);
            gfx.fillRect(cx + 2, cy - 9, 2, 2);
            
            gfx.fillStyle(SKIN_SHADOW, 1);
            gfx.fillRect(cx - 1, cy - 5, 2, 1);
            
            gfx.fillStyle(0xc08080, 1);
            gfx.fillRect(cx - 2, cy - 3, 4, 1);
          } else if (dir === "up") {
            gfx.fillCircle(cx, cy - 9, 6);
            gfx.fillRect(cx - 6, cy - 15, 12, 4);
          } else if (dir === "left") {
            gfx.fillRect(cx - 3, cy - 15, 8, 5);
            gfx.fillRect(cx + 3, cy - 12, 3, 5);
            
            gfx.fillStyle(SKIN_SHADOW, 1);
            gfx.fillCircle(cx - 1, cy - 8, 5);
            gfx.fillStyle(SKIN_COLOR, 1);
            gfx.fillCircle(cx, cy - 8, 5);
            
            gfx.fillStyle(EYE_WHITE, 1);
            gfx.fillRect(cx - 4, cy - 9, 2, 2);
            gfx.fillStyle(EYE_COLOR, 1);
            gfx.fillRect(cx - 4, cy - 9, 1, 2);
          } else if (dir === "right") {
            gfx.fillRect(cx - 5, cy - 15, 8, 5);
            gfx.fillRect(cx - 6, cy - 12, 3, 5);
            
            gfx.fillStyle(SKIN_SHADOW, 1);
            gfx.fillCircle(cx + 1, cy - 8, 5);
            gfx.fillStyle(SKIN_COLOR, 1);
            gfx.fillCircle(cx, cy - 8, 5);
            
            gfx.fillStyle(EYE_WHITE, 1);
            gfx.fillRect(cx + 2, cy - 9, 2, 2);
            gfx.fillStyle(EYE_COLOR, 1);
            gfx.fillRect(cx + 3, cy - 9, 1, 2);
          }

          gfx.generateTexture(`player_${dir}_${frame}`, size, size);
          gfx.destroy();
        }
      });
    }

    function createFallbackPlayerAnimations(
      scene: Phaser.Scene,
      directions: readonly ("down" | "left" | "right" | "up")[]
    ) {
      directions.forEach((dir) => {
        scene.anims.create({
          key: `player_walk_${dir}`,
          frames: [
            { key: `player_${dir}_0` },
            { key: `player_${dir}_1` },
            { key: `player_${dir}_2` },
            { key: `player_${dir}_1` },
          ],
          frameRate: 8,
          repeat: -1,
        });
        scene.anims.create({
          key: `player_idle_${dir}`,
          frames: [{ key: `player_${dir}_1` }],
          frameRate: 1,
          repeat: -1,
        });
      });
    }

    function createInteractiveObject(
      scene: Phaser.Scene, 
      obj: InteractiveObject, 
      group: Phaser.Physics.Arcade.StaticGroup
    ): Phaser.Physics.Arcade.Sprite | null {
      const gfx = scene.add.graphics();
      
      if (obj.type === "npc") {
        gfx.fillStyle(0x1a1030, 1);
        gfx.fillRect(-12, -12, 24, 28);
        gfx.fillStyle(0x4a2c5a, 1);
        gfx.fillRect(-10, -10, 20, 24);
        gfx.fillStyle(0xc0a080, 1);
        gfx.fillCircle(0, -6, 6);
        gfx.fillStyle(0x1a1030, 1);
        gfx.fillRect(-10, 0, 20, 14);
        gfx.fillStyle(0x8b6cc0, 1);
        gfx.fillRect(-6, -12, 12, 4);
      } else if (obj.type === "item") {
        gfx.fillStyle(UNDERCROFT_PALETTE.candle, 0.8);
        gfx.fillCircle(0, 0, 8);
        gfx.fillStyle(UNDERCROFT_PALETTE.glow, 0.4);
        gfx.fillCircle(0, 0, 12);
      } else if (obj.type === "examine") {
        gfx.fillStyle(UNDERCROFT_PALETTE.accent, 0.6);
        gfx.fillCircle(0, 0, 6);
      }

      const texKey = `obj_${obj.id}`;
      gfx.generateTexture(texKey, 32, 32);
      gfx.destroy();

      const sprite = group.create(obj.x, obj.y, texKey) as Phaser.Physics.Arcade.Sprite;
      sprite.setDepth(obj.type === "npc" ? 9 : 5);
      sprite.setSize(32, 32);
      sprite.refreshBody();

      return sprite;
    }

    try {
      gameRef.current = new Phaser.Game(config);
    } catch (err) {
      console.error("Failed to create Phaser game:", err);
      setIsLoading(false);
    }

    return cleanupGame;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationName, width, height, tilesX, tilesY]);

  return (
    <div className="relative">
      {isLoading && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-[#0a0a12] z-10 rounded"
          data-testid="overworld-loading"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#8b6cc0] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[#8b6cc0] font-mono">Entering the Undercroft...</p>
          </div>
        </div>
      )}
      <div 
        ref={canvasRef} 
        className="rounded border-2 border-[#4a4a6a] shadow-[0_0_20px_rgba(107,76,154,0.3)]"
        style={{ width, height, imageRendering: "pixelated" }}
        data-testid="overworld-canvas"
      />
      <div className="absolute bottom-2 left-2 text-[10px] text-[#6b4c9a] font-mono opacity-70">
        WASD to move | E to interact
      </div>
    </div>
  );
});

OverworldCanvas.displayName = "OverworldCanvas";
