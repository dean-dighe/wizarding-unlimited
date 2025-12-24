import OpenAI from "openai";
import { storage } from "../../storage";
import { GameAssetStorageService } from "./storage";
import { DEFAULT_ANIMATION_CONFIG, CharacterSprite } from "@shared/schema";

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || "",
  baseURL: "https://api.x.ai/v1",
});

const SPRITE_STYLE_PROMPT = `Pokemon FireRed/LeafGreen style character sprite sheet.
EXACT FORMAT: 4 rows x 3 columns grid = 12 frames total, each frame 32x32 pixels.
Total image size: 96 pixels wide x 128 pixels tall.

LAYOUT (from top to bottom):
Row 1: Character facing DOWN - idle, left foot, right foot (walking cycle)
Row 2: Character facing UP - idle, left foot, right foot (walking cycle)  
Row 3: Character facing LEFT - idle, left foot, right foot (walking cycle)
Row 4: Character facing RIGHT - idle, left foot, right foot (walking cycle)

STYLE REQUIREMENTS:
- Game Boy Advance pixel art aesthetic
- Bold black 1-2 pixel outlines around character
- 16-color palette maximum
- NO anti-aliasing, NO gradients
- Top-down RPG perspective (3/4 view)
- Character fills most of each 32x32 frame
- Clean grid separation between frames
- Solid single-color background (green or magenta for transparency)`;

const SIGNIFICANT_APPEARANCE_KEYWORDS = [
  "scar", "injured", "wounded", "bandage", "blood",
  "transformed", "werewolf", "animagus", "polyjuice",
  "new robes", "disguise", "cloak", "armor", "uniform",
  "aged", "younger", "older", "changed",
  "hair color", "dyed", "shaved", "bald",
  "glasses broken", "eye patch", "missing",
  "burned", "frozen", "glowing", "possessed"
];

export class SpriteGenerationService {
  private assetStorage: GameAssetStorageService;

  constructor() {
    this.assetStorage = new GameAssetStorageService();
  }

