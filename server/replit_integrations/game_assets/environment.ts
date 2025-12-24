import OpenAI from "openai";
import { storage } from "../../storage";
import { GameAssetStorageService } from "./storage";
import type { EnvironmentSprite, PlacedObject } from "@shared/schema";

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || "",
  baseURL: "https://api.x.ai/v1",
});

const ENV_SPRITE_STYLE_PROMPT = `Pokemon FireRed/LeafGreen style sprite for a top-down 2D RPG game.
EXACT FORMAT: Single 32x32 pixel sprite.
Total image size: 32 pixels wide x 32 pixels tall.

STYLE REQUIREMENTS:
- Game Boy Advance pixel art aesthetic
- Bold 1-pixel black outlines
- 8-16 color palette maximum
- NO anti-aliasing, NO gradients, NO realistic shading
- Top-down RPG perspective
- Clean transparent background (or solid color if needed)`;

export interface EnvironmentAssetDefinition {
  assetId: string;
  category: "nature" | "furniture" | "magical" | "tools" | "effects";
  description: string;
  isAnimated?: boolean;
  frameCount?: number;
  isWalkable?: boolean;
}

export const ENVIRONMENT_ASSETS: EnvironmentAssetDefinition[] = [
  { assetId: "rock_small", category: "nature", description: "Small gray stone/boulder" },
  { assetId: "rock_large", category: "nature", description: "Large gray boulder" },
  { assetId: "tree_oak", category: "nature", description: "Oak tree with green foliage" },
  { assetId: "tree_pine", category: "nature", description: "Pine/evergreen tree" },
  { assetId: "bush_green", category: "nature", description: "Green leafy bush" },
  { assetId: "flower_red", category: "nature", description: "Red flowers/poppies", isWalkable: true },
  { assetId: "grass_tall", category: "nature", description: "Tall grass patch", isWalkable: true },
  { assetId: "water_puddle", category: "nature", description: "Small water puddle" },
  { assetId: "mushroom", category: "nature", description: "Fantasy mushroom" },
  
  { assetId: "torch_wall", category: "furniture", description: "Wall-mounted torch with flame" },
  { assetId: "cauldron", category: "furniture", description: "Black iron cauldron" },
  { assetId: "table_wood", category: "furniture", description: "Wooden table" },
  { assetId: "chair_wood", category: "furniture", description: "Wooden chair" },
  { assetId: "bookshelf", category: "furniture", description: "Tall wooden bookshelf with books" },
  { assetId: "chest_wooden", category: "furniture", description: "Wooden treasure chest" },
  { assetId: "barrel", category: "furniture", description: "Wooden barrel" },
  { assetId: "candle", category: "furniture", description: "Lit candle on holder" },
  { assetId: "bed", category: "furniture", description: "Four-poster bed with curtains" },
  { assetId: "fireplace", category: "furniture", description: "Stone fireplace with fire" },
  
  { assetId: "wand", category: "magical", description: "Magical wand, brown wood with star tip" },
  { assetId: "crystal_ball", category: "magical", description: "Glowing crystal ball on stand" },
  { assetId: "potion_red", category: "magical", description: "Red potion in glass bottle" },
  { assetId: "potion_blue", category: "magical", description: "Blue potion in glass bottle" },
  { assetId: "potion_green", category: "magical", description: "Green potion in glass bottle" },
  { assetId: "spellbook", category: "magical", description: "Open magical spellbook with glowing pages" },
  { assetId: "owl_perched", category: "magical", description: "Brown owl perched" },
  { assetId: "broomstick", category: "magical", description: "Flying broomstick" },
  { assetId: "floating_candle", category: "magical", description: "Floating lit candle" },
  { assetId: "magic_portal", category: "magical", description: "Swirling purple magic portal" },
  
  { assetId: "axe", category: "tools", description: "Woodcutter axe" },
  { assetId: "pickaxe", category: "tools", description: "Mining pickaxe" },
  { assetId: "hammer", category: "tools", description: "Blacksmith hammer" },
  { assetId: "shovel", category: "tools", description: "Garden shovel" },
  { assetId: "bucket", category: "tools", description: "Wooden bucket" },
  { assetId: "lantern", category: "tools", description: "Oil lantern, lit" },
  { assetId: "rope_coil", category: "tools", description: "Coiled rope" },
  { assetId: "key_golden", category: "tools", description: "Golden ornate key" },
  
  { assetId: "fire_small", category: "effects", description: "Small campfire flames", isAnimated: true, frameCount: 4 },
  { assetId: "sparkles", category: "effects", description: "Magical sparkles/stars", isAnimated: true, frameCount: 4, isWalkable: true },
  { assetId: "smoke_puff", category: "effects", description: "Puff of gray smoke", isWalkable: true },
  { assetId: "steam", category: "effects", description: "Rising steam", isWalkable: true },
];

