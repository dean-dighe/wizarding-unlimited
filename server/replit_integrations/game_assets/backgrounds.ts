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
  "Slytherin Common Room": {
    description: "Underground dungeon common room beneath the Black Lake, green-tinted light filtering through windows showing lake water, silver and green decor",
    features: ["green leather sofas", "carved stone serpent decorations", "underwater windows with fish swimming by", "dark wood furniture", "low ceiling with brass lamps"]
  },
  "Ravenclaw Common Room": {
    description: "Circular tower room with blue and bronze decorations, arched windows with mountain views, bookshelves lining walls, dome ceiling painted with stars",
    features: ["midnight blue tapestries", "bronze eagle statue", "comfortable reading chairs", "study tables with astronomy charts", "magical telescope by window"]
  },
  "Hufflepuff Common Room": {
    description: "Cozy round underground room near the kitchens, honey-colored walls, circular windows showing grass at ground level, plants everywhere",
    features: ["overstuffed yellow armchairs", "copper pots with plants", "round barrel-like doors", "warm earthy decor", "honey-colored wood paneling"]
  },
  "Hogwarts Library": {
    description: "Vast library with towering bookshelves, restricted section behind rope, study tables with green-shaded lamps, magical books that whisper",
    features: ["endless tall bookshelves", "arched windows with reading nooks", "brass chandeliers", "Restricted Section warning signs", "floating books"]
  },
  "Potions Classroom": {
    description: "Underground dungeon classroom with cauldrons on desks, shelves of glass jars with strange ingredients, greenish torchlight, stone walls",
    features: ["bubbling cauldrons", "ingredient jars with preserved creatures", "blackboard with potion recipes", "stone pillars", "emerald-lit torches"]
  },
  "Defense Against the Dark Arts Classroom": {
    description: "Large classroom with creature skeletons on walls, dark artifacts in glass cases, raised teacher platform, dusty and mysterious atmosphere",
    features: ["dragon skeleton on ceiling", "dark detector devices", "worn wooden desks", "spell damage marks on walls", "mysterious locked cabinets"]
  },
  "Transfiguration Classroom": {
    description: "Bright organized classroom with birds in cages, transformed objects on shelves, neat rows of desks, McGonagall's stern decorating style",
    features: ["large teacher desk with spectacles", "cages with transformed animals", "educational diagrams on walls", "orderly arranged desks", "arched windows"]
  },
  "Charms Classroom": {
    description: "Cheerful classroom with floating objects practicing spells, cushions for levitation practice, Flitwick's stacked books to stand on",
    features: ["floating feathers and objects", "practice cushions on floor", "stack of books at teacher desk", "enchanted ceiling decorations", "windows with views of grounds"]
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
  "Platform 9¾": {
    description: "Magical hidden train platform at King's Cross station, scarlet steam engine, families saying goodbye, owls in cages, magical mist",
    features: ["scarlet Hogwarts Express engine", "platform sign 9¾", "families with trunks and owls", "steam billowing", "magical barrier to Muggle side"]
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
  "Hogwarts Entrance Hall": {
    description: "Grand stone entrance hall with marble staircase, hourglasses with house points, suits of armor lining walls, torchlight",
    features: ["sweeping marble staircase", "giant wooden doors", "house point hourglasses", "suits of armor", "stone flagstones"]
  },
  "Astronomy Tower": {
    description: "Tallest tower at Hogwarts with observation deck, telescopes pointed at night sky, railing overlooking grounds, stars above",
    features: ["brass telescopes on tripods", "star charts on walls", "iron railing", "view of Hogwarts grounds below", "night sky with constellations"]
  },
  "Owlery": {
    description: "Circular stone tower filled with school owls, straw-covered floor, open windows for owl flights, hooting birds",
    features: ["hundreds of owls on perches", "straw-covered floor", "glassless windows", "owl droppings", "letters tied to owl legs"]
  },
  "Hagrid's Hut": {
    description: "Small wooden hut at edge of Forbidden Forest, pumpkin patch outside, smoke from chimney, Fang the boarhound visible",
    features: ["round wooden door", "vegetable garden", "large pumpkins", "crossbow by door", "smoke from stone chimney"]
  },
  "Greenhouse": {
    description: "Glass greenhouse full of magical plants, some dangerous, Professor Sprout's domain, earthy smell, Mandrakes in pots",
    features: ["glass roof and walls", "exotic magical plants", "potting benches", "earmuffs hanging", "Venomous Tentacula in corner"]
  },
  "Dungeons": {
    description: "Cold stone dungeon corridor beneath Hogwarts, torches on walls, dripping water, eerie green light, Slytherin territory",
    features: ["rough stone walls", "dripping water", "torch brackets", "iron-bound doors", "mysterious shadows"]
  },
  "Room of Requirement": {
    description: "Mysterious room that appears when needed, currently configured as training room with practice dummies and books",
    features: ["appears as needed", "practice equipment", "comfortable furniture", "mysterious architecture", "hidden door"]
  },
  "Headmaster's Office": {
    description: "Circular office at top of moving staircase, portraits of past headmasters, Fawkes the phoenix, Dumbledore's silver instruments",
    features: ["circular room with portraits", "phoenix perch", "silver spinning instruments", "Sorting Hat on shelf", "Pensieve cabinet"]
  },
  "Diagon Alley": {
    description: "Magical shopping street in London, crooked colorful shops, witches and wizards shopping, Gringotts at far end",
    features: ["narrow cobblestone street", "colorful shop fronts", "Quality Quidditch Supplies", "Ollivanders wand shop", "cauldron shop"]
  },
  "The Three Broomsticks": {
    description: "Cozy wizarding pub in Hogsmeade, crowded with students and locals, butterbeer on tables, roaring fire",
    features: ["wooden bar counter", "round tables with butterbeer", "fireplace with cauldron", "Madam Rosmerta", "steamy windows"]
  },
  "Shrieking Shack": {
    description: "Derelict haunted house on hill above Hogsmeade, boarded windows, overgrown path, reputation as most haunted building",
    features: ["broken shutters", "damaged roof", "overgrown weeds", "faded paint", "eerie atmosphere"]
  },
  "Chamber of Secrets": {
    description: "Hidden underground chamber with massive serpent statues, pool of dark water, Salazar Slytherin's face carved in stone",
    features: ["serpent-head pillars", "greenish lighting", "dark water pools", "massive Slytherin statue", "ancient stone architecture"]
  },
  "Moaning Myrtle's Bathroom": {
    description: "Girls' bathroom on second floor, out of order, flooded floor, Myrtle's ghost haunting, entrance to Chamber of Secrets",
    features: ["cracked mirrors", "flooded floor", "broken sinks", "toilet stalls", "dim lighting"]
  },
};

export const HARRY_POTTER_BACKGROUND_LOCATIONS = Object.keys(LOCATION_PROMPTS);

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
    console.log(`[Backgrounds] Starting async generation for: ${locationName} (ID: ${sceneId})`);
    
    try {
      const prompt = this.buildPrompt(locationName);
      console.log(`[Backgrounds] Prompt built for ${locationName}, calling xAI API...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      const response = await xai.images.generate({
        model: "grok-2-image-1212",
        prompt: prompt.slice(0, 1000),
        n: 1,
      });
      
      clearTimeout(timeoutId);
      console.log(`[Backgrounds] xAI API response received for ${locationName}`);

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error("No image URL returned from xAI");
      }

      console.log(`[Backgrounds] Downloading image from xAI for ${locationName}...`);
      const imageBuffer = await this.downloadImage(imageUrl);
      
      console.log(`[Backgrounds] Uploading to storage for ${locationName}...`);
      const storedUrl = await assetStorage.uploadBackground(imageBuffer, locationName);

      await db.update(background_scenes)
        .set({
          imageUrl: storedUrl,
          promptUsed: prompt,
          generationStatus: "ready",
          updatedAt: new Date(),
        })
        .where(eq(background_scenes.id, sceneId));

      console.log(`[Backgrounds] Successfully generated background for: ${locationName} -> ${storedUrl}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Backgrounds] FAILED to generate ${locationName}:`, errorMsg);
      console.error(`[Backgrounds] Full error:`, error);
      
      try {
        await db.update(background_scenes)
          .set({
            generationStatus: "failed",
            generationError: errorMsg,
            updatedAt: new Date(),
          })
          .where(eq(background_scenes.id, sceneId));
      } catch (dbError) {
        console.error(`[Backgrounds] Failed to update DB with error status:`, dbError);
      }
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

  async getAllBackgroundsStatus(): Promise<{ locationName: string; status: BackgroundStatus; imageUrl?: string }[]> {
    const allLocations = HARRY_POTTER_BACKGROUND_LOCATIONS;
    const scenes = await db.select().from(background_scenes);
    
    return allLocations.map(locationName => {
      const scene = scenes.find(s => s.locationName === locationName);
      return {
        locationName,
        status: scene?.generationStatus as BackgroundStatus || "pending",
        imageUrl: scene?.imageUrl || undefined,
      };
    });
  }

  async pregenerateAllBackgrounds(concurrency: number = 2): Promise<void> {
    const allLocations = HARRY_POTTER_BACKGROUND_LOCATIONS;
    const existingScenes = await db.select().from(background_scenes);
    const existingLocationNames = new Set(existingScenes.filter(s => s.generationStatus === "ready").map(s => s.locationName));
    
    const locationsToGenerate = allLocations.filter(loc => !existingLocationNames.has(loc));
    console.log(`[Backgrounds] Pre-generating ${locationsToGenerate.length} backgrounds (${existingLocationNames.size} already exist)`);
    
    for (let i = 0; i < locationsToGenerate.length; i += concurrency) {
      const batch = locationsToGenerate.slice(i, i + concurrency);
      console.log(`[Backgrounds] Generating batch ${Math.floor(i / concurrency) + 1}: ${batch.join(", ")}`);
      
      await Promise.all(batch.map(async (locationName) => {
        try {
          await this.getOrGenerateBackground(locationName);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          let attempts = 0;
          const maxAttempts = 30;
          while (attempts < maxAttempts) {
            const status = await this.getBackgroundStatus(locationName);
            if (status.status === "ready" || status.status === "failed") {
              console.log(`[Backgrounds] ${locationName}: ${status.status}`);
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;
          }
        } catch (error) {
          console.error(`[Backgrounds] Error pre-generating ${locationName}:`, error);
        }
      }));
      
      if (i + concurrency < locationsToGenerate.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`[Backgrounds] Pre-generation complete`);
  }
}

export const backgroundSceneService = new BackgroundSceneService();
