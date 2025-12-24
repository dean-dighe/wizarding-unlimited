import OpenAI from "openai";
import { db } from "../../db";
import { character_portraits, CharacterPortrait, PortraitExpression, BackgroundStatus } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { assetStorage } from "./storage";
import { createHash } from "crypto";

const xai = new OpenAI({
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY,
});

const VN_PORTRAIT_STYLE = `Visual novel character portrait style:
- Anime/manga influenced semi-realistic illustration
- Three-quarter view bust portrait (head to mid-chest visible)
- Clean lines with soft shading and highlights
- Expressive eyes and facial features
- Harry Potter magical world aesthetic (1990s British wizarding)
- Hogwarts uniform or appropriate magical attire
- Transparent or simple gradient background (easily composited)
- Portrait orientation, centered character
- High quality, detailed rendering`;

const EXPRESSION_PROMPTS: Record<PortraitExpression, string> = {
  neutral: "calm neutral expression, relaxed posture, attentive gaze",
  happy: "warm genuine smile, bright eyes, cheerful demeanor",
  sad: "downcast eyes, slight frown, melancholic expression",
  angry: "furrowed brow, intense glare, clenched jaw",
  surprised: "wide eyes, raised eyebrows, open mouth, shocked expression",
  worried: "concerned frown, furrowed brow, anxious eyes",
  determined: "resolute expression, focused eyes, set jaw, confident stance",
  mysterious: "enigmatic half-smile, knowing eyes, subtle expression",
  scared: "fearful wide eyes, tense posture, pale complexion",
};

const CANON_CHARACTERS: Record<string, { description: string; traits: string[] }> = {
  "Harry Potter": {
    description: "Young wizard with messy jet-black hair, round glasses, green eyes, lightning bolt scar on forehead, thin build",
    traits: ["glasses", "scar", "messy black hair", "green eyes"]
  },
  "Hermione Granger": {
    description: "Young witch with bushy brown hair, brown eyes, intelligent expression, slightly prominent front teeth",
    traits: ["bushy brown hair", "studious look", "brown eyes"]
  },
  "Ron Weasley": {
    description: "Tall young wizard with bright red hair, freckles, blue eyes, long nose, lanky build",
    traits: ["red hair", "freckles", "tall", "lanky"]
  },
  "Draco Malfoy": {
    description: "Young wizard with sleek platinum blonde hair, pale pointed face, grey eyes, aristocratic bearing",
    traits: ["blonde hair", "pale", "pointed features", "grey eyes"]
  },
  "Albus Dumbledore": {
    description: "Elderly wizard with long silver beard and hair, half-moon spectacles, twinkling blue eyes, tall and thin",
    traits: ["long silver beard", "half-moon glasses", "tall", "wise"]
  },
  "Severus Snape": {
    description: "Middle-aged wizard with greasy black hair, hooked nose, sallow skin, cold black eyes, billowing black robes",
    traits: ["black hair", "hooked nose", "pale", "stern"]
  },
  "Hagrid": {
    description: "Giant man with wild tangled black hair and beard, beetle-black eyes, kind expression, massive build",
    traits: ["giant", "wild hair and beard", "kind eyes", "massive"]
  },
  "McGonagall": {
    description: "Stern elderly witch with black hair in tight bun, square glasses, emerald green robes, sharp features",
    traits: ["tight bun", "square glasses", "stern", "green robes"]
  },
};

