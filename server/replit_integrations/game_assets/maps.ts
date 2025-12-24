import OpenAI from "openai";
import { storage } from "../../storage";
import { GameAssetStorageService } from "./storage";
import type { TilemapData, TilemapLayer, MapGenerationStatus } from "@shared/schema";

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || "",
  baseURL: "https://api.x.ai/v1",
});

const TILESET_STYLE_PROMPT = `16-bit pixel art tileset, top-down RPG style, Nintendo Game Boy Color/Advance aesthetic,
32x32 pixel tiles arranged in a 4x4 grid (16 tiles total),
Harry Potter Hogwarts castle interior theme,
Row 1: floor tiles (4 variations of stone/wood floor),
Row 2: wall tiles (4 variations of stone walls),
Row 3: decoration tiles (table, chair, torch, window),
Row 4: special tiles (door, stairs, rug, magic item),
limited color palette, dark outlines, no anti-aliasing,
seamless tiles, tileset sheet format`;

export interface MapResult {
  tilesetUrl: string | null;
  tilemapData: TilemapData | null;
  spawnPoints: Record<string, { x: number; y: number }>;
  generationStatus: MapGenerationStatus;
}

export class MapGenerationService {
  private assetStorage: GameAssetStorageService;

  constructor() {
    this.assetStorage = new GameAssetStorageService();
  }

  async getOrCreateMap(locationName: string, width: number = 640, height: number = 320): Promise<MapResult> {
    const existingMap = await storage.getLocationMap(locationName);
    
    if (existingMap) {
      await storage.updateLocationMap(locationName, {
        // @ts-ignore - lastAccessedAt will be set by default
      });
      
      if (existingMap.generationStatus === "ready" && existingMap.tilesetUrl && existingMap.tilemapData) {
        return {
          tilesetUrl: existingMap.tilesetUrl,
          tilemapData: existingMap.tilemapData as TilemapData,
          spawnPoints: existingMap.spawnPoints as Record<string, { x: number; y: number }>,
          generationStatus: "ready",
        };
      }
      
      if (existingMap.generationStatus === "generating") {
        return {
          tilesetUrl: null,
          tilemapData: null,
          spawnPoints: this.getDefaultSpawnPoints(width, height),
          generationStatus: "generating",
        };
      }
    }

    return this.generateAndStoreMap(locationName, width, height);
  }

