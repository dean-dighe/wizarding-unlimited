import OpenAI from "openai";
import { storage } from "../../storage";
import { GameAssetStorageService } from "./storage";

const ollama = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || "",
  baseURL: "https://api.x.ai/v1",
});

const MAP_CODE_SYSTEM_PROMPT = `You are a Phaser.js map code generator for a Harry Potter game. Generate ONLY executable JavaScript/TypeScript code that creates a game scene for the given Hogwarts location.

The code must:
1. Export a function called 'createMapScene' that returns a Phaser Scene class
2. Use a tilemap approach with preloaded tilesets
3. Define spawn points for characters (entrance, exit, npc1, npc2, etc.)
4. Include collision boundaries
5. Have a top-down 2D RPG perspective like Pokemon or old Harry Potter GBC games
6. Use 32x32 tile size
7. Canvas size should be 640x480 pixels

CRITICAL: Return ONLY the JavaScript code, no explanations, no markdown code blocks.

Example structure:
export function createMapScene(tilesetUrl: string) {
  return class LocationScene extends Phaser.Scene {
    constructor() {
      super({ key: 'LocationName' });
    }
    
    preload() {
      this.load.image('tiles', tilesetUrl);
    }
    
    create() {
      // Create tilemap and layers
      // Define spawn points
      // Set up collisions
    }
  };
}`;

const TILESET_STYLE_PROMPT = `16-bit pixel art tileset, top-down RPG style, Nintendo Game Boy Color/Advance aesthetic,
32x32 pixel tiles arranged in a grid, seamless tiles,
Harry Potter Hogwarts castle interior/exterior theme,
stone walls, wooden floors, magical elements, torches, candles, 
limited color palette, dark outlines, no anti-aliasing,
tileset sheet format with multiple tile variants`;

export class MapGenerationService {
  private assetStorage: GameAssetStorageService;

  constructor() {
    this.assetStorage = new GameAssetStorageService();
  }

  async getOrCreateMap(locationName: string): Promise<{ mapCode: string; tilesetUrl: string | null }> {
    const existingMap = await storage.getLocationMap(locationName);
    if (existingMap) {
      return {
        mapCode: existingMap.mapCode,
        tilesetUrl: existingMap.tilesetUrl,
      };
    }

    return this.generateAndStoreMap(locationName);
  }

  async generateAndStoreMap(locationName: string): Promise<{ mapCode: string; tilesetUrl: string | null }> {
    const [mapCode, tilesetUrl] = await Promise.all([
      this.generateMapCode(locationName),
      this.generateTileset(locationName),
    ]);

    await storage.createLocationMap({
      locationName,
      mapCode,
      tilesetUrl,
      mapWidth: 640,
      mapHeight: 480,
      spawnPoints: this.extractSpawnPoints(mapCode),
      walkableTiles: [],
    });

    return { mapCode, tilesetUrl };
  }