  generateAppearanceSignature(description: string): string {
    const normalized = description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .sort()
      .join(' ')
      .trim();
    
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sig_${Math.abs(hash).toString(16)}`;
  }

  detectSignificantChange(oldDescription: string, newDescription: string): { hasChange: boolean; changeSummary: string } {
    const newLower = newDescription.toLowerCase();
    const oldLower = oldDescription.toLowerCase();
    
    const changes: string[] = [];
    for (const keyword of SIGNIFICANT_APPEARANCE_KEYWORDS) {
      if (newLower.includes(keyword) && !oldLower.includes(keyword)) {
        changes.push(keyword);
      }
    }
    
    if (changes.length > 0) {
      return { hasChange: true, changeSummary: changes.join(', ') };
    }
    
    return { hasChange: false, changeSummary: '' };
  }

  async getOrCreateSprite(
    characterName: string,
    characterDescription: string,
    options: { isProtagonist?: boolean; isCanon?: boolean } = {}
  ): Promise<string> {
    const existingSprite = await storage.getCharacterSprite(characterName);
    if (existingSprite) {
      const { hasChange, changeSummary } = this.detectSignificantChange(
        existingSprite.characterDescription || '',
        characterDescription
      );
      
      if (hasChange) {
        console.log(`[Sprite] Significant appearance change detected for ${characterName}: ${changeSummary}`);
        return this.updateSprite(existingSprite, characterDescription, changeSummary);
      }
      
      return existingSprite.spriteSheetUrl;
    }

    return this.generateAndStoreSprite(characterName, characterDescription, options);
  }

  async updateSprite(
    existingSprite: CharacterSprite,
    newDescription: string,
    changeSummary: string
  ): Promise<string> {
    console.log(`[Sprite] Updating sprite for ${existingSprite.characterName} - ${changeSummary}`);
    
    const updatePrompt = this.buildUpdateSpritePrompt(
      existingSprite.characterName,
      existingSprite.characterDescription || '',
      newDescription,
      changeSummary
    );
    
    try {
      const response = await xai.images.generate({
        model: "grok-2-image-1212",
        prompt: updatePrompt.slice(0, 1000),
        n: 1,
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error("No image URL returned from xAI");
      }

      const imageBuffer = await this.downloadImage(imageUrl);
      const storedUrl = await this.assetStorage.uploadSprite(
        imageBuffer, 
        `${existingSprite.characterName}_v${(existingSprite.variantVersion || 1) + 1}`
      );
      
      await storage.updateCharacterSprite(existingSprite.characterName, {
        spriteSheetUrl: storedUrl,
        characterDescription: newDescription,
        appearanceSignature: this.generateAppearanceSignature(newDescription),
        variantVersion: (existingSprite.variantVersion || 1) + 1,
        previousSpriteUrl: existingSprite.spriteSheetUrl,
        lastAppearanceChange: changeSummary,
      });
      
      console.log(`[Sprite] Updated sprite for ${existingSprite.characterName} to v${(existingSprite.variantVersion || 1) + 1}`);
      return storedUrl;
    } catch (error) {
      console.error(`[Sprite] Failed to update sprite for ${existingSprite.characterName}:`, error);
      return existingSprite.spriteSheetUrl;
    }
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
      appearanceSignature: this.generateAppearanceSignature(characterDescription),
      variantVersion: 1,
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
    const cleanDescription = description.slice(0, 200);
    
    return `${SPRITE_STYLE_PROMPT}

CHARACTER TO DRAW: ${characterName}
APPEARANCE: ${cleanDescription}

Draw this Harry Potter character as a cute chibi-style RPG sprite.
The character should be recognizable with their key visual features.
Hogwarts robes, wand visible, magical fantasy style.`;
  }

  private buildUpdateSpritePrompt(characterName: string, oldDescription: string, newDescription: string, change: string): string {
    const cleanOld = oldDescription.slice(0, 100);
    const cleanNew = newDescription.slice(0, 150);
    
    return `${SPRITE_STYLE_PROMPT}

CHARACTER TO DRAW: ${characterName}
ORIGINAL APPEARANCE: ${cleanOld}
NEW APPEARANCE (with changes): ${cleanNew}
KEY CHANGE: ${change}

Update this Harry Potter character sprite to show their changed appearance.
Keep the same character recognizable but with the noted changes visible.
Hogwarts robes, wand visible, magical fantasy style.`;
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
    for (const character of CANON_CHARACTERS) {
      const existing = await storage.getCharacterSprite(character.name);
      if (!existing) {
        try {
          console.log(`[Sprite-gen] Starting: ${character.name}`);
          await this.generateAndStoreSprite(character.name, character.description, { isCanon: true });
          console.log(`[Sprite-gen] Completed: ${character.name}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`[Sprite-gen] Failed: ${character.name}:`, error);
        }
      }
    }
  }

  static getAllCanonCharacterNames(): string[] {
    return CANON_CHARACTERS.map(c => c.name);
  }
}

