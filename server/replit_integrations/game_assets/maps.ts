import OpenAI from "openai";
import { storage } from "../../storage";
import { GameAssetStorageService } from "./storage";

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || "",
  baseURL: "https://api.x.ai/v1",
});

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

  async getOrCreateMap(locationName: string): Promise<{ tilesetUrl: string | null; spawnPoints: Record<string, { x: number; y: number }> }> {
    const existingMap = await storage.getLocationMap(locationName);
    if (existingMap) {
      return {
        tilesetUrl: existingMap.tilesetUrl,
        spawnPoints: existingMap.spawnPoints as Record<string, { x: number; y: number }> || this.getDefaultSpawnPoints(),
      };
    }

    return this.generateAndStoreMap(locationName);
  }

  async generateAndStoreMap(locationName: string): Promise<{ tilesetUrl: string | null; spawnPoints: Record<string, { x: number; y: number }> }> {
    const [tilesetUrl] = await Promise.all([
      this.generateTileset(locationName),
    ]);

    const spawnPoints = this.getDefaultSpawnPoints();

    await storage.createLocationMap({
      locationName,
      mapCode: "",
      tilesetUrl,
      mapWidth: 640,
      mapHeight: 320,
      spawnPoints,
      walkableTiles: [],
    });

    return { tilesetUrl, spawnPoints };
  }

  private getDefaultSpawnPoints(): Record<string, { x: number; y: number }> {
    return {
      entrance: { x: 320, y: 280 },
      exit: { x: 320, y: 40 },
      npc1: { x: 160, y: 160 },
      npc2: { x: 480, y: 160 },
    };
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

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
