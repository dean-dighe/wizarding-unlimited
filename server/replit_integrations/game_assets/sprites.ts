import OpenAI from "openai";
import { storage } from "../../storage";
import { GameAssetStorageService } from "./storage";
import { DEFAULT_ANIMATION_CONFIG } from "@shared/schema";

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || "",
  baseURL: "https://api.x.ai/v1",
});

const SPRITE_STYLE_PROMPT = `16-bit pixel art sprite sheet, top-down RPG style, Nintendo Game Boy Advance/Pokemon aesthetic, 
32x32 pixel character, 4 rows of 3 frames each (12 total frames), 
walking animations: row 1 = walk down (3 frames), row 2 = walk up (3 frames), 
row 3 = walk left (3 frames), row 4 = walk right (3 frames), 
clean pixel edges, limited color palette, dark outlines, no anti-aliasing, 
transparent background or solid color background for easy removal`;

export class SpriteGenerationService {
  private assetStorage: GameAssetStorageService;

  constructor() {
    this.assetStorage = new GameAssetStorageService();
  }

  async getOrCreateSprite(
    characterName: string,
    characterDescription: string,
    options: { isProtagonist?: boolean; isCanon?: boolean } = {}
  ): Promise<string> {
    const existingSprite = await storage.getCharacterSprite(characterName);
    if (existingSprite) {
      return existingSprite.spriteSheetUrl;
    }

    return this.generateAndStoreSprite(characterName, characterDescription, options);
  }

  async generateAndStoreSprite(
    characterName: string,
    characterDescription: string,
    options: { isProtagonist?: boolean; isCanon?: boolean } = {}
  ): Promise<string> {
    const spriteImageUrl = await this.generateSpriteSheet(characterName, characterDescription);
    
    const imageBuffer = await this.downloadImage(spriteImageUrl);
    const storedUrl = await this.assetStorage.uploadSprite(imageBuffer, characterName);
    
    await storage.createCharacterSprite({
      characterName,
      isProtagonist: options.isProtagonist ?? false,
      isCanon: options.isCanon ?? false,
      spriteSheetUrl: storedUrl,
      characterDescription,
      spriteWidth: 32,
      spriteHeight: 32,
      frameCount: 12,
      animationConfig: DEFAULT_ANIMATION_CONFIG,
    });
    
    return storedUrl;
  }

  private async generateSpriteSheet(characterName: string, description: string): Promise<string> {
    const prompt = this.buildSpritePrompt(characterName, description);
    
    try {
      const response = await xai.images.generate({
        model: "grok-2-image-1212",
        prompt: prompt.slice(0, 1000),
        n: 1,
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error("No image URL returned from xAI");
      }

      return imageUrl;
    } catch (error) {
      console.error("Error generating sprite:", error);
      throw new Error(`Failed to generate sprite for ${characterName}`);
    }
  }

  private buildSpritePrompt(characterName: string, description: string): string {
    const cleanDescription = description.slice(0, 300);
    
    return `${SPRITE_STYLE_PROMPT}

Character: ${characterName}
Description: ${cleanDescription}

Hogwarts student in robes, wand at side, young wizard/witch character, 
magical school uniform, fantasy RPG character sprite sheet format`;
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async generateCanonCharacterSprites(): Promise<void> {
    const canonCharacters = [
      { name: "Harry Potter", description: "A thin boy with unruly black hair, round glasses, green eyes, and a lightning bolt scar on his forehead. Wears Gryffindor robes." },
      { name: "Hermione Granger", description: "A girl with bushy brown hair, brown eyes, and slightly large front teeth. Wears Gryffindor robes, often carrying books." },
      { name: "Ron Weasley", description: "A tall, thin boy with bright red hair, freckles, blue eyes, and a long nose. Wears Gryffindor robes." },
      { name: "Draco Malfoy", description: "A pale boy with sleek platinum blonde hair, pointed face, grey eyes, and a sneering expression. Wears Slytherin robes." },
      { name: "Professor McGonagall", description: "A tall, stern-looking older woman with grey hair in a tight bun, square spectacles, emerald robes." },
      { name: "Professor Snape", description: "A thin man with sallow skin, long greasy black hair, hooked nose, dark eyes, and billowing black robes." },
      { name: "Hagrid", description: "A giant of a man with wild black bushy hair and beard, beetle-black eyes, wearing a massive moleskin overcoat." },
      { name: "Dumbledore", description: "An elderly wizard with long silver hair and beard, half-moon spectacles, crooked nose, wearing magnificent purple robes." },
    ];

    for (const character of canonCharacters) {
      const existing = await storage.getCharacterSprite(character.name);
      if (!existing) {
        try {
          await this.generateAndStoreSprite(character.name, character.description, { isCanon: true });
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`Failed to generate sprite for ${character.name}:`, error);
        }
      }
    }
  }
}