export class EnvironmentAssetService {
  private assetStorage: GameAssetStorageService;

  constructor() {
    this.assetStorage = new GameAssetStorageService();
  }

  async getOrCreateAsset(assetDef: EnvironmentAssetDefinition): Promise<EnvironmentSprite | null> {
    const existing = await storage.getEnvironmentSprite(assetDef.assetId);
    if (existing) {
      return existing;
    }

    return this.generateAsset(assetDef);
  }

  async generateAsset(assetDef: EnvironmentAssetDefinition): Promise<EnvironmentSprite | null> {
    const prompt = `${ENV_SPRITE_STYLE_PROMPT}

OBJECT: ${assetDef.description}
CATEGORY: ${assetDef.category}

Create a single 32x32 pixel sprite of this object in Pokemon FireRed/LeafGreen style.
The sprite should be instantly recognizable as "${assetDef.description}".`;

    try {
      const response = await xai.images.generate({
        model: "grok-2-image-1212",
        prompt: prompt.slice(0, 1000),
        n: 1,
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        console.warn(`No image URL returned for asset: ${assetDef.assetId}`);
        return null;
      }

      const imageBuffer = await this.downloadImage(imageUrl);
      const spriteUrl = await this.assetStorage.uploadEnvironmentSprite(imageBuffer, assetDef.assetId);
      
      if (!spriteUrl) {
        console.error(`Failed to upload sprite for: ${assetDef.assetId}`);
        return null;
      }

      const sprite = await storage.createEnvironmentSprite({
        assetId: assetDef.assetId,
        category: assetDef.category,
        spriteUrl,
        spriteWidth: 32,
        spriteHeight: 32,
        isAnimated: assetDef.isAnimated || false,
        frameCount: assetDef.frameCount || 1,
        animationFrameRate: 8,
        isWalkable: assetDef.isWalkable || false,
        description: assetDef.description,
      });

      console.log(`Generated environment sprite: ${assetDef.assetId}`);
      return sprite;
    } catch (error) {
      console.error(`Error generating environment sprite ${assetDef.assetId}:`, error);
      return null;
    }
  }

  async generateAllAssets(): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const assetDef of ENVIRONMENT_ASSETS) {
      const existing = await storage.getEnvironmentSprite(assetDef.assetId);
      if (existing) {
        success.push(assetDef.assetId);
        continue;
      }

      const result = await this.generateAsset(assetDef);
      if (result) {
        success.push(assetDef.assetId);
      } else {
        failed.push(assetDef.assetId);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return { success, failed };
  }

  async getAllAssets(): Promise<EnvironmentSprite[]> {
    return storage.getAllEnvironmentSprites();
  }

  getAssetDefinitions(): EnvironmentAssetDefinition[] {
    return ENVIRONMENT_ASSETS;
  }

  selectAssetsForLocation(locationName: string): string[] {
    const locationAssets = LOCATION_ASSET_MAPPINGS[locationName];
    if (locationAssets) {
      return locationAssets;
    }

    return ["rock_small", "torch_wall", "candle"];
  }

  generateRandomPlacements(
    assetIds: string[],
    mapWidth: number,
    mapHeight: number,
    density: number = 0.1
  ): PlacedObject[] {
    const objects: PlacedObject[] = [];
    const tileSize = 32;
    const tilesX = Math.floor(mapWidth / tileSize);
    const tilesY = Math.floor(mapHeight / tileSize);
    const targetCount = Math.floor(tilesX * tilesY * density);

    const occupiedPositions = new Set<string>();

    for (let i = 0; i < targetCount && assetIds.length > 0; i++) {
      let x: number, y: number;
      let attempts = 0;

      do {
        x = (Math.floor(Math.random() * (tilesX - 2)) + 1) * tileSize + tileSize / 2;
        y = (Math.floor(Math.random() * (tilesY - 2)) + 1) * tileSize + tileSize / 2;
        attempts++;
      } while (occupiedPositions.has(`${x},${y}`) && attempts < 20);

      if (attempts >= 20) continue;

      occupiedPositions.add(`${x},${y}`);

      const assetId = assetIds[Math.floor(Math.random() * assetIds.length)];
      objects.push({
        assetId,
        x,
        y,
        scale: 1,
        flipX: Math.random() > 0.5,
      });
    }

    return objects;
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

const LOCATION_ASSET_MAPPINGS: Record<string, string[]> = {
  "Great Hall": ["floating_candle", "table_wood", "chair_wood", "candle"],
  "Platform 9¾": ["barrel", "chest_wooden", "lantern", "owl_perched"],
  "Potions Classroom": ["cauldron", "potion_red", "potion_blue", "potion_green", "smoke_puff"],
  "Gryffindor Common Room": ["fireplace", "chair_wood", "bookshelf", "candle"],
  "Slytherin Common Room": ["torch_wall", "chair_wood", "candle", "potion_green"],
  "Ravenclaw Common Room": ["bookshelf", "crystal_ball", "candle", "spellbook"],
  "Hufflepuff Common Room": ["barrel", "flower_red", "candle", "bush_green"],
  "Library": ["bookshelf", "candle", "spellbook", "chair_wood"],
  "Restricted Section": ["spellbook", "torch_wall", "candle", "smoke_puff"],
  "Hogwarts Grounds": ["tree_oak", "bush_green", "rock_small", "flower_red", "grass_tall"],
  "Forbidden Forest": ["tree_pine", "tree_oak", "mushroom", "rock_large", "bush_green"],
  "Hagrid's Hut": ["barrel", "bucket", "axe", "rock_small", "bush_green"],
  "Quidditch Pitch": ["broomstick", "grass_tall", "rock_small"],
  "Greenhouse": ["flower_red", "bush_green", "mushroom", "bucket", "shovel"],
  "Astronomy Tower": ["crystal_ball", "candle", "spellbook", "sparkles"],
  "Owlery": ["owl_perched", "lantern", "bucket"],
  "Hospital Wing": ["candle", "potion_red", "potion_blue", "bed"],
  "Headmaster's Office": ["crystal_ball", "spellbook", "owl_perched", "candle", "magic_portal"],
  "Dungeons": ["torch_wall", "barrel", "rock_small", "cauldron"],
  "Room of Requirement": ["chest_wooden", "magic_portal", "sparkles", "spellbook"],
  "Chamber of Secrets": ["torch_wall", "rock_large", "water_puddle", "smoke_puff"],
  "Kitchen": ["barrel", "bucket", "fire_small", "table_wood"],
  "Hogsmeade Village": ["lantern", "barrel", "bush_green", "rock_small"],
  "Three Broomsticks": ["table_wood", "chair_wood", "barrel", "candle", "fireplace"],
  "Honeydukes": ["barrel", "chest_wooden", "candle"],
  "Diagon Alley": ["lantern", "barrel", "chest_wooden", "owl_perched"],
  "Gringotts Bank": ["key_golden", "chest_wooden", "torch_wall", "lantern"],
  "Ollivanders": ["wand", "chest_wooden", "bookshelf", "candle"],
  "The Burrow": ["barrel", "bucket", "chair_wood", "fireplace"],
  "Hogwarts Express": ["lantern", "chest_wooden", "owl_perched"],
  "Courtyard": ["bush_green", "flower_red", "rock_small", "tree_oak"],
};

export const environmentAssetService = new EnvironmentAssetService();