  async generateAndStoreMap(locationName: string, width: number = 640, height: number = 320): Promise<MapResult> {
    const spawnPoints = this.getDefaultSpawnPoints(width, height);
    const tilesX = Math.ceil(width / 32);
    const tilesY = Math.ceil(height / 32);

    await storage.createLocationMap({
      locationName,
      mapCode: "",
      tilesetUrl: null,
      mapWidth: width,
      mapHeight: height,
      spawnPoints,
      walkableTiles: [],
      generationStatus: "generating",
    }).catch(() => {
      storage.updateLocationMap(locationName, {
        generationStatus: "generating",
      });
    });

    try {
      const tilesetUrl = await this.generateTileset(locationName);
      const tilemapData = this.generateProceduralTilemap(locationName, tilesX, tilesY);

      await storage.updateLocationMap(locationName, {
        tilesetUrl,
        tilemapData,
        generationStatus: "ready",
        walkableTiles: [0, 1, 2, 3],
      });

      return { tilesetUrl, tilemapData, spawnPoints, generationStatus: "ready" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Map generation failed:", errorMessage);
      
      await storage.updateLocationMap(locationName, {
        generationStatus: "failed",
        generationError: errorMessage,
      });

      const fallbackTilemap = this.generateProceduralTilemap(locationName, tilesX, tilesY);
      return { 
        tilesetUrl: null, 
        tilemapData: fallbackTilemap, 
        spawnPoints, 
        generationStatus: "failed" 
      };
    }
  }

  private generateProceduralTilemap(locationName: string, tilesX: number, tilesY: number): TilemapData {
    const locationConfig = this.getLocationDetails(locationName);
    
    const groundLayer: number[] = [];
    const decorLayer: number[] = [];
    
    for (let y = 0; y < tilesY; y++) {
      for (let x = 0; x < tilesX; x++) {
        const isWall = x === 0 || x === tilesX - 1 || y === 0 || y === tilesY - 1;
        
        if (isWall) {
          groundLayer.push(4 + (Math.random() > 0.5 ? 1 : 0));
        } else {
          groundLayer.push(Math.floor(Math.random() * 4));
        }
        
        if (!isWall && Math.random() < 0.1) {
          decorLayer.push(8 + Math.floor(Math.random() * 4));
        } else {
          decorLayer.push(-1);
        }
      }
    }

    return {
      width: tilesX,
      height: tilesY,
      tileWidth: 32,
      tileHeight: 32,
      tilesetName: locationName.toLowerCase().replace(/\s+/g, "_"),
      layers: [
        {
          name: "ground",
          data: groundLayer,
          width: tilesX,
          height: tilesY,
          visible: true,
          opacity: 1,
        },
        {
          name: "decoration",
          data: decorLayer,
          width: tilesX,
          height: tilesY,
          visible: true,
          opacity: 1,
        },
      ],
    };
  }

  private getDefaultSpawnPoints(width: number, height: number): Record<string, { x: number; y: number }> {
    return {
      entrance: { x: Math.floor(width / 2), y: height - 48 },
      exit: { x: Math.floor(width / 2), y: 48 },
      npc1: { x: Math.floor(width * 0.25), y: Math.floor(height / 2) },
      npc2: { x: Math.floor(width * 0.75), y: Math.floor(height / 2) },
      center: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
    };
  }

  private async generateTileset(locationName: string): Promise<string | null> {
    const locationDetails = this.getLocationDetails(locationName);
    
    const prompt = `${TILESET_STYLE_PROMPT}

Location: ${locationName} in Hogwarts castle
Style: ${locationDetails.style}
Color scheme: ${locationDetails.lighting}
Key elements: ${locationDetails.features.slice(0, 4).join(", ")}`;

    try {
      const response = await xai.images.generate({
        model: "grok-2-image-1212",
        prompt: prompt.slice(0, 1000),
        n: 1,
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        console.warn("No image URL returned from xAI");
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
        description: "The massive dining hall of Hogwarts",
        features: ["long tables", "floating candles", "enchanted ceiling", "house banners", "stone columns"],
        size: "very large",
        lighting: "warm golden candlelight",
        style: "grand medieval dining hall",
      },
      "Platform 9¾": {
        description: "The hidden magical train platform",
        features: ["Hogwarts Express", "platform signs", "luggage carts", "owl cages", "steam"],
        size: "large",
        lighting: "misty grey daylight",
        style: "Victorian railway platform",
      },
      "Potions Classroom": {
        description: "Dungeon classroom with cauldrons",
        features: ["cauldrons", "potion bottles", "stone walls", "torches", "ingredient shelves"],
        size: "medium",
        lighting: "dim green torchlight",
        style: "dark dungeon laboratory",
      },
      "Gryffindor Common Room": {
        description: "Cozy tower room with fireplace",
        features: ["fireplace", "armchairs", "portrait hole", "study tables", "red banners"],
        size: "medium",
        lighting: "warm orange firelight",
        style: "cozy medieval tower",
      },
      "Library": {
        description: "Vast room with tall bookshelves",
        features: ["bookshelves", "study tables", "candles", "reading lamps", "quiet alcoves"],
        size: "large",
        lighting: "soft candlelight",
        style: "vast medieval library",
      },
      "Hogwarts Grounds": {
        description: "Outdoor castle grounds",
        features: ["grass", "trees", "path", "castle walls", "lake view"],
        size: "very large",
        lighting: "bright daylight",
        style: "Scottish highland grounds",
      },
      "Hogsmeade": {
        description: "Wizarding village near Hogwarts",
        features: ["cobblestone", "shops", "snow", "lanterns", "villagers"],
        size: "large",
        lighting: "cozy afternoon light",
        style: "quaint magical village",
      },
    };

    return locations[locationName] || {
      description: `A location called ${locationName}`,
      features: ["stone walls", "torches", "magical elements", "medieval furniture"],
      size: "medium",
      lighting: "warm torchlight",
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