export const CANON_CHARACTERS: { name: string; description: string; category: string }[] = [
  // Main Trio
  { name: "Harry Potter", description: "A thin boy with unruly black hair, round glasses, green eyes, and a lightning bolt scar on his forehead. Wears Gryffindor robes.", category: "student" },
  { name: "Hermione Granger", description: "A girl with bushy brown hair, brown eyes, and slightly large front teeth. Wears Gryffindor robes, often carrying books.", category: "student" },
  { name: "Ron Weasley", description: "A tall, thin boy with bright red hair, freckles, blue eyes, and a long nose. Wears Gryffindor robes.", category: "student" },
  
  // Gryffindor Students
  { name: "Neville Longbottom", description: "A round-faced boy with dark hair, often looking nervous. Wears Gryffindor robes, sometimes holds a toad.", category: "student" },
  { name: "Ginny Weasley", description: "A girl with bright red hair like her brothers, brown eyes, freckles. Wears Gryffindor robes.", category: "student" },
  { name: "Fred Weasley", description: "A tall boy with red hair, freckles, mischievous grin. Identical twin. Wears Gryffindor robes.", category: "student" },
  { name: "George Weasley", description: "A tall boy with red hair, freckles, mischievous grin. Identical twin. Wears Gryffindor robes.", category: "student" },
  { name: "Seamus Finnigan", description: "A sandy-haired boy with Irish accent tendencies, often with singed eyebrows. Wears Gryffindor robes.", category: "student" },
  { name: "Dean Thomas", description: "A tall Black boy with dreadlocks, into football. Wears Gryffindor robes.", category: "student" },
  { name: "Lavender Brown", description: "A girl with curly blonde hair, giggly personality. Wears Gryffindor robes.", category: "student" },
  { name: "Parvati Patil", description: "An Indian girl with long dark hair, often with her twin sister. Wears Gryffindor robes.", category: "student" },
  { name: "Oliver Wood", description: "A burly boy, Quidditch captain, intense about the sport. Wears Gryffindor Quidditch robes.", category: "student" },
  { name: "Lee Jordan", description: "A boy with dreadlocks, Quidditch commentator, friends with the twins. Wears Gryffindor robes.", category: "student" },
  
  // Slytherin Students
  { name: "Draco Malfoy", description: "A pale boy with sleek platinum blonde hair, pointed face, grey eyes, and a sneering expression. Wears Slytherin robes.", category: "student" },
  { name: "Vincent Crabbe", description: "A large, thickset boy with a pudding-bowl haircut, dull expression. Wears Slytherin robes.", category: "student" },
  { name: "Gregory Goyle", description: "A large, gorilla-like boy with small dull eyes. Wears Slytherin robes.", category: "student" },
  { name: "Pansy Parkinson", description: "A pug-faced girl with dark hair, mean expression. Wears Slytherin robes.", category: "student" },
  { name: "Blaise Zabini", description: "A tall, handsome Black boy with high cheekbones, aloof demeanor. Wears Slytherin robes.", category: "student" },
  { name: "Marcus Flint", description: "A large, troll-like boy with bad teeth, Slytherin Quidditch captain. Wears Slytherin robes.", category: "student" },
  
  // Ravenclaw Students
  { name: "Cho Chang", description: "A pretty Asian girl with long dark hair, Seeker. Wears Ravenclaw robes.", category: "student" },
  { name: "Luna Lovegood", description: "A girl with straggly dirty-blonde hair, protuberant silvery eyes, dreamy expression. Wears Ravenclaw robes and radish earrings.", category: "student" },
  { name: "Padma Patil", description: "An Indian girl with long dark hair, twin sister of Parvati. Wears Ravenclaw robes.", category: "student" },
  
  // Hufflepuff Students
  { name: "Cedric Diggory", description: "A handsome boy with grey eyes and dark hair, athletic build, Quidditch Seeker. Wears Hufflepuff robes.", category: "student" },
  { name: "Ernie Macmillan", description: "A pompous boy with an important manner. Wears Hufflepuff robes.", category: "student" },
  { name: "Hannah Abbott", description: "A pink-faced girl with blonde pigtails. Wears Hufflepuff robes.", category: "student" },
  { name: "Justin Finch-Fletchley", description: "A curly-haired boy from a Muggle family. Wears Hufflepuff robes.", category: "student" },
  
  // Hogwarts Staff
  { name: "Professor Dumbledore", description: "An elderly wizard with long silver hair and beard, half-moon spectacles, crooked nose, wearing magnificent purple robes.", category: "staff" },
  { name: "Professor McGonagall", description: "A tall, stern-looking older woman with grey hair in a tight bun, square spectacles, emerald robes.", category: "staff" },
  { name: "Professor Snape", description: "A thin man with sallow skin, long greasy black hair, hooked nose, dark eyes, and billowing black robes.", category: "staff" },
  { name: "Hagrid", description: "A giant of a man with wild black bushy hair and beard, beetle-black eyes, wearing a massive moleskin overcoat.", category: "staff" },
  { name: "Professor Flitwick", description: "A tiny wizard with white hair, so small he stands on books. Wears blue robes.", category: "staff" },
  { name: "Professor Sprout", description: "A dumpy witch with flyaway grey hair, usually dirt on her robes. Wears patched clothes.", category: "staff" },
  { name: "Madam Hooch", description: "A witch with short grey hair and yellow hawk-like eyes. Wears Quidditch referee robes.", category: "staff" },
  { name: "Professor Trelawney", description: "A thin woman with huge glasses magnifying her eyes, draped in shawls and bangles.", category: "staff" },
  { name: "Professor Quirrell", description: "A young nervous man wearing a purple turban, stuttering speech. Wears plain robes.", category: "staff" },
  { name: "Professor Lockhart", description: "A handsome wizard with wavy blonde hair, bright blue eyes, dazzling smile. Wears flamboyant robes.", category: "staff" },
  { name: "Professor Lupin", description: "A tired-looking man with grey-streaked brown hair, shabby robes, kind face with premature aging.", category: "staff" },
  { name: "Mad-Eye Moody", description: "A grizzled man with a chunk of his nose missing, magical electric-blue eye, wooden leg, scarred face.", category: "staff" },
  { name: "Madam Pomfrey", description: "A strict matron with a white apron and cap, carrying healing potions. Hospital Wing nurse.", category: "staff" },
  { name: "Madam Pince", description: "A thin, irritable witch resembling an underfed vulture. Library guardian.", category: "staff" },
  { name: "Argus Filch", description: "A bitter, hunched man with a gray skin, rheumy eyes, jowly cheeks. Caretaker in tatty coat.", category: "staff" },
  { name: "Professor Binns", description: "A ghostly elderly wizard, very old and shriveled, droning voice. Translucent grey.", category: "staff" },
  
  // Ghosts
  { name: "Nearly Headless Nick", description: "A ghost with a nearly severed head, ruff collar, doublet. Translucent grey Gryffindor ghost.", category: "ghost" },
  { name: "The Bloody Baron", description: "A gaunt ghost covered in silver bloodstains, blank staring eyes. Slytherin ghost.", category: "ghost" },
  { name: "The Grey Lady", description: "A beautiful ghost with floor-length hair, elegant robes. Ravenclaw ghost.", category: "ghost" },
  { name: "The Fat Friar", description: "A jolly, fat ghost monk with a tonsure. Hufflepuff ghost.", category: "ghost" },
  { name: "Peeves", description: "A poltergeist with wickedly mischievous expression, wearing a bell-covered hat.", category: "ghost" },
  { name: "Moaning Myrtle", description: "A ghost of a teenage girl with mousy hair, glasses, acne, perpetual pout.", category: "ghost" },
  
  // Other Important Characters
  { name: "Dobby", description: "A small house-elf with large tennis-ball green eyes, bat-like ears, wearing a pillowcase.", category: "creature" },
  { name: "Sirius Black", description: "A man with long dark hair, gaunt handsome face, grey eyes. Wears worn wizard robes.", category: "adult" },
  { name: "Remus Lupin", description: "A tired-looking man with grey-streaked brown hair, shabby robes, kind face with premature aging.", category: "adult" },
  { name: "Peter Pettigrew", description: "A small, rat-like man with watery eyes, pointed nose, thinning hair.", category: "adult" },
  { name: "Arthur Weasley", description: "A thin, balding red-haired man with glasses, wearing patched robes.", category: "adult" },
  { name: "Molly Weasley", description: "A plump, kind-faced woman with red hair, wearing a flowered apron.", category: "adult" },
  { name: "Lucius Malfoy", description: "A pale man with long platinum blonde hair, cold grey eyes, carrying a snake-head cane.", category: "adult" },
  { name: "Cornelius Fudge", description: "A portly man in a pinstriped cloak, bowler hat, pompous manner.", category: "adult" },
  
  // Shopkeepers and Others
  { name: "Tom the Innkeeper", description: "An old, bald, toothless man, hunched, wearing a barkeep's apron. Leaky Cauldron owner.", category: "adult" },
  { name: "Mr. Ollivander", description: "An old man with wide pale eyes, silvery white hair, mysterious manner. Wand maker.", category: "adult" },
  { name: "Madam Rosmerta", description: "A curvy witch with a pretty face, running the Three Broomsticks pub.", category: "adult" },
  { name: "Trolley Witch", description: "An elderly witch with a kindly face, pushing a food trolley on the Hogwarts Express.", category: "adult" },
];
