/**
 * Battle Background Generation Service
 * Generates Pokemon-style battle backgrounds using xAI
 */

import OpenAI from "openai";
import { db } from "../../db";
import { battle_backgrounds, BattleBackground, BackgroundStatus } from "@shared/schema";
import { eq } from "drizzle-orm";
import { assetStorage } from "./storage";
import pLimit from "p-limit";

const xai = new OpenAI({
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY,
});

const BATTLE_BACKGROUND_STYLE = `Pokemon-style RPG battle background:
- Wide panoramic view (16:9 aspect ratio)
- Fantasy RPG battle arena perspective
- Harry Potter magical world aesthetic
- Atmospheric lighting matching time of day
- NO characters, creatures, or people in the scene
- Clear foreground area for combatant sprites
- Painterly illustrated style with rich details
- Suitable for game overlay compositing`;

const CATEGORY_PROMPTS: Record<string, string> = {
  forest: "Dense magical forest clearing, ancient gnarled trees with mystical moss, Forbidden Forest atmosphere, dappled light through canopy, fallen logs and mushrooms, path of magical plants",
  castle: "Hogwarts castle stone corridor interior, torch-lit walls, medieval architecture, suits of armor visible, magical portraits in frames, flying candles, gothic arches",
  dungeon: "Dark underground dungeon chamber, dripping stone walls, chains and iron gates, potion bottles on shelves, dim torch light, mysterious shadows, cobwebs",
  field: "Open magical meadow near Hogwarts, rolling green hills, castle silhouette in distance, wildflowers, stone wall borders, magical creatures in far background",
  lake: "Black Lake shoreline, misty water stretching to mountains, reeds and lily pads, giant squid tentacle barely visible, wooden dock, forbidden forest edge",
  village: "Hogsmeade village cobblestone square, magical shop fronts, hanging signs, witches and wizards (distant), snow-capped roofs, warm window lights",
  graveyard: "Old wizarding cemetery, weathered tombstones, iron fence, willow tree, eerie mist, moonlit path, gothic mausoleum in background",
  classroom: "Hogwarts magical classroom, desks with cauldrons, chalkboard with runes, floating objects, bookshelves, arched windows with grounds visible",
  tower: "Astronomy tower top, open to sky, stone parapet, telescopes and star charts, night sky with constellations, owlery visible below",
  quidditch: "Quidditch pitch at ground level, tall goalposts, stadium stands, grass field, team banners, bludgers and golden snitch distant",
};

const TIME_PROMPTS: Record<string, string> = {
  day: "bright daylight, warm sunshine, blue sky with white clouds, cheerful atmosphere",
  night: "moonlit night, silver starlight, deep blue sky, mysterious shadows, glowing magical lights",
  dusk: "golden sunset, orange and purple sky, long dramatic shadows, warm fading light",
  dawn: "soft pink sunrise, morning mist, fresh dewdrops, awakening atmosphere, gentle light",
};

const WEATHER_PROMPTS: Record<string, string> = {
  clear: "clear atmosphere, excellent visibility",
  rain: "heavy rainfall, wet reflective surfaces, dark clouds, lightning in distance",
  fog: "thick magical mist, limited visibility, ethereal atmosphere, shapes emerging from haze",
  storm: "dramatic thunderstorm, dark swirling clouds, lightning strikes, intense wind effects",
  snow: "gentle snowfall, frost-covered surfaces, winter wonderland, breath visible in cold",
};

export class BattleBackgroundService {
  /**
   * Get or generate a battle background
   */
  async getOrGenerateBackground(backgroundId: string): Promise<BattleBackground | null> {
    // Check if exists
    const existing = await db.select()
      .from(battle_backgrounds)
      .where(eq(battle_backgrounds.backgroundId, backgroundId))
      .limit(1);

    if (existing.length > 0) {
      const bg = existing[0];
      
      // If already ready, return it
      if (bg.generationStatus === "ready" && bg.imageUrl) {
        return bg;
      }
      
      // If pending or failed, try to generate
      if (bg.generationStatus !== "generating") {
        return this.generateBackground(bg);
      }
      
      return bg;
    }

    return null;
  }

