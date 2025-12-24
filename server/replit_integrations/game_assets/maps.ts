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
    return HARRY_POTTER_LOCATIONS[locationName] || {
      description: `A location called ${locationName}`,
      features: ["stone walls", "torches", "magical elements", "medieval furniture"],
      size: "medium",
      lighting: "warm torchlight",
      style: "medieval castle interior",
    };
  }

  static getAllLocationNames(): string[] {
    return Object.keys(HARRY_POTTER_LOCATIONS);
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

export const HARRY_POTTER_LOCATIONS: Record<string, { description: string; features: string[]; size: string; lighting: string; style: string }> = {
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
  "Slytherin Common Room": {
    description: "Underground dungeon common room beneath the lake",
    features: ["green lamps", "leather sofas", "snake motifs", "underwater windows", "stone fireplace"],
    size: "medium",
    lighting: "eerie green underwater glow",
    style: "dark dungeon with serpent decor",
  },
  "Ravenclaw Common Room": {
    description: "Airy tower room with celestial decorations",
    features: ["blue hangings", "star maps", "bookshelves", "arched windows", "bronze eagle"],
    size: "medium",
    lighting: "soft blue moonlight",
    style: "scholarly tower with astronomical theme",
  },
  "Hufflepuff Common Room": {
    description: "Cozy basement room near the kitchens",
    features: ["barrel entrance", "yellow hangings", "plants", "round windows", "copper pots"],
    size: "medium",
    lighting: "warm honey-colored sunlight",
    style: "cozy earthy burrow",
  },
  "Library": {
    description: "Vast room with tall bookshelves",
    features: ["bookshelves", "study tables", "candles", "reading lamps", "quiet alcoves"],
    size: "large",
    lighting: "soft candlelight",
    style: "vast medieval library",
  },
  "Restricted Section": {
    description: "Forbidden area of the library with dark magic books",
    features: ["chain-bound books", "darkness", "cobwebs", "warning signs", "iron gates"],
    size: "small",
    lighting: "very dim torchlight",
    style: "dark forbidden archive",
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
  "Hogsmeade Village": {
    description: "The all-wizarding village near Hogwarts",
    features: ["thatched roofs", "shop fronts", "cobblestone streets", "magical displays", "warm lights"],
    size: "large",
    lighting: "cozy winter afternoon",
    style: "quaint magical village",
  },
  "Three Broomsticks": {
    description: "Popular pub in Hogsmeade",
    features: ["wooden bar", "butterbeer mugs", "fireplace", "crowded tables", "warm atmosphere"],
    size: "medium",
    lighting: "warm tavern firelight",
    style: "cozy English pub",
  },
  "Honeydukes": {
    description: "Famous sweet shop in Hogsmeade",
    features: ["candy jars", "colorful displays", "chocolate frogs", "sugar quills", "Bertie Botts"],
    size: "small",
    lighting: "bright cheerful",
    style: "whimsical candy shop",
  },
  "Zonko's Joke Shop": {
    description: "Prank and joke shop in Hogsmeade",
    features: ["dungbombs", "trick wands", "noisemakers", "colorful packaging", "chaos"],
    size: "small",
    lighting: "bright colorful",
    style: "chaotic novelty shop",
  },
  "Shrieking Shack": {
    description: "Supposedly haunted building outside Hogsmeade",
    features: ["broken furniture", "boarded windows", "dust", "torn wallpaper", "creaky floors"],
    size: "medium",
    lighting: "dim dusty daylight",
    style: "abandoned Victorian house",
  },
  "Quidditch Pitch": {
    description: "The Hogwarts Quidditch stadium",
    features: ["goal hoops", "stands", "grass field", "house banners", "broomsticks"],
    size: "very large",
    lighting: "bright outdoor daylight",
    style: "medieval sports arena",
  },
  "Forbidden Forest": {
    description: "Dark dangerous forest at edge of Hogwarts",
    features: ["ancient trees", "undergrowth", "darkness", "magical creatures", "mist"],
    size: "very large",
    lighting: "dark filtered moonlight",
    style: "primeval enchanted forest",
  },
  "Hagrid's Hut": {
    description: "Gamekeeper's wooden cabin at forest edge",
    features: ["pumpkin patch", "wooden cabin", "smoke chimney", "garden", "rock cakes"],
    size: "small",
    lighting: "warm cozy firelight",
    style: "rustic wooden cottage",
  },
  "Black Lake": {
    description: "The great lake beside Hogwarts castle",
    features: ["dark water", "shore", "giant squid", "mountains", "castle reflection"],
    size: "very large",
    lighting: "cool daylight on water",
    style: "Scottish loch",
  },
  "Transfiguration Classroom": {
    description: "Professor McGonagall's classroom",
    features: ["desks", "animal cages", "chalkboard", "windows", "cat basket"],
    size: "medium",
    lighting: "natural daylight",
    style: "formal classroom",
  },
  "Charms Classroom": {
    description: "Professor Flitwick's classroom",
    features: ["floating objects", "cushions", "feathers", "tall desk", "book piles"],
    size: "medium",
    lighting: "bright cheerful",
    style: "bright classroom with floating objects",
  },
  "Defense Against the Dark Arts Classroom": {
    description: "The DADA classroom that changes teachers yearly",
    features: ["dark creature specimens", "desks", "protective charms", "dueling platform", "creature tanks"],
    size: "medium",
    lighting: "dramatic torchlight",
    style: "mysterious defensive classroom",
  },
  "Divination Tower": {
    description: "Professor Trelawney's tower classroom",
    features: ["crystal balls", "tea cups", "cushions", "incense", "pink drapes"],
    size: "small",
    lighting: "dim red and pink",
    style: "mystical fortune teller parlor",
  },
  "Greenhouse": {
    description: "Herbology classroom in the greenhouses",
    features: ["magical plants", "glass panels", "dirt", "mandrakes", "watering cans"],
    size: "medium",
    lighting: "filtered green daylight",
    style: "magical botanical greenhouse",
  },
  "Astronomy Tower": {
    description: "Highest tower for stargazing",
    features: ["telescopes", "star charts", "open roof", "night sky", "parapet"],
    size: "small",
    lighting: "dark with starlight",
    style: "observatory tower",
  },
  "Owlery": {
    description: "Tower where school owls live",
    features: ["owl perches", "straw", "owl droppings", "windows", "feathers"],
    size: "medium",
    lighting: "natural daylight through gaps",
    style: "medieval bird tower",
  },
  "Hospital Wing": {
    description: "Madam Pomfrey's medical ward",
    features: ["white beds", "curtains", "potion cabinet", "healing supplies", "windows"],
    size: "large",
    lighting: "bright clean daylight",
    style: "medieval infirmary",
  },
  "Headmaster's Office": {
    description: "Dumbledore's circular office",
    features: ["Pensieve", "Fawkes", "portraits", "silver instruments", "books"],
    size: "medium",
    lighting: "warm golden",
    style: "grand circular office",
  },
  "Trophy Room": {
    description: "Room displaying school awards and trophies",
    features: ["glass cases", "trophies", "medals", "plaques", "suits of armor"],
    size: "medium",
    lighting: "polished golden",
    style: "display gallery",
  },
  "Entrance Hall": {
    description: "Grand entrance to Hogwarts castle",
    features: ["marble staircase", "hourglasses", "oak doors", "torches", "suits of armor"],
    size: "large",
    lighting: "torchlight",
    style: "grand medieval foyer",
  },
  "Grand Staircase": {
    description: "Moving staircases of Hogwarts",
    features: ["moving stairs", "portraits", "railings", "landings", "trick steps"],
    size: "very large",
    lighting: "ambient torchlight",
    style: "magical shifting architecture",
  },
  "Dungeons": {
    description: "Underground passages beneath castle",
    features: ["stone walls", "torches", "chains", "dampness", "cold"],
    size: "large",
    lighting: "dim green torchlight",
    style: "medieval dungeon corridor",
  },
  "Room of Requirement": {
    description: "The Come and Go Room that appears when needed",
    features: ["whatever is needed", "hidden door", "magical transformation", "secret", "variable"],
    size: "variable",
    lighting: "variable",
    style: "magical adaptive room",
  },
  "Chamber of Secrets": {
    description: "Salazar Slytherin's hidden chamber",
    features: ["snake statues", "water", "Slytherin statue", "pipes", "darkness"],
    size: "very large",
    lighting: "eerie green",
    style: "ancient serpent temple",
  },
  "Moaning Myrtle's Bathroom": {
    description: "Girls' bathroom haunted by Moaning Myrtle",
    features: ["toilet stalls", "sinks", "mirrors", "broken fixtures", "water puddles"],
    size: "small",
    lighting: "flickering torchlight",
    style: "old haunted bathroom",
  },
  "Kitchen": {
    description: "Hogwarts kitchens run by house-elves",
    features: ["house-elves", "brass pots", "fireplace", "food preparation", "four tables"],
    size: "very large",
    lighting: "warm cooking fires",
    style: "medieval castle kitchen",
  },
  "Diagon Alley": {
    description: "The main wizarding shopping street",
    features: ["crooked buildings", "shop fronts", "witches and wizards", "Gringotts", "magical goods"],
    size: "large",
    lighting: "bright magical daylight",
    style: "crooked magical shopping street",
  },
  "Gringotts Bank": {
    description: "The goblin-run wizarding bank",
    features: ["goblins", "marble hall", "gold scales", "cart tracks", "vaults"],
    size: "large",
    lighting: "dim golden lamplight",
    style: "grand marble bank hall",
  },
  "Ollivanders": {
    description: "Wand shop in Diagon Alley",
    features: ["wand boxes", "dusty shelves", "narrow shop", "tape measure", "old counter"],
    size: "small",
    lighting: "dim dusty",
    style: "ancient cramped shop",
  },
  "Flourish and Blotts": {
    description: "Bookshop in Diagon Alley",
    features: ["book stacks", "magical books", "ladders", "reading nooks", "quills"],
    size: "medium",
    lighting: "warm amber",
    style: "magical bookshop",
  },
  "The Burrow": {
    description: "The Weasley family home",
    features: ["crooked rooms", "clock", "kitchen", "garden gnomes", "broomstick shed"],
    size: "medium",
    lighting: "warm homey",
    style: "quirky magical cottage",
  },
  "King's Cross Station": {
    description: "London train station with Platform 9¾",
    features: ["platforms", "trains", "clock", "crowds", "trolleys"],
    size: "very large",
    lighting: "Victorian station lighting",
    style: "Victorian railway station",
  },
  "Ministry of Magic": {
    description: "The wizarding government headquarters",
    features: ["Atrium fountain", "fireplaces", "lifts", "paper airplanes", "security desk"],
    size: "very large",
    lighting: "magical artificial daylight",
    style: "grand governmental atrium",
  },
  "Hogwarts Express": {
    description: "The scarlet steam train to Hogwarts",
    features: ["compartments", "corridors", "windows", "luggage racks", "trolley witch"],
    size: "long narrow",
    lighting: "warm compartment light",
    style: "Victorian train interior",
  },
  "Dormitory": {
    description: "Student sleeping quarters",
    features: ["four-poster beds", "trunks", "hangings", "windows", "warmth"],
    size: "medium",
    lighting: "warm bedside light",
    style: "cozy medieval bedroom",
  },
  "Courtyard": {
    description: "Open courtyard within castle walls",
    features: ["fountain", "benches", "archways", "grass", "stone walls"],
    size: "medium",
    lighting: "natural daylight",
    style: "medieval cloister",
  },
  "Whomping Willow": {
    description: "Violent magical tree on grounds",
    features: ["huge willow tree", "swinging branches", "grass", "tunnel entrance", "danger"],
    size: "medium",
    lighting: "outdoor daylight",
    style: "dangerous magical tree area",
  },
  "Boathouse": {
    description: "Boat storage at edge of Black Lake",
    features: ["wooden boats", "dock", "water", "lanterns", "ropes"],
    size: "small",
    lighting: "dim waterside",
    style: "medieval boathouse",
  },
};