  private async generateMapCode(locationName: string): Promise<string> {
    const locationDetails = this.getLocationDetails(locationName);
    
    const userPrompt = `Generate Phaser.js map code for this Hogwarts location:

Location: ${locationName}
Description: ${locationDetails.description}
Features: ${locationDetails.features.join(", ")}
Size: ${locationDetails.size}
Lighting: ${locationDetails.lighting}

Include spawn points for: entrance, exit, and at least 2 NPC positions.
Make the map visually interesting with varied tiles and obstacles.`;

    try {
      const response = await ollama.chat.completions.create({
        model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
        messages: [
          { role: "system", content: MAP_CODE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2000,
      });

      const code = response.choices[0]?.message?.content?.trim() || "";
      return this.cleanMapCode(code);
    } catch (error) {
      console.error("Error generating map code:", error);
      return this.getDefaultMapCode(locationName);
    }
  }

  private async generateTileset(locationName: string): Promise<string | null> {
    const locationDetails = this.getLocationDetails(locationName);
    
    const prompt = `${TILESET_STYLE_PROMPT}

Location: ${locationName} in Hogwarts castle
Style: ${locationDetails.style}
Elements: ${locationDetails.features.join(", ")}
Atmosphere: ${locationDetails.lighting}

Create a tileset with floor tiles, wall tiles, furniture, decorative elements, and magical items.`;

    try {
      const response = await xai.images.generate({
        model: "grok-2-image-1212",
        prompt: prompt.slice(0, 1000),
        n: 1,
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        return null;
      }

      const imageBuffer = await this.downloadImage(imageUrl);
      return await this.assetStorage.uploadTileset(imageBuffer, locationName);
    } catch (error) {
      console.error("Error generating tileset:", error);
      return null;
    }
  }

  private getLocationDetails(locationName: string): {
    description: string;
    features: string[];
    size: string;
    lighting: string;
    style: string;
  } {
    const locations: Record<string, { description: string; features: string[]; size: string; lighting: string; style: string }> = {
      "Great Hall": {
        description: "The massive dining hall of Hogwarts with four long house tables and the staff table at the raised end",
        features: ["long wooden tables", "floating candles", "enchanted ceiling", "house banners", "stone columns"],
        size: "very large",
        lighting: "warm candlelight with magical sky ceiling",
        style: "grand medieval dining hall with magical elements",
      },
      "Platform 9¾": {
        description: "The hidden magical train platform accessed through a brick barrier at King's Cross Station",
        features: ["Hogwarts Express train", "platform signs", "luggage carts", "owl cages", "steam"],
        size: "large",
        lighting: "misty daylight with steam",
        style: "Victorian railway platform with magical elements",
      },
      "Potions Classroom": {
        description: "A dungeon classroom filled with cauldrons, ingredient jars, and mysterious vapors",
        features: ["cauldrons", "potion ingredients", "stone walls", "dim torches", "Snape's desk"],
        size: "medium",
        lighting: "dim green-tinted torchlight",
        style: "dark dungeon laboratory",
      },
      "Gryffindor Common Room": {
        description: "A cozy circular room with a roaring fireplace, squashy armchairs, and crimson decorations",
        features: ["fireplace", "armchairs", "portrait hole", "study tables", "bulletin board"],
        size: "medium",
        lighting: "warm firelight",
        style: "cozy medieval tower room in red and gold",
      },
      "Library": {
        description: "Rows upon rows of tall bookshelves containing thousands of magical texts",
        features: ["tall bookshelves", "study tables", "restricted section", "Madam Pince's desk", "candles"],
        size: "large",
        lighting: "soft candlelight",
        style: "vast medieval library",
      },
    };

    return locations[locationName] || {
      description: `A location within Hogwarts castle called ${locationName}`,
      features: ["stone walls", "torches", "magical elements", "medieval furniture"],
      size: "medium",
      lighting: "torchlight",
      style: "medieval castle interior",
    };
  }

  private cleanMapCode(code: string): string {
    let cleaned = code
      .replace(/```typescript/g, "")
      .replace(/```javascript/g, "")
      .replace(/```ts/g, "")
      .replace(/```js/g, "")
      .replace(/```/g, "")
      .trim();

    if (!cleaned.includes("createMapScene")) {
      cleaned = this.getDefaultMapCode("Unknown");
    }

    return cleaned;
  }

  private getDefaultMapCode(locationName: string): string {
    return `export function createMapScene(tilesetUrl) {
  return class ${locationName.replace(/\s+/g, "")}Scene extends Phaser.Scene {
    constructor() {
      super({ key: '${locationName}' });
      this.spawnPoints = {
        entrance: { x: 320, y: 420 },
        exit: { x: 320, y: 60 },
        npc1: { x: 160, y: 240 },
        npc2: { x: 480, y: 240 },
      };
    }
    
    preload() {
      if (tilesetUrl) {
        this.load.image('tiles', tilesetUrl);
      }
    }
    
    create() {
      this.cameras.main.setBackgroundColor('#2d2d2d');
      
      const graphics = this.add.graphics();
      
      graphics.fillStyle(0x4a4a4a, 1);
      for (let x = 0; x < 20; x++) {
        for (let y = 0; y < 15; y++) {
          if (x === 0 || x === 19 || y === 0 || y === 14) {
            graphics.fillRect(x * 32, y * 32, 32, 32);
          }
        }
      }
      
      graphics.fillStyle(0x8b7355, 1);
      for (let x = 1; x < 19; x++) {
        for (let y = 1; y < 14; y++) {
          graphics.fillRect(x * 32, y * 32, 32, 32);
        }
      }
    }
    
    getSpawnPoint(name) {
      return this.spawnPoints[name] || this.spawnPoints.entrance;
    }
  };
}`;
  }

  private extractSpawnPoints(mapCode: string): Record<string, { x: number; y: number }> {
    const defaultPoints = {
      entrance: { x: 320, y: 420 },
      exit: { x: 320, y: 60 },
      npc1: { x: 160, y: 240 },
      npc2: { x: 480, y: 240 },
    };

    try {
      const spawnMatch = mapCode.match(/spawnPoints\s*[=:]\s*(\{[\s\S]*?\})\s*[;,\n]/);
      if (spawnMatch) {
        const parsed = JSON.parse(spawnMatch[1].replace(/'/g, '"'));
        return { ...defaultPoints, ...parsed };
      }
    } catch {
    }

    return defaultPoints;
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