export class CharacterPortraitService {
  async getOrGeneratePortrait(
    characterName: string,
    expression: PortraitExpression = "neutral",
    characterDescription?: string
  ): Promise<CharacterPortrait | null> {
    const existing = await db.select()
      .from(character_portraits)
      .where(
        and(
          eq(character_portraits.characterName, characterName),
          eq(character_portraits.expression, expression)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const portrait = existing[0];
      if (portrait.generationStatus === "ready" && portrait.imageUrl) {
        return portrait;
      }
      if (portrait.generationStatus === "generating") {
        return portrait;
      }
      if (portrait.generationStatus === "failed") {
        return this.regeneratePortrait(portrait, characterDescription);
      }
    }

    return this.createAndGeneratePortrait(characterName, expression, characterDescription);
  }

  private async createAndGeneratePortrait(
    characterName: string,
    expression: PortraitExpression,
    characterDescription?: string
  ): Promise<CharacterPortrait> {
    const isCanon = characterName in CANON_CHARACTERS;
    const description = characterDescription || 
      (isCanon ? CANON_CHARACTERS[characterName].description : `A Hogwarts student named ${characterName}`);
    
    const signature = this.generateSignature(characterName, description);

    const [newPortrait] = await db.insert(character_portraits)
      .values({
        characterName,
        expression,
        isCanon,
        characterDescription: description,
        appearanceSignature: signature,
        generationStatus: "generating",
      })
      .returning();

    this.generatePortraitAsync(newPortrait.id, characterName, expression, description);
    return newPortrait;
  }

  private async regeneratePortrait(portrait: CharacterPortrait, newDescription?: string): Promise<CharacterPortrait> {
    await db.update(character_portraits)
      .set({ generationStatus: "generating", generationError: null, updatedAt: new Date() })
      .where(eq(character_portraits.id, portrait.id));

    const description = newDescription || portrait.characterDescription || `A Hogwarts student named ${portrait.characterName}`;
    this.generatePortraitAsync(portrait.id, portrait.characterName, portrait.expression as PortraitExpression, description);
    return { ...portrait, generationStatus: "generating" };
  }

  private async generatePortraitAsync(
    portraitId: number,
    characterName: string,
    expression: PortraitExpression,
    characterDescription: string
  ): Promise<void> {
    try {
      const prompt = this.buildPrompt(characterName, expression, characterDescription);
      
      const response = await xai.images.generate({
        model: "grok-2-image-1212",
        prompt: prompt.slice(0, 1000),
        n: 1,
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error("No image URL returned from xAI");
      }

      const imageBuffer = await this.downloadImage(imageUrl);
      const storedUrl = await assetStorage.uploadPortrait(imageBuffer, characterName, expression);

      await db.update(character_portraits)
        .set({
          imageUrl: storedUrl,
          generationStatus: "ready",
          updatedAt: new Date(),
        })
        .where(eq(character_portraits.id, portraitId));

      console.log(`[Portraits] Generated portrait for: ${characterName} (${expression})`);
    } catch (error) {
      console.error(`[Portraits] Failed to generate ${characterName} (${expression}):`, error);
      await db.update(character_portraits)
        .set({
          generationStatus: "failed",
          generationError: error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        })
        .where(eq(character_portraits.id, portraitId));
    }
  }

  private buildPrompt(characterName: string, expression: PortraitExpression, characterDescription: string): string {
    const expressionDesc = EXPRESSION_PROMPTS[expression];
    const canonInfo = CANON_CHARACTERS[characterName];

    if (canonInfo) {
      return `${VN_PORTRAIT_STYLE}

CHARACTER: ${characterName} from Harry Potter
APPEARANCE: ${canonInfo.description}
KEY FEATURES: ${canonInfo.traits.join(", ")}
EXPRESSION: ${expressionDesc}

Create a visual novel style portrait of this iconic character. Make them instantly recognizable while fitting the VN art style. Young teenage version (13 years old for student characters).`;
    }

    return `${VN_PORTRAIT_STYLE}

CHARACTER: ${characterName}
APPEARANCE: ${characterDescription}
EXPRESSION: ${expressionDesc}

Create a visual novel style portrait of this Harry Potter universe character. 
Make them look like they belong in the magical world - wearing appropriate wizarding attire.
Young student appearance if description suggests Hogwarts student.`;
  }

  private generateSignature(name: string, description: string): string {
    const normalized = `${name.toLowerCase()}:${description.toLowerCase().replace(/\s+/g, " ").trim()}`;
    return createHash("md5").update(normalized).digest("hex").slice(0, 16);
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getPortraitStatus(characterName: string, expression: PortraitExpression = "neutral"): Promise<{ 
    status: BackgroundStatus; 
    imageUrl?: string 
  }> {
    const portrait = await db.select()
      .from(character_portraits)
      .where(
        and(
          eq(character_portraits.characterName, characterName),
          eq(character_portraits.expression, expression)
        )
      )
      .limit(1);

    if (portrait.length === 0) {
      return { status: "pending" };
    }

    return {
      status: portrait[0].generationStatus as BackgroundStatus,
      imageUrl: portrait[0].imageUrl || undefined,
    };
  }

  async getAllExpressionsForCharacter(characterName: string): Promise<CharacterPortrait[]> {
    return db.select()
      .from(character_portraits)
      .where(eq(character_portraits.characterName, characterName));
  }
}

export const characterPortraitService = new CharacterPortraitService();