  /**
   * Generate a battle background image
   */
  async generateBackground(bg: BattleBackground): Promise<BattleBackground> {
    // Mark as generating
    await db.update(battle_backgrounds)
      .set({ generationStatus: "generating" as BackgroundStatus })
      .where(eq(battle_backgrounds.id, bg.id));

    try {
      const prompt = this.buildPrompt(bg.locationCategory, bg.timeOfDay || "day", bg.weather || "clear");

      console.log(`[BattleBG] Generating ${bg.backgroundId}...`);

      const response = await xai.images.generate({
        model: "grok-2-image-1212",
        prompt,
        n: 1,
      });

      if (!response.data || !response.data[0]) {
        throw new Error("No image data returned from xAI");
      }
      
      const imageUrl = response.data[0].url;
      if (!imageUrl) {
        throw new Error("No image URL returned from xAI");
      }

      // Download and store in object storage
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      
      const storedUrl = await assetStorage.uploadBackground(
        imageBuffer,
        `battle_${bg.backgroundId}`
      );

      // Update record
      const [updated] = await db.update(battle_backgrounds)
        .set({
          imageUrl: storedUrl,
          promptUsed: prompt,
          generationStatus: "ready" as BackgroundStatus,
          generationError: null,
        })
        .where(eq(battle_backgrounds.id, bg.id))
        .returning();

      console.log(`[BattleBG] Generated ${bg.backgroundId} successfully`);
      return updated;
    } catch (error) {
      console.error(`[BattleBG] Failed to generate ${bg.backgroundId}:`, error);
      
      await db.update(battle_backgrounds)
        .set({
          generationStatus: "failed" as BackgroundStatus,
          generationError: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(battle_backgrounds.id, bg.id));

      throw error;
    }
  }

  /**
   * Build generation prompt
   */
  buildPrompt(category: string, timeOfDay: string, weather: string): string {
    const catPrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.forest;
    const timePrompt = TIME_PROMPTS[timeOfDay] || TIME_PROMPTS.day;
    const weatherPrompt = WEATHER_PROMPTS[weather] || WEATHER_PROMPTS.clear;

    return `${BATTLE_BACKGROUND_STYLE}

Scene: ${catPrompt}
Lighting: ${timePrompt}
Atmosphere: ${weatherPrompt}

Create a wide battle arena scene suitable for turn-based RPG combat.`;
  }

  /**
   * Get the best matching background for a location
   */
  async getBackgroundForLocation(locationName: string, timeOfDay: string = "day"): Promise<BattleBackground | null> {
    // Map location names to categories
    const categoryMap: Record<string, string> = {
      "forbidden forest": "forest",
      "hogwarts grounds": "field",
      "hogwarts castle": "castle",
      "hogwarts dungeons": "dungeon",
      "chamber of secrets": "dungeon",
      "black lake": "lake",
      "hogsmeade": "village",
      "astronomy tower": "tower",
      "quidditch pitch": "quidditch",
      "classroom": "classroom",
      "graveyard": "graveyard",
    };

    const lowerName = locationName.toLowerCase();
    let category = "field"; // default

    for (const [key, cat] of Object.entries(categoryMap)) {
      if (lowerName.includes(key)) {
        category = cat;
        break;
      }
    }

    // Find matching background
    const backgroundId = `${category}_${timeOfDay}`;
    return this.getOrGenerateBackground(backgroundId);
  }

  /**
   * Pregenerate all pending backgrounds
   */
  async pregenerateAll(concurrency: number = 2): Promise<{ generated: number; failed: number; skipped: number }> {
    // Count already ready backgrounds first
    const allBackgrounds = await db.select().from(battle_backgrounds);
    const alreadyReady = allBackgrounds.filter(bg => bg.generationStatus === "ready").length;
    const pending = allBackgrounds.filter(bg => bg.generationStatus === "pending");

    const limit = pLimit(concurrency);
    let generated = 0;
    let failed = 0;

    await Promise.all(
      pending.map((bg) =>
        limit(async () => {
          try {
            await this.generateBackground(bg);
            generated++;
          } catch (error) {
            console.error(`[BattleBG] Failed to generate ${bg.backgroundId}:`, error);
            failed++;
          }
        })
      )
    );

    console.log(`[BattleBG] Pregeneration complete: ${generated} generated, ${failed} failed, ${alreadyReady} already ready`);
    return { generated, failed, skipped: alreadyReady };
  }

  /**
   * Get all backgrounds with their status
   */
  async getAllBackgrounds(): Promise<BattleBackground[]> {
    return db.select().from(battle_backgrounds);
  }
}

export const battleBackgroundService = new BattleBackgroundService();
