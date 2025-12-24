import OpenAI from "openai";
import { db } from "../../db";
import { background_scenes, BackgroundScene, BackgroundStatus } from "@shared/schema";
import { eq } from "drizzle-orm";
import { assetStorage } from "./storage";

const xai = new OpenAI({
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY,
});

const VN_BACKGROUND_STYLE = `Visual novel background illustration style:
- Rich, detailed fantasy environment painting
- Anime/manga influenced but semi-realistic
- Painterly style with soft lighting and atmospheric depth
- 16:9 aspect ratio, landscape orientation
- Harry Potter magical world aesthetic (1990s British wizarding)
- Warm candle/torch lighting for interiors, mystical atmosphere
- NO characters or people in the scene
- Focus on environmental storytelling and magical details`;

const LOCATION_PROMPTS: Record<string, { description: string; features: string[] }> = {
  "Great Hall": {
    description: "Hogwarts Great Hall dining room with enchanted ceiling showing sky, four long house tables, floating candles, high windows, stone walls with house banners",
    features: ["enchanted ceiling with clouds/stars", "floating golden candles", "long wooden tables with benches", "house banners on walls", "raised staff table at front"]
  },
  "Gryffindor Common Room": {
    description: "Cozy tower room with roaring fireplace, red and gold decor, squashy armchairs, portrait hole entrance, circular windows overlooking grounds",
    features: ["large stone fireplace with flames", "red velvet armchairs", "gold and scarlet tapestries", "bulletin board", "spiral staircase to dormitories"]
  },
  "Hogwarts Library": {
    description: "Vast library with towering bookshelves, restricted section behind rope, study tables with green-shaded lamps, magical books that whisper",
    features: ["endless tall bookshelves", "arched windows with reading nooks", "brass chandeliers", "Restricted Section warning signs", "floating books"]
  },
  "Potions Classroom": {
    description: "Underground dungeon classroom with cauldrons on desks, shelves of glass jars with strange ingredients, greenish torchlight, stone walls",
    features: ["bubbling cauldrons", "ingredient jars with preserved creatures", "blackboard with potion recipes", "stone pillars", "emerald-lit torches"]
  },
  "Forbidden Forest": {
    description: "Dark ancient forest at Hogwarts edge, gnarled trees with twisted branches, mysterious fog, glimpses of magical creatures hiding",
    features: ["massive ancient trees", "mysterious mist between trunks", "glowing fungi", "creature eyes in shadows", "overgrown path"]
  },
  "Hogsmeade Village": {
    description: "Charming wizarding village with snow-capped rooftops, shop windows glowing warmly, cobblestone streets, Three Broomsticks pub sign",
    features: ["quaint thatched shops", "Honeydukes colorful window", "Zonko's joke shop", "snowy cobblestones", "magical street lamps"]
  },
  "Hogwarts Express": {
    description: "Interior of Hogwarts Express train compartment, red velvet seats, brass luggage racks, window showing countryside rushing by",
    features: ["red cushioned benches", "brass fittings", "compartment door", "window with moving scenery", "overhead luggage racks"]
  },
  "Black Lake": {
    description: "Vast dark lake by Hogwarts castle, mysterious deep waters, castle reflection, mountains in distance, giant squid tentacle visible",
    features: ["dark still waters", "Hogwarts castle silhouette", "stone dock", "mountain backdrop", "hint of lake creatures"]
  },
  "Quidditch Pitch": {
    description: "Hogwarts Quidditch stadium with tall goal hoops, tiered wooden stands with house colors, grassy field, cloudy sky",
    features: ["three golden hoops each end", "colorful house stands", "green grass field", "equipment shed", "dramatic sky"]
  },
  "Hospital Wing": {
    description: "Hogwarts medical ward with rows of white beds, high arched windows, Madam Pomfrey's office, medicine cabinet",
    features: ["neat white hospital beds", "privacy screens", "tall windows with curtains", "potion bottles on shelves", "magical healing equipment"]
  },
};

export class BackgroundSceneService {
  async getOrGenerateBackground(locationName: string): Promise<BackgroundScene | null> {
    const existing = await db.select()
      .from(background_scenes)
      .where(eq(background_scenes.locationName, locationName))
      .limit(1);

    if (existing.length > 0) {
      const scene = existing[0];
      if (scene.generationStatus === "ready" && scene.imageUrl) {
        return scene;
      }
      if (scene.generationStatus === "generating") {
        return scene;
      }
      if (scene.generationStatus === "failed") {
        return this.regenerateBackground(scene);
      }
    }

    return this.createAndGenerateBackground(locationName);
  }

  private async createAndGenerateBackground(locationName: string): Promise<BackgroundScene> {
    const [newScene] = await db.insert(background_scenes)
      .values({
        locationName,
        generationStatus: "generating",
      })
      .onConflictDoUpdate({
        target: background_scenes.locationName,
        set: { generationStatus: "generating", updatedAt: new Date() }
      })
      .returning();

    this.generateBackgroundAsync(newScene.id, locationName);
    return newScene;
  }

  private async regenerateBackground(scene: BackgroundScene): Promise<BackgroundScene> {
    await db.update(background_scenes)
      .set({ generationStatus: "generating", generationError: null, updatedAt: new Date() })
      .where(eq(background_scenes.id, scene.id));

    this.generateBackgroundAsync(scene.id, scene.locationName);
    return { ...scene, generationStatus: "generating" };
  }

  private async generateBackgroundAsync(sceneId: number, locationName: string): Promise<void> {
    try {
      const prompt = this.buildPrompt(locationName);
      
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
      const storedUrl = await assetStorage.uploadBackground(imageBuffer, locationName);

      await db.update(background_scenes)
        .set({
          imageUrl: storedUrl,
          promptUsed: prompt,
          generationStatus: "ready",
          updatedAt: new Date(),
        })
        .where(eq(background_scenes.id, sceneId));

      console.log(`[Backgrounds] Generated background for: ${locationName}`);
    } catch (error) {
      console.error(`[Backgrounds] Failed to generate ${locationName}:`, error);
      await db.update(background_scenes)
        .set({
          generationStatus: "failed",
          generationError: error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        })
        .where(eq(background_scenes.id, sceneId));
    }
  }

  private buildPrompt(locationName: string): string {
    const locationConfig = LOCATION_PROMPTS[locationName];
    
    if (locationConfig) {
      return `${VN_BACKGROUND_STYLE}

LOCATION: ${locationName}
SCENE: ${locationConfig.description}

KEY ELEMENTS TO INCLUDE:
${locationConfig.features.map(f => `- ${f}`).join("\n")}

Create an immersive, empty background scene that captures the magical atmosphere of this Harry Potter location. No text or UI elements.`;
    }

    return `${VN_BACKGROUND_STYLE}

LOCATION: ${locationName}
Create a magical Harry Potter universe location called "${locationName}". 
Include appropriate magical elements, warm atmospheric lighting, and rich environmental details.
Make it feel lived-in and mysterious. No characters, just the environment.`;
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getBackgroundStatus(locationName: string): Promise<{ status: BackgroundStatus; imageUrl?: string }> {
    const scene = await db.select()
      .from(background_scenes)
      .where(eq(background_scenes.locationName, locationName))
      .limit(1);

    if (scene.length === 0) {
      return { status: "pending" };
    }

    return {
      status: scene[0].generationStatus as BackgroundStatus,
      imageUrl: scene[0].imageUrl || undefined,
    };
  }
}

export const backgroundSceneService = new BackgroundSceneService();
