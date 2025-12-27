import { useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import Phaser from "phaser";

const TILE_SIZE = 32;
const PLAYER_SPEED = 120;

const UNDERCROFT_PALETTE = {
  black: 0x0a0a12,
  darkStone: 0x1a1a2e,
  stone: 0x2d2d44,
  lightStone: 0x4a4a6a,
  accent: 0x6b4c9a,
  glow: 0x8b6cc0,
  candle: 0xffaa44,
};

interface InteractiveObject {
  id: string;
  name: string;
  type: "npc" | "item" | "examine" | "trigger";
  x: number;
  y: number;
  spriteKey?: string;
  dialogue?: string;
  onInteract?: () => void;
}

interface OverworldCanvasProps {
  locationName: string;
  playerName: string;
  width?: number;
  height?: number;
  objects?: InteractiveObject[];
  onInteraction?: (object: InteractiveObject) => void;
  onPlayerMove?: (position: { x: number; y: number }) => void;
  isPaused?: boolean;
}

export interface OverworldCanvasRef {
  pauseMovement: () => void;
  resumeMovement: () => void;
  getPlayerPosition: () => { x: number; y: number } | null;
  showInteractionPrompt: (text: string) => void;
  hideInteractionPrompt: () => void;
}

export const OverworldCanvas = forwardRef<OverworldCanvasRef, OverworldCanvasProps>(({
  locationName,
  playerName,
  width = 480,
  height = 360,
  objects = [],
  onInteraction,
  onPlayerMove,
  isPaused = false,
}, ref) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<Phaser.Scene | null>(null);
  const playerRef = useRef<Phaser.Physics.Arcade.Sprite | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pausedRef = useRef(isPaused);
  const interactionPromptRef = useRef<Phaser.GameObjects.Container | null>(null);
  const nearbyObjectRef = useRef<InteractiveObject | null>(null);
  
  const objectsRef = useRef(objects);
  const onInteractionRef = useRef(onInteraction);
  const onPlayerMoveRef = useRef(onPlayerMove);

  const tilesX = useMemo(() => Math.ceil(width / TILE_SIZE), [width]);
  const tilesY = useMemo(() => Math.ceil(height / TILE_SIZE), [height]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);
  
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);
  
  useEffect(() => {
    onInteractionRef.current = onInteraction;
  }, [onInteraction]);
  
  useEffect(() => {
    onPlayerMoveRef.current = onPlayerMove;
  }, [onPlayerMove]);

  useImperativeHandle(ref, () => ({
    pauseMovement: () => {
      pausedRef.current = true;
      if (playerRef.current?.body) {
        (playerRef.current.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        playerRef.current.play("player_idle", true);
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

      renderUndercroft(graphics, tilesX, tilesY);

      const wallGroup = this.physics.add.staticGroup();
      createWalls(this, wallGroup, tilesX, tilesY);

      const spawnX = width / 2;
      const spawnY = height - TILE_SIZE * 2.5;

      const player = this.physics.add.sprite(spawnX, spawnY, "__DEFAULT");
      player.setDepth(10);
      player.setCollideWorldBounds(true);
      (player.body as Phaser.Physics.Arcade.Body).setSize(20, 20);
      (player.body as Phaser.Physics.Arcade.Body).setOffset(6, 12);
      playerRef.current = player;

      drawPlayerGraphics(this, player);

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

      setIsLoading(false);
    }

    function updateScene(this: Phaser.Scene) {
      const player = playerRef.current;
      if (!player?.body) return;

      const body = player.body as Phaser.Physics.Arcade.Body;
      const { cursors, wasd } = (this as any).controls || {};

      if (pausedRef.current) {
        body.setVelocity(0, 0);
        return;
      }

      let vx = 0;
      let vy = 0;

      if (cursors?.left?.isDown || wasd?.left?.isDown) vx = -PLAYER_SPEED;
      else if (cursors?.right?.isDown || wasd?.right?.isDown) vx = PLAYER_SPEED;

      if (cursors?.up?.isDown || wasd?.up?.isDown) vy = -PLAYER_SPEED;
      else if (cursors?.down?.isDown || wasd?.down?.isDown) vy = PLAYER_SPEED;

      if (vx !== 0 && vy !== 0) {
        vx *= 0.707;
        vy *= 0.707;
      }

      body.setVelocity(vx, vy);

      if (vx !== 0 || vy !== 0) {
        onPlayerMoveRef.current?.({ x: player.x, y: player.y });
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

      if (interactionPromptRef.current) {
        if (closestObjResult) {
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

    function createWalls(scene: Phaser.Scene, group: Phaser.Physics.Arcade.StaticGroup, tx: number, ty: number) {
      for (let x = 0; x < tx; x++) {
        group.create(x * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE).setVisible(false).refreshBody();
        group.create(x * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE).setVisible(false).refreshBody();
        group.create(x * TILE_SIZE + TILE_SIZE / 2, (ty - 1) * TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE).setVisible(false).refreshBody();
      }
      for (let y = 2; y < ty - 1; y++) {
        group.create(TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE).setVisible(false).refreshBody();
        group.create((tx - 1) * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE).setVisible(false).refreshBody();
      }

      group.create(TILE_SIZE * 3 + TILE_SIZE / 2, TILE_SIZE * 3 + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE + 8).setVisible(false).refreshBody();
      group.create((tx - 4) * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE * 3 + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE + 8).setVisible(false).refreshBody();
      group.create(TILE_SIZE * 3 + TILE_SIZE / 2, (ty - 4) * TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE + 8).setVisible(false).refreshBody();
      group.create((tx - 4) * TILE_SIZE + TILE_SIZE / 2, (ty - 4) * TILE_SIZE + TILE_SIZE / 2, "__DEFAULT").setSize(TILE_SIZE, TILE_SIZE + 8).setVisible(false).refreshBody();
    }

    function drawPlayerGraphics(scene: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite) {
      const gfx = scene.add.graphics();
      gfx.setDepth(10);

      gfx.fillStyle(0x2d1b4e, 1);
      gfx.fillRect(-12, -12, 24, 28);
      gfx.fillStyle(0x1a1030, 1);
      gfx.fillRect(-10, -10, 20, 24);
      
      gfx.fillStyle(0xe8d4b8, 1);
      gfx.fillCircle(0, -6, 6);
      
      gfx.fillStyle(0x2d1b4e, 1);
      gfx.fillRect(-10, 0, 20, 14);
      
      gfx.generateTexture("player_tex", 32, 32);
      gfx.destroy();

      player.setTexture("player_tex");

      scene.anims.create({
        key: "player_idle",
        frames: [{ key: "player_tex", frame: 0 }],
        frameRate: 1,
        repeat: -1,
      });
      player.play("player_idle");
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
